import os
import time
import uuid

import httpx
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.user import User
from app.models.product import Product
from app.core.roles import Roles

BASE_URL = os.getenv("BASE_URL", "http://localhost:8000")
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


def ensure_test_product(required_qty: int = 100) -> int:
    db = SessionLocal()
    try:
        product = db.scalar(select(Product).where(Product.sku == "SKU-test"))

        if product is None:
            product = Product(
                sku="SKU-test",
                name="Test Product",
                stock_qty=required_qty,
            )
            db.add(product)
            db.commit()
            db.refresh(product)
            return product.id

        if product.stock_qty < required_qty:
            product.stock_qty = required_qty
            db.commit()
            db.refresh(product)

        return product.id
    finally:
        db.close()


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
    ensure_user_with_role(OP_EMAIL, OP_PASS, Roles.OPERATOR)
    token = login_access_token(OP_EMAIL, OP_PASS)
    product_id = ensure_test_product()

    reference = f"NL-ORDER-TEST-{uuid.uuid4().hex[:8]}"

    r = httpx.post(
        f"{BASE_URL}/orders",
        headers=auth_headers(token),
        json={
            "customer_id": CUSTOMER_ID,
            "reference": reference,
            "items": [{"product_id": product_id, "qty": 1}],
        },
        timeout=10,
    )
    assert r.status_code == 200, r.text
    order = r.json()
    order_id = order["id"]

    r = httpx.post(f"{BASE_URL}/orders/{order_id}/reserve", headers=auth_headers(token), timeout=10)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "RESERVED"

    r = httpx.post(f"{BASE_URL}/orders/{order_id}/start-pick", headers=auth_headers(token), timeout=10)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "PICKING"

    r = httpx.post(f"{BASE_URL}/orders/{order_id}/confirm-pick", headers=auth_headers(token), timeout=10)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "PICKED"

    r = httpx.post(f"{BASE_URL}/orders/{order_id}/ship", headers=auth_headers(token), timeout=10)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "SHIPPED"


def test_strict_transition_start_pick_from_new_is_409():
    wait_api()
    ensure_user_with_role(OP_EMAIL, OP_PASS, Roles.OPERATOR)
    token = login_access_token(OP_EMAIL, OP_PASS)
    product_id = ensure_test_product()

    reference = f"NL-ORDER-TEST-{uuid.uuid4().hex[:8]}"

    r = httpx.post(
        f"{BASE_URL}/orders",
        headers=auth_headers(token),
        json={
            "customer_id": CUSTOMER_ID,
            "reference": reference,
            "items": [{"product_id": product_id, "qty": 1}],
        },
        timeout=10,
    )
    assert r.status_code == 200, r.text
    order_id = r.json()["id"]

    r = httpx.post(f"{BASE_URL}/orders/{order_id}/start-pick", headers=auth_headers(token), timeout=10)
    assert r.status_code == 409, r.text


def test_service_cannot_access_orders_but_can_use_integrations():
    wait_api()
    ensure_user_with_role(SVC_EMAIL, SVC_PASS, Roles.SERVICE)
    svc_token = login_access_token(SVC_EMAIL, SVC_PASS)

    r = httpx.get(f"{BASE_URL}/orders/1", headers=auth_headers(svc_token), timeout=10)
    assert r.status_code == 403, r.text

    r = httpx.post(f"{BASE_URL}/integrations/orders/1/reserve", headers=auth_headers(svc_token), timeout=10)
    assert r.status_code in (200, 404, 409), r.text


def test_operator_cannot_access_metrics():
    wait_api()
    ensure_user_with_role(OP_EMAIL, OP_PASS, Roles.OPERATOR)
    token = login_access_token(OP_EMAIL, OP_PASS)

    r = httpx.get(f"{BASE_URL}/metrics", headers=auth_headers(token), timeout=10)
    assert r.status_code == 403, r.text


def test_soft_deleted_user_cannot_login():
    wait_api()

    email = f"deleted_{uuid.uuid4().hex[:6]}@example.com"
    password = "pass1234"

    ensure_user_with_role(email, password, Roles.OPERATOR)

    db = SessionLocal()
    try:
        user = db.scalar(select(User).where(User.email == email))
        assert user is not None
        user_id = user.id
    finally:
        db.close()

    admin_email = f"admin_{uuid.uuid4().hex[:6]}@example.com"
    admin_pass = "pass1234"

    ensure_user_with_role(admin_email, admin_pass, Roles.ADMIN)
    admin_token = login_access_token(admin_email, admin_pass)

    r = httpx.delete(
        f"{BASE_URL}/users/{user_id}",
        headers=auth_headers(admin_token),
        timeout=10,
    )
    assert r.status_code == 200, r.text

    r = httpx.post(
        f"{BASE_URL}/auth/login",
        json={"email": email, "password": password},
        timeout=10,
    )
    assert r.status_code == 401, r.text


def test_cannot_delete_last_active_admin():
    wait_api()

    email = f"lastadmin_{uuid.uuid4().hex[:6]}@example.com"
    password = "pass1234"

    ensure_user_with_role(email, password, Roles.ADMIN)
    token = login_access_token(email, password)

    db = SessionLocal()
    try:
        user = db.scalar(select(User).where(User.email == email))
        assert user is not None
        user_id = user.id

        admins = db.scalars(
            select(User).where(
                User.role == Roles.ADMIN,
                User.email != email,
                User.is_deleted == False,
            )
        ).all()

        for admin in admins:
            admin.role = Roles.OPERATOR

        db.commit()
    finally:
        db.close()

    r = httpx.delete(
        f"{BASE_URL}/users/{user_id}",
        headers=auth_headers(token),
        timeout=10,
    )
    assert r.status_code == 409, r.text