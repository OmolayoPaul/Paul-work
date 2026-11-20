import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import AppShell from "./components/AppShell";
import Logo from "./components/Logo";
import { useAuth } from "./lib/auth";
import { rolesForPath } from "./lib/nav";
import AuditLog from "./pages/AuditLog";
import Consultations from "./pages/Consultations";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Messages from "./pages/Messages";
import NotFound from "./pages/NotFound";
import Orders from "./pages/Orders";
import PatientRecord from "./pages/PatientRecord";
import Patients from "./pages/Patients";
import Records from "./pages/Records";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import StaffManagement from "./pages/StaffManagement";
import Worklist from "./pages/Worklist";

function BootScreen() {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas">
      <div className="flex flex-col items-center gap-4">
        <Logo />
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-forest-200 border-t-forest-600" />
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-muted">Loading workspace</p>
      </div>
    </div>
  );
}

function RequireAuth({ children }) {
  const { staff, loading } = useAuth();
  const location = useLocation();

  if (loading) return <BootScreen />;
  if (!staff) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

function RequireRole({ roles, children }) {
  const { staff } = useAuth();
  if (!staff) return <Navigate to="/login" replace />;
  if (!roles.includes(staff.role)) return <Navigate to="/" replace />;
  return children;
}

/** Applies the same role rules as the sidebar, so a direct URL is refused too. */
function RoleGuard({ path, children }) {
  const roles = rolesForPath(path);
  if (!roles) return children;
  return <RequireRole roles={roles}>{children}</RequireRole>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<Home />} />
        <Route
          path="worklist"
          element={
            <RoleGuard path="/worklist">
              <Worklist />
            </RoleGuard>
          }
        />
        <Route
          path="patients"
          element={
            <RoleGuard path="/patients">
              <Patients />
            </RoleGuard>
          }
        />
        <Route
          path="patients/:patientId"
          element={
            <RoleGuard path="/patients">
              <PatientRecord />
            </RoleGuard>
          }
        />
        <Route
          path="consultations"
          element={
            <RoleGuard path="/consultations">
              <Consultations />
            </RoleGuard>
          }
        />
        <Route
          path="orders"
          element={
            <RoleGuard path="/orders">
              <Orders />
            </RoleGuard>
          }
        />
        <Route
          path="records"
          element={
            <RoleGuard path="/records">
              <Records />
            </RoleGuard>
          }
        />
        <Route
          path="messages"
          element={
            <RoleGuard path="/messages">
              <Messages />
            </RoleGuard>
          }
        />
        <Route
          path="reports"
          element={
            <RoleGuard path="/reports">
              <Reports />
            </RoleGuard>
          }
        />
        <Route
          path="staff"
          element={
            <RoleGuard path="/staff">
              <StaffManagement />
            </RoleGuard>
          }
        />
        <Route
          path="audit"
          element={
            <RoleGuard path="/audit">
              <AuditLog />
            </RoleGuard>
          }
        />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
