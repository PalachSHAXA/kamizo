-- Sprint 88 — resident rentals marketplace v1
--
-- Adds three new tables backing the resident-facing rentals feature
-- (Editorial direction). Zero touches on existing tables. Zero data
-- writes. Additive-only:
--   • 3 × CREATE TABLE IF NOT EXISTS
--   • 6 × CREATE INDEX IF NOT EXISTS
--
-- Nothing here alters, drops, updates, or inserts into any existing
-- schema. Safe to apply on a live DB. Rollback = DROP the three new
-- tables (only ever after confirming zero rows).
--
-- Feature flag `rental_listings` is a runtime concept managed via the
-- tenants.features JSON — NOT touched by this migration. Every tenant
-- defaults to OFF because the flag string is absent from both:
--   (a) their existing features JSON (they have to be explicitly
--       PATCHed via /api/tenants/:id to add it), and
--   (b) the NULL-features fallback baseline at
--       cloudflare/src/middleware/tenant.ts:98 which does not include
--       'rental_listings'.
-- Verified below.

-- ── rental_listings ────────────────────────────────────────────────
-- One row per listing. Owned by a `users` row via publisher_user_id.
-- Deliberately does NOT cascade on user delete — a resident who leaves
-- the app shouldn't hard-delete their historical listing (unlike the
-- pre-existing rental_apartments which was a УК-provisioned surface).
-- Tenant scope on every WHERE is enforced at the API layer.
CREATE TABLE IF NOT EXISTS rental_listings (
  id                     TEXT PRIMARY KEY,
  tenant_id              TEXT NOT NULL DEFAULT '',
  publisher_user_id      TEXT NOT NULL REFERENCES users(id),
  source_type            TEXT NOT NULL CHECK (source_type IN ('resident','uk')),

  -- Lifecycle. State transitions gated by role at the API layer:
  --   owner:     active ↔ rented, active ↔ archived, archived → active
  --   management: any → hidden, hidden → active
  state                  TEXT NOT NULL DEFAULT 'active'
                         CHECK (state IN ('active','rented','archived','hidden')),
  hidden_reason          TEXT,
  hidden_by_user_id      TEXT REFERENCES users(id),
  hidden_at              TEXT,

  -- Address / geometry
  rooms                  INTEGER NOT NULL CHECK (rooms BETWEEN 0 AND 4),   -- 0=studio, 4=4+
  area_m2                REAL NOT NULL CHECK (area_m2 > 0),
  floor                  INTEGER NOT NULL CHECK (floor > 0),
  floor_total            INTEGER NOT NULL CHECK (floor_total >= floor),
  apartment_number       TEXT,
  entrance               TEXT,
  building_id            TEXT REFERENCES buildings(id),

  -- Pricing (SQLite stores REAL for numerics without loss up to 2^53)
  price_monthly          INTEGER NOT NULL CHECK (price_monthly >= 0),
  price_currency         TEXT NOT NULL DEFAULT 'UZS',
  deposit_months         REAL,

  -- Amenities (SQLite 0/1 booleans)
  furnished              INTEGER NOT NULL DEFAULT 0,
  air_conditioning       INTEGER NOT NULL DEFAULT 0,
  internet               INTEGER NOT NULL DEFAULT 0,
  parking                INTEGER NOT NULL DEFAULT 0,
  animals_allowed        INTEGER NOT NULL DEFAULT 0,

  duration_type          TEXT NOT NULL DEFAULT 'long'
                         CHECK (duration_type IN ('short','long','flexible')),
  description            TEXT NOT NULL DEFAULT '',

  phone_visible          INTEGER NOT NULL DEFAULT 1,

  -- 14-day confirmation ritual — timer is v2, but the columns exist
  -- now so the timer can drop in without a follow-up ALTER.
  last_confirmed_at      TEXT NOT NULL DEFAULT (datetime('now')),
  confirm_prompt_sent_at TEXT,

  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Feed query pattern: tenant_id + state='active' ORDER BY created_at DESC.
CREATE INDEX IF NOT EXISTS idx_rental_listings_feed
  ON rental_listings (tenant_id, state, created_at DESC);

-- My-listings query pattern: publisher_user_id + tenant_id.
CREATE INDEX IF NOT EXISTS idx_rental_listings_owner
  ON rental_listings (publisher_user_id, tenant_id);

-- Confirmation-timer scan pattern: state='active' ORDER BY last_confirmed_at.
-- (Unused until v2 timer ships — index costs less to add now than an
-- ALTER migration later.)
CREATE INDEX IF NOT EXISTS idx_rental_listings_confirm
  ON rental_listings (state, last_confirmed_at);


-- ── rental_listing_photos ─────────────────────────────────────────
-- Base64 data-URLs. sort_order=0 is the cover. LIST endpoints MUST
-- never SELECT data_url — join for cover only. min 3 / max 8 photos
-- per listing enforced at the API layer (a CHECK on a child table's
-- row-count would be too rigid for admin-side cleanup).
CREATE TABLE IF NOT EXISTS rental_listing_photos (
  id           TEXT PRIMARY KEY,
  listing_id   TEXT NOT NULL REFERENCES rental_listings(id) ON DELETE CASCADE,
  tenant_id    TEXT NOT NULL DEFAULT '',
  sort_order   INTEGER NOT NULL DEFAULT 0,
  data_url     TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Detail-page query pattern: photos for one listing, ordered by cover-first.
CREATE INDEX IF NOT EXISTS idx_rental_listing_photos_listing
  ON rental_listing_photos (listing_id, sort_order);


-- ── rental_listing_reports ────────────────────────────────────────
-- «Пожаловаться» flag from any resident on any listing. The v1 API
-- does NOT yet expose the submit endpoint (deferred to v2 per plan),
-- but the TABLE exists so that (a) the УК-hide state transition —
-- which SHIPS in v1 — has somewhere to record the manager's reason,
-- and (b) the client can start reading unhandled-report counts as
-- soon as v2 lands, without a follow-up migration.
CREATE TABLE IF NOT EXISTS rental_listing_reports (
  id                 TEXT PRIMARY KEY,
  listing_id         TEXT NOT NULL REFERENCES rental_listings(id) ON DELETE CASCADE,
  tenant_id          TEXT NOT NULL DEFAULT '',
  reporter_user_id   TEXT NOT NULL REFERENCES users(id),
  reason             TEXT NOT NULL
                     CHECK (reason IN ('already_rented','misleading','wrong_photos','fraud','other')),
  comment            TEXT,
  handled_at         TEXT,
  handled_by_user_id TEXT REFERENCES users(id),
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Moderation-queue scan: unhandled reports per listing, newest first.
CREATE INDEX IF NOT EXISTS idx_rental_listing_reports_open
  ON rental_listing_reports (listing_id, handled_at, created_at DESC);
