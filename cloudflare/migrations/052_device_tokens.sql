-- 052_device_tokens.sql
--
-- Native push-notification infrastructure (Sprint 86, Bug 7 + APNs).
-- Adds a single new table `device_tokens` holding per-installation
-- push tokens (APNs on iOS, FCM on Android). Each row binds one
-- installation to ONE user + tenant; on re-login as a different user
-- the same token UPSERTs and the user_id flips. Hard delete on logout
-- is not done — we flip is_active=0 so the audit log keeps a footprint.
--
-- Columns:
--   id            TEXT  PK (uuid). generateId() at INSERT time.
--   user_id       TEXT  FK → users.id (no enforced FK constraint —
--                       SQLite/D1 still doesn't enforce them anyway).
--                       NULL is never written: every active push token
--                       belongs to exactly one user. On user soft-
--                       delete, the device row stays so we can audit
--                       "device X belonged to deleted user Y on date Z".
--   tenant_id     TEXT  Same as user_id's tenant at register time. We
--                       store it independently (not via JOIN) because
--                       the tenant filter on the read path
--                       (test-push, future business-event send) must
--                       not require a JOIN — one less query per push.
--                       On a user re-login to a different tenant, the
--                       UPSERT rewrites this too.
--   platform      TEXT  'ios' (APNs) or 'android' (FCM). No CHECK
--                       constraint — D1 silently drops them on some
--                       paths and the value is always set by our
--                       /api/devices/register handler from a
--                       validated union.
--   token         TEXT  The actual APNs / FCM device token. UNIQUE.
--                       Treat as secret-equivalent — never log in
--                       plaintext, never expose via list endpoints.
--                       APNs tokens are 64 hex chars (= 32 bytes);
--                       FCM tokens are ~152 chars base64-ish. No
--                       length constraint here so the column survives
--                       Apple / Google format bumps.
--   app_version   TEXT  e.g. "1.4.2". Optional — populated by the
--                       /api/devices/register call from the client
--                       when available; gives us a rough split for
--                       per-version delivery quality once we start
--                       sending real pushes.
--   os_version    TEXT  e.g. "iOS 17.4". Same provenance + use as
--                       app_version. Optional.
--   created_at    TEXT  ISO datetime of first registration. Indexed
--                       implicitly via the PK column.
--   last_seen_at  TEXT  Updated every time the same token re-registers
--                       (app launch, foreground come-back). Used to
--                       sunset tokens that haven't pinged for N weeks.
--   is_active     INTEGER  1 = receives push. 0 = inactive (explicit
--                          /api/devices/unregister, or APNs returned
--                          BadDeviceToken / Unregistered). Default 1.
--
-- Indices:
--   idx_device_tokens_user_id     covers "find all tokens for user X"
--                                 (the hot read path on push send).
--   idx_device_tokens_tenant_active  covers "all active tokens in
--                                    tenant Y" — used by super-admin
--                                    test-push and by future
--                                    tenant-wide broadcasts.
--   UNIQUE(token)                 declared inline; SQLite creates an
--                                 implicit unique index. Enforces
--                                 the UPSERT contract — same token
--                                 from a re-login UPDATEs the existing
--                                 row instead of inserting a duplicate.
--
-- Dual-write to D1 is INTENTIONALLY NOT wired up here. Bug 2's
-- mirrorTenantWriteToD1() helper is scoped to the `tenants` table
-- only (the Cloudflare Worker that fronts kamizo.uz subdomains needs
-- D1 to look up which tenant owns which subdomain). device_tokens
-- has no Worker-side reader — every push send happens on the VPS
-- Node.js backend that has direct access to VPS SQLite. Keeping the
-- mirror narrow avoids unnecessary write amplification + Cloudflare
-- API quota burn.

CREATE TABLE IF NOT EXISTS device_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  app_version TEXT,
  os_version TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  last_seen_at TEXT DEFAULT (datetime('now')),
  is_active INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id
  ON device_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_device_tokens_tenant_active
  ON device_tokens(tenant_id, is_active);
