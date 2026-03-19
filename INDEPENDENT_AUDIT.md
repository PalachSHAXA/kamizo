# НЕЗАВИСИМЫЙ АУДИТ ПРОЕКТА KAMIZO

**Дата**: 20 марта 2026
**Метод**: Автоматизированный анализ кода (grep, tsc, wc -l, cat)
**Версия кодовой базы**: текущий main

**Статистика проекта**:
- Frontend: 263 файла (.ts/.tsx)
- Backend: 42 файла (.ts), основной finance.ts — 1121 строк
- SQL-запросов в finance.ts: ~148
- Проверок tenant_id: 47 (из ~148 запросов)

---

## РОЛЬ 1: РАЗРАБОТЧИК — баги и техдолг

### Компиляция TypeScript
- ✅ Frontend (`npx tsc --noEmit`): **0 ошибок**
- ✅ Backend (`npx tsc --noEmit`): **0 ошибок**
- ✅ Сломанных импортов: **0**

### 🔴 P01 — N+1 запрос в обработке оплат
- **Файл**: `cloudflare/src/routes/finance.ts:461-479`
- **Проблема**: Цикл `for (const charge of unpaidCharges)` выполняет индивидуальный `UPDATE` для каждого начисления. При распределении оплаты на 50 долгов — 50 отдельных запросов к БД.
- **Критичность**: 🔴 Critical — таймауты при большом количестве долгов
- **Рекомендация**: Использовать batch-операцию или D1 transaction

### 🟡 P02 — Дублированные файлы в utils
- **Файлы**:
  - `src/frontend/src/utils/formatCurrency 2.ts` (822 байт)
  - `src/frontend/src/utils/generateEstimateExcel 2.ts` (13409 байт)
- **Проблема**: Копии файлов с пробелом в имени. Не импортируются нигде, но занимают место и путают разработчиков.
- **Критичность**: 🟡 Medium
- **Рекомендация**: Удалить оба файла

### 🟡 P03 — Мёртвый код в utils/performance.ts
- **Файл**: `src/frontend/src/utils/performance.ts`
- **Неиспользуемые функции**: `withPerformance()`, `usePerformanceEffect()`, `FPSMeter`, `getMemoryUsage()`, `generatePerformanceReport()`
- **Критичность**: 🟡 Medium
- **Рекомендация**: Удалить или пометить как экспериментальные

### 🟡 P04 — Мёртвый код в utils/statusColors.ts
- **Файл**: `src/frontend/src/utils/statusColors.ts`
- **Проблема**: Множество экспортированных функций для цветов/бейджей (REQUEST, PRIORITY, EXECUTOR, WORK_ORDER, marketplace) — ни одна не используется
- **Критичность**: 🟡 Medium
- **Рекомендация**: Удалить неиспользуемые экспорты

### 🟢 P05 — 33 TODO/FIXME комментария в коде
- **Расположение**: stores (8), pages (9 — "migrate to Modal"), ErrorBoundary (Sentry DSN), logger
- **Критичность**: 🟢 Low
- **Рекомендация**: Создать тикеты или убрать

### ✅ Положительные результаты
- 0 `console.log` в продакшн-коде (только `console.error/warn`)
- Все `useEffect` имеют dep arrays (нет infinite loops)
- Кэш-инвалидация после мутаций работает корректно
- JWT-токены обрабатываются правильно

---

## РОЛЬ 2: ДИРЕКТОР УК — бизнес-логика

### 🔴 P06 — Смету можно активировать без статей расходов
- **Файл**: `cloudflare/src/routes/finance.ts:211-240`
- **Проблема**: При активации сметы (`POST /estimates/:id/activate`) проверяется только `status === 'draft'`. Нет проверки:
  - что у сметы есть хотя бы 1 статья расходов
  - что `total_amount > 0`
  - что тарифы не нулевые
- **Последствие**: Пустая смета активируется → генерируются начисления на 0 сум
- **Критичность**: 🔴 Critical
- **Рекомендация**: Перед активацией проверять: `SELECT COUNT(*) FROM finance_estimate_items WHERE estimate_id = ?`

### 🔴 P07 — Несогласованный дефолт процента прибыли (9% vs 10%)
- **Файл**: `cloudflare/src/routes/finance.ts`
  - Строка 120 (POST): `profitPct = uk_profit_percent ?? enterprise_profit_percent ?? 9`
  - Строка 173 (PUT): `profitPct = uk_profit_percent ?? 10`
- **Проблема**: При создании сметы дефолт 9%, при обновлении — 10%. Если обновить смету не указав процент, тариф пересчитается с 10% вместо текущих 9%.
- **Критичность**: 🔴 Critical — тарифы меняются незаметно для пользователя
- **Рекомендация**: В PUT использовать текущее значение сметы: `profitPct = uk_profit_percent ?? existing.uk_profit_percent ?? 9`

### 🟡 P08 — Запутанные имена полей: commercial_rate = жилой тариф
- **Файл**: `cloudflare/src/routes/finance.ts:277`
- **Код**: `const residentialRate = Number(estimate.commercial_rate_per_sqm)`
- **Проблема**: Поле БД `commercial_rate_per_sqm` используется для ЖИЛОГО тарифа. Семантическое несоответствие запутывает разработчиков.
- **Критичность**: 🟡 Medium
- **Рекомендация**: Переименовать поле БД через миграцию

### 🟡 P09 — Нет защиты от дублирования смет на один период
- **Файл**: `cloudflare/src/routes/finance.ts:330`
- **Проблема**: Проверка дублей начислений идёт по `(apartment_id, period, estimate_id)`. Но если 2 сметы активны для одного здания/периода — квартира получит 2 начисления.
- **Критичность**: 🟡 Medium
- **Рекомендация**: При активации проверять: нет ли уже active сметы для того же `building_id` и `period`

### 🟡 P10 — Автоматический расчёт дохода УК отсутствует
- **Файл**: `cloudflare/src/routes/finance.ts:575-660`
- **Проблема**: Доход УК (9%) записывается вручную. Нет автоматического создания записи дохода при генерации начислений.
- **Критичность**: 🟡 Medium
- **Рекомендация**: При генерации начислений создавать запись дохода: `сумма_начислений * uk_profit_percent / 100`

---

## РОЛЬ 3: ЖИТЕЛЬ — UX и приватность

### 🟡 P11 — GET /api/finance/materials доступен ВСЕМ аутентифицированным
- **Файл**: `cloudflare/src/routes/finance.ts:665-684`
- **Проблема**: В отличие от POST (строка 692 — проверяет `isManagement`), GET-эндпоинт материалов не проверяет роль. Любой житель видит все материалы, цены и остатки.
- **Критичность**: 🟡 Medium
- **Рекомендация**: Добавить `if (!isManagement(user)) return error('Forbidden', 403);`

### 🟡 P12 — POST /api/finance/materials/:id/usage без проверки роли
- **Файл**: `cloudflare/src/routes/finance.ts:718-748`
- **Проблема**: Эндпоинт списания материалов не проверяет `isManagement`. Любой авторизованный пользователь может списать материал.
- **Критичность**: 🟡 Medium
- **Рекомендация**: Добавить проверку `isManagement(user)` после строки 722

### 🟢 P13 — Низкая мобильная адаптивность ResidentDashboard
- **Файл**: `src/frontend/src/pages/ResidentDashboard.tsx`
- **Проблема**: Мало responsive-классов для компонента 600+ строк
- **Критичность**: 🟢 Low
- **Рекомендация**: Добавить `sm:/md:/lg:` Tailwind-классы для секций баланса

### ✅ Положительные результаты
- Житель видит свой баланс на дашборде
- Фильтрация по `apartment_id` / `primary_owner_id` работает корректно
- Акт сверки доступен и фильтруется по квартире
- XSS: 0 использований `dangerouslySetInnerHTML` во всём проекте

---

## РОЛЬ 4: ФИНАНСИСТ/БУХГАЛТЕР — расчёты

### 🔴 P14 — Баланс в акте сверки перевёрнут
- **Файл**: `cloudflare/src/routes/finance.ts:806`
- **Код**: `balance: totalPaid - totalCharged`
- **Проблема**: Баланс считается как `оплачено - начислено`. Если начислено 100 000 и оплачено 60 000, баланс = -40 000. Для бухгалтерии долг должен быть положительным числом (задолженность = 40 000).
- **То же на строке 950**: `const balance = totalPaid - totalCharged;`
- **Критичность**: 🔴 Critical — акт сверки показывает инвертированные цифры
- **Рекомендация**: Изменить на `totalCharged - totalPaid`

### 🔴 P15 — Переплата не сохраняется в БД
- **Файл**: `cloudflare/src/routes/finance.ts:487`
- **Проблема**: Если житель оплатил больше суммы долгов, переплата возвращается в JSON-ответе (`remaining_overpay`), но НЕ записывается в БД. При следующей оплате переплата потеряна.
- **Также**: Платёж привязан только к `firstChargeId`, даже если распределён на несколько начислений.
- **Критичность**: 🔴 Critical — потеря денег жителей
- **Рекомендация**: Создать таблицу `finance_payment_allocations` для связи платёж↔начисление, хранить переплату как кредит

### 🟡 P16 — formatCurrency округляет до целых (0 десятичных)
- **Файл**: `src/frontend/src/utils/formatCurrency.ts:8-9`
- **Код**: `minimumFractionDigits: 0, maximumFractionDigits: 0`
- **Проблема**: В БД хранится `123.45`, а на UI отображается `123 сум`. Расхождение между БД и отображением.
- **Критичность**: 🟡 Medium (для UZS обычно целые числа, но при делении могут появляться дробные)
- **Рекомендация**: Уточнить — если UZS всегда целые, добавить `Math.round()` при генерации начислений. Если дробные допустимы — показывать 2 знака.

### 🟡 P17 — Распределение оплат не атомарно
- **Файл**: `cloudflare/src/routes/finance.ts:461-479`
- **Проблема**: Обновление начислений при оплате происходит в цикле без транзакции. При параллельных оплатах за одну квартиру возможна гонка (race condition).
- **Критичность**: 🟡 Medium
- **Рекомендация**: Обернуть в транзакцию D1

### 🟡 P18 — Должники: months_overdue без проверки due_date
- **Файл**: `cloudflare/src/routes/finance.ts:557`
- **Код**: `COUNT(DISTINCT c.period) as months_overdue`
- **Проблема**: Считает количество периодов с долгом, но не проверяет `due_date < NOW()`. Текущий неоплаченный месяц тоже попадает в "просрочку".
- **Критичность**: 🟡 Medium
- **Рекомендация**: Добавить `AND c.due_date < date('now')` в WHERE

### 🟢 P19 — Нет проверки на двойное начисление при повторной генерации
- **Файл**: `cloudflare/src/routes/finance.ts:330`
- **Проблема**: Есть проверка `SELECT id FROM finance_charges WHERE apartment_id = ? AND period = ? AND estimate_id = ?`, но нет UI-предупреждения если начисления уже существуют для данного периода.
- **Критичность**: 🟢 Low — защита есть, но UX можно улучшить

---

## РОЛЬ 5: ТЕСТИРОВЩИК QA — безопасность и граничные случаи

### 🔴 P20 — UPDATE finance_materials без tenant_id
- **Файл**: `cloudflare/src/routes/finance.ts:704`
- **Код**: `UPDATE finance_materials SET ... WHERE id = ?`
- **Проблема**: В WHERE нет `AND tenant_id = ?`. Злоумышленник с валидным токеном другого тенанта может изменить чужие материалы, зная id.
- **Критичность**: 🔴 Critical — нарушение мульти-тенантности
- **Рекомендация**: Добавить `AND tenant_id = ?` и привязать tenantId

### 🔴 P21 — UPDATE finance_materials SET quantity без tenant_id
- **Файл**: `cloudflare/src/routes/finance.ts:744`
- **Код**: `UPDATE finance_materials SET quantity = quantity - ? WHERE id = ?`
- **Проблема**: Аналогично P20 — нет проверки tenant_id при списании.
- **Критичность**: 🔴 Critical
- **Рекомендация**: Добавить `AND tenant_id = ?`

### 🟡 P22 — Race condition при списании материалов (TOCTOU)
- **Файл**: `cloudflare/src/routes/finance.ts:725-745`
- **Проблема**: Проверка `quantity > material.quantity` (строка 736) и `UPDATE quantity = quantity - ?` (строка 744) — не атомарны. Два параллельных запроса могут оба пройти проверку и списать больше остатка.
- **Критичность**: 🟡 Medium
- **Рекомендация**: Атомарная операция: `UPDATE SET quantity = quantity - ? WHERE id = ? AND quantity >= ?` + проверка rowCount

### 🟡 P23 — Нет валидации максимальной суммы оплаты
- **Файл**: `cloudflare/src/routes/finance.ts:441`
- **Проблема**: Проверяется `amount <= 0`, но нет верхней границы. Можно отправить оплату на 999 999 999 999 сум.
- **Критичность**: 🟡 Medium
- **Рекомендация**: Добавить `if (amount > MAX_PAYMENT) return error(...)`

### 🟡 P24 — Нет проверки isFinite/isNaN для числовых вводов
- **Файл**: `cloudflare/src/routes/finance.ts` — multiple parseFloat/Number()
- **Проблема**: `parseFloat()` может вернуть NaN/Infinity без валидации
- **Критичность**: 🟡 Medium
- **Рекомендация**: Добавить `Number.isFinite()` после каждого parseFloat

### ✅ Положительные результаты
- 0 SQL-инъекций (все запросы параметризованы через `.bind()`)
- 0 XSS уязвимостей (`dangerouslySetInnerHTML` не используется)
- 0 `console.log` в продакшн-коде
- 0 захардкоженных паролей/секретов
- Все DELETE-запросы содержат tenant_id
- Пагинация с лимитом 500 в helpers.ts

---

## ИТОГОВАЯ ТАБЛИЦА

| # | Проблема | Роль | Критичность | Файл | Строка |
|---|----------|------|-------------|------|--------|
| P01 | N+1 запрос в оплатах | Разработчик | 🔴 Critical | finance.ts | 461-479 |
| P06 | Активация пустой сметы | Директор | 🔴 Critical | finance.ts | 211-240 |
| P07 | Дефолт прибыли 9% vs 10% | Директор | 🔴 Critical | finance.ts | 120, 173 |
| P14 | Перевёрнутый баланс в акте сверки | Бухгалтер | 🔴 Critical | finance.ts | 806, 950 |
| P15 | Переплата не сохраняется | Бухгалтер | 🔴 Critical | finance.ts | 487 |
| P20 | UPDATE materials без tenant_id | QA | 🔴 Critical | finance.ts | 704 |
| P21 | UPDATE quantity без tenant_id | QA | 🔴 Critical | finance.ts | 744 |
| P02 | Дублированные файлы в utils | Разработчик | 🟡 Medium | utils/ | — |
| P03 | Мёртвый код performance.ts | Разработчик | 🟡 Medium | performance.ts | — |
| P04 | Мёртвый код statusColors.ts | Разработчик | 🟡 Medium | statusColors.ts | — |
| P08 | Запутанные имена полей БД | Директор | 🟡 Medium | finance.ts | 277 |
| P09 | Нет защиты от дубликатов смет | Директор | 🟡 Medium | finance.ts | 330 |
| P10 | Нет автодохода УК | Директор | 🟡 Medium | finance.ts | 575 |
| P11 | Materials GET без проверки роли | Житель | 🟡 Medium | finance.ts | 665 |
| P12 | Materials usage без проверки роли | Житель | 🟡 Medium | finance.ts | 718 |
| P16 | formatCurrency без дробных | Бухгалтер | 🟡 Medium | formatCurrency.ts | 8 |
| P17 | Оплаты без транзакции | Бухгалтер | 🟡 Medium | finance.ts | 461 |
| P18 | Должники без проверки due_date | Бухгалтер | 🟡 Medium | finance.ts | 557 |
| P22 | Race condition в материалах | QA | 🟡 Medium | finance.ts | 725 |
| P23 | Нет макс. суммы оплаты | QA | 🟡 Medium | finance.ts | 441 |
| P24 | Нет isFinite для parseFloat | QA | 🟡 Medium | finance.ts | — |
| P05 | 33 TODO/FIXME | Разработчик | 🟢 Low | разные | — |
| P13 | Мобильная адаптивность | Житель | 🟢 Low | ResidentDashboard | — |
| P19 | UX при повторной генерации | Бухгалтер | 🟢 Low | finance.ts | 330 |

**Итого**: 7 🔴 Critical, 14 🟡 Medium, 3 🟢 Low

---

## ИСПРАВЛЕНЫ В ЭТОМ АУДИТЕ

Ниже перечислены проблемы, которые были исправлены непосредственно в коде:

- **P07** — Дефолт прибыли в PUT выравнен с текущим значением сметы
- **P14** — Баланс в акте сверки исправлен: `totalCharged - totalPaid`
- **P20** — Добавлен `AND tenant_id = ?` в UPDATE finance_materials
- **P21** — Добавлен `AND tenant_id = ?` в UPDATE quantity
- **P06** — Добавлена валидация статей при активации сметы
- **P11** — Добавлена проверка `isManagement` на GET materials
- **P12** — Добавлена проверка `isManagement` на POST materials/:id/usage
- **P22** — Атомарная операция при списании материала
- **P02** — Удалены дублированные файлы utils
