-- Migration 036: Add effective_date, rates to finance_estimates
ALTER TABLE finance_estimates ADD COLUMN effective_date TEXT;
ALTER TABLE finance_estimates ADD COLUMN enterprise_profit_percent REAL DEFAULT 9;
ALTER TABLE finance_estimates ADD COLUMN commercial_rate REAL DEFAULT 0;
ALTER TABLE finance_estimates ADD COLUMN basement_rate REAL DEFAULT 0;
ALTER TABLE finance_estimates ADD COLUMN parking_rate REAL DEFAULT 0;
ALTER TABLE finance_estimate_items ADD COLUMN monthly_amount REAL DEFAULT 0;
