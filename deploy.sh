#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy.sh — Deploy RE-RTC Dispatch Optimizer on AWS EC2 (Ubuntu 22.04+)
#
# Recommended: EC2 + Docker Compose (app + PostgreSQL on same instance)
# Alternative:  EC2 + RDS — see DEPLOYMENT.md and docker-compose.app-only.yml
#
# Usage (on a fresh EC2 instance):
#   git clone <repo-url> re_rtc && cd re_rtc
#   cp backend/.env.example backend/.env    # edit secrets before production
#   bash deploy.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

echo ""
echo "════════════════════════════════════════════════════"
echo "  RE-RTC Dispatch Optimizer — AWS EC2 Deployment"
echo "════════════════════════════════════════════════════"
echo ""

# ── 1. Docker ─────────────────────────────────────────────────────────────────
echo "▸ [1/4] Installing Docker (if needed)..."
if ! command -v docker &>/dev/null; then
  sudo apt-get update -qq
  sudo apt-get install -y -qq ca-certificates curl gnupg
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt-get update -qq
  sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  sudo usermod -aG docker "$USER" || true
  echo "    Docker installed. You may need to log out/in for group membership."
fi
echo "    docker $(docker --version 2>/dev/null || echo 'not available — re-login after install')"

# ── 2. Environment file ───────────────────────────────────────────────────────
echo "▸ [2/4] Checking backend/.env..."
if [[ ! -f "$APP_DIR/backend/.env" ]]; then
  cp "$APP_DIR/backend/.env.example" "$APP_DIR/backend/.env"
  echo "    Created backend/.env from backend/.env.example — EDIT SECRETS before going to production."
else
  echo "    backend/.env already exists."
fi

# Ensure DATABASE_URL password matches POSTGRES_PASSWORD for bundled Postgres
if ! grep -q '^DATABASE_URL=.*POSTGRES' "$APP_DIR/backend/.env" 2>/dev/null; then
  :
fi

# ── 3. Build and start ────────────────────────────────────────────────────────
echo "▸ [3/4] Building and starting containers..."
sudo docker compose --env-file backend/.env up -d --build

# ── 4. Firewall ─────────────────────────────────────────────────────────────────
echo "▸ [4/4] Opening port ${PORT:-8000} (if ufw is active)..."
if command -v ufw &>/dev/null && sudo ufw status 2>/dev/null | grep -q "Status: active"; then
  sudo ufw allow "${PORT:-8000}/tcp" || true
fi

PUBLIC_IP="$(curl -sf --max-time 2 http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || hostname -I | awk '{print $1}')"

echo ""
echo "════════════════════════════════════════════════════"
echo "  ✓ Deployment complete!"
echo ""
echo "  App URL : http://${PUBLIC_IP}:${PORT:-8000}"
echo "  API Docs: http://${PUBLIC_IP}:${PORT:-8000}/docs"
echo "  Health  : http://${PUBLIC_IP}:${PORT:-8000}/api/health"
echo ""
echo "  Logs    : sudo docker compose --env-file backend/.env logs -f backend frontend"
echo "  Restart : sudo docker compose --env-file backend/.env restart"
echo "  Stop    : sudo docker compose --env-file backend/.env down"
echo ""
echo "  Before production:"
echo "    • Change ADMIN_PASSWORD and ADMIN_JWT_SECRET in backend/.env"
echo "    • Change POSTGRES_PASSWORD and DATABASE_URL in backend/.env"
echo "    • Restrict EC2 security group to your IP / VPN"
echo "    • Put HTTPS in front (ALB + ACM or nginx + Let's Encrypt)"
echo "════════════════════════════════════════════════════"
