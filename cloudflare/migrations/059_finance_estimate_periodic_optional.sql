-- Фаза 1: периодические расходы сметы применяются не всегда.
-- periodic_enabled=1 (по умолчанию) — периодика входит в тариф;
-- 0 — статьи section='periodic' исключаются из total_expenses и тарифа.
-- SQLite: без IF NOT EXISTS на ADD COLUMN.
ALTER TABLE finance_estimates ADD COLUMN periodic_enabled INTEGER DEFAULT 1;
