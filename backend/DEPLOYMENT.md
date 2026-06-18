# Backend Deployment Guide

FastAPI optimization API for the RE-RTC Dispatch Optimizer. Default port **8000**.

For full-stack (backend + frontend + Postgres on EC2), see [../DEPLOYMENT.md](../DEPLOYMENT.md).

---

## Prerequisites

- Docker 24+ with Compose plugin, **or**
- Python 3.11+ and a project virtualenv at repo root (`../.venv`)
- PostgreSQL 16 (local, Docker profile, or RDS)

---

## 1. Environment setup

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` before production:

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | `postgresql+psycopg://user:pass@host:5432/re_rtc` |
| `ADMIN_PASSWORD` | Yes | Change from default `12345` |
| `ADMIN_JWT_SECRET` | Yes | Long random string (32+ chars) |
| `ADMIN_USERNAME` | No | Default `admin` |
| `WEB_CONCURRENCY` | No | Uvicorn workers in Docker (default `2`) |
| `ALLOWED_ORIGINS` | No | `*` is fine when frontend proxies same-origin |
| `SERVE_FRONTEND` | No | Keep `false` — use frontend nginx container |

The app loads `backend/.env` automatically on startup (`python-dotenv`). Docker Compose also injects vars via `env_file`.

---

## 2. Local development (no Docker)

```bash
cd backend
../.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

- Use `../.venv/bin/uvicorn` — system Python may lack dependencies.
- API docs: http://localhost:8000/docs
- Health: http://localhost:8000/api/health
- DB health: http://localhost:8000/api/state/health

### PostgreSQL (local)

**Option A — existing Postgres on Mac/Linux**

```
DATABASE_URL=postgresql+psycopg://re_rtc@localhost:5432/re_rtc
```

**Option B — portable Postgres (macOS dev scripts)**

```bash
bash scripts/setup_postgres.sh   # first time
bash scripts/start_postgres.sh
```

---

## 3. Docker — backend only

Run from `backend/`:

```bash
docker compose --env-file .env up -d --build
```

- API: http://localhost:8000
- Image: `re-rtc-backend:latest`
- Container: `re-rtc-backend-local`

### With bundled Postgres

```bash
DB_HOST=postgres docker compose --env-file .env --profile db up -d --build
```

Postgres is exposed on `${POSTGRES_PORT:-5432}`. Data persists in Docker volume `postgres_data`.

### Backend container + Postgres on host

If Postgres runs on your Mac (not in Docker), use `host.docker.internal` in `DATABASE_URL`:

```
DATABASE_URL=postgresql+psycopg://re_rtc:re_rtc_secret@host.docker.internal:5432/re_rtc
```

The compose file sets `extra_hosts: host.docker.internal:host-gateway` for this.

### Build image manually

```bash
docker build -t re-rtc-backend:latest .
docker run --rm -p 8000:8000 --env-file .env re-rtc-backend:latest
```

---

## 4. Production (as part of full stack)

From repo root:

```bash
cp backend/.env.example backend/.env   # edit secrets
docker compose --env-file backend/.env up -d --build
```

In full-stack compose:

- Backend is **not** published to the host — only `expose: 8000` on the Docker network.
- Frontend nginx proxies `/api/` → `http://backend:8000`.
- `DATABASE_URL` is overridden to `@postgres:5432` when using bundled Postgres.

**RDS / external DB:** use [../docker-compose.app-only.yml](../docker-compose.app-only.yml).

**EC2 one-shot:** run [../deploy.sh](../deploy.sh) from repo root.

---

## 5. Verify deployment

```bash
curl http://localhost:8000/api/health
# {"status":"ok"}

curl http://localhost:8000/api/state/health
# DB connectivity status
```

Create admin users at `/admin/login`, then use **User Management** to add app users.

---

## 6. Operations

```bash
# Logs (standalone)
docker compose logs -f backend

# Logs (full stack, from repo root)
docker compose --env-file backend/.env logs -f backend

# Restart after .env change
docker compose --env-file .env up -d --build

# Stop
docker compose down
```

---

## 7. Image contents

| Path in image | Purpose |
|---------------|---------|
| `data/` | Forecast CSVs, power curve (read-only) |
| `assets/` | Static assets |
| `routers/`, `services/`, `db/` | Application code |

- Schema is created via `init_db()` on startup (`create_all`).
- `migrations/*.sql` are reference only — not run automatically.
- `.env` is **not** baked into the image (see `backend/.dockerignore`).

---

## 8. Troubleshooting

| Issue | Fix |
|-------|-----|
| `ModuleNotFoundError` locally | Use `../.venv/bin/uvicorn`, not system Python |
| DB not reachable in container | Use `@postgres` (bundled) or `@host.docker.internal` (host Postgres) |
| Persistence API returns 503 | Set `DATABASE_URL` in `.env` or compose `environment` |
| Port 8000 in use | Stop other uvicorn/Docker instances or change `PORT` |
