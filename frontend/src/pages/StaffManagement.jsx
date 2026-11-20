import { UserCog } from "lucide-react";

import PlaceholderPage from "../components/PlaceholderPage";

export default function StaffManagement() {
  return (
    <PlaceholderPage
      eyebrow="Administration"
      title="Staff Management"
      icon={UserCog}
      description="Only the super admin can create staff accounts, assign roles and switch access on or off."
      planned={[
        "Staff table with role, department, status and last login",
        "Add staff with full name, Google email, phone, staff ID and role",
        "Deactivate or reactivate a staff member",
        "The last super admin can never be deactivated or demoted",
      ]}
      note="A Google account that is not on this list cannot sign in, and a deactivated staff member loses access immediately."
    />
  );
}
