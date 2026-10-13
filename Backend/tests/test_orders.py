import uuid

import httpx
from sqlalchemy import select

from app.core.roles import Roles
from app.db.session import SessionLocal
from app.models.order import Order
from app.models.order_event import OrderEvent
from tests.helpers import (
    BASE_URL,
    CUSTOMER_ID,
    OP_EMAIL,
    OP_PASS,
    auth_headers,
    ensure_test_product,
    ensure_user_with_role,
    get_product_stock,
    login_access_token,
    wait_api,
)


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


def test_retry_reserve_repeated_409_returns_insufficient_stock():
    wait_api()
    ensure_user_with_role(OP_EMAIL, OP_PASS, Roles.OPERATOR)
    token = login_access_token(OP_EMAIL, OP_PASS)
    product_id = ensure_test_product()
    stock_before = get_product_stock(product_id)

    r = httpx.post(
        f"{BASE_URL}/orders",
        headers=auth_headers(token),
        json={
            "customer_id": CUSTOMER_ID,
            "reference": f"NL-ORDER-TEST-{uuid.uuid4().hex[:8]}",
            "items": [{"product_id": product_id, "qty": stock_before + 1000}],
        },
        timeout=10,
    )
    assert r.status_code == 200, r.text
    order_id = r.json()["id"]

    r = httpx.post(f"{BASE_URL}/orders/{order_id}/reserve", headers=auth_headers(token), timeout=10)
    assert r.status_code == 409, r.text

    for _ in range(2):
        r = httpx.post(f"{BASE_URL}/orders/{order_id}/retry-reserve", headers=auth_headers(token), timeout=10)
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
    finally:
        db.close()

    assert get_product_stock(product_id) == stock_before
