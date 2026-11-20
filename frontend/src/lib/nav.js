import {
  BarChart3,
  ClipboardList,
  FolderOpen,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  ScrollText,
  Settings,
  Stethoscope,
  UserCog,
  Users,
} from "lucide-react";

export const ROLE_LABELS = {
  super_admin: "Super admin",
  doctor: "Doctor",
  nurse: "Nurse",
  records_officer: "Records officer",
  pharmacist: "Pharmacist",
  lab_scientist: "Lab scientist",
  admin_staff: "Admin staff",
};

export const ALL_ROLES = Object.keys(ROLE_LABELS);

export const NAV_SECTIONS = [
  {
    label: "Workspace",
    items: [
      { to: "/", label: "Home", icon: LayoutDashboard, roles: ALL_ROLES, end: true },
      {
        to: "/worklist",
        label: "Worklist",
        icon: ListChecks,
        roles: ["super_admin", "doctor", "nurse", "records_officer"],
      },
      { to: "/patients", label: "Patients", icon: Users, roles: ALL_ROLES },
      {
        to: "/consultations",
        label: "Consultations",
        icon: Stethoscope,
        roles: ["super_admin", "doctor", "nurse"],
      },
      {
        to: "/orders",
        label: "Orders",
        icon: ClipboardList,
        roles: ["super_admin", "doctor", "nurse", "pharmacist", "lab_scientist"],
      },
      {
        to: "/records",
        label: "Records",
        icon: FolderOpen,
        roles: ["super_admin", "doctor", "nurse", "records_officer", "admin_staff"],
      },
      { to: "/messages", label: "Messages", icon: MessageSquare, roles: ALL_ROLES },
    ],
  },
  {
    label: "Insights",
    items: [
      {
        to: "/reports",
        label: "Reports",
        icon: BarChart3,
        roles: ["super_admin", "doctor", "admin_staff"],
      },
    ],
  },
  {
    label: "Administration",
    items: [
      { to: "/staff", label: "Staff Management", icon: UserCog, roles: ["super_admin"] },
      { to: "/audit", label: "Audit Log", icon: ScrollText, roles: ["super_admin"] },
    ],
  },
];

export const SETTINGS_ITEM = {
  to: "/settings",
  label: "Settings",
  icon: Settings,
  roles: ALL_ROLES,
};

export function navForRole(role) {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => role && item.roles.includes(role)),
  })).filter((section) => section.items.length > 0);
}

/** Roles allowed on a route, taken from the same table the sidebar renders. */
export function rolesForPath(pathname) {
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (item.end ? pathname === item.to : pathname.startsWith(item.to)) return item.roles;
    }
  }
  return null;
}

export function pageTitleFor(pathname) {
  if (pathname === "/settings") return "Settings";
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (item.end ? pathname === item.to : pathname.startsWith(item.to)) return item.label;
    }
  }
  return "Afridetect EMR";
}
