import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  UserCheck,
  UserX,
  X,
} from "lucide-react";

import Avatar from "../components/Avatar";
import Modal from "../components/Modal";
import StaffFormModal from "../components/StaffFormModal";
import { api } from "../lib/api";
import { formatDateTime, relativeTime } from "../lib/format";
import { ALL_ROLES, ROLE_LABELS } from "../lib/nav";

const EMPTY_FILTERS = { search: "", role: "", status: "" };

function StatusChip({ status }) {
  const active = status === "active";
  return (
    <span
      className={`chip ${active ? "bg-accent-soft text-forest-700" : "bg-slate-100 text-slate-600"}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-forest-500" : "bg-slate-400"}`} />
      {active ? "Active" : "Deactivated"}
    </span>
  );
}

export default function StaffManagement() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);

  const [form, setForm] = useState({ open: false, person: null });
  const [confirming, setConfirming] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  const reload = () => setRevision((value) => value + 1);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (filters.search.trim()) params.set("search", filters.search.trim());
    if (filters.role) params.set("role", filters.role);
    if (filters.status) params.set("status", filters.status);
    try {
      const result = await api.get(`/staff?${params.toString()}`);
      setPeople(result || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters, revision]);

  useEffect(() => {
    const timer = setTimeout(load, filters.search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, filters.search]);

  const setFilter = (key) => (event) => {
    const value = event.target.value;
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const handleSaved = (person, editing) => {
    setForm({ open: false, person: null });
    setNotice(
      editing
        ? `${person.full_name}'s account was updated.`
        : `${person.full_name} was added. They can now sign in with ${person.email}.`,
    );
    reload();
  };

  const setStatus = async (person, status) => {
    setTogglingId(person.id);
    setNotice("");
    setError("");
    try {
      const updated = await api.patch(`/staff/${person.id}`, { status });
      setNotice(
        `${updated.full_name} was ${status === "active" ? "reactivated" : "deactivated"}.` +
          (status === "active" ? "" : " Their sessions were ended immediately."),
      );
      setConfirming(null);
      reload();
    } catch (err) {
      setError(err.message);
      setConfirming(null);
    } finally {
      setTogglingId(null);
    }
  };

  const activeCount = people.filter((person) => person.status === "active").length;
  const filtersActive = Boolean(filters.search || filters.role || filters.status);

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-forest-600">
            Administration
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-[28px]">Staff Management</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Create staff accounts, assign roles and switch access on or off. A Google account that is not on
            this list cannot sign in.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary w-full shrink-0 sm:w-auto"
          onClick={() => setForm({ open: true, person: null })}
        >
          <Plus size={16} />
          Add staff
        </button>
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
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            type="button"
            className="btn-secondary px-2.5 py-1 text-[11.5px]"
            onClick={reload}
          >
            <RefreshCw size={12} />
            Retry
          </button>
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

      <section className="card p-3 sm:p-4">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
            />
            <input
              className="input pl-9"
              placeholder="Search name, email or staff ID"
              value={filters.search}
              onChange={setFilter("search")}
              aria-label="Search staff"
            />
          </div>
          <select
            className="input lg:w-44"
            value={filters.role}
            onChange={setFilter("role")}
            aria-label="Filter by role"
          >
            <option value="">All roles</option>
            {ALL_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
          <select
            className="input lg:w-40"
            value={filters.status}
            onChange={setFilter("status")}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Deactivated</option>
          </select>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-2.5">
          <p className="text-[11.5px] text-ink-muted">
            {loading && people.length === 0
              ? "Loading staff…"
              : `${people.length} staff${filtersActive ? " matching these filters" : ""} · ${activeCount} active`}
          </p>
          <div className="flex items-center gap-2">
            {filtersActive && (
              <button type="button" className="btn-ghost px-2 py-1 text-[11.5px]" onClick={() => setFilters(EMPTY_FILTERS)}>
                Clear filters
              </button>
            )}
            {loading && people.length > 0 && <Loader2 size={14} className="animate-spin text-ink-muted" />}
          </div>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="bg-canvas/70 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-3">Staff</th>
                <th scope="col" className="px-4 py-3">Role</th>
                <th scope="col" className="hidden px-4 py-3 md:table-cell">Department</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="hidden px-4 py-3 sm:table-cell">Last login</th>
                <th scope="col" className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {people.map((person) => (
                <tr key={person.id} className="transition-colors hover:bg-forest-50/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={person.full_name} src={person.avatar_url} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink">{person.full_name}</p>
                        <p className="truncate text-[11.5px] text-ink-muted">{person.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink-soft">{ROLE_LABELS[person.role] || person.role}</p>
                    {person.staff_id && (
                      <p className="text-[11px] text-ink-muted">{person.staff_id}</p>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-ink-soft md:table-cell">
                    {person.department || <span className="text-ink-muted">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <StatusChip status={person.status} />
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    {person.last_login_at ? (
                      <span title={formatDateTime(person.last_login_at)} className="text-ink-soft">
                        {relativeTime(person.last_login_at)}
                      </span>
                    ) : (
                      <span className="text-ink-muted">Never</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        className="icon-btn h-9 w-9"
                        onClick={() => setForm({ open: true, person })}
                        aria-label={`Edit ${person.full_name}`}
                        title="Edit staff member"
                      >
                        <Pencil size={15} />
                      </button>
                      {person.status === "active" ? (
                        <button
                          type="button"
                          className="icon-btn h-9 w-9 text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => setConfirming(person)}
                          disabled={togglingId === person.id}
                          aria-label={`Deactivate ${person.full_name}`}
                          title="Deactivate access"
                        >
                          {togglingId === person.id ? (
                            <Loader2 size={15} className="animate-spin" />
                          ) : (
                            <UserX size={16} />
                          )}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="icon-btn h-9 w-9 text-forest-700"
                          onClick={() => setStatus(person, "active")}
                          disabled={togglingId === person.id}
                          aria-label={`Reactivate ${person.full_name}`}
                          title="Reactivate access"
                        >
                          {togglingId === person.id ? (
                            <Loader2 size={15} className="animate-spin" />
                          ) : (
                            <UserCheck size={16} />
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && people.length === 0 && (
          <div className="px-6 py-12 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-forest-50 text-forest-700">
              <Search size={22} />
            </span>
            <p className="mt-3 text-sm font-semibold text-ink">
              {filtersActive ? "No staff match these filters" : "No staff accounts yet"}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-[12.5px] leading-relaxed text-ink-muted">
              {filtersActive
                ? "Try a different name, role or status."
                : "Add the first staff member to let them sign in with Google."}
            </p>
            {filtersActive && (
              <button type="button" className="btn-secondary mt-4" onClick={() => setFilters(EMPTY_FILTERS)}>
                Clear filters
              </button>
            )}
          </div>
        )}
      </section>

      <p className="flex items-start gap-2 rounded-xl border border-line bg-white/60 px-4 py-3 text-[11.5px] leading-relaxed text-ink-soft">
        <ShieldAlert size={15} className="mt-0.5 shrink-0 text-forest-600" />
        Deactivating a staff member ends their sessions immediately and blocks sign-in until you reactivate the
        account. The last active super admin can never be deactivated or demoted.
      </p>

      <StaffFormModal
        open={form.open}
        person={form.person}
        onClose={() => setForm({ open: false, person: null })}
        onSaved={handleSaved}
      />

      <Modal
        open={Boolean(confirming)}
        onClose={() => setConfirming(null)}
        title={confirming ? `Deactivate ${confirming.full_name}?` : ""}
        description="They will be signed out immediately and cannot sign in again until you reactivate the account."
        size="max-w-md"
        footer={
          <div className="flex items-center justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setConfirming(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn bg-red-600 px-4 py-2.5 text-white hover:bg-red-700"
              onClick={() => confirming && setStatus(confirming, "inactive")}
              disabled={Boolean(togglingId)}
            >
              {togglingId ? <Loader2 size={15} className="animate-spin" /> : <UserX size={15} />}
              Deactivate access
            </button>
          </div>
        }
      >
        {confirming && (
          <div className="space-y-2 text-[13px] leading-relaxed text-ink-soft">
            <p>
              <span className="font-semibold text-ink">{confirming.email}</span> will keep their audit history —
              every past entry stays on record.
            </p>
            <p>The account can be reactivated at any time, and their role and department are kept.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
