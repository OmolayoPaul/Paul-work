import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Lock,
  RefreshCw,
  Search,
} from "lucide-react";

import { api } from "../lib/api";
import { AUDIT_CATEGORIES, auditActionLabel, auditTone } from "../lib/audit";
import { formatDateTime, relativeTime } from "../lib/format";
import { ROLE_LABELS } from "../lib/nav";

const PAGE_SIZE = 25;

function MetaDetails({ event }) {
  const changes = event.meta?.changes || null;
  const rows = changes
    ? Object.entries(changes).map(([field, change]) => ({
        key: field,
        label: field.replace(/_/g, " "),
        text: `${change.from || "—"} → ${change.to || "—"}`,
      }))
    : [];

  return (
    <div className="mt-2 rounded-lg bg-canvas px-3 py-2.5 text-[11.5px] leading-relaxed text-ink-soft">
      {rows.length > 0 && (
        <ul className="space-y-1">
          {rows.map((row) => (
            <li key={row.key}>
              <span className="font-semibold capitalize text-ink">{row.label}</span>: {row.text}
            </li>
          ))}
        </ul>
      )}
      <p className={rows.length > 0 ? "mt-1.5 text-[11px] text-ink-muted" : "text-[11px] text-ink-muted"}>
        Entry {event.id}
        {event.ip ? ` · IP ${event.ip}` : ""}
      </p>
    </div>
  );
}

export default function AuditLog() {
  const [filters, setFilters] = useState({ search: "", category: "" });
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [revision, setRevision] = useState(0);

  const load = useCallback(
    async (nextOffset = 0) => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(nextOffset) });
      if (filters.search.trim()) params.set("search", filters.search.trim());
      if (filters.category) params.set("category", filters.category);
      try {
        const result = await api.get(`/audit?${params.toString()}`);
        setEvents(result?.items || []);
        setTotal(result?.total || 0);
        setOffset(nextOffset);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [filters, revision],
  );

  useEffect(() => {
    const timer = setTimeout(() => load(0), filters.search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, filters.search]);

  const setFilter = (key) => (event) => {
    const value = event.target.value;
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const showingFrom = total === 0 ? 0 : offset + 1;
  const showingTo = Math.min(offset + PAGE_SIZE, total);

  return (
    <div className="space-y-5">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-forest-600">Administration</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-[28px]">Audit Log</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Every sign-in, staff account change, patient record and card scan, in the order it happened — who did
          what, when, and which patient it concerned.
        </p>
      </header>

      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-forest-900 px-4 py-3.5 text-white sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10 text-accent">
            <Lock size={17} />
          </span>
          <div>
            <p className="text-[13px] font-semibold">Read-only, append-only record</p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-white/60">
              Entries can never be edited or deleted — not even by a super admin.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/20 px-3 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-60"
          onClick={() => setRevision((value) => value + 1)}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            type="button"
            className="rounded-md px-2 py-0.5 text-[11.5px] font-semibold hover:bg-white/60"
            onClick={() => load(offset)}
          >
            Retry
          </button>
        </div>
      )}

      <section className="card p-3 sm:p-4">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
            />
            <input
              className="input pl-9"
              placeholder="Search who, what or which patient"
              value={filters.search}
              onChange={setFilter("search")}
              aria-label="Search audit log"
            />
          </div>
          <select
            className="input sm:w-52"
            value={filters.category}
            onChange={setFilter("category")}
            aria-label="Filter by activity type"
          >
            {AUDIT_CATEGORIES.map((category) => (
              <option key={category.value || "all"} value={category.value}>
                {category.label}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-3 border-t border-line pt-2.5 text-[11.5px] text-ink-muted">
          {loading && events.length === 0
            ? "Loading audit trail…"
            : `${total} ${total === 1 ? "entry" : "entries"}${
                filters.search || filters.category ? " matching these filters" : ""
              }`}
        </p>
      </section>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-[13px]">
            <thead className="bg-canvas/70 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-3">When</th>
                <th scope="col" className="px-4 py-3">Who</th>
                <th scope="col" className="px-4 py-3">What</th>
                <th scope="col" className="px-4 py-3">Patient</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {events.map((event) => {
                const hasChanges = Boolean(event.meta?.changes);
                const isOpen = expanded === event.id;
                return (
                  <tr key={event.id} className="align-top transition-colors hover:bg-forest-50/40">
                    <td className="whitespace-nowrap px-4 py-3">
                      <p className="text-[12.5px] font-medium text-ink">{formatDateTime(event.created_at)}</p>
                      <p className="text-[11px] text-ink-muted">{relativeTime(event.created_at)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="max-w-[180px] truncate text-[12.5px] font-semibold text-ink">
                        {event.actor_name || event.actor_email || "Unknown"}
                      </p>
                      <p className="max-w-[180px] truncate text-[11px] text-ink-muted">
                        {event.actor_role ? ROLE_LABELS[event.actor_role] || event.actor_role : "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`chip ${auditTone(event.action)}`}>{auditActionLabel(event.action)}</span>
                      <p className="mt-1 text-[11.5px] leading-relaxed text-ink-soft">{event.summary || "—"}</p>
                      {(hasChanges || event.ip) && (
                        <button
                          type="button"
                          className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-forest-700 hover:text-forest-900"
                          onClick={() => setExpanded(isOpen ? null : event.id)}
                          aria-expanded={isOpen}
                        >
                          {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                          {isOpen ? "Hide details" : "View details"}
                        </button>
                      )}
                      {isOpen && <MetaDetails event={event} />}
                    </td>
                    <td className="px-4 py-3">
                      {event.patient_name || event.patient_id ? (
                        <>
                          <p className="max-w-[160px] truncate font-medium text-ink-soft">
                            {event.patient_name || "Patient record"}
                          </p>
                          {event.patient_id && (
                            <p className="max-w-[160px] truncate text-[11px] text-ink-muted">{event.patient_id}</p>
                          )}
                        </>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!loading && events.length === 0 && (
          <div className="px-6 py-12 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-forest-50 text-forest-700">
              <Search size={22} />
            </span>
            <p className="mt-3 text-sm font-semibold text-ink">No audit entries match</p>
            <p className="mx-auto mt-1 max-w-sm text-[12.5px] leading-relaxed text-ink-muted">
              {filters.search || filters.category
                ? "Try a different search term or activity type."
                : "Sign-ins and staff changes are recorded here as they happen."}
            </p>
            {(filters.search || filters.category) && (
              <button
                type="button"
                className="btn-secondary mt-4"
                onClick={() => setFilters({ search: "", category: "" })}
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
          <p className="text-[11.5px] text-ink-muted">
            {total === 0 ? "No entries" : `Showing ${showingFrom}–${showingTo} of ${total}`}
          </p>
          <div className="flex items-center gap-2">
            {loading && events.length > 0 && <Loader2 size={14} className="animate-spin text-ink-muted" />}
            <button
              type="button"
              className="btn-secondary px-3 py-1.5 text-[12px]"
              onClick={() => load(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0 || loading}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn-secondary px-3 py-1.5 text-[12px]"
              onClick={() => load(offset + PAGE_SIZE)}
              disabled={offset + PAGE_SIZE >= total || loading}
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
