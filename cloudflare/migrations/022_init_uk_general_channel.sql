-- Initialize the uk_general chat channel
-- This channel should always exist for residents to communicate with UK

-- Check if uk_general channel already exists, if not create it
INSERT OR IGNORE INTO chat_channels (id, type, name, description, created_at)
VALUES (
  'uk-general',
  'uk_general',
  'Общий чат УК',
  'Общий чат для связи с управляющей компанией',
  datetime('now')
);
