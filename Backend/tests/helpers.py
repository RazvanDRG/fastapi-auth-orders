"""Shared helpers and test accounts for the HTTP tests (they need the API and the database)."""
import os
import time
import uuid

import httpx
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.product import Product
from app.models.user import User
from app.services.auth import hash_password


BASE_URL = os.getenv("BASE_URL", "http://localhost:8000")
CUSTOMER_ID = int(os.getenv("TEST_CUSTOMER_ID", "1"))

OP_EMAIL = os.getenv("TEST_OPERATOR_EMAIL", "op_test@example.com")
OP_PASS = os.getenv("TEST_OPERATOR_PASS", "Pass1234!")

SVC_EMAIL = os.getenv("TEST_SERVICE_EMAIL", "svc_test@example.com")
SVC_PASS = os.getenv("TEST_SERVICE_PASS", "Pass1234!")


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


def register(email: str, password: str, first_name: str = "Test", last_name: str = "User"):
    payload = {
        "email": email,
        "password": password,
        "confirm_password": password,
        "first_name": first_name,
        "last_name": last_name,
    }

    if first_name is not None:
        payload["first_name"] = first_name

    if last_name is not None:
        payload["last_name"] = last_name

    r = httpx.post(
        f"{BASE_URL}/auth/register",
        json=payload,
        timeout=10,
    )
    if r.status_code in (200, 201, 409):
        return
    raise AssertionError(f"register failed: {r.status_code} {r.text}")


def set_user_role(email: str, role: str, password: str | None = None):
    db = SessionLocal()
    try:
        user = db.scalar(select(User).where(User.email == email))
        assert user is not None, f"user not found in DB after register: {email}"
        user.role = role
        user.is_deleted = False

        if password is not None:
            user.hashed_password = hash_password(password)

        db.commit()
    finally:
        db.close()


def ensure_user_with_role(email: str, password: str, role: str):
    register(email, password)
    set_user_role(email, role, password=password)


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


def create_integration_order(svc_token: str, product_id: int, qty: int) -> int:
    r = httpx.post(
        f"{BASE_URL}/integrations/orders",
        headers=auth_headers(svc_token),
        json={
            "reference": f"S2-TEST-{uuid.uuid4().hex[:8]}",
            "source_company": "System 2 - Test",
            "items": [{"product_id": product_id, "qty": qty}],
        },
        timeout=10,
    )
    assert r.status_code == 201, r.text
    assert r.json()["status"] == "NEW"
    return r.json()["id"]


def get_product_stock(product_id: int) -> int:
    db = SessionLocal()
    try:
        return db.get(Product, product_id).stock_qty
    finally:
        db.close()
