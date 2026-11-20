from __future__ import annotations

import threading
import time

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session as OrmSession

from ..audit import log_event
from ..db import get_db
from ..deps import require_roles
from ..models import Role, Staff
from ..ocr import ScanError, scan_document

router = APIRouter(prefix="/ocr", tags=["ocr"])

scanner = require_roles(Role.super_admin, Role.doctor, Role.records_officer)

SCANS_PER_HOUR = 20

_lock = threading.Lock()
_recent_scans: dict[str, list[float]] = {}


def _check_rate_limit(staff_id: str) -> None:
    now = time.time()
    cutoff = now - 3600
    with _lock:
        stamps = [stamp for stamp in _recent_scans.get(staff_id, []) if stamp > cutoff]
        if len(stamps) >= SCANS_PER_HOUR:
            _recent_scans[staff_id] = stamps
            raise HTTPException(
                status_code=429,
                detail={
                    "code": "scan_limit",
                    "message": "You have scanned 20 cards in the last hour. Try again later or enter the details manually.",
                },
            )
        stamps.append(now)
        _recent_scans[staff_id] = stamps


@router.post("/scan")
async def scan_card(
    file: UploadFile = File(...),
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(scanner),
) -> dict:
    _check_rate_limit(staff.id)
    data = await file.read()
    try:
        result = scan_document(data, file.filename or "card.jpg")
    except ScanError as exc:
        raise HTTPException(
            status_code=422, detail={"code": exc.code, "message": exc.message}
        ) from exc

    filled = {key: field for key, field in result["fields"].items() if field["value"]}
    log_event(
        db,
        action="card_scanned",
        actor=staff,
        entity_type="patient_scan",
        summary=f"Scanned a patient card ({len(filled)} fields read)",
        meta={"fields": list(filled), "filename": file.filename},
    )
    return result
