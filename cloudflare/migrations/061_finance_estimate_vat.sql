-- Фаза 4: НДС. Если УК — плательщик НДС, на тариф жителю начисляется
-- исходящий НДС (ставка РУз 12%). vat_enabled=0 по умолчанию (обратная
-- совместимость: существующие сметы без НДС). SQLite: два отдельных ALTER.
ALTER TABLE finance_estimates ADD COLUMN vat_enabled INTEGER DEFAULT 0;
ALTER TABLE finance_estimates ADD COLUMN vat_rate REAL DEFAULT 0.12;
