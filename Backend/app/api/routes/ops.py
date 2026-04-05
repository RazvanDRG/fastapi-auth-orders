from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from app.core.config import settings
from app.db.session import engine

ops_router = APIRouter(prefix="/ops", tags=["Ops"])


@ops_router.get("/live", summary="Liveness probe")
def live():
    return {"status": "ok", "app": settings.app_name}


@ops_router.get("/ready", summary="Readiness probe (DB)")
def ready():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok", "db": "up"}
    except Exception:
        raise HTTPException(status_code=503, detail="Database not ready")