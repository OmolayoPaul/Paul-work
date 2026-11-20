import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Clock,
  FlaskConical,
  ListChecks,
  Pill,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Stethoscope,
  UserCog,
  Users,
} from "lucide-react";

import StatCard from "../components/StatCard";
import { api } from "../lib/api";
import { auditActionLabel } from "../lib/audit";
import { useAuth } from "../lib/auth";
import { firstName, formatDate, greeting, relativeTime } from "../lib/format";
import { ROLE_LABELS } from "../lib/nav";

const QUICK_ACTIONS = {
  super_admin: [
    { to: "/staff", label: "Staff management", hint: "Add staff and assign roles", icon: UserCog },
    { to: "/audit", label: "Audit log", hint: "Every login and record change", icon: ScrollText },
    { to: "/reports", label: "Reports", hint: "Patients seen and top diagnoses", icon: BarChart3 },
    { to: "/patients", label: "Patient register", hint: "Search and open patient records", icon: Users },
  ],
  doctor: [
    { to: "/worklist", label: "My worklist", hint: "Checked-in patients to attend", icon: ListChecks },
    { to: "/consultations", label: "Consultations", hint: "Notes, diagnosis and plans", icon: Stethoscope },
    { to: "/orders", label: "Orders", hint: "Lab requests and prescriptions", icon: ClipboardList },
    { to: "/patients", label: "Patient records", hint: "Timelines and clinical history", icon: Users },
  ],
  nurse: [
    { to: "/worklist", label: "Worklist", hint: "Register and check patients in", icon: ListChecks },
    { to: "/patients", label: "Patient records", hint: "Record vital signs", icon: Users },
    { to: "/consultations", label: "Consultations", hint: "Support the clinical team", icon: Stethoscope },
    { to: "/messages", label: "Messages", hint: "Coordinate with the team", icon: ClipboardList },
  ],
  records_officer: [
    { to: "/worklist", label: "Worklist", hint: "Register and check patients in", icon: ListChecks },
    { to: "/patients", label: "Patient register", hint: "Open and update records", icon: Users },
    { to: "/records", label: "Records", hint: "Medical record filing", icon: ClipboardList },
    { to: "/messages", label: "Messages", hint: "Coordinate with the team", icon: Stethoscope },
  ],
  pharmacist: [
    { to: "/orders", label: "Prescriptions", hint: "Mark prescriptions dispensed", icon: Pill },
    { to: "/patients", label: "Patients", hint: "Confirm patient details", icon: Users },
    { to: "/messages", label: "Messages", hint: "Coordinate with prescribers", icon: ClipboardList },
    { to: "/settings", label: "Settings", hint: "Text size and session", icon: UserCog },
  ],
  lab_scientist: [
    { to: "/orders", label: "Lab requests", hint: "Enter and release results", icon: FlaskConical },
    { to: "/patients", label: "Patients", hint: "Confirm patient details", icon: Users },
    { to: "/messages", label: "Messages", hint: "Coordinate with doctors", icon: ClipboardList },
    { to: "/settings", label: "Settings", hint: "Text size and session", icon: UserCog },
  ],
  admin_staff: [
    { to: "/patients", label: "Patient register", hint: "Search patient records", icon: Users },
    { to: "/records", label: "Records", hint: "Medical record filing", icon: ClipboardList },
    { to: "/reports", label: "Reports", hint: "Clinic activity summaries", icon: BarChart3 },
    { to: "/messages", label: "Messages", hint: "Coordinate with the team", icon: Stethoscope },
  ],
};

export default function Home() {
  const { staff } = useAuth();
  const [summary, setSummary] = useState(null);
  const [summaryError, setSummaryError] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setSummaryError("");
    setSummaryLoading(true);
    api
      .get("/dashboard/summary")
      .then((data) => active && setSummary(data))
      .catch((err) => {
        if (active) setSummaryError(err.message);
      })
      .finally(() => {
        if (active) setSummaryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision]);

  const stat = (value) => (summaryLoading ? "—" : value ?? 0);

  if (!staff) return null;

  const isSuperAdmin = staff.role === "super_admin";
  const name = firstName(staff.full_name);
  const actions = QUICK_ACTIONS[staff.role] || QUICK_ACTIONS.doctor;
  const roleCounts = summary?.staff_by_role || {};

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-forest-600">
            {formatDate(new Date())}
          </p>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-ink sm:text-[30px]">
            {greeting()}, {name}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            {ROLE_LABELS[staff.role]}
            {staff.department ? ` · ${staff.department}` : ""}
          </p>
        </div>
        <span className="chip w-fit border border-line bg-white text-ink-soft">
          <Clock size={13} />
          Auto sign-out after {staff.idle_timeout_minutes ?? 15} min idle
        </span>
      </header>

      {summaryError && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800"
        >
          <AlertCircle size={16} className="shrink-0" />
          <span className="flex-1">Today's counters could not be loaded. {summaryError}</span>
          <button
            type="button"
            className="btn-secondary px-3 py-1.5 text-[12px]"
            onClick={() => setRevision((value) => value + 1)}
          >
            <RefreshCw size={13} />
            Retry
          </button>
        </div>
      )}

      <section className="relative overflow-hidden rounded-3xl bg-forest-900 p-6 text-white shadow-lift sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -right-6 top-6 h-44 w-44 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-accent/10 blur-2xl" />

        <div className="relative">
          <span className="chip bg-white/10 text-white/80">Today's clinic</span>
          <h2 className="mt-4 max-w-lg text-2xl font-bold leading-tight tracking-tight sm:text-[32px]">
            Welcome back, {name}.
          </h2>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-white/70">
            Your workspace is ready for the day. Check the worklist, open a patient record, and keep every
            entry on the audit trail.
          </p>

          <div className="mt-6 flex flex-wrap gap-2.5">
            <Link
              to="/worklist"
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-forest-950 transition-colors hover:bg-[#2ee06c]"
            >
              Open worklist
              <ArrowUpRight size={15} />
            </Link>
            <Link
              to="/patients"
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              Patient records
            </Link>
          </div>
        </div>

        <dl className="relative mt-7 grid max-w-2xl grid-cols-3 gap-4 border-t border-white/10 pt-5">
          {[
            { label: "Waiting", value: stat(summary?.patients_waiting_today) },
            { label: "Attended", value: stat(summary?.attended_today) },
            { label: "Lab pending", value: stat(summary?.pending_lab_results) },
          ].map((item) => (
            <div key={item.label}>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                {item.label}
              </dt>
              <dd className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">{item.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Users}
          label="Patients waiting today"
          value={stat(summary?.patients_waiting_today)}
          hint="Checked in, not yet attended"
        />
        <StatCard
          icon={CheckCircle2}
          label="Attended today"
          value={stat(summary?.attended_today)}
          hint="Consultations completed"
          tone="accent"
        />
        <StatCard
          icon={FlaskConical}
          label="Pending lab results"
          value={stat(summary?.pending_lab_results)}
          hint="Awaiting the laboratory"
          tone="amber"
        />
        {isSuperAdmin ? (
          <StatCard
            icon={UserCog}
            label="Active staff"
            value={stat(summary?.staff_total)}
            hint={
              summary
                ? `${summary.staff_inactive ?? 0} deactivated · ${roleCounts.doctor ?? 0} doctors`
                : "Across every role"
            }
            tone="slate"
          />
        ) : (
          <StatCard
            icon={Pill}
            label="Open prescriptions"
            value={stat(summary?.open_prescriptions)}
            hint="Waiting to be dispensed"
            tone="slate"
          />
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-bold tracking-tight text-ink">Quick actions</h2>
            <span className="text-[11px] text-ink-muted">For {ROLE_LABELS[staff.role].toLowerCase()}</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={`${action.to}-${action.label}`}
                  to={action.to}
                  className="group flex items-start gap-3 rounded-xl border border-line p-4 transition-colors hover:border-forest-200 hover:bg-forest-50/60"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-forest-50 text-forest-700 transition-colors group-hover:bg-white">
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-semibold text-ink">{action.label}</span>
                    <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-muted">
                      {action.hint}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="card p-5">
          {isSuperAdmin ? (
            <>
              <h2 className="text-[15px] font-bold tracking-tight text-ink">Team</h2>
              <p className="mt-1 text-[11.5px] text-ink-muted">Staff accounts across the hospital</p>
              <div className="mt-4 flex items-end gap-2">
                <span className="text-3xl font-bold tracking-tight text-ink">{stat(summary?.staff_total)}</span>
                <span className="pb-1 text-[11.5px] text-ink-muted">active</span>
              </div>
              <div className="mt-4 space-y-2">
                {Object.entries(roleCounts).map(([role, count]) => (
                  <div key={role} className="flex items-center justify-between gap-3">
                    <span className="text-[12px] text-ink-soft">{ROLE_LABELS[role] || role}</span>
                    <span className="chip bg-canvas text-ink-soft">{count}</span>
                  </div>
                ))}
              </div>
              <Link
                to="/staff"
                className="mt-5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-forest-700 hover:text-forest-900"
              >
                Manage staff
                <ArrowUpRight size={14} />
              </Link>
            </>
          ) : (
            <>
              <h2 className="text-[15px] font-bold tracking-tight text-ink">Your access</h2>
              <p className="mt-1 text-[11.5px] text-ink-muted">What your role can do</p>
              <ul className="mt-4 space-y-3 text-[12.5px] leading-relaxed text-ink-soft">
                <li className="flex gap-2">
                  <ShieldCheck size={15} className="mt-0.5 shrink-0 text-forest-600" />
                  You see only the modules assigned to {ROLE_LABELS[staff.role].toLowerCase()}.
                </li>
                <li className="flex gap-2">
                  <ScrollText size={15} className="mt-0.5 shrink-0 text-forest-600" />
                  Every record you open or change is written to the audit log.
                </li>
                <li className="flex gap-2">
                  <Clock size={15} className="mt-0.5 shrink-0 text-forest-600" />
                  Sessions end automatically after {staff.idle_timeout_minutes ?? 15} minutes idle.
                </li>
              </ul>
            </>
          )}
        </section>
      </div>

      {isSuperAdmin && (
        <section className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-bold tracking-tight text-ink">Recent activity</h2>
            <Link
              to="/audit"
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-forest-700 hover:text-forest-900"
            >
              Full audit log
              <ArrowUpRight size={14} />
            </Link>
          </div>
          {summary?.recent_audit?.length ? (
            <ul className="mt-4 divide-y divide-line">
              {summary.recent_audit.map((event) => (
                <li key={event.id} className="flex items-center gap-3 py-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-forest-50 text-forest-700">
                    <ScrollText size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-medium text-ink">
                      {auditActionLabel(event.action)}
                      {event.actor_name ? ` · ${event.actor_name}` : event.actor_email ? ` · ${event.actor_email}` : ""}
                    </p>
                    <p className="truncate text-[11px] text-ink-muted">{event.summary || "—"}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-ink-muted">{relativeTime(event.created_at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 rounded-xl bg-canvas px-4 py-6 text-center text-[12.5px] text-ink-muted">
              No audit activity yet. Sign-ins and staff changes appear here.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
