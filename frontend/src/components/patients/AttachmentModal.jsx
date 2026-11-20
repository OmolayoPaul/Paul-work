import { useState } from "react";
import { AlertCircle, Loader2, Paperclip } from "lucide-react";

import Modal from "../Modal";
import { api } from "../../lib/api";

const KINDS = [
  ["document", "Document"],
  ["image", "Image / scan"],
  ["result", "Investigation result"],
  ["consent", "Consent form"],
];

export default function AttachmentModal({ open, onClose, patientId, visitId, onSaved }) {
  const [file, setFile] = useState(null);
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState("document");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setFile(null);
    setDescription("");
    setKind("document");
    setError("");
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!file) {
      setError("Choose a file to attach.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("description", description);
      form.append("kind", kind);
      if (visitId) form.append("visit_id", visitId);
      await api.upload(`/patients/${patientId}/attachments`, form);
      reset();
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Add attachment"
      description="Attach a scan, referral letter, consent form or result to this patient's record."
      size="max-w-lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </button>
          <button type="submit" form="attachment-form" className="btn-primary" disabled={saving || !file}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
            Attach file
          </button>
        </div>
      }
    >
      <form id="attachment-form" className="space-y-3" onSubmit={submit}>
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <label className="block">
          <span className="label">File *</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="input mt-1 py-1.5"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
          <span className="mt-1 block text-[11px] text-ink-muted">JPG, PNG, WEBP or PDF · up to 10 MB</span>
        </label>
        <label className="block">
          <span className="label">Kind</span>
          <select className="input mt-1" value={kind} onChange={(event) => setKind(event.target.value)}>
            {KINDS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Description</span>
          <input
            className="input mt-1"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Chest X-ray report"
          />
        </label>
      </form>
    </Modal>
  );
}
