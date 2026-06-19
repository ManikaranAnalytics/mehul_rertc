#!/usr/bin/env bash
# Deploy backend + frontend on EC2 (both use backend/.env)
#
#   cp backend/.env.example backend/.env   # set DATABASE_URL + secrets
#   bash deploy.sh
#
# App URL: http://<host>:8000  (frontend nginx, /api → backend)
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$APP_DIR/backend/.env"

echo ""
echo "════════════════════════════════════════════════════"
echo "  RE-RTC — Deploy backend + frontend"
echo "════════════════════════════════════════════════════"
echo ""

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$APP_DIR/backend/.env.example" "$ENV_FILE"
  echo "Created backend/.env — edit DATABASE_URL and secrets, then re-run."
  exit 1
fi

# shellcheck disable=SC1090
set -a && source "$ENV_FILE" && set +a
FRONTEND_PORT="${FRONTEND_PORT:-8000}"
BACKEND_UPSTREAM="${BACKEND_UPSTREAM:-http://host.docker.internal:9000}"

echo "▸ [1/3] Docker..."
if ! command -v docker &>/dev/null; then
  echo "Install Docker first: https://docs.docker.com/engine/install/"
  exit 1
fi

echo "▸ [2/3] Backend (API :${PORT:-9000}, DB from DATABASE_URL)..."
(cd "$APP_DIR/backend" && docker compose --env-file .env up -d --build)

echo "▸ [3/3] Frontend (public :${FRONTEND_PORT})..."
(cd "$APP_DIR/frontend" && docker compose --env-file ../backend/.env up -d --build)

PUBLIC_IP="$(curl -sf --max-time 2 http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || hostname -I | awk '{print $1}')"

echo ""
echo "════════════════════════════════════════════════════"
echo "  ✓ Done"
echo "  App     : http://${PUBLIC_IP}:${FRONTEND_PORT}"
echo "  Health  : http://${PUBLIC_IP}:${FRONTEND_PORT}/api/health"
echo "  Backend : cd backend && docker compose logs -f backend"
echo "  Frontend: cd frontend && docker compose logs -f frontend"
echo "════════════════════════════════════════════════════"
