-- 082 — Формула-поля для finance_estimate_items (документирование
-- происхождения суммы).
--
-- PR-3 из docs/smeta-architecture-proposal.md блок B. Даёт возможность
-- менеджеру записать «144 м² × 1 000 000 сум × 1 раз/мес = 144 000 000/мес»
-- прямо в статье расхода — источник цены и разбивку. Полезно:
--   1) в PDF показать разбивку («144 м² × 1 000 000») мелким текстом
--      под суммой — для прозрачности перед собственниками
--   2) для будущего compliance-warning (Часть 9 ТЗ): если
--      quantity × unit_price × frequency ≠ monthly с расхождением >1%,
--      подсветить как подозрительное. НЕ реализуется в этом PR — только
--      TODO-помётка в бэке.
--
-- Все поля nullable. Расчёт amount/monthly НЕ меняется — новые поля
-- документируют, не заменяют. Backend не пересчитывает monthly по
-- формуле, чтобы не ломать ретро-совместимость. Формула-поля —
-- дополнительная информация.
--
-- Существующие 17 items baseline myhelper и все другие prod-записи
-- получают все 6 полей = NULL → PDF рендерится идентично до этой
-- миграции (никакой разбивки не выводится).

-- Осторожно: в таблице УЖЕ есть колонка `unit` из миграции 057
-- (CHECK ('flat','per_sqm','per_apt','per_meter','staff_computed') — это
-- calc-unit, задаёт способ подсчёта, не единицу измерения). Чтобы
-- не конфликтовать с существующим полем, единицу измерения человеку
-- (например 'м²', 'шт', 'услуга') храним в отдельной колонке `qty_unit`.

ALTER TABLE finance_estimate_items ADD COLUMN quantity            NUMERIC;
ALTER TABLE finance_estimate_items ADD COLUMN qty_unit            TEXT;      -- 'м²', 'шт', 'услуга' — display unit; не путать с существующей 'unit' (enum calc-unit).
ALTER TABLE finance_estimate_items ADD COLUMN unit_price          NUMERIC;
ALTER TABLE finance_estimate_items ADD COLUMN frequency_per_month NUMERIC;   -- 1 = ежемесячно, 0.5 = раз в 2 мес, 0.0833 = раз в год (1/12), 4.33 = еженедельно (52/12)
ALTER TABLE finance_estimate_items ADD COLUMN source_price_ref    TEXT;      -- '№ договора', 'прайс-лист поставщика X', 'приказ №01/2-4'
ALTER TABLE finance_estimate_items ADD COLUMN formula_notes       TEXT;      -- свободный комментарий если формула нестандартная
