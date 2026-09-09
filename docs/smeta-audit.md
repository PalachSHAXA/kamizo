# Аудит модуля сметы (finance_estimates)

Дата: 2026-09-09. Область: только модель TARIFF_CALCULATED (v2). Baseline — реальная prod-запись 2026-08 (не найдена в seed/тестах; числа проверены против формул кода — сходятся). Все ссылки — на актуальную ветку `main`.

---

## 1. Как устроена смета сейчас

### 1.1. Модель данных

**Таблица `finance_estimates`** — [cloudflare/schema.sql:1816-1857](cloudflare/schema.sql#L1816-L1857).

Две независимые оси статуса:
- `status` (draft / active / archived) — жизненный цикл записи, [schema.sql:1833](cloudflare/schema.sql#L1833).
- `approval_status` (draft / pending / approved / rejected) — согласование, [schema.sql:1842](cloudflare/schema.sql#L1842). Введена в migration 065.
- Правки закрыты, если `approval_status='pending'` ИЛИ `status!=='draft'` — [helpers.ts:168-179](cloudflare/src/utils/helpers.ts#L168-L179) `estimateEditBlockedReason`.

**v2-колонки (модель TARIFF_CALCULATED)** — [cloudflare/migrations/057_finance_estimate_v2.sql:24-47](cloudflare/migrations/057_finance_estimate_v2.sql#L24-L47):
- `model TEXT` — тип модели ('TARIFF_CALCULATED' и др.)
- `commercial_income REAL` — доход от нежилых/коммерческих помещений
- `residential_area REAL` — жилая площадь дома, м²
- `payroll_tax_rate REAL DEFAULT 0.24` — ставка налога на ФОТ ([migrations/057:33](cloudflare/migrations/057_finance_estimate_v2.sql#L33))
- `uk_profit_percent REAL` — процент прибыли УК; legacy-дефолт колонки в schema.sql:1825 равен 10, но UI визарда TARIFF_CALCULATED ставит 7 ([EstimateV2WizardPage.tsx:105](src/frontend/src/pages/finance/estimate-v2/EstimateV2WizardPage.tsx#L105))
- Кэш-колонки: `fot_gross`, `fot_total`, `tariff_resident`, `umumiy_year`, `deficit_year` и т.д. — материализуются движком после расчёта

### 1.2. Расчётный движок

**Чистые функции** — [cloudflare/src/lib/estimate/compute.ts](cloudflare/src/lib/estimate/compute.ts).

Ключевые узлы:
- `vacation_monthly = units * salary * days / (21 * 12)` — [compute.ts:49-51](cloudflare/src/lib/estimate/compute.ts#L49-L51); при `days=21` (ТК РУз) даёт ровно `salary*units/12`, т.е. 8.33% сверху к базовому ФОТ
- `fot_gross = fot_base + fot_vacation` — [compute.ts:183-185](cloudflare/src/lib/estimate/compute.ts#L183-L185)
- `fot_total = fot_gross * (1 + payroll_tax_rate)` — [compute.ts:186-187](cloudflare/src/lib/estimate/compute.ts#L186-L187)
- `computeExpenses` подменяет `monthly_amount` строки с `linked_to_staff=true` на `fot_total` — [compute.ts:196-204](cloudflare/src/lib/estimate/compute.ts#L196-L204)
- Тариф: `self_cost = expenses - offsets`; `base_per_m2 = self_cost / area`; `with_profit = base * (1 + profit)`; `tariff = with_profit - telecom_comp` — [compute.ts:236-247](cloudflare/src/lib/estimate/compute.ts#L236-L247)
- `commercial_income` по умолчанию `BEFORE_PROFIT` — вычитается из базы ДО умножения на профит — [compute.ts:158-160](cloudflare/src/lib/estimate/compute.ts#L158-L160)
- Годовой доход `jami_tushum_year = tariff * area * 12 + commercial_income * 12` — [compute.ts:268-276](cloudflare/src/lib/estimate/compute.ts#L268-L276)

### 1.3. Backend

- CRUD + расчётные endpoint'ы: [cloudflare/src/routes/finance-v2.ts](cloudflare/src/routes/finance-v2.ts)
- Сохранение статьи расхода: `amount = monthly * 12`, `monthly_amount = monthly` — [finance-v2.ts:484-494](cloudflare/src/routes/finance-v2.ts#L484-L494) (обе колонки хранятся параллельно — источник расхождения №1 ниже)
- Роли: `ESTIMATE_EDIT_ROLES`, `ESTIMATE_APPROVE_ROLES` — [helpers.ts:144-148](cloudflare/src/utils/helpers.ts#L144-L148)

### 1.4. Frontend + PDF

- Визард модели TARIFF_CALCULATED: [EstimateV2WizardPage.tsx](src/frontend/src/pages/finance/estimate-v2/EstimateV2WizardPage.tsx)
- Список смет / статус: [pages/finance/EstimatesPage.tsx](src/frontend/src/pages/finance/EstimatesPage.tsx), [utils/estimateStatus.ts](src/frontend/src/utils/estimateStatus.ts)
- **PDF generator**: [src/frontend/src/utils/generateEstimatePdf.ts](src/frontend/src/utils/generateEstimatePdf.ts)
  - Верхний KPI «Годовые расходы» — из `estimate.umumiy_year` ([строка 103](src/frontend/src/utils/generateEstimatePdf.ts#L103))
  - Детализация «Итого» — суммирует `item.amount` ([строка 41](src/frontend/src/utils/generateEstimatePdf.ts#L41))

---

## 2. Найденные проблемы

### Проблема P1 — 959M vs 8.82B сум/год в PDF ⚠️ КРИТИЧНО

**Симптом.** Верх PDF: `Годовые расходы = 959 248 580`. Детализация статей: `Итого = 8 823 528 000`. Разница ~×9.2.

**Причина.** Две разные колонки БД, разные источники, разные семантики:
- `umumiy_year` (наверх) — считает движок из `monthly_amount` с подстановкой `fot_total` для `linked_to_staff=true`
- `amount` (в детализации) — сырое поле в БД, посчитано когда-то как `monthly * 12` при сохранении и с тех пор не пересчитывается

Проверка чисел из baseline:
- 74 707 833 (месячные расходы движка) × 12 × 1.07 (профит) = **959 248 575 ≈ 959 248 580** ✓
- 735 294 000 (сырая сумма 16 категорий, включая устаревшую строку ФОТ) × 12 = 8 823 528 000 ≈ 8.82B

Т.е. верхняя цифра корректна, детализация показывает сырую сумму `amount`, где хотя бы одна строка (`linked_to_staff=true`) хранит «замороженное» значение с момента последнего сохранения — оно не совпадает с текущим `fot_total`, и движок его игнорирует, а PDF-детализация — нет.

**Файлы:** [finance-v2.ts:484-494](cloudflare/src/routes/finance-v2.ts#L484-L494), [compute.ts:196-204](cloudflare/src/lib/estimate/compute.ts#L196-L204), [generateEstimatePdf.ts:41 и :103](src/frontend/src/utils/generateEstimatePdf.ts#L41).

### Проблема P2 — ФОТ 10M (штат) vs 10.83M (верх PDF)

**Не баг, а нераскрытая механика.** 10 000 000 = `fot_base` (штат × оклад). 833 333 = резерв отпускных: `10 000 000 * 21 / (21*12) = 833 333.33` — это встроенная формула из [compute.ts:49-51](cloudflare/src/lib/estimate/compute.ts#L49-L51) при `days=21` (стандарт ТК РУз). Дальше `fot_total = (10M + 833K) * 1.24 = 13 433 333` — точно совпадает с baseline.

**Проблема UX:** пользователь не видит в интерфейсе, что 833K — это отпускной резерв, а не «магический добавок». Штат показывает голый оклад, а верх PDF — уже с резервом и налогом. Нужна визуальная детализация FOT breakdown либо тултип «FOT_base + отпускной резерв + налог 24% = FOT_total».

### Проблема P3 — Тариф 10 555 сум/м² — механика не документирована

**Формула проверена.** 72 307 833 / 7 330 = 9 864.64; × 1.07 = 10 555.17 ≈ 10 555. То есть `tariff = (self_cost / area) * (1 + uk_profit_percent/100)`, где `self_cost = 72 307 833` уже вычтен `commercial_income * 12 = 345 600 000 / 12 = 28.8M/мес` из базы (потому что commercial по умолчанию `BEFORE_PROFIT`).

**Проблема:** ни в PDF, ни в UI нет пояснения к тарифу — почему получилось 10 555, а не 9 865 или 12 700. Отсутствует «формульная строка» типа `(себестоимость / площадь) × (1 + прибыль %) = тариф`.

**Файлы:** [compute.ts:236-247](cloudflare/src/lib/estimate/compute.ts#L236-L247).

### Проблема P4 — 7% прибыли: legacy-дефолт колонки 10, реально 7

**Схема:** `uk_profit_percent REAL DEFAULT 10` — [schema.sql:1825](cloudflare/schema.sql#L1825).
**UI:** `useState(7)` — [EstimateV2WizardPage.tsx:105](src/frontend/src/pages/finance/estimate-v2/EstimateV2WizardPage.tsx#L105).

Legacy-дефолт БД не совпадает с UI-дефолтом визарда для TARIFF_CALCULATED. Если запись создать программно (не через визард), приедет 10%. Через визард — 7%. Расчёт всегда читает `row.uk_profit_percent / 100` — [finance-v2.ts:139](cloudflare/src/routes/finance-v2.ts#L139).

**База для 7%** — себестоимость (`base_per_m2`), не выручка. Т.е. итоговый тариф = «себестоимость на м² × 1.07».

### Проблема P5 — 24% на ФОТ: magic number в трёх местах

**Определён в трёх местах** — нет single source of truth:
1. Дефолт колонки: `DEFAULT 0.24` — [migrations/057:33](cloudflare/migrations/057_finance_estimate_v2.sql#L33)
2. Fallback в бэке: `row.payroll_tax_rate ?? 0.24` — [finance-v2.ts:140](cloudflare/src/routes/finance-v2.ts#L140)
3. UI-дефолт: `useState(0.24)` — [EstimateV2WizardPage.tsx:106](src/frontend/src/pages/finance/estimate-v2/EstimateV2WizardPage.tsx#L106)

Поле per-estimate редактируемое (не привязано к тенанту, не в централизованном конфиге). Если законодательная ставка изменится (или для конкретной УК бюджетная = 25%), это надо править вручную в каждой смете, а не в одном месте. Нет UI-подсказки «действующая ставка на 2026: 24% для небюджетных УК» — см. compliance-документ.

### Проблема P6 — Commercial income: реализация соответствует правильной формуле

**Проверил flow:**
- `commercial_income` вычитается из `total_expenses` ДО деления на площадь — [compute.ts:236,243-244](cloudflare/src/lib/estimate/compute.ts#L236). ✓
- Также добавляется к годовому доходу (`jami_tushum_year`) — [compute.ts:268-276](cloudflare/src/lib/estimate/compute.ts#L268-L276) — это отдельная семантика (реальная выручка УК для расчёта разрыва), не двойной учёт.
- Проверка: 10 555 × 7 330 × 12 + 28 800 000 ≈ 957 217 800 ≈ **957 232 580** ✓

**Не баг**, но: пользователь может неправильно понять — «почему commercial income увеличивает и уменьшает одновременно». Стоит добавить формульную строку в PDF: «Тариф = (расходы − коммерческий доход) / площадь × (1 + 7%)».

---

## 3. Что отсутствует в текущей архитектуре

### 3.1. Пересчёт `amount` при изменении `linked_to_staff` строк
Строки расхода с `linked_to_staff=true` в БД хранят «замороженное» `amount`, а движок при выводе через `umumiy_year` подменяет их на `fot_total`. Нет джобы/триггера, который бы пересчитывал `amount = fot_total * 12` при сохранении. Отсюда — P1.

### 3.2. Отдельного фонда/статьи капремонта нет
В движке `compute.ts` и в схеме `finance_estimates` нет специального обработчика капитального ремонта. Все статьи расходов идут одним пулом. В РУз статус капремонта неоднозначен (см. compliance-документ), но если законодательство обязывает отделять — сейчас архитектура этого не поддерживает.

### 3.3. Нет истории версий сметы (audit trail)
Изменения в статьях расхода перезаписывают старые. Нет `finance_estimate_versions` или `history` таблицы. Согласование через `approval_status` фиксирует один снимок, но затем правки поверх — теряют историю до согласования.

### 3.4. Нет привязки сметы к протоколу общего собрания
По ЗРУ-581 (см. compliance-документ) смета утверждается общим собранием. В `finance_estimates` нет FK на `meeting_id` / `protocol_id` — юридически смета «висит в воздухе», без записи о решении собственников.

### 3.5. Ставка налога на ФОТ не централизована
См. P5. Нужен `tenants.default_payroll_tax_rate` или глобальная константа `PAYROLL_TAX_RATE_UZ_2026 = 0.24`, чтобы централизовать место правки при изменении законодательства.

### 3.6. Нет валидации сметы «расходы = доходы (± допустимый разрыв)»
Baseline: разрыв `-2 016 000` (расходы > доходов). Ни в UI, ни в бэке нет warning'а, если разрыв превышает N% от суммы. Нет вообще проверки balance при `status=draft → active`.

### 3.7. Нет отчётности для собственников
Нет endpoint'а «отчёт УК за период» с фактическими расходами vs плановыми. Смета — только план; факт-учёт (реализация в течение периода) не связан со сметой.

### 3.8. Нет истории тарифов
`tariff_resident` — кэш-колонка, перезаписывается при пересчёте. История «тариф был 9 200 → стал 10 555 с 2026-08» не хранится. Юридически это важно для отчёта собственникам.

### 3.9. Legacy vs v2 колонки в одной таблице
`finance_estimates` содержит и старые (v1) колонки, и v2 (TARIFF_CALCULATED). Только `model` различает семантику. Правки в одном пути могут случайно затронуть другой. Нужен либо жёсткий rejection в БД (CHECK), либо разделение таблиц.

### 3.10. Отсутствие тестов на движок `compute.ts`
Не нашёл `compute.test.ts` или аналога. Формулы (P1-P6) не покрыты unit-тестами. Изменения в отпускной формуле или в offset типах могут молча сломать расчёт.
