import json
import uuid
from datetime import datetime, timedelta, timezone

import httpx

from app.core.roles import Roles
from app.db.session import SessionLocal
from app.models.order import Order  # noqa: F401 - registers 'orders' for the outbox FK
from app.models.outbox_event import OutboxEvent
from tests.helpers import (
    BASE_URL,
    OP_EMAIL,
    OP_PASS,
    SVC_EMAIL,
    SVC_PASS,
    auth_headers,
    create_integration_order,
    ensure_test_product,
    ensure_user_with_role,
    login_access_token,
    wait_api,
)


ORDER_SUMMARY_KEYS = {
    "id", "reference", "source_company", "status", "assigned_operator_id", "created_at", "updated_at",
}


OUTBOX_EVENT_KEYS = {"event_id", "event_type", "order_id", "occurred_at", "published", "published_at"}


INTEGRATION_READ_PATHS = [
    "/integrations/orders",
    "/integrations/orders/1",
    "/integrations/events",
    "/integrations/products",
]


def _service_token() -> str:
    ensure_user_with_role(SVC_EMAIL, SVC_PASS, Roles.SERVICE)
    return login_access_token(SVC_EMAIL, SVC_PASS)


def _collect_pages(path: str, token: str, params: dict, max_pages: int = 50) -> list[dict]:
    items = []
    params = dict(params)
    for _ in range(max_pages):
        r = httpx.get(f"{BASE_URL}{path}", headers=auth_headers(token), params=params, timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        items.extend(body["items"])
        if body["next_cursor"] is None:
            return items
        params["cursor"] = body["next_cursor"]
    raise AssertionError(f"{path}: more than {max_pages} pages")


def test_integration_read_endpoints_reject_operator_and_anonymous():
    wait_api()
    ensure_user_with_role(OP_EMAIL, OP_PASS, Roles.OPERATOR)
    op_token = login_access_token(OP_EMAIL, OP_PASS)

    for path in INTEGRATION_READ_PATHS:
        r = httpx.get(f"{BASE_URL}{path}", timeout=10)
        assert r.status_code == 401, f"{path}: {r.status_code} {r.text}"

        r = httpx.get(f"{BASE_URL}{path}", headers=auth_headers(op_token), timeout=10)
        assert r.status_code == 403, f"{path}: {r.status_code} {r.text}"


def test_integration_list_orders_shape_and_status_filter():
    wait_api()
    svc_token = _service_token()
    product_id = ensure_test_product()

    new_id = create_integration_order(svc_token, product_id, 1)
    cancelled_id = create_integration_order(svc_token, product_id, 1)
    r = httpx.post(f"{BASE_URL}/integrations/orders/{cancelled_id}/release", headers=auth_headers(svc_token), timeout=10)
    assert r.status_code == 200, r.text

    r = httpx.get(f"{BASE_URL}/integrations/orders", headers=auth_headers(svc_token), params={"status": "NEW", "limit": 100}, timeout=10)
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body) == {"items", "next_cursor"}
    assert body["items"], body
    for item in body["items"]:
        # Exact key set: no customer_id, names or emails leak through.
        assert set(item) == ORDER_SUMMARY_KEYS, item
        assert item["status"] == "NEW"

    by_id = {item["id"]: item for item in body["items"]}
    assert new_id in by_id
    assert cancelled_id not in by_id
    created = by_id[new_id]
    assert created["source_company"] == "System 2 - Test"
    assert created["reference"].startswith("S2-TEST-")
    assert created["assigned_operator_id"] is None
    assert created["created_at"] is not None
    assert created["updated_at"] is not None

    r = httpx.get(f"{BASE_URL}/integrations/orders", headers=auth_headers(svc_token), params={"status": "CANCELLED", "limit": 100}, timeout=10)
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert all(item["status"] == "CANCELLED" for item in items)
    assert cancelled_id in {item["id"] for item in items}


def test_integration_list_orders_pagination_and_updated_since():
    wait_api()
    svc_token = _service_token()
    product_id = ensure_test_product()

    started = datetime.now(timezone.utc) - timedelta(minutes=1)
    created_ids = [create_integration_order(svc_token, product_id, 1) for _ in range(3)]

    # Newest first: the 3 new orders are the top of the list, split over 2 pages.
    r = httpx.get(f"{BASE_URL}/integrations/orders", headers=auth_headers(svc_token), params={"limit": 2}, timeout=10)
    assert r.status_code == 200, r.text
    first = r.json()
    assert len(first["items"]) == 2
    assert first["next_cursor"] is not None

    r = httpx.get(
        f"{BASE_URL}/integrations/orders",
        headers=auth_headers(svc_token),
        params={"limit": 2, "cursor": first["next_cursor"]},
        timeout=10,
    )
    assert r.status_code == 200, r.text
    second = r.json()

    ids = [item["id"] for item in first["items"] + second["items"]]
    assert ids == sorted(ids, reverse=True)
    assert len(set(ids)) == len(ids)
    # Tests run sequentially, so nothing else creates orders in between.
    assert ids[:3] == sorted(created_ids, reverse=True)

    recent = _collect_pages("/integrations/orders", svc_token, {"updated_since": started.isoformat(), "limit": 100})
    recent_ids = {item["id"] for item in recent}
    assert set(created_ids) <= recent_ids

    future = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    r = httpx.get(f"{BASE_URL}/integrations/orders", headers=auth_headers(svc_token), params={"updated_since": future}, timeout=10)
    assert r.status_code == 200, r.text
    assert r.json() == {"items": [], "next_cursor": None}

    r = httpx.get(f"{BASE_URL}/integrations/orders", headers=auth_headers(svc_token), params={"limit": 101}, timeout=10)
    assert r.status_code == 422, r.text

    r = httpx.get(f"{BASE_URL}/integrations/orders", headers=auth_headers(svc_token), params={"cursor": "not-a-number"}, timeout=10)
    assert r.status_code == 422, r.text


def test_integration_get_order_detail_with_items_and_history():
    wait_api()
    svc_token = _service_token()
    product_id = ensure_test_product()
    order_id = create_integration_order(svc_token, product_id, 2)

    r = httpx.post(f"{BASE_URL}/integrations/orders/{order_id}/release", headers=auth_headers(svc_token), timeout=10)
    assert r.status_code == 200, r.text

    r = httpx.get(f"{BASE_URL}/integrations/orders/{order_id}", headers=auth_headers(svc_token), timeout=10)
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body) == ORDER_SUMMARY_KEYS | {"items", "history"}
    assert body["id"] == order_id
    assert body["status"] == "CANCELLED"

    assert len(body["items"]) == 1
    item = body["items"][0]
    assert set(item) == {"product_id", "sku", "qty"}
    assert item == {"product_id": product_id, "sku": "SKU-test", "qty": 2}

    history = body["history"]
    assert len(history) >= 2
    for entry in history:
        assert set(entry) == {"from", "to", "action", "actor_role", "time"}
    assert history[0]["action"] == "ORDER_CREATED"
    assert history[0]["from"] is None
    assert history[0]["actor_role"] == Roles.SERVICE
    assert body["created_at"] == history[0]["time"]
    assert body["updated_at"] == history[-1]["time"]

    r = httpx.get(f"{BASE_URL}/integrations/orders/999999999", headers=auth_headers(svc_token), timeout=10)
    assert r.status_code == 404, r.text


def test_integration_events_show_unpublished_outbox_rows():
    wait_api()
    svc_token = _service_token()
    product_id = ensure_test_product()
    order_id = create_integration_order(svc_token, product_id, 1)
    # A short window keeps the paged scans below small.
    since = (datetime.now(timezone.utc) - timedelta(seconds=5)).isoformat()

    db = SessionLocal()
    row_ids = []
    try:
        # Rows written directly, so the test does not depend on whether a
        # Kafka producer is running in the api container.
        for published in (False, True):
            row = OutboxEvent(
                event_type="wms.order.audit",
                order_id=order_id,
                payload=json.dumps({"test": True}),
                published=published,
                published_at=datetime.now(timezone.utc) if published else None,
            )
            db.add(row)
            db.commit()
            row_ids.append(str(row.id))
        pending_id, sent_id = row_ids

        pending = _collect_pages("/integrations/events", svc_token, {"published": "false", "since": since, "limit": 2})
        for event in pending:
            assert set(event) == OUTBOX_EVENT_KEYS, event
            assert event["published"] is False
        by_id = {event["event_id"]: event for event in pending}
        assert pending_id in by_id
        assert sent_id not in by_id
        assert by_id[pending_id]["order_id"] == order_id
        assert by_id[pending_id]["event_type"] == "wms.order.audit"
        assert by_id[pending_id]["published_at"] is None

        sent = _collect_pages("/integrations/events", svc_token, {"published": "true", "since": since, "limit": 2})
        assert all(event["published"] is True for event in sent)
        assert sent_id in {event["event_id"] for event in sent}

        # Oldest first, no row repeated across pages.
        everything = _collect_pages("/integrations/events", svc_token, {"since": since, "limit": 1})
        ids = [event["event_id"] for event in everything]
        assert len(ids) == len(set(ids))
        assert {pending_id, sent_id} <= set(ids)
        times = [event["occurred_at"] for event in everything]
        assert times == sorted(times)

        future = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        r = httpx.get(f"{BASE_URL}/integrations/events", headers=auth_headers(svc_token), params={"since": future}, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json() == {"items": [], "next_cursor": None}

        r = httpx.get(f"{BASE_URL}/integrations/events", headers=auth_headers(svc_token), params={"cursor": "%%%"}, timeout=10)
        assert r.status_code == 422, r.text
    finally:
        db.rollback()
        if row_ids:
            db.query(OutboxEvent).filter(OutboxEvent.id.in_([uuid.UUID(i) for i in row_ids])).delete(synchronize_session=False)
            db.commit()
        db.close()


def test_integration_events_equal_timestamps_are_paged_without_skips_or_repeats():
    wait_api()
    svc_token = _service_token()
    product_id = ensure_test_product()
    order_id = create_integration_order(svc_token, product_id, 1)

    # A shared timestamp in the future isolates these rows from any others.
    same_time = datetime.now(timezone.utc).replace(microsecond=0) + timedelta(days=1)

    db = SessionLocal()
    row_ids = []
    try:
        for _ in range(5):
            row = OutboxEvent(
                event_type="wms.order.audit",
                order_id=order_id,
                payload=json.dumps({"test": True}),
                occurred_at=same_time,
            )
            db.add(row)
            db.commit()
            row_ids.append(row.id)

        # limit=2 makes several page boundaries fall between equal timestamps.
        events = _collect_pages("/integrations/events", svc_token, {"since": same_time.isoformat(), "limit": 2})
        ids = [uuid.UUID(event["event_id"]) for event in events]

        # Every row exactly once, tie broken by event_id ascending.
        assert ids == sorted(row_ids)
        assert all(event["occurred_at"] == events[0]["occurred_at"] for event in events)

        r = httpx.get(f"{BASE_URL}/integrations/events", headers=auth_headers(svc_token), params={"limit": 101}, timeout=10)
        assert r.status_code == 422, r.text
    finally:
        db.rollback()
        if row_ids:
            db.query(OutboxEvent).filter(OutboxEvent.id.in_(row_ids)).delete(synchronize_session=False)
            db.commit()
        db.close()


def test_integration_list_products_shape():
    wait_api()
    svc_token = _service_token()
    product_id = ensure_test_product()

    r = httpx.get(f"{BASE_URL}/integrations/products", headers=auth_headers(svc_token), timeout=10)
    assert r.status_code == 200, r.text
    products = r.json()
    for product in products:
        assert set(product) == {"id", "sku", "name", "stock_qty"}, product
    test_product = next(p for p in products if p["id"] == product_id)
    assert test_product["sku"] == "SKU-test"
    assert test_product["stock_qty"] >= 0
