from fastapi import FastAPI
from app.core.config import settings
from app.db.session import engine
from app.db.base import Base

from app.api.auth import router as auth_router

from app.models import user, customer, product, order, order_item  # noqa: F401

app = FastAPI(title=settings.app_name)

@app.get("/")
def health():
    return {"status": "ok", "app": settings.app_name}

@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)

app.include_router(auth_router)
