import { NavLink } from "react-router-dom";
import { X } from "lucide-react";

import { useAuth } from "../lib/auth";
import { NAV_SECTIONS, ROLE_LABELS, SETTINGS_ITEM, navForRole } from "../lib/nav";
import Avatar from "./Avatar";
import Logo from "./Logo";

function NavItem({ item, onNavigate }) {
  const Icon = item.icon;
  return (
    <li>
      <NavLink
        to={item.to}
        end={item.end}
        onClick={onNavigate}
        className={({ isActive }) =>
          `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-colors ${
            isActive
              ? "bg-accent text-[#04231A] shadow-[0_10px_24px_-14px_rgba(34,197,94,0.95)]"
              : "text-white/65 hover:bg-white/10 hover:text-white"
          }`
        }
      >
        {({ isActive }) => (
          <>
            <Icon
              size={18}
              strokeWidth={2}
              className={isActive ? "text-[#04231A]" : "text-white/45 group-hover:text-white"}
            />
            <span className="truncate">{item.label}</span>
          </>
        )}
      </NavLink>
    </li>
  );
}

export default function Sidebar({ open, onClose }) {
  const { staff } = useAuth();
  const sections = navForRole(staff?.role);
  const settingsAllowed = staff ? SETTINGS_ITEM.roles.includes(staff.role) : false;

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-forest-950/50 backdrop-blur-sm transition-opacity lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-200 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Main navigation"
      >
        <div className="relative flex h-full flex-col overflow-hidden bg-[#072A1D] text-white">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(140%_80%_at_0%_0%,#0F4A37_0%,#072A1D_55%,#04231A_100%)]" />

          <div className="relative flex h-20 items-center justify-between px-5">
            <Logo tone="light" />
            <button
              type="button"
              className="grid h-9 w-9 place-items-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white lg:hidden"
              onClick={onClose}
              aria-label="Close navigation"
            >
              <X size={18} />
            </button>
          </div>

          <nav className="relative flex-1 overflow-y-auto px-3 pb-3 pt-1">
            {sections.map((section) => (
              <div key={section.label} className="mb-4">
                <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">
                  {section.label}
                </p>
                <ul className="space-y-1">
                  {section.items.map((item) => (
                    <NavItem key={item.to} item={item} onNavigate={onClose} />
                  ))}
                </ul>
              </div>
            ))}

            {NAV_SECTIONS.length === 0 && (
              <p className="px-3 text-xs text-white/50">No modules assigned to your role.</p>
            )}
          </nav>

          <div className="relative space-y-2 border-t border-white/10 p-3">
            {settingsAllowed && (
              <ul>
                <NavItem item={SETTINGS_ITEM} onNavigate={onClose} />
              </ul>
            )}
            <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
              <Avatar name={staff?.full_name} src={staff?.avatar_url} />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-white">{staff?.full_name}</p>
                <p className="truncate text-[11px] text-white/50">
                  {staff ? ROLE_LABELS[staff.role] : ""}
                  {staff?.department ? ` · ${staff.department}` : ""}
                </p>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
