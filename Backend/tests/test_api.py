import os
import time
import uuid

import httpx
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.user import User
from app.models.product import Product
from app.core.roles import Roles
from datetime import datetime, timedelta, timezone

from app.models.password_reset_code import PasswordResetCode
from app.models.refresh_token import RefreshToken
from app.services.auth import hash_reset_code


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


def register(email: str, password: str, first_name: str | None = None, last_name: str | None = None):
    payload = {
        "email": email,
        "password": password,
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


def create_password_reset_code(email: str, code: str = "123456", expires_minutes: int = 10):
    db = SessionLocal()
    try:
        user = db.scalar(select(User).where(User.email == email))
        assert user is not None, f"user not found: {email}"

        now = datetime.now(timezone.utc)

        reset_code = PasswordResetCode(
            user_id=user.id,
            code_hash=hash_reset_code(code),
            created_at=now,
            expires_at=now + timedelta(minutes=expires_minutes),
            attempt_count=0,
            max_attempts=5,
            used_at=None,
        )
        db.add(reset_code)
        db.commit()
        db.refresh(reset_code)
        return reset_code.id
    finally:
        db.close()

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
    
    
def test_register_with_optional_first_and_last_name():
    wait_api()

    email = f"name_{uuid.uuid4().hex[:6]}@example.com"
    password = "pass1234"

    r = httpx.post(
        f"{BASE_URL}/auth/register",
        json={
            "email": email,
            "password": password,
            "first_name": "John",
            "last_name": "Doe",
        },
        timeout=10,
    )
    assert r.status_code == 201, r.text

    db = SessionLocal()
    try:
        user = db.scalar(select(User).where(User.email == email))
        assert user is not None
        assert user.first_name == "John"
        assert user.last_name == "Doe"
    finally:
        db.close()
        
def test_forgot_password_returns_generic_response_for_existing_and_unknown_email():
    wait_api()

    email = f"forgot_{uuid.uuid4().hex[:6]}@example.com"
    password = "pass1234"
    ensure_user_with_role(email, password, Roles.OPERATOR)

    r1 = httpx.post(
        f"{BASE_URL}/auth/forgot-password",
        json={"email": email},
        timeout=10,
    )
    assert r1.status_code == 200, r1.text
    assert r1.json()["message"] == "If the account exists, a reset code was sent."

    r2 = httpx.post(
        f"{BASE_URL}/auth/forgot-password",
        json={"email": f"missing_{uuid.uuid4().hex[:6]}@example.com"},
        timeout=10,
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["message"] == "If the account exists, a reset code was sent."


def test_forgot_password_creates_reset_code_for_existing_user():
    wait_api()

    email = f"forgotdb_{uuid.uuid4().hex[:6]}@example.com"
    password = "pass1234"
    ensure_user_with_role(email, password, Roles.OPERATOR)

    r = httpx.post(
        f"{BASE_URL}/auth/forgot-password",
        json={"email": email},
        timeout=10,
    )
    assert r.status_code == 200, r.text
    assert r.json()["message"] == "If the account exists, a reset code was sent."

    db = SessionLocal()
    try:
        user = db.scalar(select(User).where(User.email == email))
        assert user is not None

        reset_code = db.scalar(
            select(PasswordResetCode)
            .where(PasswordResetCode.user_id == user.id)
            .order_by(PasswordResetCode.created_at.desc())
        )
        assert reset_code is not None
        assert reset_code.used_at is None
    finally:
        db.close()


def test_reset_password_with_valid_code_revokes_old_refresh_tokens():
    wait_api()

    email = f"resetok_{uuid.uuid4().hex[:6]}@example.com"
    old_password = "pass1234"
    new_password = "newpass1234"

    ensure_user_with_role(email, old_password, Roles.OPERATOR)

    login_response = httpx.post(
        f"{BASE_URL}/auth/login",
        json={"email": email, "password": old_password},
        timeout=10,
    )
    assert login_response.status_code == 200, login_response.text

    create_password_reset_code(email=email, code="123456", expires_minutes=10)

    r = httpx.post(
        f"{BASE_URL}/auth/reset-password",
        json={
            "email": email,
            "code": "123456",
            "new_password": new_password,
            "confirm_password": new_password,
        },
        timeout=10,
    )
    assert r.status_code == 200, r.text
    assert r.json()["message"] == "Password was reset successfully."

    db = SessionLocal()
    try:
        user = db.scalar(select(User).where(User.email == email))
        assert user is not None

        active_tokens = db.scalars(
            select(RefreshToken).where(
                RefreshToken.user_id == user.id,
                RefreshToken.revoked_at.is_(None),
            )
        ).all()
        assert len(active_tokens) == 0
    finally:
        db.close()

    r_old = httpx.post(
        f"{BASE_URL}/auth/login",
        json={"email": email, "password": old_password},
        timeout=10,
    )
    assert r_old.status_code == 401, r_old.text

    r_new = httpx.post(
        f"{BASE_URL}/auth/login",
        json={"email": email, "password": new_password},
        timeout=10,
    )
    assert r_new.status_code == 200, r_new.text


def test_reset_password_fails_with_wrong_code_and_increments_attempt_count():
    wait_api()

    email = f"resetbad_{uuid.uuid4().hex[:6]}@example.com"
    password = "pass1234"

    ensure_user_with_role(email, password, Roles.OPERATOR)
    create_password_reset_code(email=email, code="123456", expires_minutes=10)

    r = httpx.post(
        f"{BASE_URL}/auth/reset-password",
        json={
            "email": email,
            "code": "999999",
            "new_password": "newpass1234",
            "confirm_password": "newpass1234",
        },
        timeout=10,
    )
    assert r.status_code == 400, r.text
    assert r.json()["detail"] == "Invalid or expired reset code"

    db = SessionLocal()
    try:
        user = db.scalar(select(User).where(User.email == email))
        assert user is not None

        reset_code = db.scalar(
            select(PasswordResetCode)
            .where(
                PasswordResetCode.user_id == user.id,
                PasswordResetCode.used_at.is_(None),
            )
            .order_by(PasswordResetCode.created_at.desc())
        )
        assert reset_code is not None
        assert reset_code.attempt_count == 1
    finally:
        db.close()


def test_reset_password_fails_when_passwords_do_not_match():
    wait_api()

    email = f"resetmismatch_{uuid.uuid4().hex[:6]}@example.com"
    password = "pass1234"

    ensure_user_with_role(email, password, Roles.OPERATOR)
    create_password_reset_code(email=email, code="123456", expires_minutes=10)

    r = httpx.post(
        f"{BASE_URL}/auth/reset-password",
        json={
            "email": email,
            "code": "123456",
            "new_password": "newpass1234",
            "confirm_password": "different1234",
        },
        timeout=10,
    )
    assert r.status_code == 400, r.text
    assert r.json()["detail"] == "Passwords do not match"


def test_reset_password_fails_with_expired_code():
    wait_api()

    email = f"resetexpired_{uuid.uuid4().hex[:6]}@example.com"
    password = "pass1234"

    ensure_user_with_role(email, password, Roles.OPERATOR)
    create_password_reset_code(email=email, code="123456", expires_minutes=-1)

    r = httpx.post(
        f"{BASE_URL}/auth/reset-password",
        json={
            "email": email,
            "code": "123456",
            "new_password": "newpass1234",
            "confirm_password": "newpass1234",
        },
        timeout=10,
    )
    assert r.status_code == 400, r.text
    assert r.json()["detail"] == "Invalid or expired reset code"
    
    
def test_reset_password_fails_if_new_password_matches_current_password():
    wait_api()

    email = f"resetsame_{uuid.uuid4().hex[:6]}@example.com"
    password = "pass1234"

    ensure_user_with_role(email, password, Roles.OPERATOR)
    create_password_reset_code(email=email, code="123456", expires_minutes=10)

    r = httpx.post(
        f"{BASE_URL}/auth/reset-password",
        json={
            "email": email,
            "code": "123456",
            "new_password": password,
            "confirm_password": password,
        },
        timeout=10,
    )
    assert r.status_code == 400, r.text
    assert r.json()["detail"] == "New password must be different from the current password"