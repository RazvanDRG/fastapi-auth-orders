import os
import time
import uuid

import httpx
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.user import User

BASE_URL = os.getenv("BASE_URL", "http://localhost:8000")
PRODUCT_ID = int(os.getenv("TEST_PRODUCT_ID", "1"))
CUSTOMER_ID = int(os.getenv("TEST_CUSTOMER_ID", "1"))

OP_EMAIL = os.getenv("TEST_OPERATOR_EMAIL", "op_test@example.com")
OP_PASS = os.getenv("TEST_OPERATOR_PASS", "pass1234")

SVC_EMAIL = os.getenv("TEST_SERVICE_EMAIL", "svc_test@example.com")
SVC_PASS = os.getenv("TEST_SERVICE_PASS", "pass1234")


def wait_api():
    for _ in range(30):
        try:
            r = httpx.get(f"{BASE_URL}/ops/live", timeout=2)
            if r.status_code == 200:
                return
        except Exception:
            pass
        time.sleep(1)
    raise RuntimeError("API not ready (ops/live not responding)")


def register(email: str, password: str):
    r = httpx.post(
        f"{BASE_URL}/auth/register",
        json={"email": email, "password": password},
        timeout=10,
    )
    if r.status_code in (200, 201, 409):
        return
    raise AssertionError(f"register failed: {r.status_code} {r.text}")


def set_user_role(email: str, role: str):
    db = SessionLocal()
    try:
        user = db.scalar(select(User).where(User.email == email))
        assert user is not None, f"user not found in DB after register: {email}"
        user.role = role
        db.commit()
    finally:
        db.close()


def ensure_user_with_role(email: str, password: str, role: str):
    register(email, password)
    set_user_role(email, role)


def login_access_token(email: str, password: str) -> str:
    r = httpx.post(
        f"{BASE_URL}/auth/login",
        json={"email": email, "password": password},
        timeout=10,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    body = r.json()
    assert "access_token" in body, f"no access_token in response: {body}"
    return body["access_token"]


def auth_headers(token: str):
    return {"Authorization": f"Bearer {token}"}


def test_ops_endpoints():
    wait_api()

    r = httpx.get(f"{BASE_URL}/ops/live")
    assert r.status_code == 200, r.text

    r = httpx.get(f"{BASE_URL}/ops/ready")
    assert r.status_code == 200, r.text


def test_auth_me_requires_token():
    wait_api()

    r = httpx.get(f"{BASE_URL}/auth/me")
    assert r.status_code in (401, 403), r.text


def test_happy_path_order_flow_operator():
    wait_api()
    ensure_user_with_role(OP_EMAIL, OP_PASS, "operator")
    token = login_access_token(OP_EMAIL, OP_PASS)

    reference = f"NL-ORDER-TEST-{uuid.uuid4().hex[:8]}"

    # Create order
    r = httpx.post(
        f"{BASE_URL}/orders",
        headers=auth_headers(token),
        json={
            "customer_id": CUSTOMER_ID,
            "reference": reference,
            "items": [{"product_id": PRODUCT_ID, "qty": 1}],
        },
        timeout=10,
    )
    assert r.status_code == 200, r.text
    order = r.json()
    order_id = order["id"]

    # reserve -> RESERVED
    r = httpx.post(f"{BASE_URL}/orders/{order_id}/reserve", headers=auth_headers(token), timeout=10)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "RESERVED"

    # start-pick -> PICKING
    r = httpx.post(f"{BASE_URL}/orders/{order_id}/start-pick", headers=auth_headers(token), timeout=10)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "PICKING"

    # confirm-pick -> PICKED
    r = httpx.post(f"{BASE_URL}/orders/{order_id}/confirm-pick", headers=auth_headers(token), timeout=10)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "PICKED"

    # ship -> SHIPPED
    r = httpx.post(f"{BASE_URL}/orders/{order_id}/ship", headers=auth_headers(token), timeout=10)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "SHIPPED"


def test_strict_transition_start_pick_from_new_is_409():
    wait_api()
    ensure_user_with_role(OP_EMAIL, OP_PASS, "operator")
    token = login_access_token(OP_EMAIL, OP_PASS)

    reference = f"NL-ORDER-TEST-{uuid.uuid4().hex[:8]}"

    r = httpx.post(
        f"{BASE_URL}/orders",
        headers=auth_headers(token),
        json={
            "customer_id": CUSTOMER_ID,
            "reference": reference,
            "items": [{"product_id": PRODUCT_ID, "qty": 1}],
        },
        timeout=10,
    )
    assert r.status_code == 200, r.text
    order_id = r.json()["id"]

    # start-pick directly from NEW must fail
    r = httpx.post(f"{BASE_URL}/orders/{order_id}/start-pick", headers=auth_headers(token), timeout=10)
    assert r.status_code == 409, r.text


def test_service_cannot_access_orders_but_can_use_integrations():
    wait_api()
    ensure_user_with_role(SVC_EMAIL, SVC_PASS, "service")
    svc_token = login_access_token(SVC_EMAIL, SVC_PASS)

    # service must NOT access /orders/*
    r = httpx.get(f"{BASE_URL}/orders/1", headers=auth_headers(svc_token), timeout=10)
    assert r.status_code == 403, r.text

    # service CAN access /integrations/*
    # Depending on data/order state, business result may vary
    r = httpx.post(f"{BASE_URL}/integrations/orders/1/reserve", headers=auth_headers(svc_token), timeout=10)
    assert r.status_code in (200, 404, 409), r.text