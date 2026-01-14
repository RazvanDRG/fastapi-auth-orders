# FastAPI Auth Orders

Demo backend project using FastAPI and SQL.

# FastAPI Auth API (Dockerized)

This project is a simple authentication API built with FastAPI and PostgreSQL,
using Docker for local development.

## Features
- User registration
- Password hashing with bcrypt (passlib)
- JWT authentication
- Protected endpoint (`/auth/me`)
- Persistent PostgreSQL database via Docker volumes

## Tech Stack
- Python (FastAPI)
- PostgreSQL
- SQLAlchemy
- Docker & Docker Compose

## How to run locally

```bash
docker compose up --build

http://localhost:8000/docs

# After implementing the features, I cleaned up debug endpoints, organized the project structure, and documented the setup in a README to make the project production-ready.