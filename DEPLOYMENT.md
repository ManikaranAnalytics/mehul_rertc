# AWS Deployment Guide — RE-RTC Dispatch Optimizer

Production runs **two app containers** plus PostgreSQL:

- **frontend** — nginx serves the React SPA and proxies `/api`, `/docs` to the backend
- **backend** — FastAPI on internal port 8000
- **postgres** — bundled in full compose, or use RDS

## Project layout

```
backend/     FastAPI API — see backend/DEPLOYMENT.md
frontend/    React SPA — see frontend/DEPLOYMENT.md
```

## Deployment modes

| Mode | Use case | Command |
|------|----------|---------|
| Backend Docker only | API testing | `cd backend && docker compose --env-file .env up -d --build` |
| Frontend Docker only | UI container | `cd frontend && docker compose up -d --build` |
| Full stack | EC2 production | `docker compose --env-file backend/.env up -d --build` (repo root) |
| App + RDS | Managed DB | `docker compose -f docker-compose.app-only.yml --env-file backend/.env up -d --build` |

## Deployment readiness checklist

| Item | Status |
|------|--------|
| `backend/Dockerfile` | ✅ |
| `frontend/Dockerfile` + nginx template | ✅ |
| `backend/docker-compose.yml` (standalone) | ✅ |
| `frontend/docker-compose.yml` (standalone) | ✅ |
| `docker-compose.yml` (full stack) | ✅ |
| `docker-compose.app-only.yml` (RDS) | ✅ |
| `deploy.sh` (EC2 one-shot) | ✅ |
| Health check `/api/health` | ✅ |
| `backend/.env.example` | ✅ |
| DB tables auto-created on startup (`init_db`) | ✅ |

**Before production**, change all secrets in `backend/.env`.

---

## Option A — EC2 + full Docker Compose (recommended)

### 1. Launch EC2

- **AMI:** Ubuntu 22.04 LTS
- **Instance:** `t3.small` or larger
- **Security group:** `22` (SSH), `8000` (app)

### 2. Deploy

```bash
git clone https://github.com/ManikaranAnalytics/mehul_rertc.git
cd mehul_rertc
cp backend/.env.example backend/.env
nano backend/.env
bash deploy.sh
```

### 3. Verify

```bash
curl http://localhost:8000/api/health
docker compose --env-file backend/.env logs -f backend frontend
```

Open `http://<EC2_PUBLIC_IP>:8000`

---

## Option B — EC2 + Amazon RDS

### 1. Create RDS PostgreSQL 16

- DB name: `re_rtc`
- Allow port **5432** from EC2 security group

### 2. Configure `backend/.env`

```
DATABASE_URL=postgresql+psycopg://re_rtc:PASSWORD@your-rds-host:5432/re_rtc
ADMIN_PASSWORD=strong-admin-password
ADMIN_JWT_SECRET=long-random-string
```

### 3. Run app-only compose

```bash
docker compose -f docker-compose.app-only.yml --env-file backend/.env up -d --build
```

---

## Option C — ECS Fargate (advanced)

1. Build and push two images to **ECR**:
   ```bash
   docker build -t re-rtc-backend ./backend
   docker build -t re-rtc-frontend ./frontend
   ```
2. **RDS** as in Option B
3. ECS tasks: frontend (public) + backend (internal), env from Secrets Manager
4. **ALB** → frontend task; `BACKEND_UPSTREAM=http://backend:8000` on shared network

---

## Environment variables (production)

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `ADMIN_PASSWORD` | Yes | Change from default |
| `ADMIN_JWT_SECRET` | Yes | Long random string |
| `BACKEND_UPSTREAM` | Frontend container | `http://backend:8000` in full compose |
| `WEB_CONCURRENCY` | No | Default `2` |
| `ALLOWED_ORIGINS` | No | `*` ok with same-origin nginx |

---

## HTTPS

Put **ALB + ACM** or **nginx/Caddy + Let's Encrypt** in front of port 8000. Do not expose plain HTTP long-term on the public internet.

---

## Operations

```bash
docker compose --env-file backend/.env logs -f backend frontend postgres
docker compose --env-file backend/.env up -d --build   # restart / update
docker compose exec postgres pg_dump -U re_rtc re_rtc > backup.sql
```

---

## Local development

```bash
# Backend
cd backend && ../.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Frontend (separate terminal)
cd frontend && npm run dev -- --host 0.0.0.0
```

See [backend/README.md](./backend/README.md) and [frontend/README.md](./frontend/README.md).

---

## Known limitations

- Forecast CSVs ship in `backend/data/` inside the image.
- SQL files in `backend/migrations/` are reference only; schema uses `create_all` on startup.
- Default Postgres password in `.env.example` is for development only.
