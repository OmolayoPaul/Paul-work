from __future__ import annotations

import logging
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session as OrmSession

from ..db import get_db
from ..deps import require_roles
from ..models import Patient, Role, Staff
from ..schemas import patient_summary

logger = logging.getLogger("afridetect.capture")

router = APIRouter(prefix="/capture", tags=["capture"])

capture_roles = require_roles(Role.super_admin, Role.doctor, Role.nurse, Role.records_officer)


def _compact(value: str | None) -> str:
    return "".join(ch for ch in (value or "").lower() if ch.isalnum())


def _clean(value: str | None) -> str:
    return " ".join((value or "").lower().split())


@router.get("/duplicates")
def possible_duplicates(
    first_name: str | None = Query(default=None, max_length=80),
    last_name: str | None = Query(default=None, max_length=80),
    date_of_birth: str | None = Query(default=None, max_length=10),
    phone: str | None = Query(default=None, max_length=40),
    card_number: str | None = Query(default=None, max_length=60),
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(capture_roles),
) -> dict:
    """Patients that may already hold this record.

    A match is the same card number, the same phone number, or the same name
    together with the date of birth, phone or card number.
    """
    first = _clean(first_name)
    last = _clean(last_name)
    dob: date | None = None
    if date_of_birth:
        try:
            dob = date.fromisoformat(date_of_birth)
        except ValueError:
            dob = None
    phone_key = _compact(phone)
    card_key = _compact(card_number)

    name_match = None
    if first and last:
        name_match = and_(
            func.lower(func.trim(Patient.first_name)) == first,
            func.lower(func.trim(Patient.last_name)) == last,
        )

    conditions = []
    if card_key:
        conditions.append(func.replace(func.lower(func.coalesce(Patient.card_number, "")), " ", "") == card_key)
    if phone_key:
        conditions.append(func.replace(func.lower(func.coalesce(Patient.phone, "")), " ", "") == phone_key)
    if name_match is not None and dob is not None:
        conditions.append(and_(name_match, Patient.date_of_birth == dob))

    if not conditions:
        return {"items": []}

    candidates = db.scalars(
        select(Patient).where(or_(*conditions)).order_by(Patient.created_at.desc()).limit(5)
    ).all()

    items = []
    for patient in candidates:
        reasons = []
        if card_key and _compact(patient.card_number) == card_key:
            reasons.append("Same card number")
        if phone_key and _compact(patient.phone) == phone_key:
            reasons.append("Same phone number")
        if (
            name_match is not None
            and dob is not None
            and _clean(patient.first_name) == first
            and _clean(patient.last_name) == last
            and patient.date_of_birth == dob
        ):
            reasons.append("Same name and date of birth")
        if not reasons:
            continue
        items.append({**patient_summary(patient), "reasons": reasons})

    return {"items": items}
