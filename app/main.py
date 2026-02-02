from fastapi import FastAPI
from app.core.config import settings
from app.db.session import engine
from app.db.base import Base

from app.api.auth import router as auth_router
from app.api.ops import ops_router
from app.api.orders import router as orders_router

from app.models import user, customer, product, order, order_item  # noqa: F401
from prometheus_fastapi_instrumentator import Instrumentator


app = FastAPI(title=settings.app_name)

Instrumentator().instrument(app).expose(
    app,
    endpoint="/metrics",
    include_in_schema=False
)

app.include_router(ops_router)
app.include_router(auth_router)
app.include_router(orders_router)

