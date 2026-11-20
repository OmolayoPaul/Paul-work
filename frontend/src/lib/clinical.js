export const BILL_TYPES = { self_pay: "Self-Pay", insurance: "Insurance" };
export const VISIT_TYPES = { new: "New", follow_up: "Follow-up" };
export const CHANNELS = { hospital: "Hospital Visit", telemed: "Telemed Visit" };
export const NOTE_TYPES = {
  consultation: "Consultation note",
  treatment_plan: "Treatment plan",
  progress: "Progress note",
};

export const REGISTRAR_ROLES = ["super_admin", "doctor", "nurse", "records_officer"];
export const CLINICAL_ROLES = ["super_admin", "doctor", "nurse"];
export const PRESCRIBER_ROLES = ["super_admin", "doctor"];
export const ATTENDING_ROLES = ["super_admin", "doctor"];

export function canRegister(role) {
  return REGISTRAR_ROLES.includes(role);
}

export function canWriteClinical(role) {
  return CLINICAL_ROLES.includes(role);
}

export function canPrescribe(role) {
  return PRESCRIBER_ROLES.includes(role);
}

export function canAttend(role) {
  return ATTENDING_ROLES.includes(role);
}

export const LAB_ROLES = ["super_admin", "lab_scientist"];
export const PHARMACY_ROLES = ["super_admin", "pharmacist"];

export function canEnterLabResult(role) {
  return LAB_ROLES.includes(role);
}

export function canDispense(role) {
  return PHARMACY_ROLES.includes(role);
}

export const SCANNER_ROLES = ["super_admin", "doctor", "records_officer"];

/** Card scanning is limited to the roles that register patients. */
export function canScan(role) {
  return SCANNER_ROLES.includes(role);
}

export const TIMELINE_FILTERS = [
  { value: "all", label: "View All" },
  { value: "vitals", label: "Vital Signs" },
  { value: "plan", label: "Treatment Plan" },
  { value: "prescription", label: "Prescription" },
  { value: "investigations", label: "Investigations" },
  { value: "lab", label: "Lab" },
  { value: "others", label: "Others" },
];

export function timelineMatches(tab, entry) {
  if (tab === "all") return true;
  if (tab === "plan") return entry.kind === "note" || entry.kind === "diagnosis";
  if (tab === "investigations") return entry.kind === "attachment";
  if (tab === "others") return entry.kind === "allergy";
  return entry.kind === tab;
}

export function billTypeLabel(value) {
  return BILL_TYPES[value] || value || "—";
}

export function visitTypeLabel(value) {
  return VISIT_TYPES[value] || value || "—";
}

export function channelLabel(value) {
  return CHANNELS[value] || value || "—";
}

export function entryMatchesVisit(entry, visitId) {
  if (!visitId) return true;
  return entry.visit_id === visitId || entry.visit_id === null;
}
