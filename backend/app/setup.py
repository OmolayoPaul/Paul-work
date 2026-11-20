"""One-shot database setup: create tables, migrate columns and seed demo data.

Runs as its own compose service before the API starts:

    python -m app.setup                 # tables + migration + seed
    python -m app.setup --remove-demo   # delete every seeded demo record
"""

from __future__ import annotations

import secrets
import sys
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import delete, func, select, text

from .config import settings
from .db import Base, SessionLocal, engine
from .models import (
    Allergy,
    Clinic,
    ClinicalNote,
    Diagnosis,
    LabRequest,
    LabResult,
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
from .security import hash_password
from .utils import utcnow

# Shared first password for the seeded preview accounts. Preview mode only.
PREVIEW_STAFF_PASSWORD = "Afridetect2026!"

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

# Columns added after the first release. create_all only creates new tables, so
# existing databases get the new columns from these idempotent statements.
COLUMN_MIGRATIONS = [
    ("patients", "email", "VARCHAR(255)"),
    ("patients", "genotype", "VARCHAR(10)"),
    ("patients", "next_of_kin_phone", "VARCHAR(40)"),
    ("patients", "occupation", "VARCHAR(120)"),
    ("patients", "marital_status", "VARCHAR(20)"),
    ("patients", "is_demo", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("staff", "password_hash", "VARCHAR(255)"),
]

# Fictional people only. Every one is flagged is_demo so it can be removed.
DEMO_PATIENTS = [
    {"no": "0001", "first": "Amina", "last": "Yusuf", "sex": "female", "dob": date(1992, 4, 18),
     "phone": "0803 445 1120", "nhis": "NG-0029-8841", "clinic": "General Outpatient",
     "blood": "O+", "genotype": "AA", "bill": "insurance", "occupation": "Trader",
     "complaint": "Fever and headache for 3 days", "today": ("pending", "hospital"),
     "allergy": ("Penicillin", "Rash and swelling", "severe")},
    {"no": "0002", "first": "Emeka", "last": "Nwosu", "sex": "male", "dob": date(2026, 4, 2),
     "phone": "0812 770 3345", "nhis": "", "clinic": "Paediatrics",
     "blood": "B+", "genotype": "AS", "bill": "self_pay", "occupation": "—",
     "complaint": "Cough and poor feeding", "today": ("pending", "hospital"),
     "allergy": None},
    {"no": "0003", "first": "Grace", "last": "Okon", "sex": "female", "dob": date(1998, 11, 9),
     "phone": "0705 219 8876", "nhis": "NG-0031-2210", "clinic": "Antenatal",
     "blood": "O+", "genotype": "AA", "bill": "self_pay", "occupation": "Teacher",
     "complaint": "Antenatal review", "today": ("attended", "hospital"),
     "allergy": None},
    {"no": "0004", "first": "Musa", "last": "Danjuma", "sex": "male", "dob": date(1965, 2, 27),
     "phone": "0806 331 5521", "nhis": "NG-0027-6634", "clinic": "General Outpatient",
     "blood": "A+", "genotype": "AA", "bill": "insurance", "occupation": "Retired civil servant",
     "complaint": "Routine hypertension review", "today": ("attended", "hospital"),
     "allergy": None},
    {"no": "0005", "first": "Blessing", "last": "Adeyemi", "sex": "female", "dob": date(1984, 8, 14),
     "phone": "0809 664 2290", "nhis": "NG-0033-4412", "clinic": "General Outpatient",
     "blood": "AB+", "genotype": "AS", "bill": "self_pay", "occupation": "Banker",
     "complaint": "Follow-up on blood pressure readings", "today": ("pending", "telemed"),
     "allergy": None},
    {"no": "0006", "first": "Tunde", "last": "Bakare", "sex": "male", "dob": date(1976, 6, 3),
     "phone": "0703 882 1104", "nhis": "", "clinic": "Dental",
     "blood": "O+", "genotype": "AA", "bill": "self_pay", "occupation": "Driver",
     "complaint": "Toothache review", "today": ("attended", "telemed"),
     "allergy": None},
    {"no": "0007", "first": "Ngozi", "last": "Okafor", "sex": "female", "dob": date(1990, 1, 22),
     "phone": "0815 220 7741", "nhis": "NG-0036-1188", "clinic": "Ophthalmology",
     "blood": "B+", "genotype": "AA", "bill": "self_pay", "occupation": "Tailor",
     "complaint": "Blurred vision in the right eye", "today": ("pending", "hospital"),
     "allergy": ("Sulfa drugs", "Itching", "moderate")},
    {"no": "0008", "first": "Sadiq", "last": "Bello", "sex": "male", "dob": date(2015, 9, 12),
     "phone": "0706 991 4432", "nhis": "NG-0041-7752", "clinic": "Paediatrics",
     "blood": "O-", "genotype": "AA", "bill": "insurance", "occupation": "Pupil",
     "complaint": "Fever and vomiting since yesterday", "today": ("pending", "hospital"),
     "allergy": None},
    {"no": "0009", "first": "Chiamaka", "last": "Eze", "sex": "female", "dob": date(2001, 3, 30),
     "phone": "0813 664 0092", "nhis": "", "clinic": "Antenatal",
     "blood": "A-", "genotype": "AS", "bill": "self_pay", "occupation": "Hair stylist",
     "complaint": "First antenatal visit", "today": ("pending", "hospital"),
     "allergy": None},
    {"no": "0010", "first": "Yakubu", "last": "Sule", "sex": "male", "dob": date(1958, 12, 5),
     "phone": "0802 771 6650", "nhis": "NG-0019-4420", "clinic": "General Outpatient",
     "blood": "O+", "genotype": "AA", "bill": "insurance", "occupation": "Farmer",
     "complaint": "Chest pain on exertion", "today": None, "allergy": None},
    {"no": "0011", "first": "Halima", "last": "Abubakar", "sex": "female", "dob": date(1995, 7, 19),
     "phone": "0704 553 8821", "nhis": "NG-0044-9033", "clinic": "General Outpatient",
     "blood": "B+", "genotype": "AA", "bill": "self_pay", "occupation": "Seamstress",
     "complaint": "Recurrent abdominal pain", "today": None, "allergy": None},
    {"no": "0012", "first": "Femi", "last": "Ogunleye", "sex": "male", "dob": date(1988, 5, 8),
     "phone": "0807 118 2245", "nhis": "", "clinic": "Dental",
     "blood": "A+", "genotype": "AA", "bill": "self_pay", "occupation": "Civil engineer",
     "complaint": "Tooth sensitivity", "today": None, "allergy": None},
    {"no": "0013", "first": "Ifeoma", "last": "Nnamdi", "sex": "female", "dob": date(1979, 10, 27),
     "phone": "0810 447 6612", "nhis": "NG-0024-5517", "clinic": "Ophthalmology",
     "blood": "O+", "genotype": "AA", "bill": "insurance", "occupation": "Caterer",
     "complaint": "Itchy eyes and discharge", "today": None, "allergy": None},
    {"no": "0014", "first": "Peter", "last": "Danladi", "sex": "male", "dob": date(1969, 2, 14),
     "phone": "0805 330 9917", "nhis": "NG-0022-8874", "clinic": "General Outpatient",
     "blood": "AB-", "genotype": "AA", "bill": "insurance", "occupation": "Mechanic",
     "complaint": "Cough for two weeks", "today": None, "allergy": None},
    {"no": "0015", "first": "Zainab", "last": "Lawal", "sex": "female", "dob": date(2010, 6, 21),
     "phone": "0709 884 3320", "nhis": "", "clinic": "Paediatrics",
     "blood": "O+", "genotype": "AS", "bill": "self_pay", "occupation": "Student",
     "complaint": "Sore throat and fever", "today": None, "allergy": None},
]

DEMO_DIAGNOSES = [
    "Malaria, uncomplicated",
    "Upper respiratory tract infection",
    "Essential hypertension",
    "Type 2 diabetes mellitus",
    "Gastroenteritis",
    "Iron-deficiency anaemia in pregnancy",
    "Dental caries",
    "Allergic conjunctivitis",
    "Acute tonsillitis",
    "Urinary tract infection",
    "Migraine",
    "Peptic ulcer disease",
]

DEMO_DRUGS = [
    ("Artemether/Lumefantrine 20/120mg", "4 tablets", "Twice daily", "3 days", "Oral"),
    ("Paracetamol 500mg", "1 tablet", "Every 6 hours", "3 days", "Oral"),
    ("Amlodipine 5mg", "1 tablet", "Once daily", "30 days", "Oral"),
    ("Amoxicillin 500mg", "1 capsule", "Three times daily", "5 days", "Oral"),
    ("Metformin 500mg", "1 tablet", "Twice daily", "30 days", "Oral"),
    ("Oral rehydration salts", "1 sachet", "After each stool", "3 days", "Oral"),
]

DEMO_LABS = ["Malaria parasite (MP)", "Full blood count", "Random blood sugar", "Urinalysis"]


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


def set_initial_password(db, person: Staff, password: str) -> bool:
    """Give an account its first password. An existing password is never replaced."""
    if person.password_hash:
        return False
    person.password_hash = hash_password(password)
    db.commit()
    return True


def ensure_clinic(db, name: str, code: str) -> Clinic:
    clinic = db.scalar(select(Clinic).where(Clinic.name == name))
    if clinic is not None:
        return clinic
    clinic = Clinic(id=new_id(), name=name, code=code, is_active=True)
    db.add(clinic)
    db.commit()
    return clinic


def migrate() -> None:
    """Add columns introduced after the first release (idempotent)."""
    with engine.begin() as connection:
        for table, column, ddl in COLUMN_MIGRATIONS:
            connection.execute(
                text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {ddl}")
            )


def _vitals_for(index: int) -> dict:
    """Deterministic but varied measurements so charts and flags have content."""
    return {
        "temperature": round(36.4 + (index % 5) * 0.4, 1),
        "pulse": 68 + (index * 7) % 34,
        "respiratory_rate": 16 + (index % 4) * 2,
        "systolic": 112 + (index * 6) % 46,
        "diastolic": 70 + (index * 4) % 22,
        "spo2": 95 + index % 5,
        "weight": round(48 + (index * 3.7) % 44, 1),
        "height": round(150 + (index * 4.5) % 38, 1),
    }


def _seed_clinical_entries(
    db,
    *,
    patient: Patient,
    visit: Visit,
    doctor: Staff,
    nurse: Staff | None,
    when: datetime,
    index: int,
    with_diagnosis: str | None,
    with_prescription: bool = False,
    with_lab: str | None = None,
    release_lab: bool = False,
    vitals_only: bool = False,
) -> None:
    recorder = nurse or doctor
    db.add(
        VitalSigns(
            id=new_id(),
            patient_id=patient.id,
            visit_id=visit.id,
            recorded_by_id=recorder.id,
            recorded_by_name=recorder.full_name,
            recorded_at=when + timedelta(minutes=8),
            **_vitals_for(index),
        )
    )
    if vitals_only:
        return
    db.add(
        ClinicalNote(
            id=new_id(),
            patient_id=patient.id,
            visit_id=visit.id,
            note_type="consultation",
            subjective=visit.chief_complaint or "Review in clinic.",
            objective="Patient examined in clinic. No acute distress.",
            assessment=with_diagnosis or "Clinical review",
            plan="Treat as assessed and review if symptoms persist.",
            author_id=doctor.id,
            author_name=doctor.full_name,
            created_at=when + timedelta(minutes=20),
        )
    )
    if with_diagnosis:
        db.add(
            Diagnosis(
                id=new_id(),
                patient_id=patient.id,
                visit_id=visit.id,
                description=with_diagnosis,
                diagnosis_type="primary",
                recorded_by_id=doctor.id,
                recorded_by_name=doctor.full_name,
                created_at=when + timedelta(minutes=24),
            )
        )
    if with_prescription:
        drug, dose, frequency, duration, route = DEMO_DRUGS[index % len(DEMO_DRUGS)]
        prescription = Prescription(
            id=new_id(),
            patient_id=patient.id,
            visit_id=visit.id,
            status="open",
            prescribed_by_id=doctor.id,
            prescribed_by_name=doctor.full_name,
            created_at=when + timedelta(minutes=27),
        )
        prescription.items = [
            PrescriptionItem(
                id=new_id(),
                drug_name=drug,
                dose=dose,
                frequency=frequency,
                duration=duration,
                route=route,
                quantity=duration,
            )
        ]
        db.add(prescription)
    if with_lab:
        lab = LabRequest(
            id=new_id(),
            patient_id=patient.id,
            visit_id=visit.id,
            test_name=with_lab,
            specimen="Blood",
            status="resulted" if release_lab else "pending",
            requested_by_id=doctor.id,
            requested_by_name=doctor.full_name,
            created_at=when + timedelta(minutes=26),
        )
        if release_lab:
            lab.result_summary = "Result released by the laboratory."
            lab.results = [
                LabResult(
                    id=new_id(),
                    patient_id=patient.id,
                    analyte=with_lab,
                    result_value="Normal" if index % 4 == 0 else "Positive",
                    unit="",
                    reference_range="Negative",
                    interpretation="normal" if index % 4 == 0 else "abnormal",
                    status="released",
                    entered_by_id=doctor.id,
                    entered_by_name="Fatima Musa",
                    created_at=when + timedelta(minutes=90),
                )
            ]
        db.add(lab)


def ensure_demo_patients(db, doctor: Staff, nurse: Staff | None = None) -> None:
    """Seed fictional patients, one active visit today and a month of history."""
    prefix = f"AFD/{utcnow().year}/"
    clinics = {clinic.name: clinic for clinic in db.scalars(select(Clinic)).all()}
    now = utcnow()
    today_start = datetime.combine(now.date(), time.min, tzinfo=timezone.utc)
    created = 0

    for index, demo in enumerate(DEMO_PATIENTS):
        # Spread registrations and past visits over the last three weeks so the
        # reports show a realistic curve instead of one flat day.
        history_days_ago = (index * 3) % 20 + 1
        patient = db.scalar(select(Patient).where(Patient.patient_no == f"{prefix}{demo['no']}"))
        if patient is None:
            patient = Patient(
                id=new_id(),
                patient_no=f"{prefix}{demo['no']}",
                first_name=demo["first"],
                last_name=demo["last"],
                sex=demo["sex"],
                date_of_birth=demo["dob"],
                phone=demo["phone"] or None,
                nhis_no=demo["nhis"] or None,
                blood_group=demo["blood"],
                genotype=demo["genotype"],
                occupation=demo["occupation"],
                clinic_id=clinics[demo["clinic"]].id if demo["clinic"] in clinics else None,
                registered_by_id=doctor.id,
                registered_by_name=doctor.full_name,
                is_demo=True,
                created_at=now - timedelta(days=history_days_ago + 1),
            )
            db.add(patient)
            db.flush()
            created += 1
        else:
            patient.is_demo = True
            # Backfill details added after the first seed run.
            patient.blood_group = patient.blood_group or demo["blood"]
            patient.genotype = patient.genotype or demo["genotype"]
            patient.occupation = patient.occupation or demo["occupation"]

        if demo["allergy"]:
            substance = demo["allergy"][0]
            has_allergy = db.scalar(
                select(func.count())
                .select_from(Allergy)
                .where(Allergy.patient_id == patient.id, Allergy.substance == substance)
            )
            if not has_allergy:
                db.add(
                    Allergy(
                        id=new_id(),
                        patient_id=patient.id,
                        substance=substance,
                        reaction=demo["allergy"][1],
                        severity=demo["allergy"][2],
                        recorded_by_id=doctor.id,
                        recorded_by_name=doctor.full_name,
                    )
                )

        clinic = clinics.get(demo["clinic"])
        has_today = db.scalar(
            select(func.count())
            .select_from(Visit)
            .where(Visit.patient_id == patient.id, Visit.checked_in_at >= today_start)
        )
        if not has_today and demo["today"]:
            status, channel = demo["today"]
            checked_in = now - timedelta(minutes=40 + index * 12)
            visit = Visit(
                id=new_id(),
                patient_id=patient.id,
                clinic_id=clinic.id if clinic else None,
                visit_type="new" if index < 3 else "follow_up",
                channel=channel,
                bill_type=demo["bill"],
                assigned_doctor_id=doctor.id,
                assigned_doctor_name=doctor.full_name,
                status=status,
                chief_complaint=demo["complaint"],
                checked_in_at=checked_in,
                checked_in_by_id=doctor.id,
                checked_in_by_name=doctor.full_name,
            )
            if status == "attended":
                visit.attended_at = checked_in + timedelta(minutes=28)
                visit.attended_by_id = doctor.id
                visit.attended_by_name = doctor.full_name
            db.add(visit)
            db.flush()
            _seed_clinical_entries(
                db,
                patient=patient,
                visit=visit,
                doctor=doctor,
                nurse=nurse,
                when=checked_in,
                index=index,
                with_diagnosis=DEMO_DIAGNOSES[index % len(DEMO_DIAGNOSES)],
                with_prescription=index % 2 == 0,
                with_lab=DEMO_LABS[index % len(DEMO_LABS)] if index % 3 == 0 else None,
                vitals_only=status != "attended",
            )

        # One completed visit in the past month keeps the reports populated.
        has_history = db.scalar(
            select(func.count())
            .select_from(Visit)
            .where(Visit.patient_id == patient.id, Visit.checked_in_at < today_start)
        )
        if not has_history:
            when = today_start - timedelta(days=history_days_ago) + timedelta(hours=9 + index % 6)
            visit = Visit(
                id=new_id(),
                patient_id=patient.id,
                clinic_id=clinic.id if clinic else None,
                visit_type="follow_up",
                channel="hospital",
                bill_type=demo["bill"],
                assigned_doctor_id=doctor.id,
                assigned_doctor_name=doctor.full_name,
                status="attended",
                chief_complaint=demo["complaint"],
                checked_in_at=when,
                checked_in_by_id=doctor.id,
                checked_in_by_name=doctor.full_name,
                attended_at=when + timedelta(minutes=32),
                attended_by_id=doctor.id,
                attended_by_name=doctor.full_name,
            )
            db.add(visit)
            db.flush()
            _seed_clinical_entries(
                db,
                patient=patient,
                visit=visit,
                doctor=doctor,
                nurse=nurse,
                when=when,
                index=index + 3,
                with_diagnosis=DEMO_DIAGNOSES[(index + 5) % len(DEMO_DIAGNOSES)],
                with_prescription=index % 3 == 0,
                with_lab=DEMO_LABS[(index + 1) % len(DEMO_LABS)] if index % 4 == 0 else None,
                release_lab=True,
            )

    db.commit()
    print(f"demo data ready: {created} new patients, {len(DEMO_PATIENTS)} in total")


def remove_demo_data(db) -> int:
    """Delete every seeded demo record and the clinical entries that belong to it."""
    patient_ids = list(db.scalars(select(Patient.id).where(Patient.is_demo.is_(True))).all())
    if not patient_ids:
        print("no demo records to remove")
        return 0

    for model in (
        LabResult,
        LabRequest,
        Prescription,
        Diagnosis,
        ClinicalNote,
        VitalSigns,
        Allergy,
        Visit,
    ):
        db.execute(delete(model).where(model.patient_id.in_(patient_ids)))
    db.execute(delete(Patient).where(Patient.id.in_(patient_ids)))
    db.commit()
    print(f"removed {len(patient_ids)} demo patients and their clinical records")
    return len(patient_ids)


def main() -> None:
    Base.metadata.create_all(engine)
    migrate()

    if "--remove-demo" in sys.argv:
        db = SessionLocal()
        try:
            remove_demo_data(db)
        finally:
            db.close()
        return

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

        initial_password = settings.super_admin_password.strip()
        generated = not initial_password
        if generated:
            initial_password = secrets.token_urlsafe(9)
        if set_initial_password(db, admin, initial_password):
            if generated:
                print(f"generated super admin password: {initial_password} (change it after signing in)")
            else:
                print("super admin password set from SUPER_ADMIN_PASSWORD")

        for name, code in CLINICS:
            ensure_clinic(db, name, code)
        print(f"{len(CLINICS)} clinics ready")

        doctor = None
        nurse = None
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
                if role == Role.nurse:
                    nurse = person
                set_initial_password(db, person, PREVIEW_STAFF_PASSWORD)
                print(f"preview account ready: {person.email} ({person.role.value})")
            print(f"preview staff password: {PREVIEW_STAFF_PASSWORD}")
            if doctor is not None:
                ensure_demo_patients(db, doctor, nurse)
        else:
            print("preview accounts and demo patients skipped (BASE44_PREVIEW_MODE is not 1)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
