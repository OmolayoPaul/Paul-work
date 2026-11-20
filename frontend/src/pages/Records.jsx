import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ChevronRight,
  FolderOpen,
  Loader2,
  RefreshCw,
  Search,
  Stethoscope,
  UserPlus,
  X,
} from "lucide-react";

import StatCard from "../components/StatCard";
import { api } from "../lib/api";
import { formatDate, formatDateTime } from "../lib/format";

const SORTS = [
  { value: "recent", label: "Recent activity" },
  { value: "registered", label: "Newest file" },
  { value: "name", label: "Name A–Z" },
];

function visitStatus(status) {
  if (status === "pending") return { label: "Waiting", className: "bg-amber-50 text-amber-700" };
  if (status === "attended") return { label: "Attended", className: "bg-forest-50 text-forest-700" };
  return { label: "No visit", className: "bg-canvas text-ink-muted" };
}

function timeOf(value) {
  if (!value) return 0;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

export default function Records() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [clinicId, setClinicId] = useState("all");
  const [sort, setSort] = useState("recent");
  const [patients, setPatients] = useState([]);
  const [clinics, setClinics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ limit: "300" });
    if (search.trim()) params.set("search", search.trim());
    try {
      const data = await api.get(`/patients?${params.toString()}`);
      setPatients(data?.items || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, revision]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  useEffect(() => {
    api
      .get("/reference", { silent: true })
      .then((data) => setClinics(data?.clinics || []))
      .catch(() => {});
  }, []);

  const rows = useMemo(() => {
    const filtered =
      clinicId === "all"
        ? patients
        : patients.filter((patient) => patient.clinic?.id === clinicId);

    return [...filtered].sort((a, b) => {
      if (sort === "name") return a.full_name.localeCompare(b.full_name);
      if (sort === "registered") return timeOf(b.created_at) - timeOf(a.created_at);
      return timeOf(b.last_visit_at) - timeOf(a.last_visit_at);
    });
  }, [patients, clinicId, sort]);

  const now = new Date();
  const seenToday = rows.filter(
    (patient) =>
      patient.last_visit_at && new Date(patient.last_visit_at).toDateString() === now.toDateString(),
  ).length;
  const registeredThisMonth = rows.filter((patient) => {
    const created = new Date(patient.created_at);
    return (
      !Number.isNaN(created.getTime()) &&
      created.getMonth() === now.getMonth() &&
      created.getFullYear() === now.getFullYear()
    );
  }).length;

  const openFile = (patient) => navigate(`/patients/${patient.id}`);
  const filtersActive = Boolean(search.trim() || clinicId !== "all");

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-forest-600">
            Health records
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-[28px]">Records</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
            The records desk: every patient file with its clinic, registration date and latest visit. Open a
            file to review the full history and timeline.
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

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard icon={FolderOpen} label="Files in view" value={rows.length} hint="Patients matching this view" />
        <StatCard
          icon={UserPlus}
          label="Registered this month"
          value={registeredThisMonth}
          hint={formatDate(now, { month: "long", year: "numeric" })}
          tone="accent"
        />
        <StatCard icon={Stethoscope} label="Seen today" value={seenToday} hint="Files with a visit today" tone="amber" />
      </div>

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700"
        >
          <AlertCircle size={16} className="shrink-0" />
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
        <div className="flex flex-col gap-3 border-b border-line px-3 py-3 sm:flex-row sm:items-center sm:px-4">
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              className="input pl-9"
              placeholder="Search card number, name, NHIS number or phone"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search patient files"
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              className="input sm:w-44"
              value={clinicId}
              onChange={(event) => setClinicId(event.target.value)}
              aria-label="Filter by clinic"
            >
              <option value="all">All clinics</option>
              {clinics.map((clinic) => (
                <option key={clinic.id} value={clinic.id}>
                  {clinic.name}
                </option>
              ))}
            </select>
            <select
              className="input sm:w-44"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              aria-label="Sort files"
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {loading && <Loader2 size={15} className="animate-spin text-ink-muted" />}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-[12.5px]">
            <thead className="bg-canvas/70 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5">Patient No.</th>
                <th scope="col" className="px-4 py-2.5">Patient</th>
                <th scope="col" className="px-4 py-2.5">Sex / Age</th>
                <th scope="col" className="px-4 py-2.5">Clinic</th>
                <th scope="col" className="px-4 py-2.5">Last visit</th>
                <th scope="col" className="px-4 py-2.5">Registered</th>
                <th scope="col" className="px-2 py-2.5">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((patient) => {
                const status = visitStatus(patient.last_visit_status);
                return (
                  <tr
                    key={patient.id}
                    tabIndex={0}
                    role="button"
                    onClick={() => openFile(patient)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openFile(patient);
                      }
                    }}
                    className="cursor-pointer transition-colors hover:bg-forest-50/50 focus:bg-forest-50/60 focus:outline-none"
                    aria-label={`Open the record for ${patient.full_name}`}
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-[11.5px] font-medium text-forest-800">
                      {patient.patient_no}
                      {patient.is_demo && (
                        <span className="ml-1.5 rounded-full bg-amber-50 px-1.5 py-0.5 font-sans text-[9.5px] font-semibold uppercase tracking-wide text-amber-700">
                          Demo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold text-ink">{patient.full_name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-soft">
                      {patient.sex_label} · {patient.age_display}
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{patient.clinic?.name || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-ink-soft">
                          {patient.last_visit_at
                            ? formatDate(patient.last_visit_at, { day: "2-digit", month: "short", year: "numeric" })
                            : "—"}
                        </span>
                        <span className={`chip px-2 py-0.5 ${status.className}`}>{status.label}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-soft">
                      {formatDateTime(patient.created_at)}
                    </td>
                    <td className="px-2 py-3 text-ink-muted">
                      <ChevronRight size={16} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!loading && rows.length === 0 && (
          <div className="px-6 py-12 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-forest-50 text-forest-700">
              <FolderOpen size={22} />
            </span>
            <p className="mt-3 text-sm font-semibold text-ink">
              {filtersActive ? "No file matches this view" : "No patient files yet"}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-[12.5px] leading-relaxed text-ink-muted">
              {filtersActive
                ? "Try a different card number, name, clinic or sort order."
                : "Files appear here as soon as a patient is registered at the front desk."}
            </p>
            {filtersActive && (
              <button
                type="button"
                className="btn-secondary mt-4"
                onClick={() => {
                  setSearch("");
                  setClinicId("all");
                  setSort("recent");
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-[11px] text-ink-muted">
          <span>
            {loading && rows.length === 0 ? "Loading patient files…" : `${rows.length} file${rows.length === 1 ? "" : "s"} shown`}
          </span>
          <span>Up to 300 most recent registrations are searched</span>
        </div>
      </section>
    </div>
  );
}
