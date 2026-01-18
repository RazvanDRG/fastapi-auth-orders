from fastapi import APIRouter
from app.core.config import settings
from app.db.session import engine
from sqlalchemy import text

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
    except Exception as e:
        return {"status": "error", "db": "down", "detail": str(e)}