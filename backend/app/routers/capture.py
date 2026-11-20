from __future__ import annotations

import base64
import binascii
import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session as OrmSession

from ..audit import log_event
from ..db import get_db
from ..deps import require_roles
from ..models import Patient, Role, Staff
from ..ocr import SCAN_FIELDS, ScanError, scan_patient_card
from ..schemas import patient_summary

logger = logging.getLogger("afridetect.capture")

router = APIRouter(prefix="/capture", tags=["capture"])

capture_roles = require_roles(Role.super_admin, Role.doctor, Role.nurse, Role.records_officer)


class ScanRequest(BaseModel):
    file_name: str = Field(min_length=1, max_length=200)
    mime_type: str = Field(min_length=3, max_length=120)
    data_base64: str = Field(min_length=1)


@router.get("/fields")
def scan_fields() -> dict:
    """The fields the scan returns, in display order."""
    return {"fields": [{"key": key, "label": label} for key, label in SCAN_FIELDS]}


@router.post("/scan")
def scan_card(
    payload: ScanRequest,
    request: Request,
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(capture_roles),
) -> dict:
    """Read a patient card with Gemini.

    The image is held in memory for this request only: nothing is stored on
    disk or in the database, and the audit entry records the file name and
    field confidence, never the patient's details.
    """
    file_name = payload.file_name.strip()[:200]
    mime_type = payload.mime_type.strip().lower()

    try:
        data = base64.b64decode(payload.data_base64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_file", "message": "That file could not be read. Choose it again."},
        ) from None

    try:
        result = scan_patient_card(data=data, mime_type=mime_type, file_name=file_name)
    except ScanError as error:
        log_event(
            db,
            action="ocr_scan_failed",
            actor=staff,
            entity_type="scan",
            summary=f"Card scan failed ({error.code}): {file_name}",
            meta={"file_name": file_name, "mime_type": mime_type, "reason": error.code},
            request=request,
        )
        raise HTTPException(
            status_code=error.status,
            detail={"code": error.code, "message": error.message},
        ) from None

    low_confidence = [key for key, entry in result["fields"].items() if entry["confidence"] == "low"]
    log_event(
        db,
        action="ocr_scan",
        actor=staff,
        entity_type="scan",
        summary=f"Scanned patient card: {result['fields_read']} of {result['fields_total']} fields read ({file_name})",
        meta={
            "file_name": file_name,
            "mime_type": mime_type,
            "model": result["model"],
            "fields_read": result["fields_read"],
            "low_confidence": low_confidence,
            "elapsed_ms": result["elapsed_ms"],
        },
        request=request,
    )
    return result


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
