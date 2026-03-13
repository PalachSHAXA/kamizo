-- Add last_login_at column to track when users last logged in
ALTER TABLE users ADD COLUMN last_login_at TEXT;
