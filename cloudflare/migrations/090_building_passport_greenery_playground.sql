-- 090 — Три дополнительных поля паспорта МКД (PR-11).
--
-- Тот же паттерн, что миграция 084 (parking_area/basement_area/technical_rooms_area).
-- У некоторых домов есть озеленение / детская / спортивная площадка — эти
-- площади нужны для документов, а место для них в текущей схеме отсутствует.
--
-- Добавляем 3 новых nullable NUMERIC поля:
--   - trees_area          — площадь озеленения/деревьев (м²)
--   - playground_area     — площадь детской площадки (м²)
--   - sports_ground_area  — площадь спортивной площадки (м²)
--
-- Все NUMERIC nullable. Существующие 200+ зданий получают эти поля =
-- NULL → PDF паспорта МКД не показывает соответствующие строки, а если
-- ВСЕ 6 полей (parking/basement/tech + trees/playground/sports) = NULL,
-- то и вся секция «Паспорт МКД» не рендерится → baseline myhelper
-- 2026-08 остаётся с байт-идентичным PDF.
--
-- Форма редактирования дома (PATCH /api/buildings/:id) уже принимает
-- unknown-fields через field-mapping; добавим 3 маппинга в
-- buildings-edit.ts (camelCase + snake_case).

ALTER TABLE buildings ADD COLUMN trees_area         NUMERIC;
ALTER TABLE buildings ADD COLUMN playground_area    NUMERIC;
ALTER TABLE buildings ADD COLUMN sports_ground_area NUMERIC;
