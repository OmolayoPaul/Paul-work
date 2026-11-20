import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  FileText,
  FlaskConical,
  Loader2,
  Pill,
  RefreshCw,
  Stethoscope,
  UserRound,
} from "lucide-react";

import ClinicalNoteModal from "../components/patients/ClinicalNoteModal";
import DiagnosisModal from "../components/patients/DiagnosisModal";
import LabRequestModal from "../components/patients/LabRequestModal";
import PrescriptionModal from "../components/patients/PrescriptionModal";
import VitalsModal from "../components/patients/VitalsModal";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  billTypeLabel,
  canAttend,
  canPrescribe,
  canWriteClinical,
  channelLabel,
  NOTE_TYPES,
} from "../lib/clinical";
import { formatDateTime, relativeTime } from "../lib/format";

const STATUS_TABS = [
  { value: "pending", label: "Waiting" },
  { value: "attended", label: "Completed today" },
];

const MODALS = {
  vitals: VitalsModal,
  note: ClinicalNoteModal,
  diagnosis: DiagnosisModal,
  prescription: PrescriptionModal,
  lab: LabRequestModal,
};

const VITAL_FIELDS = [
  { key: "temperature", label: "Temp", unit: "°C" },
  { key: "systolic", label: "Systolic", unit: "mmHg" },
  { key: "diastolic", label: "Diastolic", unit: "mmHg" },
  { key: "pulse", label: "Pulse", unit: "bpm" },
  { key: "spo2", label: "SpO₂", unit: "%" },
  { key: "weight", label: "Weight", unit: "kg" },
];

function VitalValue({ field, vitals }) {
  const value = vitals?.[field.key];
  return (
    <div className="rounded-xl bg-canvas px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{field.label}</p>
      <p className="mt-1 text-[13px] font-semibold text-ink">
        {value === null || value === undefined || value === "" ? "—" : `${value} `}
        <span className="text-[10.5px] font-medium text-ink-muted">{value === null || value === undefined || value === "" ? "" : field.unit}</span>
      </p>
    </div>
  );
}

export default function Consultations() {
  const { staff } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState("pending");
  const [channel, setChannel] = useState("hospital");
  const [data, setData] = useState({ items: [], counts: { pending: 0, attended: 0 } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [selectedVisitId, setSelectedVisitId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [modal, setModal] = useState(null);
  const [attending, setAttending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.get(`/worklist?status=${status}&channel=${channel}&visits_on=today`);
      setData(result || { items: [], counts: { pending: 0, attended: 0 } });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [status, channel, revision]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = data.items.find((item) => item.id === selectedVisitId) || null;

  useEffect(() => {
    if (data.items.length === 0) {
      setSelectedVisitId(null);
      return;
    }
    if (!data.items.some((item) => item.id === selectedVisitId)) {
      setSelectedVisitId(data.items[0].id);
    }
  }, [data, selectedVisitId]);

  const loadDetail = useCallback(async (visit) => {
    if (!visit) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    setDetailError("");
    try {
      const result = await api.get(`/patients/${visit.patient.id}?visit=${visit.id}`, { silent: true });
      setDetail(result);
    } catch (err) {
      setDetail(null);
      setDetailError(err.message);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDetail(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const attend = async () => {
    if (!selected || attending) return;
    setAttending(true);
    setError("");
    try {
      await api.patch(`/worklist/${selected.id}/attend`);
      setNotice(
        `${selected.patient.full_name} was marked as attended. The record stays in Completed today.`,
      );
      setRevision((value) => value + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setAttending(false);
    }
  };

  const afterSave = (message) => {
    setModal(null);
    setNotice(message);
    loadDetail(selected);
    setRevision((value) => value + 1);
  };

  const patient = detail?.patient || null;
  const visit = detail?.current_visit || selected;
  const allergies = detail?.allergies || [];
  const vitals = detail?.vitals?.[0] || null;
  const notes = detail?.notes || [];

  const clinicalWrites = canWriteClinical(staff?.role);
  const prescriber = canPrescribe(staff?.role);
  const mayAttend = canAttend(staff?.role) && visit?.status === "pending";

  const actions = [
    clinicalWrites && { key: "vitals", label: "Vitals", icon: Activity },
    clinicalWrites && { key: "note", label: "Clinical note", icon: FileText },
    prescriber && { key: "diagnosis", label: "Diagnosis", icon: ClipboardList },
    prescriber && { key: "prescription", label: "Prescription", icon: Pill },
    prescriber && { key: "lab", label: "Lab request", icon: FlaskConical },
  ].filter(Boolean);

  const ActiveModal = modal ? MODALS[modal] : null;

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-forest-600">
            Clinical care
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-[28px]">Consultations</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Work through today's queue. Pick a patient on the left, review their vitals and history, then
            record notes, diagnoses and orders without leaving the consultation.
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary shrink-0 self-start sm:self-auto"
          onClick={() => setRevision((value) => value + 1)}
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </header>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
        </div>
      )}

      {notice && (
        <div className="flex items-start gap-2.5 rounded-xl border border-forest-200 bg-forest-50 px-4 py-3 text-[13px] text-forest-800">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{notice}</span>
          <button
            type="button"
            className="rounded-md p-0.5 text-forest-700 hover:bg-white/60"
            onClick={() => setNotice("")}
            aria-label="Dismiss message"
          >
            <AlertCircle size={15} className="rotate-45" />
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,330px)_minmax(0,1fr)]">
        <section className="card flex flex-col overflow-hidden">
          <div className="flex items-center gap-1 border-b border-line bg-canvas/50 px-3 pt-2">
            {Object.entries({ hospital: "Hospital", telemed: "Telemed" }).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setChannel(value)}
                className={`-mb-px border-b-2 px-3 py-2 text-[12.5px] font-semibold transition-colors ${
                  channel === value
                    ? "border-forest-700 text-forest-800"
                    : "border-transparent text-ink-muted hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 border-b border-line px-3 py-2">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setStatus(tab.value)}
                className={`rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors ${
                  status === tab.value
                    ? "bg-forest-50 text-forest-800"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                {tab.label}
                <span className="ml-1.5 text-[10.5px] text-ink-muted">{data.counts[tab.value] ?? 0}</span>
              </button>
            ))}
            {loading && <Loader2 size={14} className="ml-auto animate-spin text-ink-muted" />}
          </div>

          <div className="max-h-[60vh] flex-1 overflow-y-auto lg:max-h-[calc(100vh-320px)]">
            {data.items.map((item) => {
              const active = item.id === selectedVisitId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedVisitId(item.id)}
                  className={`flex w-full items-start gap-3 border-b border-line px-3.5 py-3 text-left transition-colors ${
                    active ? "bg-forest-50" : "hover:bg-canvas"
                  }`}
                  aria-current={active ? "true" : undefined}
                >
                  <span
                    className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[11px] font-bold ${
                      active ? "bg-forest-700 text-white" : "bg-canvas text-forest-700"
                    }`}
                  >
                    {item.patient.first_name?.[0]}
                    {item.patient.last_name?.[0]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-semibold text-ink">
                        {item.patient.full_name}
                      </span>
                      {item.patient.is_demo && (
                        <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700">
                          Demo
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-ink-muted">
                      {item.patient.patient_no} · {item.patient.age_display} · {item.clinic?.name || "—"}
                    </span>
                    <span className="mt-1 flex items-center gap-1 text-[10.5px] text-ink-muted">
                      <Clock size={11} />
                      {relativeTime(item.checked_in_at)}
                      {item.chief_complaint && (
                        <span className="truncate"> · {item.chief_complaint}</span>
                      )}
                    </span>
                  </span>
                  <ChevronRight size={15} className={active ? "mt-1 text-forest-700" : "mt-1 text-ink-muted"} />
                </button>
              );
            })}

            {!loading && data.items.length === 0 && (
              <div className="px-5 py-10 text-center">
                <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-forest-50 text-forest-700">
                  {status === "pending" ? <UserRound size={20} /> : <CheckCircle2 size={20} />}
                </span>
                <p className="mt-3 text-[13px] font-semibold text-ink">
                  {status === "pending" ? "No patients waiting" : "No consultations completed yet"}
                </p>
                <p className="mx-auto mt-1 max-w-[15rem] text-[11.5px] leading-relaxed text-ink-muted">
                  {status === "pending"
                    ? "Check-ins from the worklist appear here as soon as they arrive."
                    : "Patients move here once the consultation is marked attended."}
                </p>
              </div>
            )}
          </div>

          <div className="border-t border-line px-3.5 py-2 text-[11px] text-ink-muted">
            {data.items.length} {status === "pending" ? "waiting" : "completed"} · {channelLabel(channel)}
          </div>
        </section>

        <section className="card flex flex-col overflow-hidden">
          {detailLoading && !detail && (
            <div className="grid flex-1 place-items-center px-6 py-16 text-center">
              <Loader2 size={22} className="animate-spin text-forest-600" />
              <p className="mt-3 text-[12.5px] text-ink-muted">Opening the record…</p>
            </div>
          )}

          {!detailLoading && !selected && (
            <div className="grid flex-1 place-items-center px-6 py-16 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-forest-50 text-forest-700">
                <Stethoscope size={22} />
              </span>
              <p className="mt-3 text-sm font-semibold text-ink">Select a patient to start</p>
              <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-ink-muted">
                The consultation opens with the patient's complaint, latest vitals and recent notes, plus the
                actions you are allowed to record.
              </p>
            </div>
          )}

          {detailError && (
            <div className="m-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span className="flex-1">{detailError}</span>
              <button type="button" className="font-semibold underline" onClick={() => loadDetail(selected)}>
                Retry
              </button>
            </div>
          )}

          {patient && visit && (
            <>
              <div className="border-b border-line px-4 py-3.5 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold tracking-tight text-ink">{patient.full_name}</h2>
                      {patient.is_demo && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-amber-700">
                          Demo
                        </span>
                      )}
                      <span
                        className={`chip px-2 py-0.5 ${
                          visit.status === "pending"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-forest-50 text-forest-700"
                        }`}
                      >
                        {visit.status === "pending" ? "Waiting" : "Attended"}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] text-ink-muted">
                      {patient.patient_no} · {patient.sex_label} · {patient.age_display} ·{" "}
                      {visit.clinic?.name || "No clinic"} · {channelLabel(visit.channel)} ·{" "}
                      {billTypeLabel(visit.bill_type)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {mayAttend && (
                      <button type="button" className="btn-primary" onClick={attend} disabled={attending}>
                        {attending ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                        Mark attended
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => navigate(`/patients/${patient.id}?visit=${visit.id}`)}
                    >
                      Full record
                      <ChevronRight size={15} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5 lg:max-h-[calc(100vh-320px)]">
                {allergies.length > 0 && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
                    <div className="text-[12.5px] text-amber-900">
                      <p className="font-semibold">Allergies</p>
                      <p className="mt-0.5">
                        {allergies
                          .map((allergy) =>
                            [allergy.substance, allergy.reaction].filter(Boolean).join(" — "),
                          )
                          .join("; ")}
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                      Chief complaint
                    </h3>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-ink">
                      {visit.chief_complaint || "No complaint recorded at check-in."}
                    </p>
                    <p className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-muted">
                      <Clock size={11} />
                      Checked in {formatDateTime(visit.checked_in_at)}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                      Latest vitals
                    </h3>
                    {vitals ? (
                      <>
                        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                          {VITAL_FIELDS.map((field) => (
                            <VitalValue key={field.key} field={field} vitals={vitals} />
                          ))}
                        </div>
                        <p className="mt-2 text-[11px] text-ink-muted">
                          {vitals.recorded_by_name || "Recorded"} · {relativeTime(vitals.recorded_at)}
                        </p>
                      </>
                    ) : (
                      <p className="mt-1.5 text-[12.5px] text-ink-muted">
                        No vitals recorded for this patient yet.
                      </p>
                    )}
                  </div>
                </div>

                {actions.length > 0 && (
                  <div>
                    <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                      Record
                    </h3>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {actions.map((action) => (
                        <button
                          key={action.key}
                          type="button"
                          className="btn-secondary px-3 py-2 text-[12.5px]"
                          onClick={() => setModal(action.key)}
                        >
                          <action.icon size={14} />
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                    Recent notes
                  </h3>
                  {notes.length === 0 ? (
                    <p className="mt-1.5 text-[12.5px] text-ink-muted">
                      No clinical notes on this record yet.
                    </p>
                  ) : (
                    <ul className="mt-1.5 space-y-2">
                      {notes.slice(0, 3).map((note) => (
                        <li key={note.id} className="rounded-xl border border-line px-3.5 py-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[11.5px] font-semibold text-forest-800">
                              {NOTE_TYPES[note.note_type] || note.note_type}
                            </p>
                            <p className="text-[10.5px] text-ink-muted">{relativeTime(note.created_at)}</p>
                          </div>
                          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">
                            {note.assessment || note.subjective || note.plan || "No text recorded."}
                          </p>
                          <p className="mt-1 text-[10.5px] text-ink-muted">{note.author_name}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {ActiveModal && selected && (
        <ActiveModal
          open
          onClose={() => setModal(null)}
          patientId={selected.patient.id}
          visitId={selected.id}
          onSaved={() => afterSave("Saved to the patient's record.")}
        />
      )}
    </div>
  );
}
