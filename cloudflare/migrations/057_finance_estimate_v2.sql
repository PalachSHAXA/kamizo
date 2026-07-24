-- Finance estimate v2 — supports 3 calculation models:
--   TARIFF_CALCULATED — main model (§2.4 ТЗ): tariff = ((expenses - offsets) / area) * (1 + profit) - telecom/area
--   TARIFF_MANUAL     — tariff entered manually, deficit computed (§2.6)
--   TARIFF_FLAT       — flat division total/area (§2.7)
--
-- Legacy estimates stay under model='legacy' and keep using old endpoints
-- (POST /api/finance/estimates + POST /api/finance/charges/generate).

------------------------------------------------------------
-- 1. apartments: property_type CHECK-enum is stuck at ('commercial','non_commercial').
--    Расширять enum в SQLite = пересборка таблицы; вместо этого добавляем 2 флага.
--    Правило: residential = !is_commercial && !is_basement && !is_parking
------------------------------------------------------------
ALTER TABLE apartments ADD COLUMN is_basement INTEGER DEFAULT 0;
ALTER TABLE apartments ADD COLUMN is_parking INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_apartments_type_flags
  ON apartments(building_id, is_commercial, is_basement, is_parking);

------------------------------------------------------------
-- 2. finance_estimates — модель, доходы, штат, разрыв
--    (CHECK на новую колонку через ALTER работает начиная с SQLite 3.31)
------------------------------------------------------------
ALTER TABLE finance_estimates ADD COLUMN model TEXT DEFAULT 'legacy'
  CHECK (model IN ('legacy','TARIFF_CALCULATED','TARIFF_MANUAL','TARIFF_FLAT'));

ALTER TABLE finance_estimates ADD COLUMN commercial_income REAL DEFAULT 0;
ALTER TABLE finance_estimates ADD COLUMN basement_income   REAL DEFAULT 0;
ALTER TABLE finance_estimates ADD COLUMN parking_income    REAL DEFAULT 0;
ALTER TABLE finance_estimates ADD COLUMN telecom_income    REAL DEFAULT 0;

ALTER TABLE finance_estimates ADD COLUMN residential_area  REAL DEFAULT 0;
ALTER TABLE finance_estimates ADD COLUMN payroll_tax_rate  REAL DEFAULT 0.24;

-- Кешированные результаты computeEstimate (для быстрого отображения без пересчёта)
ALTER TABLE finance_estimates ADD COLUMN fot_gross            REAL DEFAULT 0;
ALTER TABLE finance_estimates ADD COLUMN payroll_tax          REAL DEFAULT 0;
ALTER TABLE finance_estimates ADD COLUMN fot_total            REAL DEFAULT 0;
ALTER TABLE finance_estimates ADD COLUMN self_cost_resident   REAL DEFAULT 0;
ALTER TABLE finance_estimates ADD COLUMN base_per_m2          REAL DEFAULT 0;
ALTER TABLE finance_estimates ADD COLUMN with_profit_per_m2   REAL DEFAULT 0;
ALTER TABLE finance_estimates ADD COLUMN telecom_comp_per_m2  REAL DEFAULT 0;
ALTER TABLE finance_estimates ADD COLUMN tariff_resident      REAL DEFAULT 0;
ALTER TABLE finance_estimates ADD COLUMN tariff_approved      REAL;
ALTER TABLE finance_estimates ADD COLUMN jami_tushum_year     REAL DEFAULT 0;
ALTER TABLE finance_estimates ADD COLUMN umumiy_year          REAL DEFAULT 0;
ALTER TABLE finance_estimates ADD COLUMN deficit_year         REAL DEFAULT 0;

------------------------------------------------------------
-- 3. finance_estimate_items — расширение под доход/расход, секцию, юнит
------------------------------------------------------------
ALTER TABLE finance_estimate_items ADD COLUMN kind TEXT DEFAULT 'expense'
  CHECK (kind IN ('expense','income'));

ALTER TABLE finance_estimate_items ADD COLUMN section TEXT DEFAULT 'production'
  CHECK (section IN ('production','periodic'));

ALTER TABLE finance_estimate_items ADD COLUMN unit TEXT DEFAULT 'flat'
  CHECK (unit IN ('flat','per_sqm','per_apt','per_meter','staff_computed'));

ALTER TABLE finance_estimate_items ADD COLUMN linked_to_staff INTEGER DEFAULT 0;

-- Ключ для чек-листа 16 обязательных услуг (electricity_common / elevator / etc.)
ALTER TABLE finance_estimate_items ADD COLUMN legal_code TEXT;

------------------------------------------------------------
-- 4. finance_estimate_staff — штатное расписание сметы
--    units дробные (0.5), monthly = units * salary кешируется
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS finance_estimate_staff (
  id TEXT PRIMARY KEY,
  estimate_id TEXT NOT NULL,
  title TEXT NOT NULL,
  units REAL NOT NULL DEFAULT 1,
  salary REAL NOT NULL DEFAULT 0,
  monthly REAL DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  tenant_id TEXT NOT NULL DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fes_estimate ON finance_estimate_staff(estimate_id);
CREATE INDEX IF NOT EXISTS idx_fes_tenant   ON finance_estimate_staff(tenant_id);

------------------------------------------------------------
-- 5. finance_fact_reports — факт-отчёт собственникам по ст.29 ЗРУ-581
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS finance_fact_reports (
  id TEXT PRIMARY KEY,
  building_id TEXT NOT NULL,
  period_from TEXT NOT NULL,       -- YYYY-MM
  period_to   TEXT NOT NULL,       -- YYYY-MM
  rows_json TEXT,                  -- JSON: [{name, prior_debt, accrued, paid, arrears}]
  uk_income_plan REAL DEFAULT 0,
  uk_income_fact REAL DEFAULT 0,
  generated_by TEXT,
  generated_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_ffr_building ON finance_fact_reports(building_id);
CREATE INDEX IF NOT EXISTS idx_ffr_tenant   ON finance_fact_reports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ffr_period   ON finance_fact_reports(period_from, period_to);

------------------------------------------------------------
-- 6. buildings — поля для валидатора Ташкентского минимума + пересчёт residential_area
------------------------------------------------------------
ALTER TABLE buildings ADD COLUMN has_pumps INTEGER DEFAULT 0;
ALTER TABLE buildings ADD COLUMN residential_area REAL DEFAULT 0;

-- Разово пересчитываем residential_area как SUM жилых квартир
UPDATE buildings
SET residential_area = COALESCE((
  SELECT SUM(a.total_area)
  FROM apartments a
  WHERE a.building_id = buildings.id
    AND a.is_commercial = 0
    AND (a.is_basement = 0 OR a.is_basement IS NULL)
    AND (a.is_parking  = 0 OR a.is_parking  IS NULL)
), 0);
