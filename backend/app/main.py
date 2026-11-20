from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .config import settings
from .models import Role
from .routers import (
    audit,
    auth,
    dashboard,
    messages,
    ocr,
    orders,
    patients,
    reference,
    reports,
    staff,
    worklist,
)
from .security import AuthError

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("afridetect.api")


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Keep the configured super admin account in place.

    The setup service seeds it once; this keeps the account correct if
    SUPER_ADMIN_EMAIL is changed later through the secret store.
    """
    try:
        from .db import SessionLocal
        from .setup import ensure_staff

        db = SessionLocal()
        try:
            ensure_staff(
                db,
                full_name=settings.super_admin_name,
                email=settings.super_admin_email,
                role=Role.super_admin,
                department="Executive",
                staff_id="AFD-SA-001",
            )
        finally:
            db.close()
    except Exception:  # pragma: no cover - the setup service owns first boot
        logger.exception("Could not ensure the super admin account")
    yield


app = FastAPI(title="Afridetect EMR API", version="0.1.0", lifespan=lifespan)


@app.exception_handler(AuthError)
async def auth_error_handler(request: Request, exc: AuthError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status,
        content={"detail": {"code": exc.code, "message": exc.message}},
    )


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "app": settings.app_name}


app.include_router(auth.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(staff.router, prefix="/api")
app.include_router(audit.router, prefix="/api")
app.include_router(patients.router, prefix="/api")
app.include_router(worklist.router, prefix="/api")
app.include_router(reference.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(ocr.router, prefix="/api")
app.include_router(orders.router, prefix="/api")
app.include_router(messages.router, prefix="/api")
