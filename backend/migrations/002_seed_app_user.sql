-- Optional seed: example APPLICATION user (not the admin operator)
-- Run AFTER 001_create_users_table.sql
-- Generate bcrypt hash: python scripts/generate_admin_password_hash.py YourPassword

-- INSERT INTO users (username, password, login_status)
-- VALUES (
--     'app_user',
--     '$2b$12$REPLACE_WITH_BCRYPT_HASH_FROM_SCRIPT',
--     'ACTIVE'
-- );
