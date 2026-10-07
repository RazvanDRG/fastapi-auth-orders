import logging
import math
import threading
import time

from fastapi import Depends, HTTPException, Request

from app.core.config import settings
from app.core.security import get_current_user
from app.models.user import User

logger = logging.getLogger("app")

# Expired keys are swept at most this often, so memory stays bounded
# without scanning the whole dict on every request.
SWEEP_INTERVAL_SECONDS = 60


class FixedWindowRateLimiter:
    """In-memory fixed-window counter. Per process only: several replicas
    would each keep their own counts (a shared store like Redis fixes that)."""

    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self._lock = threading.Lock()
        self._windows: dict[str, tuple[float, int]] = {}  # key -> (window_end, count)
        self._next_sweep = 0.0

    def hit(self, key: str, limit: int, window_seconds: int) -> int | None:
        """Count one request. Returns None if allowed, else seconds until the window resets."""
        with self._lock:
            now = self.clock()
            self._sweep(now)

            window_end, count = self._windows.get(key, (0.0, 0))
            if now >= window_end:
                window_end, count = now + window_seconds, 0

            if count >= limit:
                return max(1, math.ceil(window_end - now))

            self._windows[key] = (window_end, count + 1)
            return None

    def reset(self) -> None:
        with self._lock:
            self._windows.clear()
            self._next_sweep = 0.0

    def _sweep(self, now: float) -> None:
        if now < self._next_sweep:
            return
        self._windows = {k: v for k, v in self._windows.items() if v[0] > now}
        self._next_sweep = now + SWEEP_INTERVAL_SECONDS


limiter = FixedWindowRateLimiter()


def client_ip(request: Request) -> str:
    # X-Forwarded-For is never used: clients can forge it and Render only appends to it.
    # Cloudflare (in front of Render) overwrites cf-connecting-ip with the real caller.
    value = request.headers.get(settings.client_ip_header, "").strip()
    if value:
        return value
    return request.client.host if request.client else "unknown"


def _enforce(request: Request, key: str, limit: int, window_seconds: int) -> None:
    retry_after = limiter.hit(key, limit, window_seconds)
    if retry_after is not None:
        logger.warning(
            "rate_limited",
            extra={"client_ip": client_ip(request), "key": key, "path": request.url.path},
        )
        raise HTTPException(
            status_code=429,
            detail="Too many requests, try again later.",
            headers={"Retry-After": str(retry_after)},
        )


def limit_login(request: Request) -> None:
    _enforce(
        request,
        f"login:{client_ip(request)}",
        settings.rate_limit_login_max,
        settings.rate_limit_login_window_seconds,
    )


def limit_forgot_password(request: Request) -> None:
    _enforce(
        request,
        f"forgot-password:{client_ip(request)}",
        settings.rate_limit_forgot_password_max,
        settings.rate_limit_forgot_password_window_seconds,
    )


def limit_create_order(request: Request, current_user: User = Depends(get_current_user)) -> None:
    # Shared by UI and integration order creation; each user has one role, so one bucket is enough.
    _enforce(
        request,
        f"create-order:{current_user.id}",
        settings.rate_limit_create_order_max,
        settings.rate_limit_create_order_window_seconds,
    )
