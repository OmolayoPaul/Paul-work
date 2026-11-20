from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session as OrmSession

from ..audit import log_event
from ..db import get_db
from ..deps import get_current_staff, require_roles
from ..models import LabRequest, Patient, Prescription, Role, Staff, Visit
from ..schemas import patient_name, patient_summary
from ..utils import iso, utcnow

router = APIRouter(prefix="/orders", tags=["orders"])

lab_result_roles = require_roles(Role.super_admin, Role.lab_scientist)
dispense_roles = require_roles(Role.super_admin, Role.pharmacist)


def _patient_for(db: OrmSession, patient_id: str) -> Patient | None:
    return db.get(Patient, patient_id)


def _last_visit(db: OrmSession, patient_id: str) -> Visit | None:
    return db.scalar(
        select(Visit)
        .where(Visit.patient_id == patient_id)
        .order_by(Visit.checked_in_at.desc())
        .limit(1)
    )


def _patient_block(db: OrmSession, patient_id: str) -> dict:
    patient = _patient_for(db, patient_id)
    if patient is None:
        return {"id": patient_id, "full_name": "Unknown patient", "patient_no": "—"}
    summary = patient_summary(patient, _last_visit(db, patient.id))
    return {
        "id": summary["id"],
        "patient_no": summary["patient_no"],
        "full_name": summary["full_name"],
        "sex_label": summary["sex_label"],
        "age_display": summary["age_display"],
        "phone": summary["phone"],
    }


def _lab_item(db: OrmSession, lab: LabRequest) -> dict:
    return {
        "id": lab.id,
        "kind": "lab",
        "patient": _patient_block(db, lab.patient_id),
        "visit_id": lab.visit_id,
        "title": lab.test_name,
        "detail": lab.specimen,
        "status": lab.status,
        "result_summary": lab.result_summary,
        "requested_by_name": lab.requested_by_name,
        "resulted_by_name": lab.resulted_by_name,
        "resulted_at": iso(lab.resulted_at),
        "created_at": iso(lab.created_at),
    }


def _prescription_item(db: OrmSession, prescription: Prescription) -> dict:
    return {
        "id": prescription.id,
        "kind": "prescription",
        "patient": _patient_block(db, prescription.patient_id),
        "visit_id": prescription.visit_id,
        "title": ", ".join(item.drug_name for item in prescription.items) or "Prescription",
        "detail": prescription.notes,
        "status": prescription.status,
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
        "requested_by_name": prescription.prescribed_by_name,
        "dispensed_by_name": prescription.dispensed_by_name,
        "dispensed_at": iso(prescription.dispensed_at),
        "created_at": iso(prescription.created_at),
    }


@router.get("")
def list_orders(
    status: str = Query(default="open", pattern="^(open|all|done)$"),
    kind: str = Query(default="all", pattern="^(all|lab|prescription)$"),
    search: str | None = None,
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(get_current_staff),
) -> dict:
    """The order queues each role works from.

    Laboratory scientists see lab requests, pharmacists see prescriptions,
    and doctors, nurses and administrators see both.
    """
    wants_lab = kind in ("all", "lab") and staff.role != Role.pharmacist
    wants_prescription = kind in ("all", "prescription") and staff.role != Role.lab_scientist

    lab_query = select(LabRequest).order_by(LabRequest.created_at.desc()).limit(100)
    prescription_query = select(Prescription).order_by(Prescription.created_at.desc()).limit(100)

    if status == "open":
        lab_query = lab_query.where(LabRequest.status == "pending")
        prescription_query = prescription_query.where(Prescription.status == "open")
    elif status == "done":
        lab_query = lab_query.where(LabRequest.status == "completed")
        prescription_query = prescription_query.where(Prescription.status == "dispensed")

    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        lab_query = lab_query.join(Patient, LabRequest.patient_id == Patient.id).where(
            func.lower(func.coalesce(LabRequest.test_name, "")).like(term)
            | func.lower(Patient.first_name).like(term)
            | func.lower(Patient.last_name).like(term)
            | func.lower(Patient.patient_no).like(term)
        )
        prescription_query = prescription_query.join(Patient, Prescription.patient_id == Patient.id).where(
            func.lower(Patient.first_name).like(term)
            | func.lower(Patient.last_name).like(term)
            | func.lower(Patient.patient_no).like(term)
        )

    labs = db.scalars(lab_query).all() if wants_lab else []
    prescriptions = db.scalars(prescription_query).all() if wants_prescription else []

    return {
        "lab_requests": [_lab_item(db, lab) for lab in labs],
        "prescriptions": [_prescription_item(db, prescription) for prescription in prescriptions],
        "counts": {
            "lab_pending": db.scalar(
                select(func.count()).select_from(LabRequest).where(LabRequest.status == "pending")
            )
            or 0,
            "prescriptions_open": db.scalar(
                select(func.count()).select_from(Prescription).where(Prescription.status == "open")
            )
            or 0,
        },
    }


class LabResultIn(BaseModel):
    result_summary: str = Field(min_length=2, max_length=4000)


@router.patch("/lab-requests/{lab_id}/result")
def record_lab_result(
    lab_id: str,
    payload: LabResultIn,
    request: Request,
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(lab_result_roles),
) -> dict:
    lab = db.get(LabRequest, lab_id)
    if lab is None:
        raise HTTPException(
            status_code=404, detail={"code": "not_found", "message": "That lab request was not found."}
        )
    if lab.status == "completed":
        raise HTTPException(
            status_code=409,
            detail={"code": "already_completed", "message": "This result has already been recorded."},
        )

    patient = _patient_for(db, lab.patient_id)
    lab.result_summary = payload.result_summary.strip()
    lab.status = "completed"
    lab.resulted_at = utcnow()
    lab.resulted_by_id = staff.id
    lab.resulted_by_name = staff.full_name
    db.commit()

    log_event(
        db,
        action="lab_result_recorded",
        actor=staff,
        entity_type="lab_request",
        entity_id=lab.id,
        patient_id=lab.patient_id,
        patient_name=patient_name(patient) if patient else None,
        summary=f"Result recorded for {lab.test_name}"
        + (f" · {patient_name(patient)}" if patient else ""),
        meta={"test_name": lab.test_name, "visit_id": lab.visit_id},
        request=request,
    )
    return _lab_item(db, lab)


@router.patch("/prescriptions/{prescription_id}/dispense")
def dispense_prescription(
    prescription_id: str,
    request: Request,
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(dispense_roles),
) -> dict:
    prescription = db.get(Prescription, prescription_id)
    if prescription is None:
        raise HTTPException(
            status_code=404, detail={"code": "not_found", "message": "That prescription was not found."}
        )
    if prescription.status == "dispensed":
        raise HTTPException(
            status_code=409,
            detail={"code": "already_dispensed", "message": "This prescription has already been dispensed."},
        )

    patient = _patient_for(db, prescription.patient_id)
    prescription.status = "dispensed"
    prescription.dispensed_at = utcnow()
    prescription.dispensed_by_id = staff.id
    prescription.dispensed_by_name = staff.full_name
    db.commit()

    drugs = ", ".join(item.drug_name for item in prescription.items) or "prescription"
    log_event(
        db,
        action="prescription_dispensed",
        actor=staff,
        entity_type="prescription",
        entity_id=prescription.id,
        patient_id=prescription.patient_id,
        patient_name=patient_name(patient) if patient else None,
        summary=f"Dispensed {drugs}" + (f" to {patient_name(patient)}" if patient else ""),
        meta={"visit_id": prescription.visit_id, "items": len(prescription.items)},
        request=request,
    )
    return _prescription_item(db, prescription)
