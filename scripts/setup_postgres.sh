#!/usr/bin/env bash
# Install portable PostgreSQL 16 for macOS (arm64) into .tools/postgresql
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOOLS="$ROOT/.tools"
PG_DIR="$TOOLS/postgresql-16"
PGDATA="$ROOT/.pgdata"
ARCH="$(uname -m)"

if [[ "$ARCH" == "arm64" ]]; then
  PG_URL="https://get.enterprisedb.com/postgresql/postgresql-16.8-1-osx-binaries.zip"
else
  PG_URL="https://get.enterprisedb.com/postgresql/postgresql-16.8-1-osx-binaries.zip"
fi

if [[ -x "$PG_DIR/bin/postgres" ]]; then
  echo "PostgreSQL already installed at $PG_DIR"
else
  echo "Downloading PostgreSQL 16 binaries..."
  mkdir -p "$TOOLS"
  TMP_ZIP="$TOOLS/postgresql.zip"
  curl -fsSL "$PG_URL" -o "$TMP_ZIP"
  unzip -q -o "$TMP_ZIP" -d "$TOOLS"
  rm -f "$TMP_ZIP"
  # EDB zip extracts to pgsql/
  if [[ -d "$TOOLS/pgsql" ]]; then
    rm -rf "$PG_DIR"
    mv "$TOOLS/pgsql" "$PG_DIR"
  fi
  echo "PostgreSQL installed at $PG_DIR"
fi

export PATH="$PG_DIR/bin:$PATH"

if [[ ! -d "$PGDATA" ]]; then
  echo "Initializing database cluster at $PGDATA..."
  initdb -D "$PGDATA" -U re_rtc --auth-local=trust --auth-host=trust
fi

# Ensure TCP connections from localhost are trusted (dev only)
sed -i '' 's/127.0.0.1\/32            scram-sha-256/127.0.0.1\/32            trust/' "$PGDATA/pg_hba.conf" 2>/dev/null || true
sed -i '' 's/127.0.0.1\/32            md5/127.0.0.1\/32            trust/' "$PGDATA/pg_hba.conf" 2>/dev/null || true
sed -i '' 's/::1\/128                 scram-sha-256/::1\/128                 trust/' "$PGDATA/pg_hba.conf" 2>/dev/null || true
sed -i '' 's/::1\/128                 md5/::1\/128                 trust/' "$PGDATA/pg_hba.conf" 2>/dev/null || true

if ! "$PG_DIR/bin/pg_isready" -h localhost -p 5432 >/dev/null 2>&1; then
  echo "Starting PostgreSQL..."
  "$PG_DIR/bin/pg_ctl" -D "$PGDATA" -l "$ROOT/.pgdata/postgres.log" start -w
fi

# Create role and database if missing (connect as cluster superuser via local socket)
"$PG_DIR/bin/psql" -U re_rtc -d postgres -v ON_ERROR_STOP=1 <<'SQL'
SELECT 'CREATE DATABASE re_rtc OWNER re_rtc'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 're_rtc')\gexec
SQL

echo ""
echo "PostgreSQL is ready."
echo "  Connection: postgresql://re_rtc:re_rtc_secret@localhost:5432/re_rtc"
echo "  Data dir:   $PGDATA"
echo "  Binaries:   $PG_DIR/bin"
