from __future__ import annotations

import csv
import io
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session as OrmSession

from ..db import get_db
from ..deps import require_roles
from ..models import Clinic, Diagnosis, Role, Staff, Visit
from ..utils import iso, utcnow

router = APIRouter(prefix="/reports", tags=["reports"])

report_roles = require_roles(Role.super_admin, Role.doctor, Role.admin_staff)


def _window(days: int) -> tuple[datetime, datetime]:
    end = utcnow()
    start = end - timedelta(days=days)
    return start, end


def _summary(db: OrmSession, days: int) -> dict:
    start, end = _window(days)
    seen_at = func.coalesce(Visit.attended_at, Visit.checked_in_at)

    daily_rows = db.execute(
        select(func.date(seen_at).label("day"), func.count())
        .select_from(Visit)
        .where(Visit.status == "attended", seen_at >= start, seen_at < end)
        .group_by("day")
        .order_by("day")
    ).all()
    counts_by_day = {row[0].isoformat(): row[1] for row in daily_rows}

    patients_per_day = []
    for offset in range(days):
        day = (start + timedelta(days=offset + 1)).date()
        patients_per_day.append({"date": day.isoformat(), "count": counts_by_day.get(day.isoformat(), 0)})

    clinic_rows = db.execute(
        select(func.coalesce(Clinic.name, "No clinic"), func.count())
        .select_from(Visit)
        .outerjoin(Clinic, Visit.clinic_id == Clinic.id)
        .where(Visit.status == "attended", seen_at >= start, seen_at < end)
        .group_by(func.coalesce(Clinic.name, "No clinic"))
        .order_by(func.count().desc())
    ).all()
    patients_per_clinic = [{"clinic": name, "count": count} for name, count in clinic_rows]

    diagnosis_rows = db.execute(
        select(Diagnosis.description, Diagnosis.code, func.count())
        .where(Diagnosis.created_at >= start, Diagnosis.created_at < end)
        .group_by(Diagnosis.description, Diagnosis.code)
        .order_by(func.count().desc(), Diagnosis.description)
        .limit(10)
    ).all()
    top_diagnoses = [
        {"description": description, "code": code, "count": count}
        for description, code, count in diagnosis_rows
    ]

    return {
        "range": {"from": iso(start), "to": iso(end), "days": days},
        "totals": {
            "patients_seen": sum(item["count"] for item in patients_per_day),
            "clinics": len(patients_per_clinic),
            "diagnoses": sum(item["count"] for item in top_diagnoses),
        },
        "patients_per_day": patients_per_day,
        "patients_per_clinic": patients_per_clinic,
        "top_diagnoses": top_diagnoses,
    }


@router.get("/summary")
def reports_summary(
    days: int = Query(default=30, ge=1, le=365),
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(report_roles),
) -> dict:
    return _summary(db, days)


@router.get("/export.csv")
def export_csv(
    kind: str = Query(default="patients_per_day", pattern="^(patients_per_day|patients_per_clinic|top_diagnoses)$"),
    days: int = Query(default=30, ge=1, le=365),
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(report_roles),
) -> StreamingResponse:
    """One report as CSV, for records and management reporting."""
    data = _summary(db, days)
    buffer = io.StringIO()
    writer = csv.writer(buffer)

    if kind == "patients_per_day":
        writer.writerow(["Date", "Patients seen"])
        for row in data["patients_per_day"]:
            writer.writerow([row["date"], row["count"]])
        filename = f"patients-per-day-{days}d.csv"
    elif kind == "patients_per_clinic":
        writer.writerow(["Clinic", "Patients seen"])
        for row in data["patients_per_clinic"]:
            writer.writerow([row["clinic"], row["count"]])
        filename = f"patients-per-clinic-{days}d.csv"
    else:
        writer.writerow(["Diagnosis", "Code", "Count"])
        for row in data["top_diagnoses"]:
            writer.writerow([row["description"], row["code"] or "", row["count"]])
        filename = f"top-diagnoses-{days}d.csv"

    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
