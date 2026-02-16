-- Fix branches.code UNIQUE constraint to be per-tenant instead of global
-- This allows the same branch code (e.g., 'AS') to exist in different tenants

PRAGMA foreign_keys=OFF;

-- Production columns (verified via pragma_table_info):
-- id, code, name, address, phone, buildings_count, residents_count, created_at, updated_at, tenant_id

-- Step 1: Recreate branches table WITHOUT global UNIQUE on code
CREATE TABLE IF NOT EXISTS branches_new (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  buildings_count INTEGER DEFAULT 0,
  residents_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT
);

-- Step 2: Copy all data
INSERT OR IGNORE INTO branches_new (id, code, name, address, phone, buildings_count, residents_count, created_at, updated_at, tenant_id)
SELECT id, code, name, address, phone, buildings_count, residents_count, created_at, updated_at, tenant_id
FROM branches;

-- Step 3: Drop old table
DROP TABLE IF EXISTS branches;

-- Step 4: Rename new table
ALTER TABLE branches_new RENAME TO branches;

-- Step 5: Create composite unique index (code unique per tenant)
CREATE UNIQUE INDEX idx_branches_code_tenant ON branches(code, COALESCE(tenant_id, ''));

-- Step 6: Recreate other indexes
CREATE INDEX IF NOT EXISTS idx_branches_code ON branches(code);
CREATE INDEX IF NOT EXISTS idx_branches_tenant ON branches(tenant_id);

PRAGMA foreign_keys=ON;
