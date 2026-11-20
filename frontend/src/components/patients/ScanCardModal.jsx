import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  Camera,
  Check,
  ImagePlus,
  Loader2,
  RotateCw,
  ScanLine,
  ShieldAlert,
  UserSearch,
} from "lucide-react";

import Modal from "../Modal";
import { api } from "../../lib/api";

const FIELDS = [
  { key: "first_name", label: "First name", type: "text" },
  { key: "last_name", label: "Last name", type: "text" },
  { key: "other_name", label: "Other name", type: "text" },
  {
    key: "sex",
    label: "Sex",
    type: "select",
    options: [
      ["female", "Female"],
      ["male", "Male"],
    ],
  },
  { key: "date_of_birth", label: "Date of birth", type: "date" },
  { key: "age", label: "Age", type: "text" },
  { key: "phone", label: "Phone", type: "tel" },
  { key: "email", label: "Email", type: "email" },
  { key: "address", label: "Address", type: "text", wide: true },
  { key: "next_of_kin", label: "Next of kin", type: "text" },
  { key: "next_of_kin_phone", label: "Next of kin phone", type: "tel" },
  { key: "card_number", label: "Card number", type: "text" },
  { key: "nhis_no", label: "NHIS number", type: "text" },
  {
    key: "blood_group",
    label: "Blood group",
    type: "select",
    options: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((value) => [value, value]),
  },
  {
    key: "genotype",
    label: "Genotype",
    type: "select",
    options: ["AA", "AS", "AC", "SS", "SC"].map((value) => [value, value]),
  },
  { key: "allergies", label: "Allergies", type: "text" },
  { key: "occupation", label: "Occupation", type: "text" },
  {
    key: "marital_status",
    label: "Marital status",
    type: "select",
    options: ["single", "married", "divorced", "widowed"].map((value) => [
      value,
      value.charAt(0).toUpperCase() + value.slice(1),
    ]),
  },
];

const EMPTY_FIELDS = Object.fromEntries(FIELDS.map((field) => [field.key, ""]));
const EMPTY_CONFIDENCE = Object.fromEntries(FIELDS.map((field) => [field.key, "low"]));

const CONFIDENCE_CHIP = {
  high: "bg-forest-100 text-forest-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-amber-200 text-amber-900",
};

async function rotatedFile(file, degrees) {
  if (!degrees || !file || file.type === "application/pdf") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    const swap = degrees % 180 !== 0;
    canvas.width = swap ? bitmap.height : bitmap.width;
    canvas.height = swap ? bitmap.width : bitmap.height;
    const context = canvas.getContext("2d");
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((degrees * Math.PI) / 180);
    context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) return file;
    const name = (file.name || "card").replace(/\.[^.]+$/, "");
    return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export default function ScanCardModal({ open, onClose, onConfirm, patientId }) {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [rotation, setRotation] = useState(0);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [stage, setStage] = useState("pick");
  const [values, setValues] = useState(EMPTY_FIELDS);
  const [confidence, setConfidence] = useState(EMPTY_CONFIDENCE);
  const [warnings, setWarnings] = useState([]);
  const [duplicates, setDuplicates] = useState([]);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  const reset = useCallback(() => {
    setFile(null);
    setPreviewUrl("");
    setRotation(0);
    setError("");
    setCameraError("");
    setScanning(false);
    setStage("pick");
    setValues(EMPTY_FIELDS);
    setConfidence(EMPTY_CONFIDENCE);
    setWarnings([]);
    setDuplicates([]);
    stopCamera();
  }, [stopCamera]);

  useEffect(() => {
    if (open) reset();
    else stopCamera();
  }, [open, reset, stopCamera]);

  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraOn]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const acceptFile = (incoming) => {
    if (!incoming) return;
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowed.includes(incoming.type)) {
      setError("Upload a JPG, PNG, WEBP or PDF file.");
      return;
    }
    if (incoming.size > 10 * 1024 * 1024) {
      setError("That file is larger than 10 MB. Try a smaller photo.");
      return;
    }
    setError("");
    setFile(incoming);
    setRotation(0);
    setPreviewUrl(incoming.type === "application/pdf" ? "" : URL.createObjectURL(incoming));
  };

  const startCamera = async () => {
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOn(true);
    } catch {
      setCameraError("The camera is not available here. Upload a photo of the card instead.");
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      acceptFile(new File([blob], "card-capture.jpg", { type: "image/jpeg" }));
      stopCamera();
    }, "image/jpeg", 0.92);
  };

  const checkDuplicates = async (next) => {
    const params = new URLSearchParams();
    if (next.first_name) params.set("first_name", next.first_name);
    if (next.last_name) params.set("last_name", next.last_name);
    if (next.date_of_birth) params.set("date_of_birth", next.date_of_birth);
    if (next.phone) params.set("phone", next.phone);
    if (next.card_number) params.set("card_no", next.card_number);
    if (![...params.keys()].length) return;
    try {
      const data = await api.get(`/patients/duplicates?${params.toString()}`);
      setDuplicates(data?.items || []);
    } catch {
      setDuplicates([]);
    }
  };

  const scan = async () => {
    if (!file) return;
    setScanning(true);
    setError("");
    try {
      const upload = await rotatedFile(file, rotation);
      const form = new FormData();
      form.append("file", upload, upload.name || "card.jpg");
      const data = await api.upload("/ocr/scan", form);
      const next = { ...EMPTY_FIELDS };
      const nextConfidence = { ...EMPTY_CONFIDENCE };
      for (const field of FIELDS) {
        next[field.key] = data?.fields?.[field.key]?.value || "";
        nextConfidence[field.key] = data?.fields?.[field.key]?.confidence || "low";
      }
      setValues(next);
      setConfidence(nextConfidence);
      setWarnings(data?.warnings || []);
      setStage("review");
      checkDuplicates(next);
    } catch (err) {
      setError(
        err?.message || "We couldn't read this card. Try a clearer photo or enter details manually.",
      );
    } finally {
      setScanning(false);
    }
  };

  const confirm = () => {
    const cleaned = {};
    for (const field of FIELDS) {
      const value = (values[field.key] || "").trim();
      if (value) cleaned[field.key] = value;
    }
    onConfirm?.(cleaned);
    onClose?.();
  };

  const filledCount = Object.values(values).filter((value) => (value || "").trim()).length;
  const isPdf = file?.type === "application/pdf";

  const footer =
    stage === "review" ? (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-ink-muted">
          Nothing is saved until you confirm. Check every field against the card first.
        </p>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-secondary" onClick={() => setStage("pick")}>
            Rescan
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={confirm}
            disabled={filledCount === 0}
          >
            <Check size={16} />
            Confirm and use details
          </button>
        </div>
      </div>
    ) : (
      <div className="flex items-center justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn-primary" onClick={scan} disabled={!file || scanning}>
          {scanning ? <Loader2 size={16} className="animate-spin" /> : <ScanLine size={16} />}
          {scanning ? "Reading card…" : "Scan card"}
        </button>
      </div>
    );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Scan patient card"
      description="Photograph or upload a patient card, folder page, ID, referral letter or handwritten form."
      size="max-w-5xl"
      footer={footer}
    >
      {error && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900"
        >
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            type="button"
            className="btn-secondary px-2 py-1 text-[11.5px]"
            onClick={() => {
              onClose?.();
            }}
          >
            Enter details manually
          </button>
        </div>
      )}

      {stage === "pick" ? (
        <div className="space-y-4">
          {cameraOn ? (
            <div className="space-y-3">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="max-h-[360px] w-full rounded-xl bg-black object-contain"
              />
              <div className="flex items-center gap-2">
                <button type="button" className="btn-primary" onClick={capturePhoto}>
                  <Camera size={16} /> Capture photo
                </button>
                <button type="button" className="btn-secondary" onClick={stopCamera}>
                  Cancel camera
                </button>
              </div>
            </div>
          ) : file ? (
            <div className="grid gap-4 sm:grid-cols-[minmax(0,320px)_1fr]">
              <div className="overflow-hidden rounded-xl border border-line bg-canvas">
                {isPdf ? (
                  <div className="flex h-56 flex-col items-center justify-center gap-2 text-ink-muted">
                    <ScanLine size={28} />
                    <span className="px-4 text-center text-[12px]">{file.name}</span>
                  </div>
                ) : (
                  <img
                    src={previewUrl}
                    alt="Card preview"
                    className="max-h-[320px] w-full object-contain transition-transform"
                    style={{ transform: `rotate(${rotation}deg)` }}
                  />
                )}
              </div>
              <div className="space-y-3">
                <p className="text-[12.5px] text-ink-soft">
                  Check the photo is sharp, well lit and not cropped. Rotate it if the text is
                  sideways.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setRotation((value) => (value + 90) % 360)}
                    disabled={isPdf}
                  >
                    <RotateCw size={15} /> Rotate
                  </button>
                  <label className="btn-secondary cursor-pointer">
                    <ImagePlus size={15} /> Retake
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      className="hidden"
                      onChange={(event) => acceptFile(event.target.files?.[0])}
                    />
                  </label>
                </div>
                <p className="text-[11.5px] text-ink-muted">JPG, PNG, WEBP or PDF · up to 10 MB</p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-line bg-canvas/60 px-6 py-10 text-center">
              <ScanLine size={30} className="mx-auto text-forest-600" />
              <p className="mt-3 text-[13px] font-semibold text-ink">Add a photo of the card</p>
              <p className="mt-1 text-[12px] text-ink-soft">
                A flat, well-lit photo reads best. Printed cards read far more accurately than
                handwriting.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <label className="btn-primary cursor-pointer">
                  <ImagePlus size={16} /> Upload photo or PDF
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="hidden"
                    onChange={(event) => acceptFile(event.target.files?.[0])}
                  />
                </label>
                <button type="button" className="btn-secondary" onClick={startCamera}>
                  <Camera size={16} /> Use camera
                </button>
              </div>
              {cameraError && (
                <p className="mt-3 text-[12px] text-amber-800">{cameraError}</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,300px)_1fr]">
          <div className="space-y-3">
            <div className="overflow-hidden rounded-xl border border-line bg-canvas">
              {isPdf ? (
                <div className="flex h-48 flex-col items-center justify-center gap-2 text-ink-muted">
                  <ScanLine size={26} />
                  <span className="px-4 text-center text-[12px]">{file?.name}</span>
                </div>
              ) : (
                <img
                  src={previewUrl}
                  alt="Scanned card"
                  className="max-h-[300px] w-full object-contain"
                  style={{ transform: `rotate(${rotation}deg)` }}
                />
              )}
            </div>
            <div className="rounded-lg border border-line bg-white px-3 py-2 text-[11.5px] text-ink-soft">
              <p className="flex items-center gap-1.5 font-semibold text-ink">
                <ShieldAlert size={13} className="text-amber-600" /> Read with local OCR
              </p>
              <p className="mt-1">
                Handwriting is read much less reliably than print. Empty fields are grey, low
                confidence is amber — correct anything that looks wrong.
              </p>
            </div>
            {warnings.map((warning) => (
              <p key={warning} className="text-[11.5px] text-amber-800">
                {warning}
              </p>
            ))}
          </div>

          <div className="space-y-4">
            {duplicates.length > 0 && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-3">
                <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-amber-900">
                  <UserSearch size={14} /> Possible existing record
                </p>
                <ul className="mt-2 space-y-2">
                  {duplicates.map((match) => (
                    <li key={match.id} className="flex flex-wrap items-center gap-2 text-[12px] text-amber-900">
                      <span className="font-semibold">{match.full_name}</span>
                      <span>{match.patient_no}</span>
                      <span className="text-amber-800">({match.matched_on.join(", ")})</span>
                      <button
                        type="button"
                        className="btn-secondary px-2 py-1 text-[11.5px]"
                        onClick={() => {
                          onClose?.();
                          navigate(`/patients/${match.id}`);
                        }}
                      >
                        Open existing patient
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11.5px] text-amber-800">
                  Or continue as a new patient below if these are different people.
                </p>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              {FIELDS.map((field) => {
                const value = values[field.key] || "";
                const level = value ? confidence[field.key] : null;
                const tone = !value
                  ? "border-line bg-slate-50 text-ink-muted"
                  : level === "low"
                    ? "border-amber-400 bg-amber-50"
                    : level === "medium"
                      ? "border-amber-200 bg-white"
                      : "border-line bg-white";
                return (
                  <label key={field.key} className={`block ${field.wide ? "sm:col-span-2" : ""}`}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="label">{field.label}</span>
                      {value ? (
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${CONFIDENCE_CHIP[level]}`}
                        >
                          {level}
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">
                          empty
                        </span>
                      )}
                    </span>
                    {field.type === "select" ? (
                      <select
                        className={`input mt-1 ${tone}`}
                        value={value}
                        onChange={(event) =>
                          setValues((current) => ({ ...current, [field.key]: event.target.value }))
                        }
                      >
                        <option value="">Not read</option>
                        {field.options.map(([optionValue, optionLabel]) => (
                          <option key={optionValue} value={optionValue}>
                            {optionLabel}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={field.type === "date" ? "date" : field.type}
                        className={`input mt-1 ${tone}`}
                        value={value}
                        onChange={(event) =>
                          setValues((current) => ({ ...current, [field.key]: event.target.value }))
                        }
                      />
                    )}
                  </label>
                );
              })}
            </div>
            {patientId && (
              <p className="text-[11.5px] text-ink-muted">
                Confirming updates this patient&apos;s details — the record itself is not
                duplicated.
              </p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
