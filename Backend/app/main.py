import asyncio
import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from jose import JWTError, jwt
from prometheus_fastapi_instrumentator import Instrumentator

from app.api.routes.auth import router as auth_router
from app.api.routes.integrations import router as integrations_router
from app.api.routes.ops import ops_router
from app.api.routes.orders import router as orders_router
from app.api.routes.users import router as users_router
from app.core.config import settings
from app.db.session import SessionLocal
from app.services.archive_service import archive_due_orders
from app.api.routes.products import router as products_router
from app.api.routes.metrics import router as metrics_router
from app.api.routes.sse import router as sse_router

from prometheus_fastapi_instrumentator import routing as _pfi_routing

_original_get_route_name = _pfi_routing._get_route_name

def _patched_get_route_name(scope, routes):
    from starlette.routing import Route
    filtered = [r for r in routes if isinstance(r, Route)]
    return _original_get_route_name(scope, filtered)

_pfi_routing._get_route_name = _patched_get_route_name

logger = logging.getLogger("app")


async def archive_orders_worker():
    while True:
        db = SessionLocal()

        try:
            archived = archive_due_orders(db)

            if archived > 0:
                logger.info(
                    "orders_archived",
                    extra={"archived_orders": archived},
                )

        except Exception:
            logger.exception("archive_worker_failed")

        finally:
            db.close()

        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(archive_orders_worker())
    try:
        yield
    finally:
        task.cancel()


app = FastAPI(
    title=settings.app_name,
    lifespan=lifespan,
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://fastapi-auth-orders-v3.vercel.app",
    ],
    allow_origin_regex=r"https://fastapi-auth-orders-v3.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    rid = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    request.state.request_id = rid

    if request.url.path == "/metrics" and request.method != "OPTIONS":
        auth = request.headers.get("Authorization", "")

        if not auth.startswith("Bearer "):
            return JSONResponse(
                status_code=401,
                content={"detail": "Missing Bearer token", "request_id": rid},
            )

        token = auth.split(" ", 1)[1].strip()

        try:
            payload = jwt.decode(
                token,
                settings.jwt_secret,
                algorithms=[settings.jwt_algorithm],
            )
        except JWTError:
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid token", "request_id": rid},
            )

        role = payload.get("role")

        if role != "admin":
            return JSONResponse(
                status_code=403,
                content={"detail": "Forbidden", "request_id": rid},
            )

    start = time.time()

    try:
        response = await call_next(request)
    except Exception:
        logger.exception(
            "unhandled_error",
            extra={"request_id": rid, "path": request.url.path},
        )
        raise

    duration_ms = int((time.time() - start) * 1000)

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
    return getattr(request.state, "request_id", None) or request.headers.get(
        "X-Request-ID"
    )


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

    logger.exception(
        "unhandled_exception",
        extra={"request_id": rid, "path": request.url.path},
    )

    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error", "request_id": rid},
    )


app.include_router(ops_router)
app.include_router(auth_router)
app.include_router(orders_router)
app.include_router(integrations_router)
app.include_router(users_router)
app.include_router(products_router)
app.include_router(metrics_router)
app.include_router(sse_router)

Instrumentator().instrument(app).expose(app)
