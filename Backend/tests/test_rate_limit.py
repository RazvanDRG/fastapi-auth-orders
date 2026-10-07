import logging
import uuid

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.rate_limit import limiter
from app.core.roles import Roles
from app.main import app
from app.services.auth import create_access_token
from tests.test_api import (
    OP_EMAIL,
    OP_PASS,
    SVC_EMAIL,
    SVC_PASS,
    ensure_test_product,
    ensure_user_with_role,
    wait_api,
)

# In-process client: no lifespan (no Kafka, no workers), and limits can be
# lowered here because the limiter lives in this process.
client = TestClient(app)


class FakeClock:
    def __init__(self, now: float = 1000.0):
        self.now = now

    def __call__(self) -> float:
        return self.now


@pytest.fixture(autouse=True)
def low_limits(monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_login_max", 2)
    monkeypatch.setattr(settings, "rate_limit_login_window_seconds", 60)
    monkeypatch.setattr(settings, "rate_limit_forgot_password_max", 2)
    monkeypatch.setattr(settings, "rate_limit_forgot_password_window_seconds", 900)
    monkeypatch.setattr(settings, "rate_limit_create_order_max", 2)
    monkeypatch.setattr(settings, "rate_limit_create_order_window_seconds", 60)
    clock = FakeClock()
    monkeypatch.setattr(limiter, "clock", clock)
    limiter.reset()
    yield clock
    limiter.reset()


def _login(ip: str | None = None, headers: dict | None = None):
    headers = dict(headers or {})
    if ip:
        headers["CF-Connecting-IP"] = ip
    return client.post(
        "/auth/login",
        json={"email": "nobody_rl@example.com", "password": "Wrong1234!"},
        headers=headers,
    )


def test_login_over_limit_returns_429_with_retry_after():
    assert _login("10.0.0.1").status_code == 401
    assert _login("10.0.0.1").status_code == 401

    r = _login("10.0.0.1")
    assert r.status_code == 429, r.text
    assert r.headers["Retry-After"] == "60"
    assert r.json()["detail"] == "Too many requests, try again later."


def test_login_window_resets(low_limits):
    _login("10.0.0.2")
    _login("10.0.0.2")
    assert _login("10.0.0.2").status_code == 429

    low_limits.now += 30
    r = _login("10.0.0.2")
    assert r.status_code == 429
    assert r.headers["Retry-After"] == "30"

    low_limits.now += 30
    assert _login("10.0.0.2").status_code == 401


def test_login_different_ips_do_not_share_counters():
    _login("10.0.0.3")
    _login("10.0.0.3")
    assert _login("10.0.0.3").status_code == 429

    assert _login("10.0.0.4").status_code == 401


def test_login_falls_back_to_client_host_without_ip_header():
    # No CF-Connecting-IP: every call keys on request.client.host ("testclient")
    _login()
    _login()
    assert _login().status_code == 429

    assert _login("10.0.0.5").status_code == 401


def test_fake_forwarded_for_does_not_change_the_key():
    # Clients can forge X-Forwarded-For; rotating it must not reset the counter
    _login("10.0.0.6", headers={"X-Forwarded-For": "1.1.1.1"})
    _login("10.0.0.6", headers={"X-Forwarded-For": "2.2.2.2"})
    assert _login("10.0.0.6", headers={"X-Forwarded-For": "3.3.3.3"}).status_code == 429

    _login(headers={"X-Forwarded-For": "4.4.4.4"})
    _login(headers={"X-Forwarded-For": "5.5.5.5"})
    assert _login(headers={"X-Forwarded-For": "6.6.6.6"}).status_code == 429


def test_client_ip_header_name_comes_from_settings(monkeypatch):
    monkeypatch.setattr(settings, "client_ip_header", "x-real-ip")
    _login(headers={"X-Real-IP": "10.0.0.7"})
    _login(headers={"X-Real-IP": "10.0.0.7"})
    assert _login(headers={"X-Real-IP": "10.0.0.7"}).status_code == 429

    assert _login(headers={"X-Real-IP": "10.0.0.8"}).status_code == 401


def test_429_logs_client_ip(caplog):
    _login("10.0.0.9")
    _login("10.0.0.9")

    # The "app" logger does not propagate to root, so attach caplog directly
    app_logger = logging.getLogger("app")
    app_logger.addHandler(caplog.handler)
    try:
        assert _login("10.0.0.9").status_code == 429
    finally:
        app_logger.removeHandler(caplog.handler)
    assert any(getattr(r, "client_ip", None) == "10.0.0.9" for r in caplog.records)


def test_forgot_password_over_limit_returns_429():
    headers = {"CF-Connecting-IP": "10.0.1.1"}
    payload = {"email": f"rl_{uuid.uuid4().hex[:6]}@example.com"}

    assert client.post("/auth/forgot-password", json=payload, headers=headers).status_code == 200
    assert client.post("/auth/forgot-password", json=payload, headers=headers).status_code == 200

    r = client.post("/auth/forgot-password", json=payload, headers=headers)
    assert r.status_code == 429, r.text
    assert r.headers["Retry-After"] == "900"

    other = client.post("/auth/forgot-password", json=payload, headers={"CF-Connecting-IP": "10.0.1.2"})
    assert other.status_code == 200


def _token(email: str, password: str, role: str) -> dict:
    ensure_user_with_role(email, password, role)
    return {"Authorization": f"Bearer {create_access_token(subject=email, role=role)}"}


def test_create_order_limit_is_per_user():
    wait_api()
    product_id = ensure_test_product()
    payload = {"reference": "RL-UI", "items": [{"product_id": product_id, "qty": 1}]}
    op_headers = _token(OP_EMAIL, OP_PASS, Roles.OPERATOR)

    other_email = f"op_rl_{uuid.uuid4().hex[:6]}@example.com"
    other_headers = _token(other_email, OP_PASS, Roles.OPERATOR)

    assert client.post("/orders", json=payload, headers=op_headers).status_code == 200
    assert client.post("/orders", json=payload, headers=op_headers).status_code == 200

    r = client.post("/orders", json=payload, headers=op_headers)
    assert r.status_code == 429, r.text
    assert r.headers["Retry-After"] == "60"

    # Same IP, different user: separate counter
    assert client.post("/orders", json=payload, headers=other_headers).status_code == 200


def test_integration_create_order_over_limit_returns_429():
    wait_api()
    product_id = ensure_test_product()
    svc_headers = _token(SVC_EMAIL, SVC_PASS, Roles.SERVICE)

    def post():
        return client.post(
            "/integrations/orders",
            json={
                "reference": f"RL-INT-{uuid.uuid4().hex[:8]}",
                "source_company": "System 2 - Test",
                "items": [{"product_id": product_id, "qty": 1}],
            },
            headers=svc_headers,
        )

    assert post().status_code == 201
    assert post().status_code == 201

    r = post()
    assert r.status_code == 429, r.text
    assert "Retry-After" in r.headers
