-- 050_chat_channel_assign_resolve.sql
--
-- Adds assignment + resolved-state columns to chat_channels so the
-- admin chat dialog's InfoDropdown ("Назначить сотрудника" /
-- "Пометить решённым") can persist real state instead of stubbing.
--
-- All four columns are nullable: every existing channel keeps
-- working unchanged. assigned_to = NULL means "unassigned"; the API
-- treats it as "any director/manager/dispatcher can pick up".
-- resolved_at = NULL means "active"; non-null = the dispatcher who
-- closed it stamped resolved_by + resolved_at = datetime('now').
-- updated_at is sourced from app-layer writes (the assign/resolve
-- handlers) — no SQLite trigger.
--
-- IDs are TEXT (UUID strings) to match the rest of chat_channels.
-- No strict FK to users(id) — matches the existing created_by and
-- resident_id columns on the same table; chat_channels stays loose
-- on user references because users can be soft-deleted or moved
-- between tenants over time.
--
-- D1 / SQLite quirk: ADD COLUMN does NOT support IF NOT EXISTS, so
-- this migration is one-shot. Re-running it on a DB that already
-- has the columns will error — apply once, mark migration done.

ALTER TABLE chat_channels ADD COLUMN assigned_to TEXT;
ALTER TABLE chat_channels ADD COLUMN resolved_at TEXT;
ALTER TABLE chat_channels ADD COLUMN resolved_by TEXT;
ALTER TABLE chat_channels ADD COLUMN updated_at TEXT;

-- assigned_to is most-often-filtered in the admin inbox (who's
-- handling what), so it gets its own index. resolved_at + tenant_id
-- composite supports the "show only active channels in tenant" list
-- query the admin chat list will run.
CREATE INDEX IF NOT EXISTS idx_chat_channels_assigned_to ON chat_channels(assigned_to);
CREATE INDEX IF NOT EXISTS idx_chat_channels_tenant_resolved ON chat_channels(tenant_id, resolved_at);
