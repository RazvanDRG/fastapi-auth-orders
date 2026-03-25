# Warehouse Operations Service (FastAPI)

Backend service for warehouse order processing, built with FastAPI, SQLAlchemy, and PostgreSQL.

This project simulates a real-world warehouse workflow:
Order → Reserve → Pick → Ship

---

## 🚀 Features

### Core Functionality
- Order lifecycle management (create, reserve, pick, ship)
- Stock reservation with transactional safety
- Idempotent operations (retry-safe endpoints)
- Audit trail for all state transitions

### Authentication & Security
- JWT authentication (access + refresh tokens)
- Role-Based Access Control (RBAC)
  - `admin`
  - `operator`
  - `service`
- Request ID middleware for traceability
- Global exception handling

### Data Integrity (Enterprise-grade)
- Soft delete for users (`is_deleted`, `deleted_at`)
- Protection against deleting the last active admin (API level)
- Protection against deleting the last active admin (DB trigger)
- Role validation and access enforcement

### Observability
- Structured logging with request correlation (`X-Request-ID`)
- Metrics endpoint (admin-only)
- Health endpoints (`/ops/live`, `/ops/ready`)

---

## 🧱 Tech Stack

- FastAPI
- SQLAlchemy
- PostgreSQL
- Alembic (migrations)
- Docker / Docker Compose
- Pytest

---

## 📊 Architecture Overview
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

---

## 🔐 Roles & Permissions

| Role      | Permissions                          |
|----------|--------------------------------------|
| admin    | Full access + user management        |
| operator | Order workflow (reserve, pick, ship) |
| service  | Integration endpoints only           |

---

## 🧪 Running the Project

### Start services

```bash
docker compose up --build

Run migrations

docker compose exec api alembic upgrade head

Run tests

docker compose exec api pytest -q

📦 Example Workflow
Create order
Reserve stock
Start picking
Ship order

🔄 Example Endpoints
POST /auth/register
POST /auth/login
POST /orders
POST /orders/{id}/reserve
POST /orders/{id}/retry-reserve
POST /orders/{id}/start-picking
POST /orders/{id}/ship
User Management (admin only)
DELETE /users/{id} → soft delete
PATCH /users/{id}/role → update role

🛡️ Data Integrity Rules

At least one active admin must always exist
Enforced at:
API level (business logic)
Database level (PostgreSQL trigger)

📌 Notes

Soft-deleted users cannot:
login
access protected endpoints
Tokens are invalidated if user becomes inactive

🧠 What This Project Demonstrates

Clean API design with FastAPI
Real-world RBAC implementation
Transaction-safe business logic
Defensive programming (API + DB constraints)
Production-like structure and practices

📬 Future Improvements

CI/CD pipeline (GitHub Actions)
Seed script for demo data
Frontend dashboard (React)
Permission-based RBAC (roles → permissions)

## Running locally

```bash
docker compose down
docker compose up --build

#Tests

docker compose exec api pytest -q

# API docs
# http://localhost:8000/docs

# Alembic
docker compose exec api alembic current
docker compose exec api alembic upgrade head

# Metrics
# http://localhost:8000/metrics

docker compose ps -a