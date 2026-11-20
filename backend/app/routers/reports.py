from __future__ import annotations

import csv
import io
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session as OrmSession

from ..db import get_db
from ..deps import require_roles
from ..models import Clinic, Diagnosis, Patient, Role, Staff, Visit
from ..utils import iso, utcnow

router = APIRouter(prefix="/reports", tags=["reports"])

reporter = require_roles(Role.super_admin, Role.doctor, Role.admin_staff)

PERIODS = (7, 30, 90)
REPORT_NAMES = ("patients-per-day", "patients-per-clinic", "top-diagnoses")


def _period(days: int) -> tuple[date, date, list[date]]:
    """The window is the last `days` calendar days, today included."""
    today = utcnow().date()
    first = today - timedelta(days=days - 1)
    return first, today, [first + timedelta(days=offset) for offset in range(days)]


def _seen_visits(first: date):
    """Visits that were attended inside the window, dated by attendance."""
    start = datetime.combine(first, time.min, tzinfo=timezone.utc)
    return (
        select(Visit)
        .where(Visit.status == "attended")
        .where(func.coalesce(Visit.attended_at, Visit.checked_in_at) >= start)
    )


def build_summary(db: OrmSession, days: int) -> dict:
    first, today, dates = _period(days)
    start = datetime.combine(first, time.min, tzinfo=timezone.utc)

    attended = _seen_visits(first).subquery()
    seen_day = func.date(func.coalesce(attended.c.attended_at, attended.c.checked_in_at))

    day_rows = db.execute(
        select(seen_day.label("day"), func.count().label("count"))
        .group_by(seen_day)
        .order_by(seen_day)
    ).all()
    day_counts = {row.day: row.count for row in day_rows}

    clinic_rows = db.execute(
        select(
            func.coalesce(Clinic.name, "Unassigned").label("clinic"),
            func.count().label("count"),
        )
        .select_from(attended)
        .outerjoin(Clinic, attended.c.clinic_id == Clinic.id)
        .group_by(Clinic.name)
        .order_by(func.count().desc(), Clinic.name)
    ).all()

    diagnosis_rows = db.execute(
        select(Diagnosis.description.label("description"), func.count().label("count"))
        .where(Diagnosis.created_at >= start)
        .group_by(Diagnosis.description)
        .order_by(func.count().desc(), Diagnosis.description)
        .limit(10)
    ).all()

    patients_seen = sum(day_counts.values())
    registered = (
        db.scalar(
            select(func.count()).select_from(Patient).where(Patient.created_at >= start)
        )
        or 0
    )

    return {
        "generated_at": iso(utcnow()),
        "days": days,
        "from": first.isoformat(),
        "to": today.isoformat(),
        "totals": {
            "patients_seen": patients_seen,
            "patients_registered": registered,
            "clinics_reporting": len(clinic_rows),
            "diagnoses_recorded": sum(row.count for row in diagnosis_rows),
        },
        "patients_per_day": [
            {"date": day.isoformat(), "count": day_counts.get(day, 0)} for day in dates
        ],
        "patients_per_clinic": [
            {"clinic": row.clinic, "count": row.count} for row in clinic_rows
        ],
        "top_diagnoses": [
            {"description": row.description, "count": row.count} for row in diagnosis_rows
        ],
    }


@router.get("/summary")
def reports_summary(
    days: int = Query(default=30),
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(reporter),
) -> dict:
    if days not in PERIODS:
        days = 30
    return build_summary(db, days)


def _csv_response(name: str, header: list[str], rows: list[list]) -> Response:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(header)
    writer.writerows(rows)
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{name}.csv"'},
    )


@router.get("/export/{report}")
def export_report(
    report: str,
    days: int = Query(default=30),
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(reporter),
) -> Response:
    """CSV download. Always a real file: headers only when there is no data."""
    if report not in REPORT_NAMES:
        raise HTTPException(
            status_code=404,
            detail={"code": "not_found", "message": "Unknown report."},
        )
    if days not in PERIODS:
        days = 30
    summary = build_summary(db, days)

    if report == "patients-per-day":
        rows = [[entry["date"], entry["count"]] for entry in summary["patients_per_day"]]
        return _csv_response(f"patients-seen-per-day-{days}d", ["Date", "Patients seen"], rows)

    if report == "patients-per-clinic":
        rows = [[entry["clinic"], entry["count"]] for entry in summary["patients_per_clinic"]]
        return _csv_response(f"patients-per-clinic-{days}d", ["Clinic", "Patients seen"], rows)

    rows = [[entry["description"], entry["count"]] for entry in summary["top_diagnoses"]]
    return _csv_response(f"top-diagnoses-{days}d", ["Diagnosis", "Times recorded"], rows)
