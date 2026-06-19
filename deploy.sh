#!/usr/bin/env bash
# Deploy single-container app on EC2 (FastAPI serves UI + API, no nginx).
#
#   cp backend/.env.example backend/.env
#   bash deploy.sh
#
# App URL: http://<host>:8012
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$APP_DIR/backend/.env"

echo ""
echo "════════════════════════════════════════════════════"
echo "  RE-RTC — Deploy (single container, no nginx)"
echo "════════════════════════════════════════════════════"
echo ""

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$APP_DIR/backend/.env.example" "$ENV_FILE"
  echo "Created backend/.env — edit DATABASE_URL and secrets, then re-run."
  exit 1
fi

# shellcheck disable=SC1090
set -a && source "$ENV_FILE" && set +a
APP_PORT="${PORT:-8012}"

echo "▸ [1/2] Docker..."
if ! command -v docker &>/dev/null; then
  echo "Install Docker first: https://docs.docker.com/engine/install/"
  exit 1
fi

echo "▸ [2/3] Stop legacy nginx frontend (if any)..."
(cd "$APP_DIR/frontend" && docker compose --env-file ../backend/.env down 2>/dev/null || true)

echo "▸ [3/3] Backend + UI on :${APP_PORT}..."
(cd "$APP_DIR/backend" && docker compose --env-file .env up -d --build)

PUBLIC_IP="$(curl -sf --max-time 2 http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || hostname -I | awk '{print $1}')"

echo ""
echo "════════════════════════════════════════════════════"
echo "  ✓ Done"
echo "  App     : http://${PUBLIC_IP}:${APP_PORT}"
echo "  Login   : http://${PUBLIC_IP}:${APP_PORT}/login"
echo "  Health  : http://${PUBLIC_IP}:${APP_PORT}/api/health"
echo "  Logs    : cd backend && docker compose logs -f backend"
echo "════════════════════════════════════════════════════"
