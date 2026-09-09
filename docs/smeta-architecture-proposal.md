# Архитектурное предложение — расширение модели сметы Kamizo

Дата: 2026-09-09. Автор: Claude Opus 4.7 по итогам аудита в
[docs/smeta-audit.md](smeta-audit.md) + legal research в
[docs/uzbekistan-smeta-compliance.md](uzbekistan-smeta-compliance.md).

**Область**: расширение модели `finance_estimates` + связанных таблиц под
требования из блоков A-G изначального ТЗ. Только предложение — код не пишем.

**Принципы**:
1. **Не дублировать существующее**. Использовать `buildings`, `users`,
   `finance_estimate_items`, `finance_estimate_staff`, `apartments` там,
   где они уже покрывают потребность.
2. **Обратная совместимость**. Любая новая колонка — с `DEFAULT` (либо
   NULL, либо разумное значение), чтобы существующие записи (включая
   baseline myhelper 2026-08 `64c234fb…`) продолжали работать без
   миграции их данных.
3. **Дефолты — не источник истины**. Как уже сделано в P4/P5-фиксе
   (`lib/estimate/constants.ts` + `utils/estimateDefaults.ts`): дефолты
   для новых записей централизованы. Дальше — сделать их temporal
   (LegalRule c датой действия).

---

## A. Паспорт МКД

### Что уже есть в `buildings` (schema.sql:69-140)
Таблица уже жирная — ~50 полей. Покрыто:
- Идентификация: `id, name, address, cadastral_number, branch_code, building_number, branch_id`
- Техника: `floors, entrances_count, apartments_count, total_area, living_area, common_area, land_area, year_built, year_renovated, building_type, roof_type, wall_material, foundation_type`
- Инженерия: `has_elevator, elevator_count, has_gas, heating_type, has_hot_water, water_supply_type, sewerage_type, has_intercom, has_video_surveillance, has_concierge, has_parking_lot, parking_spaces, has_playground`
- Управление: `manager_id, manager_name, management_start_date, contract_number, contract_end_date`
- Финансы: `monthly_budget, reserve_fund` (+ ещё)

### Чего не хватает (гипотезы по нормам)
Ждёт подтверждения по Положению №3398 (Word-версия), но по опыту и по ЗРУ-581:

| Поле | Тип | Зачем |
|---|---|---|
| `commercial_area` | REAL | Площадь нежилых/коммерческих помещений (сейчас есть только `total_area, living_area, common_area, land_area`; между ними нет специфической нежилой части, а расчёт commercial_income с площади может понадобиться) |
| `basement_area` | REAL | Площадь подвалов (доход от аренды подвала — отдельная строка, но нет привязки к m²) |
| `stairwell_count` | INTEGER | Кол-во лестничных клеток (не то же самое, что entrances) — для расчёта уборки |
| `heating_area` | REAL | Отапливаемая площадь (может отличаться от `total_area` — для расчёта теплопотерь при подготовке к сезону) |
| `bin_area` | REAL | Площадь мусорных площадок (для тарифа мусоровывоза, если считается с m²) |
| `technical_pass_number` | TEXT | Номер техпаспорта МКД (для футера сметы, юридической ссылки) |
| `commissioning_act_number` | TEXT | Номер акта ввода в эксплуатацию |
| `has_gas_shutoff_valve` | INTEGER | Условная услуга «Проверка вентилей газоснабжения» — legal_code'ы в чек-листе 16 услуг это требуют |
| `has_water_meter_common` | INTEGER | Наличие общедомового счётчика воды (условная услуга «Поверка счётчиков МОП») |

**Ничего не критично** — можно `ALTER TABLE ADD COLUMN` (по одной, безopasно).

### Обратная совместимость
Все новые поля — `NULL DEFAULT NULL`. Существующие 200+ зданий продолжат
работать (валидаторы будут пропускать проверки, для которых нужны новые
поля, вместо того чтобы падать).

---

## B. Планируемые работы и услуги — формула `quantity × unit_price × frequency`

### Что есть сейчас (`finance_estimate_items` + migration 057)
```
name TEXT, category TEXT (default 'maintenance'), amount REAL, monthly_amount REAL,
kind TEXT ('expense'/'income'), section TEXT ('production'/'periodic'),
unit TEXT ('flat'/'per_sqm'/'per_apt'/'per_meter'/'staff_computed'),
linked_to_staff INTEGER, legal_code TEXT, building_id TEXT
```
Из этого следует: `unit` уже задаёт способ расчёта (per_sqm ≈ quantity ×
unit_price). Но конкретных полей `quantity`, `unit_price`, `frequency`,
`source_price_ref` нет — итог хранится сразу в `amount/monthly_amount`.

### Предложение — расширение той же таблицы
Добавить колонки (все `NULL DEFAULT NULL` — не ломает существующие):
```
quantity           REAL        -- напр. 12 (штук уборок в месяц, кв.м, штук лифтов)
unit_price         REAL        -- цена за единицу (сум за одну уборку, за м², за лифт)
frequency_per_month REAL       -- сколько раз в месяц (для periodic: <1)
source_price_ref   TEXT        -- 'договор №123', 'приказ №01/2-4', 'коммерческое предложение поставщика', 'самостоятельно рассчитано'
expense_type       TEXT CHECK (expense_type IN
                     ('mandatory_maintenance',   -- обязательное содержание (ст.16 ЗРУ-581)
                      'current_repair',          -- текущий ремонт
                      'capital_repair',          -- капитальный ремонт (см. блок E)
                      'management',              -- управленческие расходы УК (см. блок F)
                      'utilities_common'))       -- коммунальные услуги МОП
formula_notes      TEXT        -- свободный текст: 'уборка 4× в месяц × 5 подъездов × 45 000 сум'
```

`amount = quantity × unit_price × frequency_per_month × 12` (годовой).
Backend вычисляет и кэширует `monthly_amount, amount` — так же, как сейчас,
но с возможностью рендерить формульную строку в PDF (см. P3 в audit).

### Обратная совместимость
- Существующие записи имеют `quantity=NULL, unit_price=NULL,
  frequency_per_month=NULL` — рендерятся как сейчас (только `amount` или
  «свободная сумма»).
- UI визарда даёт выбор: «свободная сумма» (легаси) или «формула»
  (новое). При «формуле» — вычисляет и заполняет `amount`.
- Валидатор проверяет: если `expense_type='capital_repair'`, строка должна
  попадать в фонд капремонта (блок E), а не в тариф жителей.

**НУЖНА** новая справочная таблица `expense_categories` (см. блок F).

---

## C. Персонал — расширение штата сметы

### Что есть сейчас
- `finance_estimate_staff` (migration 057): `title, units, salary, monthly, sort_order` — плановый штат В СМЕТЕ.
- `users` (schema.sql:4-45): реальные пользователи с ролями (включая `executor, employee, dispatcher`), с полем `building_id` (уже привязка к МКД).

### Ключевой вопрос
Смета — **план** (нужно N позиций дворника на средний оклад X). Users —
**факт** (эти конкретные Иван, Пётр). Связывать один-в-один преждевременно
(и планово не соответствует реалу — 0.5 позиции ≠ полсотрудника).

### Предложение — расширить `finance_estimate_staff`
```
employment_ratio       REAL DEFAULT 1.0         -- ставка занятости (0.5 = полставки)
vacation_days          INTEGER DEFAULT 21       -- уже используется в compute.ts, но не в БД (сейчас в input, не хранится)
work_days_per_month    INTEGER DEFAULT 21       -- аналогично
employer_extras        REAL DEFAULT 0           -- надбавки работодателя сверх оклада (не облагаемые ФОТ-налогом — премии, отпускные, компенсации)
department_head_flag   INTEGER DEFAULT 0        -- признак «отдельная строка ФОТ по административному персоналу» (для блока F)
building_id            TEXT                     -- привязка к конкретному МКД (для complex-смет; NULL = общий на ЖК)
notes                  TEXT
```

**НЕ связываем** `finance_estimate_staff.user_id → users.id` в этом PR.
Разные модели: план vs. факт. Свяжем позже отдельным блоком через
`payroll_actual` таблицу.

### Обратная совместимость
Все новые поля с DEFAULT'ами. Существующий штат работает как раньше
(vacation_days=21 совпадает с текущим захардкоженным в compute.ts).

---

## D. Начисления на ФОТ — LegalRule с датами действия

### Проблема
Мы только что зафиксировали `DEFAULT_PAYROLL_TAX_RATE = 0.24` в P5
(`cloudflare/src/lib/estimate/constants.ts`). Это работает, но:
- Одна константа на весь код. Если ставка изменится законом с 2027-01-01,
  старые сметы 2026 должны рассчитываться по 24%, новые — по новой ставке.
- Сейчас на смете хранится `payroll_tax_rate REAL DEFAULT 0.24` полем —
  это правильно (per-estimate, immutable snapshot). Но UI-дефолт при
  создании новой сметы должен приходить не из константы, а из
  «действующего на дату сметы правила».

### Предложение — новая таблица `legal_rates`
```
CREATE TABLE legal_rates (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,          -- или NULL для глобальных (общие для всех тенантов)
  rule_type         TEXT NOT NULL CHECK (rule_type IN (
                       'payroll_tax_ndfl',   -- НДФЛ 12%
                       'payroll_tax_social', -- Соцналог 12% / 25%
                       'payroll_tax_inps',   -- ИНПС 0.1%
                       'vat',                -- НДС 12%
                       'uk_profit_ceiling',  -- потолок рентабельности УК (когда подтвердится юристом)
                       'min_tariff_by_floors' -- ташкентский минимум по этажности (сейчас в legal-constants.ts)
                     )),
  key_qualifier     TEXT,                   -- напр. 'floors=5-9' для min_tariff, 'budget' vs 'commercial' для соцналога
  rate_value        REAL NOT NULL,          -- 0.12, 0.24, 1513, ...
  unit              TEXT NOT NULL CHECK (unit IN ('fraction', 'percent', 'sum_per_m2', 'sum')),
  effective_from    TEXT NOT NULL,          -- ISO дата, включительно
  effective_to      TEXT,                   -- ISO дата, невключительно. NULL = бессрочно
  legal_basis       TEXT NOT NULL,          -- 'НК РУз ст.245', 'Положение №3501', 'ЗРУ-581 ст.16'
  source_url        TEXT,                   -- ссылка на lex.uz
  note              TEXT,
  created_by        TEXT REFERENCES users(id),
  created_at        TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_legal_rates_lookup ON legal_rates(rule_type, effective_from, effective_to);
CREATE INDEX idx_legal_rates_tenant ON legal_rates(tenant_id);
```

Функция-lookup в бэке:
```ts
getRateAt(rule_type: string, at_date: Date, qualifier?: string): number
```
- ищет самое свежее правило по `rule_type` с `effective_from <= at_date` и
  (`effective_to` NULL или `effective_to > at_date`)
- если найдено — возвращает `rate_value`
- если не найдено — fallback на текущую константу из `constants.ts`

### Как заменяет P5
- `constants.ts` остаётся с `DEFAULT_PAYROLL_TAX_RATE = 0.24` — но только
  как fallback последней инстанции (для тестов, для локалки без
  засеянных `legal_rates`).
- В UI визарда — при выборе периода сметы (`period = '2026-08'`) идёт
  запрос `/api/legal-rates?type=payroll_tax_social&at=2026-08-01` →
  получаем 0.12 (соцналог) + 0.12 (НДФЛ) = 0.24. Дефолт — из ответа
  API, а не из константы.
- На саму смету значение по-прежнему кэшируется полем
  `payroll_tax_rate` (immutable snapshot), чтобы retro-расчёт по старой
  смете не менялся при обновлении справочника.

### Обратная совместимость
- Существующие сметы читают `payroll_tax_rate` полем — legal_rates не
  переопределяет.
- Пустая таблица `legal_rates` = система работает по константам из
  `constants.ts`. Постепенно заполняем.
- Bootstrap: seed-миграция с 3 записями (НДФЛ 12%, соцналог 12%, ИНПС 0.1%
  с `effective_from='2020-01-01'`, `effective_to=NULL`), ссылки на
  spot.uz/bss.uz из `docs/uzbekistan-smeta-compliance.md`.

---

## E. Капремонт и накопительный фонд

### Проблема
В текущей архитектуре нет специальной обработки капитального ремонта. Все
строки расходов идут одним пулом. По ПКМ №3/2022 капремонт может быть
отдельной строкой, по ПП-5152 — со-финансируется бюджетом с 2023.
Регулярный сбор в фонд «на будущее» (не потраченный в этом году)
логически другого рода — это не расход текущего периода, а накопление.

### Предложение — две сущности

**1. Отдельная категория `capital_repair` в `finance_estimate_items.expense_type`**
(см. блок B). Позволяет пометить конкретные строки как капремонт.

**2. Новая таблица `capital_repair_funds`** (per building, накопительный):
```
CREATE TABLE capital_repair_funds (
  id                    TEXT PRIMARY KEY,
  tenant_id             TEXT NOT NULL,
  building_id           TEXT NOT NULL REFERENCES buildings(id),
  opened_date           TEXT NOT NULL,      -- когда фонд начал накапливаться
  contribution_per_m2   REAL NOT NULL,      -- ежемесячный взнос с м² (по решению ОС)
  budget_subsidy_rate   REAL DEFAULT 0,     -- доля бюджетного со-финансирования (ПП-5152)
  balance_sum           REAL DEFAULT 0,     -- текущий остаток (кэшируется)
  bank_account          TEXT,
  approval_meeting_id   TEXT REFERENCES meetings(id),  -- на каком ОС утверждено (см. блок H ниже)
  created_at            TEXT DEFAULT (datetime('now'))
);

CREATE TABLE capital_repair_transactions (
  id                    TEXT PRIMARY KEY,
  fund_id               TEXT NOT NULL REFERENCES capital_repair_funds(id),
  period                TEXT NOT NULL,       -- '2026-08'
  kind                  TEXT CHECK (kind IN ('contribution','expense','subsidy','refund')),
  amount                REAL NOT NULL,
  work_description      TEXT,                -- для expense: что ремонтировали
  contractor            TEXT,
  document_ref          TEXT,                -- № договора/акта
  legal_basis           TEXT,                -- 'решение ОС от 2026-03-15 п.2'
  created_at            TEXT DEFAULT (datetime('now'))
);
```

Смета в PDF показывает **отдельный блок** «Капремонт»:
- Годовые поступления = `contribution_per_m2 × building.total_area × 12`
- Планируемые траты из капремонта в этом году (из `finance_estimate_items`
  с `expense_type='capital_repair'`)
- Остаток фонда на начало / конец периода
- Годовой прирост фонда (доход - расход)

**НЕ в тариф жителя** — идёт **отдельной строкой** платёжки. Житель видит:
«Содержание МКД: 10 555 сум/м². Взнос в фонд капремонта: 500 сум/м². Итого:
11 055 сум/м²». В `finance_charges` — отдельная строка `kind='capital_repair'`.

### Обратная совместимость
- Все существующие сметы: нет фонда → капремонт не выделяется, платёжки
  как сейчас.
- Пустая таблица `capital_repair_funds` = система работает без блока
  капремонта (существующее поведение).
- Новые сметы при создании визард спрашивает: «Есть ли фонд капремонта?»
  Если нет — не создаёт.

### Требует подтверждения юристом
- Обязателен ли отдельный фонд по РУз-законодательству? В открытых
  источниках прямой нормы не нашли (см. compliance-документ 2.4). Может
  быть на уровне ПКМ или регионального решения. **Если обязателен** —
  seed-миграция создаёт `capital_repair_funds` для всех существующих
  buildings автоматически (fallback `contribution_per_m2` из
  Положения №3398).

---

## F. Управленческие расходы — отдельная категория

### Проблема
Управленческие расходы УК (зарплата директора/бухгалтера, аренда офиса,
IT-услуги, банк) идут сейчас теми же строками как эксплуатационные (уборка,
электрика). Собственники законно могут спросить: «Сколько мы платим на
управление, отдельно от содержания?»

### Предложение
Использовать поле `expense_type` из блока B со значением `'management'`.

Дополнительно: справочник `expense_categories` (одна таблица на весь стек,
не per-tenant):
```
CREATE TABLE expense_categories (
  id                    TEXT PRIMARY KEY,     -- 'cleaning_stairwell', 'elevator_maintenance', 'director_salary'
  code                  TEXT UNIQUE NOT NULL, -- machine-readable, для legal_code в items
  name_ru               TEXT NOT NULL,
  name_uz               TEXT NOT NULL,
  expense_type          TEXT NOT NULL,       -- 'mandatory_maintenance', 'current_repair', 'capital_repair', 'management', 'utilities_common'
  mandatory             INTEGER DEFAULT 0,    -- обязательна ли эта строка в смете (для валидации чек-листа 16 услуг)
  conditional_on        TEXT,                 -- '{"has_elevator": true}' — JSON-условие когда применима
  legal_basis           TEXT,                 -- 'Положение №3398 п.4.2.1'
  default_unit          TEXT,
  frequency_hint        REAL,                 -- рекомендуемая частота
  created_at            TEXT DEFAULT (datetime('now'))
);
```

Плюс seed из 16-услуг legal-constants.ts (уже есть в коде, там `legal_code`
→ имя). Мигрировать в таблицу.

В PDF смета группируется по `expense_type`:
1. Обязательное содержание (mandatory_maintenance) — с чек-листом
2. Текущий ремонт (current_repair)
3. Управленческие (management) — **отдельный итог**
4. Коммунальные МОП (utilities_common)
5. [если фонд есть] Капремонт (capital_repair) — **отдельный блок**

Собственник видит: «Из тарифа 10 555 сум/м² на управление — 1 200 сум/м²
(11%)». Прозрачно.

### Обратная совместимость
- Существующие строки с `category='maintenance'` (default) → мигрируем в
  `expense_type='mandatory_maintenance'` (или через lookup по имени
  строки/legal_code).
- Если не удаётся автоматически определить `expense_type` — оставляем
  NULL, PDF показывает в блоке «Прочие» (fallback), UI-визард
  визуально не заставляет апгрейдить старые сметы, только новые.

---

## G. Доходы — расширение источников за пределы commercial

### Что есть сейчас (`finance_estimate_items` где `kind='income'`)
- Через engine (`compute.ts`): `IncomeStream.type` = `commercial | basement
  | parking | telecom | advertising | other`, `offset =
  BEFORE_PROFIT | AFTER_PROFIT`.

### Что не хватает
- **Источник дохода как таблица**, а не enum — чтобы менеджер завёл
  «Аренда стены под баннер компании Coca-Cola» и это была отдельная
  запись с контрагентом, договором, датой действия.
- **Периодичность разовых доходов** (например, штраф жителя за
  повреждение общего имущества — не месячный).
- **Юридическая классификация** — доход от общего имущества (снижает
  тариф по решению ОС) vs доход от услуг УК (не снижает) vs штрафы vs
  субсидии.

### Предложение — новая таблица `revenue_sources` (справочник) + расширение `finance_estimate_items` (для income)

```
CREATE TABLE revenue_sources (
  id                    TEXT PRIMARY KEY,
  tenant_id             TEXT NOT NULL,
  building_id           TEXT REFERENCES buildings(id),  -- NULL = все
  name                  TEXT NOT NULL,          -- 'Аренда 3 этажа под кофейню'
  income_type           TEXT NOT NULL CHECK (income_type IN (
                          'commercial_rent',      -- аренда коммерческих
                          'basement_rent',        -- аренда подвалов
                          'parking_rent',         -- парковка
                          'telecom_rent',         -- аренда крыши/шахт операторам
                          'advertising_rent',     -- рекламные конструкции
                          'utility_service_fee',  -- плата за услуги УК (напр., справки)
                          'penalty',              -- штрафы жителей
                          'subsidy',              -- бюджетные субсидии
                          'other'
                        )),
  legal_classification  TEXT NOT NULL CHECK (legal_classification IN (
                          'common_property_income', -- доход от общего имущества (снижает тариф)
                          'uk_service_income',      -- собственная деятельность УК
                          'penalty',                -- штрафы
                          'subsidy'                 -- бюджет
                        )),
  contractor            TEXT,
  contract_number       TEXT,
  contract_start        TEXT,
  contract_end          TEXT,
  monthly_amount        REAL NOT NULL,
  active                INTEGER DEFAULT 1,
  approval_meeting_id   TEXT REFERENCES meetings(id),  -- на каком ОС утверждено использование
  notes                 TEXT,
  created_at            TEXT DEFAULT (datetime('now'))
);
```

+ Расширение `finance_estimate_items` (для строк `kind='income'`):
```
revenue_source_id     TEXT REFERENCES revenue_sources(id)  -- необязательно, для истории
offset_rule           TEXT CHECK (offset_rule IN ('BEFORE_PROFIT', 'AFTER_PROFIT', 'NO_OFFSET'))
```

### Обратная совместимость
- Существующие income-строки в `finance_estimate_items` (сейчас
  `type='commercial'` через backend engine, но в БД просто плоские
  `name/amount`) — продолжают работать. `revenue_source_id=NULL`,
  `offset_rule` берётся из движка по name (либо `BEFORE_PROFIT` по
  умолчанию, как сейчас).
- Новые доходы UI-визарда сначала спрашивает: «Использовать существующий
  источник дохода или разовый?» Если существующий — линкует
  `revenue_source_id`. Если разовый — как сейчас.

### Требует подтверждения юристом
- Обязана ли УК показывать «доход от общего имущества снижает тариф»
  собственнику? По ПКМ №3/2022 — да (прозрачность). Норма про
  «BEFORE_PROFIT удешевляет» в текущем коде — верна, но не имеет
  legal_basis'а в коде. Стоит связать с конкретной статьёй.

---

## H. (Bonus) Утверждение сметы общим собранием — нужна связь с `meetings`

**Не в изначальном ТЗ A-G, но напрямую вытекает из compliance-audit
раздел 3.14** («смета должна быть приложением к протоколу общего
собрания»).

### Предложение
Расширить `finance_estimates`:
```
approval_meeting_id     TEXT REFERENCES meetings(id)         -- какое ОС утвердило
approval_protocol_number TEXT                                -- № протокола
approval_agenda_item_id TEXT REFERENCES meeting_agenda_items(id)  -- какой пункт повестки
approval_vote_result    TEXT                                 -- '85% за, 10% против, 5% воздержались'
approval_signed_at      TEXT                                 -- дата подписания протокола
```

При `approval_status='approved'` — эти поля становятся required. При
`draft` — все могут быть NULL.

PDF сметы получает в footer: «Утверждена решением общего собрания
собственников от 2026-08-05, протокол №4, п.3. За: 85%, против: 10%,
воздержались: 5%». Юридически чисто.

---

## I. Обзор связей (ER-нарисованный текстом)

```
tenants ──┬─→ buildings ─────┬──→ apartments
          │                  ├──→ capital_repair_funds ──→ capital_repair_transactions
          │                  ├──→ revenue_sources
          │                  ├──→ meetings ──→ meeting_agenda_items (существует)
          │                  └──→ users (staff via role) — существует
          │
          ├─→ legal_rates (per-tenant или NULL=global)
          ├─→ expense_categories (глобальные или per-tenant)
          │
          └─→ finance_estimates ─┬─→ finance_estimate_staff (+расширения C)
                                 ├─→ finance_estimate_items (+расширения B, G)
                                 │        │
                                 │        └─→ expense_categories (FK) / revenue_sources (FK)
                                 │
                                 ├─→ meetings (approval, блок H)
                                 └─→ finance_charges (генерируется, существует)
```

Существующие связи (не менять): `finance_estimates.building_id →
buildings.id`, `finance_estimate_items.estimate_id`,
`finance_estimate_staff.estimate_id`, `finance_charges.apartment_id`.

---

## Что можно сделать в один PR, что нужно разбить

### PR-1 (один, безопасный, ~200 LOC + tests)
- **Блок D частично**: seed-таблица `legal_rates` со схемой + миграция
  с 3-4 записями из compliance-документа (НДФЛ 12%, соцналог 12% и
  25%, ИНПС 0.1%, все с `effective_from='2020-01-01'`,
  `effective_to=NULL`).
- Endpoint `GET /api/legal-rates?type=X&at=YYYY-MM-DD` → lookup.
- UI визарда читает при выборе периода вместо `constants.ts` (fallback
  остаётся).
- Не меняет ни одной существующей записи; полностью аддитивно.

### PR-2 (средний, ~500 LOC + tests + миграция seed)
- **Блок F полностью**: таблица `expense_categories` +
  `finance_estimate_items.expense_type` (nullable) + `category_id` FK
  (nullable) + seed из legal-constants.ts (16 услуг).
- Backend валидатор: `MISSING_MANDATORY_SERVICE` теперь читает из
  `expense_categories.mandatory=1` вместо hardcoded.
- PDF-группировка по `expense_type`.
- Существующие items → миграция автопривязки по `legal_code` (где есть)
  и по имени (fuzzy match).

### PR-3 (крупный, ломает contract)
- **Блок B полностью**: `quantity, unit_price, frequency_per_month,
  source_price_ref, formula_notes` в `finance_estimate_items`.
- UI визарда: два режима «свободная сумма» / «формула» с переключателем.
- Backend: пересчёт `amount = quantity × unit_price × frequency × 12`
  при сохранении.
- Существующие items работают в «свободная сумма» режиме.

### PR-4 (крупный, требует legal-подтверждения)
- **Блок E полностью**: `capital_repair_funds` +
  `capital_repair_transactions`.
- Отдельная строка в `finance_charges` (`kind='capital_repair'`).
- PDF: отдельный блок капремонта.
- **Требует подтверждения**: обязателен ли фонд в РУз?

### PR-5 (средний)
- **Блок G полностью**: `revenue_sources` + расширение
  `finance_estimate_items` (`revenue_source_id`, `offset_rule`).
- Backend: engine читает `offset_rule` из БД вместо `defaultOffset()`.

### PR-6 (маленький, безопасный)
- **Блок A**: 9 новых полей в `buildings` (все NULL DEFAULT NULL).
- Обновить UI формы редактирования здания.

### PR-7 (средний)
- **Блок C**: расширение `finance_estimate_staff` (5 полей).
- UI-обновление таблицы штата в визарде.

### PR-8 (средний, требует legal)
- **Блок H**: связь с meetings, поля approval_*.
- PDF footer с протоколом.

**Итого**: 8 PR, по одной домен-области, каждый независим (не блокирует
другие). Порядок реализации: D → F → B → G → E (после юрлицензии) → A →
C → H (после юрлицензии).

---

## Что требует моего (пользователя) подтверждения перед реализацией

1. **Блок D — legal_rates**: скоуп записей в seed. Нужно ли создать
   исторические записи для 2019-2023? Или только текущее актуальное
   правило?
2. **Блок E — фонд капремонта**: обязателен ли в РУз-законодательстве?
   Без подтверждения юристом не начинаем.
3. **Блок F — миграция существующих items**: fuzzy-match по имени
   строки может ошибиться (напр. «Уборка» → cleaning_stairwell vs
   cleaning_territory). Оставить NULL и попросить менеджеров
   переприкрепить вручную, или пробовать автоматически?
4. **Блок G — legal_classification `common_property_income`**:
   подтвердить, что для РУз это действительно снижает тариф (аналог
   ст.156 ЖК РФ). Compliance-документ не дал жёсткого source'а.
5. **Блок H — обратная миграция**: что делать с уже утверждёнными
   сметами, у которых нет `approval_meeting_id`? Auto-миграция ищет
   ближайшее собрание с повесткой про смету? Или NULL и требуем
   заполнить руками до следующего утверждения?
6. **API contract breaking changes**: PR-3, PR-5 могут потребовать
   обновления mobile-приложения одновременно с backend'ом. Готовы
   планировать coordinated release?
7. **Скоуп PR-2 (expense_categories)**: делать таблицу
   per-tenant (каждая УК свои категории) или global (одна на всю
   систему)? По ЗРУ-581 категории регулируются подзаконно (Положение
   №3398), значит скорее global. Но кастомизация УК может нарушить это.

---

## Заключение

Все 7 блоков A-G реализуемы **аддитивно** — существующая baseline-смета
myhelper 2026-08 и все другие prod-записи продолжают работать без
изменений своих данных. Каждый PR — отдельная доменная область, не
пересекается с остальными. Общая оценка: **8 PR, каждый 200-800 LOC +
тесты + миграция**.

Первым приоритетом рекомендую **PR-1 (legal_rates)** — самый безопасный,
даёт правильный foundation для последующих P5-like фиксов; и **PR-2
(expense_categories)** — устраняет hardcode из legal-constants.ts и
делает валидатор data-driven.

Ждите подтверждения по 7 вопросам выше — тогда план можно ужать до
Phase-1 (PR-1, 2, 6, 7) и Phase-2 (PR-3, 4, 5, 8).
