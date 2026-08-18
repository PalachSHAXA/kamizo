-- Смета на ЖК (объект) → разбивка на дома.
-- scope_level='building' (по умолчанию) = текущее поведение (один дом);
-- 'complex' = смета на ЖК, список домов в finance_estimate_buildings.
-- branch_code — ЖК сметы (при complex). allocation_base — база распределения
-- общих расходов ('area' сейчас; 'apartments' на будущее).
-- items.building_id — scope статьи/дохода: NULL = общая (на все дома),
-- задано = адресная (только этот дом).
-- SQLite: без IF NOT EXISTS на ADD COLUMN, каждая колонка отдельным ALTER.
ALTER TABLE finance_estimates ADD COLUMN scope_level TEXT DEFAULT 'building';
ALTER TABLE finance_estimates ADD COLUMN branch_code TEXT;
ALTER TABLE finance_estimates ADD COLUMN allocation_base TEXT DEFAULT 'area';
ALTER TABLE finance_estimate_items ADD COLUMN building_id TEXT;

-- Дома, входящие в смету ЖК, со снимком жилой площади каждого.
CREATE TABLE IF NOT EXISTS finance_estimate_buildings (
  id TEXT PRIMARY KEY,
  estimate_id TEXT NOT NULL,
  building_id TEXT NOT NULL,
  residential_area REAL DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  tenant_id TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_estimate_buildings_est ON finance_estimate_buildings(estimate_id, tenant_id);
