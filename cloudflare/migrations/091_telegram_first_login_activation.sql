BEGIN IMMEDIATE;

ALTER TABLE users ADD COLUMN telegram_activation_required INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN telegram_activated_at TEXT;

CREATE TABLE telegram_activation_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  link_token_hash TEXT NOT NULL UNIQUE,
  browser_secret_hash TEXT NOT NULL,
  credential_version TEXT NOT NULL DEFAULT '',
  telegram_user_id TEXT,
  telegram_chat_id TEXT,
  telegram_message_id TEXT,
  challenge TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  phone_verified_at TEXT,
  approved_at TEXT,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_telegram_activation_user
  ON telegram_activation_requests(tenant_id, user_id, status);
CREATE INDEX idx_telegram_activation_expiry
  ON telegram_activation_requests(expires_at, status);

CREATE TABLE auth_recovery_codes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  used_at TEXT
);

CREATE UNIQUE INDEX idx_auth_recovery_code
  ON auth_recovery_codes(tenant_id, user_id, code_hash);
CREATE INDEX idx_auth_recovery_user
  ON auth_recovery_codes(tenant_id, user_id, used_at);

CREATE TABLE auth_security_locks (
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  lock_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, user_id)
);

CREATE TRIGGER users_require_telegram_activation_after_insert
AFTER INSERT ON users
WHEN NEW.tenant_id IS NOT NULL
  AND LENGTH(TRIM(NEW.phone)) = 13 AND SUBSTR(TRIM(NEW.phone), 1, 4) = '+998'
  AND SUBSTR(TRIM(NEW.phone), 5) NOT GLOB '*[^0-9]*'
  AND NEW.password_changed_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM tenants WHERE id = NEW.tenant_id AND is_demo = 1)
BEGIN
  UPDATE users SET telegram_activation_required = 1
  WHERE id = NEW.id AND tenant_id = NEW.tenant_id;
END;

CREATE TRIGGER users_require_telegram_activation_after_reset
AFTER UPDATE OF password_hash ON users
WHEN NEW.tenant_id IS NOT NULL
  AND LENGTH(TRIM(NEW.phone)) = 13 AND SUBSTR(TRIM(NEW.phone), 1, 4) = '+998'
  AND SUBSTR(TRIM(NEW.phone), 5) NOT GLOB '*[^0-9]*'
  AND NEW.password_changed_at IS NULL
  AND NEW.auth_revoked_at IS NOT OLD.auth_revoked_at
  AND NOT EXISTS (SELECT 1 FROM tenants WHERE id = NEW.tenant_id AND is_demo = 1)
BEGIN
  UPDATE users SET telegram_activation_required = 1, telegram_activated_at = NULL
  WHERE id = NEW.id AND tenant_id = NEW.tenant_id;
END;

CREATE TRIGGER users_expire_activation_after_auth_revoke
AFTER UPDATE OF auth_revoked_at ON users
WHEN NEW.tenant_id IS NOT NULL AND NEW.auth_revoked_at IS NOT OLD.auth_revoked_at
BEGIN
  UPDATE telegram_activation_requests SET status = 'expired'
  WHERE tenant_id = NEW.tenant_id AND user_id = NEW.id
    AND status IN ('pending', 'awaiting_contact', 'awaiting_match', 'approved');
END;

COMMIT;
