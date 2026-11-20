from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session as OrmSession

from ..db import get_db
from ..deps import require_roles
from ..models import AuditEvent, Role, Staff
from ..schemas import audit_public

router = APIRouter(prefix="/audit", tags=["audit"])

super_admin_only = require_roles(Role.super_admin)

# Filters used by the audit log page. Each entry matches the action prefixes
# the EMR writes, so events added by later modules appear in the right group.
CATEGORIES: dict[str, tuple[str, ...]] = {
    "sign_in": ("login", "logout"),
    "staff": ("staff_",),
    "patient": ("patient_",),
    "scan": ("ocr_",),
}


@router.get("")
def list_audit_events(
    search: str | None = None,
    category: str | None = None,
    action: str | None = None,
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: OrmSession = Depends(get_db),
    admin: Staff = Depends(super_admin_only),
) -> dict:
    """Read-only audit trail, newest first.

    There are no create, update or delete routes here: entries can only be
    appended by the API as actions happen, so nobody can edit or remove them.
    """
    conditions = []

    if category:
        prefixes = CATEGORIES.get(category)
        if prefixes is None:
            raise HTTPException(
                status_code=400,
                detail={"code": "unknown_category", "message": "Unknown audit category."},
            )
        conditions.append(or_(*[AuditEvent.action.like(f"{prefix}%") for prefix in prefixes]))

    if action:
        conditions.append(AuditEvent.action == action)

    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        conditions.append(
            or_(
                func.lower(func.coalesce(AuditEvent.actor_name, "")).like(term),
                func.lower(func.coalesce(AuditEvent.actor_email, "")).like(term),
                func.lower(func.coalesce(AuditEvent.summary, "")).like(term),
                func.lower(func.coalesce(AuditEvent.patient_name, "")).like(term),
                func.lower(func.coalesce(AuditEvent.entity_id, "")).like(term),
            )
        )

    rows = select(AuditEvent)
    count_query = select(func.count()).select_from(AuditEvent)
    for condition in conditions:
        rows = rows.where(condition)
        count_query = count_query.where(condition)

    total = db.scalar(count_query) or 0
    events = db.scalars(
        rows.order_by(AuditEvent.created_at.desc()).offset(offset).limit(limit)
    ).all()

    return {
        "items": [audit_public(event) for event in events],
        "total": total,
        "limit": limit,
        "offset": offset,
    }
