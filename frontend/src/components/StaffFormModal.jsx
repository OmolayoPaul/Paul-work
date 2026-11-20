import { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

import { api } from "../lib/api";
import { ALL_ROLES, ROLE_LABELS } from "../lib/nav";
import Modal from "./Modal";

const EMPTY = {
  full_name: "",
  email: "",
  password: "",
  phone: "",
  staff_id: "",
  role: "doctor",
  department: "",
};

function valuesFor(person) {
  if (!person) return EMPTY;
  return {
    full_name: person.full_name || "",
    email: person.email || "",
    password: "",
    phone: person.phone || "",
    staff_id: person.staff_id || "",
    role: person.role || "doctor",
    department: person.department || "",
  };
}

export default function StaffFormModal({ open, person, onClose, onSaved }) {
  const editing = Boolean(person);
  const [values, setValues] = useState(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValues(valuesFor(person));
    setError("");
  }, [open, person]);

  const setField = (key) => (event) => {
    const value = event.target.value;
    setValues((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;

    const fullName = values.full_name.trim();
    const email = values.email.trim().toLowerCase();
    if (fullName.length < 2) {
      setError("Enter the staff member's full name.");
      return;
    }
    if (!editing && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!editing && values.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (editing && values.password && values.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload = {
        full_name: fullName,
        role: values.role,
        phone: values.phone.trim(),
        staff_id: values.staff_id.trim(),
        department: values.department.trim(),
      };
      if (editing) {
        if (values.password) payload.password = values.password;
        const saved = await api.patch(`/staff/${person.id}`, payload);
        onSaved(saved, editing);
      } else {
        const saved = await api.post("/staff", { ...payload, email, password: values.password });
        onSaved(saved, editing);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title={editing ? `Edit ${person.full_name}` : "Add staff"}
      description={
        editing
          ? "Update their role, department, contact details or reset their password."
          : "Create a staff account with an email and password."
      }
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" form="staff-form" className="btn-primary" disabled={saving}>
            {saving && <Loader2 size={15} className="animate-spin" />}
            {editing ? "Save changes" : "Create account"}
          </button>
        </div>
      }
    >
      <form id="staff-form" onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="staff-name">
            Full name
          </label>
          <input
            id="staff-name"
            className="input mt-1.5"
            value={values.full_name}
            onChange={setField("full_name")}
            placeholder="Dr. Amaka Nwosu"
            autoComplete="off"
            required
          />
        </div>

        <div>
          <label className="label" htmlFor="staff-email">
            Email
          </label>
          <input
            id="staff-email"
            type="email"
            className="input mt-1.5 disabled:bg-canvas disabled:text-ink-muted"
            value={values.email}
            onChange={setField("email")}
            placeholder="name@afridetect.ng"
            autoComplete="off"
            disabled={editing}
            required={!editing}
          />
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-muted">
            {editing
              ? "The sign-in email cannot be changed. Add a new account for a different address."
              : "They will sign in with this email and their password."}
          </p>
        </div>

        <div>
          <label className="label" htmlFor="staff-password">
            {editing ? "Reset password (optional)" : "Password"}
          </label>
          <input
            id="staff-password"
            type="password"
            className="input mt-1.5"
            value={values.password}
            onChange={setField("password")}
            placeholder={editing ? "Leave blank to keep current" : "At least 6 characters"}
            autoComplete="new-password"
            required={!editing}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="staff-phone">
              Phone
            </label>
            <input
              id="staff-phone"
              type="tel"
              className="input mt-1.5"
              value={values.phone}
              onChange={setField("phone")}
              placeholder="0803 000 0000"
            />
          </div>
          <div>
            <label className="label" htmlFor="staff-id">
              Staff ID
            </label>
            <input
              id="staff-id"
              className="input mt-1.5"
              value={values.staff_id}
              onChange={setField("staff_id")}
              placeholder="AFD-D-002"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="staff-role">
              Role
            </label>
            <select id="staff-role" className="input mt-1.5" value={values.role} onChange={setField("role")}>
              {ALL_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="staff-department">
              Department / clinic
            </label>
            <input
              id="staff-department"
              className="input mt-1.5"
              value={values.department}
              onChange={setField("department")}
              placeholder="General Outpatient"
            />
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[13px] text-red-700"
          >
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </form>
    </Modal>
  );
}
