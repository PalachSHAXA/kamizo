-- Remove global UNIQUE constraint on login column
-- Replace with composite unique index (login, tenant_id) for multi-tenancy support
-- This allows the same login to exist in different tenants

-- Disable foreign keys for table recreation
PRAGMA foreign_keys=OFF;

-- Production columns (verified via pragma_table_info):
-- id, login, phone, password_hash, password_plain, name, role, specialization,
-- email, avatar_url, address, apartment, building_id, entrance, floor, branch,
-- building, language, is_active, qr_code, contract_signed_at, agreed_to_terms_at,
-- contract_number, contract_start_date, contract_end_date, contract_type,
-- password_changed_at, total_area, created_at, updated_at, account_type, status, tenant_id

-- Step 1: Recreate users table WITHOUT UNIQUE on login
CREATE TABLE IF NOT EXISTS users_new (
  id TEXT PRIMARY KEY,
  login TEXT NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  password_plain TEXT,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  specialization TEXT,
  email TEXT,
  avatar_url TEXT,
  address TEXT,
  apartment TEXT,
  building_id TEXT,
  entrance TEXT,
  floor TEXT,
  branch TEXT,
  building TEXT,
  language TEXT DEFAULT 'ru',
  is_active INTEGER DEFAULT 1,
  qr_code TEXT,
  contract_signed_at TEXT,
  agreed_to_terms_at TEXT,
  contract_number TEXT,
  contract_start_date TEXT,
  contract_end_date TEXT,
  contract_type TEXT DEFAULT 'standard',
  password_changed_at TEXT,
  total_area REAL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  account_type TEXT,
  status TEXT DEFAULT 'offline',
  tenant_id TEXT
);

-- Step 2: Copy all data (explicit column mapping matching production order)
INSERT OR IGNORE INTO users_new (
  id, login, phone, password_hash, password_plain, name, role, specialization,
  email, avatar_url, address, apartment, building_id, entrance, floor, branch,
  building, language, is_active, qr_code, contract_signed_at, agreed_to_terms_at,
  contract_number, contract_start_date, contract_end_date, contract_type,
  password_changed_at, total_area, created_at, updated_at, account_type, status, tenant_id
)
SELECT
  id, login, phone, password_hash, password_plain, name, role, specialization,
  email, avatar_url, address, apartment, building_id, entrance, floor, branch,
  building, language, is_active, qr_code, contract_signed_at, agreed_to_terms_at,
  contract_number, contract_start_date, contract_end_date, contract_type,
  password_changed_at, total_area, created_at, updated_at, account_type, status, tenant_id
FROM users;

-- Step 3: Drop old table
DROP TABLE IF EXISTS users;

-- Step 4: Rename new table
ALTER TABLE users_new RENAME TO users;

-- Step 5: Create composite unique index (login unique per tenant)
-- COALESCE ensures NULL tenant_id is treated as empty string for uniqueness
CREATE UNIQUE INDEX idx_users_login_tenant ON users(login, COALESCE(tenant_id, ''));

-- Step 6: Recreate other indexes
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_login ON users(login);
CREATE INDEX IF NOT EXISTS idx_users_building_id ON users(building_id);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

-- Re-enable foreign keys
PRAGMA foreign_keys=ON;
