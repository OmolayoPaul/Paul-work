import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Loader2, RefreshCw, Search, UserPlus, Users } from "lucide-react";

import PatientFormModal from "../components/patients/PatientFormModal";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { canRegister } from "../lib/clinical";
import { formatDateTime } from "../lib/format";

export default function Patients() {
  const { staff } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [registerOpen, setRegisterOpen] = useState(false);
  const [revision, setRevision] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
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

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-forest-600">Medical records</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-[28px]">Patient register</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Every patient registered in the hospital. Search by card number, name, NHIS number or phone, then open a
            record.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" className="btn-secondary" onClick={() => setRevision((value) => value + 1)}>
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
          {canRegister(staff?.role) && (
            <button type="button" className="btn-primary" onClick={() => setRegisterOpen(true)}>
              <UserPlus size={16} />
              Register patient
            </button>
          )}
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700"
        >
          <span className="flex-1">{error}</span>
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

      <section className="card overflow-hidden">
        <div className="flex items-center gap-3 border-b border-line px-3 py-3 sm:px-4">
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              className="input pl-9"
              placeholder="Search patient number, name, NHIS number or phone"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search patients"
            />
          </div>
          {loading && <Loader2 size={15} className="animate-spin text-ink-muted" />}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-[12.5px]">
            <thead className="bg-canvas/70 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5">Patient No.</th>
                <th scope="col" className="px-4 py-2.5">Patient name</th>
                <th scope="col" className="px-4 py-2.5">Sex / Age</th>
                <th scope="col" className="px-4 py-2.5">Clinic</th>
                <th scope="col" className="px-4 py-2.5">Phone</th>
                <th scope="col" className="px-4 py-2.5">NHIS No.</th>
                <th scope="col" className="px-4 py-2.5">Last visit</th>
                <th scope="col" className="px-2 py-2.5"><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {patients.map((patient) => (
                <tr
                  key={patient.id}
                  tabIndex={0}
                  role="button"
                  onClick={() => navigate(`/patients/${patient.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      navigate(`/patients/${patient.id}`);
                    }
                  }}
                  className="cursor-pointer transition-colors hover:bg-forest-50/50 focus:bg-forest-50/60 focus:outline-none"
                >
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-[11.5px] font-medium text-forest-800">
                    {patient.patient_no}
                  </td>
                  <td className="px-4 py-3 font-semibold text-ink">
                    {patient.full_name}
                    {patient.is_demo && (
                      <span className="ml-1.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-amber-700">
                        Demo
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-soft">
                    {patient.sex_label} · {patient.age_display}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{patient.clinic?.name || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-soft">{patient.phone || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-soft">{patient.nhis_no || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-soft">
                    {patient.last_visit_at ? (
                      <span className="flex items-center gap-1.5">
                        {formatDateTime(patient.last_visit_at)}
                        <span
                          className={`chip px-1.5 py-0.5 text-[10px] ${
                            patient.last_visit_status === "pending"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-forest-50 text-forest-700"
                          }`}
                        >
                          {patient.last_visit_status === "pending" ? "Waiting" : "Attended"}
                        </span>
                      </span>
                    ) : (
                      <span className="text-ink-muted">Never</span>
                    )}
                  </td>
                  <td className="px-2 py-3 text-ink-muted"><ChevronRight size={16} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && patients.length === 0 && (
          <div className="px-6 py-12 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-forest-50 text-forest-700">
              <Users size={22} />
            </span>
            <p className="mt-3 text-sm font-semibold text-ink">
              {search ? "No patient matches this search" : "No patients registered yet"}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-[12.5px] leading-relaxed text-ink-muted">
              {search
                ? "Check the spelling, or try the card or NHIS number."
                : "Register the first patient to start a medical record."}
            </p>
          </div>
        )}

        <div className="border-t border-line px-4 py-2.5 text-[11px] text-ink-muted">
          {loading && patients.length === 0 ? "Loading patients…" : `${patients.length} patient records`}
          {search ? " matching this search" : ""}
        </div>
      </section>

      <PatientFormModal
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        onSaved={(result) => {
          setRegisterOpen(false);
          if (result?.patient?.id) navigate(`/patients/${result.patient.id}?visit=${result.visit?.id || ""}`);
        }}
      />
    </div>
  );
}
