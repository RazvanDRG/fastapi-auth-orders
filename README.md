# Warehouse Operations Service (FastAPI)

Backend service for warehouse order processing, built with FastAPI, SQLAlchemy, and PostgreSQL.

This project simulates a real-world warehouse workflow:
Order → Reserve → Start Pick → Confirm Pick → Ship

✅ Key Capabilities
- End-to-end order workflow
- Role-Based Access Control (RBAC)
- Transaction-safe stock handling
- Full integration test coverage

---

## 🚀 Features

### Core Functionality
- Order lifecycle management (create order, reserve, start pick, confirm pick, ship)
- Stock reservation with transactional safety
- Idempotent operations (retry-safe endpoints)
- Audit trail for all state transitions

### Authentication & Security
- JWT authentication (access + refresh tokens)
- User registration with email/password and optional profile fields
- Password recovery via 6-digit email reset code with expiration and attempt limits
- Refresh token invalidation after password reset
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

| Role     | Permissions                          |
|----------|--------------------------------------|
| admin    | Full access + user management        |
| operator | Order workflow                       |
| service  | Integration endpoints only           |

---

## 🧪 Running the Project

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
docker compose exec api alembic current
```
```bash
docker compose exec api alembic upgrade head
```

### Check containers

```bash
docker compose ps -a
```

---

## Example Endpoints

### Ops
- GET /ops/live
- GET /ops/ready

### Auth
- POST /auth/register
- POST /auth/login
- POST /auth/forgot-password
- POST /auth/reset-password
- POST /auth/refresh
- POST /auth/logout
- GET /auth/me

### Orders
- POST /orders
- GET /orders/{order_id}
- POST /orders/{order_id}/reserve
- POST /orders/{order_id}/retry-reserve
- POST /orders/{order_id}/start-pick
- POST /orders/{order_id}/confirm-pick
- POST /orders/{order_id}/ship
- POST /orders/{order_id}/cancel

### Integrations
- POST /integrations/orders/{order_id}/reserve
- POST /integrations/orders/{order_id}/release

### User Management (admin only)
- DELETE /users/{user_id}
- PATCH /users/{user_id}/role

---

## 🛡️ Data Integrity Rules

- At least one active admin must always exist
- Enforced at:
	- API level (business logic)
	- Database level (PostgreSQL trigger)

---

## 📌 Notes

- Registration supports optional profile fields: `first_name`, `last_name`
- Password reset uses a 6-digit code with expiration and attempt limits
- New password must be different from the current password
- Password reset revokes existing refresh tokens
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

The test suite includes integration tests covering API behavior, RBAC, data integrity, and password recovery flows.

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

9. Registration with optional profile fields
- first_name and last_name are stored correctly
(test_register_with_optional_first_and_last_name)

10. Forgot password flow
- Returns the same generic response for existing and unknown email
(test_forgot_password_returns_generic_response_for_existing_and_unknown_email)

11. Forgot password persistence
- Creates a password reset record for an existing user
(test_forgot_password_creates_reset_code_for_existing_user)

12. Reset password success
- Valid reset code updates password and revokes old refresh tokens
(test_reset_password_with_valid_code_revokes_old_refresh_tokens)

13. Reset password invalid code handling
- Wrong code returns 400 and increments attempt count
(test_reset_password_fails_with_wrong_code_and_increments_attempt_count)

14. Reset password validation
- Mismatched passwords return 400
(test_reset_password_fails_when_passwords_do_not_match)

15. Reset password expiration
- Expired code returns 400
(test_reset_password_fails_with_expired_code)

16. Reset password reuse prevention
- Reset fails if the new password matches the current password
(test_reset_password_fails_if_new_password_matches_current_password)

---

## 🔧 Useful Links

- API docs: http://localhost:8000/docs
- Metrics: http://localhost:8000/metrics (admin only)