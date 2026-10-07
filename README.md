# Warehouse Operations Service

Full-stack warehouse order management system built with FastAPI, React, PostgreSQL, and Docker.

This project simulates a real-world warehouse workflow:
Order → Reserve → Start Pick → Confirm Pick → Ship

## 🌐 Live Demo

- **Frontend:** https://fastapi-auth-orders-v3.vercel.app
- **API Docs (Swagger):** https://warehouse-api-pzhs.onrender.com/docs

---

## ✅ Key Capabilities

- End-to-end order workflow
- Role-Based Access Control (RBAC)
- Transaction-safe stock handling
- Full integration test coverage
- CI/CD with GitHub Actions

---

## 🧱 Tech Stack

**Backend**
- FastAPI, SQLAlchemy, PostgreSQL (hosted on Supabase), Alembic
- Docker / Docker Compose
- Pytest (40 integration tests)
- GitHub Actions (CI)

**Frontend**
- React + TypeScript + Vite
- Role-aware navigation based on backend RBAC
- JWT access + refresh token flow
- Operational dashboard with live order metrics
- Orders workspace with product catalog and lifecycle controls
- Inventory management with stock history and CSV export
- Admin panel for user and role management

---

## 🚀 Features

### Core Functionality

- Order lifecycle management (create → reserve → start pick → confirm pick → ship)
- Stock reservation with transactional safety (FOR UPDATE locking)
- Idempotent operations (retry-safe endpoints)
- Audit trail for all state transitions
- Background archive worker — completed orders archived after 5 minutes (async)
- Product and inventory management with stock history

### Authentication & Security

- JWT authentication (access + refresh tokens)
- User registration with email/password and profile fields
- Password recovery via 6-digit email reset code with expiration and attempt limits
- Refresh token invalidation after password reset
- Forgot-password sends exactly one reset email; no secrets or reset codes in logs
- No debug email endpoint (`/auth/test-email` was removed)
- Rate limiting per endpoint: `429` with a `Retry-After` header (limits in Notes)
- Role-Based Access Control (RBAC): `admin`, `operator`, `service`
- Request ID middleware for traceability
- Global exception handling

### Data Integrity (Enterprise-grade)

- Soft delete for users (`is_deleted`, `deleted_at`)
- Protection against deleting the last active admin (API level + DB trigger)
- Role validation and access enforcement
- Admin audit trail for user role changes and soft deletions

### Observability

- Structured logging with request correlation (`X-Request-ID`)
- Metrics endpoint (admin-only, Prometheus)
- Health endpoints (`/ops/live`, `/ops/ready`)
- External uptime monitoring via UptimeRobot (pings `/ops/live`)

### Frontend (React)

**Operational Dashboard**
- Live order metrics by status: Total / New / Reserved / In Progress / Shipped / Cancelled
- Recent activity feed with search, status filter, and role filter
- Full audit trail search by Order ID (all events, not just recent)
- Workflow overview visualization (NEW → RESERVED → PICKING → PICKED → SHIPPED)
- Quick actions panel and link to system metrics

**Orders Workspace**
- Product catalog with search by name, SKU, or ID
- Quantity selector per product and one-click order creation
- "Load and operate" panel — fetch any order by ID and execute lifecycle transitions
- My orders view with status badges (color-coded), item preview, and last activity timestamp
- Order stats summary (Active / New / In progress)
- Toggle between active and archived orders
- Date range filter + search + CSV export

**Inventory Management**
- Product cards with stock levels and LOW STOCK / HEALTHY indicators
- Modify stock directly from the UI
- Inventory history table: user, SKU, delta (+/-), before/after stock, timestamp
- Date range filtering, search, and CSV export

**Admin Panel**
- User list with role badges
- Role management and profile editing per user
- Soft delete with last-admin protection enforced in UI

**Profile Page**
- Live session data from `/auth/me` (display name, email, user ID, role)
- Edit profile inline
- Session security panel (tokens intentionally not exposed in UI)

---

## 🎯 Design Decisions

- Service layer separates business logic from routes
- FOR UPDATE locking prevents race conditions on stock reservation
- DB trigger protects the last active admin as a final safeguard
- Dedicated audit table for admin actions (role changes, soft deletes)
- Archive worker runs as async background task on app lifespan

---

## 🔐 Roles & Permissions

| Role     | Permissions                                          |
|----------|------------------------------------------------------|
| admin    | Full access + user management                        |
| operator | Order workflow                                       |
| service  | Integration endpoints + product/inventory management |

---

## 📊 Architecture Overview

```
Request
↓
FastAPI Router
↓
Pydantic Validation
↓
Dependencies (Auth, RBAC, DB)
↓
Business Logic (Services)
↓
Database (PostgreSQL)
↓
Response (JSON)
```

---

## 📨 Event Publishing

Order lifecycle changes are published to Kafka (Aiven, SASL_SSL) via a transactional outbox: each event is written to an `outbox_events` table in the same DB transaction as the business change it describes (create, reserve, release, pick), and a background worker polls unpublished rows and publishes them to Kafka — so an event only ever exists if its transaction actually committed, and nothing is lost if the worker crashes mid-pass.

Every published message shares the same envelope:

```json
{
  "event_id": "c5b0bf9f-9d2d-442d-b39c-a80141ed6917",
  "event_type": "wms.order.audit",
  "occurred_at": "2026-09-11T12:20:10.655044+00:00",
  "order_id": 32,
  "request_id": "d6r2-reserve-1789129210",
  "payload": { }
}
```

- Managed Kafka on Aiven (free tier), `SASL_SSL` with a dedicated service account whose ACLs allow only the `wms.*` topics
- The CA certificate is provided to Render as a Secret File; its path goes in `KAFKA_SSL_CA_PATH`
- The worker claims one row at a time with `FOR UPDATE SKIP LOCKED`, so two replicas never publish the same row
- A row is never marked published when Kafka is down: it stays in the outbox and is retried on the next poll
- At-least-once delivery: a row can be sent again if the worker stops between the broker ack and the commit. `event_id` is the outbox row id, so consumers can dedupe on it
- Local development without Kafka: if `KAFKA_BOOTSTRAP_SERVERS` is empty, the producer stays off and events wait in the outbox until Kafka is available

### Topics

The topic name equals `event_type`. There are four topics:

**`wms.order.audit`** — mirrors every `OrderEvent` audit row (`{action, from_status, to_status, actor_role}`), written on order creation and on every status transition (reserve, start-pick, confirm-pick, ship, cancel, failed reservation).

```json
{
  "payload": {
    "action": "STATUS_CHANGE",
    "from_status": "OrderStatus.NEW",
    "to_status": "OrderStatus.RESERVED",
    "actor_role": "operator"
  }
}
```

**`wms.stock.reserved`** — emitted when stock is successfully reserved for an order.

```json
{
  "payload": {
    "order_id": 32,
    "products": [
      { "product_id": 1, "sku": "SKU-010", "name": "Laptop ASUS ROG 105", "stock_qty": 78 }
    ]
  }
}
```

**`wms.stock.released`** — emitted when previously reserved stock is returned to inventory (e.g. order cancelled after reservation).

```json
{
  "payload": {
    "order_id": 33,
    "products": [
      { "product_id": 1, "sku": "SKU-010", "name": "Laptop ASUS ROG 105", "stock_qty": 78 }
    ]
  }
}
```

**`wms.pick.completed`** — emitted when an order's items are confirmed picked.

```json
{
  "payload": {
    "order_id": 32,
    "items": [
      { "product_id": 1, "qty": 1 }
    ]
  }
}
```

---

## 🧪 Running Locally

### Configure environment

```bash
cp Backend/.env.example Backend/.env
```

`Backend/.env.example` contains placeholders only. Put real values in `Backend/.env`, which is gitignored.

### Start services

```bash
docker compose up --build
```

### Stop services

```bash
docker compose down
```

### Run migrations

```bash
docker compose exec api alembic upgrade head
```

### Run tests

```bash
docker compose exec api pytest -q
```

---

## ⚙️ CI

GitHub Actions runs automatically on push and pull request:
- Build Docker services
- Run Alembic migrations
- Run the test suite
- Show container logs on failure

---

## 📋 API Endpoints

### Ops
- `GET /ops/live` — Liveness probe
- `GET /ops/ready` — Readiness probe (DB)
- `GET /ops/activity` — Recent activity feed
- `POST /ops/archive-orders` — Archive completed orders

### Auth
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`
- `PATCH /auth/me`

### Orders
- `POST /orders`
- `GET /orders/products` — List products
- `GET /orders/{order_id}`
- `GET /orders/my`
- `GET /orders/{order_id}/events`
- `POST /orders/{order_id}/reserve`
- `POST /orders/{order_id}/retry-reserve`
- `POST /orders/{order_id}/start-pick`
- `POST /orders/{order_id}/confirm-pick`
- `POST /orders/{order_id}/ship`
- `POST /orders/{order_id}/cancel`

### Integrations (service only)
- `POST /integrations/orders` — Create order. `source_company` and `reference` are required and act as an idempotency key:
  - `201 Created` — new order
  - `200 OK` — retry with the same `(source_company, reference)` and the same items; returns the existing order, nothing new is written
  - `409 Conflict` — same `(source_company, reference)` with different items
  - `422` — `reference` missing
- `POST /integrations/orders/{order_id}/reserve`: a `409` (insufficient stock) moves the order to `FAILED_RESERVATION`
- `POST /integrations/orders/{order_id}/release`: also accepts `NEW` orders (cancelled without restock)

### User Management (admin only)
- `GET /users`
- `PATCH /users/{user_id}/profile` — Update user profile
- `DELETE /users/{user_id}`
- `PATCH /users/{user_id}/role`

### Products (admin + service)
- `GET /products`
- `POST /products`
- `PATCH /products/{product_id}/stock`
- `GET /products/history`

---

## 🛡️ Data Integrity Rules

- At least one active admin must always exist
- Enforced at API level (business logic) and DB level (PostgreSQL trigger)

---

## 📌 Notes

- Password reset uses a 6-digit code with expiration and attempt limits
- New password must be different from the current password
- Password reset revokes existing refresh tokens
- Soft-deleted users cannot login or access protected endpoints
- Tokens are invalidated if user becomes inactive
- Rate limits return `429` with a `Retry-After` header: login 10/min and forgot-password 3 per 15 min per client IP (read from the `CLIENT_IP_HEADER` setting, default `cf-connecting-ip`; `X-Forwarded-For` is ignored because clients can forge it), order creation 30/min per user. Counters live in memory per instance, so several replicas would need a shared store like Redis. Limits are settings (`RATE_LIMIT_*`); docker-compose raises them for the HTTP test suite.

---

## 🧠 What This Project Demonstrates

- Clean API design with FastAPI
- Real-world RBAC implementation
- Transaction-safe business logic with FOR UPDATE locking
- Defensive programming (API + DB constraints)
- Production-like structure and practices
- Full-stack integration (React frontend + FastAPI backend)
- Operational UX: live metrics, audit trails, CSV exports, role-aware UI

---

## 🧪 Testing Strategy (40 tests)

1. Health endpoints (`/ops/live`, `/ops/ready`)
2. Authentication flow + `/auth/me` requires token
3. Order lifecycle happy path (Create → Reserve → Pick → Ship)
4. Invalid order transitions return 409
5. RBAC — service role restrictions
6. RBAC — operator cannot access admin endpoints
7. Soft delete — deleted users cannot log in
8. Admin safety constraint — cannot delete last active admin
9. Registration with optional profile fields
10. Forgot password — generic response for existing/unknown email
11. Forgot password — creates reset code for existing user
12. Reset password — valid code updates password + revokes refresh tokens
13. Reset password — wrong code increments attempt count
14. Reset password — mismatched passwords return 400
15. Reset password — expired code returns 400
16. Reset password — new password must differ from current
17. User role audit event on role update
18. User soft delete audit event
19. Outbox row stays unpublished when the Kafka producer is not started
20. Integration reserve with insufficient stock moves the order to `FAILED_RESERVATION`
21. Integration release on a `NEW` order cancels without restock
22. Repeated integration reserve 409 keeps `FAILED_RESERVATION` without a new audit row
23. Integration order retry returns the same order
24. Same reference with different items returns 409
25. UI orders with the same reference are not deduplicated
26. Integration order without reference returns 422
27. Concurrent integration retries create one order
28. `/auth/test-email` is removed
29. Forgot password sends exactly one email
30. Repeated retry-reserve 409 returns insufficient stock
31. Rate limit: login over the limit returns 429 with `Retry-After`
32. Rate limit: the window resets
33. Rate limit: different IPs do not share counters
34. Rate limit: falls back to the client host without the IP header
35. Rate limit: a forged `X-Forwarded-For` does not change the key
36. Rate limit: the IP header name comes from settings
37. Rate limit: a 429 logs the client IP
38. Rate limit: forgot-password over the limit returns 429
39. Rate limit: order creation is limited per user
40. Rate limit: integration order creation over the limit returns 429

---

## 🔧 Future Improvements

- Permission-based access control to replace hardcoded role checks
- WebSocket / SSE for real-time dashboard updates
- Email notifications for order state transitions

---

## 👤 About

Built solo by **Razvan-Gabriel Dornea** — Backend Developer (Python/FastAPI), 
also built the React frontend end-to-end for this project.

- LinkedIn: [linkedin.com/in/razvan-gabriel-dornea-697579184](https://www.linkedin.com/in/razvan-gabriel-dornea-697579184/)
- GitHub: [@RazvanDRG](https://github.com/RazvanDRG)