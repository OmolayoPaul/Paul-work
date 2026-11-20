from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, Enum as SAEnum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base
from .utils import utcnow


def new_id() -> str:
    return uuid.uuid4().hex


class Role(str, enum.Enum):
    super_admin = "super_admin"
    doctor = "doctor"
    nurse = "nurse"
    records_officer = "records_officer"
    pharmacist = "pharmacist"
    lab_scientist = "lab_scientist"
    admin_staff = "admin_staff"


class StaffStatus(str, enum.Enum):
    active = "active"
    inactive = "inactive"


class Staff(Base):
    __tablename__ = "staff"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    full_name: Mapped[str] = mapped_column(String(160), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    phone: Mapped[str | None] = mapped_column(String(40))
    staff_id: Mapped[str | None] = mapped_column(String(40))
    role: Mapped[Role] = mapped_column(
        SAEnum(Role, name="staff_role"), nullable=False, default=Role.doctor
    )
    department: Mapped[str | None] = mapped_column(String(120))
    status: Mapped[StaffStatus] = mapped_column(
        SAEnum(StaffStatus, name="staff_status"), nullable=False, default=StaffStatus.active
    )
    google_sub: Mapped[str | None] = mapped_column(String(120))
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    password_hash: Mapped[str | None] = mapped_column(String(200))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    sessions: Mapped[list[AuthSession]] = relationship(
        back_populates="staff", cascade="all, delete-orphan"
    )


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    staff_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("staff.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    user_agent: Mapped[str | None] = mapped_column(String(300))
    ip: Mapped[str | None] = mapped_column(String(64))

    staff: Mapped[Staff] = relationship(back_populates="sessions")


class AuditEvent(Base):
    """Append-only audit trail. Entries are never updated or deleted."""

    __tablename__ = "audit_events"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    actor_id: Mapped[str | None] = mapped_column(String(32))
    actor_name: Mapped[str | None] = mapped_column(String(160))
    actor_email: Mapped[str | None] = mapped_column(String(255))
    actor_role: Mapped[str | None] = mapped_column(String(40))
    action: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    entity_type: Mapped[str | None] = mapped_column(String(60))
    entity_id: Mapped[str | None] = mapped_column(String(64))
    patient_id: Mapped[str | None] = mapped_column(String(64))
    patient_name: Mapped[str | None] = mapped_column(String(160))
    summary: Mapped[str | None] = mapped_column(Text)
    meta: Mapped[dict | None] = mapped_column("metadata", JSON)
    ip: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False, index=True
    )


class Clinic(Base):
    __tablename__ = "clinics"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    code: Mapped[str | None] = mapped_column(String(20))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    patient_no: Mapped[str] = mapped_column(String(30), unique=True, nullable=False, index=True)
    first_name: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    last_name: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    other_name: Mapped[str | None] = mapped_column(String(80))
    sex: Mapped[str] = mapped_column(String(10), nullable=False)
    date_of_birth: Mapped[date] = mapped_column(Date, nullable=False)
    phone: Mapped[str | None] = mapped_column(String(40))
    email: Mapped[str | None] = mapped_column(String(160))
    address: Mapped[str | None] = mapped_column(String(300))
    card_number: Mapped[str | None] = mapped_column(String(60), index=True)
    nhis_no: Mapped[str | None] = mapped_column(String(40), index=True)
    blood_group: Mapped[str | None] = mapped_column(String(10))
    genotype: Mapped[str | None] = mapped_column(String(10))
    occupation: Mapped[str | None] = mapped_column(String(120))
    marital_status: Mapped[str | None] = mapped_column(String(30))
    next_of_kin: Mapped[str | None] = mapped_column(String(160))
    next_of_kin_phone: Mapped[str | None] = mapped_column(String(40))
    clinic_id: Mapped[str | None] = mapped_column(
        String(32), ForeignKey("clinics.id"), index=True
    )
    registered_by_id: Mapped[str | None] = mapped_column(String(32))
    registered_by_name: Mapped[str | None] = mapped_column(String(160))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    clinic: Mapped[Clinic | None] = relationship(lazy="joined")


class Visit(Base):
    __tablename__ = "visits"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    patient_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    clinic_id: Mapped[str | None] = mapped_column(String(32), ForeignKey("clinics.id"), index=True)
    visit_type: Mapped[str] = mapped_column(String(20), default="new", nullable=False)
    channel: Mapped[str] = mapped_column(String(20), default="hospital", nullable=False)
    bill_type: Mapped[str] = mapped_column(String(20), default="self_pay", nullable=False)
    assigned_doctor_id: Mapped[str | None] = mapped_column(String(32), index=True)
    assigned_doctor_name: Mapped[str | None] = mapped_column(String(160))
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False, index=True)
    chief_complaint: Mapped[str | None] = mapped_column(String(300))
    checked_in_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False, index=True
    )
    checked_in_by_id: Mapped[str | None] = mapped_column(String(32))
    checked_in_by_name: Mapped[str | None] = mapped_column(String(160))
    attended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    attended_by_id: Mapped[str | None] = mapped_column(String(32))
    attended_by_name: Mapped[str | None] = mapped_column(String(160))

    clinic: Mapped[Clinic | None] = relationship(lazy="joined")
    patient: Mapped[Patient] = relationship(lazy="joined")


class VitalSigns(Base):
    __tablename__ = "vital_signs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    patient_id: Mapped[str] = mapped_column(String(32), ForeignKey("patients.id"), nullable=False, index=True)
    visit_id: Mapped[str | None] = mapped_column(String(32), ForeignKey("visits.id"), index=True)
    temperature: Mapped[float | None] = mapped_column(Float)
    pulse: Mapped[int | None] = mapped_column(Integer)
    respiratory_rate: Mapped[int | None] = mapped_column(Integer)
    systolic: Mapped[int | None] = mapped_column(Integer)
    diastolic: Mapped[int | None] = mapped_column(Integer)
    spo2: Mapped[int | None] = mapped_column(Integer)
    weight: Mapped[float | None] = mapped_column(Float)
    height: Mapped[float | None] = mapped_column(Float)
    notes: Mapped[str | None] = mapped_column(String(300))
    recorded_by_id: Mapped[str | None] = mapped_column(String(32))
    recorded_by_name: Mapped[str | None] = mapped_column(String(160))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class ClinicalNote(Base):
    __tablename__ = "clinical_notes"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    patient_id: Mapped[str] = mapped_column(String(32), ForeignKey("patients.id"), nullable=False, index=True)
    visit_id: Mapped[str | None] = mapped_column(String(32), ForeignKey("visits.id"), index=True)
    note_type: Mapped[str] = mapped_column(String(40), default="consultation", nullable=False)
    subjective: Mapped[str | None] = mapped_column(Text)
    objective: Mapped[str | None] = mapped_column(Text)
    assessment: Mapped[str | None] = mapped_column(Text)
    plan: Mapped[str | None] = mapped_column(Text)
    author_id: Mapped[str | None] = mapped_column(String(32))
    author_name: Mapped[str | None] = mapped_column(String(160))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class Diagnosis(Base):
    __tablename__ = "diagnoses"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    patient_id: Mapped[str] = mapped_column(String(32), ForeignKey("patients.id"), nullable=False, index=True)
    visit_id: Mapped[str | None] = mapped_column(String(32), ForeignKey("visits.id"), index=True)
    description: Mapped[str] = mapped_column(String(300), nullable=False)
    code: Mapped[str | None] = mapped_column(String(20))
    diagnosis_type: Mapped[str] = mapped_column(String(20), default="primary", nullable=False)
    recorded_by_id: Mapped[str | None] = mapped_column(String(32))
    recorded_by_name: Mapped[str | None] = mapped_column(String(160))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class Prescription(Base):
    __tablename__ = "prescriptions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    patient_id: Mapped[str] = mapped_column(String(32), ForeignKey("patients.id"), nullable=False, index=True)
    visit_id: Mapped[str | None] = mapped_column(String(32), ForeignKey("visits.id"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="open", nullable=False, index=True)
    notes: Mapped[str | None] = mapped_column(String(300))
    prescribed_by_id: Mapped[str | None] = mapped_column(String(32))
    prescribed_by_name: Mapped[str | None] = mapped_column(String(160))
    dispensed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    dispensed_by_id: Mapped[str | None] = mapped_column(String(32))
    dispensed_by_name: Mapped[str | None] = mapped_column(String(160))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    items: Mapped[list[PrescriptionItem]] = relationship(
        cascade="all, delete-orphan", order_by="PrescriptionItem.id", lazy="selectin"
    )


class PrescriptionItem(Base):
    __tablename__ = "prescription_items"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    prescription_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("prescriptions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    drug_name: Mapped[str] = mapped_column(String(160), nullable=False)
    dose: Mapped[str | None] = mapped_column(String(80))
    frequency: Mapped[str | None] = mapped_column(String(80))
    duration: Mapped[str | None] = mapped_column(String(80))
    route: Mapped[str | None] = mapped_column(String(60))
    quantity: Mapped[str | None] = mapped_column(String(40))


class LabRequest(Base):
    __tablename__ = "lab_requests"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    patient_id: Mapped[str] = mapped_column(String(32), ForeignKey("patients.id"), nullable=False, index=True)
    visit_id: Mapped[str | None] = mapped_column(String(32), ForeignKey("visits.id"), index=True)
    test_name: Mapped[str] = mapped_column(String(200), nullable=False)
    specimen: Mapped[str | None] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False, index=True)
    result_summary: Mapped[str | None] = mapped_column(Text)
    requested_by_id: Mapped[str | None] = mapped_column(String(32))
    requested_by_name: Mapped[str | None] = mapped_column(String(160))
    resulted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resulted_by_id: Mapped[str | None] = mapped_column(String(32))
    resulted_by_name: Mapped[str | None] = mapped_column(String(160))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class Allergy(Base):
    __tablename__ = "allergies"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    patient_id: Mapped[str] = mapped_column(String(32), ForeignKey("patients.id"), nullable=False, index=True)
    substance: Mapped[str] = mapped_column(String(160), nullable=False)
    reaction: Mapped[str | None] = mapped_column(String(200))
    severity: Mapped[str] = mapped_column(String(20), default="moderate", nullable=False)
    recorded_by_id: Mapped[str | None] = mapped_column(String(32))
    recorded_by_name: Mapped[str | None] = mapped_column(String(160))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    patient_id: Mapped[str] = mapped_column(String(32), ForeignKey("patients.id"), nullable=False, index=True)
    visit_id: Mapped[str | None] = mapped_column(String(32), ForeignKey("visits.id"), index=True)
    filename: Mapped[str] = mapped_column(String(200), nullable=False)
    kind: Mapped[str] = mapped_column(String(40), default="document", nullable=False)
    description: Mapped[str | None] = mapped_column(String(300))
    uploaded_by_id: Mapped[str | None] = mapped_column(String(32))
    uploaded_by_name: Mapped[str | None] = mapped_column(String(160))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
