import { useState } from "react";
import { AlertCircle, Loader2, Pill, Plus, Trash2 } from "lucide-react";

import Modal from "../Modal";
import { api } from "../../lib/api";

const EMPTY_ITEM = { drug_name: "", dose: "", frequency: "", duration: "", route: "Oral", quantity: "" };

export default function PrescriptionModal({ open, onClose, patientId, visitId, onSaved }) {
  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const setItem = (index, key) => (event) => {
    const value = event.target.value;
    setItems((current) =>
      current.map((item, position) => (position === index ? { ...item, [key]: value } : item)),
    );
  };

  const addItem = () => setItems((current) => [...current, { ...EMPTY_ITEM }]);
  const removeItem = (index) => setItems((current) => current.filter((_, position) => position !== index));

  const reset = () => {
    setItems([{ ...EMPTY_ITEM }]);
    setNotes("");
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.post(`/patients/${patientId}/prescriptions`, {
        visit_id: visitId || null,
        notes: notes || null,
        items: items
          .filter((item) => item.drug_name.trim())
          .map((item) => ({
            drug_name: item.drug_name,
            dose: item.dose || null,
            frequency: item.frequency || null,
            duration: item.duration || null,
            route: item.route || null,
            quantity: item.quantity || null,
          })),
      });
      reset();
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const valid = items.some((item) => item.drug_name.trim().length >= 2);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Write prescription"
      description="Add one line per medicine. The pharmacy sees it as an open prescription."
      size="max-w-3xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          <button type="button" className="btn-ghost px-2" onClick={addItem}>
            <Plus size={15} />
            Add medicine
          </button>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" form="prescription-form" className="btn-primary" disabled={saving || !valid}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Pill size={16} />}
              Save prescription
            </button>
          </div>
        </div>
      }
    >
      <form id="prescription-form" className="space-y-3" onSubmit={submit}>
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={index} className="rounded-xl border border-line bg-canvas/40 p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-forest-700">
                  Medicine {index + 1}
                </span>
                {items.length > 1 && (
                  <button
                    type="button"
                    className="icon-btn h-8 w-8 text-red-600 hover:bg-red-50"
                    onClick={() => removeItem(index)}
                    aria-label={`Remove medicine ${index + 1}`}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-6">
                <label className="block sm:col-span-2">
                  <span className="label">Drug name *</span>
                  <input className="input mt-1" value={item.drug_name} onChange={setItem(index, "drug_name")} placeholder="Amoxicillin 500mg" />
                </label>
                <label className="block">
                  <span className="label">Dose</span>
                  <input className="input mt-1" value={item.dose} onChange={setItem(index, "dose")} placeholder="500mg" />
                </label>
                <label className="block">
                  <span className="label">Frequency</span>
                  <input className="input mt-1" value={item.frequency} onChange={setItem(index, "frequency")} placeholder="TDS" />
                </label>
                <label className="block">
                  <span className="label">Duration</span>
                  <input className="input mt-1" value={item.duration} onChange={setItem(index, "duration")} placeholder="5 days" />
                </label>
                <label className="block">
                  <span className="label">Quantity</span>
                  <input className="input mt-1" value={item.quantity} onChange={setItem(index, "quantity")} placeholder="15 caps" />
                </label>
                <label className="block sm:col-span-2">
                  <span className="label">Route</span>
                  <select className="input mt-1" value={item.route} onChange={setItem(index, "route")}>
                    {["Oral", "IV", "IM", "Topical", "Inhalation", "Rectal", "Ophthalmic"].map((route) => (
                      <option key={route} value={route}>{route}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          ))}
        </div>

        <label className="block">
          <span className="label">Notes for the pharmacy</span>
          <input className="input mt-1" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional" />
        </label>
      </form>
    </Modal>
  );
}
