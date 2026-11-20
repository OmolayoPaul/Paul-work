export const AUDIT_ACTION_LABELS = {
  login: "Signed in",
  logout: "Signed out",
  login_denied: "Sign-in denied",
  login_blocked: "Sign-in blocked",
  staff_created: "Staff added",
  staff_updated: "Staff updated",
  staff_deactivated: "Staff deactivated",
  staff_reactivated: "Staff reactivated",
  patient_viewed: "Patient record opened",
  patient_created: "Patient registered",
  patient_updated: "Patient record changed",
  ocr_scan: "Card scan",
};

export const AUDIT_CATEGORIES = [
  { value: "", label: "All activity" },
  { value: "sign_in", label: "Sign-ins" },
  { value: "staff", label: "Staff changes" },
  { value: "patient", label: "Patient records" },
  { value: "scan", label: "Card scans" },
];

const TONES = {
  sign_in: "bg-forest-50 text-forest-700",
  staff: "bg-slate-100 text-slate-600",
  patient: "bg-accent-soft text-forest-700",
  scan: "bg-amber-50 text-amber-700",
};

export function auditActionLabel(action = "") {
  return AUDIT_ACTION_LABELS[action] || action.replace(/_/g, " ") || "Activity";
}

export function auditTone(action = "") {
  if (action.startsWith("staff_")) return TONES.staff;
  if (action.startsWith("patient_")) return TONES.patient;
  if (action.startsWith("ocr_")) return TONES.scan;
  return TONES.sign_in;
}
