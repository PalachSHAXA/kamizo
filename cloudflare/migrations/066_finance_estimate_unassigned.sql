-- Смета-черновик без объекта.
--
-- Третье значение уже существующей колонки scope_level (миграция 063):
--   'building'   — смета на дом
--   'complex'    — смета на ЖК
--   'unassigned' — черновик, ещё не привязанный ни к какому объекту
--
-- Новых колонок не нужно: scope_level уже без CHECK, а building_id (NOT NULL)
-- у непривязанного черновика хранит пустую строку.
--
-- Такой черновик нельзя утвердить: квартир нет, начислять не на что, а пустой
-- building_id схлопнул бы все непривязанные черновики в проверке «одна активная
-- смета на дом». Запрет — unassignedNotApprovable() в routes/finance.ts.
-- Привязка к объекту — POST /api/finance/estimates/:id/attach-building,
-- строго один черновик на один объект.

CREATE INDEX IF NOT EXISTS idx_finance_estimates_scope
  ON finance_estimates(tenant_id, scope_level);
