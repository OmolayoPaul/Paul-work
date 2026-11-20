from __future__ import annotations

import re
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile
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
    LabResult,
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
lab_entrant = require_roles(Role.super_admin, Role.lab_scientist)
dispenser = require_roles(Role.super_admin, Role.pharmacist)


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
                func.lower(func.coalesce(Patient.card_no, "")).like(term),
                func.lower(func.coalesce(Patient.phone, "")).like(term),
            )
        )
    patients = db.scalars(query.order_by(Patient.created_at.desc()).limit(limit)).all()
    latest = _last_visits(db, [patient.id for patient in patients])
    return {
        "items": [patient_summary(patient, latest.get(patient.id)) for patient in patients],
        "total": len(patients),
    }


@router.get("/duplicates")
def duplicate_patients(
    first_name: str | None = None,
    last_name: str | None = None,
    date_of_birth: str | None = None,
    phone: str | None = None,
    card_no: str | None = None,
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(get_current_staff),
) -> dict:
    """Possible existing records for a new patient (same name + DOB/phone/card)."""
    surname = (last_name or "").strip().lower()
    given = (first_name or "").strip().lower()
    dob = (date_of_birth or "").strip()
    phone_digits = re.sub(r"\D", "", phone or "")
    card = (card_no or "").strip().lower()

    conditions = []
    if surname:
        conditions.append(func.lower(Patient.last_name) == surname)
    if card:
        conditions.append(
            or_(
                func.lower(Patient.patient_no) == card,
                func.lower(func.coalesce(Patient.nhis_no, "")) == card,
                func.lower(func.coalesce(Patient.card_no, "")) == card,
            )
        )
    if phone_digits:
        conditions.append(func.coalesce(Patient.phone, "").like(f"%{phone_digits[-9:]}"))
    if not conditions:
        return {"items": []}

    candidates = db.scalars(
        select(Patient).where(or_(*conditions)).order_by(Patient.created_at.desc()).limit(50)
    ).all()

    items = []
    for patient in candidates:
        matched_on = []
        same_name = (
            patient.last_name.strip().lower() == surname
            and (not given or patient.first_name.strip().lower() == given)
        )
        if same_name and dob and patient.date_of_birth and patient.date_of_birth.isoformat() == dob:
            matched_on.append("name and date of birth")
        if phone_digits:
            existing = re.sub(r"\D", "", patient.phone or "")
            if existing and existing[-9:] == phone_digits[-9:]:
                matched_on.append("phone number")
        if card:
            if card in (
                (patient.patient_no or "").lower(),
                (patient.nhis_no or "").lower(),
                (patient.card_no or "").lower(),
            ):
                matched_on.append("card number")
        if not matched_on:
            continue
        items.append({**patient_summary(patient), "matched_on": matched_on})
    return {"items": items[:10]}


class PatientCreate(BaseModel):
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    other_name: str | None = Field(default=None, max_length=80)
    sex: str
    date_of_birth: date
    phone: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=255)
    address: str | None = Field(default=None, max_length=300)
    nhis_no: str | None = Field(default=None, max_length=40)
    card_no: str | None = Field(default=None, max_length=40)
    blood_group: str | None = Field(default=None, max_length=10)
    genotype: str | None = Field(default=None, max_length=10)
    next_of_kin: str | None = Field(default=None, max_length=160)
    next_of_kin_phone: str | None = Field(default=None, max_length=40)
    occupation: str | None = Field(default=None, max_length=120)
    marital_status: str | None = Field(default=None, max_length=20)
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
    email: str | None = Field(default=None, max_length=255)
    address: str | None = Field(default=None, max_length=300)
    nhis_no: str | None = Field(default=None, max_length=40)
    card_no: str | None = Field(default=None, max_length=40)
    blood_group: str | None = Field(default=None, max_length=10)
    genotype: str | None = Field(default=None, max_length=10)
    next_of_kin: str | None = Field(default=None, max_length=160)
    next_of_kin_phone: str | None = Field(default=None, max_length=40)
    occupation: str | None = Field(default=None, max_length=120)
    marital_status: str | None = Field(default=None, max_length=20)
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
        nhis_no=(payload.nhis_no or "").strip() or None,
        card_no=(payload.card_no or "").strip() or None,
        blood_group=payload.blood_group,
        genotype=(payload.genotype or "").strip().upper() or None,
        next_of_kin=(payload.next_of_kin or "").strip() or None,
        next_of_kin_phone=(payload.next_of_kin_phone or "").strip() or None,
        occupation=(payload.occupation or "").strip() or None,
        marital_status=(payload.marital_status or "").strip().lower() or None,
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
        ("nhis_no", "NHIS number"),
        ("card_no", "card number"),
        ("blood_group", "blood group"),
        ("genotype", "genotype"),
        ("next_of_kin", "next of kin"),
        ("next_of_kin_phone", "next of kin phone"),
        ("occupation", "occupation"),
        ("marital_status", "marital status"),
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
    note_rows = db.scalars(
        select(ClinicalNote)
        .where(ClinicalNote.patient_id == patient.id, ClinicalNote.is_deleted.is_(False))
        .order_by(ClinicalNote.created_at.desc())
    ).all()
    latest_notes: dict[str, ClinicalNote] = {}
    for row in note_rows:
        key = row.thread_id or row.id
        current = latest_notes.get(key)
        if current is None or (row.version or 1) > (current.version or 1):
            latest_notes[key] = row
    notes = sorted(latest_notes.values(), key=lambda row: row.created_at, reverse=True)
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
    note_id = new_id()
    note = ClinicalNote(
        id=note_id,
        thread_id=note_id,
        version=1,
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


class NoteUpdate(BaseModel):
    note_type: str | None = None
    subjective: str | None = None
    objective: str | None = None
    assessment: str | None = None
    plan: str | None = None


def _note_thread(db: OrmSession, note: ClinicalNote) -> str:
    return note.thread_id or note.id


@router.patch("/{patient_id}/notes/{note_id}")
def edit_note(
    patient_id: str,
    note_id: str,
    payload: NoteUpdate,
    request: Request,
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(clinical_writer),
) -> dict:
    """Edits are appended as a new version; the previous version is kept."""
    patient = _get_patient(db, patient_id)
    note = db.get(ClinicalNote, note_id)
    if note is None or note.patient_id != patient.id:
        raise HTTPException(
            status_code=404, detail={"code": "not_found", "message": "Clinical note not found."}
        )
    thread = _note_thread(db, note)
    if not note.thread_id:
        note.thread_id = thread

    versions = db.scalars(select(ClinicalNote).where(ClinicalNote.thread_id == thread)).all()
    next_version = max((row.version or 1) for row in versions) + 1

    merged = {
        "note_type": payload.note_type if payload.note_type is not None else note.note_type,
        "subjective": payload.subjective if payload.subjective is not None else note.subjective,
        "objective": payload.objective if payload.objective is not None else note.objective,
        "assessment": payload.assessment if payload.assessment is not None else note.assessment,
        "plan": payload.plan if payload.plan is not None else note.plan,
    }
    if not any(merged.values()):
        raise HTTPException(
            status_code=400,
            detail={"code": "empty_note", "message": "Write at least one section of the note."},
        )

    revised = ClinicalNote(
        id=new_id(),
        thread_id=thread,
        version=next_version,
        patient_id=patient.id,
        visit_id=note.visit_id,
        note_type=merged["note_type"] or "consultation",
        subjective=(merged["subjective"] or "").strip() or None,
        objective=(merged["objective"] or "").strip() or None,
        assessment=(merged["assessment"] or "").strip() or None,
        plan=(merged["plan"] or "").strip() or None,
        author_id=staff.id,
        author_name=staff.full_name,
    )
    db.add(revised)
    db.commit()
    log_event(
        db,
        action="note_edited",
        actor=staff,
        entity_type="patient",
        entity_id=patient.id,
        patient_id=patient.id,
        patient_name=patient_name(patient),
        summary=f"Clinical note edited for {patient_name(patient)} (version {next_version})",
        meta={"thread_id": thread, "version": next_version, "previous_id": note.id},
        request=request,
    )
    return note_public(revised)


@router.get("/{patient_id}/notes/{note_id}/versions")
def note_versions(
    patient_id: str,
    note_id: str,
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(get_current_staff),
) -> dict:
    patient = _get_patient(db, patient_id)
    note = db.get(ClinicalNote, note_id)
    if note is None or note.patient_id != patient.id:
        raise HTTPException(
            status_code=404, detail={"code": "not_found", "message": "Clinical note not found."}
        )
    thread = _note_thread(db, note)
    rows = db.scalars(
        select(ClinicalNote)
        .where(ClinicalNote.thread_id == thread)
        .order_by(ClinicalNote.version.desc())
    ).all()
    return {"items": [note_public(row) for row in rows]}


@router.delete("/{patient_id}/notes/{note_id}")
def delete_note(
    patient_id: str,
    note_id: str,
    request: Request,
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(clinical_writer),
) -> dict:
    """Hides the note from the record; the row and every version are kept."""
    patient = _get_patient(db, patient_id)
    note = db.get(ClinicalNote, note_id)
    if note is None or note.patient_id != patient.id:
        raise HTTPException(
            status_code=404, detail={"code": "not_found", "message": "Clinical note not found."}
        )
    thread = _note_thread(db, note)
    rows = db.scalars(select(ClinicalNote).where(ClinicalNote.thread_id == thread)).all()
    for row in rows:
        row.is_deleted = True
    if not note.thread_id:
        note.thread_id = thread
    db.commit()
    log_event(
        db,
        action="note_deleted",
        actor=staff,
        entity_type="patient",
        entity_id=patient.id,
        patient_id=patient.id,
        patient_name=patient_name(patient),
        summary=f"Clinical note hidden from the record of {patient_name(patient)}",
        meta={"thread_id": thread, "versions": len(rows)},
        request=request,
    )
    return {"ok": True, "thread_id": thread}


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


@router.post("/{patient_id}/prescriptions/{prescription_id}/dispense")
def dispense_prescription(
    patient_id: str,
    prescription_id: str,
    request: Request,
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(dispenser),
) -> dict:
    patient = _get_patient(db, patient_id)
    prescription = db.get(Prescription, prescription_id)
    if prescription is None or prescription.patient_id != patient.id:
        raise HTTPException(
            status_code=404,
            detail={"code": "not_found", "message": "Prescription not found."},
        )
    if prescription.status == "dispensed":
        raise HTTPException(
            status_code=400,
            detail={"code": "already_dispensed", "message": "This prescription was already dispensed."},
        )
    prescription.status = "dispensed"
    db.commit()
    _audit_entry(
        db,
        staff=staff,
        patient=patient,
        request=request,
        action="prescription_dispensed",
        summary=f"Dispensed prescription for {patient_name(patient)}: "
        + ", ".join(item.drug_name for item in prescription.items),
        visit=None,
        meta={"prescription_id": prescription.id},
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


class LabResultCreate(BaseModel):
    analyte: str | None = Field(default=None, max_length=120)
    result_value: str | None = Field(default=None, max_length=120)
    unit: str | None = Field(default=None, max_length=40)
    reference_range: str | None = Field(default=None, max_length=80)
    interpretation: str = "normal"
    notes: str | None = None
    result_summary: str | None = Field(default=None, max_length=300)


@router.post("/{patient_id}/lab-requests/{lab_id}/results", status_code=201)
def add_lab_result(
    patient_id: str,
    lab_id: str,
    payload: LabResultCreate,
    request: Request,
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(lab_entrant),
) -> dict:
    patient = _get_patient(db, patient_id)
    lab = db.get(LabRequest, lab_id)
    if lab is None or lab.patient_id != patient.id:
        raise HTTPException(
            status_code=404, detail={"code": "not_found", "message": "Lab request not found."}
        )
    if not any((payload.analyte, payload.result_value, payload.notes, payload.result_summary)):
        raise HTTPException(
            status_code=400,
            detail={"code": "empty_result", "message": "Enter the result before releasing it."},
        )

    interpretation = payload.interpretation if payload.interpretation in (
        "normal",
        "abnormal",
        "critical",
        "inconclusive",
    ) else "normal"
    result = LabResult(
        id=new_id(),
        lab_request_id=lab.id,
        patient_id=patient.id,
        analyte=(payload.analyte or "").strip() or None,
        result_value=(payload.result_value or "").strip() or None,
        unit=(payload.unit or "").strip() or None,
        reference_range=(payload.reference_range or "").strip() or None,
        interpretation=interpretation,
        notes=(payload.notes or "").strip() or None,
        status="released",
        entered_by_id=staff.id,
        entered_by_name=staff.full_name,
    )
    lab.results.append(result)
    lab.status = "completed"
    lab.result_summary = (payload.result_summary or "").strip() or " · ".join(
        part
        for part in (
            (payload.analyte or "").strip(),
            (payload.result_value or "").strip(),
            (payload.unit or "").strip(),
        )
        if part
    )
    db.commit()
    _audit_entry(
        db,
        staff=staff,
        patient=patient,
        request=request,
        action="lab_result_entered",
        summary=f"Lab result entered for {patient_name(patient)}: {lab.test_name}",
        visit=None,
        meta={"lab_request_id": lab.id, "interpretation": interpretation},
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


# ------------------------------------------------------------------ attachments

MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
ALLOWED_ATTACHMENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
}


@router.post("/{patient_id}/attachments", status_code=201)
async def upload_attachment(
    patient_id: str,
    request: Request,
    file: UploadFile = File(...),
    description: str | None = Form(default=None),
    kind: str = Form(default="document"),
    visit_id: str | None = Form(default=None),
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(registrar),
) -> dict:
    patient = _get_patient(db, patient_id)
    visit = _entry_visit(db, patient, visit_id) if visit_id else None

    data = await file.read()
    if not data:
        raise HTTPException(
            status_code=400,
            detail={"code": "empty_file", "message": "That file is empty. Choose another file."},
        )
    if len(data) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(
            status_code=413,
            detail={"code": "too_large", "message": "Attachments must be 10 MB or smaller."},
        )
    mime_type = (file.content_type or "").split(";")[0].strip().lower()
    if mime_type and mime_type not in ALLOWED_ATTACHMENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "unsupported_type",
                "message": "Upload a JPG, PNG, WEBP or PDF document.",
            },
        )

    attachment = Attachment(
        id=new_id(),
        patient_id=patient.id,
        visit_id=visit.id if visit else None,
        filename=(file.filename or "document")[:200],
        kind=kind if kind in ("document", "image", "result", "consent") else "document",
        description=(description or "").strip() or None,
        mime_type=mime_type or "application/octet-stream",
        size_bytes=len(data),
        content=data,
        uploaded_by_id=staff.id,
        uploaded_by_name=staff.full_name,
    )
    db.add(attachment)
    db.commit()
    _audit_entry(
        db,
        staff=staff,
        patient=patient,
        request=request,
        action="attachment_uploaded",
        summary=f"Attachment added to {patient_name(patient)}: {attachment.filename}",
        visit=visit,
        meta={"attachment_id": attachment.id, "size_bytes": attachment.size_bytes},
    )
    return attachment_public(attachment)


@router.get("/{patient_id}/attachments/{attachment_id}/download")
def download_attachment(
    patient_id: str,
    attachment_id: str,
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(get_current_staff),
) -> Response:
    attachment = db.get(Attachment, attachment_id)
    if attachment is None or attachment.patient_id != patient_id:
        raise HTTPException(
            status_code=404, detail={"code": "not_found", "message": "Attachment not found."}
        )
    safe_name = attachment.filename.replace('"', "").replace("\n", " ")
    return Response(
        content=attachment.content or b"",
        media_type=attachment.mime_type or "application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_name}"',
            "Cache-Control": "private, no-store",
        },
    )
