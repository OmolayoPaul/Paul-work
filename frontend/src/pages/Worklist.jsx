import { ListChecks } from "lucide-react";

import PlaceholderPage from "../components/PlaceholderPage";

export default function Worklist() {
  return (
    <PlaceholderPage
      eyebrow="Clinical consultation"
      title="Worklist"
      icon={ListChecks}
      description="Checked-in patients waiting to be seen, in the dense hospital-EMR layout used across every clinical screen."
      planned={[
        "Patient No., name, clinic, bill type and check-in time",
        "Pending / Attended To toggle with Hospital and Telemed tabs",
        "Search by card number, patient name or NHIS number",
        "Click a row to open the full patient medical record",
      ]}
      note="Records officers and nurses will register and check patients in here, and doctors will see the patients assigned to them."
    />
  );
}
