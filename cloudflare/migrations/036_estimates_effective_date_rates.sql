-- Migration 036: Add effective_date, enterprise_profit_percent, commercial_rate, basement_rate, parking_rate to finance_estimates
ALTER TABLE finance_estimates ADD COLUMN IF NOT EXISTS effective_date TEXT;
ALTER TABLE finance_estimates ADD COLUMN IF NOT EXISTS enterprise_profit_percent REAL DEFAULT 9;
ALTER TABLE finance_estimates ADD COLUMN IF NOT EXISTS commercial_rate REAL DEFAULT 0;
ALTER TABLE finance_estimates ADD COLUMN IF NOT EXISTS basement_rate REAL DEFAULT 0;
ALTER TABLE finance_estimates ADD COLUMN IF NOT EXISTS parking_rate REAL DEFAULT 0;

-- Add monthly_amount to estimate items (for monthly→yearly calculation)
ALTER TABLE finance_estimate_items ADD COLUMN IF NOT EXISTS monthly_amount REAL DEFAULT 0;
