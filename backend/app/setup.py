"""One-shot database setup: create tables and seed the first accounts.

Runs as its own compose service before the API starts.
"""

from __future__ import annotations

from sqlalchemy import func, select

from .config import settings
from .db import Base, SessionLocal, engine
from .models import Role, Staff, StaffStatus, new_id

DEMO_STAFF = [
    ("Dr. Chinedu Okafor", "doctor@afridetect.ng", Role.doctor, "General Outpatient", "AFD-D-001"),
    ("Adebisi Adeyemi", "nurse@afridetect.ng", Role.nurse, "Triage & Nursing", "AFD-N-001"),
    ("Ngozi Eze", "records@afridetect.ng", Role.records_officer, "Health Records", "AFD-R-001"),
    ("Ibrahim Bello", "pharmacy@afridetect.ng", Role.pharmacist, "Pharmacy", "AFD-P-001"),
    ("Fatima Musa", "lab@afridetect.ng", Role.lab_scientist, "Laboratory", "AFD-L-001"),
    ("Tunde Bakare", "frontdesk@afridetect.ng", Role.admin_staff, "Administration", "AFD-A-001"),
]


def ensure_staff(db, *, full_name: str, email: str, role: Role, department: str, staff_id: str) -> Staff:
    email = email.strip().lower()
    person = db.scalar(select(Staff).where(func.lower(Staff.email) == email))
    if person is not None:
        return person
    person = Staff(
        id=new_id(),
        full_name=full_name,
        email=email,
        role=role,
        department=department,
        staff_id=staff_id,
        status=StaffStatus.active,
    )
    db.add(person)
    db.commit()
    return person


def main() -> None:
    Base.metadata.create_all(engine)

    db = SessionLocal()
    try:
        admin = ensure_staff(
            db,
            full_name=settings.super_admin_name,
            email=settings.super_admin_email,
            role=Role.super_admin,
            department="Executive",
            staff_id="AFD-SA-001",
        )
        print(f"super admin ready: {admin.email}")

        if settings.preview_mode:
            for name, email, role, department, staff_id in DEMO_STAFF:
                person = ensure_staff(
                    db,
                    full_name=name,
                    email=email,
                    role=role,
                    department=department,
                    staff_id=staff_id,
                )
                print(f"preview account ready: {person.email} ({person.role.value})")
        else:
            print("preview accounts skipped (BASE44_PREVIEW_MODE is not 1)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
