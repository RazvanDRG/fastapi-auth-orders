import uuid

import httpx
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.user import User
from tests.helpers import BASE_URL, wait_api


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


def test_auth_test_email_endpoint_is_removed():
    wait_api()
    r = httpx.get(f"{BASE_URL}/auth/test-email", timeout=10)
    assert r.status_code == 404, r.text
