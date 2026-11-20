from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session as OrmSession

from ..db import get_db
from ..deps import require_roles
from ..models import LabRequest, Patient, Prescription, Role, Staff
from ..schemas import lab_public, prescription_public

router = APIRouter(prefix="/orders", tags=["orders"])

order_reader = require_roles(
    Role.super_admin,
    Role.doctor,
    Role.nurse,
    Role.pharmacist,
    Role.lab_scientist,
)


def _patients(db: OrmSession, ids: set[str]) -> dict[str, Patient]:
    if not ids:
        return {}
    rows = db.scalars(select(Patient).where(Patient.id.in_(ids))).all()
    return {row.id: row for row in rows}


@router.get("")
def list_orders(
    status: str | None = Query(default=None, pattern="^(pending|completed|open|dispensed)$"),
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(order_reader),
) -> dict:
    lab_query = select(LabRequest).order_by(LabRequest.created_at.desc()).limit(200)
    if status in ("pending", "completed"):
        lab_query = lab_query.where(LabRequest.status == status)
    labs = db.scalars(lab_query).all()

    rx_query = select(Prescription).order_by(Prescription.created_at.desc()).limit(200)
    if status in ("open", "dispensed"):
        rx_query = rx_query.where(Prescription.status == status)
    prescriptions = db.scalars(rx_query).all()

    patients = _patients(db, {row.patient_id for row in [*labs, *prescriptions]})

    def patient_bits(patient_id: str) -> dict:
        patient = patients.get(patient_id)
        return {
            "patient_id": patient_id,
            "patient_name": f"{patient.first_name} {patient.last_name}" if patient else None,
            "patient_no": patient.patient_no if patient else None,
        }

    return {
        "lab_requests": [
            {**lab_public(lab), **patient_bits(lab.patient_id)} for lab in labs
        ],
        "prescriptions": [
            {**prescription_public(rx), **patient_bits(rx.patient_id)}
            for rx in prescriptions
        ],
        "counts": {
            "lab_pending": sum(1 for lab in labs if lab.status == "pending"),
            "rx_open": sum(1 for rx in prescriptions if rx.status == "open"),
        },
    }
