import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Clock,
  FlaskConical,
  Loader2,
  LogIn,
  Phone,
  Pill,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  X,
} from "lucide-react";

import AllergyModal from "../components/patients/AllergyModal";
import CheckInModal from "../components/patients/CheckInModal";
import ClinicalNoteModal from "../components/patients/ClinicalNoteModal";
import DiagnosisModal from "../components/patients/DiagnosisModal";
import LabRequestModal from "../components/patients/LabRequestModal";
import PrescriptionModal from "../components/patients/PrescriptionModal";

import Timeline from "../components/patients/Timeline";
import VitalsModal from "../components/patients/VitalsModal";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  billTypeLabel,
  canPrescribe,
  canRegister,
  canWriteClinical,
  channelLabel,
  TIMELINE_FILTERS,
  timelineMatches,
  visitTypeLabel,
} from "../lib/clinical";
import { formatDate, formatDateTime } from "../lib/format";

const MODALS = {
  vitals: VitalsModal,
  note: ClinicalNoteModal,
  diagnosis: DiagnosisModal,
  prescription: PrescriptionModal,
  lab: LabRequestModal,
  allergy: AllergyModal,
};

const ACTIONS = [
  { key: "vitals", label: "Vital signs", hint: "Triage measurements", icon: Activity, permission: "clinical" },
  { key: "note", label: "Clinical note", hint: "History, exam, plan", icon: Stethoscope, permission: "clinical" },
  { key: "diagnosis", label: "Diagnosis", hint: "Working or confirmed", icon: ClipboardList, permission: "prescribe" },
  { key: "prescription", label: "Prescription", hint: "Medicines for pharmacy", icon: Pill, permission: "prescribe" },
  { key: "lab", label: "Lab request", hint: "Send to laboratory", icon: FlaskConical, permission: "prescribe" },
  { key: "allergy", label: "Allergy", hint: "Red warning on record", icon: AlertTriangle, permission: "clinical" },
];

const EMPTY_HINTS = {
  all: "Record a vital sign, a clinical note or a diagnosis from the menu.",
  vitals: "No vital signs recorded for this view.",
  plan: "No clinical notes or diagnoses recorded for this view.",
  prescription: "No prescriptions have been written for this view.",
  investigations: "No documents or investigation results attached.",
  lab: "No laboratory tests requested for this view.",
  others: "No allergies recorded for this patient.",
};

function DetailRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-[11px] text-ink-muted">{label}</dt>
      <dd className="text-right text-[12px] font-medium text-ink-soft">{value || "—"}</dd>
    </div>
  );
}

export default function PatientRecord() {
  const { patientId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { staff } = useAuth();
  const visitId = searchParams.get("visit");

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState("all");
  const [scope, setScope] = useState("visit");
  const [modal, setModal] = useState(null);
  const [checkInOpen, setCheckInOpen] = useState(false);

  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = visitId ? `?visit_id=${encodeURIComponent(visitId)}` : "";
      const result = await api.get(`/patients/${patientId}${query}`);
      setData(result);
      if (!visitId && result?.current_visit?.id) {
        setSearchParams({ visit: result.current_visit.id }, { replace: true });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [patientId, visitId, setSearchParams]);

  useEffect(() => {
    load();
  }, [load]);

  const patient = data?.patient;
  const currentVisit = data?.current_visit;
  const allEntries = data?.timeline || [];

  const entries = useMemo(() => {
    return allEntries
      .filter((entry) => timelineMatches(tab, entry))
      .filter((entry) => {
        if (scope === "all") return true;
        if (!currentVisit) return true;
        return entry.visit_id === currentVisit.id || entry.visit_id === null;
      });
  }, [allEntries, tab, scope, currentVisit]);

  const tabCounts = useMemo(() => {
    const counts = {};
    for (const filter of TIMELINE_FILTERS) {
      counts[filter.value] = allEntries.filter((entry) => timelineMatches(filter.value, entry)).length;
    }
    return counts;
  }, [allEntries]);

  const allowed = {
    clinical: canWriteClinical(staff?.role),
    prescribe: canPrescribe(staff?.role),
  };
  const visibleActions = ACTIONS.filter((action) => allowed[action.permission]);
  const canMarkAttended =
    currentVisit?.status === "pending" && ["doctor", "super_admin"].includes(staff?.role);

  const saved = (message) => {
    setModal(null);
    setNotice(message);
    load();
  };

  const markAttended = async () => {
    setMarking(true);
    setError("");
    try {
      await api.patch(`/worklist/${currentVisit.id}/attend`, {});
      setNotice("Consultation marked attended. The patient moved to Attended To.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setMarking(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="grid place-items-center py-24">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={22} className="animate-spin text-forest-600" />
          <p className="text-[12px] text-ink-muted">Opening patient record…</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <button type="button" className="btn-ghost px-2" onClick={() => navigate(-1)}>
          <ArrowLeft size={15} /> Back
        </button>
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          {error || "Patient record could not be loaded."}
        </div>
      </div>
    );
  }

  const allergies = data.allergies || [];
  const ModalComponent = modal ? MODALS[modal] : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to="/worklist" className="btn-ghost px-2 text-[12px]">
          <ArrowLeft size={15} />
          Back to worklist
        </Link>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-ghost px-2 text-[12px]" onClick={load}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
          {canRegister(staff?.role) && (
            <>
              <button type="button" className="btn-secondary py-2 text-[12px]" onClick={() => setCheckInOpen(true)}>
                <LogIn size={14} />
                Check in new visit
              </button>
            </>
          )}
          {canMarkAttended && (
            <button type="button" className="btn-primary py-2 text-[12px]" onClick={markAttended} disabled={marking}>
              {marking ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Mark attended
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div className="flex items-start gap-2.5 rounded-xl border border-forest-200 bg-forest-50 px-4 py-3 text-[13px] text-forest-800">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{notice}</span>
          <button type="button" className="rounded-md p-0.5 text-forest-700 hover:bg-white/60" onClick={() => setNotice("")} aria-label="Dismiss message">
            <X size={15} />
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" className="rounded-md p-0.5 hover:bg-white/60" onClick={() => setError("")} aria-label="Dismiss error">
            <X size={15} />
          </button>
        </div>
      )}

      {/* Patient header */}
      <section className="card overflow-hidden">
        <div className="border-b border-line bg-canvas/40 px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Patient medical record</p>
              <h1 className="mt-1 truncate text-xl font-bold tracking-tight text-ink sm:text-2xl">{patient.full_name}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-soft">
                <span className="font-mono text-[11.5px] font-medium text-forest-800">{patient.patient_no}</span>
                <span>{patient.sex_label} · {patient.age_display}</span>
                <span>{patient.clinic?.name || "No clinic"}</span>
                {currentVisit && (
                  <span className="chip bg-white px-2 py-0.5 text-ink-soft">
                    {visitTypeLabel(currentVisit.visit_type)} visit · {billTypeLabel(currentVisit.bill_type)}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col items-end gap-1.5">
              <span
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-[0.08em] ${
                  allergies.length
                    ? "bg-red-600 text-white"
                    : "border border-red-200 bg-red-50 text-red-700"
                }`}
              >
                <AlertTriangle size={14} />
                Allergies {allergies.length ? `· ${allergies.length}` : "· None recorded"}
              </span>
              {allergies.length > 0 && (
                <p className="max-w-[260px] text-right text-[11px] leading-snug text-red-700">
                  {allergies.map((allergy) => allergy.substance).join(", ")}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 overflow-x-auto px-3 pt-2 sm:px-4">
          {TIMELINE_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setTab(filter.value)}
              className={`-mb-px shrink-0 border-b-2 px-2.5 py-2 text-[12px] font-semibold transition-colors ${
                tab === filter.value
                  ? "border-forest-700 text-forest-800"
                  : "border-transparent text-ink-muted hover:text-ink"
              }`}
            >
              {filter.label}
              <span className="ml-1 text-[10.5px] text-ink-muted">{tabCounts[filter.value]}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_280px]">
        {/* Timeline */}
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5 sm:px-5">
            <h2 className="text-[13px] font-bold tracking-tight text-ink">Clinical timeline</h2>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-[11px] text-ink-muted">
                <Clock size={12} />
                <select
                  className="rounded-lg border border-line bg-white px-2 py-1 text-[11px] text-ink-soft focus:outline-none"
                  value={scope}
                  onChange={(event) => setScope(event.target.value)}
                  aria-label="Timeline scope"
                >
                  <option value="visit">This visit</option>
                  <option value="all">All visits</option>
                </select>
              </label>
            </div>
          </div>
          <Timeline entries={entries} emptyHint={EMPTY_HINTS[tab] || EMPTY_HINTS.all} />
        </section>

        {/* Right-hand menu */}
        <aside className="space-y-4">
          <section className="card p-4">
            <h2 className="text-[13px] font-bold tracking-tight text-ink">Record</h2>
            <p className="mt-0.5 text-[11px] text-ink-muted">
              {currentVisit ? `Visit · ${currentVisit.clinic?.name || "Clinic"}` : "No active visit"}
            </p>
            {visibleActions.length ? (
              <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-1">
                {visibleActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.key}
                      type="button"
                      onClick={() => setModal(action.key)}
                      className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2 text-left transition-colors hover:border-forest-200 hover:bg-forest-50/60"
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-forest-50 text-forest-700">
                        <Icon size={15} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[12px] font-semibold text-ink">{action.label}</span>
                        <span className="block truncate text-[10.5px] text-ink-muted">{action.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-canvas px-2.5 py-2 text-[11px] leading-relaxed text-ink-soft">
                <ShieldCheck size={14} className="mt-0.5 shrink-0 text-forest-600" />
                Read-only clinical view for your role. Records officers and front desk can open the record but not add
                clinical entries.
              </p>
            )}
          </section>

          <section className="card p-4">
            <h2 className="text-[13px] font-bold tracking-tight text-ink">Visit details</h2>
            {currentVisit ? (
              <>
                <div className="mt-2 flex items-center gap-1.5">
                  <span
                    className={`chip px-2 py-0.5 ${
                      currentVisit.status === "pending" ? "bg-amber-50 text-amber-700" : "bg-forest-50 text-forest-700"
                    }`}
                  >
                    {currentVisit.status === "pending" ? "Pending" : "Attended"}
                  </span>
                  <span className="chip bg-canvas px-2 py-0.5 text-ink-soft">{channelLabel(currentVisit.channel)}</span>
                </div>
                <dl className="mt-2 divide-y divide-line">
                  <DetailRow label="Clinic" value={currentVisit.clinic?.name} />
                  <DetailRow label="Visit type" value={visitTypeLabel(currentVisit.visit_type)} />
                  <DetailRow label="Bill type" value={billTypeLabel(currentVisit.bill_type)} />
                  <DetailRow label="Doctor" value={currentVisit.assigned_doctor_name || "Unassigned"} />
                  <DetailRow label="Checked in" value={formatDateTime(currentVisit.checked_in_at)} />
                  <DetailRow label="Checked in by" value={currentVisit.checked_in_by_name} />
                  {currentVisit.attended_at && (
                    <DetailRow label="Attended" value={formatDateTime(currentVisit.attended_at)} />
                  )}
                </dl>
                {currentVisit.chief_complaint && (
                  <p className="mt-2 rounded-lg bg-canvas p-2 text-[11.5px] leading-relaxed text-ink-soft">
                    <span className="font-semibold text-ink">Complaint:</span> {currentVisit.chief_complaint}
                  </p>
                )}
                {data.visits.length > 1 && (
                  <label className="mt-3 block">
                    <span className="label">Viewing visit</span>
                    <select
                      className="input mt-1 py-1.5 text-[12px]"
                      value={currentVisit.id}
                      onChange={(event) => setSearchParams({ visit: event.target.value })}
                    >
                      {data.visits.map((visit) => (
                        <option key={visit.id} value={visit.id}>
                          {formatDate(visit.checked_in_at, { day: "2-digit", month: "short", year: "numeric" })} ·{" "}
                          {visit.clinic?.name || "Clinic"} · {visit.status}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            ) : (
              <p className="mt-2 text-[11.5px] leading-relaxed text-ink-muted">
                This patient has not been checked in yet. Use “Check in new visit” to add them to today's worklist.
              </p>
            )}
          </section>

          <section className="card p-4">
            <h2 className="text-[13px] font-bold tracking-tight text-ink">Patient details</h2>
            <dl className="mt-2 divide-y divide-line">
              <DetailRow label="Date of birth" value={formatDate(patient.date_of_birth, { day: "numeric", month: "short", year: "numeric" })} />
              <DetailRow label="Sex" value={patient.sex_label} />
              <DetailRow label="Card number" value={patient.card_number} />
              <DetailRow label="Blood group" value={patient.blood_group} />
              <DetailRow label="Genotype" value={patient.genotype} />
              <DetailRow label="NHIS No." value={patient.nhis_no} />
              <DetailRow label="Next of kin" value={patient.next_of_kin} />
              <DetailRow label="Next of kin phone" value={patient.next_of_kin_phone} />
              <DetailRow label="Occupation" value={patient.occupation} />
              <DetailRow label="Marital status" value={patient.marital_status} />
              <DetailRow label="Registered" value={formatDate(patient.created_at, { day: "numeric", month: "short", year: "numeric" })} />
            </dl>
            {patient.phone && (
              <a
                href={`tel:${patient.phone.replace(/\s+/g, "")}`}
                className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-forest-700 hover:text-forest-900"
              >
                <Phone size={13} />
                {patient.phone}
              </a>
            )}
            {allergies.length > 0 && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5">
                <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-red-700">
                  <AlertTriangle size={12} />
                  Allergies
                </p>
                <ul className="mt-1 space-y-1">
                  {allergies.map((allergy) => (
                    <li key={allergy.id} className="text-[11px] leading-relaxed text-red-800">
                      <span className="font-semibold">{allergy.substance}</span>
                      {allergy.reaction ? ` — ${allergy.reaction}` : ""} ({allergy.severity})
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </aside>
      </div>

      {ModalComponent && (
        <ModalComponent
          open={Boolean(modal)}
          onClose={() => setModal(null)}
          patientId={patient.id}
          visitId={currentVisit?.id}
          onSaved={() =>
            saved(
              modal === "vitals"
                ? "Vital signs saved to the record."
                : modal === "note"
                  ? "Clinical note saved to the record."
                  : modal === "prescription"
                    ? "Prescription saved and sent to the pharmacy queue."
                    : modal === "lab"
                      ? "Lab request sent to the laboratory."
                      : modal === "allergy"
                        ? "Allergy saved. It now shows as a red warning on this record."
                        : "Diagnosis saved to the record.",
            )
          }
        />
      )}

      <CheckInModal
        open={checkInOpen}
        onClose={() => setCheckInOpen(false)}
        patientId={patient.id}
        defaultClinicId={data.visits?.[0]?.clinic?.id || patient.clinic?.id}
        doctorId={staff?.role === "doctor" ? staff.id : undefined}
        onSaved={(visit) => {
          setCheckInOpen(false);
          setNotice("Patient checked in. They now appear on the worklist.");
          setSearchParams({ visit: visit.id });
        }}
      />
    </div>
  );
}
