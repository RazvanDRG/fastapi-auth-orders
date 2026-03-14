from fastapi import APIRouter, Response, Depends
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from app.api.rbac import require_roles


router = APIRouter(
    prefix="/metrics",
    tags=["Ops"],
    dependencies=[Depends(require_roles("admin"))],
)


@router.get("", include_in_schema=False)
def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)