from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session as OrmSession

from ..db import get_db
from ..deps import get_current_staff
from ..models import Clinic, Role, Staff, StaffStatus
from ..schemas import clinic_public, staff_public

router = APIRouter(prefix="/reference", tags=["reference"])


@router.get("")
def reference_data(
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(get_current_staff),
) -> dict:
    """Clinics and doctors used by registration and check-in forms."""
    clinics = db.scalars(select(Clinic).where(Clinic.is_active.is_(True)).order_by(Clinic.name)).all()
    doctors = db.scalars(
        select(Staff)
        .where(
            Staff.status == StaffStatus.active,
            Staff.role.in_((Role.doctor, Role.super_admin)),
        )
        .order_by(Staff.full_name)
    ).all()
    return {
        "clinics": [clinic_public(clinic) for clinic in clinics],
        "doctors": [staff_public(person) for person in doctors],
    }
