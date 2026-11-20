import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Loader2,
  RefreshCw,
  Search,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import PatientFormModal from "../components/patients/PatientFormModal";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { billTypeLabel, canRegister, CHANNELS } from "../lib/clinical";
import { formatDate, formatDateTime } from "../lib/format";

function checkInTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })
    : formatDateTime(value);
}

export default function Worklist() {
  const { staff } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState("pending");
  const [channel, setChannel] = useState("hospital");
  const [search, setSearch] = useState("");
  const [data, setData] = useState({ items: [], counts: { pending: 0, attended: 0 } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [registerOpen, setRegisterOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ status, channel });
    if (search.trim()) params.set("search", search.trim());
    try {
      const result = await api.get(`/worklist?${params.toString()}`);
      setData(result || { items: [], counts: { pending: 0, attended: 0 } });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [status, channel, search, revision]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const onRegistered = (result) => {
    setRegisterOpen(false);
    const name = `${result.patient.first_name} ${result.patient.last_name}`;
    setNotice(
      result.visit
        ? `${name} (${result.patient.patient_no}) was registered and checked in to ${
            result.visit.clinic?.name || "the clinic"
          }.`
        : `${name} (${result.patient.patient_no}) was registered.`,
    );
    setStatus("pending");
    setRevision((value) => value + 1);
  };

  const openRecord = (row) => {
    navigate(`/patients/${row.patient.id}?visit=${row.id}`);
  };

  const registrationAllowed = canRegister(staff?.role);
  const rows = data.items || [];
  const counts = data.counts || { pending: 0, attended: 0 };

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-forest-600">
            Clinical consultation
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-[28px]">Worklist</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Checked-in patients waiting to be seen. Open a row to work in the patient's medical record.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" className="btn-secondary" onClick={() => setRevision((value) => value + 1)}>
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
          {registrationAllowed && (
            <button type="button" className="btn-primary" onClick={() => setRegisterOpen(true)}>
              <UserPlus size={16} />
              Register patient
            </button>
          )}
        </div>
      </header>

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
            <X size={15} />
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            type="button"
            className="rounded-md p-0.5 hover:bg-white/60"
            onClick={() => setError("")}
            aria-label="Dismiss error"
          >
            <X size={15} />
          </button>
        </div>
      )}

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-1 border-b border-line bg-canvas/50 px-3 pt-2 sm:px-4">
          {Object.entries(CHANNELS).map(([value, label]) => (
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
          <span className="ml-auto hidden items-center gap-1.5 py-2 text-[11px] text-ink-muted sm:flex">
            <Clock size={12} />
            {formatDate(new Date(), { day: "numeric", month: "short", year: "numeric" })}
          </span>
        </div>

        <div className="flex flex-col gap-3 border-b border-line px-3 py-3 sm:flex-row sm:items-center sm:px-4">
          <div className="inline-flex rounded-xl border border-line bg-canvas p-0.5">
            {[
              { value: "pending", label: "Pending", count: counts.pending },
              { value: "attended", label: "Attended To", count: counts.attended },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setStatus(option.value)}
                className={`rounded-[10px] px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                  status === option.value
                    ? "bg-white text-forest-800 shadow-sm"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                {option.label}
                <span
                  className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10.5px] ${
                    status === option.value ? "bg-forest-50 text-forest-700" : "bg-white/70 text-ink-muted"
                  }`}
                >
                  {option.count}
                </span>
              </button>
            ))}
          </div>

          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              className="input pl-9"
              placeholder="Search card number, patient name or NHIS number"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search worklist"
            />
          </div>
          {loading && <Loader2 size={15} className="hidden animate-spin text-ink-muted sm:block" />}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-[12.5px]">
            <thead className="bg-canvas/70 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5">Patient No.</th>
                <th scope="col" className="px-4 py-2.5">Last name</th>
                <th scope="col" className="px-4 py-2.5">First name</th>
                <th scope="col" className="px-4 py-2.5">Clinic</th>
                <th scope="col" className="px-4 py-2.5">Bill type</th>
                <th scope="col" className="px-4 py-2.5">Assigned doctor</th>
                <th scope="col" className="px-4 py-2.5">Check-in time</th>
                <th scope="col" className="px-2 py-2.5"><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr
                  key={row.id}
                  tabIndex={0}
                  role="button"
                  onClick={() => openRecord(row)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openRecord(row);
                    }
                  }}
                  className="cursor-pointer transition-colors hover:bg-forest-50/50 focus:bg-forest-50/60 focus:outline-none"
                  aria-label={`Open ${row.patient.first_name} ${row.patient.last_name}'s record`}
                >
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-[11.5px] font-medium text-forest-800">
                    {row.patient.patient_no}
                  </td>
                  <td className="px-4 py-3 font-semibold text-ink">{row.patient.last_name}</td>
                  <td className="px-4 py-3 text-ink-soft">{row.patient.first_name}</td>
                  <td className="px-4 py-3 text-ink-soft">{row.clinic?.name || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`chip px-2 py-0.5 ${row.bill_type === "insurance" ? "bg-sky-50 text-sky-700" : "bg-canvas text-ink-soft"}`}>
                      {billTypeLabel(row.bill_type)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{row.assigned_doctor_name || "Unassigned"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-soft">{checkInTime(row.checked_in_at)}</td>
                  <td className="px-2 py-3 text-ink-muted"><ChevronRight size={16} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && rows.length === 0 && (
          <div className="px-6 py-12 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-forest-50 text-forest-700">
              {status === "pending" ? <Users size={22} /> : <CheckCircle2 size={22} />}
            </span>
            <p className="mt-3 text-sm font-semibold text-ink">
              {search
                ? "No patient matches this search"
                : status === "pending"
                  ? "No patients waiting in this queue"
                  : "No patients attended yet"}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-[12.5px] leading-relaxed text-ink-muted">
              {search
                ? "Try a card number, name or NHIS number."
                : status === "pending"
                  ? "New check-ins appear here as soon as records or nursing add them."
                  : "Attended patients move here when a doctor marks the consultation complete."}
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-[11px] text-ink-muted">
          <span>
            {loading && rows.length === 0
              ? "Loading worklist…"
              : `${rows.length} ${status === "pending" ? "waiting" : "attended"} · ${CHANNELS[channel]}`}
          </span>
          <span>Pending {counts.pending} · Attended {counts.attended}</span>
        </div>
      </section>

      <PatientFormModal
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        onSaved={onRegistered}
      />
    </div>
  );
}
