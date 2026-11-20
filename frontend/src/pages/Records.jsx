import { FolderOpen } from "lucide-react";

import PlaceholderPage from "../components/PlaceholderPage";

export default function Records() {
  return (
    <PlaceholderPage
      eyebrow="Health records"
      title="Records"
      icon={FolderOpen}
      description="The medical records desk: patient files, visit history and attachments kept together for the clinical team."
      planned={[
        "Open a patient's full medical record and timeline",
        "Filter entries by vitals, treatment plan, prescription and lab",
        "Attach referral letters, scans and consent forms",
        "Records are versioned — nothing is deleted permanently",
      ]}
      note="Records officers and admin staff can open and update records, while clinical authorship stays with the clinicians."
    />
  );
}
