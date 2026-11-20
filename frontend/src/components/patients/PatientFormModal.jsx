import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Loader2, ScanLine, UserPlus } from "lucide-react";

import Modal from "../Modal";
import ScanCardModal from "./ScanCardModal";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { BILL_TYPES, CHANNELS, VISIT_TYPES, canScan } from "../../lib/clinical";

const EMPTY = {
  first_name: "",
  last_name: "",
  other_name: "",
  sex: "female",
  date_of_birth: "",
  phone: "",
  email: "",
  nhis_no: "",
  card_no: "",
  blood_group: "",
  genotype: "",
  next_of_kin: "",
  next_of_kin_phone: "",
  occupation: "",
  marital_status: "",
  address: "",
  clinic_id: "",
  visit_type: "new",
  bill_type: "self_pay",
  channel: "hospital",
  assigned_doctor_id: "",
  chief_complaint: "",
  check_in: true,
};

export default function PatientFormModal({ open, onClose, onSaved }) {
  const { staff } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [reference, setReference] = useState({ clinics: [], doctors: [] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const scanner = canScan(staff?.role);

  const loadReference = useCallback(async () => {
    try {
      const data = await api.get("/reference");
      setReference(data || { clinics: [], doctors: [] });
    } catch {
      setReference({ clinics: [], doctors: [] });
    }
  }, []);

  useEffect(() => {
    if (open) {
      setForm(EMPTY);
      setError("");
      loadReference();
    }
  }, [open, loadReference]);

  const setField = (key) => (event) => {
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        first_name: form.first_name,
        last_name: form.last_name,
        other_name: form.other_name || null,
        sex: form.sex,
        date_of_birth: form.date_of_birth,
        phone: form.phone || null,
        email: form.email || null,
        nhis_no: form.nhis_no || null,
        card_no: form.card_no || null,
        blood_group: form.blood_group || null,
        genotype: form.genotype || null,
        next_of_kin: form.next_of_kin || null,
        next_of_kin_phone: form.next_of_kin_phone || null,
        occupation: form.occupation || null,
        marital_status: form.marital_status || null,
        address: form.address || null,
        clinic_id: form.clinic_id || null,
        check_in: form.check_in,
        visit_type: form.visit_type,
        bill_type: form.bill_type,
        channel: form.channel,
        assigned_doctor_id: form.assigned_doctor_id || null,
        chief_complaint: form.chief_complaint || null,
      };
      const result = await api.post("/patients", payload);
      onSaved?.(result);
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
      title="Register patient"
      description="Create the patient record and add them to today's worklist."
      size="max-w-3xl"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="patient-form" className="btn-primary" disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
            {form.check_in ? "Register & check in" : "Register patient"}
          </button>
        </div>
      }
    >
      <form id="patient-form" className="space-y-5" onSubmit={submit}>
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {scanner && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-forest-100 bg-forest-50/70 px-3 py-2">
            <p className="text-[12px] text-forest-900">
              Have the patient&apos;s card? Scan it to fill this form.
            </p>
            <button
              type="button"
              className="btn-secondary px-3 py-1.5 text-[12px]"
              onClick={() => setScanOpen(true)}
            >
              <ScanLine size={14} /> Scan card
            </button>
          </div>
        )}

        <fieldset className="space-y-3">
          <legend className="text-[11px] font-bold uppercase tracking-[0.14em] text-forest-700">Patient details</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="label">First name *</span>
              <input className="input mt-1" value={form.first_name} onChange={setField("first_name")} required />
            </label>
            <label className="block">
              <span className="label">Last name *</span>
              <input className="input mt-1" value={form.last_name} onChange={setField("last_name")} required />
            </label>
            <label className="block">
              <span className="label">Other name</span>
              <input className="input mt-1" value={form.other_name} onChange={setField("other_name")} />
            </label>
            <label className="block">
              <span className="label">Sex *</span>
              <select className="input mt-1" value={form.sex} onChange={setField("sex")}>
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
            </label>
            <label className="block">
              <span className="label">Date of birth *</span>
              <input
                type="date"
                className="input mt-1"
                value={form.date_of_birth}
                max={new Date().toISOString().slice(0, 10)}
                onChange={setField("date_of_birth")}
                required
              />
            </label>
            <label className="block">
              <span className="label">Blood group</span>
              <select className="input mt-1" value={form.blood_group} onChange={setField("blood_group")}>
                <option value="">Unknown</option>
                {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((group) => (
                  <option key={group} value={group}>{group}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Genotype</span>
              <select className="input mt-1" value={form.genotype} onChange={setField("genotype")}>
                <option value="">Unknown</option>
                {["AA", "AS", "AC", "SS", "SC"].map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Phone</span>
              <input className="input mt-1" value={form.phone} onChange={setField("phone")} placeholder="0803 000 0000" />
            </label>
            <label className="block">
              <span className="label">Email</span>
              <input type="email" className="input mt-1" value={form.email} onChange={setField("email")} />
            </label>
            <label className="block">
              <span className="label">NHIS number</span>
              <input className="input mt-1" value={form.nhis_no} onChange={setField("nhis_no")} />
            </label>
            <label className="block">
              <span className="label">Card number</span>
              <input className="input mt-1" value={form.card_no} onChange={setField("card_no")} />
            </label>
            <label className="block">
              <span className="label">Next of kin</span>
              <input className="input mt-1" value={form.next_of_kin} onChange={setField("next_of_kin")} />
            </label>
            <label className="block">
              <span className="label">Next of kin phone</span>
              <input className="input mt-1" value={form.next_of_kin_phone} onChange={setField("next_of_kin_phone")} />
            </label>
            <label className="block">
              <span className="label">Occupation</span>
              <input className="input mt-1" value={form.occupation} onChange={setField("occupation")} />
            </label>
            <label className="block">
              <span className="label">Marital status</span>
              <select className="input mt-1" value={form.marital_status} onChange={setField("marital_status")}>
                <option value="">Unknown</option>
                {["single", "married", "divorced", "widowed"].map((value) => (
                  <option key={value} value={value}>
                    {value.charAt(0).toUpperCase() + value.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-3">
              <span className="label">Address</span>
              <input className="input mt-1" value={form.address} onChange={setField("address")} />
            </label>
          </div>
        </fieldset>

        <fieldset className="space-y-3 border-t border-line pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <legend className="text-[11px] font-bold uppercase tracking-[0.14em] text-forest-700">Visit & check-in</legend>
            <label className="flex items-center gap-2 text-[12px] font-medium text-ink-soft">
              <input type="checkbox" checked={form.check_in} onChange={setField("check_in")} className="h-4 w-4 rounded border-line text-forest-700" />
              Add to today's worklist
            </label>
          </div>
          <div className={`grid gap-3 sm:grid-cols-3 ${form.check_in ? "" : "pointer-events-none opacity-50"}`}>
            <label className="block">
              <span className="label">Clinic</span>
              <select className="input mt-1" value={form.clinic_id} onChange={setField("clinic_id")} disabled={!form.check_in}>
                <option value="">Select clinic</option>
                {reference.clinics.map((clinic) => (
                  <option key={clinic.id} value={clinic.id}>{clinic.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Visit type</span>
              <select className="input mt-1" value={form.visit_type} onChange={setField("visit_type")} disabled={!form.check_in}>
                {Object.entries(VISIT_TYPES).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Bill type</span>
              <select className="input mt-1" value={form.bill_type} onChange={setField("bill_type")} disabled={!form.check_in}>
                {Object.entries(BILL_TYPES).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Visit channel</span>
              <select className="input mt-1" value={form.channel} onChange={setField("channel")} disabled={!form.check_in}>
                {Object.entries(CHANNELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="label">Assigned doctor</span>
              <select
                className="input mt-1"
                value={form.assigned_doctor_id}
                onChange={setField("assigned_doctor_id")}
                disabled={!form.check_in}
              >
                <option value="">Assign to me / triage</option>
                {reference.doctors.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>{doctor.full_name}</option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-3">
              <span className="label">Presenting complaint</span>
              <input
                className="input mt-1"
                value={form.chief_complaint}
                onChange={setField("chief_complaint")}
                placeholder="What the patient is here for"
                disabled={!form.check_in}
              />
            </label>
          </div>
        </fieldset>
      </form>

      <ScanCardModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onConfirm={(values) => {
          const next = {};
          for (const [key, value] of Object.entries(values)) {
            if (key === "card_number") next.card_no = value;
            else if (key === "age" || key === "allergies") continue;
            else next[key] = value;
          }
          setForm((current) => ({ ...current, ...next }));
        }}
      />
    </Modal>
  );
}
