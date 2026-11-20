import { Users } from "lucide-react";

import PlaceholderPage from "../components/PlaceholderPage";

export default function Patients() {
  return (
    <PlaceholderPage
      eyebrow="Medical records"
      title="Patients"
      icon={Users}
      description="The hospital patient register: register new patients, search existing records and open a patient's medical record."
      planned={[
        "Patient register with card number and NHIS number",
        "Registration with the privacy and consent notice",
        "Duplicate checks on name, date of birth, phone and card number",
        "Scan a card or folder page to capture details",
      ]}
      note="Registration is limited to records officers, nurses and the clinical team, and every record opened is written to the audit log."
    />
  );
}
