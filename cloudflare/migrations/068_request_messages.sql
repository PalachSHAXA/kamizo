-- Per-request chat between the resident and the assigned executor.
-- Business rules (enforced in routes/requests/messages.ts):
--   * Writable only while the executor is actually on the job:
--     status IN ('accepted','in_progress'). Before acceptance there is no chat;
--     after completion (pending_approval/completed/cancelled) it is read-only.
--   * Participants: the request's resident (owner) and the assigned executor.
--     Management can read the history.
CREATE TABLE IF NOT EXISTS request_messages (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  sender_role TEXT,
  sender_name TEXT,
  body TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_request_messages_request ON request_messages(request_id, created_at);
CREATE INDEX IF NOT EXISTS idx_request_messages_tenant ON request_messages(tenant_id);
