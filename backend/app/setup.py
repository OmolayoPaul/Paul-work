"""One-shot database setup: create tables and seed the first accounts.

Runs as its own compose service before the API starts.
"""

from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import func, select

from .config import settings
from .db import Base, SessionLocal, engine
from .models import (
    Allergy,
    Clinic,
    ClinicalNote,
    Diagnosis,
    LabRequest,
    Patient,
    Prescription,
    PrescriptionItem,
    Role,
    Staff,
    StaffStatus,
    Visit,
    VitalSigns,
    new_id,
)
from .utils import utcnow

DEMO_STAFF = [
    ("Dr. Chinedu Okafor", "doctor@afridetect.ng", Role.doctor, "General Outpatient", "AFD-D-001"),
    ("Adebisi Adeyemi", "nurse@afridetect.ng", Role.nurse, "Triage & Nursing", "AFD-N-001"),
    ("Ngozi Eze", "records@afridetect.ng", Role.records_officer, "Health Records", "AFD-R-001"),
    ("Ibrahim Bello", "pharmacy@afridetect.ng", Role.pharmacist, "Pharmacy", "AFD-P-001"),
    ("Fatima Musa", "lab@afridetect.ng", Role.lab_scientist, "Laboratory", "AFD-L-001"),
    ("Tunde Bakare", "frontdesk@afridetect.ng", Role.admin_staff, "Administration", "AFD-A-001"),
]

CLINICS = [
    ("General Outpatient", "GOP"),
    ("Paediatrics", "PAED"),
    ("Antenatal", "ANC"),
    ("Dental", "DEN"),
    ("Ophthalmology", "EYE"),
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


def ensure_clinic(db, name: str, code: str) -> Clinic:
    clinic = db.scalar(select(Clinic).where(Clinic.name == name))
    if clinic is not None:
        return clinic
    clinic = Clinic(id=new_id(), name=name, code=code, is_active=True)
    db.add(clinic)
    db.commit()
    return clinic


DEMO_PATIENTS = [
    {
        "no": "0001",
        "first": "Amina",
        "last": "Yusuf",
        "sex": "female",
        "dob": date(1992, 4, 18),
        "phone": "0803 445 1120",
        "nhis": "NG-0029-8841",
        "clinic": "General Outpatient",
        "bill_type": "insurance",
        "channel": "hospital",
        "status": "pending",
        "offset_minutes": -95,
        "complaint": "Fever and headache for 3 days",
        "allergy": ("Penicillin", "Rash and swelling", "severe"),
    },
    {
        "no": "0002",
        "first": "Emeka",
        "last": "Nwosu",
        "sex": "male",
        "dob": date(2026, 4, 2),
        "phone": "0812 770 3345",
        "nhis": "",
        "clinic": "Paediatrics",
        "bill_type": "self_pay",
        "channel": "hospital",
        "status": "pending",
        "offset_minutes": -70,
        "complaint": "Cough and poor feeding",
        "allergy": None,
    },
    {
        "no": "0003",
        "first": "Grace",
        "last": "Okon",
        "sex": "female",
        "dob": date(1998, 11, 9),
        "phone": "0705 219 8876",
        "nhis": "NG-0031-2210",
        "clinic": "Antenatal",
        "bill_type": "self_pay",
        "channel": "hospital",
        "status": "attended",
        "offset_minutes": -150,
        "complaint": "Antenatal review",
        "allergy": None,
    },
    {
        "no": "0004",
        "first": "Musa",
        "last": "Danjuma",
        "sex": "male",
        "dob": date(1965, 2, 27),
        "phone": "0806 331 5521",
        "nhis": "NG-0027-6634",
        "clinic": "General Outpatient",
        "bill_type": "insurance",
        "channel": "hospital",
        "status": "attended",
        "offset_minutes": -180,
        "complaint": "Routine hypertension review",
        "allergy": None,
    },
    {
        "no": "0005",
        "first": "Blessing",
        "last": "Adeyemi",
        "sex": "female",
        "dob": date(1984, 8, 14),
        "phone": "0809 664 2290",
        "nhis": "NG-0033-4412",
        "clinic": "General Outpatient",
        "bill_type": "self_pay",
        "channel": "telemed",
        "status": "pending",
        "offset_minutes": -40,
        "complaint": "Follow-up on blood pressure readings",
        "allergy": None,
    },
    {
        "no": "0006",
        "first": "Tunde",
        "last": "Bakare",
        "sex": "male",
        "dob": date(1976, 6, 3),
        "phone": "0703 882 1104",
        "nhis": "",
        "clinic": "Dental",
        "bill_type": "self_pay",
        "channel": "telemed",
        "status": "attended",
        "offset_minutes": -210,
        "complaint": "Toothache review",
        "allergy": None,
    },
]


def ensure_demo_patients(db, doctor: Staff) -> None:
    prefix = f"AFD/{utcnow().year}/"
    existing = db.scalar(select(func.count()).select_from(Patient)) or 0
    if existing:
        return

    clinics = {clinic.name: clinic for clinic in db.scalars(select(Clinic)).all()}
    now = utcnow()

    for index, demo in enumerate(DEMO_PATIENTS):
        patient = Patient(
            id=new_id(),
            patient_no=f"{prefix}{demo['no']}",
            first_name=demo["first"],
            last_name=demo["last"],
            sex=demo["sex"],
            date_of_birth=demo["dob"],
            phone=demo["phone"] or None,
            nhis_no=demo["nhis"] or None,
            clinic_id=clinics[demo["clinic"]].id if demo["clinic"] in clinics else None,
            registered_by_id=doctor.id,
            registered_by_name=doctor.full_name,
        )
        db.add(patient)
        db.flush()

        checked_in = now + timedelta(minutes=demo["offset_minutes"])
        visit = Visit(
            id=new_id(),
            patient_id=patient.id,
            clinic_id=patient.clinic_id,
            visit_type="new" if index in (0, 1) else "follow_up",
            channel=demo["channel"],
            bill_type=demo["bill_type"],
            assigned_doctor_id=doctor.id,
            assigned_doctor_name=doctor.full_name,
            status=demo["status"],
            chief_complaint=demo["complaint"],
            checked_in_at=checked_in,
            checked_in_by_id=doctor.id,
            checked_in_by_name=doctor.full_name,
        )
        if demo["status"] == "attended":
            visit.attended_at = checked_in + timedelta(minutes=28)
            visit.attended_by_id = doctor.id
            visit.attended_by_name = doctor.full_name
        db.add(visit)
        db.flush()

        if demo["allergy"]:
            substance, reaction, severity = demo["allergy"]
            db.add(
                Allergy(
                    id=new_id(),
                    patient_id=patient.id,
                    substance=substance,
                    reaction=reaction,
                    severity=severity,
                    recorded_by_id=doctor.id,
                    recorded_by_name=doctor.full_name,
                )
            )

        if demo["no"] == "0001":
            db.add(
                VitalSigns(
                    id=new_id(),
                    patient_id=patient.id,
                    visit_id=visit.id,
                    temperature=38.4,
                    pulse=102,
                    respiratory_rate=22,
                    systolic=118,
                    diastolic=76,
                    spo2=97,
                    weight=64.5,
                    height=164,
                    recorded_by_id=doctor.id,
                    recorded_by_name="Adebisi Adeyemi",
                    recorded_at=checked_in + timedelta(minutes=12),
                )
            )
            db.add(
                ClinicalNote(
                    id=new_id(),
                    patient_id=patient.id,
                    visit_id=visit.id,
                    note_type="consultation",
                    subjective="Fever and headache for three days, no vomiting.",
                    objective="Febrile, chest clear, no rash.",
                    assessment="Malaria to rule out",
                    plan="Do malaria parasite test, review with result.",
                    author_id=doctor.id,
                    author_name=doctor.full_name,
                    created_at=checked_in + timedelta(minutes=25),
                )
            )
            db.add(
                LabRequest(
                    id=new_id(),
                    patient_id=patient.id,
                    visit_id=visit.id,
                    test_name="Malaria parasite (MP)",
                    specimen="Blood",
                    status="pending",
                    requested_by_id=doctor.id,
                    requested_by_name=doctor.full_name,
                    created_at=checked_in + timedelta(minutes=26),
                )
            )

        if demo["no"] == "0004":
            db.add(
                VitalSigns(
                    id=new_id(),
                    patient_id=patient.id,
                    visit_id=visit.id,
                    temperature=36.6,
                    pulse=74,
                    respiratory_rate=18,
                    systolic=148,
                    diastolic=92,
                    spo2=98,
                    weight=82.0,
                    height=171,
                    recorded_by_id=doctor.id,
                    recorded_by_name="Adebisi Adeyemi",
                    recorded_at=checked_in + timedelta(minutes=8),
                )
            )
            db.add(
                Diagnosis(
                    id=new_id(),
                    patient_id=patient.id,
                    visit_id=visit.id,
                    description="Essential hypertension, uncontrolled",
                    code="I10",
                    diagnosis_type="primary",
                    recorded_by_id=doctor.id,
                    recorded_by_name=doctor.full_name,
                    created_at=checked_in + timedelta(minutes=24),
                )
            )
            prescription = Prescription(
                id=new_id(),
                patient_id=patient.id,
                visit_id=visit.id,
                status="open",
                prescribed_by_id=doctor.id,
                prescribed_by_name=doctor.full_name,
                created_at=checked_in + timedelta(minutes=27),
            )
            prescription.items = [
                PrescriptionItem(
                    id=new_id(),
                    drug_name="Amlodipine 5mg",
                    dose="5mg",
                    frequency="Once daily",
                    duration="30 days",
                    route="Oral",
                    quantity="30 tablets",
                ),
                PrescriptionItem(
                    id=new_id(),
                    drug_name="Hydrochlorothiazide 25mg",
                    dose="25mg",
                    frequency="Once daily",
                    duration="30 days",
                    route="Oral",
                    quantity="30 tablets",
                ),
            ]
            db.add(prescription)

    db.commit()
    print(f"seeded {len(DEMO_PATIENTS)} demo patients with visits and clinical entries")


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

        for name, code in CLINICS:
            ensure_clinic(db, name, code)
        print(f"{len(CLINICS)} clinics ready")

        doctor = None
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
                if role == Role.doctor:
                    doctor = person
                print(f"preview account ready: {person.email} ({person.role.value})")
            if doctor is not None:
                ensure_demo_patients(db, doctor)
        else:
            print("preview accounts and demo patients skipped (BASE44_PREVIEW_MODE is not 1)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
