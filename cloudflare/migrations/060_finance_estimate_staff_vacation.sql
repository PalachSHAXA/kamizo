-- Фаза 2: отпускные на позицию штата. vacation_days — дней ежегодного
-- отпуска (ТК РУз минимум 21). Резерв отпускных копится ежемесячно и входит
-- в ФОТ (облагается налогом на ФОТ). DEFAULT 0 — существующие строки не
-- меняются ретроспективно; новые позиции получают 21 из мастера.
-- SQLite: без IF NOT EXISTS на ADD COLUMN.
ALTER TABLE finance_estimate_staff ADD COLUMN vacation_days REAL DEFAULT 0;
