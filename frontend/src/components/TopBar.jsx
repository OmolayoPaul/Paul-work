import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  Check,
  CircleHelp,
  LogOut,
  Menu,
  Settings as SettingsIcon,
  Volume2,
  VolumeX,
} from "lucide-react";

import { useAuth } from "../lib/auth";
import { pageTitleFor, ROLE_LABELS } from "../lib/nav";
import { playChime, TEXT_SIZES, usePreferences } from "../lib/preferences";
import Avatar from "./Avatar";
import Modal from "./Modal";
import Popover from "./Popover";

export default function TopBar({ onMenu }) {
  const { staff, signOut } = useAuth();
  const [preferences, updatePreferences] = usePreferences();
  const [helpOpen, setHelpOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const title = pageTitleFor(location.pathname);

  const toggleSound = () => {
    const next = !preferences.sound;
    updatePreferences({ sound: next });
    if (next) playChime();
  };

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/85 backdrop-blur">
      <div className="flex h-16 items-center gap-2 px-4 sm:px-6 lg:px-8">
        <button type="button" className="icon-btn lg:hidden" onClick={onMenu} aria-label="Open navigation">
          <Menu size={20} />
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-bold tracking-tight text-ink sm:text-base">{title}</h1>
          <p className="hidden truncate text-[11px] text-ink-muted sm:block">
            {staff ? `${ROLE_LABELS[staff.role]}${staff.department ? ` · ${staff.department}` : ""}` : ""}
          </p>
        </div>

        <div className="flex items-center gap-0.5 sm:gap-1">
          <button
            type="button"
            className="icon-btn hidden sm:grid"
            onClick={() => setHelpOpen(true)}
            aria-label="Help"
            title="Help"
          >
            <CircleHelp size={19} />
          </button>

          <Popover
            width="w-56"
            trigger={({ toggle, open }) => (
              <button
                type="button"
                className={`icon-btn ${open ? "bg-forest-50 text-forest-800" : ""}`}
                onClick={toggle}
                aria-label="Text size"
                title="Text size"
              >
                <span className="text-[15px] font-bold leading-none">Aa</span>
              </button>
            )}
          >
            {({ close }) => (
              <div>
                <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
                  Text size
                </p>
                {Object.entries(TEXT_SIZES).map(([key, size]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      updatePreferences({ textSize: key });
                      close();
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm text-ink hover:bg-forest-50"
                  >
                    <span>{size.label}</span>
                    {preferences.textSize === key && <Check size={15} className="text-forest-600" />}
                  </button>
                ))}
              </div>
            )}
          </Popover>

          <button
            type="button"
            className="icon-btn"
            onClick={toggleSound}
            aria-label={preferences.sound ? "Turn sound off" : "Turn sound on"}
            title={preferences.sound ? "Sound on" : "Sound off"}
          >
            {preferences.sound ? <Volume2 size={19} /> : <VolumeX size={19} />}
          </button>

          <Popover
            width="w-72"
            trigger={({ toggle }) => (
              <button type="button" className="icon-btn" onClick={toggle} aria-label="Notifications" title="Notifications">
                <Bell size={19} />
                <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-accent ring-2 ring-white" />
              </button>
            )}
          >
            {() => (
              <div>
                <div className="flex items-center justify-between px-2 py-1">
                  <p className="text-sm font-semibold text-ink">Notifications</p>
                  <span className="chip bg-forest-50 text-forest-700">0 new</span>
                </div>
                <div className="mt-2 rounded-xl bg-canvas px-3 py-6 text-center">
                  <Bell size={20} className="mx-auto text-ink-muted" />
                  <p className="mt-2 text-[13px] font-medium text-ink">You're all caught up</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
                    Lab results, order updates and messages will show up here.
                  </p>
                </div>
              </div>
            )}
          </Popover>

          <span className="mx-1 hidden h-8 w-px bg-line sm:block" />

          <Popover
            width="w-72"
            trigger={({ toggle }) => (
              <button
                type="button"
                onClick={toggle}
                className="flex items-center gap-2 rounded-xl p-1 transition-colors hover:bg-forest-50"
                aria-label="Account menu"
              >
                <Avatar name={staff?.full_name} src={staff?.avatar_url} size="sm" />
                <span className="hidden text-left leading-tight sm:block">
                  <span className="block max-w-[140px] truncate text-[12.5px] font-semibold text-ink">
                    {staff?.full_name}
                  </span>
                  <span className="block text-[10.5px] text-ink-muted">{staff ? ROLE_LABELS[staff.role] : ""}</span>
                </span>
              </button>
            )}
          >
            {({ close }) => (
              <div>
                <div className="flex items-center gap-3 rounded-xl bg-canvas px-3 py-3">
                  <Avatar name={staff?.full_name} src={staff?.avatar_url} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{staff?.full_name}</p>
                    <p className="truncate text-[11px] text-ink-muted">{staff?.email}</p>
                  </div>
                </div>
                <div className="mt-1 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      navigate("/settings");
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink hover:bg-forest-50"
                  >
                    <SettingsIcon size={16} className="text-ink-muted" />
                    Settings
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      signOut();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    <LogOut size={16} />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </Popover>
        </div>
      </div>

      <Modal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="Help & support"
        description="A quick guide to using your Afridetect EMR workspace."
        footer={
          <div className="flex justify-end">
            <button type="button" className="btn-primary" onClick={() => setHelpOpen(false)}>
              Got it
            </button>
          </div>
        }
      >
        <ul className="space-y-3 text-sm text-ink-soft">
          <li>
            <span className="font-semibold text-ink">Accounts and roles.</span> Your super admin creates every
            staff account and assigns the role that controls what you can see and do.
          </li>
          <li>
            <span className="font-semibold text-ink">Session security.</span> You are signed out automatically
            after {staff?.idle_timeout_minutes ?? 15} minutes of inactivity.
          </li>
          <li>
            <span className="font-semibold text-ink">Patient data.</span> Record only what clinical care
            requires, and never share patient information outside the hospital.
          </li>
        </ul>
      </Modal>
    </header>
  );
}
