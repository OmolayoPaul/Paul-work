import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  BarChart3,
  CalendarClock,
  Download,
  FlaskConical,
  Loader2,
  RefreshCw,
  Stethoscope,
  Users,
} from "lucide-react";

import StatCard from "../components/StatCard";
import { api, downloadFile } from "../lib/api";
import { formatDate } from "../lib/format";

const PERIODS = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
];

const REPORTS = {
  perDay: { path: "patients-per-day", label: "Patients seen per day", file: "patients-seen-per-day" },
  perClinic: { path: "patients-per-clinic", label: "Patients per clinic", file: "patients-per-clinic" },
  diagnoses: { path: "top-diagnoses", label: "Top diagnoses", file: "top-diagnoses" },
};

function BarRow({ label, value, max, tone = "forest" }) {
  const width = max > 0 ? Math.max((value / max) * 100, value > 0 ? 4 : 0) : 0;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-28 shrink-0 truncate text-[11.5px] text-ink-soft" title={label}>
        {label}
      </span>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-canvas">
        <span
          className={`block h-full rounded-full ${tone === "amber" ? "bg-amber-400" : "bg-forest-500"}`}
          style={{ width: `${width}%` }}
        />
      </span>
      <span className="w-10 shrink-0 text-right text-[11.5px] font-semibold tabular-nums text-ink">{value}</span>
    </div>
  );
}

function ReportCard({ title, hint, count, onDownload, downloading, empty, emptyText, children }) {
  return (
    <section className="card flex flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-[13px] font-bold tracking-tight text-ink">{title}</h2>
          <p className="mt-0.5 text-[11px] text-ink-muted">{hint}</p>
        </div>
        <button
          type="button"
          className="btn-secondary shrink-0 px-2.5 py-1.5 text-[11.5px]"
          onClick={onDownload}
          disabled={Boolean(downloading)}
        >
          {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          CSV
        </button>
      </div>
      <div className="flex-1 px-4 py-3 sm:px-5">
        {empty ? (
          <div className="grid place-items-center py-8 text-center">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-forest-50 text-forest-700">
              <BarChart3 size={18} />
            </span>
            <p className="mt-2.5 text-[12.5px] font-semibold text-ink">{emptyText}</p>
            <p className="mt-1 max-w-xs text-[11px] leading-relaxed text-ink-muted">
              The export still works — it downloads the column headings with no rows.
            </p>
          </div>
        ) : (
          children
        )}
      </div>
      <div className="border-t border-line px-4 py-2 text-[11px] text-ink-muted sm:px-5">
        {count} row{count === 1 ? "" : "s"}
      </div>
    </section>
  );
}

export default function Reports() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [revision, setRevision] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.get(`/reports/summary?days=${days}`);
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [days, revision]);

  useEffect(() => {
    load();
  }, [load]);

  const download = async (report) => {
    setDownloading(report.path);
    setDownloadError("");
    try {
      await downloadFile(
        `/reports/export/${report.path}?days=${days}`,
        `${report.file}-${days}d.csv`,
      );
    } catch (err) {
      setDownloadError(err.message);
    } finally {
      setDownloading("");
    }
  };

  const totals = data?.totals || {};
  const perDay = data?.patients_per_day || [];
  const perClinic = data?.patients_per_clinic || [];
  const diagnoses = data?.top_diagnoses || [];
  const maxDay = Math.max(0, ...perDay.map((row) => row.count));
  const maxClinic = Math.max(0, ...perClinic.map((row) => row.count));
  const maxDiagnosis = Math.max(0, ...diagnoses.map((row) => row.count));
  const noActivity = (totals.patients_seen || 0) === 0;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-forest-600">Insights</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-[28px]">Reports</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Operational reports built from the clinical records: who was seen, where, and what they were
            diagnosed with.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label className="sr-only" htmlFor="report-period">
            Report period
          </label>
          <select
            id="report-period"
            className="input w-auto py-2 text-[12.5px]"
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
          >
            {PERIODS.map((period) => (
              <option key={period.value} value={period.value}>
                {period.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn-secondary" onClick={() => setRevision((value) => value + 1)}>
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700"
        >
          <span className="flex-1">Reports could not be loaded. {error}</span>
          <button type="button" className="btn-secondary px-3 py-1.5 text-[12px]" onClick={() => setRevision((v) => v + 1)}>
            Retry
          </button>
        </div>
      )}

      {downloadError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800"
        >
          <span>{downloadError}</span>
          <button type="button" className="btn-ghost px-2 py-1 text-[12px]" onClick={() => setDownloadError("")}>
            Dismiss
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Stethoscope}
          label="Patients seen"
          value={loading && !data ? "—" : totals.patients_seen ?? 0}
          hint="Attended consultations in the period"
        />
        <StatCard
          icon={Users}
          label="New registrations"
          value={loading && !data ? "—" : totals.patients_registered ?? 0}
          hint="Patient records created"
          tone="accent"
        />
        <StatCard
          icon={FlaskConical}
          label="Clinics reporting"
          value={loading && !data ? "—" : totals.clinics_reporting ?? 0}
          hint="Clinics with attended visits"
          tone="slate"
        />
        <StatCard
          icon={Activity}
          label="Diagnoses recorded"
          value={loading && !data ? "—" : totals.diagnoses_recorded ?? 0}
          hint="Across all clinics"
          tone="amber"
        />
      </div>

      {loading && !data ? (
        <div className="card grid place-items-center py-16">
          <Loader2 size={22} className="animate-spin text-forest-600" />
          <p className="mt-3 text-[12px] text-ink-muted">Building the reports…</p>
        </div>
      ) : (
        <>
          {noActivity && !error && (
            <p className="rounded-xl border border-line bg-white px-4 py-3 text-[12.5px] text-ink-soft">
              No patients were seen in this period yet. The figures below stay at zero, and each CSV
              downloads with its headings ready for your records.
            </p>
          )}

          <div className="grid gap-4 xl:grid-cols-2">
            <ReportCard
              title={REPORTS.perDay.label}
              hint={`${data?.from ? formatDate(data.from, { day: "numeric", month: "short", year: "numeric" }) : "—"} to ${
                data?.to ? formatDate(data.to, { day: "numeric", month: "short", year: "numeric" }) : "—"
              }`}
              count={perDay.length}
              onDownload={() => download(REPORTS.perDay)}
              downloading={downloading === REPORTS.perDay.path}
              empty={false}
            >
              <div className="max-h-[320px] overflow-y-auto pr-1">
                {perDay.map((row) => (
                  <BarRow
                    key={row.date}
                    label={formatDate(row.date, { weekday: "short", day: "numeric", month: "short" })}
                    value={row.count}
                    max={maxDay}
                  />
                ))}
              </div>
            </ReportCard>

            <div className="grid gap-4">
              <ReportCard
                title={REPORTS.perClinic.label}
                hint="Attended visits grouped by clinic"
                count={perClinic.length}
                onDownload={() => download(REPORTS.perClinic)}
                downloading={downloading === REPORTS.perClinic.path}
                empty={perClinic.length === 0}
                emptyText="No clinic activity in this period"
              >
                {perClinic.map((row) => (
                  <BarRow key={row.clinic} label={row.clinic} value={row.count} max={maxClinic} />
                ))}
              </ReportCard>

              <ReportCard
                title={REPORTS.diagnoses.label}
                hint="Most recorded diagnoses in the period"
                count={diagnoses.length}
                onDownload={() => download(REPORTS.diagnoses)}
                downloading={downloading === REPORTS.diagnoses.path}
                empty={diagnoses.length === 0}
                emptyText="No diagnoses recorded in this period"
              >
                {diagnoses.map((row) => (
                  <BarRow
                    key={row.description}
                    label={row.description}
                    value={row.count}
                    max={maxDiagnosis}
                    tone="amber"
                  />
                ))}
              </ReportCard>
            </div>
          </div>

          <p className="flex items-center gap-1.5 text-[11px] text-ink-muted">
            <CalendarClock size={12} />
            {data?.generated_at ? `Generated ${formatDate(data.generated_at, {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}` : ""}
            {data?.days ? ` · ${data.days}-day window` : ""}
          </p>
        </>
      )}
    </div>
  );
}
