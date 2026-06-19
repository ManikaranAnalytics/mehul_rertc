-- ═══════════════════════════════════════════════════════════════════════════
-- MUST run as PostgreSQL SUPERUSER (postgres), NOT as rertc.
--
-- If you run GRANT as rertc you will see:
--   "no privileges were granted for rertc"
--
-- Connect as admin, e.g.:
--   psql -h 13.235.110.27 -p 5432 -U postgres -d rertc
-- ═══════════════════════════════════════════════════════════════════════════

-- Option 1 — let rertc create tables (app init_db + migrations)
GRANT CONNECT ON DATABASE rertc TO rertc;
GRANT USAGE, CREATE ON SCHEMA public TO rertc;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO rertc;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO rertc;

-- Option 2 — if Option 1 is not allowed, create tables as postgres then grant access:
/*
CREATE TABLE IF NOT EXISTS app_state (
    key VARCHAR(64) PRIMARY KEY,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS schedule_runs (
    id SERIAL PRIMARY KEY,
    date VARCHAR(10) NOT NULL,
    request JSONB NOT NULL,
    response JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_schedule_runs_date ON schedule_runs (date);

CREATE TABLE IF NOT EXISTS generation_inputs (
    date VARCHAR(10) NOT NULL,
    block INTEGER NOT NULL,
    time VARCHAR(8) NOT NULL DEFAULT '00:00:00',
    wind_speed DOUBLE PRECISION NOT NULL DEFAULT 0,
    solar_mw DOUBLE PRECISION NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (date, block)
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(64) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    login_status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_users_username ON users (username);

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO rertc;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO rertc;
GRANT USAGE ON SCHEMA public TO rertc;
*/
