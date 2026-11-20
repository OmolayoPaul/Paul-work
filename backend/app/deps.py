from __future__ import annotations

from fastapi import Depends, Request
from sqlalchemy.orm import Session as OrmSession

from .db import get_db
from .models import Role, Staff
from .security import SESSION_COOKIE, AuthError, resolve_session


def get_current_staff(request: Request, db: OrmSession = Depends(get_db)) -> Staff:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise AuthError("unauthenticated", "Please sign in to continue.")
    return resolve_session(db, token, request)


def require_roles(*roles: Role):
    """Dependency factory: allow only the listed roles."""

    allowed = set(roles)

    def dependency(staff: Staff = Depends(get_current_staff)) -> Staff:
        if staff.role not in allowed:
            raise AuthError(
                "forbidden",
                "You do not have permission to perform this action.",
                403,
            )
        return staff

    return dependency
