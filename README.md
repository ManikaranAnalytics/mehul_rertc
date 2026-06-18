# RE-RTC Dispatch Optimizer

Monorepo for the Hindalco RTC dispatch optimizer.

```
re_rtc/
├── backend/              # FastAPI API — port 8000
│   ├── DEPLOYMENT.md
│   ├── docker-compose.yml   # backend (+ optional Postgres) alone
│   ├── Dockerfile
│   ├── .env.example
│   └── README.md
├── frontend/             # React + Vite UI
│   ├── DEPLOYMENT.md
│   ├── docker-compose.yml   # frontend alone
│   ├── Dockerfile
│   └── README.md
├── docker-compose.yml        # full stack (prod / EC2)
├── docker-compose.app-only.yml
├── deploy.sh
└── DEPLOYMENT.md
```

## Local development (manual)

**Terminal 1 — Postgres** (if not already running)

Local install, or:

```bash
cd backend && DB_HOST=postgres docker compose --env-file .env --profile db up -d postgres
```

**Terminal 2 — backend**

```bash
cd backend
cp .env.example .env   # first time
../.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Terminal 3 — frontend**

```bash
cd frontend
npm install   # first time
npm run dev -- --host 0.0.0.0
```

Open http://localhost:5173

See [backend/README.md](./backend/README.md) and [frontend/README.md](./frontend/README.md) for details.

## Docker per service (independent)

**Backend only** — http://localhost:8000

```bash
cd backend && docker compose --env-file .env up -d --build
```

**Frontend only** — http://localhost:3000 (backend must be running)

```bash
cd frontend && docker compose up -d --build
```

## Production (full stack)

```bash
cp backend/.env.example backend/.env   # edit secrets
docker compose --env-file backend/.env up -d --build
# http://localhost:8000 — nginx UI, /api → backend
```

See [backend/DEPLOYMENT.md](./backend/DEPLOYMENT.md) and [frontend/DEPLOYMENT.md](./frontend/DEPLOYMENT.md) for per-service guides.
See [DEPLOYMENT.md](./DEPLOYMENT.md) for AWS deployment.
