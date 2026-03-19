-- Finance expenses table for tracking actual spending vs estimate plan
CREATE TABLE IF NOT EXISTS finance_expenses (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT '',
  building_id TEXT,
  estimate_id TEXT,
  estimate_item_id TEXT,
  estimate_item_name TEXT,
  amount REAL NOT NULL,
  expense_date TEXT NOT NULL,
  description TEXT,
  document_url TEXT,
  request_id TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fe_tenant ON finance_expenses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fe_building ON finance_expenses(building_id);
CREATE INDEX IF NOT EXISTS idx_fe_estimate ON finance_expenses(estimate_id);
