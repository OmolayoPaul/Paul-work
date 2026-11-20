import { Stethoscope } from "lucide-react";

import PlaceholderPage from "../components/PlaceholderPage";

export default function Consultations() {
  return (
    <PlaceholderPage
      eyebrow="Clinical care"
      title="Consultations"
      icon={Stethoscope}
      description="The consultation workspace: the patient's timeline on the left and the doctor's patient menu on the right."
      planned={[
        "Clinical note modal with rich text, note type and versions",
        "Vital signs, physical examination, diagnosis and treatment plan",
        "Prescriptions and investigation requests from the same record",
        "Allergies badge kept prominent at the top of the record",
      ]}
      note="Doctors write notes, diagnoses and prescriptions; nurses record vital signs; deleted notes stay hidden but are never destroyed."
    />
  );
}
