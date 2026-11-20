import { useEffect, useState } from "react";
import { AlertCircle, Loader2, LogIn } from "lucide-react";

import Modal from "../Modal";
import { api } from "../../lib/api";
import { BILL_TYPES, CHANNELS, VISIT_TYPES } from "../../lib/clinical";

export default function CheckInModal({ open, onClose, patientId, defaultClinicId, doctorId, onSaved }) {
  const [form, setForm] = useState({ visit_type: "follow_up", bill_type: "self_pay", channel: "hospital" });
  const [reference, setReference] = useState({ clinics: [], doctors: [] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm({
      visit_type: "follow_up",
      bill_type: "self_pay",
      channel: "hospital",
      clinic_id: defaultClinicId || "",
      assigned_doctor_id: doctorId || "",
    });
    setError("");
    api
      .get("/reference")
      .then((data) => setReference(data || { clinics: [], doctors: [] }))
      .catch(() => {});
  }, [open, defaultClinicId, doctorId]);

  const setField = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const visit = await api.post(`/patients/${patientId}/visits`, {
        visit_type: form.visit_type,
        bill_type: form.bill_type,
        channel: form.channel,
        clinic_id: form.clinic_id || null,
        assigned_doctor_id: form.assigned_doctor_id || null,
        chief_complaint: form.chief_complaint || null,
      });
      onSaved?.(visit);
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
      title="Check in for a new visit"
      description="Adds this patient to today's worklist."
      size="max-w-xl"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="checkin-form" className="btn-primary" disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
            Check in
          </button>
        </div>
      }
    >
      <form id="checkin-form" className="space-y-3" onSubmit={submit}>
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Clinic</span>
            <select className="input mt-1" value={form.clinic_id ?? ""} onChange={setField("clinic_id")}>
              <option value="">Select clinic</option>
              {reference.clinics.map((clinic) => (
                <option key={clinic.id} value={clinic.id}>{clinic.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Visit type</span>
            <select className="input mt-1" value={form.visit_type} onChange={setField("visit_type")}>
              {Object.entries(VISIT_TYPES).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Bill type</span>
            <select className="input mt-1" value={form.bill_type} onChange={setField("bill_type")}>
              {Object.entries(BILL_TYPES).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Visit channel</span>
            <select className="input mt-1" value={form.channel} onChange={setField("channel")}>
              {Object.entries(CHANNELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="label">Assigned doctor</span>
            <select className="input mt-1" value={form.assigned_doctor_id ?? ""} onChange={setField("assigned_doctor_id")}>
              <option value="">Triage / unassigned</option>
              {reference.doctors.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>{doctor.full_name}</option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="label">Presenting complaint</span>
            <input className="input mt-1" value={form.chief_complaint ?? ""} onChange={setField("chief_complaint")} />
          </label>
        </div>
      </form>
    </Modal>
  );
}
