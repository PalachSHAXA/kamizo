-- Replay-safe subset of cloudflare/migrations/0003_add_multi_tenancy.sql
-- required by every isolated suite. Applied to a disposable empty database
-- before seed data because schema.sql predates this production column.
ALTER TABLE branches ADD COLUMN tenant_id TEXT;
