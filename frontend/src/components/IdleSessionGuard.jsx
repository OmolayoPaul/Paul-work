import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import Modal from "./Modal";

const WARNING_SECONDS = 60;

export default function IdleSessionGuard() {
  const { staff, signOut } = useAuth();
  const [secondsLeft, setSecondsLeft] = useState(null);
  const lastActivity = useRef(Date.now());

  useEffect(() => {
    if (!staff) return undefined;

    const idleMinutes = staff.idle_timeout_minutes || 15;
    const totalMs = idleMinutes * 60 * 1000;
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];

    const onActivity = () => {
      lastActivity.current = Date.now();
    };
    events.forEach((name) => window.addEventListener(name, onActivity, { passive: true }));
    lastActivity.current = Date.now();

    const interval = window.setInterval(() => {
      const remaining = Math.ceil((totalMs - (Date.now() - lastActivity.current)) / 1000);
      if (remaining <= 0) {
        signOut("idle");
        return;
      }
      setSecondsLeft(remaining <= WARNING_SECONDS ? remaining : null);
    }, 1000);

    return () => {
      events.forEach((name) => window.removeEventListener(name, onActivity));
      window.clearInterval(interval);
    };
  }, [staff, signOut]);

  const staySignedIn = useCallback(async () => {
    try {
      await api.get("/auth/me", { silent: true });
    } catch {
      /* the global handler covers an expired session */
    }
    lastActivity.current = Date.now();
    setSecondsLeft(null);
  }, []);

  return (
    <Modal
      open={secondsLeft !== null}
      onClose={staySignedIn}
      title="Still there?"
      description={`You'll be signed out in ${secondsLeft ?? 0} second${secondsLeft === 1 ? "" : "s"} because of inactivity.`}
      size="max-w-md"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" onClick={() => signOut("idle")}>
            Sign out now
          </button>
          <button type="button" className="btn-primary" onClick={staySignedIn}>
            Stay signed in
          </button>
        </div>
      }
    >
      <p className="text-sm text-ink-soft">
        For patient confidentiality, Afridetect EMR signs staff out after a period of inactivity.
      </p>
    </Modal>
  );
}
