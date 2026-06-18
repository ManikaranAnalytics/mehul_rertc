#!/usr/bin/env bash
# Start local PostgreSQL (run setup_postgres.sh first if not installed)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PG_DIR="$ROOT/.tools/postgresql-16"
PGDATA="$ROOT/.pgdata"

if [[ ! -x "$PG_DIR/bin/postgres" ]]; then
  echo "PostgreSQL not installed. Running setup_postgres.sh..."
  bash "$(dirname "$0")/setup_postgres.sh"
  exit 0
fi

export PATH="$PG_DIR/bin:$PATH"

if pg_isready -h localhost -p 5432 >/dev/null 2>&1; then
  echo "PostgreSQL already running on port 5432"
else
  pg_ctl -D "$PGDATA" -l "$PGDATA/postgres.log" start -w
  echo "PostgreSQL started on port 5432"
fi
