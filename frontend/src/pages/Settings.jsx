import { useState } from "react";
import { AlertCircle, CheckCircle2, Clock, KeyRound, Loader2, LogOut, ShieldCheck, Volume2 } from "lucide-react";

import Avatar from "../components/Avatar";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDateTime } from "../lib/format";
import { ROLE_LABELS } from "../lib/nav";
import { playChime, TEXT_SIZES, usePreferences } from "../lib/preferences";

export default function Settings() {
  const { staff, signOut } = useAuth();
  const [preferences, updatePreferences] = usePreferences();
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [passwordState, setPasswordState] = useState({ busy: false, error: "", notice: "" });

  if (!staff) return null;

  const toggleSound = () => {
    const next = !preferences.sound;
    updatePreferences({ sound: next });
    if (next) playChime();
  };

  const setPasswordField = (key) => (event) => {
    const value = event.target.value;
    setPasswords((current) => ({ ...current, [key]: value }));
    setPasswordState((current) => ({ ...current, error: "", notice: "" }));
  };

  const changePassword = async (event) => {
    event.preventDefault();
    if (passwordState.busy) return;
    if (passwords.next.length < 8) {
      setPasswordState({ busy: false, error: "Use at least 8 characters.", notice: "" });
      return;
    }
    if (passwords.next !== passwords.confirm) {
      setPasswordState({ busy: false, error: "The new passwords do not match.", notice: "" });
      return;
    }

    setPasswordState({ busy: true, error: "", notice: "" });
    try {
      await api.post(
        "/auth/password",
        { current_password: passwords.current, new_password: passwords.next },
        { silent: true },
      );
      setPasswords({ current: "", next: "", confirm: "" });
      setPasswordState({
        busy: false,
        error: "",
        notice: "Password updated. Your other devices have been signed out.",
      });
    } catch (err) {
      setPasswordState({ busy: false, error: err.message, notice: "" });
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-forest-600">Account</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-[28px]">Settings</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-ink-soft">
          Your account details, display preferences and session security.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-[15px] font-bold tracking-tight text-ink">Your account</h2>
          <div className="mt-4 flex items-center gap-3">
            <Avatar name={staff.full_name} src={staff.avatar_url} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{staff.full_name}</p>
              <p className="truncate text-[12px] text-ink-muted">{staff.email}</p>
            </div>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-4">
            {[
              ["Role", ROLE_LABELS[staff.role]],
              ["Department", staff.department || "—"],
              ["Staff ID", staff.staff_id || "—"],
              ["Last sign-in", staff.last_login_at ? formatDateTime(staff.last_login_at) : "This session"],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">{label}</dt>
                <dd className="mt-1 text-[13px] text-ink">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 text-[11.5px] leading-relaxed text-ink-muted">
            Your name, role and department are managed by your super admin. Ask them if something needs to change.
          </p>
        </section>

        <section className="card p-5">
          <div className="flex items-center gap-2">
            <KeyRound size={16} className="text-forest-700" />
            <h2 className="text-[15px] font-bold tracking-tight text-ink">Password</h2>
          </div>
          <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">
            Change the password you sign in with. Your other devices are signed out.
          </p>

          <form onSubmit={changePassword} className="mt-4 space-y-3">
            <div>
              <label className="label" htmlFor="current-password">
                Current password
              </label>
              <input
                id="current-password"
                type="password"
                className="input mt-1.5"
                value={passwords.current}
                onChange={setPasswordField("current")}
                autoComplete="current-password"
                required
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="new-password">
                  New password
                </label>
                <input
                  id="new-password"
                  type="password"
                  className="input mt-1.5"
                  value={passwords.next}
                  onChange={setPasswordField("next")}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="confirm-password">
                  Confirm new password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  className="input mt-1.5"
                  value={passwords.confirm}
                  onChange={setPasswordField("confirm")}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
            </div>

            {passwordState.error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[13px] text-red-700"
              >
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{passwordState.error}</span>
              </div>
            )}
            {passwordState.notice && (
              <div className="flex items-start gap-2.5 rounded-xl border border-forest-200 bg-forest-50 px-3.5 py-3 text-[13px] text-forest-800">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                <span>{passwordState.notice}</span>
              </div>
            )}

            <button type="submit" className="btn-primary" disabled={passwordState.busy}>
              {passwordState.busy && <Loader2 size={15} className="animate-spin" />}
              Update password
            </button>
          </form>
        </section>

        <section className="card p-5">
          <h2 className="text-[15px] font-bold tracking-tight text-ink">Display & sound</h2>
          <p className="mt-1 text-[11.5px] text-ink-muted">Applies to this browser only.</p>

          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">Text size</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {Object.entries(TEXT_SIZES).map(([key, size]) => (
              <button
                key={key}
                type="button"
                onClick={() => updatePreferences({ textSize: key })}
                className={`rounded-xl border px-3 py-3 text-center transition-colors ${
                  preferences.textSize === key
                    ? "border-forest-500 bg-forest-50 text-forest-800"
                    : "border-line text-ink-soft hover:bg-canvas"
                }`}
                aria-pressed={preferences.textSize === key}
              >
                <span className="block text-[12px] font-semibold">{size.label}</span>
                <span
                  className="mt-1 block font-bold leading-none"
                  style={{ fontSize: key === "lg" ? 20 : key === "sm" ? 13 : 16 }}
                >
                  Aa
                </span>
              </button>
            ))}
          </div>

          <div className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-line p-4">
            <div className="flex items-start gap-3">
              <Volume2 size={18} className="mt-0.5 text-forest-700" />
              <div>
                <p className="text-[13px] font-semibold text-ink">Sound</p>
                <p className="text-[11.5px] text-ink-muted">A short tone for alerts and confirmations.</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={preferences.sound}
              aria-label="Sound"
              onClick={toggleSound}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                preferences.sound ? "bg-forest-600" : "bg-[#D6DED8]"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                  preferences.sound ? "left-[22px]" : "left-0.5"
                }`}
              />
            </button>
          </div>
        </section>

        <section className="card p-5 lg:col-span-2">
          <h2 className="text-[15px] font-bold tracking-tight text-ink">Security</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-xl bg-canvas p-4">
              <Clock size={18} className="mt-0.5 shrink-0 text-forest-700" />
              <div>
                <p className="text-[13px] font-semibold text-ink">Automatic sign-out</p>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-muted">
                  Sessions end after {staff.idle_timeout_minutes ?? 15} minutes of inactivity, on the server as
                  well as in the browser.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-canvas p-4">
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-forest-700" />
              <div>
                <p className="text-[13px] font-semibold text-ink">Closed system</p>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-muted">
                  Only staff accounts created by your super admin can sign in. Passwords are stored as
                  salted hashes, never in plain text.
                </p>
              </div>
            </div>
          </div>
          <button type="button" className="btn-secondary mt-5" onClick={() => signOut()}>
            <LogOut size={16} />
            Sign out of Afridetect EMR
          </button>
        </section>
      </div>
    </div>
  );
}
