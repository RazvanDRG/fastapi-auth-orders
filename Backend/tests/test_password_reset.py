import uuid
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import select

from app.core.roles import Roles
from app.db.session import SessionLocal
from app.models.password_reset_code import PasswordResetCode
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.services.auth import hash_reset_code
from tests.helpers import BASE_URL, ensure_user_with_role, wait_api


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


def test_forgot_password_sends_exactly_one_email(monkeypatch):
    from app.api.routes import auth as auth_routes
    from app.schemas.auth import ForgotPasswordRequest

    email = f"forgotmail_{uuid.uuid4().hex[:6]}@example.com"
    ensure_user_with_role(email, "Pass1234!", Roles.OPERATOR)

    calls = []
    monkeypatch.setattr(auth_routes, "send_password_reset_code", lambda **kwargs: calls.append(kwargs))

    # Called in-process so the mock replaces the real sender
    db = SessionLocal()
    try:
        auth_routes.forgot_password(ForgotPasswordRequest(email=email), db)
    finally:
        db.close()

    assert len(calls) == 1, calls
    assert calls[0]["email"] == email


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
