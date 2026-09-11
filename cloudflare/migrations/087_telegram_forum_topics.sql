-- Forum topics plus tenant isolation for Telegram-wide support tables.
-- Production received the same DDL during the manual Telegram rollout.

BEGIN IMMEDIATE;

ALTER TABLE telegram_groups ADD COLUMN message_thread_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE telegram_groups ADD COLUMN topic_name TEXT;
ALTER TABLE telegram_deliveries ADD COLUMN message_thread_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE telegram_suggestions ADD COLUMN message_thread_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE telegram_draft_tokens ADD COLUMN message_thread_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE telegram_updates ADD COLUMN tenant_id TEXT NOT NULL DEFAULT '__global__';
ALTER TABLE telegram_pending_phones ADD COLUMN tenant_id TEXT NOT NULL DEFAULT '__global__';
ALTER TABLE telegram_dictionary ADD COLUMN tenant_id TEXT NOT NULL DEFAULT '__global__';

DROP INDEX IF EXISTS idx_telegram_groups_active_chat;
CREATE UNIQUE INDEX idx_telegram_groups_active_topic
  ON telegram_groups(telegram_chat_id, message_thread_id)
  WHERE disabled_at IS NULL;

DROP INDEX IF EXISTS idx_telegram_deliveries_once;
CREATE UNIQUE INDEX idx_telegram_deliveries_once
  ON telegram_deliveries(announcement_id, telegram_chat_id, message_thread_id);

DROP INDEX IF EXISTS idx_telegram_suggestions_cooldown;
CREATE INDEX idx_telegram_suggestions_cooldown
  ON telegram_suggestions(telegram_chat_id, message_thread_id, telegram_user_id, created_at);

DROP INDEX IF EXISTS idx_telegram_suggestions_dedupe;
CREATE INDEX idx_telegram_suggestions_dedupe
  ON telegram_suggestions(telegram_chat_id, message_thread_id, category, created_at);

CREATE TRIGGER IF NOT EXISTS trg_telegram_groups_scope_insert
BEFORE INSERT ON telegram_groups
WHEN NEW.disabled_at IS NULL AND EXISTS (
  SELECT 1 FROM telegram_groups existing
  WHERE existing.telegram_chat_id = NEW.telegram_chat_id
    AND existing.disabled_at IS NULL
    AND (
      existing.tenant_id <> NEW.tenant_id
      OR existing.message_thread_id = 0
      OR NEW.message_thread_id = 0
    )
)
BEGIN
  SELECT RAISE(ABORT, 'telegram_chat_scope_conflict');
END;

COMMIT;
