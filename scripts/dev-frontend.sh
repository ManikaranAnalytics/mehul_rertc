#!/usr/bin/env bash
# Start Vite frontend dev server (proxies /api → localhost:8000)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/frontend"
if [[ -x "$ROOT/.tools/node-v20.19.2-darwin-arm64/bin/npm" ]]; then
  export PATH="$ROOT/.tools/node-v20.19.2-darwin-arm64/bin:$PATH"
fi
exec npm run dev -- --host 0.0.0.0
