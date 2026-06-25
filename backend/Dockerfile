# Build context: repo root (see docker-compose.yml)
# Single container: FastAPI + built React app (no nginx).

# ── Stage 1: frontend build ─────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --silent

COPY frontend/ ./

# Busts Docker layer cache when deploy.sh passes a new GIT_COMMIT
ARG GIT_COMMIT=unknown
RUN echo "frontend build @ ${GIT_COMMIT}" && npm run build

# ── Stage 2: backend + static SPA ─────────────────────────────────────────────
FROM python:3.11-slim

ARG GIT_COMMIT=unknown
LABEL org.opencontainers.image.revision="${GIT_COMMIT}"

RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser

WORKDIR /app

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir -r requirements.txt

COPY backend/main.py backend/__init__.py ./
COPY backend/routers/      routers/
COPY backend/services/     services/
COPY backend/models/       models/
COPY backend/db/           db/
COPY backend/dependencies/ dependencies/
COPY backend/data/         data/
COPY backend/assets/       assets/
COPY backend/scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh

COPY --from=frontend-builder /frontend/dist /app/frontend/dist

RUN chmod +x /app/scripts/docker-entrypoint.sh

USER appuser

EXPOSE 8012

ENV PORT=8012 \
    WEB_CONCURRENCY=2 \
    DEV_RELOAD=false \
    SERVE_FRONTEND=true \
    FRONTEND_DIST=/app/frontend/dist \
    GIT_COMMIT=${GIT_COMMIT}

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import os,urllib.request; urllib.request.urlopen(f'http://localhost:{os.getenv(\"PORT\",\"8012\")}/api/health')" || exit 1

ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
