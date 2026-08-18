# Смета v2 — консолидация и доработки (дизайн)

Дата: 2026-08-05 · Статус: draft (на ревью)

## Контекст

В Kamizo два потока сметы: легаси `EstimatesPage.tsx` (`/finance/estimates`) и
Мастер v2 `EstimateV2WizardPage.tsx` (`/finance/estimates/v2/new`). Движок
расчёта v2 — чистые функции `cloudflare/src/lib/estimate/compute.ts` +
`legal-constants.ts` + `validators.ts` (+ golden-тесты). Пользователь собрал
список из 10 недочётов/доработок. Решено: **вся новая логика — в v2, легаси
пометить deprecated** (не удалять).

## Ключевые решения (утверждены)

1. Консолидация: всё в v2, легаси — устаревший, перенести из него генерацию
   начислений, PDF-экспорт, галочку «показывать прибыль».
2. Отпускные: поле **«дней отпуска» на должность** (не общий %).
3. НДС: галочка **«плательщик НДС» + ставка 12%** (настраиваемая), исходящий
   НДС на тариф, отдельная строка «в т.ч. НДС».
4. Язык: **переключатель RU/UZ** при экспорте (экспорт уже двуязычный внутри).

## Фазы

### Фаза 0 — UX-фиксы ввода (пункт 6)

**Проблема:** «кнопка в инпуте не уходит, нельзя вписать цифру» = стрелки-
спиннеры нативного `type="number"`. В легаси уже пофикшено
(`EstimatesPage.tsx:541-544`, `type="text" inputMode="numeric"` + regex-parse),
в v2 — нет.

**Дизайн:**
- Вынести переиспользуемый компонент `NumericInput`
  (`estimate-v2/NumericInput.tsx`): `type="text" inputMode="numeric"`,
  парсинг цифр, prop `placeholder`, `suffix`, `disabled`.
- Заменить все 6 нативных `type="number"` в v2: Step1 (profitPercent,
  tariffApproved), Step2 (units, salary), Step3 (monthly), Step4 (income
  monthly). Добавить placeholder’ы («напр. 2 700 000», «сум/мес» и т.п.).
- Для обязательных чеклист-строк с `linked_to_staff`/авто-значением —
  показывать placeholder вместо застрявшего значения, поле не заблокировано
  визуально «кнопкой».

**Проверка:** ручной ввод без потери фокуса; tsc + build.

### Фаза 1 — Структура обязательных услуг (пункты 3,4,5)

**Дизайн:**
- **Разделить** `facades_entrances` → два кода `facades` («Фасады») и
  `entrances` («Подъезды») в `legal-constants.ts` (источник истины) и в
  чек-листе фронта.
- **Опциональные услуги:** добавить флаг `optional?: boolean` в
  `MANDATORY_SERVICES` (напр. `roof_waterproofing`). Опциональные рендерятся
  с чекбоксом «включать в смету»; если выключено — не входят в тариф и **не
  триггерят** warning `MISSING_MANDATORY_SERVICE`.
- **Периодические расходы — опциональны целиком:** поле
  `finance_estimates.periodic_enabled INTEGER DEFAULT 1` + мастер-галочка
  «Периодические расходы применяются». Если выкл — секция `periodic`
  исключается из итогов и экспорта.
- **Убрать дублирование** списка 16 услуг: новый `GET
  /api/finance/estimates/v2/mandatory-services` отдаёт список из
  `legal-constants.ts` (единый источник), фронт грузит его вместо локального
  мока. Это чинит и потерю `conditional` (лифт/насосы) на фронте.

**Схема/миграция:** `NNN_estimate_periodic_optional.sql` — `ALTER TABLE
finance_estimates ADD COLUMN periodic_enabled INTEGER DEFAULT 1`. Смена кодов
услуг — данные, не схема (существующие сметы с `facades_entrances` мапить в
`facades` на чтении для обратной совместимости).

### Фаза 2 — Отпускные (пункт 2)

**Дизайн:**
- `StaffPositionV2` + таблица `finance_estimate_staff`: новое поле
  `vacation_days` (REAL, default 21 — минимум по ТК РУз).
- Формула (в `compute.ts::computeStaff`): дневная ставка = `salary/21`,
  годовые отпускные позиции = `дневная × vacation_days × units`, месячный
  резерв = годовые/12. Т.е. `vacation_monthly = salary*units*vacation_days/252`.
  При `vacation_days=21` ≈ 1 оклад/год.
- Отпускные **входят в `fot_gross`** (база) → облагаются налогом на ФОТ.
  `fot_gross = Σ(units*salary) + Σ(vacation_monthly)`.
- UI: колонка «Отпуск, дней» в таблице штата (default 21). Экспорт: строка
  «Резерв отпускных» в блоке ШТАТ + учтено в ФОТ.
- Обновить golden-тесты `compute.test.ts`.

**Миграция:** `ALTER TABLE finance_estimate_staff ADD COLUMN vacation_days REAL
DEFAULT 21`.

### Фаза 3 — Доход в пользу жителей (пункт 7)

**Текущее:** commercial/basement/parking/other → BEFORE_PROFIT (удешевляют
базу), telecom → AFTER_PROFIT (компенсация per m²). Механизм уже есть — не
хватает типа «реклама» и **видимости экономии**.

**Дизайн:**
- Добавить тип дохода `advertising` («Реклама/провайдеры») в `IncomeType`,
  offset = BEFORE_PROFIT (как commercial). Кнопка в UI Step4.
- **Показать экономию жителям** явно: новая величина `resident_saving_per_m2`
  = (Σ before-profit доходов + telecom) / area, и `resident_saving_per_apt`
  (на среднюю квартиру). Вывести в UI Step4 и в экспорт строкой
  «Экономия жителям за счёт доходов УК, сум/м²».
- Формулы тарифа не меняем (уже корректны) — только считаем и показываем
  экономию.

### Фаза 4 — НДС (пункт 8)

**Дизайн:**
- Поля `finance_estimates.vat_enabled INTEGER DEFAULT 0`, `vat_rate REAL
  DEFAULT 0.12`.
- В `compute.ts`: если `vat_enabled` → `tariff_with_vat = tariff_resident *
  (1 + vat_rate)`, `vat_amount_per_m2 = tariff_resident * vat_rate`. Добавить
  в `EstimateResultV2`: `vat_per_m2`, `tariff_with_vat`.
- UI Step1: галочка «УК — плательщик НДС» + поле ставки (default 12%).
- Экспорт: строки «Тариф без НДС», «в т.ч. НДС 12%», «ИТОГО с НДС».
- Начисления жителям (`generateCharges`) — по тарифу с НДС, если включён.

**Миграция:** `ALTER TABLE finance_estimates ADD COLUMN vat_enabled INTEGER
DEFAULT 0; ALTER TABLE finance_estimates ADD COLUMN vat_rate REAL DEFAULT 0.12`
(двумя отдельными `ALTER`, т.к. SQLite).

### Фаза 5 — Консолидация v2 (пункт 1)

**Дизайн:**
- **Генерация начислений после активации:** после `activateEstimate` в v2
  предлагать `generateCharges` (как легаси `EstimatesPage.tsx:279-302`),
  вместо мгновенного редиректа.
- **PDF-экспорт в v2:** кнопка «Скачать PDF» на шаге «Итог», через
  `generateEstimatePdf` (адаптировать под v2-`result`; сейчас работает от
  плоских items — расширить маппинг штат/доходы/периодика).
- **Галочка `show_profit_to_residents`** (колонка уже есть в БД) — вывести в
  UI v2 Step1/Step4, прокидывать в create.
- Легаси `EstimatesPage`: баннер «устаревшая форма, используйте Мастер v2» +
  коммент `@deprecated`. Роут и код НЕ удаляем.

### Фаза 6 — Язык экспорта + легал (пункты 9,10)

**Дизайн:**
- Переключатель языка экспорта (RU/UZ) на шаге «Итог» — сегмент-контрол,
  прокидывается в `generateEstimateV2Excel`/`generateEstimatePdf` вместо
  текущего `language` из стора.
- Легал: добавить ссылку на **ПКМ №5152** в легал-футер и в
  `legal-constants.ts` (сейчас есть №3501, ЗРУ-581, №930; №5152 отсутствует).
  Сверить формулировки минимальных тарифов с приказом №3501.

## Порядок и зависимости

Фаза 0 (изолированная, быстрый выигрыш) → 1 → 2 → 3 → 4 → 5 → 6. Фазы 2 и 4
трогают `compute.ts` + миграции + golden-тесты — делать по TDD. Каждая фаза:
tsc + build + (для бэка) vitest; деплой по готовности фазы.

## Инварианты (не нарушать)

- Каждый SQL — с `tenant_id` фильтром; каждая новая колонка через файл
  миграции в `cloudflare/migrations/` (без `IF NOT EXISTS` на `ADD COLUMN`).
- Движок расчёта — чистые функции, покрыты golden-тестами; менять только с
  обновлением тестов.
- Экспорт берёт цифры из `result` (авторитетный бэкенд-расчёт), не
  пересчитывает по своей модели.

## Открытые вопросы

- Точная средняя площадь квартиры для `resident_saving_per_apt` — брать
  `residential_area / apartments` или отдельное поле? (уточнить в Фазе 3).
- НДС: начислять на тариф до или после вычета telecom-компенсации? (принять
  в Фазе 4: на итоговый `tariff_resident`).
