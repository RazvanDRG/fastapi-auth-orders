"""Race tests: the same action fired many times at once must change state once (T-001)."""
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor

import httpx

from app.core.roles import Roles
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

PARALLEL = 10
ROUNDS = 5
ORDER_QTY = 3


def _fire_at_once(path: str, headers: dict | None = None, json: dict | None = None) -> list[httpx.Response]:
    """POST the same request PARALLEL times, released together by a barrier."""
    barrier = threading.Barrier(PARALLEL)

    def worker(_):
        with httpx.Client(base_url=BASE_URL, timeout=30) as client:
            # Open the connection before the barrier, so all requests leave together.
            client.get("/ops/live")
            barrier.wait()
            return client.post(path, headers=headers, json=json)

    with ThreadPoolExecutor(max_workers=PARALLEL) as pool:
        return list(pool.map(worker, range(PARALLEL)))


def _create_order(token: str, product_id: int) -> int:
    r = httpx.post(
        f"{BASE_URL}/orders",
        headers=auth_headers(token),
        json={
            "customer_id": CUSTOMER_ID,
            "reference": f"RACE-TEST-{uuid.uuid4().hex[:8]}",
            "items": [{"product_id": product_id, "qty": ORDER_QTY}],
        },
        timeout=10,
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _operator_setup() -> tuple[str, int]:
    wait_api()
    ensure_user_with_role(OP_EMAIL, OP_PASS, Roles.OPERATOR)
    token = login_access_token(OP_EMAIL, OP_PASS)
    product_id = ensure_test_product(required_qty=1000)
    return token, product_id


def test_concurrent_reserve_takes_stock_once():
    token, product_id = _operator_setup()

    for round_no in range(ROUNDS):
        order_id = _create_order(token, product_id)
        before = get_product_stock(product_id)

        responses = _fire_at_once(f"/orders/{order_id}/reserve", headers=auth_headers(token))

        after = get_product_stock(product_id)
        assert after == before - ORDER_QTY, (
            f"round {round_no}: stock {before} -> {after}, expected -{ORDER_QTY} once"
        )
        for r in responses:
            assert r.status_code == 200, r.text
            assert r.json()["status"] == "RESERVED"


def test_concurrent_cancel_restocks_once():
    token, product_id = _operator_setup()

    for round_no in range(ROUNDS):
        order_id = _create_order(token, product_id)
        r = httpx.post(f"{BASE_URL}/orders/{order_id}/reserve", headers=auth_headers(token), timeout=10)
        assert r.status_code == 200, r.text
        before = get_product_stock(product_id)

        responses = _fire_at_once(f"/orders/{order_id}/cancel", headers=auth_headers(token))

        after = get_product_stock(product_id)
        assert after == before + ORDER_QTY, (
            f"round {round_no}: stock {before} -> {after}, expected +{ORDER_QTY} once"
        )
        for r in responses:
            assert r.status_code == 200, r.text
            assert r.json()["status"] == "CANCELLED"


def test_concurrent_refresh_one_wins():
    wait_api()
    ensure_user_with_role(OP_EMAIL, OP_PASS, Roles.OPERATOR)

    for round_no in range(ROUNDS):
        r = httpx.post(
            f"{BASE_URL}/auth/login",
            json={"email": OP_EMAIL, "password": OP_PASS},
            timeout=10,
        )
        assert r.status_code == 200, r.text
        refresh_token = r.json()["refresh_token"]

        responses = _fire_at_once("/auth/refresh", json={"refresh_token": refresh_token})

        codes = sorted(r.status_code for r in responses)
        assert codes == [200] + [401] * (PARALLEL - 1), f"round {round_no}: status codes {codes}"
