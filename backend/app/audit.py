from __future__ import annotations

import logging

from sqlalchemy.orm import Session as OrmSession

from .models import AuditEvent, Staff, new_id
from .utils import client_ip

logger = logging.getLogger("afridetect.audit")


def log_event(
    db: OrmSession,
    *,
    action: str,
    summary: str | None = None,
    actor: Staff | None = None,
    actor_email: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    patient_id: str | None = None,
    patient_name: str | None = None,
    meta: dict | None = None,
    request=None,
) -> None:
    """Append an audit entry. Never lets an audit failure break the request."""
    event = AuditEvent(
        id=new_id(),
        actor_id=actor.id if actor else None,
        actor_name=actor.full_name if actor else None,
        actor_email=(actor.email if actor else actor_email),
        actor_role=actor.role.value if actor else None,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        patient_id=patient_id,
        patient_name=patient_name,
        summary=summary,
        meta=meta,
        ip=client_ip(request),
        user_agent=(request.headers.get("user-agent") or "")[:300] if request else None,
    )
    try:
        db.add(event)
        db.commit()
    except Exception:  # pragma: no cover - defensive
        db.rollback()
        logger.exception("Failed to write audit event %s", action)
