from __future__ import annotations

from datetime import date, datetime, timezone

from .models import (
    Allergy,
    Attachment,
    AuditEvent,
    ClinicalNote,
    Diagnosis,
    LabRequest,
    LabResult,
    Patient,
    Prescription,
    Staff,
    Visit,
    VitalSigns,
)
from .utils import iso, utcnow

SEX_LABELS = {"male": "Male", "female": "Female"}


def staff_public(staff: Staff) -> dict:
    return {
        "id": staff.id,
        "full_name": staff.full_name,
        "email": staff.email,
        "phone": staff.phone,
        "staff_id": staff.staff_id,
        "role": staff.role.value,
        "department": staff.department,
        "status": staff.status.value,
        "avatar_url": staff.avatar_url,
        "last_login_at": iso(staff.last_login_at),
        "created_at": iso(staff.created_at),
    }


def audit_public(event: AuditEvent) -> dict:
    return {
        "id": event.id,
        "actor_name": event.actor_name,
        "actor_email": event.actor_email,
        "actor_role": event.actor_role,
        "action": event.action,
        "entity_type": event.entity_type,
        "entity_id": event.entity_id,
        "patient_id": event.patient_id,
        "patient_name": event.patient_name,
        "summary": event.summary,
        "meta": event.meta,
        "ip": event.ip,
        "created_at": iso(event.created_at),
    }


def age_of(dob: date | None, today: date | None = None) -> int | None:
    if dob is None:
        return None
    today = today or utcnow().date()
    years = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    return max(years, 0)


def age_display(dob: date | None) -> str:
    if dob is None:
        return "—"
    days = (utcnow().date() - dob).days
    if days < 31:
        return f"{max(days, 0)}d"
    if days < 365:
        return f"{days // 30}mo"
    return f"{age_of(dob)}y"


def patient_name(patient: Patient) -> str:
    parts = [patient.first_name, patient.other_name, patient.last_name]
    return " ".join(part for part in parts if part)


def patient_summary(patient: Patient, last_visit: Visit | None = None) -> dict:
    return {
        "id": patient.id,
        "patient_no": patient.patient_no,
        "first_name": patient.first_name,
        "last_name": patient.last_name,
        "other_name": patient.other_name,
        "full_name": patient_name(patient),
        "sex": patient.sex,
        "sex_label": SEX_LABELS.get(patient.sex, patient.sex.title()),
        "date_of_birth": patient.date_of_birth.isoformat() if patient.date_of_birth else None,
        "age": age_of(patient.date_of_birth),
        "age_display": age_display(patient.date_of_birth),
        "phone": patient.phone,
        "email": patient.email,
        "address": patient.address,
        "nhis_no": patient.nhis_no,
        "card_no": patient.card_no,
        "blood_group": patient.blood_group,
        "genotype": patient.genotype,
        "next_of_kin": patient.next_of_kin,
        "next_of_kin_phone": patient.next_of_kin_phone,
        "occupation": patient.occupation,
        "marital_status": patient.marital_status,
        "clinic": clinic_public(patient.clinic) if patient.clinic else None,
        "registered_by_name": patient.registered_by_name,
        "is_demo": bool(patient.is_demo),
        "created_at": iso(patient.created_at),
        "last_visit_at": iso(last_visit.checked_in_at) if last_visit else None,
        "last_visit_status": last_visit.status if last_visit else None,
    }


def clinic_public(clinic) -> dict:
    return {"id": clinic.id, "name": clinic.name, "code": clinic.code}


def visit_public(visit: Visit) -> dict:
    return {
        "id": visit.id,
        "patient_id": visit.patient_id,
        "clinic": clinic_public(visit.clinic) if visit.clinic else None,
        "visit_type": visit.visit_type,
        "channel": visit.channel,
        "bill_type": visit.bill_type,
        "assigned_doctor_id": visit.assigned_doctor_id,
        "assigned_doctor_name": visit.assigned_doctor_name,
        "status": visit.status,
        "chief_complaint": visit.chief_complaint,
        "checked_in_at": iso(visit.checked_in_at),
        "checked_in_by_name": visit.checked_in_by_name,
        "attended_at": iso(visit.attended_at),
        "attended_by_name": visit.attended_by_name,
    }


def vital_public(vital: VitalSigns) -> dict:
    return {
        "id": vital.id,
        "visit_id": vital.visit_id,
        "temperature": vital.temperature,
        "pulse": vital.pulse,
        "respiratory_rate": vital.respiratory_rate,
        "systolic": vital.systolic,
        "diastolic": vital.diastolic,
        "spo2": vital.spo2,
        "weight": vital.weight,
        "height": vital.height,
        "notes": vital.notes,
        "recorded_by_name": vital.recorded_by_name,
        "recorded_at": iso(vital.recorded_at),
    }


def note_public(note: ClinicalNote) -> dict:
    return {
        "id": note.id,
        "thread_id": note.thread_id or note.id,
        "version": note.version or 1,
        "visit_id": note.visit_id,
        "note_type": note.note_type,
        "subjective": note.subjective,
        "objective": note.objective,
        "assessment": note.assessment,
        "plan": note.plan,
        "author_name": note.author_name,
        "created_at": iso(note.created_at),
    }


def diagnosis_public(diagnosis: Diagnosis) -> dict:
    return {
        "id": diagnosis.id,
        "visit_id": diagnosis.visit_id,
        "description": diagnosis.description,
        "code": diagnosis.code,
        "diagnosis_type": diagnosis.diagnosis_type,
        "recorded_by_name": diagnosis.recorded_by_name,
        "created_at": iso(diagnosis.created_at),
    }


def prescription_public(prescription: Prescription) -> dict:
    return {
        "id": prescription.id,
        "visit_id": prescription.visit_id,
        "status": prescription.status,
        "notes": prescription.notes,
        "prescribed_by_name": prescription.prescribed_by_name,
        "created_at": iso(prescription.created_at),
        "items": [
            {
                "id": item.id,
                "drug_name": item.drug_name,
                "dose": item.dose,
                "frequency": item.frequency,
                "duration": item.duration,
                "route": item.route,
                "quantity": item.quantity,
            }
            for item in prescription.items
        ],
    }


def lab_result_public(result: LabResult) -> dict:
    return {
        "id": result.id,
        "analyte": result.analyte,
        "result_value": result.result_value,
        "unit": result.unit,
        "reference_range": result.reference_range,
        "interpretation": result.interpretation,
        "notes": result.notes,
        "status": result.status,
        "entered_by_name": result.entered_by_name,
        "created_at": iso(result.created_at),
    }


def lab_public(lab: LabRequest) -> dict:
    return {
        "id": lab.id,
        "visit_id": lab.visit_id,
        "test_name": lab.test_name,
        "specimen": lab.specimen,
        "status": lab.status,
        "result_summary": lab.result_summary,
        "requested_by_name": lab.requested_by_name,
        "created_at": iso(lab.created_at),
        "results": [lab_result_public(result) for result in lab.results],
    }


def allergy_public(allergy: Allergy) -> dict:
    return {
        "id": allergy.id,
        "substance": allergy.substance,
        "reaction": allergy.reaction,
        "severity": allergy.severity,
        "recorded_by_name": allergy.recorded_by_name,
        "created_at": iso(allergy.created_at),
    }


def attachment_public(attachment: Attachment) -> dict:
    return {
        "id": attachment.id,
        "visit_id": attachment.visit_id,
        "filename": attachment.filename,
        "kind": attachment.kind,
        "description": attachment.description,
        "mime_type": attachment.mime_type,
        "size_bytes": attachment.size_bytes,
        "uploaded_by_name": attachment.uploaded_by_name,
        "created_at": iso(attachment.created_at),
        "download_url": f"/api/patients/{attachment.patient_id}/attachments/{attachment.id}/download",
    }


def _as_datetime(value: datetime | str | None) -> datetime:
    if value is None:
        return datetime.min.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        parsed = datetime.fromisoformat(value)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def build_timeline(
    *,
    vitals: list[VitalSigns],
    notes: list[ClinicalNote],
    diagnoses: list[Diagnosis],
    prescriptions: list[Prescription],
    labs: list[LabRequest],
    allergies: list[Allergy],
    attachments: list[Attachment],
) -> list[dict]:
    """One newest-first feed of everything recorded for a patient."""
    entries: list[dict] = []

    for vital in vitals:
        parts = []
        if vital.systolic and vital.diastolic:
            parts.append(f"BP {vital.systolic}/{vital.diastolic}")
        if vital.pulse:
            parts.append(f"Pulse {vital.pulse}")
        if vital.temperature:
            parts.append(f"Temp {vital.temperature}°C")
        if vital.spo2:
            parts.append(f"SpO₂ {vital.spo2}%")
        if vital.weight:
            parts.append(f"Weight {vital.weight}kg")
        entries.append(
            {
                "id": vital.id,
                "kind": "vitals",
                "title": "Vital signs recorded",
                "summary": " · ".join(parts) or "Vital signs recorded",
                "author": vital.recorded_by_name,
                "at": iso(vital.recorded_at),
                "visit_id": vital.visit_id,
                "meta": {"recorded_at": iso(vital.recorded_at)},
            }
        )

    for note in notes:
        entries.append(
            {
                "id": note.id,
                "kind": "note",
                "title": "Clinical note",
                "summary": note.assessment or note.subjective or note.plan or "Consultation note",
                "author": note.author_name,
                "at": iso(note.created_at),
                "visit_id": note.visit_id,
                "meta": {
                    "note_type": note.note_type,
                    "version": note.version or 1,
                    "thread_id": note.thread_id or note.id,
                    "subjective": note.subjective,
                    "objective": note.objective,
                    "assessment": note.assessment,
                    "plan": note.plan,
                },
            }
        )

    for diagnosis in diagnoses:
        entries.append(
            {
                "id": diagnosis.id,
                "kind": "diagnosis",
                "title": "Diagnosis",
                "summary": f"{diagnosis.description}"
                + (f" · ICD {diagnosis.code}" if diagnosis.code else ""),
                "author": diagnosis.recorded_by_name,
                "at": iso(diagnosis.created_at),
                "visit_id": diagnosis.visit_id,
                "meta": {"type": diagnosis.diagnosis_type, "code": diagnosis.code},
            }
        )

    for prescription in prescriptions:
        drugs = ", ".join(item.drug_name for item in prescription.items) or "No items"
        entries.append(
            {
                "id": prescription.id,
                "kind": "prescription",
                "title": "Prescription",
                "summary": f"{len(prescription.items)} item(s) · {drugs}",
                "author": prescription.prescribed_by_name,
                "at": iso(prescription.created_at),
                "visit_id": prescription.visit_id,
                "meta": {
                    "status": prescription.status,
                    "items": [
                        {
                            "drug_name": item.drug_name,
                            "dose": item.dose,
                            "frequency": item.frequency,
                            "duration": item.duration,
                        }
                        for item in prescription.items
                    ],
                },
            }
        )

    for lab in labs:
        entries.append(
            {
                "id": lab.id,
                "kind": "lab",
                "title": "Lab request",
                "summary": f"{lab.test_name} · {lab.status.replace('_', ' ')}",
                "author": lab.requested_by_name,
                "at": iso(lab.created_at),
                "visit_id": lab.visit_id,
                "meta": {"specimen": lab.specimen, "status": lab.status},
            }
        )

    for allergy in allergies:
        entries.append(
            {
                "id": allergy.id,
                "kind": "allergy",
                "title": "Allergy recorded",
                "summary": f"{allergy.substance} · {allergy.severity}"
                + (f" · {allergy.reaction}" if allergy.reaction else ""),
                "author": allergy.recorded_by_name,
                "at": iso(allergy.created_at),
                "visit_id": None,
                "meta": {"severity": allergy.severity},
            }
        )

    for attachment in attachments:
        entries.append(
            {
                "id": attachment.id,
                "kind": "attachment",
                "title": "Attachment",
                "summary": attachment.filename
                + (f" · {attachment.description}" if attachment.description else ""),
                "author": attachment.uploaded_by_name,
                "at": iso(attachment.created_at),
                "visit_id": attachment.visit_id,
                "meta": {
                    "kind": attachment.kind,
                    "filename": attachment.filename,
                    "download_url": f"/api/patients/{attachment.patient_id}/attachments/{attachment.id}/download",
                },
            }
        )

    entries.sort(key=lambda entry: _as_datetime(entry["at"]), reverse=True)
    return entries
