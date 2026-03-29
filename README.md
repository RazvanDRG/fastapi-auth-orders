# Warehouse Operations Service (FastAPI)

Backend service for warehouse order processing, built with FastAPI, SQLAlchemy, and PostgreSQL.

This project simulates a real-world warehouse workflow:
Order → Reserve → Pick → Ship

✅ Key Capabilities
- End-to-end order workflow (Create → Reserve → Pick → Ship)
- Role-Based Access Control (RBAC)
- Transaction-safe stock handling
- Full integration test coverage

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

---

### Start services

```bash
docker compose up --build
docker compose down
```

---

### Run migrations

```bash
docker compose exec api alembic upgrade head
```

---

## 📦 Example Workflow

1. Create order  
2. Reserve stock  
3. Start picking  
4. Ship order  

---

## 🔄 Example Endpoints

### Auth
- POST /auth/register
- POST /auth/login

### Orders
- POST /orders
- POST /orders/{id}/reserve
- POST /orders/{id}/retry-reserve
- POST /orders/{id}/start-picking
- POST /orders/{id}/ship

### User Management (admin only)
- DELETE /users/{id}
- PATCH /users/{id}/role

---

## 🛡️ Data Integrity Rules

- At least one active admin must always exist
- Enforced at:
	- API level (business logic)
	- Database level (PostgreSQL trigger)

---

## 📌 Notes

- Soft-deleted users cannot:
	- login
	- access protected endpoints
- Tokens are invalidated if user becomes inactive

---

## 🧠 What This Project Demonstrates

- Clean API design with FastAPI
- Real-world RBAC implementation
- Transaction-safe business logic
- Defensive programming (API + DB constraints)
- Production-like structure and practices

---

## 📬 Future Improvements

- CI/CD pipeline (GitHub Actions)
- Seed script for demo data
- Frontend dashboard (React)
- Permission-based RBAC (roles → permissions)

---

## 🧪 Testing Strategy

Main test file:
- tests/test_api.py

Run tests:
```bash
docker compose exec api pytest -q
```

The test suite includes 8 integration tests covering API behavior, RBAC, and data integrity.

### What is tested

1. Health endpoints  
- /ops/live  
- /ops/ready  
(test_ops_endpoints)

2. Authentication  
- Login flow  
- /auth/me requires token  
(test_auth_me_requires_token)

3. Order lifecycle (happy path)  
- Create → Reserve → Start Pick → Confirm Pick → Ship  
(test_happy_path_order_flow_operator)

4. Order transition validation  
- Invalid transitions return 409 (e.g. start picking from NEW)  
(test_strict_transition_start_pick_from_new_is_409)

5. RBAC - service role  
- Service cannot access core order endpoints  
- Service can use integration endpoints  
(test_service_cannot_access_orders_but_can_use_integrations)

6. RBAC - operator restrictions  
- Operator cannot access admin-only endpoints (/metrics)  
(test_operator_cannot_access_metrics)

7. Soft delete behavior  
- Soft-deleted users cannot log in  
(test_soft_deleted_user_cannot_login)

8. Admin safety constraint  
- Cannot delete the last active admin  
(test_cannot_delete_last_active_admin)

---

## 🔧 Useful Links
- API docs: http://localhost:8000/docs

---

## Alembic
```bash
docker compose exec api alembic current
docker compose exec api alembic upgrade head
```

---

## Metrics
- http://localhost:8000/metrics

```bash
docker compose ps -a
```

---