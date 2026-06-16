-- RE-RTC Admin Module — application users table
-- Run manually in PostgreSQL. Do NOT execute via application startup.
-- This table stores APPLICATION USERS managed from the Admin Panel.
-- Admin operators authenticate via ADMIN_USERNAME / ADMIN_PASSWORD env vars.

CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    username        VARCHAR(64) NOT NULL UNIQUE,
    password        VARCHAR(255) NOT NULL,
    login_status    VARCHAR(16) NOT NULL DEFAULT 'ACTIVE'
                    CHECK (login_status IN ('ACTIVE', 'INACTIVE', 'LOCKED')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
CREATE INDEX IF NOT EXISTS idx_users_login_status ON users (login_status);
