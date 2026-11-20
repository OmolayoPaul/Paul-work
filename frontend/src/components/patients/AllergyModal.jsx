import { useState } from "react";
import { AlertCircle, AlertTriangle, Loader2 } from "lucide-react";

import Modal from "../Modal";
import { api } from "../../lib/api";

export default function AllergyModal({ open, onClose, patientId, onSaved }) {
  const [form, setForm] = useState({ severity: "moderate" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const setField = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.post(`/patients/${patientId}/allergies`, {
        substance: form.substance,
        reaction: form.reaction || null,
        severity: form.severity,
      });
      setForm({ severity: "moderate" });
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
      title="Record allergy"
      description="Allergies appear as a red warning on the patient's record."
      size="max-w-lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="allergy-form" className="btn-primary" disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <AlertTriangle size={16} />}
            Save allergy
          </button>
        </div>
      }
    >
      <form id="allergy-form" className="space-y-3" onSubmit={submit}>
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <label className="block">
          <span className="label">Allergen *</span>
          <input
            className="input mt-1"
            placeholder="e.g. Penicillin"
            value={form.substance ?? ""}
            onChange={setField("substance")}
            required
            minLength={2}
          />
        </label>
        <label className="block">
          <span className="label">Reaction</span>
          <input
            className="input mt-1"
            placeholder="e.g. Rash and swelling"
            value={form.reaction ?? ""}
            onChange={setField("reaction")}
          />
        </label>
        <label className="block">
          <span className="label">Severity</span>
          <select className="input mt-1" value={form.severity} onChange={setField("severity")}>
            <option value="mild">Mild</option>
            <option value="moderate">Moderate</option>
            <option value="severe">Severe</option>
          </select>
        </label>
      </form>
    </Modal>
  );
}
