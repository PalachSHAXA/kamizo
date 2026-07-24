-- Sprint 7: Пени за просрочку оплаты коммунальных услуг.
--
-- Правовое основание: ПКМ №930 от 15.09.2015 «Об утверждении порядка расчёта
-- и оплаты за жилищно-коммунальные услуги» + гл.29 ГК РУз (неустойка).
-- Размер пени по решению собрания жильцов (типично 0.1% / день), но не
-- более 100% от суммы основного долга. Начисляется при просрочке > 30
-- дней от due_date.
--
-- Модель: одна строка = один снимок за (charge_id, calculated_at::date).
-- Идемпотентно — на повторный прогон cron за тот же день не дублируется.

CREATE TABLE IF NOT EXISTS finance_penalties (
  id TEXT PRIMARY KEY,
  charge_id TEXT NOT NULL,
  apartment_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT '',

  principal_amount REAL NOT NULL,   -- основной долг на момент расчёта (amount − paid_amount)
  penalty_rate REAL NOT NULL,       -- дневная ставка (0.001 = 0.1%/день)
  days_overdue INTEGER NOT NULL,    -- дней просрочки с due_date до calculated_at
  penalty_amount REAL NOT NULL,     -- итог: principal × rate × days, capped at principal

  status TEXT DEFAULT 'accrued' CHECK (status IN ('accrued','paid','waived','cancelled')),
  paid_amount REAL DEFAULT 0,

  calculated_at TEXT DEFAULT (datetime('now')),
  waived_by TEXT,
  waived_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_penalties_charge     ON finance_penalties(charge_id);
CREATE INDEX IF NOT EXISTS idx_penalties_apt        ON finance_penalties(apartment_id);
CREATE INDEX IF NOT EXISTS idx_penalties_tenant     ON finance_penalties(tenant_id);
CREATE INDEX IF NOT EXISTS idx_penalties_status     ON finance_penalties(status);
-- UNIQUE (charge_id, date(calculated_at)) невозможен на выражение в старом
-- SQLite — идемпотентность контролируем в коде: SELECT ... WHERE date(calculated_at) = date('now').

------------------------------------------------------------
-- Настройки пени на уровне тенанта (или дома, если нужно).
-- Пока храним default на tenant, дом-специфичные значения — в будущем.
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS finance_penalty_settings (
  tenant_id TEXT PRIMARY KEY,
  enabled INTEGER DEFAULT 0,
  daily_rate REAL DEFAULT 0.001,          -- 0.1% / день
  grace_days INTEGER DEFAULT 30,          -- пени начинают капать с due_date + grace_days
  max_multiplier REAL DEFAULT 1.0,        -- потолок = principal × 1.0
  updated_by TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);
