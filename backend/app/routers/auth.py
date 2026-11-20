from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session as OrmSession

from ..audit import log_event
from ..config import settings
from ..db import get_db
from ..deps import get_current_staff
from ..models import Role, Staff, StaffStatus
from ..schemas import staff_public
from ..security import SESSION_COOKIE, AuthError, create_session, revoke_session, verify_password
from ..utils import iso, utcnow

router = APIRouter(prefix="/auth", tags=["auth"])


class PasswordLoginIn(BaseModel):
    email: str = Field(min_length=3)
    password: str = Field(min_length=1)


class DevLoginIn(BaseModel):
    email: str = Field(min_length=3)


def _find_staff_by_email(db: OrmSession, email: str) -> Staff | None:
    return db.scalar(select(Staff).where(func.lower(Staff.email) == email.strip().lower()))


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        httponly=True,
        samesite="lax",
        secure=settings.session_cookie_secure,
        max_age=settings.session_absolute_hours * 3600,
        path="/",
    )


def _complete_login(db: OrmSession, staff: Staff, request: Request, response: Response, method: str) -> dict:
    if staff.status != StaffStatus.active:
        log_event(
            db,
            action="login_blocked",
            actor=staff,
            summary="Deactivated account attempted to sign in",
            request=request,
        )
        raise AuthError(
            "account_inactive",
            "Your account has been deactivated. Contact your administrator.",
            403,
        )

    staff.last_login_at = utcnow()
    db.commit()

    token = create_session(db, staff, request)
    _set_session_cookie(response, token)

    log_event(
        db,
        action="login",
        actor=staff,
        summary=f"Signed in with {method}",
        request=request,
    )
    return staff_public(staff)


@router.get("/config")
def auth_config() -> dict:
    """Public bootstrap information for the sign-in screen."""
    return {
        "app_name": settings.app_name,
        "password_sign_in_enabled": True,
        "preview_mode": settings.preview_mode,
        "idle_timeout_minutes": settings.session_idle_minutes,
    }


@router.post("/login")
def password_login(
    payload: PasswordLoginIn,
    request: Request,
    response: Response,
    db: OrmSession = Depends(get_db),
) -> dict:
    staff = _find_staff_by_email(db, payload.email)
    if staff is None or not verify_password(payload.password, staff.password_hash):
        log_event(
            db,
            action="login_denied",
            actor_email=payload.email.strip().lower(),
            summary="Incorrect email or password",
            request=request,
        )
        raise AuthError(
            "invalid_credentials",
            "Incorrect email or password.",
            401,
        )
    return _complete_login(db, staff, request, response, "password")


@router.post("/dev-login")
def dev_login(
    payload: DevLoginIn,
    request: Request,
    response: Response,
    db: OrmSession = Depends(get_db),
) -> dict:
    """Preview-only shortcut that signs in a seeded staff account by email.

    Disabled unless BASE44_PREVIEW_MODE is exactly "1"; real deployments use
    email + password only.
    """
    if not settings.preview_mode:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Not found."})

    staff = _find_staff_by_email(db, payload.email)
    if staff is None:
        raise AuthError(
            "not_registered",
            "Your account has not been created. Contact your administrator.",
            403,
        )
    return _complete_login(db, staff, request, response, "preview sign-in")


@router.get("/dev-accounts")
def dev_accounts(db: OrmSession = Depends(get_db)) -> list[dict]:
    """Preview-only list of seeded staff used by the preview sign-in picker."""
    if not settings.preview_mode:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Not found."})

    staff = db.scalars(
        select(Staff).where(Staff.status == StaffStatus.active).order_by(Staff.role, Staff.full_name)
    ).all()
    return [
        {
            "email": person.email,
            "full_name": person.full_name,
            "role": person.role.value,
            "department": person.department,
        }
        for person in staff
    ]


@router.get("/me")
def me(staff: Staff = Depends(get_current_staff)) -> dict:
    return {
        **staff_public(staff),
        "idle_timeout_minutes": settings.session_idle_minutes,
        "session_checked_at": iso(utcnow()),
    }


@router.post("/logout")
def logout(request: Request, response: Response, db: OrmSession = Depends(get_db)) -> dict:
    token = request.cookies.get(SESSION_COOKIE)
    staff = None
    if token:
        from ..models import AuthSession
        from ..security import hash_token

        session = db.scalar(select(AuthSession).where(AuthSession.token_hash == hash_token(token)))
        if session is not None and session.revoked_at is None:
            staff = db.get(Staff, session.staff_id)
            revoke_session(db, session)

    if staff is not None:
        log_event(db, action="logout", actor=staff, summary="Signed out", request=request)

    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}
