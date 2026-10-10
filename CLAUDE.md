# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Kit rules (the guard reads these lines, so edits ask for approval)
Project: Warehouse Operations Service (System 1): order lifecycle API and admin UI for a warehouse, used by operators and by Warehouse Intelligence. FastAPI, SQLAlchemy, Alembic, Postgres (Supabase, RLS on), JWT roles admin, operator, service, transactional outbox to Kafka (Aiven), React frontend.
Focus now: confirm the Render deploy (kafka_producer_started in the logs), then check events on the Kafka topic with a consumer.
Critical (ask before every change): Backend/app/services/orders_service.py, Backend/app/services/outbox_service.py, Backend/app/services/kafka_producer.py, Backend/app/services/auth.py, Backend/app/services/refresh_tokens.py, Backend/app/core/security.py, Backend/app/core/rbac.py, Backend/app/core/config.py, Backend/app/api/routes/auth.py, Backend/app/api/routes/integrations.py, Backend/app/main.py
Database files: Backend/app/models/, Backend/alembic/
Databases: the local env file may point to the production Supabase database, so anything that touches the database (tests, scripts, migrations) runs only in CI, never locally.
Check command: pytest -q tests/test_kafka_resilience.py in Backend/ (the only tests that do not touch the database); the full suite runs only in CI (backend-ci.yml), never locally.
API: localhost:8000 and warehouse-api-pzhs.onrender.com
Always ask before: changing event payloads or topics (a contract with Warehouse Intelligence), order status transitions, and any Kafka topic or ACL change (Aiven is shared infrastructure).
Never: move an outbox write out of the transaction of the state change it records.

## Overview

Warehouse order-management system. Monorepo with two independently deployed apps:

- `Backend/` — FastAPI + SQLAlchemy + Alembic, PostgreSQL (Supabase in prod), deployed on Render.
- `Frontend/` — React 18 + TypeScript + Vite + Tailwind v4, deployed on Vercel.

Core domain is an order lifecycle: `NEW → RESERVED → PICKING → PICKED → SHIPPED`, plus `CANCELLED` and `FAILED_RESERVATION` branches.

## Commands

Backend is designed to run in Docker; the test suite talks to a live API over HTTP, so there is no meaningful "run tests without containers" path.

```bash
# from repo root
docker compose up --build            # start db + api (api runs `alembic upgrade head` on boot)
docker compose down
docker compose exec api alembic upgrade head    # apply migrations manually
docker compose exec api pytest -q               # full test suite (needs api + db up)
docker compose exec api pytest -q tests/test_api.py::test_happy_path_order_flow_operator   # single test
docker compose run --rm api alembic revision -m "msg" --autogenerate
docker compose logs api --tail=200
```

`docker compose restart api` does **not** reload `env_file` (`Backend/.env`) — it restarts the existing container with whatever environment was baked in when it was created. After changing anything in `.env` (credentials, config), use `docker compose up -d --force-recreate api` instead, otherwise the container keeps running on the old values silently, with no error to signal it.

Alembic history has been branched and merged several times (`*_merge_heads.py`). After adding a migration run `docker compose exec api alembic heads` and confirm there is exactly one head.

Frontend:

```bash
cd Frontend
npm install
cp .env.example .env      # set VITE_API_BASE_URL
npm run dev               # Vite dev server on :5173
npm run build             # tsc -b && vite build — this is also the only typecheck step
npm run preview
```

CI (`.github/workflows/`, triggers only on `Backend/**` changes): builds the compose stack, runs migrations, runs `pytest -q`. There is no frontend CI and no linter configured for either app.

## Backend architecture

**Layering.** `api/routes/*` (HTTP, auth, serialization) → `services/*` (business logic, owns the DB transaction) → `models/*` (one SQLAlchemy model per file; `Base` lives in `app/db/base.py`). Routes should stay thin; put anything with a state change or multiple queries in a service. Note `app/db/models.py` is an empty shim that only exists because `alembic/env.py` imports it.

**Order state machine.** `services/orders_service.py::transition()` holds the single source of truth for allowed transitions (the `allowed` dict). Every transition writes an `OrderEvent` audit row in the same transaction. The `*_flow` functions (`reserve_order_flow`, `start_pick_flow`, …) are the entry points routes call — they own `commit()`/`rollback()` and are written to be idempotent (calling `reserve` on an already-`RESERVED` order is a no-op, not an error).

**Stock reservation.** `reserve_stock_for_order` / `restock_for_order` lock product rows with `SELECT ... FOR UPDATE` before adjusting `stock_qty`. They deliberately do **not** commit — the calling `*_flow` does. Insufficient stock raises `409`, which `reserve_order_flow` catches and converts to a `FAILED_RESERVATION` transition; `retry-reserve` is the only way out of that state.

**Two order origins.** UI orders: created by an operator, `customer_id` = the operator, no `source_company`. Integration orders: created by a `service`-role account via `/integrations/orders`, `source_company` set, `reference` holds the external system's order id. Integration orders are visible to every operator in `/orders/my` until one claims the order by starting to pick it (`assigned_operator_id` gets set in `start_pick_flow`).

**Real-time updates.** `services/event_bus.py` is an in-process pub/sub over `asyncio.Queue` fan-out; `/sse/stream` streams it to the browser. This is **single-process only** — it does not survive multiple workers and events are not durable. Publish SSE events only *after* a successful commit (see `_publish_stock_updates`).

**Background worker.** `archive_orders_worker` in `main.py` runs on the app lifespan, polling every 60s; `archive_due_orders` marks `SHIPPED`/`CANCELLED` orders archived 5 minutes after they finalize (`archive_due_at`). Also exposed manually as `POST /ops/archive-orders`.

**Auth.** JWT HS256, `sub` = user email, access + refresh tokens (`services/refresh_tokens.py`, hashed with `refresh_token_salt`). `core/security.py::get_current_user` is the dependency; it rejects soft-deleted users (`is_deleted`). `POST /auth/reset-password` revokes all refresh tokens. The `/metrics` endpoint is guarded inside `request_id_middleware` in `main.py` (manual JWT decode + admin check) rather than by a route dependency — keep that in mind when touching middleware.

**RBAC.** `core/rbac.py::require_roles(*roles)` as a router-level dependency; role string constants in `core/roles.py`. Roles: `admin` (everything + user management), `operator` (order workflow), `service` (integrations + products/inventory).

**Config.** `core/config.py` — pydantic-settings from `Backend/.env`. Several fields are required with no default (`database_url`, `jwt_secret`, `refresh_token_salt`, `smtp_username/password/from_email`, `password_reset_code_salt`); the app will not import without them. `Backend/.env` is gitignored; `Backend/.env.example` is the template.

**Supabase / RLS.** Prod DB has row-level security enabled on all public tables via migrations, with `service_role` policies and a DB trigger (`prevent_zero_active_admins`) that enforces "at least one active admin" independently of the API check. New tables need matching RLS migrations or the Supabase security advisor flags them.

### Event publishing (transactional outbox to Kafka)

- **Outbox writes.** `orders_service.write_outbox_event` adds an `OutboxEvent` row in the same transaction as the state change it records; `write_order_audit_event` mirrors every `OrderEvent` onto `wms.order.audit`. `request_id` is stored on the row and carried in the event envelope. Topics are named 1:1 with `event_type`: `wms.stock.reserved`, `wms.stock.released`, `wms.pick.completed`, `wms.order.audit`.
- **Worker.** `kafka_outbox_worker` in `main.py` runs on the lifespan and calls `publish_pending_outbox_events` every 10s. DB calls in the outbox and archive workers run in `asyncio.to_thread`.
- **Kafka resilience.** `services/kafka_producer.py` (aiokafka, SASL_SSL to Aiven) connects in a background task with backoff (5s doubling to 5 min, 30s per attempt), logging `kafka_producer_start_failed` per attempt and `kafka_producer_started` on success. With no producer, an outbox pass returns at once and rows stay pending. Covered by `Backend/tests/test_kafka_resilience.py` (in-process, fake session and fake Kafka).
- **Read endpoints (service role).** `GET /integrations/orders`, `/integrations/orders/{id}`, `/integrations/events`, `/integrations/products`: read-only, list endpoints cursor-paginated, no personal data (`schemas/integrations.py`).
- **Schema export.** CI runs `Backend/scripts/export_schema.py` and uploads the `schema-snapshot` artifact.
- **Still open.** Events not yet confirmed on the topic with a consumer. `POST /ops/kafka-test` is a temporary sanity-check endpoint, still present.

## Frontend architecture

- `src/lib/http.ts` — the real axios instance: attaches the bearer token and `X-Request-ID`, and has a response interceptor that transparently refreshes on `401` and replays the request. Use this for all API calls. `src/lib/api.ts` is a bare axios instance with no auth — prefer `http`.
- `src/context/AuthContext.tsx` + `useAuth` hold the session; tokens persist via `lib/storage.ts`.
- Routing (`App.tsx`) is role-gated with `ProtectedRoute allowedRoles={[...]}`, mirroring backend RBAC. `/orders` → admin+operator, `/integrations` → service, `/admin` + `/metrics` → admin, `/inventory` → admin+service.
- The backend has no "list users" or "list orders" endpoint. The UI works around this (load-by-id panels, `/orders/my`) rather than faking lists — keep that constraint in mind before building list views.
- `src/hooks/useSSE.ts` consumes `/sse/stream` for live dashboard/inventory/order updates.

## Out-of-reach actions

Some things are outside what a coding session can do or verify: clicking through an external console (Aiven, Confluent, cloud provider dashboards), creating a resource that isn't provisioned via code/CLI, or anything needing credentials/access not available here.

- Before assuming a resource exists (a topic, a bucket, a DB, an external service), check for it programmatically if there's a way to (an admin client, a CLI, an API call) rather than assuming it's there or silently retrying against something that might not exist. Read/verify actions like this are always fine to do proactively.
- **Creating or modifying a resource on an external paid cloud service (a Kafka topic, a cloud service, a DNS record, anything with cost/quota implications) requires asking first, even if the configured credentials technically allow it.** Explain what's missing and what you'd create (exact name/config), then wait for confirmation before acting — don't create it and report afterward. This project runs on free-tier cloud services with deliberate cost/security limits (see the Aiven Kafka setup notes) — those limits only hold if resource creation stays a deliberate, confirmed action.
- If something can't be checked or done from here, say so explicitly and name the exact manual action needed instead of hanging, retrying indefinitely, or guessing.
- Never spend more than a couple of retries against something external before surfacing that it might be a missing/misconfigured resource, not a code bug — a hang or a long stall against Kafka/an API is a signal to stop and check, not to keep waiting.

## Step verification discipline

At the end of any implementation step — a feature, a fix, a migration, an integration — give an explicit confirmation, point by point against what was asked, not a vague "it's done" summary.

- Back every point with real evidence, not just an assertion that it worked: migration output (`alembic heads` shows exactly one head), the actual test suite result (`N passed`), the real response of any external call (Kafka, an API, etc.) — not just "it didn't raise an exception."
- If something can't be proven end-to-end (e.g. broker ack vs. a visual check on the actual topic), say explicitly what was **not** verified and offer the extra step to close that gap, instead of reporting full success.
- If a prior test turns out to have been invalid or something was done wrong, say so directly, don't downplay or bury it — e.g. discovering a test script never went through `start_kafka_producer()` in `main.py`'s lifespan is exactly the kind of thing to surface, not smooth over.
- Don't move on to the next step until this explicit confirmation has been given.

## Conventions

- Code comments are always in English, short and simple — explain the "why", don't restate the code, and don't over-engineer.
- Before writing a new service function, read the neighbouring ones and match the existing naming exactly (`*_flow` for route entry points, `verb_noun_for_order`, etc.).
- Service functions take `db: Session` as the first arg and either commit themselves (the `*_flow` pattern) or document that the caller owns the transaction.
- Thread `request_id` from `request.state.request_id` into `OrderEvent` rows for traceability.
- Audit trails are append-only: `OrderEvent` for order state, `UserAdminEvent` for admin actions on users.
- Environment is Windows + PowerShell; the Bash tool is available for POSIX scripts.
