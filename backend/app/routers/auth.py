from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session as OrmSession

from ..audit import log_event
from ..config import settings
from ..db import get_db
from ..deps import get_current_staff
from ..models import Role, Staff, StaffStatus
from ..schemas import staff_public
from ..security import SESSION_COOKIE, AuthError, create_session, revoke_session
from ..utils import iso, utcnow

router = APIRouter(prefix="/auth", tags=["auth"])


class GoogleLoginIn(BaseModel):
    credential: str = Field(min_length=10)


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
        "google_client_id": settings.google_client_id,
        "google_sign_in_enabled": bool(settings.google_client_id),
        "preview_mode": settings.preview_mode,
        "idle_timeout_minutes": settings.session_idle_minutes,
    }


@router.post("/google")
def google_login(
    payload: GoogleLoginIn,
    request: Request,
    response: Response,
    db: OrmSession = Depends(get_db),
) -> dict:
    if not settings.google_client_id:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "google_not_configured",
                "message": "Google sign-in is not configured for this environment yet.",
            },
        )

    # Imported lazily so the API can boot before Google credentials exist.
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token as google_id_token

    try:
        info = google_id_token.verify_oauth2_token(
            payload.credential, google_requests.Request(), settings.google_client_id
        )
    except Exception:
        raise AuthError("invalid_google_token", "Google sign-in could not be verified.", 401)

    email = (info.get("email") or "").strip().lower()
    if not email or not info.get("email_verified"):
        raise AuthError("unverified_email", "Your Google email could not be verified.", 403)

    staff = _find_staff_by_email(db, email)
    if staff is None:
        log_event(
            db,
            action="login_denied",
            actor_email=email,
            summary="Google account is not on the staff list",
            request=request,
        )
        raise AuthError(
            "not_registered",
            "Your account has not been created. Contact your administrator.",
            403,
        )

    if info.get("sub") and staff.google_sub != info.get("sub"):
        staff.google_sub = info.get("sub")
    if info.get("picture"):
        staff.avatar_url = info.get("picture")

    return _complete_login(db, staff, request, response, "Google")


@router.post("/dev-login")
def dev_login(
    payload: DevLoginIn,
    request: Request,
    response: Response,
    db: OrmSession = Depends(get_db),
) -> dict:
    """Preview-only shortcut that signs in a seeded staff account by email.

    Disabled unless BASE44_PREVIEW_MODE is exactly "1"; real deployments use
    Google sign-in only.
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
