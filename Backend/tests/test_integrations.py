import asyncio
import json
import uuid

import httpx
from sqlalchemy import select

from app.core.roles import Roles
from app.db.session import SessionLocal
from app.models.order import Order
from app.models.order_event import OrderEvent
from app.models.outbox_event import OutboxEvent
from app.services.outbox_service import publish_pending_outbox_events
from tests.helpers import (
    BASE_URL,
    CUSTOMER_ID,
    OP_EMAIL,
    OP_PASS,
    SVC_EMAIL,
    SVC_PASS,
    auth_headers,
    create_integration_order,
    ensure_test_product,
    ensure_user_with_role,
    get_product_stock,
    login_access_token,
    wait_api,
)


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
