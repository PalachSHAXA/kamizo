-- Rebuild meeting_agenda_comments to the canonical schema.
--
-- The live VPS table was stuck on the OLD shape: user_id NOT NULL +
-- comment NOT NULL, and NO resident_id / content columns. But the current
-- code expects the new shape:
--   • the write path (routes/meetings/comments.ts) INSERTs resident_id,
--     resident_name, content, comment_type, … (and not user_id/comment),
--     so every comment INSERT hit a NOT NULL violation → 0 rows ever saved;
--   • the protocol query (routes/meetings/protocol.ts /protocol/data) joins
--     on c.resident_id and selects c.content → "no such column: c.content"
--     → HTTP 500, which broke "Скачать протокол".
--
-- 0 comment rows exist on the live DB, so dropping + recreating is fully
-- data-safe. After this the table matches cloudflare/schema.sql.
DROP TABLE IF EXISTS meeting_agenda_comments;

CREATE TABLE meeting_agenda_comments (
  id TEXT PRIMARY KEY,
  agenda_item_id TEXT NOT NULL,
  meeting_id TEXT NOT NULL,
  resident_id TEXT NOT NULL,
  resident_name TEXT NOT NULL,
  apartment_number TEXT,
  content TEXT NOT NULL,
  comment_type TEXT DEFAULT 'comment',
  counter_proposal TEXT,
  include_in_protocol INTEGER DEFAULT 1,
  tenant_id TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agenda_comments_item ON meeting_agenda_comments(agenda_item_id);
CREATE INDEX IF NOT EXISTS idx_agenda_comments_meeting ON meeting_agenda_comments(meeting_id);
