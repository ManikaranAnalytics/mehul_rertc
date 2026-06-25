-- Per-date upload metadata (solar capacity at upload time). Created automatically by init_db();
-- run manually on existing deployments if init_db has not run yet.

CREATE TABLE IF NOT EXISTS generation_upload_meta (
    date VARCHAR(10) PRIMARY KEY,
    solar_ac_mw DOUBLE PRECISION NOT NULL DEFAULT 60,
    solar_mode VARCHAR(16) NOT NULL DEFAULT 'absolute',
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
