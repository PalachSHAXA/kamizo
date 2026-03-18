-- 034: Finance module tables
-- Расходные сметы, начисления, оплаты, доходы УК, склад материалов, акты сверки

-- 1. Расходная смета
CREATE TABLE IF NOT EXISTS finance_estimates (
  id TEXT PRIMARY KEY,
  building_id TEXT NOT NULL,
  period TEXT NOT NULL,
  title TEXT,
  total_amount REAL NOT NULL DEFAULT 0,
  commercial_rate_per_sqm REAL DEFAULT 0,
  non_commercial_rate_per_sqm REAL DEFAULT 0,
  non_commercial_coefficient REAL DEFAULT 1.5,
  uk_profit_percent REAL DEFAULT 10,
  show_profit_to_residents INTEGER DEFAULT 0,
  show_debtor_status_to_residents INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_finance_estimates_tenant ON finance_estimates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_finance_estimates_building_period ON finance_estimates(building_id, period);

-- 2. Статьи сметы
CREATE TABLE IF NOT EXISTS finance_estimate_items (
  id TEXT PRIMARY KEY,
  estimate_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'maintenance',
  amount REAL NOT NULL DEFAULT 0,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  tenant_id TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_finance_estimate_items_tenant ON finance_estimate_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_finance_estimate_items_estimate ON finance_estimate_items(estimate_id);

-- 3. Начисления на квартиры
CREATE TABLE IF NOT EXISTS finance_charges (
  id TEXT PRIMARY KEY,
  apartment_id TEXT NOT NULL,
  estimate_id TEXT,
  period TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  amount_breakdown TEXT,
  property_type TEXT DEFAULT 'commercial' CHECK (property_type IN ('commercial','non_commercial')),
  area_sqm REAL DEFAULT 0,
  rate_per_sqm REAL DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','paid','partial','overdue')),
  due_date TEXT,
  paid_amount REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_finance_charges_tenant ON finance_charges(tenant_id);
CREATE INDEX IF NOT EXISTS idx_finance_charges_apartment_period ON finance_charges(apartment_id, period);
CREATE INDEX IF NOT EXISTS idx_finance_charges_status ON finance_charges(status);
CREATE INDEX IF NOT EXISTS idx_finance_charges_estimate ON finance_charges(estimate_id);

-- 4. Оплаты
CREATE TABLE IF NOT EXISTS finance_payments (
  id TEXT PRIMARY KEY,
  charge_id TEXT,
  apartment_id TEXT NOT NULL,
  amount REAL NOT NULL,
  payment_date TEXT DEFAULT (datetime('now')),
  payment_type TEXT DEFAULT 'cash' CHECK (payment_type IN ('cash','card','transfer','online')),
  receipt_number TEXT,
  description TEXT,
  received_by TEXT,
  tenant_id TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_finance_payments_tenant ON finance_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_finance_payments_apartment ON finance_payments(apartment_id);
CREATE INDEX IF NOT EXISTS idx_finance_payments_charge ON finance_payments(charge_id);
CREATE INDEX IF NOT EXISTS idx_finance_payments_date ON finance_payments(payment_date);

-- 5. Доходы УК (не видны жителям)
CREATE TABLE IF NOT EXISTS finance_income (
  id TEXT PRIMARY KEY,
  category_id TEXT,
  amount REAL NOT NULL,
  period TEXT,
  description TEXT,
  source_type TEXT,
  source_id TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_finance_income_tenant ON finance_income(tenant_id);
CREATE INDEX IF NOT EXISTS idx_finance_income_period ON finance_income(period);
CREATE INDEX IF NOT EXISTS idx_finance_income_category ON finance_income(category_id);

-- 6. Категории доходов
CREATE TABLE IF NOT EXISTS finance_income_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_default INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  tenant_id TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_finance_income_categories_tenant ON finance_income_categories(tenant_id);

-- 7. Склад расходных материалов
CREATE TABLE IF NOT EXISTS finance_materials (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT DEFAULT 'шт',
  quantity REAL DEFAULT 0,
  price_per_unit REAL DEFAULT 0,
  min_quantity REAL DEFAULT 0,
  building_id TEXT,
  tenant_id TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_finance_materials_tenant ON finance_materials(tenant_id);
CREATE INDEX IF NOT EXISTS idx_finance_materials_building ON finance_materials(building_id);

-- 8. Списание материалов
CREATE TABLE IF NOT EXISTS finance_material_usage (
  id TEXT PRIMARY KEY,
  material_id TEXT NOT NULL,
  quantity REAL NOT NULL,
  request_id TEXT,
  estimate_item_id TEXT,
  used_by TEXT,
  description TEXT,
  used_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_finance_material_usage_tenant ON finance_material_usage(tenant_id);
CREATE INDEX IF NOT EXISTS idx_finance_material_usage_request ON finance_material_usage(request_id);
CREATE INDEX IF NOT EXISTS idx_finance_material_usage_material ON finance_material_usage(material_id);

-- 9. Акты сверки и претензии
CREATE TABLE IF NOT EXISTS finance_claims (
  id TEXT PRIMARY KEY,
  apartment_id TEXT NOT NULL,
  claim_type TEXT DEFAULT 'reconciliation' CHECK (claim_type IN ('reconciliation','pretension')),
  total_debt REAL DEFAULT 0,
  period_from TEXT,
  period_to TEXT,
  deadline_days INTEGER DEFAULT 14,
  file_url TEXT,
  generated_by TEXT,
  generated_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_finance_claims_tenant ON finance_claims(tenant_id);
CREATE INDEX IF NOT EXISTS idx_finance_claims_apartment ON finance_claims(apartment_id);

-- 10. Контроль доступа к финансам
CREATE TABLE IF NOT EXISTS finance_access (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  access_level TEXT DEFAULT 'view_only' CHECK (access_level IN ('full','payments_only','view_only')),
  granted_by TEXT,
  granted_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_finance_access_tenant ON finance_access(tenant_id);
CREATE INDEX IF NOT EXISTS idx_finance_access_user ON finance_access(user_id);

-- Seed: дефолтные категории доходов
INSERT OR IGNORE INTO finance_income_categories (id, name, is_default, is_active, tenant_id) VALUES
  ('fic_office_rent', 'Аренда офисов', 1, 1, ''),
  ('fic_basement_rent', 'Аренда подвалов', 1, 1, ''),
  ('fic_apartment_rent', 'Аренда квартир (через платформу)', 1, 1, ''),
  ('fic_advertising', 'Реклама в подъездах', 1, 1, ''),
  ('fic_parking', 'Парковка', 1, 1, ''),
  ('fic_other', 'Прочее', 1, 1, '');
