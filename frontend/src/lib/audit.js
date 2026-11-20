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
  visit_checked_in: "Patient checked in",
  visit_attended: "Consultation attended",
  vitals_recorded: "Vital signs recorded",
  note_added: "Clinical note added",
  diagnosis_recorded: "Diagnosis recorded",
  prescription_recorded: "Prescription written",
  lab_requested: "Lab test requested",
  allergy_recorded: "Allergy recorded",
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

const PATIENT_PREFIXES = [
  "patient_",
  "visit_",
  "vitals_",
  "note_",
  "diagnosis_",
  "prescription_",
  "lab_",
  "allergy_",
];

export function auditTone(action = "") {
  if (action.startsWith("staff_")) return TONES.staff;
  if (PATIENT_PREFIXES.some((prefix) => action.startsWith(prefix))) return TONES.patient;
  if (action.startsWith("ocr_")) return TONES.scan;
  return TONES.sign_in;
}
