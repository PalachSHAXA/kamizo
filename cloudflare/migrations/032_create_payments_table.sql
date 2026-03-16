-- Migration: Create payments table for payment tracking module

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  apartment_id TEXT,
  resident_id TEXT,
  amount REAL NOT NULL,
  payment_type TEXT DEFAULT 'cash',
  period TEXT,
  description TEXT,
  receipt_number TEXT,
  paid_by TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_payments_apartment ON payments(apartment_id);
CREATE INDEX IF NOT EXISTS idx_payments_resident ON payments(resident_id);
CREATE INDEX IF NOT EXISTS idx_payments_tenant_id ON payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_period ON payments(period);
