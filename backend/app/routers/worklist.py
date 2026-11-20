from __future__ import annotations

from datetime import datetime, time, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session as OrmSession

from ..audit import log_event
from ..db import get_db
from ..deps import get_current_staff, require_roles
from ..models import Patient, Role, Staff, Visit
from ..schemas import patient_name, visit_public
from ..utils import iso, utcnow

router = APIRouter(prefix="/worklist", tags=["worklist"])

attending = require_roles(Role.super_admin, Role.doctor)
worklist_reader = require_roles(Role.super_admin, Role.doctor, Role.nurse, Role.records_officer)


def _day_start() -> datetime:
    today = utcnow().date()
    return datetime.combine(today, time.min, tzinfo=timezone.utc)


def _scope(staff: Staff):
    """Doctors see the patients assigned to them, plus unassigned arrivals."""
    if staff.role == Role.doctor:
        return or_(Visit.assigned_doctor_id == staff.id, Visit.assigned_doctor_id.is_(None))
    return None


@router.get("")
def worklist(
    status: str = Query(default="pending", pattern="^(pending|attended)$"),
    channel: str = Query(default="hospital", pattern="^(hospital|telemed)$"),
    search: str | None = None,
    visits_on: str = Query(default="today", pattern="^(today|all)$"),
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(worklist_reader),
) -> dict:
    base = select(Visit).join(Patient, Visit.patient_id == Patient.id).where(Visit.channel == channel)
    scoped = _scope(staff)
    if scoped is not None:
        base = base.where(scoped)
    if visits_on == "today":
        base = base.where(Visit.checked_in_at >= _day_start())

    counts_source = base
    pending_count = db.scalar(
        counts_source.with_only_columns(func.count(Visit.id)).where(Visit.status == "pending")
    )
    attended_count = db.scalar(
        counts_source.with_only_columns(func.count(Visit.id)).where(Visit.status == "attended")
    )

    query = base.where(Visit.status == status)
    if search:
        term = f"%{search.strip().lower()}%"
        query = query.where(
            or_(
                func.lower(Patient.patient_no).like(term),
                func.lower(Patient.first_name).like(term),
                func.lower(Patient.last_name).like(term),
                func.lower(func.coalesce(Patient.other_name, "")).like(term),
                func.lower(func.coalesce(Patient.nhis_no, "")).like(term),
                func.lower(func.coalesce(Patient.card_no, "")).like(term),
                func.lower(func.coalesce(Patient.phone, "")).like(term),
            )
        )
    order = Visit.checked_in_at.asc() if status == "pending" else Visit.checked_in_at.desc()
    rows = db.scalars(query.order_by(order).limit(200)).all()

    return {
        "items": [
            {
                **visit_public(visit),
                "patient": {
                    "id": visit.patient.id,
                    "patient_no": visit.patient.patient_no,
                    "first_name": visit.patient.first_name,
                    "last_name": visit.patient.last_name,
                    "full_name": patient_name(visit.patient),
                    "sex": visit.patient.sex,
                    "age_display": f"{max((utcnow().date() - visit.patient.date_of_birth).days // 365, 0)}y",
                    "is_demo": bool(visit.patient.is_demo),
                },
            }
            for visit in rows
        ],
        "counts": {"pending": pending_count or 0, "attended": attended_count or 0},
        "generated_at": iso(utcnow()),
    }


@router.patch("/{visit_id}/attend")
def attend_visit(
    visit_id: str,
    request: Request,
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(attending),
) -> dict:
    visit = db.get(Visit, visit_id)
    if visit is None:
        raise HTTPException(
            status_code=404, detail={"code": "not_found", "message": "Visit not found."}
        )
    if visit.status == "attended":
        raise HTTPException(
            status_code=409,
            detail={"code": "already_attended", "message": "This patient has already been attended to."},
        )
    if staff.role == Role.doctor and visit.assigned_doctor_id not in (None, staff.id):
        raise HTTPException(
            status_code=403,
            detail={"code": "forbidden", "message": "This patient is assigned to another doctor."},
        )

    visit.status = "attended"
    visit.attended_at = utcnow()
    visit.attended_by_id = staff.id
    visit.attended_by_name = staff.full_name
    db.commit()

    patient = db.get(Patient, visit.patient_id)
    log_event(
        db,
        action="visit_attended",
        actor=staff,
        entity_type="visit",
        entity_id=visit.id,
        patient_id=visit.patient_id,
        patient_name=patient_name(patient) if patient else None,
        summary=f"Attended to {patient_name(patient) if patient else 'patient'}",
        meta={"visit_id": visit.id},
        request=request,
    )
    return visit_public(visit)
