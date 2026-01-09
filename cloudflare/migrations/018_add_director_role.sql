-- Add director and other missing roles to users table
-- SQLite doesn't support ALTER COLUMN, so we need to recreate the table

-- Create new users table with updated constraint
CREATE TABLE IF NOT EXISTS users_new (
  id TEXT PRIMARY KEY,
  login TEXT UNIQUE NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'director', 'manager', 'department_head', 'dispatcher', 'executor', 'resident', 'advertiser', 'coupon_checker', 'tenant', 'commercial_owner')),
  specialization TEXT CHECK (specialization IN ('plumber', 'electrician', 'elevator', 'intercom', 'cleaning', 'security', 'carpenter', 'boiler', 'ac', 'gardener', 'other', NULL)),
  email TEXT,
  avatar_url TEXT,
  address TEXT,
  apartment TEXT,
  building_id TEXT,
  entrance TEXT,
  floor TEXT,
  language TEXT DEFAULT 'ru',
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  branch TEXT,
  building TEXT,
  status TEXT DEFAULT 'offline',
  apartment_area REAL,
  password_changed_at TEXT,
  contract_signed_at TEXT,
  agreed_to_terms_at TEXT,
  contract_number TEXT,
  contract_start_date TEXT,
  contract_end_date TEXT,
  contract_type TEXT DEFAULT 'standard',
  qr_code TEXT,
  total_area REAL,
  account_type TEXT
);

-- Copy all data from old table to new table
INSERT OR IGNORE INTO users_new SELECT
  id, login, phone, password_hash, name, role, specialization, email, avatar_url,
  address, apartment, building_id, entrance, floor, language, is_active,
  created_at, updated_at, branch, building, status, apartment_area,
  password_changed_at, contract_signed_at, agreed_to_terms_at, contract_number,
  contract_start_date, contract_end_date, contract_type, qr_code, total_area, account_type
FROM users;

-- Drop old table
DROP TABLE IF EXISTS users;

-- Rename new table to users
ALTER TABLE users_new RENAME TO users;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_login ON users(login);
CREATE INDEX IF NOT EXISTS idx_users_building_id ON users(building_id);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
