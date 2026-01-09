-- Create entrances table (подъезды)
CREATE TABLE IF NOT EXISTS entrances (
  id TEXT PRIMARY KEY,
  building_id TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  floors_from INTEGER DEFAULT 1,
  floors_to INTEGER,
  apartments_from INTEGER,
  apartments_to INTEGER,
  has_elevator INTEGER DEFAULT 0,
  elevator_id TEXT,
  intercom_type TEXT CHECK (intercom_type IN ('audio', 'video', 'smart', 'none')),
  intercom_code TEXT,
  cleaning_schedule TEXT,
  responsible_id TEXT,
  last_inspection TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(building_id, number)
);
