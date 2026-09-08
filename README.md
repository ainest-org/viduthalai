# Viduthalai

A simple project management tool with kanban boards.

## Stack

- **Frontend**: Next.js (App Router) + TypeScript + Tailwind CSS v4 + shadcn-style UI + dnd-kit
- **Backend**: FastAPI + SQLAlchemy (async) + Alembic
- **Database**: PostgreSQL
- **Cache / future workers**: Redis
- **Auth**: JWT bearer tokens (signup/login), issued by the backend

## Project structure

```
viduthalai/
├── docker-compose.yml
├── backend/          # FastAPI app, Alembic migrations
└── frontend/         # Next.js app
```

## Running locally

1. Copy the env file:

   ```bash
   cp .env.example .env
   ```

2. Start everything:

   ```bash
   docker compose up --build
   ```

   This starts Postgres, Redis, the FastAPI backend (running Alembic migrations on boot), and the Next.js dev server.

3. Open:
   - Frontend: http://localhost:3000
   - Backend docs: http://localhost:8000/docs

Sign up for an account, create a board, add columns and cards, and drag cards around.

## Backend migrations

Migrations run automatically when the `backend` container starts. To create a new migration after changing models:

```bash
docker compose exec backend alembic revision --autogenerate -m "describe change"
docker compose exec backend alembic upgrade head
```

## Notes

- Team access, roles, and permissions are intentionally out of scope for now.
- Redis is wired up for response caching today; it's also where GitLab-integration background workers will live later.
