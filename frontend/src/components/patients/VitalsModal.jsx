import { useState } from "react";
import { AlertCircle, Activity, Loader2 } from "lucide-react";

import Modal from "../Modal";
import { api } from "../../lib/api";

const FIELDS = [
  { key: "temperature", label: "Temperature (°C)", step: "0.1", placeholder: "36.8" },
  { key: "pulse", label: "Pulse (bpm)", step: "1", placeholder: "78" },
  { key: "respiratory_rate", label: "Resp. rate", step: "1", placeholder: "18" },
  { key: "spo2", label: "SpO₂ (%)", step: "1", placeholder: "98" },
  { key: "weight", label: "Weight (kg)", step: "0.1", placeholder: "64" },
  { key: "height", label: "Height (cm)", step: "0.1", placeholder: "165" },
];

export default function VitalsModal({ open, onClose, patientId, visitId, onSaved }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const setField = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = { visit_id: visitId || null, notes: form.notes || null };
      for (const field of [...FIELDS.map((item) => item.key), "systolic", "diastolic"]) {
        const value = form[field];
        payload[field] = value === undefined || value === "" ? null : Number(value);
      }
      await api.post(`/patients/${patientId}/vitals`, payload);
      setForm({});
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
      title="Record vital signs"
      description="Triage measurements for this visit."
      size="max-w-xl"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="vitals-form" className="btn-primary" disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Activity size={16} />}
            Save vitals
          </button>
        </div>
      }
    >
      <form id="vitals-form" className="space-y-4" onSubmit={submit}>
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {FIELDS.map((field) => (
            <label key={field.key} className="block">
              <span className="label">{field.label}</span>
              <input
                type="number"
                step={field.step}
                className="input mt-1"
                placeholder={field.placeholder}
                value={form[field.key] ?? ""}
                onChange={setField(field.key)}
              />
            </label>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Systolic BP</span>
            <input
              type="number"
              className="input mt-1"
              placeholder="120"
              value={form.systolic ?? ""}
              onChange={setField("systolic")}
            />
          </label>
          <label className="block">
            <span className="label">Diastolic BP</span>
            <input
              type="number"
              className="input mt-1"
              placeholder="80"
              value={form.diastolic ?? ""}
              onChange={setField("diastolic")}
            />
          </label>
        </div>

        <label className="block">
          <span className="label">Notes</span>
          <input
            className="input mt-1"
            placeholder="Optional — e.g. taken sitting, repeat in 15 minutes"
            value={form.notes ?? ""}
            onChange={setField("notes")}
          />
        </label>
      </form>
    </Modal>
  );
}
