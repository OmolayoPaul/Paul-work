import { ClipboardList } from "lucide-react";

import PlaceholderPage from "../components/PlaceholderPage";

export default function Orders() {
  return (
    <PlaceholderPage
      eyebrow="Investigations & medicines"
      title="Orders"
      icon={ClipboardList}
      description="Laboratory requests and prescriptions, tracked from the doctor's order to the result or dispensed medicine."
      planned={[
        "Doctors request lab tests and write prescriptions",
        "Lab scientists enter results against each request",
        "Pharmacists mark prescriptions as dispensed",
        "Results flow straight back into the patient record",
      ]}
      note="Each role sees only the orders it acts on, and every status change is recorded with who did it and when."
    />
  );
}
