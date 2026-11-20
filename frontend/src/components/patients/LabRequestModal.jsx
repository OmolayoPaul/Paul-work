import { useState } from "react";
import { AlertCircle, FlaskConical, Loader2 } from "lucide-react";

import Modal from "../Modal";
import { api } from "../../lib/api";

const COMMON_TESTS = [
  "Malaria parasite (MP)",
  "Full blood count (FBC)",
  "Fasting blood sugar",
  "Urinalysis",
  "Liver function test",
  "HIV screening",
];

export default function LabRequestModal({ open, onClose, patientId, visitId, onSaved }) {
  const [form, setForm] = useState({ specimen: "Blood" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const setField = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.post(`/patients/${patientId}/lab-requests`, {
        visit_id: visitId || null,
        test_name: form.test_name,
        specimen: form.specimen || null,
      });
      setForm({ specimen: "Blood" });
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
      title="Request laboratory test"
      description="Sends the test to the laboratory as a pending request."
      size="max-w-lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="lab-form" className="btn-primary" disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <FlaskConical size={16} />}
            Send request
          </button>
        </div>
      }
    >
      <form id="lab-form" className="space-y-3" onSubmit={submit}>
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <label className="block">
          <span className="label">Test *</span>
          <input
            className="input mt-1"
            placeholder="Start typing or pick a common test"
            value={form.test_name ?? ""}
            onChange={setField("test_name")}
            required
            minLength={2}
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {COMMON_TESTS.map((test) => (
            <button
              key={test}
              type="button"
              className="chip border border-line bg-white text-ink-soft hover:border-forest-300 hover:text-forest-800"
              onClick={() => setForm((current) => ({ ...current, test_name: test }))}
            >
              {test}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="label">Specimen</span>
          <select className="input mt-1" value={form.specimen} onChange={setField("specimen")}>
            {["Blood", "Urine", "Stool", "Sputum", "Swab", "Other"].map((specimen) => (
              <option key={specimen} value={specimen}>{specimen}</option>
            ))}
          </select>
        </label>
      </form>
    </Modal>
  );
}
