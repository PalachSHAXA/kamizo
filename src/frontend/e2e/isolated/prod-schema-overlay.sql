-- Columns present in the checked-in read-only production sqlite_master snapshot
-- at cloudflare/src/lib/demo/__tests__/fixtures/demo-production-schema.sql but
-- absent from the historical schema.sql baseline. This runs during disposable
-- schema setup, before seed data; it is not application or seed-time migration.

ALTER TABLE marketplace_orders ADD COLUMN discount_amount REAL DEFAULT 0;
ALTER TABLE marketplace_orders ADD COLUMN payment_status TEXT DEFAULT 'pending';
ALTER TABLE marketplace_orders ADD COLUMN assigned_to TEXT;
ALTER TABLE marketplace_order_items ADD COLUMN created_at TEXT;
ALTER TABLE marketplace_categories ADD COLUMN parent_id TEXT;
ALTER TABLE marketplace_products ADD COLUMN min_order_quantity INTEGER DEFAULT 1;
ALTER TABLE marketplace_products ADD COLUMN max_order_quantity INTEGER;
ALTER TABLE marketplace_products ADD COLUMN weight REAL;
ALTER TABLE marketplace_products ADD COLUMN weight_unit TEXT DEFAULT 'кг';
ALTER TABLE marketplace_products ADD COLUMN images TEXT;
ALTER TABLE marketplace_products ADD COLUMN rating REAL DEFAULT 0;
ALTER TABLE marketplace_products ADD COLUMN reviews_count INTEGER DEFAULT 0;
ALTER TABLE marketplace_products ADD COLUMN created_by TEXT;
ALTER TABLE marketplace_reviews ADD COLUMN comment TEXT;
ALTER TABLE marketplace_reviews ADD COLUMN images TEXT;
ALTER TABLE marketplace_reviews ADD COLUMN is_verified_purchase INTEGER DEFAULT 0;

ALTER TABLE ad_categories ADD COLUMN name TEXT;
ALTER TABLE ad_categories ADD COLUMN description TEXT;
ALTER TABLE ad_categories ADD COLUMN is_active INTEGER DEFAULT 1;
ALTER TABLE ad_categories ADD COLUMN created_at TEXT;

ALTER TABLE ads ADD COLUMN advertiser_id TEXT;
ALTER TABLE ads ADD COLUMN image_url TEXT;
ALTER TABLE ads ADD COLUMN link_url TEXT;
ALTER TABLE ads ADD COLUMN is_active INTEGER DEFAULT 1;
ALTER TABLE ads ADD COLUMN impressions INTEGER DEFAULT 0;
ALTER TABLE ads ADD COLUMN clicks INTEGER DEFAULT 0;
ALTER TABLE ads ADD COLUMN budget REAL DEFAULT 0;
ALTER TABLE ads ADD COLUMN spent REAL DEFAULT 0;
ALTER TABLE ads ADD COLUMN start_date TEXT;
ALTER TABLE ads ADD COLUMN end_date TEXT;
ALTER TABLE vehicles ADD COLUMN resident_id TEXT;
ALTER TABLE guest_access_codes ADD COLUMN building_id TEXT;
ALTER TABLE guest_access_logs ADD COLUMN scanned_by TEXT;
ALTER TABLE guest_access_logs ADD COLUMN location TEXT;
ALTER TABLE guest_access_logs ADD COLUMN notes TEXT;

ALTER TABLE finance_estimates ADD COLUMN model TEXT DEFAULT 'legacy';
ALTER TABLE finance_estimates ADD COLUMN commercial_income REAL DEFAULT 0;
ALTER TABLE finance_estimates ADD COLUMN basement_income REAL DEFAULT 0;
ALTER TABLE finance_estimates ADD COLUMN parking_income REAL DEFAULT 0;
ALTER TABLE finance_estimates ADD COLUMN telecom_income REAL DEFAULT 0;
ALTER TABLE finance_estimates ADD COLUMN residential_area REAL DEFAULT 0;
ALTER TABLE finance_estimates ADD COLUMN payroll_tax_rate REAL DEFAULT 0.24;
ALTER TABLE finance_estimates ADD COLUMN fot_gross REAL DEFAULT 0;
ALTER TABLE finance_estimates ADD COLUMN payroll_tax REAL DEFAULT 0;
ALTER TABLE finance_estimates ADD COLUMN fot_total REAL DEFAULT 0;
ALTER TABLE finance_estimates ADD COLUMN self_cost_resident REAL DEFAULT 0;
ALTER TABLE finance_estimates ADD COLUMN base_per_m2 REAL DEFAULT 0;
ALTER TABLE finance_estimates ADD COLUMN with_profit_per_m2 REAL DEFAULT 0;
ALTER TABLE finance_estimates ADD COLUMN telecom_comp_per_m2 REAL DEFAULT 0;
ALTER TABLE finance_estimates ADD COLUMN tariff_resident REAL DEFAULT 0;
ALTER TABLE finance_estimates ADD COLUMN tariff_approved REAL;
ALTER TABLE finance_estimates ADD COLUMN jami_tushum_year REAL DEFAULT 0;
ALTER TABLE finance_estimates ADD COLUMN umumiy_year REAL DEFAULT 0;
ALTER TABLE finance_estimates ADD COLUMN deficit_year REAL DEFAULT 0;
ALTER TABLE finance_estimates ADD COLUMN periodic_enabled INTEGER DEFAULT 1;
ALTER TABLE finance_estimates ADD COLUMN vat_enabled INTEGER DEFAULT 0;
ALTER TABLE finance_estimates ADD COLUMN vat_rate REAL DEFAULT 0.12;
ALTER TABLE finance_estimates ADD COLUMN scope_level TEXT DEFAULT 'building';
ALTER TABLE finance_estimates ADD COLUMN branch_code TEXT;
ALTER TABLE finance_estimates ADD COLUMN allocation_base TEXT DEFAULT 'area';

ALTER TABLE finance_estimate_items ADD COLUMN kind TEXT DEFAULT 'expense';
ALTER TABLE finance_estimate_items ADD COLUMN section TEXT DEFAULT 'production';
ALTER TABLE finance_estimate_items ADD COLUMN unit TEXT DEFAULT 'flat';
ALTER TABLE finance_estimate_items ADD COLUMN linked_to_staff INTEGER DEFAULT 0;
ALTER TABLE finance_estimate_items ADD COLUMN legal_code TEXT;
ALTER TABLE finance_estimate_items ADD COLUMN building_id TEXT;

CREATE TABLE finance_estimate_staff (
  id TEXT PRIMARY KEY,
  estimate_id TEXT NOT NULL,
  title TEXT NOT NULL,
  units REAL NOT NULL DEFAULT 1,
  salary REAL NOT NULL DEFAULT 0,
  monthly REAL DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  tenant_id TEXT NOT NULL DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  vacation_days REAL DEFAULT 0
);

CREATE TABLE finance_estimate_buildings (
  id TEXT PRIMARY KEY,
  estimate_id TEXT NOT NULL,
  building_id TEXT NOT NULL,
  residential_area REAL DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  tenant_id TEXT DEFAULT ''
);
