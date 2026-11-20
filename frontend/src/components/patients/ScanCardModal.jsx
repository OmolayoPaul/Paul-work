import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  FileUp,
  Loader2,
  ScanLine,
  ShieldCheck,
} from "lucide-react";

import Modal from "../Modal";
import { api } from "../../lib/api";
import { BLOOD_GROUPS, GENOTYPES, MARITAL_STATUSES } from "../../lib/clinical";
import ConfidenceChip from "./ConfidenceChip";

const MAX_BYTES = 8 * 1024 * 1024;

const FIELD_LABELS = [
  ["first_name", "First name"],
  ["last_name", "Last name"],
  ["other_names", "Other names"],
  ["sex", "Sex"],
  ["date_of_birth", "Date of birth"],
  ["age", "Age"],
  ["phone", "Phone"],
  ["email", "Email"],
  ["address", "Address"],
  ["next_of_kin_name", "Next of kin"],
  ["next_of_kin_phone", "Next of kin phone"],
  ["card_number", "Card number"],
  ["nhis_number", "NHIS number"],
  ["blood_group", "Blood group"],
  ["genotype", "Genotype"],
  ["allergies", "Allergies"],
  ["occupation", "Occupation"],
  ["marital_status", "Marital status"],
];

// Fields an existing record can take from a scanned card. A patient's name and
// date of birth identify the record, so they are never overwritten from a scan.
const UPDATE_FIELDS = [
  ["phone", "Phone", "text"],
  ["email", "Email", "text"],
  ["address", "Address", "text"],
  ["card_number", "Card number", "text"],
  ["nhis_no", "NHIS number", "text"],
  ["next_of_kin", "Next of kin", "text"],
  ["next_of_kin_phone", "Next of kin phone", "text"],
  ["occupation", "Occupation", "text"],
  ["blood_group", "Blood group", "blood"],
  ["genotype", "Genotype", "genotype"],
  ["marital_status", "Marital status", "marital"],
  ["allergies", "Allergies", "text"],
];

const UPDATE_SOURCE = {
  phone: "phone",
  email: "email",
  address: "address",
  card_number: "card_number",
  nhis_no: "nhis_number",
  next_of_kin: "next_of_kin_name",
  next_of_kin_phone: "next_of_kin_phone",
  occupation: "occupation",
  blood_group: "blood_group",
  genotype: "genotype",
  marital_status: "marital_status",
  allergies: "allergies",
};

const MIME_BY_EXTENSION = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
};

function mimeFor(file) {
  if (file.type) return file.type.toLowerCase();
  const extension = (file.name.split(".").pop() || "").toLowerCase();
  return MIME_BY_EXTENSION[extension] || "application/octet-stream";
}

function readBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const comma = text.indexOf(",");
      resolve(comma >= 0 ? text.slice(comma + 1) : text);
    };
    reader.onerror = () => reject(new Error("That file could not be read."));
    reader.readAsDataURL(file);
  });
}

export default function ScanCardModal({ open, onClose, mode = "register", patient, onApply, onSaved }) {
  const cameraRef = useRef(null);
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [values, setValues] = useState({});
  const [attach, setAttach] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = useCallback(() => {
    setFile(null);
    setPreview("");
    setStatus("idle");
    setError("");
    setResult(null);
    setValues({});
    setAttach(false);
    setSaving(false);
  }, []);

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const chooseFile = (event) => {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked) return;
    if (picked.size > MAX_BYTES) {
      setError("That file is too large. Use an image or PDF under 8 MB.");
      setStatus("error");
      return;
    }
    setFile(picked);
    setError("");
    setStatus("idle");
    if (preview) URL.revokeObjectURL(preview);
    setPreview(picked.type.startsWith("image/") ? URL.createObjectURL(picked) : "");
  };

  const scan = async () => {
    if (!file) return;
    setStatus("scanning");
    setError("");
    try {
      const data_base64 = await readBase64(file);
      const response = await api.post("/capture/scan", {
        file_name: file.name || "patient-card",
        mime_type: mimeFor(file),
        data_base64,
      });
      const fields = response?.fields || {};
      setResult(fields);

      if (mode === "update") {
        const next = {};
        for (const [key] of UPDATE_FIELDS) {
          const scanned = fields[UPDATE_SOURCE[key]];
          next[key] = scanned?.value ?? patient?.[key] ?? "";
        }
        setValues(next);
      }
      setStatus("review");
    } catch (err) {
      setError(err.message || "The card could not be read.");
      setStatus("error");
    }
  };

  const confidences = result
    ? Object.fromEntries(Object.entries(result).map(([key, entry]) => [key, entry?.confidence]))
    : {};

  const applyToForm = () => {
    const scannedValues = Object.fromEntries(
      Object.entries(result || {}).map(([key, entry]) => [key, entry?.value ?? ""]),
    );
    onApply?.(scannedValues, confidences, file?.name || "");
    onClose?.();
  };

  const saveToRecord = async () => {
    setSaving(true);
    setError("");
    try {
      const updated = await api.patch(`/patients/${patient.id}`, {
        ...values,
        attach_scan: attach,
        scan_file_name: file?.name || null,
      });
      onSaved?.(updated, attach);
      onClose?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const footer = (() => {
    if (status === "review" && mode === "update") {
      return (
        <div className="flex items-center justify-between gap-2">
          <button type="button" className="btn-ghost px-2 text-[12px]" onClick={reset}>
            Scan another
          </button>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={saveToRecord} disabled={saving}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              Save to record
            </button>
          </div>
        </div>
      );
    }
    if (status === "review") {
      return (
        <div className="flex items-center justify-between gap-2">
          <button type="button" className="btn-ghost px-2 text-[12px]" onClick={reset}>
            Scan another
          </button>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={applyToForm}>
              <CheckCircle2 size={16} />
              Use these details
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn-primary" onClick={scan} disabled={!file || status === "scanning"}>
          {status === "scanning" ? <Loader2 size={16} className="animate-spin" /> : <ScanLine size={16} />}
          Read card
        </button>
      </div>
    );
  })();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Scan patient card"
      description="Photograph or upload the card, folder page, ID, referral letter or handwritten form. The image is read by the AI service and is not stored."
      size="max-w-2xl"
      footer={footer}
    >
      <div className="space-y-4">
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700"
          >
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {status !== "review" && (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                className="flex items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 py-3 text-[13px] font-semibold text-ink transition-colors hover:border-forest-200 hover:bg-forest-50/60"
                onClick={() => cameraRef.current?.click()}
              >
                <Camera size={17} />
                Take a photo
              </button>
              <button
                type="button"
                className="flex items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 py-3 text-[13px] font-semibold text-ink transition-colors hover:border-forest-200 hover:bg-forest-50/60"
                onClick={() => fileRef.current?.click()}
              >
                <FileUp size={17} />
                Upload image or PDF
              </button>
            </div>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={chooseFile}
              aria-label="Take a photo of the card"
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={chooseFile}
              aria-label="Upload an image or PDF of the card"
            />

            {file ? (
              <div className="flex items-center gap-3 rounded-xl border border-line bg-canvas/50 p-3">
                {preview ? (
                  <img src={preview} alt="Card preview" className="h-16 w-16 rounded-lg object-cover" />
                ) : (
                  <span className="grid h-16 w-16 place-items-center rounded-lg bg-white text-ink-muted">
                    <FileUp size={20} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-semibold text-ink">{file.name}</p>
                  <p className="text-[11px] text-ink-muted">{(file.size / 1024).toFixed(0)} KB</p>
                </div>
              </div>
            ) : (
              <p className="rounded-xl bg-canvas px-3 py-6 text-center text-[12px] text-ink-muted">
                No file chosen yet. Use the camera on a phone, or upload a JPG, PNG or PDF.
              </p>
            )}

            {status === "scanning" && (
              <div className="flex items-center gap-2 rounded-xl border border-forest-200 bg-forest-50 px-3 py-2.5 text-[12.5px] text-forest-800">
                <Loader2 size={15} className="animate-spin" />
                Reading the card. This usually takes a few seconds.
              </div>
            )}

            {status === "error" && (
              <div className="rounded-xl border border-line bg-canvas px-3 py-3 text-[12px] leading-relaxed text-ink-soft">
                You can try another photo, or close this and type the patient's details manually.
              </div>
            )}
          </div>
        )}

        {status === "review" && result && mode === "update" && (
          <div className="space-y-3">
            <div className="rounded-xl border border-forest-200 bg-forest-50 px-3 py-2 text-[12px] text-forest-800">
              Check the highlighted values before saving. The record keeps the patient's name and date of birth.
            </div>
            <div className="grid max-h-[46vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
              {UPDATE_FIELDS.map(([key, label, type]) => {
                const confidence = confidences[UPDATE_SOURCE[key]];
                const low = confidence === "low";
                const medium = confidence === "medium";
                return (
                  <label key={key} className="block">
                    <span className="label flex items-center gap-1.5">
                      {label}
                      <ConfidenceChip confidence={confidence} />
                    </span>
                    {type === "blood" || type === "genotype" || type === "marital" ? (
                      <select
                        className={`input mt-1 ${low ? "border-red-300 bg-red-50/40" : medium ? "border-amber-300 bg-amber-50/40" : ""}`}
                        value={values[key] || ""}
                        onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
                      >
                        <option value="">Not recorded</option>
                        {(type === "blood" ? BLOOD_GROUPS : type === "genotype" ? GENOTYPES : MARITAL_STATUSES).map(
                          (option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ),
                        )}
                      </select>
                    ) : (
                      <input
                        className={`input mt-1 ${low ? "border-red-300 bg-red-50/40" : medium ? "border-amber-300 bg-amber-50/40" : ""}`}
                        value={values[key] || ""}
                        onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
                      />
                    )}
                  </label>
                );
              })}
            </div>
            <label className="flex items-start gap-2 rounded-lg border border-line px-3 py-2 text-[12px] text-ink-soft">
              <input
                type="checkbox"
                checked={attach}
                onChange={(event) => setAttach(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-line text-forest-700"
              />
              <span>
                Note this scan on the patient record. The image itself is not stored; the record keeps the file name
                only.
              </span>
            </label>
          </div>
        )}

        {status === "review" && result && mode !== "update" && (
          <div className="space-y-3">
            <div className="rounded-xl border border-forest-200 bg-forest-50 px-3 py-2 text-[12px] text-forest-800">
              {result.first_name?.value || result.last_name?.value
                ? `Card read: ${[result.first_name?.value, result.other_names?.value, result.last_name?.value]
                    .filter(Boolean)
                    .join(" ")}`
                : "The card was read, but no name was clear."}{" "}
              These details go into the registration form, where you can edit every field before saving.
            </div>
            <ul className="grid max-h-[46vh] gap-x-4 gap-y-1.5 overflow-y-auto pr-1 text-[12px] sm:grid-cols-2">
              {FIELD_LABELS.map(([key, label]) => {
                const entry = result[key];
                const value = entry?.value;
                return (
                  <li key={key} className="flex items-start justify-between gap-2 border-b border-line/60 py-1">
                    <span className="text-ink-muted">{label}</span>
                    <span className="flex items-center gap-1.5 text-right font-medium text-ink-soft">
                      {value || "—"}
                      {value ? <ConfidenceChip confidence={entry?.confidence} /> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="flex items-start gap-2 rounded-lg bg-canvas px-3 py-2 text-[11.5px] leading-relaxed text-ink-muted">
              <ShieldCheck size={14} className="mt-0.5 shrink-0 text-forest-600" />
              Nothing is saved yet. Check the highlighted fields in the form, then confirm registration.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
