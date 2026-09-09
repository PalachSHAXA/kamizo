-- 080 — Справочник действующих ставок (LegalRule) с временной валидностью.
--
-- PR-1 из docs/smeta-architecture-proposal.md блок D. Заменяет статичную
-- константу DEFAULT_PAYROLL_TAX_RATE (P5 фикс в lib/estimate/constants.ts)
-- на data-driven правило с датой действия. Даёт возможность:
--   1) документировать legal_basis (норму НПА, URL) для каждой ставки
--   2) хранить историю ставок (эффективная дата начала/окончания)
--   3) единый источник истины для UI (при создании новой сметы дефолт
--      приходит через API вместо хардкода на клиенте)
--
-- Скоуп PR-1: только backend + сид одной записи для текущей действующей
-- ставки. UI-часть (замена useState в EstimateV2WizardPage) — отдельный PR.
--
-- Обратная совместимость: пустая таблица = система работает как раньше
-- (fallback на DEFAULT_PAYROLL_TAX_RATE в JS). Существующие сметы читают
-- своё поле payroll_tax_rate (immutable snapshot), никогда не смотрят
-- в legal_rates ретроспективно.

CREATE TABLE IF NOT EXISTS legal_rates (
  id             TEXT PRIMARY KEY,
  rate_type      TEXT NOT NULL,        -- 'payroll_tax', 'vat', 'ndfl', 'social_tax', 'inps', ...
  rate_value     NUMERIC NOT NULL,     -- 0.24 = 24% (доля), 1513 = сум/м² (min tariff)
  effective_from TEXT NOT NULL,        -- ISO 'YYYY-MM-DD', включительно
  effective_to   TEXT,                 -- ISO 'YYYY-MM-DD', включительно; NULL = бессрочно
  legal_basis    TEXT NOT NULL,        -- 'НК РУз ст.379 + ст.406', 'ЗРУ-581 ст.16', ...
  source_url     TEXT,                 -- ссылка на lex.uz или подтверждающий источник
  created_at     TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_legal_rates_lookup
  ON legal_rates(rate_type, effective_from, effective_to);

-- Сид: действующая ставка налога на ФОТ для небюджетной УК = 24%.
-- = 12% НДФЛ (у работника, налоговый агент — работодатель) + 12% социальный
-- налог (у работодателя, небюджетный сектор). ИНПС 0.1% вычитается ВНУТРИ
-- 12% НДФЛ и суммарную нагрузку не увеличивает.
--
-- effective_from = 2026-09-09 (дата этой миграции) — начинаем с текущего
-- состояния, историю глубже не заводим (это будет отдельный сид, когда
-- юрист подтвердит перечень исторических изменений).
INSERT OR IGNORE INTO legal_rates
  (id, rate_type, rate_value, effective_from, effective_to, legal_basis, source_url)
VALUES (
  'lr-payroll-tax-2026-09-09',
  'payroll_tax',
  0.24,
  '2026-09-09',
  NULL,
  'НК РУз: НДФЛ 12% (ст.379) + Социальный налог 12% для небюджетных работодателей (ст.406). Актуально на 2026-01-01, подтверждено на 2026-09-09.',
  'https://www.spot.uz/ru/2025/11/26/taxes-for-2026/'
);
