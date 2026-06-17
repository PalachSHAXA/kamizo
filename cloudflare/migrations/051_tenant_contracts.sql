-- 051_tenant_contracts.sql
--
-- Adds 4 columns to the `tenants` table so a single contract PDF can
-- be attached per management company (UK). All residents of a tenant
-- see the same scanned contract; staff (director and up) view it,
-- super-admin can also force-upload / delete.
--
-- Architecture note: this is the TENANT-level variant. An earlier
-- exploration migrated per-resident contracts onto the users table;
-- that file (051_resident_contracts.sql) was scrapped uncommitted and
-- never applied — `PRAGMA table_info(users)` on prod shows no
-- contract_r2_key / contract_filename / contract_uploaded_at /
-- contract_uploaded_by columns. This migration therefore lands
-- cleanly on a clean baseline.
--
-- Columns:
--   contract_r2_key       TEXT  R2 object key. Format:
--                                 tenants/<tenant_id>/contract-<ISO>.pdf
--                               The tenant_id prefix makes any
--                               accidental object listing useless
--                               cross-tenant — keys can't be guessed
--                               into another tenant's namespace.
--   contract_filename     TEXT  Original filename used for the
--                               Content-Disposition header when the
--                               resident downloads. Sanitised
--                               before storage (see contracts.ts).
--   contract_uploaded_at  TEXT  datetime('now') stamp; NULL means
--                               "no contract attached yet".
--   contract_uploaded_by  TEXT  user id of the last uploader (audit
--                               trail). Not FK-enforced because users
--                               can be soft-deleted independent of
--                               the contracts they uploaded.
--
-- All four are nullable + default NULL. Existing tenants keep working.
-- D1 / SQLite quirk: ALTER TABLE ADD COLUMN doesn't support
-- IF NOT EXISTS, so this migration is one-shot.

ALTER TABLE tenants ADD COLUMN contract_r2_key TEXT;
ALTER TABLE tenants ADD COLUMN contract_filename TEXT;
ALTER TABLE tenants ADD COLUMN contract_uploaded_at TEXT;
ALTER TABLE tenants ADD COLUMN contract_uploaded_by TEXT;
