from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session as OrmSession

from .config import settings
from .models import AuthSession, Staff, StaffStatus, new_id
from .utils import client_ip, utcnow

SESSION_COOKIE = "afridetect_session"

_PBKDF2_ITERATIONS = 200_000


class AuthError(Exception):
    """Raised for authentication / authorisation failures."""

    def __init__(self, code: str, message: str, status: int = 401):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def hash_password(password: str) -> str:
    """Hash a password using PBKDF2-HMAC-SHA256. Returns 'iterations$salt$hash'."""
    salt = secrets.token_hex(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), _PBKDF2_ITERATIONS)
    return f"{_PBKDF2_ITERATIONS}${salt}${derived.hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    """Check a password against the stored 'iterations$salt$hash' string."""
    if not stored:
        return False
    try:
        iterations_str, salt, expected_hash = stored.split("$")
        iterations = int(iterations_str)
    except (ValueError, AttributeError):
        return False
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), iterations)
    return secrets.compare_digest(derived.hex(), expected_hash)


def create_session(db: OrmSession, staff: Staff, request) -> str:
    token = secrets.token_urlsafe(32)
    now = utcnow()
    session = AuthSession(
        id=new_id(),
        staff_id=staff.id,
        token_hash=hash_token(token),
        created_at=now,
        last_seen_at=now,
        expires_at=now + timedelta(hours=settings.session_absolute_hours),
        user_agent=(request.headers.get("user-agent") or "")[:300] if request else None,
        ip=client_ip(request),
    )
    db.add(session)
    db.commit()
    return token


def revoke_session(db: OrmSession, session: AuthSession) -> None:
    session.revoked_at = utcnow()
    db.commit()


def resolve_session(db: OrmSession, token: str, request=None) -> Staff:
    """Validate an opaque session token and enforce idle / absolute expiry."""
    session = db.scalar(select(AuthSession).where(AuthSession.token_hash == hash_token(token)))
    if session is None or session.revoked_at is not None:
        raise AuthError("unauthenticated", "Please sign in to continue.")

    now = utcnow()
    if session.expires_at <= now:
        revoke_session(db, session)
        raise AuthError("session_expired", "Your session has expired. Please sign in again.")

    idle_limit = timedelta(minutes=settings.session_idle_minutes)
    if session.last_seen_at is not None and now - session.last_seen_at > idle_limit:
        revoke_session(db, session)
        raise AuthError(
            "idle_timeout",
            f"You were signed out after {settings.session_idle_minutes} minutes of inactivity.",
        )

    session.last_seen_at = now
    db.commit()

    staff = db.get(Staff, session.staff_id)
    if staff is None:
        revoke_session(db, session)
        raise AuthError("unauthenticated", "Please sign in to continue.")
    if staff.status != StaffStatus.active:
        revoke_session(db, session)
        raise AuthError(
            "account_inactive",
            "Your account has been deactivated. Contact your administrator.",
            403,
        )
    return staff
