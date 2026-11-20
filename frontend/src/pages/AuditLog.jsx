import { ScrollText } from "lucide-react";

import PlaceholderPage from "../components/PlaceholderPage";

export default function AuditLog() {
  return (
    <PlaceholderPage
      eyebrow="Administration"
      title="Audit Log"
      icon={ScrollText}
      description="A read-only record of everything that happens in the EMR. Entries can never be edited or deleted — not even by the super admin."
      planned={[
        "Every sign-in and sign-in attempt, successful or denied",
        "Every staff account change and role assignment",
        "Every patient record opened or changed",
        "Every card scan, with who scanned and which patient",
      ]}
      note="Each entry shows who did what, when, and which patient it concerned, so the hospital can answer any data-protection question."
    />
  );
}
