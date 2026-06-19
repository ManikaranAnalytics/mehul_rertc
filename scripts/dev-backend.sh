#!/usr/bin/env bash
# Start FastAPI backend from backend/ (dev)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -x "$ROOT/.venv/bin/python" ]]; then
  export PATH="$ROOT/.venv/bin:$PATH"
fi
cd "$ROOT/backend"
if [[ -f "$ROOT/backend/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/backend/.env"
  set +a
fi
export DEV_RELOAD="${DEV_RELOAD:-true}"
exec python -m uvicorn main:app --host 0.0.0.0 --port "${PORT:-9000}" --reload
