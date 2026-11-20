from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session as OrmSession

from ..audit import log_event
from ..db import get_db
from ..deps import get_current_staff
from ..models import Message, Patient, Staff, StaffStatus, new_id
from ..utils import iso, utcnow

router = APIRouter(prefix="/messages", tags=["messages"])


def message_public(message: Message) -> dict:
    return {
        "id": message.id,
        "thread_id": message.thread_id,
        "subject": message.subject,
        "body": message.body,
        "sender_id": message.sender_id,
        "sender_name": message.sender_name,
        "sender_role": message.sender_role,
        "recipient_id": message.recipient_id,
        "recipient_name": message.recipient_name,
        "patient_id": message.patient_id,
        "patient_name": message.patient_name,
        "read_at": iso(message.read_at),
        "created_at": iso(message.created_at),
    }


def _thread_messages(db: OrmSession, staff: Staff) -> list[Message]:
    return db.scalars(
        select(Message)
        .where(or_(Message.sender_id == staff.id, Message.recipient_id == staff.id))
        .order_by(Message.created_at.asc())
    ).all()


def _threads(db: OrmSession, staff: Staff, box: str) -> list[dict]:
    messages = _thread_messages(db, staff)
    grouped: dict[str, list[Message]] = {}
    for message in messages:
        grouped.setdefault(message.thread_id, []).append(message)

    threads = []
    for thread_id, rows in grouped.items():
        rows.sort(key=lambda row: row.created_at)
        last = rows[-1]
        if box == "sent":
            if last.sender_id != staff.id:
                continue
            other = {"id": last.recipient_id, "name": last.recipient_name}
        else:
            if last.recipient_id != staff.id:
                continue
            other = {"id": last.sender_id, "name": last.sender_name}
        unread = sum(
            1 for row in rows if row.recipient_id == staff.id and row.read_at is None
        )
        threads.append(
            {
                "thread_id": thread_id,
                "subject": next((row.subject for row in rows if row.subject), "(no subject)"),
                "patient_id": last.patient_id,
                "patient_name": last.patient_name,
                "other_party": other,
                "last_message": message_public(last),
                "unread": unread,
                "message_count": len(rows),
                "updated_at": iso(last.created_at),
            }
        )
    threads.sort(key=lambda thread: thread["updated_at"] or "", reverse=True)
    return threads


@router.get("")
def list_messages(
    box: str = Query(default="inbox", pattern="^(inbox|sent)$"),
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(get_current_staff),
) -> dict:
    return {"items": _threads(db, staff, box), "unread_total": _unread_total(db, staff)}


def _unread_total(db: OrmSession, staff: Staff) -> int:
    rows = db.scalars(
        select(Message).where(Message.recipient_id == staff.id, Message.read_at.is_(None))
    ).all()
    return len(rows)


@router.get("/unread-count")
def unread_count(
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(get_current_staff),
) -> dict:
    return {"unread": _unread_total(db, staff)}


@router.get("/recipients")
def recipients(
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(get_current_staff),
) -> dict:
    rows = db.scalars(
        select(Staff)
        .where(Staff.status == StaffStatus.active, Staff.id != staff.id)
        .order_by(Staff.full_name)
    ).all()
    return {
        "items": [
            {
                "id": row.id,
                "full_name": row.full_name,
                "role": row.role.value,
                "department": row.department,
            }
            for row in rows
        ]
    }


@router.get("/{thread_id}")
def thread_detail(
    thread_id: str,
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(get_current_staff),
) -> dict:
    rows = db.scalars(
        select(Message)
        .where(Message.thread_id == thread_id)
        .order_by(Message.created_at.asc())
    ).all()
    if not rows or not any(
        staff.id in (row.sender_id, row.recipient_id) for row in rows
    ):
        raise HTTPException(
            status_code=404, detail={"code": "not_found", "message": "Message thread not found."}
        )
    return {"thread_id": thread_id, "messages": [message_public(row) for row in rows]}


class MessageCreate(BaseModel):
    recipient_id: str
    subject: str | None = Field(default=None, max_length=200)
    body: str = Field(min_length=1, max_length=4000)
    patient_id: str | None = None


def _recipient(db: OrmSession, recipient_id: str, sender: Staff) -> Staff:
    person = db.get(Staff, recipient_id)
    if person is None or person.status != StaffStatus.active:
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_recipient", "message": "Choose an active member of staff."},
        )
    if person.id == sender.id:
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_recipient", "message": "You cannot message yourself."},
        )
    return person


@router.post("", status_code=201)
def send_message(
    payload: MessageCreate,
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(get_current_staff),
) -> dict:
    recipient = _recipient(db, payload.recipient_id, staff)
    patient = db.get(Patient, payload.patient_id) if payload.patient_id else None
    message = Message(
        id=new_id(),
        thread_id=new_id(),
        subject=(payload.subject or "").strip() or None,
        body=payload.body.strip(),
        sender_id=staff.id,
        sender_name=staff.full_name,
        sender_role=staff.role.value,
        recipient_id=recipient.id,
        recipient_name=recipient.full_name,
        patient_id=patient.id if patient else None,
        patient_name=f"{patient.first_name} {patient.last_name}" if patient else None,
    )
    message.thread_id = message.id
    db.add(message)
    db.commit()
    log_event(
        db,
        action="message_sent",
        actor=staff,
        entity_type="message",
        entity_id=message.id,
        patient_id=message.patient_id,
        patient_name=message.patient_name,
        summary=f"Message sent to {recipient.full_name}"
        + (f" about {message.patient_name}" if message.patient_name else ""),
        meta={"thread_id": message.thread_id},
    )
    return message_public(message)


class ReplyCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


@router.post("/{thread_id}/reply", status_code=201)
def reply_message(
    thread_id: str,
    payload: ReplyCreate,
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(get_current_staff),
) -> dict:
    rows = db.scalars(
        select(Message)
        .where(Message.thread_id == thread_id)
        .order_by(Message.created_at.asc())
    ).all()
    if not rows or not any(staff.id in (row.sender_id, row.recipient_id) for row in rows):
        raise HTTPException(
            status_code=404, detail={"code": "not_found", "message": "Message thread not found."}
        )
    last = rows[-1]
    other = last.recipient_id if last.sender_id == staff.id else last.sender_id
    other_name = last.recipient_name if last.sender_id == staff.id else last.sender_name
    recipient = _recipient(db, other, staff)
    message = Message(
        id=new_id(),
        thread_id=thread_id,
        subject=last.subject,
        body=payload.body.strip(),
        sender_id=staff.id,
        sender_name=staff.full_name,
        sender_role=staff.role.value,
        recipient_id=recipient.id,
        recipient_name=other_name or recipient.full_name,
        patient_id=last.patient_id,
        patient_name=last.patient_name,
    )
    db.add(message)
    db.commit()
    log_event(
        db,
        action="message_replied",
        actor=staff,
        entity_type="message",
        entity_id=message.id,
        patient_id=message.patient_id,
        patient_name=message.patient_name,
        summary=f"Replied to {recipient.full_name}",
        meta={"thread_id": thread_id},
    )
    return message_public(message)


@router.post("/{thread_id}/read")
def mark_thread_read(
    thread_id: str,
    db: OrmSession = Depends(get_db),
    staff: Staff = Depends(get_current_staff),
) -> dict:
    rows = db.scalars(
        select(Message).where(
            Message.thread_id == thread_id,
            Message.recipient_id == staff.id,
            Message.read_at.is_(None),
        )
    ).all()
    now = utcnow()
    for row in rows:
        row.read_at = now
    db.commit()
    return {"marked": len(rows), "read_at": iso(now)}
