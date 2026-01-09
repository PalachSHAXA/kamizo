-- Add updated_at column to announcements table
-- This is required for WebSocket real-time updates

ALTER TABLE announcements ADD COLUMN updated_at TEXT;

-- Update existing rows to have updated_at = created_at
UPDATE announcements SET updated_at = created_at;
