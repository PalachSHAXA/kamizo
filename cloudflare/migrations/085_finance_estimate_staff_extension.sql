-- 085 — Расширение finance_estimate_staff (PR-7 блок C).
--
-- Что уже есть в таблице (миграции 057 + 060):
--   id / estimate_id / title / units / salary / monthly / vacation_days /
--   sort_order / tenant_id / created_at
--
-- Добавляем 8 новых nullable-полей для документирования состава ФОТ:
--
-- 1. employment_type      TEXT — вид занятости, enum-подобное
--                          ('full_time'/'part_time'/'contract'). Не влияет
--                          на расчёт ФОТ, только для отчёта и планирования.
-- 2. employment_share    NUMERIC — доля ставки на человека (0.5=полставки,
--                          1.0=полная). Семантически отличается от units:
--                          units — «сколько единиц позиции» (2 дворника),
--                          employment_share — «на какую долю ставки каждый
--                          из них». Расчёт monthly не меняется — эта
--                          детализация только для отчёта.
-- 3. employer_contributions NUMERIC — начисления работодателя СВЕРХ
--                          payroll_tax_rate сметы (например, добровольные
--                          ДМС, страховки, доп. пенсионные). НЕ подпадают
--                          под 24% ФОТ-налог. По умолчанию 0 — как раньше.
--                          Разница с существующим payroll_tax_rate:
--                          последний — обязательные налоги, единая ставка
--                          на весь ФОТ; employer_contributions — доп.
--                          выплаты работодателя per-position.
-- 4. additional_payments NUMERIC — премии/доплаты (не оклад, но входит
--                          в ФОТ и облагается payroll_tax_rate). Опционально.
-- 5. period_start        TEXT (ISO date) — с какого числа сотрудник в этой
--                          смете (для сезонных / временных позиций).
-- 6. period_end          TEXT (ISO date) — по какое включительно.
-- 7. building_id         TEXT — привязка к конкретному дому если сотрудник
--                          закреплён не за всей УК. NULL = общий на весь
--                          scope сметы.
-- 8. staff_category      TEXT — 'admin' / 'production'. Пока не влияет на
--                          PDF-группировку (см. expense_categories из
--                          миграции 081 — та даёт группировку по expense_type
--                          в целом; эта — прото-разделение ФОТ на management
--                          vs production, для будущего PR).
--
-- Никаких CHECK constraints не добавляем — SQLite не изменяет CHECK через
-- ALTER, и валидировать enum'ы будем на бэке. Расчёт compute.ts НЕ ЗНАЕТ
-- об этих полях — они только для отчёта/UI. FOT_base/FOT_gross/FOT_total
-- по-прежнему = units × salary × payroll_tax_rate. Baseline инвариант
-- SHA256 сохранён: PDF не рендерит таблицу штата (только суммарный ФОТ
-- в KPI-блоке).

ALTER TABLE finance_estimate_staff ADD COLUMN employment_type       TEXT;
ALTER TABLE finance_estimate_staff ADD COLUMN employment_share      NUMERIC;
ALTER TABLE finance_estimate_staff ADD COLUMN employer_contributions NUMERIC;
ALTER TABLE finance_estimate_staff ADD COLUMN additional_payments   NUMERIC;
ALTER TABLE finance_estimate_staff ADD COLUMN period_start          TEXT;
ALTER TABLE finance_estimate_staff ADD COLUMN period_end            TEXT;
ALTER TABLE finance_estimate_staff ADD COLUMN building_id           TEXT;
ALTER TABLE finance_estimate_staff ADD COLUMN staff_category        TEXT;

CREATE INDEX IF NOT EXISTS idx_fes_building ON finance_estimate_staff(building_id);
