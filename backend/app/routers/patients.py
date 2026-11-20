from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session as OrmSession

from ..audit import log_event
from ..db import get_db
from ..deps import get_current_staff, require_roles
from ..models import (
    Allergy,
    Attachment,
    ClinicalNote,
    Clinic,
    Diagnosis,
    LabRequest,
    Patient,
    Prescription,
    PrescriptionItem,
    Role,
    Staff,
    Visit,
    VitalSigns,
    new_id,
)
from ..schemas import (
    allergy_public,
    attachment_public,
    build_timeline,
    diagnosis_public,
    lab_public,
    note_public,
    patient_name,
    patient_summary,
    prescription_public,
    visit_public,
    vital_public,
)
from ..utils import utcnow

router = APIRouter(prefix="/patients", tags=["patients"])

registrar = require_roles(Role.super_admin, Role.doctor, Role.nurse, Role.records_officer)
clinical_writer = require_roles(Role.super_admin, Role.doctor, Role.nurse)
prescriber = require_roles(Role.super_admin, Role.doctor)


def _get_patient(db: OrmSession, patient_id: str) -> Patient:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(
            status_code=404, detail={"code": "not_found", "message": "Patient record not found."}
        )
    return patient


def _get_visit(db: OrmSession, patient: Patient, visit_id: str | None) -> Visit | None:
    if visit_id:
        visit = db.get(Visit, visit_id)
        if visit is None or visit.patient_id != patient.id:
            raise HTTPException(
                status_code=404,
                detail={"code": "not_found", "message": "That visit does not belong to this patient."},
            )
        return visit
    return db.scalar(
        select(Visit).where(Visit.patient_id == patient.id).order_by(Visit.checked_in_at.desc()).limit(1)
    )


def _next_patient_no(db: OrmSession) -> str:
    prefix = f"AFD/{utcnow().year}/"
    latest = db.scalar(
        select(Patient.patient_no)
        .where(Patient.patient_no.like(f"{prefix}%"))
        .order_by(Patient.patient_no.desc())
        .limit(1)
    )
    sequence = 1
    if latest:
        try:
            sequence = int(latest.rsplit("/", 1)[-1]) + 1
        except ValueError:
            sequence = 1
    return f"{prefix}{sequence:04d}"


def _doctor_payload(db: OrmSession, doctor_id: str | None) -> tuple[str | None, str | None]:
    if not doctor_id:
        return None, None
    doctor = db.get(Staff, doctor_id)
    if doctor is None or doctor.role not in (Role.doctor, Role.super_admin):
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_doctor", "message": "Choose a doctor from the clinical staff list."},
        )
    return doctor.id, doctor.full_name


def _last_visits(db: OrmSession, patient_ids: list[str]) -> dict[str, Visit]:
    if not patient_ids:
        return {}
    rows = db.scalars(
        select(Visit)
        .where(Visit.patient_id.in_(patient_ids))
        .order_by(Visit.checked_in_at.desc())
    ).all()
    latest: dict[str, Visit] = {}
    for visit in rows:
        latest.setdefault(visit.patient_id, visit)
    return latest


@router.get("")
def list_patients(
    search: str | None = None,
    limit: int = Query(default=100, ge=1, le=300),
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(get_current_staff),
) -> dict:
    query = select(Patient)
    if search:
        term = f"%{search.strip().lower()}%"
        query = query.where(
            or_(
                func.lower(Patient.first_name).like(term),
                func.lower(Patient.last_name).like(term),
                func.lower(func.coalesce(Patient.other_name, "")).like(term),
                func.lower(Patient.patient_no).like(term),
                func.lower(func.coalesce(Patient.nhis_no, "")).like(term),
                func.lower(func.coalesce(Patient.phone, "")).like(term),
            )
        )
    patients = db.scalars(query.order_by(Patient.created_at.desc()).limit(limit)).all()
    latest = _last_visits(db, [patient.id for patient in patients])
    return {
        "items": [patient_summary(patient, latest.get(patient.id)) for patient in patients],
        "total": len(patients),
    }


def _split_allergies(text: str | None) -> list[str]:
    if not text:
        return []
    parts = [part.strip(" .;") for part in text.replace(";", ",").split(",")]
    seen: list[str] = []
    for part in parts:
        if part and part.lower() not in {item.lower() for item in seen}:
            seen.append(part)
    return seen


def _add_allergies(db: OrmSession, patient: Patient, staff: Staff, text: str | None) -> None:
    """Turn a free-text allergy list into the allergy records the record shows."""
    substances = _split_allergies(text)
    if not substances:
        return
    existing = {
        allergy.substance.strip().lower()
        for allergy in db.scalars(select(Allergy).where(Allergy.patient_id == patient.id)).all()
    }
    for substance in substances:
        if substance.lower() in existing:
            continue
        db.add(
            Allergy(
                id=new_id(),
                patient_id=patient.id,
                substance=substance[:160],
                severity="moderate",
                recorded_by_id=staff.id,
                recorded_by_name=staff.full_name,
            )
        )


def _add_scan_attachment(
    db: OrmSession,
    patient: Patient,
    staff: Staff,
    *,
    attach: bool,
    file_name: str | None,
    visit: Visit | None = None,
) -> None:
    """Record that a card was scanned. The image itself is never stored."""
    if not attach:
        return
    db.add(
        Attachment(
            id=new_id(),
            patient_id=patient.id,
            visit_id=visit.id if visit else None,
            filename=(file_name or "patient-card-scan")[:200],
            kind="patient_card",
            description="Patient card scanned for registration (image not stored)",
            uploaded_by_id=staff.id,
            uploaded_by_name=staff.full_name,
        )
    )


class PatientCreate(BaseModel):
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    other_name: str | None = Field(default=None, max_length=80)
    sex: str
    date_of_birth: date
    phone: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=160)
    address: str | None = Field(default=None, max_length=300)
    card_number: str | None = Field(default=None, max_length=60)
    nhis_no: str | None = Field(default=None, max_length=40)
    blood_group: str | None = Field(default=None, max_length=10)
    genotype: str | None = Field(default=None, max_length=10)
    occupation: str | None = Field(default=None, max_length=120)
    marital_status: str | None = Field(default=None, max_length=30)
    next_of_kin: str | None = Field(default=None, max_length=160)
    next_of_kin_phone: str | None = Field(default=None, max_length=40)
    allergies: str | None = Field(default=None, max_length=400)
    attach_scan: bool = False
    scan_file_name: str | None = Field(default=None, max_length=200)
    clinic_id: str | None = None

    check_in: bool = True
    visit_type: str = "new"
    channel: str = "hospital"
    bill_type: str = "self_pay"
    assigned_doctor_id: str | None = None
    chief_complaint: str | None = Field(default=None, max_length=300)

    @field_validator("sex")
    @classmethod
    def valid_sex(cls, value: str) -> str:
        sex = value.strip().lower()
        if sex not in ("male", "female"):
            raise ValueError("Sex must be male or female")
        return sex

    @field_validator("date_of_birth")
    @classmethod
    def valid_dob(cls, value: date) -> date:
        if value > utcnow().date():
            raise ValueError("Date of birth cannot be in the future")
        return value

    @field_validator("visit_type")
    @classmethod
    def valid_visit_type(cls, value: str) -> str:
        if value not in ("new", "follow_up"):
            raise ValueError("Visit type must be new or follow_up")
        return value

    @field_validator("channel")
    @classmethod
    def valid_channel(cls, value: str) -> str:
        if value not in ("hospital", "telemed"):
            raise ValueError("Channel must be hospital or telemed")
        return value

    @field_validator("bill_type")
    @classmethod
    def valid_bill_type(cls, value: str) -> str:
        if value not in ("self_pay", "insurance"):
            raise ValueError("Bill type must be self_pay or insurance")
        return value


class PatientUpdate(BaseModel):
    phone: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=160)
    address: str | None = Field(default=None, max_length=300)
    card_number: str | None = Field(default=None, max_length=60)
    nhis_no: str | None = Field(default=None, max_length=40)
    blood_group: str | None = Field(default=None, max_length=10)
    genotype: str | None = Field(default=None, max_length=10)
    occupation: str | None = Field(default=None, max_length=120)
    marital_status: str | None = Field(default=None, max_length=30)
    next_of_kin: str | None = Field(default=None, max_length=160)
    next_of_kin_phone: str | None = Field(default=None, max_length=40)
    allergies: str | None = Field(default=None, max_length=400)
    attach_scan: bool = False
    scan_file_name: str | None = Field(default=None, max_length=200)
    clinic_id: str | None = None


@router.post("", status_code=201)
def create_patient(
    payload: PatientCreate,
    request: Request,
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(registrar),
) -> dict:
    clinic = db.get(Clinic, payload.clinic_id) if payload.clinic_id else None
    if payload.clinic_id and clinic is None:
        raise HTTPException(
            status_code=400, detail={"code": "invalid_clinic", "message": "Choose a valid clinic."}
        )

    doctor_id, doctor_name = _doctor_payload(db, payload.assigned_doctor_id)

    patient = Patient(
        id=new_id(),
        patient_no=_next_patient_no(db),
        first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(),
        other_name=(payload.other_name or "").strip() or None,
        sex=payload.sex,
        date_of_birth=payload.date_of_birth,
        phone=(payload.phone or "").strip() or None,
        email=(payload.email or "").strip() or None,
        address=(payload.address or "").strip() or None,
        card_number=(payload.card_number or "").strip() or None,
        nhis_no=(payload.nhis_no or "").strip() or None,
        blood_group=payload.blood_group,
        genotype=(payload.genotype or "").strip() or None,
        occupation=(payload.occupation or "").strip() or None,
        marital_status=(payload.marital_status or "").strip() or None,
        next_of_kin=(payload.next_of_kin or "").strip() or None,
        next_of_kin_phone=(payload.next_of_kin_phone or "").strip() or None,
        clinic_id=clinic.id if clinic else None,
        registered_by_id=staff.id,
        registered_by_name=staff.full_name,
    )
    db.add(patient)
    db.flush()

    visit = None
    if payload.check_in:
        visit = Visit(
            id=new_id(),
            patient_id=patient.id,
            clinic_id=clinic.id if clinic else None,
            visit_type=payload.visit_type,
            channel=payload.channel,
            bill_type=payload.bill_type,
            assigned_doctor_id=doctor_id,
            assigned_doctor_name=doctor_name,
            status="pending",
            chief_complaint=(payload.chief_complaint or "").strip() or None,
            checked_in_by_id=staff.id,
            checked_in_by_name=staff.full_name,
        )
        db.add(visit)

    _add_allergies(db, patient, staff, payload.allergies)
    _add_scan_attachment(
        db,
        patient,
        staff,
        attach=payload.attach_scan,
        file_name=payload.scan_file_name,
        visit=visit,
    )
    db.commit()

    log_event(
        db,
        action="patient_created",
        actor=staff,
        entity_type="patient",
        entity_id=patient.id,
        patient_id=patient.id,
        patient_name=patient_name(patient),
        summary=f"Registered {patient_name(patient)} ({patient.patient_no})",
        meta={
            "patient_no": patient.patient_no,
            "clinic": clinic.name if clinic else None,
            "checked_in": bool(visit),
        },
        request=request,
    )
    if visit is not None:
        log_event(
            db,
            action="visit_checked_in",
            actor=staff,
            entity_type="visit",
            entity_id=visit.id,
            patient_id=patient.id,
            patient_name=patient_name(patient),
            summary=f"Checked in to {clinic.name if clinic else 'clinic'}",
            meta={"channel": visit.channel, "bill_type": visit.bill_type},
            request=request,
        )

    return {
        "patient": patient_summary(patient, visit),
        "visit": visit_public(visit) if visit else None,
    }


@router.patch("/{patient_id}")
def update_patient(
    patient_id: str,
    payload: PatientUpdate,
    request: Request,
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(registrar),
) -> dict:
    patient = _get_patient(db, patient_id)
    changes: dict[str, tuple[str, str]] = {}

    for field, label in (
        ("phone", "phone"),
        ("email", "email"),
        ("address", "address"),
        ("card_number", "card number"),
        ("nhis_no", "NHIS number"),
        ("blood_group", "blood group"),
        ("genotype", "genotype"),
        ("occupation", "occupation"),
        ("marital_status", "marital status"),
        ("next_of_kin", "next of kin"),
        ("next_of_kin_phone", "next of kin phone"),
    ):
        value = getattr(payload, field)
        if value is not None and value != getattr(patient, field):
            changes[label] = (getattr(patient, field) or "", value)
            setattr(patient, field, value)

    if payload.clinic_id is not None and payload.clinic_id != patient.clinic_id:
        clinic = db.get(Clinic, payload.clinic_id) if payload.clinic_id else None
        if payload.clinic_id and clinic is None:
            raise HTTPException(
                status_code=400, detail={"code": "invalid_clinic", "message": "Choose a valid clinic."}
            )
        changes["clinic"] = (patient.clinic.name if patient.clinic else "", clinic.name if clinic else "")
        patient.clinic_id = clinic.id if clinic else None

    if payload.allergies and _split_allergies(payload.allergies):
        _add_allergies(db, patient, staff, payload.allergies)
        changes["allergies"] = ("", payload.allergies.strip())

    _add_scan_attachment(
        db,
        patient,
        staff,
        attach=payload.attach_scan,
        file_name=payload.scan_file_name,
    )

    patient.updated_at = utcnow()
    db.commit()

    if changes:
        log_event(
            db,
            action="patient_updated",
            actor=staff,
            entity_type="patient",
            entity_id=patient.id,
            patient_id=patient.id,
            patient_name=patient_name(patient),
            summary=f"{patient_name(patient)}: updated {', '.join(changes)}",
            meta={"changes": {key: {"from": value[0], "to": value[1]} for key, value in changes.items()}},
            request=request,
        )

    return patient_summary(patient, _get_visit(db, patient, None))


@router.get("/{patient_id}")
def patient_detail(
    patient_id: str,
    request: Request,
    visit_id: str | None = Query(default=None),
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(get_current_staff),
) -> dict:
    patient = _get_patient(db, patient_id)
    visits = db.scalars(
        select(Visit).where(Visit.patient_id == patient.id).order_by(Visit.checked_in_at.desc())
    ).all()
    current = _get_visit(db, patient, visit_id) or (visits[0] if visits else None)

    vitals = db.scalars(
        select(VitalSigns).where(VitalSigns.patient_id == patient.id).order_by(VitalSigns.recorded_at.desc())
    ).all()
    notes = db.scalars(
        select(ClinicalNote).where(ClinicalNote.patient_id == patient.id).order_by(ClinicalNote.created_at.desc())
    ).all()
    diagnoses = db.scalars(
        select(Diagnosis).where(Diagnosis.patient_id == patient.id).order_by(Diagnosis.created_at.desc())
    ).all()
    prescriptions = db.scalars(
        select(Prescription).where(Prescription.patient_id == patient.id).order_by(Prescription.created_at.desc())
    ).all()
    labs = db.scalars(
        select(LabRequest).where(LabRequest.patient_id == patient.id).order_by(LabRequest.created_at.desc())
    ).all()
    allergies = db.scalars(
        select(Allergy).where(Allergy.patient_id == patient.id).order_by(Allergy.created_at.desc())
    ).all()
    attachments = db.scalars(
        select(Attachment).where(Attachment.patient_id == patient.id).order_by(Attachment.created_at.desc())
    ).all()

    log_event(
        db,
        action="patient_viewed",
        actor=staff,
        entity_type="patient",
        entity_id=patient.id,
        patient_id=patient.id,
        patient_name=patient_name(patient),
        summary=f"Opened {patient_name(patient)} ({patient.patient_no})",
        request=request,
    )

    return {
        "patient": patient_summary(patient, visits[0] if visits else None),
        "visits": [visit_public(visit) for visit in visits],
        "current_visit": visit_public(current) if current else None,
        "allergies": [allergy_public(allergy) for allergy in allergies],
        "vitals": [vital_public(vital) for vital in vitals],
        "notes": [note_public(note) for note in notes],
        "diagnoses": [diagnosis_public(diagnosis) for diagnosis in diagnoses],
        "prescriptions": [prescription_public(prescription) for prescription in prescriptions],
        "lab_requests": [lab_public(lab) for lab in labs],
        "attachments": [attachment_public(attachment) for attachment in attachments],
        "timeline": build_timeline(
            vitals=vitals,
            notes=notes,
            diagnoses=diagnoses,
            prescriptions=prescriptions,
            labs=labs,
            allergies=allergies,
            attachments=attachments,
        ),
    }


class VisitCreate(BaseModel):
    visit_type: str = "follow_up"
    channel: str = "hospital"
    bill_type: str = "self_pay"
    clinic_id: str | None = None
    assigned_doctor_id: str | None = None
    chief_complaint: str | None = Field(default=None, max_length=300)


@router.post("/{patient_id}/visits", status_code=201)
def check_in_patient(
    patient_id: str,
    payload: VisitCreate,
    request: Request,
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(registrar),
) -> dict:
    patient = _get_patient(db, patient_id)
    clinic = db.get(Clinic, payload.clinic_id) if payload.clinic_id else patient.clinic
    if payload.clinic_id and clinic is None:
        raise HTTPException(
            status_code=400, detail={"code": "invalid_clinic", "message": "Choose a valid clinic."}
        )
    doctor_id, doctor_name = _doctor_payload(db, payload.assigned_doctor_id)

    visit = Visit(
        id=new_id(),
        patient_id=patient.id,
        clinic_id=clinic.id if clinic else None,
        visit_type=payload.visit_type if payload.visit_type in ("new", "follow_up") else "follow_up",
        channel=payload.channel if payload.channel in ("hospital", "telemed") else "hospital",
        bill_type=payload.bill_type if payload.bill_type in ("self_pay", "insurance") else "self_pay",
        assigned_doctor_id=doctor_id,
        assigned_doctor_name=doctor_name,
        status="pending",
        chief_complaint=(payload.chief_complaint or "").strip() or None,
        checked_in_by_id=staff.id,
        checked_in_by_name=staff.full_name,
    )
    db.add(visit)
    db.commit()

    log_event(
        db,
        action="visit_checked_in",
        actor=staff,
        entity_type="visit",
        entity_id=visit.id,
        patient_id=patient.id,
        patient_name=patient_name(patient),
        summary=f"Checked in to {clinic.name if clinic else 'clinic'} ({visit.channel})",
        meta={"visit_type": visit.visit_type, "bill_type": visit.bill_type},
        request=request,
    )
    return visit_public(visit)


# ---------------------------------------------------------------- clinical entries


def _entry_visit(db: OrmSession, patient: Patient, visit_id: str | None) -> Visit | None:
    return _get_visit(db, patient, visit_id)


def _audit_entry(
    db: OrmSession,
    *,
    staff: Staff,
    patient: Patient,
    request: Request,
    action: str,
    summary: str,
    visit: Visit | None,
    meta: dict | None = None,
) -> None:
    log_event(
        db,
        action=action,
        actor=staff,
        entity_type="patient",
        entity_id=patient.id,
        patient_id=patient.id,
        patient_name=patient_name(patient),
        summary=summary,
        meta=meta or ({"visit_id": visit.id} if visit else None),
        request=request,
    )


class VitalsCreate(BaseModel):
    visit_id: str | None = None
    temperature: float | None = Field(default=None, ge=25, le=45)
    pulse: int | None = Field(default=None, ge=20, le=250)
    respiratory_rate: int | None = Field(default=None, ge=5, le=80)
    systolic: int | None = Field(default=None, ge=40, le=300)
    diastolic: int | None = Field(default=None, ge=20, le=200)
    spo2: int | None = Field(default=None, ge=40, le=100)
    weight: float | None = Field(default=None, ge=0.3, le=400)
    height: float | None = Field(default=None, ge=20, le=260)
    notes: str | None = Field(default=None, max_length=300)


@router.post("/{patient_id}/vitals", status_code=201)
def add_vitals(
    patient_id: str,
    payload: VitalsCreate,
    request: Request,
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(clinical_writer),
) -> dict:
    patient = _get_patient(db, patient_id)
    visit = _entry_visit(db, patient, payload.visit_id)
    vital = VitalSigns(
        id=new_id(),
        patient_id=patient.id,
        visit_id=visit.id if visit else None,
        temperature=payload.temperature,
        pulse=payload.pulse,
        respiratory_rate=payload.respiratory_rate,
        systolic=payload.systolic,
        diastolic=payload.diastolic,
        spo2=payload.spo2,
        weight=payload.weight,
        height=payload.height,
        notes=(payload.notes or "").strip() or None,
        recorded_by_id=staff.id,
        recorded_by_name=staff.full_name,
    )
    db.add(vital)
    db.commit()
    _audit_entry(
        db,
        staff=staff,
        patient=patient,
        request=request,
        action="vitals_recorded",
        summary=f"Vital signs recorded for {patient_name(patient)}",
        visit=visit,
        meta={"visit_id": visit.id if visit else None, "recorded": vital_public(vital)},
    )
    return vital_public(vital)


class NoteCreate(BaseModel):
    visit_id: str | None = None
    note_type: str = "consultation"
    subjective: str | None = None
    objective: str | None = None
    assessment: str | None = None
    plan: str | None = None


@router.post("/{patient_id}/notes", status_code=201)
def add_note(
    patient_id: str,
    payload: NoteCreate,
    request: Request,
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(clinical_writer),
) -> dict:
    if not any((payload.subjective, payload.objective, payload.assessment, payload.plan)):
        raise HTTPException(
            status_code=400,
            detail={"code": "empty_note", "message": "Write at least one section of the note."},
        )
    patient = _get_patient(db, patient_id)
    visit = _entry_visit(db, patient, payload.visit_id)
    note = ClinicalNote(
        id=new_id(),
        patient_id=patient.id,
        visit_id=visit.id if visit else None,
        note_type=payload.note_type if payload.note_type else "consultation",
        subjective=(payload.subjective or "").strip() or None,
        objective=(payload.objective or "").strip() or None,
        assessment=(payload.assessment or "").strip() or None,
        plan=(payload.plan or "").strip() or None,
        author_id=staff.id,
        author_name=staff.full_name,
    )
    db.add(note)
    db.commit()
    _audit_entry(
        db,
        staff=staff,
        patient=patient,
        request=request,
        action="note_added",
        summary=f"Clinical note added for {patient_name(patient)}",
        visit=visit,
    )
    return note_public(note)


class DiagnosisCreate(BaseModel):
    visit_id: str | None = None
    description: str = Field(min_length=2, max_length=300)
    code: str | None = Field(default=None, max_length=20)
    diagnosis_type: str = "primary"


@router.post("/{patient_id}/diagnoses", status_code=201)
def add_diagnosis(
    patient_id: str,
    payload: DiagnosisCreate,
    request: Request,
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(prescriber),
) -> dict:
    patient = _get_patient(db, patient_id)
    visit = _entry_visit(db, patient, payload.visit_id)
    diagnosis = Diagnosis(
        id=new_id(),
        patient_id=patient.id,
        visit_id=visit.id if visit else None,
        description=payload.description.strip(),
        code=(payload.code or "").strip() or None,
        diagnosis_type=payload.diagnosis_type if payload.diagnosis_type in ("primary", "secondary") else "primary",
        recorded_by_id=staff.id,
        recorded_by_name=staff.full_name,
    )
    db.add(diagnosis)
    db.commit()
    _audit_entry(
        db,
        staff=staff,
        patient=patient,
        request=request,
        action="diagnosis_recorded",
        summary=f"Diagnosis recorded for {patient_name(patient)}: {diagnosis.description}",
        visit=visit,
    )
    return diagnosis_public(diagnosis)


class PrescriptionItemCreate(BaseModel):
    drug_name: str = Field(min_length=2, max_length=160)
    dose: str | None = Field(default=None, max_length=80)
    frequency: str | None = Field(default=None, max_length=80)
    duration: str | None = Field(default=None, max_length=80)
    route: str | None = Field(default=None, max_length=60)
    quantity: str | None = Field(default=None, max_length=40)


class PrescriptionCreate(BaseModel):
    visit_id: str | None = None
    notes: str | None = Field(default=None, max_length=300)
    items: list[PrescriptionItemCreate] = Field(min_length=1, max_length=20)


@router.post("/{patient_id}/prescriptions", status_code=201)
def add_prescription(
    patient_id: str,
    payload: PrescriptionCreate,
    request: Request,
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(prescriber),
) -> dict:
    patient = _get_patient(db, patient_id)
    visit = _entry_visit(db, patient, payload.visit_id)
    prescription = Prescription(
        id=new_id(),
        patient_id=patient.id,
        visit_id=visit.id if visit else None,
        status="open",
        notes=(payload.notes or "").strip() or None,
        prescribed_by_id=staff.id,
        prescribed_by_name=staff.full_name,
    )
    prescription.items = [
        PrescriptionItem(
            id=new_id(),
            drug_name=item.drug_name.strip(),
            dose=item.dose,
            frequency=item.frequency,
            duration=item.duration,
            route=item.route,
            quantity=item.quantity,
        )
        for item in payload.items
    ]
    db.add(prescription)
    db.commit()
    _audit_entry(
        db,
        staff=staff,
        patient=patient,
        request=request,
        action="prescription_recorded",
        summary=f"Prescription for {patient_name(patient)}: "
        + ", ".join(item.drug_name for item in prescription.items),
        visit=visit,
    )
    return prescription_public(prescription)


class LabCreate(BaseModel):
    visit_id: str | None = None
    test_name: str = Field(min_length=2, max_length=200)
    specimen: str | None = Field(default=None, max_length=80)


@router.post("/{patient_id}/lab-requests", status_code=201)
def add_lab_request(
    patient_id: str,
    payload: LabCreate,
    request: Request,
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(prescriber),
) -> dict:
    patient = _get_patient(db, patient_id)
    visit = _entry_visit(db, patient, payload.visit_id)
    lab = LabRequest(
        id=new_id(),
        patient_id=patient.id,
        visit_id=visit.id if visit else None,
        test_name=payload.test_name.strip(),
        specimen=(payload.specimen or "").strip() or None,
        status="pending",
        requested_by_id=staff.id,
        requested_by_name=staff.full_name,
    )
    db.add(lab)
    db.commit()
    _audit_entry(
        db,
        staff=staff,
        patient=patient,
        request=request,
        action="lab_requested",
        summary=f"Lab request for {patient_name(patient)}: {lab.test_name}",
        visit=visit,
    )
    return lab_public(lab)


class AllergyCreate(BaseModel):
    substance: str = Field(min_length=2, max_length=160)
    reaction: str | None = Field(default=None, max_length=200)
    severity: str = "moderate"


@router.post("/{patient_id}/allergies", status_code=201)
def add_allergy(
    patient_id: str,
    payload: AllergyCreate,
    request: Request,
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(clinical_writer),
) -> dict:
    patient = _get_patient(db, patient_id)
    allergy = Allergy(
        id=new_id(),
        patient_id=patient.id,
        substance=payload.substance.strip(),
        reaction=(payload.reaction or "").strip() or None,
        severity=payload.severity if payload.severity in ("mild", "moderate", "severe") else "moderate",
        recorded_by_id=staff.id,
        recorded_by_name=staff.full_name,
    )
    db.add(allergy)
    db.commit()
    _audit_entry(
        db,
        staff=staff,
        patient=patient,
        request=request,
        action="allergy_recorded",
        summary=f"Allergy recorded for {patient_name(patient)}: {allergy.substance}",
        visit=None,
        meta={"severity": allergy.severity},
    )
    return allergy_public(allergy)
