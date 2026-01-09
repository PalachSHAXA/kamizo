-- Rental apartments table (for tenant/commercial_owner users)
CREATE TABLE IF NOT EXISTS rental_apartments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  apartment TEXT,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_type TEXT DEFAULT 'tenant' CHECK (owner_type IN ('tenant', 'commercial_owner')),
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Rental records (guest check-in/check-out)
CREATE TABLE IF NOT EXISTS rental_records (
  id TEXT PRIMARY KEY,
  apartment_id TEXT NOT NULL REFERENCES rental_apartments(id) ON DELETE CASCADE,
  guest_names TEXT NOT NULL,
  passport_info TEXT,
  check_in_date TEXT NOT NULL,
  check_out_date TEXT NOT NULL,
  amount REAL DEFAULT 0,
  currency TEXT DEFAULT 'UZS',
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rental_apartments_owner ON rental_apartments(owner_id);
CREATE INDEX IF NOT EXISTS idx_rental_records_apartment ON rental_records(apartment_id);
CREATE INDEX IF NOT EXISTS idx_rental_records_dates ON rental_records(check_in_date, check_out_date);
