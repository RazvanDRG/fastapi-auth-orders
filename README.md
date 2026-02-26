# FastAPI Auth & Orders API

Backend API built with FastAPI and PostgreSQL, implementing secure JWT-based
authentication and a scalable, Dockerized backend architecture.

## Overview
This project implements a production-style authentication flow using modern
backend best practices. It is designed to be easily extended with business
modules such as Orders and Role-Based Access Control (RBAC).

## Warehouse Operations Service (Order & Inventory Flow)

This service models a real-world warehouse order lifecycle, similar to WMS/OMS systems used in logistics and e-commerce.

### Business Flow
1. Order is created (NEW)
2. Stock is reserved atomically (RESERVED)
3. Warehouse picking starts (PICKING)
4. Picking is confirmed (PICKED)
5. Order is shipped (SHIPPED)
6. Orders can be cancelled at valid stages (CANCELLED)

### Key Design Decisions
- Explicit order state machine with guarded transitions
- Atomic stock reservation with rollback on failure
- Idempotent reservation logic to prevent double booking
- Clear separation of concerns:
  - API layer (routers)
  - Business logic (services)
  - Persistence layer (SQLAlchemy ORM)
- PostgreSQL constraints used as safety net (FK, enums)

### Observability & Operations
- Health checks (liveness / readiness)
- Prometheus metrics endpoint (/metrics)
- Docker healthchecks for DB and API

### Failure Handling
- Orders are created even if stock reservation fails
- Failed reservations are marked explicitly (FAILED_RESERVATION)
- Retry endpoint allows recovery after temporary stock issues

This mirrors real production systems, where auditability and traceability
are more important than deleting failed business attempts.

## Authentication Flow
1. User registers with email and password
2. Passwords are securely hashed using bcrypt (passlib)
3. User logs in and receives a JWT access token
4. Protected endpoints validate the token on each request
5. User identity is extracted from the token (`/auth/me`)

## Features
- User registration & login
- Secure password hashing (bcrypt)
- JWT authentication
- Protected endpoints
- PostgreSQL database with persistent Docker volumes
- Clean project structure (routers, services, models)

## Tech Stack
- Python (FastAPI)
- PostgreSQL
- SQLAlchemy
- JWT (python-jose)
- Docker & Docker Compose

## Observability & Audit

- Middleware-ul cu X-Request-ID (request correlation)
- Global exception handler with consistent error contract
- OrderEvent audit trail for status transitions
- Strict state machine enforcement (409 on invalid transitions)


## Running locally
```bash
http://localhost:8000/docs

docker compose down
docker compose up --build

docker compose exec api alembic history
docker compose exec api alembic current

docker compose exec api alembic revision --autogenerate -m "init schema"
docker compose exec api alembic upgrade head


http://localhost:8000/metrics

docker compose ps -a

## Status
Authentication features are complete. The project is structured to support
future extensions such as Orders management and role-based authorization.