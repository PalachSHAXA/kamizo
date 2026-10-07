BEGIN;

CREATE TABLE resident_uk_reports (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  building_id TEXT REFERENCES buildings(id) ON DELETE SET NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('financial', 'completed_works')),
  title TEXT NOT NULL,
  period_label TEXT NOT NULL,
  description TEXT,
  file_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK (file_size >= 0),
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  published_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_resident_uk_reports_tenant_type_published
  ON resident_uk_reports(tenant_id, report_type, published_at DESC);
CREATE INDEX idx_resident_uk_reports_tenant_building_active
  ON resident_uk_reports(tenant_id, building_id, is_active, published_at DESC);

COMMIT;
