-- Vote Reconsideration Request Feature
-- Allows УК to request residents to reconsider their vote while voting is open

-- New table for tracking reconsideration requests
CREATE TABLE IF NOT EXISTS meeting_vote_reconsideration_requests (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  agenda_item_id TEXT NOT NULL,
  resident_id TEXT NOT NULL,
  apartment_id TEXT NOT NULL,

  -- Who sent the request
  requested_by_user_id TEXT NOT NULL,
  requested_by_role TEXT NOT NULL,

  -- Request details
  reason TEXT NOT NULL,
  message_to_resident TEXT,

  -- Current vote at time of request (for audit)
  vote_at_request_time TEXT NOT NULL,

  -- Status tracking
  -- pending: sent, waiting for resident action
  -- viewed: resident opened the notification
  -- vote_changed: resident changed their vote
  -- ignored: resident dismissed the request
  -- expired: voting closed without action
  status TEXT NOT NULL DEFAULT 'pending',

  -- Timestamps
  viewed_at TEXT,
  responded_at TEXT,
  new_vote TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  expired_at TEXT
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_reconsider_meeting ON meeting_vote_reconsideration_requests(meeting_id);
CREATE INDEX IF NOT EXISTS idx_reconsider_resident ON meeting_vote_reconsideration_requests(resident_id);
CREATE INDEX IF NOT EXISTS idx_reconsider_status ON meeting_vote_reconsideration_requests(status);
CREATE INDEX IF NOT EXISTS idx_reconsider_agenda ON meeting_vote_reconsideration_requests(agenda_item_id);
CREATE INDEX IF NOT EXISTS idx_reconsider_resident_agenda ON meeting_vote_reconsideration_requests(resident_id, agenda_item_id);

-- Update vote records to track if changed after reconsideration request
ALTER TABLE meeting_vote_records ADD COLUMN changed_after_reconsideration INTEGER DEFAULT 0;
ALTER TABLE meeting_vote_records ADD COLUMN reconsideration_request_id TEXT;
