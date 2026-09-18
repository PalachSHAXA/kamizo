-- Email login code (2FA via email), mirroring the Telegram login-approval flow.
--
-- The login-code lifecycle (status / otp_hash / otp_attempts / expires_at) and
-- the verify-code + status endpoints are channel-agnostic, so email codes reuse
-- the SAME telegram_login_requests table. We only need to (a) record which
-- channel a request went out on, (b) keep the destination email for audit, and
-- (c) let a user turn on email-delivered 2FA independently of any Telegram link.
--
-- telegram_chat_id stays NOT NULL (SQLite can't drop that cheaply); email rows
-- store an empty string there and rely on channel='email' instead.

BEGIN IMMEDIATE;

ALTER TABLE telegram_login_requests ADD COLUMN channel TEXT NOT NULL DEFAULT 'telegram';
ALTER TABLE telegram_login_requests ADD COLUMN email TEXT;

-- Per-user opt-in for email-delivered login codes. 0 = off (default), 1 = on.
ALTER TABLE users ADD COLUMN email_2fa_enabled INTEGER NOT NULL DEFAULT 0;

COMMIT;
