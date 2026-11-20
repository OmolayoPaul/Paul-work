from __future__ import annotations

from .models import AuditEvent, Staff
from .utils import iso


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
