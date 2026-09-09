-- 083 — Revenue sources для сметы (детализация доходов).
--
-- PR-5 из docs/smeta-architecture-proposal.md блок G. Даёт возможность
-- завести отдельные записи по каждому источнику дохода:
--   - тип (commercial / parking / basement / telecom / advertising /
--          common_property_rent / other)
--   - описание («Аренда 3 этажа под кофейню Coca-Cola»)
--   - amount (месячная сумма)
--   - contract_ref (№ договора для отчётности)
--   - period (если разовый — «Q3 2026»)
--   - legal_classification=1 → это доход от общего имущества, который
--     по правильной формуле тарифа должен уменьшить потребность
--     собственников до деления на площадь. Формула тарифа НЕ трогается
--     в этом PR (Часть 5 ТЗ, отдельно) — только флаг сохраняется.
--
-- Legacy commercial_income / basement_income / parking_income / telecom_income
-- в finance_estimates остаются НЕТРОНУТЫМИ. finance_estimate_items (kind='income')
-- тоже не трогается. Новая таблица — третий, опциональный источник.
-- Backend суммирует все три при подсчёте итогового дохода (без dedup —
-- миграция данных из commercial → revenue_sources это отдельное решение).
--
-- Обратная совместимость: baseline myhelper 2026-08 и все другие
-- prod-записи не имеют строк в revenue_sources → PDF рендерится идентично.

CREATE TABLE IF NOT EXISTS revenue_sources (
  id                   TEXT PRIMARY KEY,
  tenant_id            TEXT NOT NULL DEFAULT '',
  estimate_id          TEXT NOT NULL REFERENCES finance_estimates(id),
  source_type          TEXT NOT NULL CHECK (source_type IN (
                         'commercial',            -- аренда коммерческих помещений
                         'parking',               -- парковка
                         'basement',              -- аренда подвалов
                         'telecom',               -- аренда крыши/шахт операторам связи
                         'advertising',           -- реклама (баннеры, стены)
                         'common_property_rent',  -- прочая аренда общего имущества (МОП)
                         'other'
                       )),
  description          TEXT,                     -- «Аренда 3 этажа под кофейню X»
  amount               NUMERIC NOT NULL,         -- сумма/мес
  contract_ref         TEXT,                     -- «№ договора КМ-2026-42»
  period               TEXT,                     -- «Q3 2026», null = ежемесячно
  legal_classification INTEGER NOT NULL DEFAULT 0, -- 1 = общее имущество (снижает тариф)
  sort_order           INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_revenue_sources_estimate ON revenue_sources(estimate_id);
CREATE INDEX IF NOT EXISTS idx_revenue_sources_tenant   ON revenue_sources(tenant_id);
