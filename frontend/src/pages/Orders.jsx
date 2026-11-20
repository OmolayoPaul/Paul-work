import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  FlaskConical,
  Loader2,
  Pill,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

import LabResultModal from "../components/orders/LabResultModal";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { canDispense, canEnterLabResult } from "../lib/clinical";
import { formatDateTime } from "../lib/format";

const STATUS_FILTERS = [
  { value: "open", label: "Open" },
  { value: "all", label: "All" },
  { value: "done", label: "Completed" },
];

function StatusChip({ status }) {
  const tone =
    status === "pending" || status === "open"
      ? "bg-amber-50 text-amber-700"
      : "bg-forest-50 text-forest-700";
  return <span className={`chip px-2 py-0.5 text-[10.5px] ${tone}`}>{status}</span>;
}

export default function Orders() {
  const { staff } = useAuth();
  const showLab = staff?.role !== "pharmacist";
  const showPrescriptions = staff?.role !== "lab_scientist";

  const [tab, setTab] = useState(showLab ? "lab" : "prescription");
  const [status, setStatus] = useState("open");
  const [search, setSearch] = useState("");
  const [data, setData] = useState({ lab_requests: [], prescriptions: [], counts: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [labOrder, setLabOrder] = useState(null);
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ status });
    if (search.trim()) params.set("search", search.trim());
    try {
      const result = await api.get(`/orders?${params.toString()}`);
      setData(result || { lab_requests: [], prescriptions: [], counts: {} });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [status, search]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const dispense = async (order) => {
    setBusyId(order.id);
    setError("");
    try {
      await api.patch(`/orders/prescriptions/${order.id}/dispense`, {});
      setNotice(`Prescription for ${order.patient?.full_name || "the patient"} marked dispensed.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  };

  const orders = tab === "lab" ? data.lab_requests || [] : data.prescriptions || [];
  const tabs = [
    showLab && { value: "lab", label: "Lab requests", count: data.counts?.lab_pending ?? 0, icon: FlaskConical },
    showPrescriptions && {
      value: "prescription",
      label: "Prescriptions",
      count: data.counts?.prescriptions_open ?? 0,
      icon: Pill,
    },
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-forest-600">
            Investigations & medicines
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-[28px]">Orders</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Lab requests waiting for a result and prescriptions waiting for the pharmacy. Results and dispensed
            medicines flow straight back into the patient's record.
          </p>
        </div>
        <button type="button" className="btn-secondary shrink-0" onClick={load}>
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </header>

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

      <section className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <div className="flex items-center gap-1 overflow-x-auto">
            {tabs.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setTab(item.value)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                    tab === item.value ? "bg-forest-700 text-white" : "text-ink-soft hover:bg-forest-50"
                  }`}
                >
                  <Icon size={14} />
                  {item.label}
                  <span
                    className={`rounded-full px-1.5 text-[10.5px] ${
                      tab === item.value ? "bg-white/20" : "bg-canvas text-ink-muted"
                    }`}
                  >
                    {item.count}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input
                className="input py-2 pl-9 text-[12.5px]"
                placeholder="Search patient or test"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Search orders"
              />
            </div>
            <select
              className="input w-auto py-2 text-[12.5px]"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              aria-label="Filter by status"
            >
              {STATUS_FILTERS.map((filter) => (
                <option key={filter.value} value={filter.value}>{filter.label}</option>
              ))}
            </select>
            {loading && <Loader2 size={15} className="animate-spin text-ink-muted" />}
          </div>
        </div>

        {orders.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-forest-50 text-forest-700">
              <ClipboardList size={20} />
            </span>
            <p className="mt-3 text-[13px] font-semibold text-ink">Nothing in this queue</p>
            <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-ink-muted">
              {tab === "lab"
                ? "Lab requests appear here as soon as a doctor sends them from a patient record."
                : "Prescriptions appear here as soon as a doctor writes them from a patient record."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {orders.map((order) => {
              const patientLink = `/patients/${order.patient?.id}${
                order.visit_id ? `?visit=${order.visit_id}` : ""
              }`;
              return (
                <li key={`${order.kind}-${order.id}`} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusChip status={order.status} />
                      <p className="text-[13px] font-semibold text-ink">{order.title}</p>
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-ink-muted">
                      <Link to={patientLink} className="font-semibold text-forest-700 hover:text-forest-900">
                        {order.patient?.full_name || "Patient"}
                      </Link>
                      <span>{order.patient?.patient_no}</span>
                      <span>· {order.patient?.sex_label} · {order.patient?.age_display}</span>
                    </p>

                    {order.kind === "prescription" && order.items?.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5 text-[11.5px] text-ink-soft">
                        {order.items.map((item) => (
                          <li key={item.id}>
                            <span className="font-semibold text-ink">{item.drug_name}</span>
                            {[item.dose, item.frequency, item.duration, item.quantity].filter(Boolean).length > 0 && (
                              <span> · {[item.dose, item.frequency, item.duration, item.quantity].filter(Boolean).join(" · ")}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    {order.result_summary && (
                      <p className="mt-1.5 whitespace-pre-wrap rounded-lg bg-sky-50 px-2.5 py-1.5 text-[11.5px] leading-relaxed text-sky-900">
                        <span className="font-semibold">Result</span> · {order.result_summary}
                      </p>
                    )}

                    <p className="mt-1.5 text-[11px] text-ink-muted">
                      {order.kind === "lab" ? "Requested by" : "Prescribed by"} {order.requested_by_name || "—"} ·{" "}
                      {formatDateTime(order.created_at)}
                      {order.resulted_by_name ? ` · result by ${order.resulted_by_name}` : ""}
                      {order.dispensed_by_name ? ` · dispensed by ${order.dispensed_by_name}` : ""}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {order.kind === "lab" && order.status === "pending" && canEnterLabResult(staff?.role) && (
                      <button type="button" className="btn-primary py-2 text-[12px]" onClick={() => setLabOrder(order)}>
                        <FlaskConical size={14} />
                        Enter result
                      </button>
                    )}
                    {order.kind === "prescription" && order.status === "open" && canDispense(staff?.role) && (
                      <button
                        type="button"
                        className="btn-primary py-2 text-[12px]"
                        onClick={() => dispense(order)}
                        disabled={busyId === order.id}
                      >
                        {busyId === order.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                        Mark dispensed
                      </button>
                    )}
                    <Link to={patientLink} className="btn-secondary py-2 text-[12px]">
                      Open record
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <LabResultModal
        open={Boolean(labOrder)}
        onClose={() => setLabOrder(null)}
        order={labOrder}
        onSaved={(updated) => {
          setNotice(`Result saved for ${updated?.title || "the test"}. The doctor sees it on the patient record.`);
          load();
        }}
      />
    </div>
  );
}
