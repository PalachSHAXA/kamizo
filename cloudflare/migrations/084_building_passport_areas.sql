-- 084 — Дополнительные площади для паспорта МКД (PR-6 блок A).
--
-- Из 9 полей, запрошенных в plan'е PR-6, УЖЕ ЕСТЬ в таблице buildings:
--   - entrances_count      (эквив. entrance_count)
--   - floors               (эквив. floor_count)
--   - elevator_count
--   - land_area            (эквив. territory_area — площадь земельного участка)
--   - year_built
--   - heating_type
--   - parking_spaces       (число мест — но не площадь!)
--   - has_parking_lot      (флаг)
--
-- Добавляем только НЕДОСТАЮЩИЕ 3 поля:
--   - parking_area          — площадь парковки (м²), отдельно от кол-ва мест
--   - basement_area         — площадь подвала (м²)
--   - technical_rooms_area  — суммарная площадь техпомещений (щитовая,
--                             колясочная, венткамеры, лифтовая машинная и т.п.)
--
-- Все NUMERIC nullable. Существующие 200+ зданий получают эти поля =
-- NULL → PDF не показывает секцию «расширенный паспорт» (см. helper
-- на фронте). baseline myhelper 2026-08 остаётся с идентичным PDF.
--
-- Форма редактирования дома (PATCH /api/buildings/:id) уже принимает
-- unknown-fields через field-mapping; добавим 3 маппинга в
-- buildings-edit.ts (camelCase + snake_case).

ALTER TABLE buildings ADD COLUMN parking_area         NUMERIC;
ALTER TABLE buildings ADD COLUMN basement_area        NUMERIC;
ALTER TABLE buildings ADD COLUMN technical_rooms_area NUMERIC;
