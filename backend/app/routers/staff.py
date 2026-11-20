from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session as OrmSession

from ..audit import log_event
from ..db import get_db
from ..deps import require_roles
from ..models import AuthSession, Role, Staff, StaffStatus, new_id
from ..schemas import staff_public
from ..security import hash_password
from ..utils import utcnow

router = APIRouter(prefix="/staff", tags=["staff"])

super_admin_only = require_roles(Role.super_admin)


class StaffCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=160)
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=6, max_length=100)
    phone: str | None = Field(default=None, max_length=40)
    staff_id: str | None = Field(default=None, max_length=40)
    role: Role
    department: str | None = Field(default=None, max_length=120)

    @field_validator("email")
    @classmethod
    def valid_email(cls, value: str) -> str:
        email = value.strip().lower()
        if "@" not in email or email.startswith("@") or email.endswith("@"):
            raise ValueError("Enter a valid email address")
        return email


class StaffUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=160)
    phone: str | None = Field(default=None, max_length=40)
    staff_id: str | None = Field(default=None, max_length=40)
    role: Role | None = None
    department: str | None = Field(default=None, max_length=120)
    status: StaffStatus | None = None
    password: str | None = Field(default=None, min_length=6, max_length=100)


def _active_super_admins(db: OrmSession, exclude_id: str | None = None) -> int:
    query = select(func.count()).select_from(Staff).where(
        Staff.role == Role.super_admin, Staff.status == StaffStatus.active
    )
    if exclude_id:
        query = query.where(Staff.id != exclude_id)
    return db.scalar(query) or 0


@router.get("")
def list_staff(
    search: str | None = None,
    role: Role | None = None,
    status: StaffStatus | None = None,
    db: OrmSession = Depends(get_db),
    admin: Staff = Depends(super_admin_only),
) -> list[dict]:
    query = select(Staff)
    if search:
        term = f"%{search.strip().lower()}%"
        query = query.where(
            func.lower(Staff.full_name).like(term)
            | func.lower(Staff.email).like(term)
            | func.lower(func.coalesce(Staff.staff_id, "")).like(term)
        )
    if role:
        query = query.where(Staff.role == role)
    if status:
        query = query.where(Staff.status == status)

    people = db.scalars(query.order_by(Staff.full_name)).all()
    return [staff_public(person) for person in people]


@router.post("", status_code=201)
def create_staff(
    payload: StaffCreate,
    db: OrmSession = Depends(get_db),
    admin: Staff = Depends(super_admin_only),
) -> dict:
    existing = db.scalar(select(Staff).where(func.lower(Staff.email) == payload.email))
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "email_taken",
                "message": "A staff account with that email already exists.",
            },
        )

    person = Staff(
        id=new_id(),
        full_name=payload.full_name.strip(),
        email=payload.email,
        phone=payload.phone,
        staff_id=payload.staff_id,
        role=payload.role,
        department=payload.department,
        status=StaffStatus.active,
        password_hash=hash_password(payload.password),
    )
    db.add(person)
    db.commit()

    log_event(
        db,
        action="staff_created",
        actor=admin,
        entity_type="staff",
        entity_id=person.id,
        summary=f"Added {person.full_name} as {person.role.value}",
        meta={"email": person.email, "role": person.role.value},
    )
    return staff_public(person)


@router.patch("/{staff_id}")
def update_staff(
    staff_id: str,
    payload: StaffUpdate,
    db: OrmSession = Depends(get_db),
    admin: Staff = Depends(super_admin_only),
) -> dict:
    person = db.get(Staff, staff_id)
    if person is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Staff member not found."})

    next_role = payload.role if payload.role is not None else person.role
    next_status = payload.status if payload.status is not None else person.status

    loses_super_admin = person.role == Role.super_admin and (
        next_role != Role.super_admin or next_status != StaffStatus.active
    )
    if loses_super_admin and _active_super_admins(db, exclude_id=person.id) == 0:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "last_super_admin",
                "message": "You cannot deactivate or demote the last super admin.",
            },
        )

    changes: dict[str, tuple[str, str]] = {}
    if payload.full_name is not None and payload.full_name.strip() != person.full_name:
        changes["full_name"] = (person.full_name, payload.full_name.strip())
        person.full_name = payload.full_name.strip()
    if payload.phone is not None and payload.phone != person.phone:
        changes["phone"] = (person.phone or "", payload.phone)
        person.phone = payload.phone
    if payload.staff_id is not None and payload.staff_id != person.staff_id:
        changes["staff_id"] = (person.staff_id or "", payload.staff_id)
        person.staff_id = payload.staff_id
    if payload.department is not None and payload.department != person.department:
        changes["department"] = (person.department or "", payload.department)
        person.department = payload.department
    if payload.role is not None and payload.role != person.role:
        changes["role"] = (person.role.value, payload.role.value)
        person.role = payload.role
    if payload.status is not None and payload.status != person.status:
        changes["status"] = (person.status.value, payload.status.value)
        person.status = payload.status

    if payload.password is not None:
        person.password_hash = hash_password(payload.password)
        changes["password"] = ("••••••", "••••••")

    person.updated_at = utcnow()
    db.commit()

    if next_status != StaffStatus.active:
        db.execute(
            update(AuthSession)
            .where(AuthSession.staff_id == person.id, AuthSession.revoked_at.is_(None))
            .values(revoked_at=utcnow())
        )
        db.commit()

    action = "staff_updated"
    if "status" in changes:
        action = "staff_reactivated" if next_status == StaffStatus.active else "staff_deactivated"

    field_labels = {
        "full_name": "name",
        "phone": "phone",
        "staff_id": "staff ID",
        "department": "department",
        "role": "role",
        "status": "status",
    }
    if action == "staff_updated" and changes:
        summary = f"{person.full_name}: changed {', '.join(field_labels.get(key, key) for key in changes)}"
    else:
        summary = f"{person.full_name}: {action.replace('staff_', '').replace('_', ' ')}"

    log_event(
        db,
        action=action,
        actor=admin,
        entity_type="staff",
        entity_id=person.id,
        summary=summary,
        meta={"changes": {key: {"from": value[0], "to": value[1]} for key, value in changes.items()}},
    )
    return staff_public(person)
