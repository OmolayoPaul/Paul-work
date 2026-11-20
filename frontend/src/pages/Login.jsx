import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, Eye, EyeOff, Loader2, LogIn, Sparkles } from "lucide-react";

import LoginArtwork from "../components/LoginArtwork";
import Logo from "../components/Logo";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ROLE_LABELS } from "../lib/nav";

const REASONS = {
  idle: "You were signed out after 15 minutes of inactivity.",
  session_expired: "Your session expired. Please sign in again.",
  account_inactive: "Your account has been deactivated. Contact your administrator.",
  not_registered: "Your account has not been created. Contact your administrator.",
};

export default function Login() {
  const { staff, loading, refresh } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [config, setConfig] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && staff) navigate("/", { replace: true });
  }, [loading, staff, navigate]);

  useEffect(() => {
    api
      .get("/auth/config", { silent: true })
      .then(setConfig)
      .catch(() => setError("Could not reach the server. Refresh the page and try again."));
  }, []);

  useEffect(() => {
    if (!config?.preview_mode) return;
    api.get("/auth/dev-accounts", { silent: true }).then(setAccounts).catch(() => {});
  }, [config]);

  const finish = useCallback(async () => {
    await refresh();
    navigate("/", { replace: true });
  }, [refresh, navigate]);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;

    const address = email.trim().toLowerCase();
    if (!address || !password) {
      setError("Enter your email and password.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      await api.post("/auth/login", { email: address, password }, { silent: true });
      await finish();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const signInAs = async (accountEmail) => {
    setBusy(true);
    setError("");
    try {
      await api.post("/auth/dev-login", { email: accountEmail });
      await finish();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const reason = searchParams.get("reason");
  const reasonText = reason ? REASONS[reason] : null;

  return (
    <div className="min-h-screen bg-canvas lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.02fr)]">
      <div className="flex min-h-screen flex-col px-6 py-8 sm:px-10 lg:px-14 xl:px-20">
        <div className="flex items-center justify-between">
          <Logo />
          <span className="hidden text-[11px] font-medium text-ink-muted sm:block">
            Closed clinical workspace
          </span>
        </div>

        <div className="flex flex-1 items-center py-10">
          <div className="w-full max-w-md">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-forest-600">
              Afridetect EMR
            </p>
            <h1 className="mt-3 text-[30px] font-bold leading-[1.1] tracking-tight text-ink sm:text-[36px]">
              Sign in to your clinical workspace
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              Electronic medical records for your hospital. Access is limited to staff accounts created by
              your administrator.
            </p>

            {reasonText && (
              <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[13px] text-amber-800">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{reasonText}</span>
              </div>
            )}

            <div className="mt-6 space-y-4">
              <div className="card p-6">
                <h2 className="text-base font-bold tracking-tight text-ink">Sign in</h2>
                <p className="mt-1 text-[13px] text-ink-soft">
                  Use the email and password your hospital gave you.
                </p>

                <form onSubmit={submit} className="mt-5 space-y-4">
                  <div>
                    <label className="label" htmlFor="login-email">
                      Email
                    </label>
                    <input
                      id="login-email"
                      type="email"
                      className="input mt-1.5"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@hospital.org"
                      autoComplete="username"
                      autoFocus
                      required
                    />
                  </div>

                  <div>
                    <label className="label" htmlFor="login-password">
                      Password
                    </label>
                    <div className="relative mt-1.5">
                      <input
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        className="input pr-11"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Your password"
                        autoComplete="current-password"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((current) => !current)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-xl text-ink-muted transition-colors hover:text-ink"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
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

                  <button type="submit" className="btn-primary w-full" disabled={busy}>
                    {busy ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />}
                    {busy ? "Signing you in…" : "Sign in"}
                  </button>
                </form>
              </div>

              {config?.preview_mode && accounts.length > 0 && (
                <div className="card p-5">
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-forest-600" />
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
                      Preview sign-in
                    </p>
                  </div>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">
                    Sandbox only — pick a seeded staff account to review each role.
                  </p>
                  <div className="mt-3 grid gap-1.5">
                    {accounts.map((account) => (
                      <button
                        key={account.email}
                        type="button"
                        onClick={() => signInAs(account.email)}
                        disabled={busy}
                        className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5 text-left transition-colors hover:border-forest-200 hover:bg-forest-50 disabled:opacity-60"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold text-ink">
                            {account.full_name}
                          </span>
                          <span className="block truncate text-[11px] text-ink-muted">{account.email}</span>
                        </span>
                        <span className="chip shrink-0 bg-forest-50 text-forest-700">
                          {ROLE_LABELS[account.role] || account.role}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-line bg-white/70 p-4">
                <p className="text-[12.5px] font-semibold text-ink">Invitation only</p>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">
                  There is no public sign-up. If you don't have an account yet, ask your super admin to create
                  one and share your first password with you.
                </p>
              </div>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-ink-muted">
          © {new Date().getFullYear()} Afridetect EMR · For authorised clinical staff
        </p>
      </div>

      <div className="relative hidden overflow-hidden lg:block">
        <LoginArtwork />
      </div>
    </div>
  );
}
