# FastAPI Auth & Orders API

Backend API built with FastAPI and PostgreSQL, implementing secure JWT-based
authentication and a scalable, Dockerized backend architecture.

## Overview
This project implements a production-style authentication flow using modern
backend best practices. It is designed to be easily extended with business
modules such as Orders and Role-Based Access Control (RBAC).

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

## Running locally
```bash
docker compose up --build

http://localhost:8000/docs

## Status
Authentication features are complete. The project is structured to support
future extensions such as Orders management and role-based authorization.