import { useState } from "react";
import { AlertCircle, Loader2, Stethoscope } from "lucide-react";

import Modal from "../Modal";
import { api } from "../../lib/api";
import { NOTE_TYPES } from "../../lib/clinical";

const SECTIONS = [
  { key: "subjective", label: "Subjective (history / complaint)", placeholder: "What the patient reports…" },
  { key: "objective", label: "Objective (examination)", placeholder: "Findings on examination…" },
  { key: "assessment", label: "Assessment", placeholder: "Impression or diagnosis…" },
  { key: "plan", label: "Plan", placeholder: "Investigations, treatment, follow-up…" },
];

export default function ClinicalNoteModal({ open, onClose, patientId, visitId, onSaved }) {
  const [form, setForm] = useState({ note_type: "consultation" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const setField = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const empty = !SECTIONS.some((section) => (form[section.key] || "").trim());

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.post(`/patients/${patientId}/notes`, {
        visit_id: visitId || null,
        note_type: form.note_type,
        subjective: form.subjective || null,
        objective: form.objective || null,
        assessment: form.assessment || null,
        plan: form.plan || null,
      });
      setForm({ note_type: "consultation" });
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
      title="Clinical note"
      description="Document the consultation for this visit."
      size="max-w-2xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-ink-muted">Signed with your name and the current time.</p>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" form="note-form" className="btn-primary" disabled={saving || empty}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Stethoscope size={16} />}
              Save note
            </button>
          </div>
        </div>
      }
    >
      <form id="note-form" className="space-y-3" onSubmit={submit}>
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <label className="block sm:max-w-xs">
          <span className="label">Note type</span>
          <select className="input mt-1" value={form.note_type} onChange={setField("note_type")}>
            {Object.entries(NOTE_TYPES).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>

        {SECTIONS.map((section) => (
          <label key={section.key} className="block">
            <span className="label">{section.label}</span>
            <textarea
              rows={2}
              className="input mt-1 resize-y"
              placeholder={section.placeholder}
              value={form[section.key] ?? ""}
              onChange={setField(section.key)}
            />
          </label>
        ))}
      </form>
    </Modal>
  );
}
