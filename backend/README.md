# RE-RTC Backend (FastAPI)

FastAPI optimization API for the Hindalco RTC dispatch optimizer. Listens on port **9000**.

## Local development (no Docker)

```bash
cp .env.example .env   # first time only
cd backend
../.venv/bin/uvicorn main:app --host 0.0.0.0 --port 9000 --reload
```

- `backend/.env` is loaded automatically on startup (`python-dotenv`).
- Use `../.venv/bin/uvicorn` — system Python may not have project dependencies.
- API docs: http://localhost:9000/docs
- Health: http://localhost:9000/api/health

### PostgreSQL

Use a local Postgres instance or the bundled Docker profile (below).

**Local dev:**

```
DATABASE_URL=postgresql+psycopg://re_rtc@localhost:5432/re_rtc
```

**Remote managed Postgres** (IP must be whitelisted on the server):

```
DATABASE_URL=postgresql+psycopg://rertc:YOUR_PASSWORD@13.235.110.27:5432/rertc
```

URL-encode special characters in the password (`@` → `%40`).

Optional macOS portable Postgres scripts (repo root `.tools/` + `.pgdata/`):

```bash
bash scripts/setup_postgres.sh   # first time
bash scripts/start_postgres.sh
```

## Docker (backend only)

From this directory:

```bash
cp .env.example .env
docker compose --env-file .env up -d --build
```

API at http://localhost:9000

**With bundled Postgres:**

```bash
DB_HOST=postgres docker compose --env-file .env --profile db up -d --build
```

When the backend container talks to Postgres on your Mac (not in Docker), set `DATABASE_URL` to use `host.docker.internal` instead of `localhost`.

## Environment variables

| Variable | Default | Notes |
|----------|---------|-------|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `PORT` | `9000` | Uvicorn listen port |
| `WEB_CONCURRENCY` | `2` | Workers in Docker |
| `ALLOWED_ORIGINS` | `*` | CORS |
| `ADMIN_USERNAME` | `admin` | Admin panel login |
| `ADMIN_PASSWORD` | `12345` | Change in production |
| `ADMIN_JWT_SECRET` | — | JWT signing secret |
| `SERVE_FRONTEND` | `false` | Legacy: serve `frontend/dist` from FastAPI |

See `.env.example` for the full list.

## Data

- `data/` — forecast CSVs and power curves (baked into the Docker image)
- `assets/` — static assets
- `migrations/` — manual SQL reference (schema is created via `init_db()` on startup)

## Production

See [DEPLOYMENT.md](./DEPLOYMENT.md) for full backend deployment (Docker, EC2, RDS, operations).

Full-stack: deploy [frontend/DEPLOYMENT.md](../frontend/DEPLOYMENT.md) and this guide on the same host.
