import asyncio
import json
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
from app.services.auth import hash_reset_code, hash_password
from app.models.user_admin_event import UserAdminEvent
from app.models.order import Order  # noqa: F401 - registers 'orders' for the outbox FK
from app.models.outbox_event import OutboxEvent
from app.models.order_event import OrderEvent
from app.services.outbox_service import publish_pending_outbox_events


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
    password = "Pass1234!"

    ensure_user_with_role(email, password, Roles.OPERATOR)

    db = SessionLocal()
    try:
        user = db.scalar(select(User).where(User.email == email))
        assert user is not None
        user_id = user.id
    finally:
        db.close()

    admin_email = f"admin_{uuid.uuid4().hex[:6]}@example.com"
    admin_pass = "Pass1234!"

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
    password = "Pass1234!"

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
    password = "Pass1234!"

    r = httpx.post(
        f"{BASE_URL}/auth/register",
        json={
            "email": email,
            "password": password,
            "confirm_password": password,
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
    password = "Pass1234!"
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
    password = "Pass1234!"
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
    old_password = "Pass1234!"
    new_password = "Newpass1234!"

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
    password = "Pass1234!"

    ensure_user_with_role(email, password, Roles.OPERATOR)
    create_password_reset_code(email=email, code="123456", expires_minutes=10)

    r = httpx.post(
        f"{BASE_URL}/auth/reset-password",
        json={
            "email": email,
            "code": "999999",
            "new_password": "Newpass1234!",
            "confirm_password": "Newpass1234!",
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
    password = "Pass1234!"

    ensure_user_with_role(email, password, Roles.OPERATOR)
    create_password_reset_code(email=email, code="123456", expires_minutes=10)

    r = httpx.post(
        f"{BASE_URL}/auth/reset-password",
        json={
            "email": email,
            "code": "123456",
            "new_password": "Newpass1234!",
            "confirm_password": "Different1234!",
        },
        timeout=10,
    )
    assert r.status_code == 400, r.text
    assert r.json()["detail"] == "Passwords do not match"


def test_reset_password_fails_with_expired_code():
    wait_api()

    email = f"resetexpired_{uuid.uuid4().hex[:6]}@example.com"
    password = "Pass1234!"

    ensure_user_with_role(email, password, Roles.OPERATOR)
    create_password_reset_code(email=email, code="123456", expires_minutes=-1)

    r = httpx.post(
        f"{BASE_URL}/auth/reset-password",
        json={
            "email": email,
            "code": "123456",
            "new_password": "Newpass1234!",
            "confirm_password": "Newpass1234!",
        },
        timeout=10,
    )
    assert r.status_code == 400, r.text
    assert r.json()["detail"] == "Invalid or expired reset code"
    
    
def test_reset_password_fails_if_new_password_matches_current_password():
    wait_api()

    email = f"resetsame_{uuid.uuid4().hex[:6]}@example.com"
    password = "Pass1234!"

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
    

def test_update_user_role_creates_admin_audit_event():
    wait_api()

    target_email = f"userrole_{uuid.uuid4().hex[:6]}@example.com"
    target_password = "Pass1234!"
    ensure_user_with_role(target_email, target_password, Roles.OPERATOR)

    admin_email = f"adminrole_{uuid.uuid4().hex[:6]}@example.com"
    admin_password = "Pass1234!"
    ensure_user_with_role(admin_email, admin_password, Roles.ADMIN)
    admin_token = login_access_token(admin_email, admin_password)

    db = SessionLocal()
    try:
        target_user = db.scalar(select(User).where(User.email == target_email))
        admin_user = db.scalar(select(User).where(User.email == admin_email))
        assert target_user is not None
        assert admin_user is not None
        target_user_id = target_user.id
        admin_user_id = admin_user.id
    finally:
        db.close()

    r = httpx.patch(
        f"{BASE_URL}/users/{target_user_id}/role",
        headers=auth_headers(admin_token),
        json={"role": Roles.SERVICE},
        timeout=10,
    )
    assert r.status_code == 200, r.text
    assert r.json()["role"] == Roles.SERVICE

    db = SessionLocal()
    try:
        event = db.scalar(
            select(UserAdminEvent)
            .where(
                UserAdminEvent.user_id == target_user_id,
                UserAdminEvent.action == "ROLE_CHANGED",
            )
            .order_by(UserAdminEvent.created_at.desc())
        )
        assert event is not None
        assert event.actor_user_id == admin_user_id
        assert event.old_role == Roles.OPERATOR
        assert event.new_role == Roles.SERVICE
    finally:
        db.close()


def test_soft_delete_user_creates_admin_audit_event():
    wait_api()

    target_email = f"userdel_{uuid.uuid4().hex[:6]}@example.com"
    target_password = "Pass1234!"
    ensure_user_with_role(target_email, target_password, Roles.OPERATOR)

    admin_email = f"admindel_{uuid.uuid4().hex[:6]}@example.com"
    admin_password = "Pass1234!"
    ensure_user_with_role(admin_email, admin_password, Roles.ADMIN)
    admin_token = login_access_token(admin_email, admin_password)

    db = SessionLocal()
    try:
        target_user = db.scalar(select(User).where(User.email == target_email))
        admin_user = db.scalar(select(User).where(User.email == admin_email))
        assert target_user is not None
        assert admin_user is not None
        target_user_id = target_user.id
        admin_user_id = admin_user.id
    finally:
        db.close()

    r = httpx.delete(
        f"{BASE_URL}/users/{target_user_id}",
        headers=auth_headers(admin_token),
        timeout=10,
    )
    assert r.status_code == 200, r.text
    assert r.json()["message"] == "User soft deleted"

    db = SessionLocal()
    try:
        event = db.scalar(
            select(UserAdminEvent)
            .where(
                UserAdminEvent.user_id == target_user_id,
                UserAdminEvent.action == "USER_SOFT_DELETED",
            )
            .order_by(UserAdminEvent.created_at.desc())
        )
        assert event is not None
        assert event.actor_user_id == admin_user_id
        assert event.old_role == Roles.OPERATOR
        assert event.new_role is None
    finally:
        db.close()

def test_outbox_row_stays_unpublished_when_kafka_producer_not_started():
    # pytest never runs the app lifespan, so the Kafka producer is not started
    # here: publishing must fail and the row must stay pending for a retry.
    wait_api()
    ensure_user_with_role(OP_EMAIL, OP_PASS, Roles.OPERATOR)
    token = login_access_token(OP_EMAIL, OP_PASS)
    product_id = ensure_test_product()

    r = httpx.post(
        f"{BASE_URL}/orders",
        headers=auth_headers(token),
        json={
            "customer_id": CUSTOMER_ID,
            "reference": f"NL-OUTBOX-TEST-{uuid.uuid4().hex[:8]}",
            "items": [{"product_id": product_id, "qty": 1}],
        },
        timeout=10,
    )
    assert r.status_code == 200, r.text
    order_id = r.json()["id"]

    db = SessionLocal()
    row_id = None
    try:
        row = OutboxEvent(
            event_type="wms.order.audit",
            order_id=order_id,
            payload=json.dumps({"test": True}),
        )
        db.add(row)
        db.commit()
        row_id = row.id

        asyncio.run(publish_pending_outbox_events(db))

        db.expire_all()
        row = db.get(OutboxEvent, row_id)
        assert row.published is False
        assert row.published_at is None
    finally:
        db.rollback()
        if row_id is not None:
            db.query(OutboxEvent).filter(OutboxEvent.id == row_id).delete()
            db.commit()
        db.close()


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


def test_integration_reserve_insufficient_stock_moves_order_to_failed_reservation():
    wait_api()
    ensure_user_with_role(SVC_EMAIL, SVC_PASS, Roles.SERVICE)
    svc_token = login_access_token(SVC_EMAIL, SVC_PASS)
    product_id = ensure_test_product()
    stock_before = get_product_stock(product_id)

    order_id = create_integration_order(svc_token, product_id, stock_before + 1000)

    r = httpx.post(f"{BASE_URL}/integrations/orders/{order_id}/reserve", headers=auth_headers(svc_token), timeout=10)
    assert r.status_code == 409, r.text

    db = SessionLocal()
    try:
        order = db.get(Order, order_id)
        assert order.status.value == "FAILED_RESERVATION"

        events = db.scalars(select(OrderEvent).where(OrderEvent.order_id == order_id)).all()
        assert any(
            e.action == "STATUS_CHANGE" and e.to_status.endswith("FAILED_RESERVATION") for e in events
        ), [(e.action, e.to_status) for e in events]

        audit_rows = db.scalars(
            select(OutboxEvent).where(
                OutboxEvent.order_id == order_id,
                OutboxEvent.event_type == "wms.order.audit",
            )
        ).all()
        assert any(
            json.loads(row.payload)["to_status"].endswith("FAILED_RESERVATION") for row in audit_rows
        ), [row.payload for row in audit_rows]

        reserved_rows = db.scalars(
            select(OutboxEvent).where(
                OutboxEvent.order_id == order_id,
                OutboxEvent.event_type == "wms.stock.reserved",
            )
        ).all()
        assert reserved_rows == []
    finally:
        db.close()

    assert get_product_stock(product_id) == stock_before


def test_integration_release_on_new_order_cancels_without_restock():
    wait_api()
    ensure_user_with_role(SVC_EMAIL, SVC_PASS, Roles.SERVICE)
    svc_token = login_access_token(SVC_EMAIL, SVC_PASS)
    product_id = ensure_test_product()

    order_id = create_integration_order(svc_token, product_id, 1)
    stock_before = get_product_stock(product_id)

    r = httpx.post(f"{BASE_URL}/integrations/orders/{order_id}/release", headers=auth_headers(svc_token), timeout=10)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "CANCELLED"

    assert get_product_stock(product_id) == stock_before

    db = SessionLocal()
    try:
        order = db.get(Order, order_id)
        assert order.status.value == "CANCELLED"

        released_rows = db.scalars(
            select(OutboxEvent).where(
                OutboxEvent.order_id == order_id,
                OutboxEvent.event_type == "wms.stock.released",
            )
        ).all()
        assert released_rows == []
    finally:
        db.close()


def test_integration_reserve_repeated_409_keeps_failed_reservation_without_new_audit():
    wait_api()
    ensure_user_with_role(SVC_EMAIL, SVC_PASS, Roles.SERVICE)
    svc_token = login_access_token(SVC_EMAIL, SVC_PASS)
    product_id = ensure_test_product()
    stock_before = get_product_stock(product_id)

    order_id = create_integration_order(svc_token, product_id, stock_before + 1000)

    r = httpx.post(f"{BASE_URL}/integrations/orders/{order_id}/reserve", headers=auth_headers(svc_token), timeout=10)
    assert r.status_code == 409, r.text

    r = httpx.post(f"{BASE_URL}/integrations/orders/{order_id}/reserve", headers=auth_headers(svc_token), timeout=10)
    assert r.status_code == 409, r.text
    assert "Insufficient stock" in r.json()["detail"], r.text

    db = SessionLocal()
    try:
        order = db.get(Order, order_id)
        assert order.status.value == "FAILED_RESERVATION"

        failed_events = [
            e for e in db.scalars(select(OrderEvent).where(OrderEvent.order_id == order_id)).all()
            if e.to_status and e.to_status.endswith("FAILED_RESERVATION")
        ]
        assert len(failed_events) == 1, failed_events

        failed_audit_rows = [
            row for row in db.scalars(
                select(OutboxEvent).where(
                    OutboxEvent.order_id == order_id,
                    OutboxEvent.event_type == "wms.order.audit",
                )
            ).all()
            if (json.loads(row.payload)["to_status"] or "").endswith("FAILED_RESERVATION")
        ]
        assert len(failed_audit_rows) == 1, [row.payload for row in failed_audit_rows]
    finally:
        db.close()

    assert get_product_stock(product_id) == stock_before


def _post_integration_order(svc_token: str, reference: str, items: list[dict]) -> httpx.Response:
    return httpx.post(
        f"{BASE_URL}/integrations/orders",
        headers=auth_headers(svc_token),
        json={"reference": reference, "source_company": "System 2 - Test", "items": items},
        timeout=10,
    )


def test_integration_create_order_retry_returns_same_order():
    wait_api()
    ensure_user_with_role(SVC_EMAIL, SVC_PASS, Roles.SERVICE)
    svc_token = login_access_token(SVC_EMAIL, SVC_PASS)
    product_id = ensure_test_product()
    reference = f"S2-DEDUPE-{uuid.uuid4().hex[:8]}"
    items = [{"product_id": product_id, "qty": 1}]

    first = _post_integration_order(svc_token, reference, items)
    assert first.status_code == 201, first.text

    second = _post_integration_order(svc_token, reference, items)
    assert second.status_code == 200, second.text
    assert second.json()["id"] == first.json()["id"]

    db = SessionLocal()
    try:
        orders = db.scalars(
            select(Order).where(Order.source_company == "System 2 - Test", Order.reference == reference)
        ).all()
        assert len(orders) == 1, [o.id for o in orders]
    finally:
        db.close()


def test_integration_create_order_same_reference_different_items_is_409():
    wait_api()
    ensure_user_with_role(SVC_EMAIL, SVC_PASS, Roles.SERVICE)
    svc_token = login_access_token(SVC_EMAIL, SVC_PASS)
    product_id = ensure_test_product()
    reference = f"S2-DEDUPE-{uuid.uuid4().hex[:8]}"

    first = _post_integration_order(svc_token, reference, [{"product_id": product_id, "qty": 1}])
    assert first.status_code == 201, first.text

    second = _post_integration_order(svc_token, reference, [{"product_id": product_id, "qty": 2}])
    assert second.status_code == 409, second.text


def test_human_orders_with_same_reference_are_not_deduplicated():
    wait_api()
    ensure_user_with_role(OP_EMAIL, OP_PASS, Roles.OPERATOR)
    token = login_access_token(OP_EMAIL, OP_PASS)
    product_id = ensure_test_product()
    reference = f"NL-DEDUPE-{uuid.uuid4().hex[:8]}"
    payload = {"reference": reference, "items": [{"product_id": product_id, "qty": 1}]}

    first = httpx.post(f"{BASE_URL}/orders", headers=auth_headers(token), json=payload, timeout=10)
    second = httpx.post(f"{BASE_URL}/orders", headers=auth_headers(token), json=payload, timeout=10)
    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert first.json()["id"] != second.json()["id"]
    assert first.json()["source_company"] is None


def test_integration_create_order_without_reference_is_422():
    wait_api()
    ensure_user_with_role(SVC_EMAIL, SVC_PASS, Roles.SERVICE)
    svc_token = login_access_token(SVC_EMAIL, SVC_PASS)
    product_id = ensure_test_product()

    r = httpx.post(
        f"{BASE_URL}/integrations/orders",
        headers=auth_headers(svc_token),
        json={"source_company": "System 2 - Test", "items": [{"product_id": product_id, "qty": 1}]},
        timeout=10,
    )
    assert r.status_code == 422, r.text


def test_integration_create_order_concurrent_retries_create_one_order():
    wait_api()
    ensure_user_with_role(SVC_EMAIL, SVC_PASS, Roles.SERVICE)
    svc_token = login_access_token(SVC_EMAIL, SVC_PASS)
    product_id = ensure_test_product()
    reference = f"S2-RACE-{uuid.uuid4().hex[:8]}"
    items = [{"product_id": product_id, "qty": 1}]

    async def send_all():
        async with httpx.AsyncClient(timeout=10) as client:
            return await asyncio.gather(*[
                client.post(
                    f"{BASE_URL}/integrations/orders",
                    headers=auth_headers(svc_token),
                    json={"reference": reference, "source_company": "System 2 - Test", "items": items},
                )
                for _ in range(5)
            ])

    responses = asyncio.run(send_all())
    codes = sorted(r.status_code for r in responses)
    assert codes == [200, 200, 200, 200, 201], [r.text for r in responses]
    assert len({r.json()["id"] for r in responses}) == 1

    db = SessionLocal()
    try:
        count = db.query(Order).filter(
            Order.source_company == "System 2 - Test", Order.reference == reference
        ).count()
        assert count == 1
    finally:
        db.close()
