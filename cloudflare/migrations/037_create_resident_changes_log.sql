-- Лог изменений данных жителей (с обязательным документальным основанием)
CREATE TABLE IF NOT EXISTS resident_changes_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT '',
  resident_id TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  change_type TEXT NOT NULL,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  reason TEXT NOT NULL,
  document_number TEXT,
  document_date TEXT,
  comment TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rcl_tenant ON resident_changes_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rcl_resident ON resident_changes_log(resident_id);
CREATE INDEX IF NOT EXISTS idx_rcl_changed_by ON resident_changes_log(changed_by);
