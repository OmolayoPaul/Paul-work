import { MessageSquare } from "lucide-react";

import PlaceholderPage from "../components/PlaceholderPage";

export default function Messages() {
  return (
    <PlaceholderPage
      eyebrow="Team communication"
      title="Messages"
      icon={MessageSquare}
      description="Secure messages between the clinical team, so a lab query or a pharmacy question never leaves the hospital's system."
      planned={[
        "Threads between doctors, nurses, pharmacy and the lab",
        "Patient-linked messages that keep the record together",
        "Read receipts and unread counts in the top bar",
      ]}
      note="Messages stay inside Afridetect EMR — patient information should never be sent over personal email or chat apps."
    />
  );
}
