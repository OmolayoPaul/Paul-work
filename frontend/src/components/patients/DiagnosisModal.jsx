import { useState } from "react";
import { AlertCircle, ClipboardList, Loader2 } from "lucide-react";

import Modal from "../Modal";
import { api } from "../../lib/api";

export default function DiagnosisModal({ open, onClose, patientId, visitId, onSaved }) {
  const [form, setForm] = useState({ diagnosis_type: "primary" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const setField = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.post(`/patients/${patientId}/diagnoses`, {
        visit_id: visitId || null,
        description: form.description,
        code: form.code || null,
        diagnosis_type: form.diagnosis_type,
      });
      setForm({ diagnosis_type: "primary" });
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
      onClose={onClose}
      title="Record diagnosis"
      description="Add the working or confirmed diagnosis for this visit."
      size="max-w-lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="diagnosis-form" className="btn-primary" disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <ClipboardList size={16} />}
            Save diagnosis
          </button>
        </div>
      }
    >
      <form id="diagnosis-form" className="space-y-3" onSubmit={submit}>
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <label className="block">
          <span className="label">Diagnosis *</span>
          <input
            className="input mt-1"
            placeholder="e.g. Acute malaria"
            value={form.description ?? ""}
            onChange={setField("description")}
            required
            minLength={2}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">ICD code</span>
            <input className="input mt-1" placeholder="B54" value={form.code ?? ""} onChange={setField("code")} />
          </label>
          <label className="block">
            <span className="label">Type</span>
            <select className="input mt-1" value={form.diagnosis_type} onChange={setField("diagnosis_type")}>
              <option value="primary">Primary</option>
              <option value="secondary">Secondary</option>
            </select>
          </label>
        </div>
      </form>
    </Modal>
  );
}
