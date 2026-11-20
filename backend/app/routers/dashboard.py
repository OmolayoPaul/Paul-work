from __future__ import annotations

from datetime import datetime, time, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session as OrmSession

from ..db import get_db
from ..deps import get_current_staff
from ..models import (
    AuditEvent,
    LabRequest,
    Prescription,
    Role,
    Staff,
    StaffStatus,
    Visit,
)
from ..schemas import audit_public
from ..utils import iso, utcnow

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
def summary(
    staff: Staff = Depends(get_current_staff),
    db: OrmSession = Depends(get_db),
) -> dict:
    """Home dashboard counters, counted from the live clinical tables."""
    day_start = datetime.combine(utcnow().date(), time.min, tzinfo=timezone.utc)
    payload: dict = {
        "generated_at": iso(utcnow()),
        "patients_waiting_today": db.scalar(
            select(func.count())
            .select_from(Visit)
            .where(Visit.status == "pending", Visit.checked_in_at >= day_start)
        )
        or 0,
        "attended_today": db.scalar(
            select(func.count())
            .select_from(Visit)
            .where(Visit.status == "attended", Visit.checked_in_at >= day_start)
        )
        or 0,
        "pending_lab_results": db.scalar(
            select(func.count()).select_from(LabRequest).where(LabRequest.status == "pending")
        )
        or 0,
        "open_prescriptions": db.scalar(
            select(func.count()).select_from(Prescription).where(Prescription.status == "open")
        )
        or 0,
        "clinical_modules_live": True,
    }

    if staff.role == Role.super_admin:
        active = db.scalar(
            select(func.count()).select_from(Staff).where(Staff.status == StaffStatus.active)
        )
        inactive = db.scalar(
            select(func.count()).select_from(Staff).where(Staff.status == StaffStatus.inactive)
        )
        payload["staff_total"] = active or 0
        payload["staff_inactive"] = inactive or 0

        rows = db.execute(select(Staff.role, func.count()).group_by(Staff.role)).all()
        counts = {role.value: 0 for role in Role}
        for role, count in rows:
            counts[role.value] = count
        payload["staff_by_role"] = counts

        recent = db.scalars(
            select(AuditEvent).order_by(AuditEvent.created_at.desc()).limit(6)
        ).all()
        payload["recent_audit"] = [audit_public(event) for event in recent]

    return payload
