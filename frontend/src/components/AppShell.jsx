import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import IdleSessionGuard from "./IdleSessionGuard";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

export default function AppShell() {
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex min-h-screen flex-col lg:pl-72">
        <TopBar onMenu={() => setNavOpen(true)} />
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
        <footer className="px-4 pb-6 text-center text-[11px] text-ink-muted sm:px-6 lg:px-8">
          Afridetect EMR · Authorised clinical staff only
        </footer>
      </div>
      <IdleSessionGuard />
    </div>
  );
}
