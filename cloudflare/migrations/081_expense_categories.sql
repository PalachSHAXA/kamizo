-- 081 — Справочник категорий расходов сметы (глобальный).
--
-- PR-2 из docs/smeta-architecture-proposal.md блок F. Даёт возможность:
--   1) группировать статьи расходов в PDF по expense_type
--      (Производственные / Управленческие / Текущий ремонт / Капремонт / Прочие)
--   2) отмечать обязательные для содержания статьи (is_mandatory)
--      — заменяет hardcoded-чек-лист из lib/estimate/legal-constants.ts
--   3) давать двуязычные названия (name_ru / name_uz) единым справочником,
--      не размазывая по коду
--
-- Скоуп PR-2: только seed 16 категорий, соответствующих статьям в baseline-
-- смете myhelper 2026-08. Backend: LEFT JOIN в SELECT-е items возвращает
-- expense_type. Frontend: PDF группирует по expense_type когда типов ≥2,
-- иначе рендерит плоско (baseline-совместимость).
--
-- НЕ мигрирует данные baseline-сметы — все существующие
-- finance_estimate_items остаются с category_id=NULL (frontend
-- fallback'ит на 'production' → рендер идентичен текущему PDF).

CREATE TABLE IF NOT EXISTS expense_categories (
  id             TEXT PRIMARY KEY,
  code           TEXT UNIQUE NOT NULL,           -- machine-readable ключ ('electricity_common')
  name_ru        TEXT NOT NULL,
  name_uz        TEXT NOT NULL,
  expense_type   TEXT NOT NULL CHECK (expense_type IN (
                   'production',      -- регулярное содержание (эксплуатационные расходы)
                   'management',      -- управленческие расходы УК (админ.персонал, офис, IT)
                   'current_repair',  -- текущий ремонт (кровля, фасады, ЛП)
                   'capital_repair',  -- капитальный ремонт (в отдельный фонд, см. блок E)
                   'other'
                 )),
  is_mandatory   INTEGER NOT NULL DEFAULT 0,     -- обязательная категория (для валидатора)
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_expense_categories_type ON expense_categories(expense_type);

-- FK на items (nullable — существующие items остаются NULL).
-- REFERENCES документирует связь; SQLite не enforce'ит FK без PRAGMA
-- foreign_keys=ON, но правило хранится в схеме.
ALTER TABLE finance_estimate_items ADD COLUMN category_id TEXT REFERENCES expense_categories(id);
CREATE INDEX IF NOT EXISTS idx_finance_estimate_items_category ON finance_estimate_items(category_id);

-- ────────────────────────────────────────────────────────────────
-- Seed: 16 категорий, соответствующих статьям baseline myhelper 2026-08.
-- Основа: legal_code'ы из lib/estimate/legal-constants.ts (15 услуг из
-- чек-листа) + wage-строка «Ish haqi (FOT + soliq)».
--
-- expense_type — предложение автора PR (см. отчёт в git-message). Может
-- быть скорректировано после ревью — категории редактируются напрямую
-- в таблице.
--
-- is_mandatory=1 — категории из чек-листа 15 обязательных услуг (те же,
-- что MISSING_MANDATORY_SERVICE-валидатор в lib/estimate/validators.ts).
-- ────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO expense_categories
  (id, code, name_ru, name_uz, expense_type, is_mandatory, sort_order)
VALUES
  -- Производственные (регулярное содержание)
  ('ec-elec-common',     'electricity_common',            'Электроснабжение МОП',              'Umumiy joylar elektri',           'production',     1,  1),
  ('ec-basement-shafts', 'basement_shaft_networks',       'Сети подвала/шахты',                 'Yerto''la/shaxta tarmoqlari',      'production',     1,  2),
  ('ec-stairwell-clean', 'stairwell_lift_cleaning_weekly','Уборка подъездов/лифтов (≥1/нед)',   'Podyezd/lift tozalash',           'production',     1,  3),
  ('ec-territory',       'territory_cleaning',            'Уборка территории',                  'Hudud tozaligi',                  'production',     1,  4),
  ('ec-sanitation',      'sanitation_disinfection',       'Санитария и дезинфекция',            'Sanitariya va dezinfektsiya',     'production',     1,  5),
  ('ec-fire-safety',     'fire_safety',                   'Пожарная безопасность',              'Yong''in xavfsizligi',            'production',     1,  6),
  ('ec-heating-prep',    'heating_season_prep',           'Подготовка к отопительному сезону',  'Isitish mavsumiga tayyorgarlik',  'production',     1,  7),
  ('ec-greenery',        'greenery',                      'Озеленение',                         'Ko''kalamzorlashtirish',          'production',     0,  8),
  ('ec-playgrounds',     'playgrounds',                   'Детские площадки',                   'Bolalar maydonchalari',           'production',     0,  9),
  ('ec-paths-parking',   'paths_parking',                 'Дорожки и парковка',                 'Yo''laklar va avtoturargoh',      'production',     0, 10),
  ('ec-cctv-intercom',   'cctv_intercom_dispatch',        'Видеонаблюдение/домофон',            'Videokuzatuv/domofon',            'production',     0, 11),
  ('ec-payroll-wages',   'payroll_wages',                 'Зарплата (ФОТ + налог)',             'Ish haqi (FOT + soliq)',          'production',     1, 12),
  ('ec-gutters',         'gutters',                       'Водостоки',                          'Suv oqizgichlar',                 'production',     1, 13),

  -- Текущий ремонт (периодические работы, срок жизни компонента)
  ('ec-facades',         'facades',                       'Фасады',                             'Fasadlar',                        'current_repair', 0, 14),
  ('ec-entrances',       'entrances',                     'Подъезды',                           'Podyezdlar',                      'current_repair', 0, 15),
  ('ec-roof-wp',         'roof_waterproofing',            'Гидроизоляция кровли',               'Tom gidroizolyatsiyasi',          'current_repair', 0, 16);

-- Заметка: в baseline myhelper 2026-08 нет статей типа 'management'
-- (управленческие расходы УК) и 'capital_repair' (фонд капремонта).
-- Их можно добавить в справочник в отдельной миграции, когда УК заведут
-- такие статьи. Enum expense_type уже поддерживает эти значения.
