import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, Loader2, Sparkles } from "lucide-react";

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
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const googleMount = useRef(null);
  const googleCallback = useRef(null);

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

  const signInWithGoogle = useCallback(
    async (credential) => {
      setBusy(true);
      setError("");
      try {
        await api.post("/auth/google", { credential });
        await finish();
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
      }
    },
    [finish],
  );

  useEffect(() => {
    googleCallback.current = signInWithGoogle;
  }, [signInWithGoogle]);

  useEffect(() => {
    if (!config?.google_client_id) return undefined;
    let cancelled = false;

    const render = () => {
      if (cancelled || !window.google?.accounts?.id || !googleMount.current) return;
      window.google.accounts.id.initialize({
        client_id: config.google_client_id,
        ux_mode: "popup",
        callback: (response) => googleCallback.current?.(response.credential),
      });
      googleMount.current.innerHTML = "";
      window.google.accounts.id.renderButton(googleMount.current, {
        theme: "filled_black",
        size: "large",
        shape: "pill",
        text: "signin_with",
        logo_alignment: "left",
        width: 320,
      });
    };

    if (window.google?.accounts?.id) {
      render();
      return () => {
        cancelled = true;
      };
    }

    const existing = document.querySelector("script[data-google-gsi]");
    if (existing) {
      existing.addEventListener("load", render);
      return () => {
        cancelled = true;
        existing.removeEventListener("load", render);
      };
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.googleGsi = "true";
    script.addEventListener("load", render);
    document.head.appendChild(script);

    return () => {
      cancelled = true;
      script.removeEventListener("load", render);
    };
  }, [config]);

  const signInAs = async (email) => {
    setBusy(true);
    setError("");
    try {
      await api.post("/auth/dev-login", { email });
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
                  Use the Google account your hospital added for you.
                </p>

                {config?.google_sign_in_enabled ? (
                  <div className="mt-5 flex min-h-[44px] justify-center" ref={googleMount} />
                ) : (
                  <div className="mt-5 rounded-xl border border-dashed border-line bg-canvas px-4 py-4 text-[12.5px] leading-relaxed text-ink-soft">
                    {config === null
                      ? "Checking sign-in options…"
                      : config.preview_mode
                        ? "Google sign-in will appear here once the hospital's Google client ID is configured. Use a preview account below."
                        : "Google sign-in is not configured for this environment yet. Contact your administrator."}
                  </div>
                )}

                {busy && (
                  <p className="mt-3 flex items-center gap-2 text-[12.5px] font-medium text-forest-700">
                    <Loader2 size={14} className="animate-spin" />
                    Signing you in…
                  </p>
                )}

                {error && (
                  <div
                    role="alert"
                    className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[13px] text-red-700"
                  >
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
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
                  There is no public sign-up. If you don't have an account yet, ask your super admin to add
                  your Google email to the staff list.
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
