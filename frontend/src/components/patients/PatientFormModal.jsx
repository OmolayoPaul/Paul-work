import { useCallback, useEffect, useState } from "react";
import { AlertCircle, AlertTriangle, Loader2, ShieldCheck, UserPlus } from "lucide-react";

import Modal from "../Modal";
import { api } from "../../lib/api";
import { BILL_TYPES, BLOOD_GROUPS, CHANNELS, GENOTYPES, MARITAL_STATUSES, VISIT_TYPES } from "../../lib/clinical";

const EMPTY = {
  first_name: "",
  last_name: "",
  other_name: "",
  sex: "female",
  date_of_birth: "",
  phone: "",
  email: "",
  nhis_no: "",
  card_number: "",
  blood_group: "",
  genotype: "",
  occupation: "",
  marital_status: "",
  next_of_kin: "",
  next_of_kin_phone: "",
  allergies: "",
  address: "",
  clinic_id: "",
  visit_type: "new",
  bill_type: "self_pay",
  channel: "hospital",
  assigned_doctor_id: "",
  chief_complaint: "",
  check_in: true,
};

function ageFromDob(dob) {
  if (!dob) return "";
  const birth = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return "";
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const month = today.getMonth() - birth.getMonth();
  if (month < 0 || (month === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age >= 0 ? String(age) : "";
}

export default function PatientFormModal({ open, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [reference, setReference] = useState({ clinics: [], doctors: [] });
  const [consent, setConsent] = useState(false);
  const [duplicates, setDuplicates] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
      setConsent(false);
      setDuplicates(null);
      loadReference();
    }
  }, [open, loadReference]);

  const setField = (key) => (event) => {
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (!consent) {
      setError("Confirm the privacy and consent notice before registering this patient.");
      return;
    }
    setSaving(true);
    try {
      if (!duplicates) {
        const params = new URLSearchParams();
        params.set("first_name", form.first_name);
        params.set("last_name", form.last_name);
        if (form.date_of_birth) params.set("date_of_birth", form.date_of_birth);
        if (form.phone) params.set("phone", form.phone);
        if (form.card_number) params.set("card_number", form.card_number);
        const found = await api.get(`/capture/duplicates?${params.toString()}`);
        if (found?.items?.length) {
          setDuplicates(found.items);
          return;
        }
      }

      const payload = {
        first_name: form.first_name,
        last_name: form.last_name,
        other_name: form.other_name || null,
        sex: form.sex,
        date_of_birth: form.date_of_birth,
        phone: form.phone || null,
        email: form.email || null,
        nhis_no: form.nhis_no || null,
        card_number: form.card_number || null,
        blood_group: form.blood_group || null,
        genotype: form.genotype || null,
        occupation: form.occupation || null,
        marital_status: form.marital_status || null,
        next_of_kin: form.next_of_kin || null,
        next_of_kin_phone: form.next_of_kin_phone || null,
        allergies: form.allergies || null,
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
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="patient-form" className="btn-primary" disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
            {duplicates
              ? "Register anyway"
              : form.check_in
                ? "Register & check in"
                : "Register patient"}
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

        {duplicates && (
          <div role="alert" className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-[12.5px] text-amber-900">
            <p className="flex items-center gap-2 font-semibold">
              <AlertTriangle size={15} className="shrink-0" />
              Possible duplicate patient
            </p>
            <ul className="space-y-1.5">
              {duplicates.map((match) => (
                <li key={match.id} className="rounded-lg bg-white/70 px-2.5 py-2">
                  <span className="font-semibold">{match.full_name}</span>
                  <span className="text-amber-800"> · {match.patient_no}</span>
                  <span className="text-amber-800"> · {match.sex_label} · {match.age_display}</span>
                  <span className="mt-0.5 block text-[11.5px]">{match.reasons.join(" · ")}</span>
                  <a
                    href={`/patients/${match.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-0.5 inline-block text-[11.5px] font-semibold text-forest-700 underline"
                  >
                    Open that record
                  </a>
                </li>
              ))}
            </ul>
            <p className="text-[11.5px] leading-relaxed">
              If this is a different person, check the details and choose "Register anyway".
            </p>
            <button type="button" className="btn-secondary py-1.5 text-[12px]" onClick={() => setDuplicates(null)}>
              Go back and edit
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
              <span className="label">Age</span>
              <input
                className="input mt-1 bg-canvas/60"
                value={ageFromDob(form.date_of_birth)}
                readOnly
                tabIndex={-1}
                aria-label="Age calculated from date of birth"
              />
            </label>
            <label className="block">
              <span className="label">Phone</span>
              <input className="input mt-1" value={form.phone} onChange={setField("phone")} placeholder="0803 000 0000" />
            </label>
            <label className="block">
              <span className="label">Email</span>
              <input className="input mt-1" type="email" value={form.email} onChange={setField("email")} />
            </label>
            <label className="block">
              <span className="label">NHIS number</span>
              <input className="input mt-1" value={form.nhis_no} onChange={setField("nhis_no")} />
            </label>
            <label className="block">
              <span className="label">Card number</span>
              <input className="input mt-1" value={form.card_number} onChange={setField("card_number")} />
            </label>
            <label className="block">
              <span className="label">Blood group</span>
              <select className="input mt-1" value={form.blood_group} onChange={setField("blood_group")}>
                <option value="">Unknown</option>
                {BLOOD_GROUPS.map((group) => (
                  <option key={group} value={group}>{group}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Genotype</span>
              <select className="input mt-1" value={form.genotype} onChange={setField("genotype")}>
                <option value="">Unknown</option>
                {GENOTYPES.map((genotype) => (
                  <option key={genotype} value={genotype}>{genotype}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Occupation</span>
              <input className="input mt-1" value={form.occupation} onChange={setField("occupation")} />
            </label>
            <label className="block">
              <span className="label">Marital status</span>
              <select
                className="input mt-1"
                value={form.marital_status}
                onChange={setField("marital_status")}
              >
                <option value="">Not recorded</option>
                {MARITAL_STATUSES.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Next of kin</span>
              <input className="input mt-1" value={form.next_of_kin} onChange={setField("next_of_kin")} />
            </label>
            <label className="block">
              <span className="label">Next of kin phone</span>
              <input
                className="input mt-1"
                value={form.next_of_kin_phone}
                onChange={setField("next_of_kin_phone")}
              />
            </label>
            <label className="block">
              <span className="label">Allergies</span>
              <input
                className="input mt-1"
                value={form.allergies}
                onChange={setField("allergies")}
                placeholder="e.g. Penicillin, dust"
              />
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

        <fieldset className="space-y-2 border-t border-line pt-4">
          <legend className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-forest-700">
            <ShieldCheck size={13} />
            Privacy & consent
          </legend>
          <p className="text-[11.5px] leading-relaxed text-ink-soft">
            This record is held in the hospital's medical record system and used only to provide care and keep the
            patient's medical history. Access is limited to authorised staff and every change is written to the audit
            log, in line with Nigeria's Data Protection Act (NDPA). The patient may ask to see their record and may ask
            questions about how their information is used.
          </p>
          <label className="flex items-start gap-2 text-[12px] font-medium text-ink">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-line text-forest-700"
            />
            <span>The patient has been told how their information is used and consents to being registered.</span>
          </label>
        </fieldset>
      </form>
    </Modal>
  );
}
