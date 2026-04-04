-- Audit log for ЖК code changes
CREATE TABLE IF NOT EXISTS branch_code_audit (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL,
  old_code TEXT NOT NULL,
  new_code TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  changed_by_name TEXT,
  tenant_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_branch_code_audit_branch ON branch_code_audit(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_code_audit_tenant ON branch_code_audit(tenant_id);
