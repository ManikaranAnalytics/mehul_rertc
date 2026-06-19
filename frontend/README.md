# RE-RTC Frontend (React + Vite)

React SPA for the RTC dispatch optimizer.

## Local development (no Docker)

```bash
cd frontend
npm install          # first time
npm run dev -- --host 0.0.0.0
```

Open http://localhost:5173 — Vite proxies `/api` to http://localhost:8000.

If `npm` is not on your PATH, use the portable Node under the repo `.tools/` directory or install Node 20+.

**Requires a running backend** on port 8000 (see [backend/README.md](../backend/README.md)).

## Docker (frontend only)

From this directory:

```bash
BACKEND_UPSTREAM=http://host.docker.internal:8000 docker compose up -d --build
```

UI at http://localhost:3000 (override with `FRONTEND_PORT`).

| `BACKEND_UPSTREAM` | When to use |
|--------------------|-------------|
| `http://host.docker.internal:8000` | Backend on host (uvicorn or backend container publishing :8000) — **Mac/Windows Docker** |
| `http://172.17.0.1:8000` | Backend on host — **Linux Docker** (or use host IP) |
| `http://backend:8000` | Backend on same Docker Compose network (root full-stack compose) |

The nginx container proxies `/api/`, `/docs`, and `/openapi.json` to `BACKEND_UPSTREAM`.

## API integration

All API calls use relative paths (`BASE_URL = ''` in `src/utils/constants.ts`). Same-origin requests go through Vite (dev) or nginx (Docker).

No `VITE_*` build-time env vars — the API is always reached via `/api/...` on the same host as the UI.

## Production

See [DEPLOYMENT.md](./DEPLOYMENT.md) for full frontend deployment (Docker, nginx, EC2, operations).

Full-stack: see [backend/DEPLOYMENT.md](../backend/DEPLOYMENT.md).

Build manually:

```bash
npm run build   # output in dist/
```
