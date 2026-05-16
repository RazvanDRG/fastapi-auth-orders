from fastapi import APIRouter, HTTPException
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal, engine
from app.models.order_event import OrderEvent
from app.models.user_admin_event import UserAdminEvent
from app.services.archive_service import archive_due_orders

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


@ops_router.get("/activity", summary="Recent activity feed")
def recent_activity(limit: int = 20):
    db: Session = SessionLocal()

    try:
        order_events = (
            db.execute(
                select(OrderEvent)
                .order_by(OrderEvent.created_at.desc())
                .limit(limit)
            )
            .scalars()
            .all()
        )

        admin_events = (
            db.execute(
                select(UserAdminEvent)
                .order_by(UserAdminEvent.created_at.desc())
                .limit(limit)
            )
            .scalars()
            .all()
        )

        activities = []

        for event in order_events:
            activities.append(
                {
                    "type": "order",
                    "title": f"Order #{event.order_id}",
                    "description": (
                        f"{event.action}"
                        + (
                            f" ({event.from_status} → {event.to_status})"
                            if event.from_status or event.to_status
                            else ""
                        )
                    ),
                    "actor_user_id": event.actor_user_id,
                    "actor_role": event.actor_role,
                    "created_at": event.created_at,
                }
            )

        for event in admin_events:
            activities.append(
                {
                    "type": "admin",
                    "title": f"User #{event.user_id}",
                    "description": (
                        f"{event.action}"
                        + (
                            f" ({event.old_role} → {event.new_role})"
                            if event.old_role or event.new_role
                            else ""
                        )
                    ),
                    "actor_user_id": event.actor_user_id,
                    "actor_role": None,
                    "created_at": event.created_at,
                }
            )

        activities.sort(
            key=lambda activity: activity["created_at"],
            reverse=True,
        )

        return activities[:limit]

    finally:
        db.close()
        
@ops_router.post("/archive-orders", summary="Archive completed orders")
def process_order_archive():
    db: Session = SessionLocal()

    try:
        archived_count = archive_due_orders(db)

        return {
            "status": "ok",
            "archived_orders": archived_count,
        }

    finally:
        db.close()