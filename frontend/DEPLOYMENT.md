# Frontend Deployment Guide

React + Vite SPA served by **nginx** in production. Proxies `/api/`, `/docs`, and `/openapi.json` to the backend.

For full-stack EC2 deployment, see [../DEPLOYMENT.md](../DEPLOYMENT.md).

---

## Prerequisites

- **Backend API** running and reachable (required for all modes except static preview)
- Docker 24+ with Compose plugin, **or**
- Node.js 20+ and npm (local dev)

---

## Architecture

```
Browser → frontend nginx (:80 / public port)
            ├─ /           → React SPA (dist/)
            ├─ /api/*      → BACKEND_UPSTREAM
            ├─ /docs       → BACKEND_UPSTREAM
            └─ /openapi.json → BACKEND_UPSTREAM
```

All API calls use relative paths (`BASE_URL = ''`). No `VITE_*` build-time env vars.

---

## 1. Local development (no Docker)

```bash
cd frontend
npm install          # first time
npm run dev -- --host 0.0.0.0
```

Open http://localhost:5173 — Vite proxies `/api` → http://localhost:8000.

**Requires backend** on port 8000. See [../backend/DEPLOYMENT.md](../backend/DEPLOYMENT.md).

If `npm` is missing, use Node 20+ or the portable Node under repo `.tools/`.

---

## 2. Docker — frontend only

Run from `frontend/`:

```bash
docker compose up -d --build
```

- UI: http://localhost:3000 (override with `FRONTEND_PORT`)
- Image: `re-rtc-frontend:latest`
- Container: `re-rtc-frontend-local`
- Default `BACKEND_UPSTREAM`: `http://host.docker.internal:8000`

### Custom backend URL

```bash
BACKEND_UPSTREAM=http://host.docker.internal:8000 docker compose up -d --build
```

| `BACKEND_UPSTREAM` | When to use |
|--------------------|-------------|
| `http://host.docker.internal:8000` | Backend on host or publishing port 8000 — **Mac/Windows Docker** |
| `http://172.17.0.1:8000` | Backend on host — **Linux Docker** |
| `http://backend:8000` | Backend on same Docker network (root full-stack compose) |
| `https://api.yourdomain.com` | Remote backend (ensure CORS / HTTPS as needed) |

### Build image manually

```bash
docker build -t re-rtc-frontend:latest .
docker run --rm -p 3000:80 \
  -e BACKEND_UPSTREAM=http://host.docker.internal:8000 \
  --add-host=host.docker.internal:host-gateway \
  re-rtc-frontend:latest
```

---

## 3. Production (as part of full stack)

From repo root:

```bash
docker compose --env-file backend/.env up -d --build
```

- Public URL: http://`<host>`:8000 (maps to frontend nginx port 80)
- Compose sets `BACKEND_UPSTREAM=http://backend:8000` automatically
- Backend is internal only — not exposed to the host

**EC2:** run [../deploy.sh](../deploy.sh) from repo root.

---

## 4. Static build (without Docker)

```bash
cd frontend
npm ci
npm run build
```

Output in `dist/`. Serve with any static file server **and** reverse-proxy `/api` to the backend. The root `dist/` alone is not enough — API routes must be proxied.

---

## 5. nginx configuration

Template: `nginx.conf.template` — rendered at container start by `scripts/docker-entrypoint.sh` using `envsubst`.

| Setting | Value |
|---------|-------|
| `client_max_body_size` | 20 MB (CSV uploads) |
| `proxy_read_timeout` | 300 s (optimizer runs) |
| Proxied paths | `/api/`, `/docs`, `/openapi.json` |

To change backend URL at runtime, set `BACKEND_UPSTREAM` — no rebuild required.

---

## 6. Verify deployment

```bash
# Static UI loads
curl -I http://localhost:3000/

# API proxy works (backend must be running)
curl http://localhost:3000/api/health
# {"status":"ok"}
```

Open the UI in a browser and log in at `/login`.

---

## 7. Operations

```bash
# Logs (standalone)
docker compose logs -f frontend

# Logs (full stack, from repo root)
docker compose --env-file backend/.env logs -f frontend

# Rebuild after code changes
docker compose up -d --build

# Stop
docker compose down
```

---

## 8. Troubleshooting

| Issue | Fix |
|-------|-----|
| UI loads but API fails | Check `BACKEND_UPSTREAM`; ensure backend is running |
| `npm: command not found` | Install Node 20+ or add `.tools/node-.../bin` to PATH |
| Linux: `host.docker.internal` fails | Use `172.17.0.1` or Docker bridge host IP |
| `/docs` 404 on public port | Use full-stack or standalone frontend container (proxies `/docs`) |
| CORS errors | Use nginx same-origin proxy; avoid serving UI and API on different origins without `ALLOWED_ORIGINS` |
