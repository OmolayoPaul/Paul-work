import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  FlaskConical,
  Loader2,
  Pill,
  RefreshCw,
} from "lucide-react";

import Modal from "../components/Modal";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { canDispense, canEnterLabResult } from "../lib/clinical";
import { formatDateTime } from "../lib/format";

const INTERPRETATIONS = [
  ["normal", "Normal"],
  ["abnormal", "Abnormal"],
  ["critical", "Critical"],
  ["inconclusive", "Inconclusive"],
];

const EMPTY_RESULT = {
  analyte: "",
  result_value: "",
  unit: "",
  reference_range: "",
  interpretation: "normal",
  notes: "",
};

export default function Orders() {
  const { staff } = useAuth();
  const [tab, setTab] = useState("lab");
  const [data, setData] = useState({ lab_requests: [], prescriptions: [], counts: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resultFor, setResultFor] = useState(null);
  const [result, setResult] = useState(EMPTY_RESULT);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await api.get("/orders");
      setData(payload || { lab_requests: [], prescriptions: [], counts: {} });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openResult = (lab) => {
    setResultFor(lab);
    setResult({ ...EMPTY_RESULT, analyte: lab.test_name });
  };

  const saveResult = async (event) => {
    event.preventDefault();
    if (!resultFor) return;
    setSaving(true);
    setError("");
    try {
      await api.post(`/patients/${resultFor.patient_id}/lab-requests/${resultFor.id}/results`, {
        analyte: result.analyte || null,
        result_value: result.result_value || null,
        unit: result.unit || null,
        reference_range: result.reference_range || null,
        interpretation: result.interpretation,
        notes: result.notes || null,
      });
      setResultFor(null);
      setNotice(`Result released for ${resultFor.test_name} (${resultFor.patient_name}).`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const dispense = async (prescription) => {
    if (!window.confirm(`Mark this prescription for ${prescription.patient_name} as dispensed?`)) return;
    setBusyId(prescription.id);
    setError("");
    try {
      await api.post(`/patients/${prescription.patient_id}/prescriptions/${prescription.id}/dispense`, {});
      setNotice(`Prescription dispensed for ${prescription.patient_name}.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  };

  const labRows = data.lab_requests || [];
  const rxRows = data.prescriptions || [];
  const pendingLabs = labRows.filter((row) => row.status === "pending").length;
  const openRx = rxRows.filter((row) => row.status === "open").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-ink">Orders</h1>
          <p className="text-[12px] text-ink-soft">
            Laboratory requests and prescriptions, from the doctor&apos;s order to the result or dispensed medicine.
          </p>
        </div>
        <button type="button" className="btn-ghost px-2 text-[12px]" onClick={load}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {notice && (
        <div className="flex items-start gap-2 rounded-xl border border-forest-200 bg-forest-50 px-4 py-3 text-[13px] text-forest-800">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{notice}</span>
          <button type="button" className="text-[11px] font-semibold" onClick={() => setNotice("")}>
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" className="btn-secondary px-2 py-1 text-[11px]" onClick={load}>
            Retry
          </button>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="flex items-center gap-1 border-b border-line px-3 pt-2">
          <button
            type="button"
            onClick={() => setTab("lab")}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[12px] font-semibold ${
              tab === "lab" ? "border-forest-700 text-forest-800" : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            <FlaskConical size={14} /> Lab requests
            <span className="text-[10.5px] text-ink-muted">{pendingLabs} pending</span>
          </button>
          <button
            type="button"
            onClick={() => setTab("rx")}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[12px] font-semibold ${
              tab === "rx" ? "border-forest-700 text-forest-800" : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            <Pill size={14} /> Prescriptions
            <span className="text-[10.5px] text-ink-muted">{openRx} open</span>
          </button>
        </div>

        {loading ? (
          <div className="grid place-items-center py-16">
            <Loader2 size={20} className="animate-spin text-forest-600" />
          </div>
        ) : tab === "lab" ? (
          labRows.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-[13px] font-semibold text-ink">No lab requests yet</p>
              <p className="mx-auto mt-1 max-w-sm text-[12px] text-ink-muted">
                Requests a doctor makes from a patient record appear here for the laboratory.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-[12.5px]">
                <thead className="bg-canvas/70 text-[10.5px] uppercase tracking-[0.08em] text-ink-muted">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Patient</th>
                    <th className="px-4 py-2.5 font-semibold">Test</th>
                    <th className="px-4 py-2.5 font-semibold">Requested</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 font-semibold">Result</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {labRows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-2.5">
                        <Link to={`/patients/${row.patient_id}`} className="font-semibold text-forest-800 hover:underline">
                          {row.patient_name}
                        </Link>
                        <span className="block text-[11px] text-ink-muted">{row.patient_no}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="font-medium text-ink">{row.test_name}</span>
                        {row.specimen && <span className="block text-[11px] text-ink-muted">{row.specimen}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-ink-soft">
                        {formatDateTime(row.created_at)}
                        <span className="block text-[11px] text-ink-muted">{row.requested_by_name}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`chip px-2 py-0.5 ${
                            row.status === "completed" ? "bg-forest-50 text-forest-700" : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {row.status === "completed" ? "Completed" : "Pending"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-ink-soft">
                        {row.result_summary || row.results?.[0]?.result_value || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {row.status !== "completed" && canEnterLabResult(staff?.role) ? (
                          <button type="button" className="btn-secondary px-2 py-1 text-[11.5px]" onClick={() => openResult(row)}>
                            Enter result
                          </button>
                        ) : (
                          <span className="text-[11px] text-ink-muted">
                            {row.status === "completed" ? "Released" : "Awaiting lab"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : rxRows.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-[13px] font-semibold text-ink">No prescriptions yet</p>
            <p className="mx-auto mt-1 max-w-sm text-[12px] text-ink-muted">
              Prescriptions a doctor writes appear here for the pharmacy.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[12.5px]">
              <thead className="bg-canvas/70 text-[10.5px] uppercase tracking-[0.08em] text-ink-muted">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Patient</th>
                  <th className="px-4 py-2.5 font-semibold">Medicines</th>
                  <th className="px-4 py-2.5 font-semibold">Prescribed</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rxRows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-2.5">
                      <Link to={`/patients/${row.patient_id}`} className="font-semibold text-forest-800 hover:underline">
                        {row.patient_name}
                      </Link>
                      <span className="block text-[11px] text-ink-muted">{row.patient_no}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <ul className="space-y-0.5">
                        {(row.items || []).map((item) => (
                          <li key={item.id}>
                            <span className="font-medium text-ink">{item.drug_name}</span>
                            <span className="text-ink-muted">
                              {[item.dose, item.frequency, item.duration].filter(Boolean).join(" · ")}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-4 py-2.5 text-ink-soft">
                      {formatDateTime(row.created_at)}
                      <span className="block text-[11px] text-ink-muted">{row.prescribed_by_name}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`chip px-2 py-0.5 ${
                          row.status === "dispensed" ? "bg-forest-50 text-forest-700" : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {row.status === "dispensed" ? "Dispensed" : "Open"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {row.status === "open" && canDispense(staff?.role) ? (
                        <button
                          type="button"
                          className="btn-primary px-2 py-1 text-[11.5px]"
                          onClick={() => dispense(row)}
                          disabled={busyId === row.id}
                        >
                          {busyId === row.id ? <Loader2 size={13} className="animate-spin" /> : <Pill size={13} />}
                          Dispense
                        </button>
                      ) : (
                        <span className="text-[11px] text-ink-muted">
                          {row.status === "dispensed" ? "Dispensed" : "Awaiting pharmacy"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={Boolean(resultFor)}
        onClose={() => setResultFor(null)}
        title="Enter lab result"
        description={
          resultFor
            ? `${resultFor.test_name} · ${resultFor.patient_name} (${resultFor.patient_no})`
            : undefined
        }
        size="max-w-lg"
        footer={
          <div className="flex items-center justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setResultFor(null)}>
              Cancel
            </button>
            <button type="submit" form="result-form" className="btn-primary" disabled={saving}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <FlaskConical size={16} />}
              Release result
            </button>
          </div>
        }
      >
        <form id="result-form" className="grid gap-3 sm:grid-cols-2" onSubmit={saveResult}>
          <label className="block">
            <span className="label">Analyte</span>
            <input
              className="input mt-1"
              value={result.analyte}
              onChange={(event) => setResult((current) => ({ ...current, analyte: event.target.value }))}
            />
          </label>
          <label className="block">
            <span className="label">Result *</span>
            <input
              className="input mt-1"
              value={result.result_value}
              onChange={(event) => setResult((current) => ({ ...current, result_value: event.target.value }))}
              placeholder="4.8"
            />
          </label>
          <label className="block">
            <span className="label">Unit</span>
            <input
              className="input mt-1"
              value={result.unit}
              onChange={(event) => setResult((current) => ({ ...current, unit: event.target.value }))}
              placeholder="mmol/L"
            />
          </label>
          <label className="block">
            <span className="label">Reference range</span>
            <input
              className="input mt-1"
              value={result.reference_range}
              onChange={(event) => setResult((current) => ({ ...current, reference_range: event.target.value }))}
              placeholder="3.9 – 5.5"
            />
          </label>
          <label className="block">
            <span className="label">Interpretation</span>
            <select
              className="input mt-1"
              value={result.interpretation}
              onChange={(event) => setResult((current) => ({ ...current, interpretation: event.target.value }))}
            >
              {INTERPRETATIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="label">Notes</span>
            <textarea
              rows={2}
              className="input mt-1 resize-y"
              value={result.notes}
              onChange={(event) => setResult((current) => ({ ...current, notes: event.target.value }))}
            />
          </label>
        </form>
      </Modal>
    </div>
  );
}
