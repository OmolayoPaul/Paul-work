import { useEffect, useState } from "react";
import { AlertCircle, FlaskConical, Loader2 } from "lucide-react";

import Modal from "../Modal";
import { api } from "../../lib/api";

export default function LabResultModal({ open, onClose, order, onSaved }) {
  const [result, setResult] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setResult("");
      setError("");
      setSaving(false);
    }
  }, [open]);

  const submit = async (event) => {
    event.preventDefault();
    if (!order) return;
    setSaving(true);
    setError("");
    try {
      const updated = await api.patch(`/orders/lab-requests/${order.id}/result`, {
        result_summary: result,
      });
      onSaved?.(updated);
      onClose?.();
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
      title="Enter lab result"
      description={order ? `${order.title} · ${order.patient?.full_name || "Patient"}` : ""}
      size="max-w-lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="lab-result-form" className="btn-primary" disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <FlaskConical size={16} />}
            Save result
          </button>
        </div>
      }
    >
      <form id="lab-result-form" className="space-y-3" onSubmit={submit}>
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {order?.detail && (
          <p className="text-[12px] text-ink-muted">Specimen: {order.detail}</p>
        )}
        <label className="block">
          <span className="label">Result</span>
          <textarea
            className="input mt-1 min-h-[140px]"
            value={result}
            onChange={(event) => setResult(event.target.value)}
            placeholder={"e.g. Malaria parasite: positive (P. falciparum, +)\nReference range: negative"}
            required
            minLength={2}
            maxLength={4000}
          />
        </label>
        <p className="text-[11px] leading-relaxed text-ink-muted">
          The result appears on the patient's record and in the doctor's timeline as soon as you save it.
        </p>
      </form>
    </Modal>
  );
}
