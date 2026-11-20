import { useCallback, useEffect, useState } from "react";
import { AlertCircle, BarChart3, Building2, Download, Loader2, RefreshCw, Stethoscope, Users } from "lucide-react";

import StatCard from "../components/StatCard";
import { api } from "../lib/api";

const RANGES = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
];

function downloadCsv(kind, days) {
  return fetch(`/api/reports/export.csv?kind=${kind}&days=${days}`, { credentials: "include" }).then(
    async (response) => {
      if (!response.ok) throw new Error("The export could not be downloaded.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${kind}-${days}d.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    },
  );
}

export default function Reports() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState("");

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
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const exportReport = async (kind) => {
    setExporting(kind);
    setError("");
    try {
      await downloadCsv(kind, days);
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting("");
    }
  };

  const perDay = data?.patients_per_day || [];
  const perClinic = data?.patients_per_clinic || [];
  const topDiagnoses = data?.top_diagnoses || [];
  const peak = Math.max(1, ...perDay.map((row) => row.count));
  const totals = data?.totals || { patients_seen: 0, clinics: 0, diagnoses: 0 };

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-forest-600">Insights</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-[28px]">Reports</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
            How many patients were seen, which clinics they attended and what they were diagnosed with. Numbers come
            from the same records the clinical team writes.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <select
            className="input w-auto py-2 text-[12.5px]"
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            aria-label="Report period"
          >
            {RANGES.map((range) => (
              <option key={range.value} value={range.value}>{range.label}</option>
            ))}
          </select>
          <button type="button" className="btn-secondary py-2" onClick={load}>
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </header>

      {error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Users} label="Patients seen" value={totals.patients_seen} hint={RANGES.find((r) => r.value === days)?.label} />
        <StatCard icon={Building2} label="Clinics reporting" value={totals.clinics} hint="With at least one visit" tone="slate" />
        <StatCard icon={Stethoscope} label="Diagnoses recorded" value={totals.diagnoses} hint="Across the top diagnoses" tone="accent" />
      </div>

      <section className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[14px] font-bold tracking-tight text-ink">Patients seen per day</h2>
            <p className="mt-0.5 text-[11.5px] text-ink-muted">Consultations marked attended, by day</p>
          </div>
          <button
            type="button"
            className="btn-secondary py-1.5 text-[12px]"
            onClick={() => exportReport("patients_per_day")}
            disabled={exporting === "patients_per_day"}
          >
            {exporting === "patients_per_day" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            CSV
          </button>
        </div>

        {loading && !data ? (
          <div className="grid place-items-center py-14">
            <Loader2 size={20} className="animate-spin text-forest-600" />
          </div>
        ) : perDay.every((row) => row.count === 0) ? (
          <p className="mt-4 rounded-xl bg-canvas px-4 py-10 text-center text-[12.5px] text-ink-muted">
            No attended consultations in this period yet.
          </p>
        ) : (
          <div className="mt-4">
            <div className="flex h-40 items-end gap-[3px]">
              {perDay.map((row) => (
                <div key={row.date} className="group relative flex h-full flex-1 items-end">
                  <div
                    className={`w-full rounded-t transition-colors ${
                      row.count ? "bg-forest-600 group-hover:bg-forest-700" : "bg-line"
                    }`}
                    style={{ height: `${row.count ? Math.max(6, (row.count / peak) * 100) : 3}%` }}
                    title={`${row.date}: ${row.count} patient${row.count === 1 ? "" : "s"}`}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex justify-between text-[10.5px] text-ink-muted">
              <span>{perDay[0]?.date}</span>
              <span>Peak {peak} / day</span>
              <span>{perDay[perDay.length - 1]?.date}</span>
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[14px] font-bold tracking-tight text-ink">Patients per clinic</h2>
            <button
              type="button"
              className="btn-secondary py-1.5 text-[12px]"
              onClick={() => exportReport("patients_per_clinic")}
              disabled={exporting === "patients_per_clinic"}
            >
              {exporting === "patients_per_clinic" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              CSV
            </button>
          </div>
          {perClinic.length === 0 ? (
            <p className="mt-4 rounded-xl bg-canvas px-4 py-8 text-center text-[12.5px] text-ink-muted">
              No clinic activity in this period.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {perClinic.map((row) => (
                <li key={row.clinic} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="flex min-w-0 items-center gap-2 text-[12.5px] font-medium text-ink">
                    <Building2 size={14} className="shrink-0 text-forest-600" />
                    <span className="truncate">{row.clinic}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-24 overflow-hidden rounded-full bg-canvas">
                      <span
                        className="block h-full rounded-full bg-forest-600"
                        style={{ width: `${Math.max(4, (row.count / Math.max(1, perClinic[0].count)) * 100)}%` }}
                      />
                    </span>
                    <span className="w-8 text-right text-[12px] font-bold text-ink">{row.count}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[14px] font-bold tracking-tight text-ink">Top diagnoses</h2>
            <button
              type="button"
              className="btn-secondary py-1.5 text-[12px]"
              onClick={() => exportReport("top_diagnoses")}
              disabled={exporting === "top_diagnoses"}
            >
              {exporting === "top_diagnoses" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              CSV
            </button>
          </div>
          {topDiagnoses.length === 0 ? (
            <p className="mt-4 rounded-xl bg-canvas px-4 py-8 text-center text-[12.5px] text-ink-muted">
              No diagnoses recorded in this period.
            </p>
          ) : (
            <ol className="mt-3 space-y-2">
              {topDiagnoses.map((row, index) => (
                <li key={`${row.description}-${row.code || index}`} className="flex items-start gap-2.5">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-forest-50 text-[11px] font-bold text-forest-700">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-medium leading-snug text-ink">{row.description}</span>
                    {row.code && <span className="text-[10.5px] text-ink-muted">ICD {row.code}</span>}
                  </span>
                  <span className="chip bg-canvas text-ink-soft">{row.count}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-ink-muted">
        <BarChart3 size={13} />
        Exports download as CSV and open in Excel or Google Sheets.
      </p>
    </div>
  );
}
