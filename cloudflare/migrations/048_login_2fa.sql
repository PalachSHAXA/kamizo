-- Migration 048: server-side 2FA-on-login (Eskiz SMS), gated by TWO_FA_ENABLED.
--
-- All three tables are LAZY: nothing here writes or reads them until the
-- feature flag is on. The /api/auth/login flow stays byte-for-byte
-- identical when the flag is off — these tables just sit empty.
--
-- Codes are NEVER stored in plaintext: only sha-256(code) is persisted,
-- and code_hash is one-way. The pending_token is the only thing that
-- crosses the wire between /login and /2fa/verify and is itself opaque
-- random data (also hashed at rest? — kept plaintext in this table for
-- direct lookup, but it's short-lived (5 min) and only useful in
-- combination with a correct 6-digit code that the attacker doesn't
-- know).
--
-- All three tables include `tenant_id` to stay consistent with the rest
-- of the schema's multi-tenancy story, but the 2FA flow scopes lookups
-- by `user_id` directly (the user already knows their own tenant once
-- they've authenticated their password).

-- ── Pending logins / 2FA codes ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS login_otp (
  id              TEXT PRIMARY KEY,
  pending_token   TEXT NOT NULL UNIQUE,    -- opaque random; sent to client between /login and /2fa/verify
  user_id         TEXT NOT NULL,
  tenant_id       TEXT,
  phone           TEXT NOT NULL,           -- snapshot of the user's phone at code-send time
  code_hash       TEXT NOT NULL,           -- sha-256 hex of the 6-digit code (never plaintext)
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at      TEXT NOT NULL,           -- created_at + 5 min
  used_at         TEXT,                    -- non-null once consumed; protects against replay
  ip              TEXT,
  user_agent      TEXT
);

CREATE INDEX IF NOT EXISTS idx_login_otp_pending_token ON login_otp (pending_token);
CREATE INDEX IF NOT EXISTS idx_login_otp_user_expires ON login_otp (user_id, expires_at);

-- ── Trusted devices (skip SMS on subsequent logins from same browser) ─
-- The client persists a long opaque token in localStorage; the server
-- stores only sha-256(token). 30-day TTL by default. Revocation = delete.
CREATE TABLE IF NOT EXISTS auth_trusted_devices (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  tenant_id       TEXT,
  token_hash      TEXT NOT NULL,            -- sha-256 hex of the device token
  device_label    TEXT,                     -- "Chrome on macOS" (parsed from UA, best-effort)
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at      TEXT NOT NULL,            -- created_at + 30 days
  revoked_at      TEXT                      -- non-null = unusable
);

CREATE INDEX IF NOT EXISTS idx_auth_trusted_devices_user ON auth_trusted_devices (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_trusted_devices_token_hash ON auth_trusted_devices (token_hash);

-- ── SMS send quota (anti-SMS-pumping; each Eskiz hit costs money) ────
-- One row per phone. Maintains hourly + daily counters with last-send
-- timestamp for the 60s inter-send cooldown. Reset windows are handled
-- in code by checking elapsed time, so the row stays warm.
CREATE TABLE IF NOT EXISTS auth_sms_quota (
  phone               TEXT PRIMARY KEY,
  last_sent_at        TEXT NOT NULL,
  hour_window_start   TEXT NOT NULL,
  hour_count          INTEGER NOT NULL DEFAULT 0,
  day_window_start    TEXT NOT NULL,
  day_count           INTEGER NOT NULL DEFAULT 0
);
