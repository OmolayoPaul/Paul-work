from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session as OrmSession

from ..db import get_db
from ..deps import get_current_staff
from ..models import AuditEvent, Role, Staff, StaffStatus
from ..schemas import audit_public
from ..utils import iso, utcnow

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
def summary(
    staff: Staff = Depends(get_current_staff),
    db: OrmSession = Depends(get_db),
) -> dict:
    """Home dashboard counters.

    Clinical counters stay at zero until the patient modules land; they are
    served from here so the dashboard needs no change when data arrives.
    """
    payload: dict = {
        "generated_at": iso(utcnow()),
        "patients_waiting_today": 0,
        "attended_today": 0,
        "pending_lab_results": 0,
        "open_prescriptions": 0,
        "clinical_modules_live": False,
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
