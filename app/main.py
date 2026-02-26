from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from prometheus_fastapi_instrumentator import Instrumentator

from app.core.config import settings
from app.api.auth import router as auth_router
from app.api.ops import ops_router
from app.api.orders import router as orders_router

import time
import uuid
import logging

app = FastAPI(title=settings.app_name)
logger = logging.getLogger("app")


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    # Use upstream request id if provided; otherwise generate one
    rid = request.headers.get("X-Request-ID") or str(uuid.uuid4())

    # Make it available everywhere (endpoints + exception handlers)
    request.state.request_id = rid

    start = time.time()
    try:
        response = await call_next(request)
    except Exception:
        logger.exception("unhandled_error", extra={"request_id": rid, "path": request.url.path})
        raise

    duration_ms = int((time.time() - start) * 1000)

    # Propagate back to client
    response.headers["X-Request-ID"] = rid

    logger.info(
        "request",
        extra={
            "request_id": rid,
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": duration_ms,
        },
    )
    return response


def _rid(request: Request) -> str | None:
    return getattr(request.state, "request_id", None) or request.headers.get("X-Request-ID")


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "request_id": _rid(request)},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "request_id": _rid(request)},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    rid = _rid(request)
    logger.exception("unhandled_exception", extra={"request_id": rid, "path": request.url.path})
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error", "request_id": rid},
    )


Instrumentator().instrument(app).expose(
    app,
    endpoint="/metrics",
    include_in_schema=False,
)

app.include_router(ops_router)
app.include_router(auth_router)
app.include_router(orders_router)

