import uuid

import httpx
from sqlalchemy import select

from app.core.roles import Roles
from app.db.session import SessionLocal
from app.models.user import User
from app.models.user_admin_event import UserAdminEvent
from tests.helpers import (
    BASE_URL,
    OP_EMAIL,
    OP_PASS,
    SVC_EMAIL,
    SVC_PASS,
    auth_headers,
    ensure_user_with_role,
    login_access_token,
    wait_api,
)


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
