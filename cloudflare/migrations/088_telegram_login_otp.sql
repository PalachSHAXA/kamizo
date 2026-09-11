-- Six-digit Telegram login code. Historical requests remain compatible
-- with button approval; only new requests receive otp_hash.

BEGIN IMMEDIATE;

ALTER TABLE telegram_login_requests ADD COLUMN otp_hash TEXT;
ALTER TABLE telegram_login_requests ADD COLUMN otp_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE telegram_login_requests ADD COLUMN otp_max_attempts INTEGER NOT NULL DEFAULT 5;

COMMIT;
