import { BarChart3 } from "lucide-react";

import PlaceholderPage from "../components/PlaceholderPage";

export default function Reports() {
  return (
    <PlaceholderPage
      eyebrow="Insights"
      title="Reports"
      icon={BarChart3}
      description="Simple operational reports for the hospital: how many patients were seen, where, and what they were diagnosed with."
      planned={[
        "Patients seen per day and per clinic",
        "Top diagnoses over a chosen period",
        "Staff activity summary from the audit trail",
        "CSV export for your records and reports",
      ]}
      note="Reports read from the same records the clinical team writes, so the numbers stay in step with the worklist."
    />
  );
}
