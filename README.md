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
- Pytest (18 integration tests)
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

## 🧪 Running Locally

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
- `POST /integrations/orders/{order_id}/reserve`
- `POST /integrations/orders/{order_id}/release`

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

## 🧪 Testing Strategy (18 tests)

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

---

## 🔧 Future Improvements

- Permission-based access control to replace hardcoded role checks
- Rate limiting on auth endpoints
- WebSocket / SSE for real-time dashboard updates
- Email notifications for order state transitions

---

## 👤 About

Built solo by **Razvan-Gabriel Dornea** — Backend Developer (Python/FastAPI), 
also built the React frontend end-to-end for this project.

- LinkedIn: [linkedin.com/in/razvan-gabriel-dornea-697579184](https://www.linkedin.com/in/razvan-gabriel-dornea-697579184/)
- GitHub: [@RazvanDRG](https://github.com/RazvanDRG)