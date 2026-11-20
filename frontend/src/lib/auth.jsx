import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [staff, setStaff] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api.get("/auth/me", { silent: true });
      setStaff(me);
      return me;
    } catch {
      setStaff(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const handler = (event) => {
      setStaff(null);
      const code = event.detail?.code || "unauthenticated";
      navigate(`/login?reason=${code}`, { replace: true });
    };
    window.addEventListener("afridetect:unauthorized", handler);
    return () => window.removeEventListener("afridetect:unauthorized", handler);
  }, [navigate]);

  const signOut = useCallback(
    async (reason) => {
      try {
        await api.post("/auth/logout", undefined, { silent: true });
      } catch {
        /* the local session is cleared regardless */
      }
      setStaff(null);
      navigate(reason ? `/login?reason=${reason}` : "/login", { replace: true });
    },
    [navigate],
  );

  const value = useMemo(
    () => ({ staff, loading, refresh, signOut }),
    [staff, loading, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
