# Frontend

React + TypeScript frontend for `fastapi-auth-orders`.

## Why this version is interview-ready

- clean structure, not a single-file demo
- role-aware navigation based on backend RBAC
- token persistence + automatic refresh flow
- all exposed backend endpoints are surfaced in the UI
- honest UX around backend constraints: there is no users list endpoint and no orders list endpoint
- admin metrics view and service integration console included

## Start

```bash
npm install
cp .env.example .env
npm run dev
```

Set `VITE_API_BASE_URL` to your FastAPI backend, usually:

```env
VITE_API_BASE_URL=http://localhost:8000
```

## Pages

- `/login`
- `/register`
- `/forgot-password`
- `/reset-password`
- `/dashboard`
- `/profile`
- `/orders`
- `/integrations` (service only)
- `/admin` (admin only)
- `/metrics` (admin only)

## Important limitation from backend

The backend exposes user mutation endpoints but not a user listing endpoint, and order creation/detail endpoints but not a list endpoint. The frontend reflects that instead of faking data.
