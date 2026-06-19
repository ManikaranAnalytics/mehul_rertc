#!/usr/bin/env bash
# Dump local PostgreSQL (re_rtc) and restore to remote database from backend/.env
#
# Prerequisites:
#   1. Local Postgres running (bash scripts/start_postgres.sh)
#   2. Remote user can CREATE on schema public (see migrations/003_remote_grants.sql)
#   3. Your public IP whitelisted on remote server
#
# Usage (from repo root or backend/):
#   bash backend/scripts/migrate_local_to_remote.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKEND="$(cd "$(dirname "$0")/.." && pwd)"
PG="${ROOT}/.tools/postgresql-16/bin"
DUMP="${BACKEND}/data/local_re_rtc_dump.sql"

LOCAL_HOST="${LOCAL_PG_HOST:-localhost}"
LOCAL_PORT="${LOCAL_PG_PORT:-5432}"
LOCAL_USER="${LOCAL_PG_USER:-re_rtc}"
LOCAL_DB="${LOCAL_PG_DB:-re_rtc}"

if [[ ! -x "$PG/pg_dump" ]]; then
  echo "ERROR: pg_dump not found at $PG/pg_dump"
  echo "Run: bash backend/scripts/setup_postgres.sh"
  exit 1
fi

if [[ -f "$BACKEND/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$BACKEND/.env"
  set +a
fi

REMOTE_HOST="${POSTGRES_HOST:?Set POSTGRES_HOST in backend/.env}"
REMOTE_PORT="${POSTGRES_PORT:-5432}"
REMOTE_USER="${POSTGRES_USER:?Set POSTGRES_USER in backend/.env}"
REMOTE_DB="${POSTGRES_DB:?Set POSTGRES_DB in backend/.env}"
REMOTE_PASSWORD="${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in backend/.env}"

echo "▸ Dumping local: ${LOCAL_USER}@${LOCAL_HOST}:${LOCAL_PORT}/${LOCAL_DB}"
"$PG/pg_dump" -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$LOCAL_USER" -d "$LOCAL_DB" \
  --no-owner --no-acl --clean --if-exists \
  -f "$DUMP"

echo "▸ Restoring to remote: ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PORT}/${REMOTE_DB}"
export PGPASSWORD="$REMOTE_PASSWORD"
"$PG/psql" -h "$REMOTE_HOST" -p "$REMOTE_PORT" -U "$REMOTE_USER" -d "$REMOTE_DB" -f "$DUMP"

echo "▸ Verifying remote tables..."
"$PG/psql" -h "$REMOTE_HOST" -p "$REMOTE_PORT" -U "$REMOTE_USER" -d "$REMOTE_DB" -c "\dt"

echo ""
echo "✓ Migration complete. backend/.env should use:"
echo "  DATABASE_URL=postgresql+psycopg://${REMOTE_USER}:...@${REMOTE_HOST}:${REMOTE_PORT}/${REMOTE_DB}"
echo "  (password URL-encoded: @ → %40)"
