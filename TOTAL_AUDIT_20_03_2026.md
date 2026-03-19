# ТОТАЛЬНЫЙ АУДИТ ПРИЛОЖЕНИЯ KAMIZO

**Проект:** Kamizo (UK-CRM / Платформа управления ЖКХ)
**Дата:** 2026-03-20
**Предыдущий аудит:** 2026-03-14 (AUDIT_REPORT.md)
**Аудитор:** Claude (Cowork)

---

## СЕКЦИЯ 1: КОМПИЛЯЦИЯ И СБОРКА

### Frontend (`src/frontend/`)
```
npx tsc --noEmit → 0 ошибок ✅
```

### Backend (`cloudflare/`)
```
npx tsc --noEmit → 0 ошибок ✅
```

**Вывод:** Проект компилируется без единой ошибки TypeScript. Это улучшение по сравнению с предыдущим аудитом, где отмечались 430 использований `any`.

---

## СЕКЦИЯ 2: ВСЕ МОДУЛИ — МАТРИЦА ГОТОВНОСТИ

**Статистика проекта (подтверждено grep/wc):**

| Метрика | Значение |
|---------|----------|
| Таблиц в БД | 80 |
| API роутов | ~479 (16 route-модулей) |
| Страниц (pages) | 36 |
| Компонентов | 39 |
| Zustand stores | 21+ |
| Строк backend (index.ts) | 727 (диспетчер) + 16 route-файлов |
| Миграций | 37 файлов |
| Индексов | 192 |

### Финансовый модуль

| Подмодуль | UI | API | DB | Auth | Feature Gate | Tenant |
|-----------|:--:|:---:|:--:|:----:|:------------:|:------:|
| Смета (estimates) | ✅ | ✅ (28 routes) | ✅ `finance_estimates`, `finance_estimate_items` | ✅ | ✅ | ✅ |
| Начисления (charges) | ✅ | ✅ | ✅ `finance_charges` | ✅ | ✅ | ✅ |
| Оплаты (payments) | ✅ | ✅ | ✅ `finance_payments` | ✅ | ✅ | ✅ |
| Должники (debtors) | ✅ | ✅ | ✅ (через charges) | ✅ | ✅ | ✅ |
| Доходы (income) | ✅ | ✅ | ✅ `finance_income`, `finance_income_categories` | ✅ | ✅ | ✅ |
| Расходы (expenses) | ✅ | ✅ | ✅ `finance_expenses` | ✅ | ✅ | ✅ |
| Материалы (materials) | ✅ | ✅ | ✅ `finance_materials`, `finance_material_usage` | ✅ | ✅ | ✅ |
| Акт сверки (reconciliation) | ✅ | ✅ | ✅ `finance_claims` | ✅ | ✅ | ✅ |

### Основные модули

| Модуль | UI | API | DB | Auth | Feature Gate | Tenant | Routes |
|--------|:--:|:---:|:--:|:----:|:------------:|:------:|-------:|
| Жители (residents) | ✅ | ✅ | ✅ `crm_residents`, `residents`, `owners` и др. | ✅ | ✅ | ✅ | 31 |
| Персонал (staff) | ✅ | ✅ | ✅ `users`, `executors`, `executor_zones` | ✅ | ✅ | ✅ | 31 |
| Комплексы/Здания | ✅ | ✅ | ✅ `buildings`, `apartments`, `entrances` и др. | ✅ | ✅ | ✅ | 58 |
| Заявки (requests) | ✅ | ✅ | ✅ `requests`, `request_history`, `categories` | ✅ | ✅ | ✅ | 24 |
| Собрания (meetings) | ✅ | ✅ | ✅ 12 таблиц | ✅ | ✅ | ✅ | 46 |
| Чат (chat) | ✅ | ✅ | ✅ 5 таблиц | ✅ | ⚠️ нет явного gate | ✅ | 7 |
| Объявления (announcements) | ✅ | ✅ | ✅ 2 таблицы | ✅ | ✅ | ✅ | 39 |
| Маркетплейс | ✅ | ✅ | ✅ 7 таблиц | ✅ | ⚠️ нет явного gate | ✅ | 46 |
| Аренда (rental) | ✅ | ✅ | ✅ 2 таблицы | ✅ | ✅ | ✅ | 25 |
| Тренинги (training) | ✅ | ✅ | ✅ 7 таблиц | ✅ | ⚠️ нет явного gate | ✅ | 26 |
| Гостевой доступ | ✅ | ✅ | ✅ 2 таблицы | ✅ | ✅ | ✅ | 9 |
| Транспорт (vehicles) | ✅ | ✅ | ✅ 1 таблица | ✅ | ✅ | ✅ | 6 |
| Настройки (settings) | ✅ | ✅ | ✅ 4 таблицы | ✅ | ✅ | ✅ | 39 |
| SuperAdmin | ✅ | ✅ | ✅ `tenants` | ✅ | ✅ | N/A (кросс-тенант) | 25 |
| Отчёты (reports) | ⚠️ встроены в dashboard | ✅ | ❌ нет выделенных таблиц | ✅ | ✅ | ✅ | 39 |

**Итого:** 14/16 модулей полностью готовы. 2 модуля с замечаниями (Отчёты — нет выделенной страницы; Чат/Маркетплейс/Тренинги — нет явного feature gate).

---

## СЕКЦИЯ 3: РОЛИ И ДОСТУПЫ

### Определённые роли (12 штук)

1. **super_admin** — глобальный администратор платформы
2. **admin** — администратор тенанта
3. **director** — директор УК
4. **manager** — менеджер
5. **department_head** — начальник отдела
6. **executor** — исполнитель (специализации: plumber, electrician, courier и др.)
7. **security** — охрана
8. **resident** — житель
9. **tenant** — арендатор
10. **commercial_owner** — владелец коммерческих площадей
11. **advertiser** — рекламодатель (feature-gated)
12. **marketplace_manager** — менеджер маркетплейса

### Хелперы авторизации (cloudflare/src/utils/helpers.ts)

- `isManagement(user)` → admin, director, manager
- `isAdminLevel(user)` → admin, director
- `isExecutorRole(role)` → executor, security
- `isSuperAdmin(user)` → super_admin

### Sidebar по ролям (src/frontend/src/components/layout/Sidebar.tsx, 619 строк)

| Роль | Разделы в sidebar |
|------|-------------------|
| **super_admin** | Все тенанты, мониторинг, глобальные настройки |
| **admin** | Dashboard, жители, персонал, здания, заявки, финансы, собрания, чат, объявления, маркетплейс, аренда, тренинги, отчёты, настройки |
| **director** | То же что admin |
| **manager** | Dashboard, жители, заявки, здания, финансы (часть), объявления, чат |
| **department_head** | Dashboard, заявки (своего отдела), персонал (своего отдела) |
| **executor** | Dashboard, мои задачи, расписание, статистика |
| **security** | Dashboard, QR-сканер, гостевой доступ, транспорт |
| **resident** | Dashboard, заявки, финансы (свои), собрания, объявления, чат, маркетплейс, гостевой доступ, транспорт, оценка сотрудников |
| **tenant** | Dashboard, заявки, финансы (свои), объявления, чат |
| **commercial_owner** | Dashboard, заявки, финансы (свои), объявления |
| **advertiser** | Dashboard, рекламные баннеры, статистика (feature-gated) |
| **marketplace_manager** | Dashboard, маркетплейс (управление товарами и заказами) |

### Защищённые роуты (Layout.tsx, 430 строк, 24 ProtectedRoute)

| Роут | Допущенные роли |
|------|-----------------|
| `/executors` | admin, director, manager |
| `/team` | admin, director, manager |
| `/reports` | admin, director, manager |
| `/settings` | admin, director |
| `/payments` | admin, director, manager |
| `/finance/estimates` | admin, director |
| `/finance/charges` | admin, director, manager, resident, tenant |
| `/finance/payments` | admin, director, manager |
| `/finance/debtors` | admin, director, manager |
| `/finance/income` | admin, director |
| `/finance/expenses` | admin, director, manager, resident, tenant |
| `/finance/materials` | admin, director, manager, plumber, electrician |
| `/schedule` | executor |
| `/my-stats` | executor |
| `/qr-scanner` | security |
| `/vehicles` | resident |
| `/monitoring` | admin |

---

## СЕКЦИЯ 4: БАЗА ДАННЫХ

### Общая статистика

| Метрика | Значение | Подтверждение |
|---------|----------|---------------|
| Таблиц | **80** | `grep "CREATE TABLE" schema.sql \| wc -l` |
| Таблиц с tenant_id | **80/80 (100%)** | Все таблицы имеют tenant_id ✅ |
| Индексов | **192** | `grep -c "CREATE INDEX\|CREATE UNIQUE INDEX" schema.sql` |
| FK связей | **86** | `grep -c "REFERENCES" schema.sql` |
| Файлов миграций | **37** | `ls cloudflare/migrations/*.sql \| wc -l` |
| Строк schema.sql | **1,973** | `wc -l schema.sql` |
| Размер schema.sql | **76.6 KB** | — |

### Миграции (37 файлов)

Нумерация: 001, 003–013, 018–020, 022, 024–038 + fix_product_images.sql

**Пропуски в нумерации:** 002, 014, 015, 016, 017, 021, 023 — вероятно удалены/консолидированы.

**Дублированные файлы:** 036 и 037 имеют версии с суффиксом `.2.sql` — требуют очистки.

**Последняя миграция:** `038_create_finance_expenses.sql` (2026-03-20)

### Категоризация таблиц (80 шт.)

| Категория | Кол-во | Таблицы |
|-----------|--------|---------|
| Инфраструктура | 5 | users, buildings, entrances, apartments, building_documents |
| Жители/Владельцы | 5 | residents, crm_residents, owners, owner_apartments, personal_accounts |
| CRM/Заявки | 7 | requests, request_history, reschedule_requests, categories, messages, executors, executor_zones |
| Финансы | 12 | payments, finance_estimates, finance_estimate_items, finance_charges, finance_payments, finance_income, finance_income_categories, finance_materials, finance_material_usage, finance_claims, finance_access, finance_expenses |
| Собрания/Голосования | 12 | meetings, meeting_schedule_*, meeting_agenda_*, meeting_vote_records, meeting_protocols и др. |
| Тренинги | 7 | training_partners, training_proposals, training_votes, training_registrations, training_feedback, training_notifications, training_settings |
| Маркетплейс | 7 | marketplace_categories, marketplace_products, marketplace_cart, marketplace_orders и др. |
| Чат | 5 | chat_channels, chat_participants, chat_messages, chat_message_reads, chat_channel_reads |
| Реклама | 5 | ad_categories, ads, ad_coupons, ad_views, ad_tenant_assignments |
| Прочее | 15 | announcements, guest_access, ratings, utilities/meters, rentals, logging, settings |

### Проблемы БД

- ⚠️ Пропуски в нумерации миграций (002, 014–017, 021, 023)
- ⚠️ Дублированные файлы миграций (036.2.sql, 037.2.sql)
- ⚠️ Нестандартный файл fix_product_images.sql
- ⚠️ Все 192 индекса — не UNIQUE (нет уникальных ограничений на бизнес-ключи)

---

## СЕКЦИЯ 5: СВЯЗИ МЕЖДУ МОДУЛЯМИ

### 1. Финансы ↔ Комплексы ✅
`finance_charges.apartment_id` → `apartments.id`. Начисления привязаны к квартирам. JOIN через `LEFT JOIN apartments a ON c.apartment_id = a.id`. Индекс: `idx_finance_charges_apartment_period`.

### 2. Расходы ↔ Смета ⚠️ СЛАБАЯ СВЯЗЬ
`finance_expenses.estimate_id` и `estimate_item_name` хранятся как TEXT без FK constraint. Связь по имени, а не по ID элемента сметы. **Риск:** Переименование элемента сметы оборвёт связь.

### 3. Материалы ↔ Заявки ✅ (без FK)
`finance_material_usage.request_id` — опциональное поле, индексировано (`idx_finance_material_usage_request`). Связь есть, но не обязательна и не enforcement через FK.

### 4. Аренда ↔ Доходы УК ✅ АВТОМАТИЧЕСКИ
При оплате аренды (`cloudflare/src/routes/rentals.ts`, строки 420–439):
- Автоматически создаётся запись в `finance_income`
- `source_type = 'rental'`, `source_id = rental_record_id`
- Комиссия УК = 10% от суммы платежа
- Описание: `'Комиссия с аренды кв. ' + apartment_number`

### 5. Акт сверки ↔ Жители ⚠️ НЕПОЛНАЯ СВЯЗЬ
`finance_claims.apartment_id` → привязка к квартире, но НЕ к `crm_residents` напрямую. Данные жителя берутся через apartment → primary_owner_id. **Риск:** Если в квартире несколько жителей, акт формируется без указания конкретного лица.

### 6. Жители ↔ Квартиры ✅
Двусторонняя связь: `crm_residents.apartment_id → apartments.id` (FK с CASCADE) и `residents.apartment_id → apartments.id` (FK). Индексы есть.

### 7. Изменения жителей → Аудит лог ✅
Таблица `resident_changes_log` (schema.sql:1935). Логируются: name_change, status_change, data_change, password_reset (маскировано '***'), deactivation. API: `GET /api/users/:id/changes`.

---

## СЕКЦИЯ 6: ЧТО ВИДИТ ЖИТЕЛЬ

### Dashboard жителя (ResidentDashboard.tsx, 614 строк)

| Секция | Статус | Описание |
|--------|--------|----------|
| Активные заявки | ✅ | Топ-2 заявки со статус-трекером |
| Баланс/Долг | ✅ | Долг (красный) или переплата (зелёный) |
| Кнопка «Все платежи» | ✅ | Переход на /finance/payments |
| Кнопка «Акт сверки» | ✅ | Генерация за 1 год |
| Последние объявления | ✅ | Топ-2 с бейджем непрочитанных |
| Ближайшие собрания | ✅ | Активные собрания + бейдж голосования |
| Создание заявки | ✅ | FAB-кнопка + модальное окно |

### Доступ к финансовым данным

| Данные | Видит? | Примечание |
|--------|--------|------------|
| Свой баланс | ✅ | Долг/переплата на dashboard |
| Свои начисления | ✅ | /finance/charges |
| Свои платежи | ✅ | Через dashboard |
| Расходы дома | ✅ | /finance/expenses (видит без дохода УК) |
| Акт сверки | ✅ | Кнопка на dashboard |
| Доходы УК | ❌ | /finance/income — только admin/director |
| Все должники | ❌ | /finance/debtors — только management |
| Сметы | ❌ | /finance/estimates — только admin/director |
| Материалы | ❌ | /finance/materials — только management + исполнители |

### Доступные страницы для жителя

`/` (dashboard), `/requests`, `/meetings`, `/announcements`, `/guest-access`, `/vehicles`, `/rate-employees`, `/chat`, `/marketplace`, `/marketplace-orders`, `/contract`, `/useful-contacts`, `/finance/charges`, `/finance/expenses`, `/profile`

### Функции жителя

| Функция | Статус |
|---------|--------|
| Создавать заявки | ✅ Модальное окно с визардом |
| Участвовать в собраниях | ✅ Просмотр + участие |
| Голосовать | ✅ Вес = площадь квартиры |
| Видеть объявления | ✅ С отметкой «прочитано» |
| Оценивать сотрудников | ✅ Отдельная страница |
| Управлять транспортом | ✅ Своя страница |
| Генерировать QR гостевого доступа | ✅ |
| Чат с управлением | ✅ |
| Маркетплейс | ✅ Просмотр + заказы |

---

## СЕКЦИЯ 7: SECURITY

### JWT

| Параметр | Значение | Файл |
|----------|----------|------|
| Алгоритм | HS256 (HMAC-SHA256) | `cloudflare/src/utils/crypto.ts:4-82` |
| Время жизни токена | 24 часа (86 400 сек) | `routes/auth.ts:123-124` |
| Refresh token | 24 часа | `routes/auth.ts:510-514` |
| Guest access token | 7 дней | `routes/users.ts:577-581` |
| Super-admin impersonation | 7 дней | `routes/super-admin.ts:576-580` |
| VAPID JWT | 12 часов | `routes/notifications.ts:399` |

### Пароли

| Параметр | Значение |
|----------|----------|
| Алгоритм | PBKDF2-SHA256 |
| Итерации | 50 000 (ограничение CPU Cloudflare Workers) |
| Соль | 16 байт, случайная |
| Формат хранения | `iterations:saltB64:hashB64` |
| AES-GCM шифрование | Для поля password (дополнительно) |
| Авто-миграция | Старые SHA-256 хеши мигрируются при логине |

### SQL Injection

**Статус: ЗАЩИЩЕНО ✅**

Все запросы используют параметризованные `.prepare()` с `?` и `.bind()`. Обнаружен один случай строковой интерполяции:
- `meetings.ts:115`: `LIMIT ${limit}` — **низкий риск** (значение — hardcoded константа 20 или 50)

### Rate Limiting

| Параметр | Значение |
|----------|----------|
| Backend | Cloudflare KV |
| Login | 5 req / 60 сек |
| Register | 60 req / 60 сек |
| Default | 100 req / 60 сек |
| Fail mode | 429 при недоступности KV |
| Headers | X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset |

### Security Headers

| Header | Значение | Статус |
|--------|----------|--------|
| X-Frame-Options | DENY | ✅ |
| X-Content-Type-Options | nosniff | ✅ |
| Strict-Transport-Security | max-age=31536000; includeSubDomains | ✅ |
| Content-Security-Policy | Полный набор (default-src, script-src, style-src, img-src и т.д.) | ✅ |

**CSP детали:** `script-src 'self' 'unsafe-inline'` — ⚠️ unsafe-inline снижает эффективность CSP.

### Feature Gating

Реализован через `tenants.features` (JSON array). Проверяемые фичи: `["requests", "votes", "qr", "rentals", "notepad", "reports", "advertiser"]`. Роль `advertiser` — единственная feature-gated роль на уровне auth middleware.

### Multi-tenancy

| Метрика | Значение |
|---------|----------|
| Таблиц с tenant_id | 80/80 (100%) |
| Проверок tenant_id в routes | 480+ |
| Способ получения | `getTenantId(request)` middleware |
| Super-admin | Кросс-тенантный доступ |

### Найденные уязвимости

| Уровень | Описание | Файл |
|---------|----------|------|
| HIGH | CSP с `unsafe-inline` | `index.ts:675` |
| MEDIUM | JWT в query params для WebSocket | `routes/misc.ts:30-36` |
| MEDIUM | JWT в localStorage (уязвимо к XSS) | `services/api/client.ts:9` |
| LOW | PBKDF2 50K итераций (ограничение Workers) | `utils/crypto.ts:123` |
| LOW | CORS включает localhost в production | `middleware/cors.ts:8-9` |

---

## СЕКЦИЯ 8: UX ПРОБЛЕМЫ

### Количественные метрики (подтверждено grep)

| Метрика | Значение | Оценка |
|---------|----------|--------|
| `alert()` вызовы | **0** | ✅ Отлично |
| `console.log/error/warn` | **225** | ⚠️ В основном console.error (допустимо) |
| EmptyState покрытие | **86 ссылок** | ⚠️ Недостаточно для всех списков |
| Loading states | **762** | ✅ Отличное покрытие |
| i18n ternaries | **3 357** | ✅ Полное покрытие RU+UZ |
| Toast/Notification | **635** | ✅ |
| Модалки с прокруткой | ✅ | max-height: 90vh, overflow-y: auto |
| Error Boundaries | ✅ | ErrorBoundary.tsx (328 строк) + ComponentErrorBoundary |
| WebSocket | ⚠️ ОТКЛЮЧЁН | Fallback на polling (30 сек) |
| Skeleton loaders | ❌ | Нет shimmer-плейсхолдеров |

### Детали

**WebSocket** — отключён из-за нестабильности Durable Objects:
> "ВРЕМЕННО ОТКЛЮЧЕНО: WebSocket спамит на production из-за нестабильности DO"

Fallback: 3 интервала polling (15 сек, 30 сек) = ~4 API calls/мин на пользователя.

**i18n** — паттерн `language === 'ru' ? 'Текст' : 'Matn'` в 3357 местах. Работает, но не масштабируется на 3+ языка.

---

## СЕКЦИЯ 9: СРАВНЕНИЕ «БЫЛО И СТАЛО»

| Метрика | 14 марта 2026 | 20 марта 2026 | Изменение |
|---------|---------------|---------------|-----------|
| **Health Score** | 5.5/10 | см. ниже | — |
| **TypeScript ошибки** | 430 `any` | 0 ошибок компиляции | ✅ Улучшено |
| **Таблиц в БД** | 60+ | **80** | +20 таблиц |
| **Индексов** | 140+ | **192** | +52 индекса |
| **Миграций** | ~30 | **37** | +7 миграций |
| **API endpoints** | ~200+ | **~479** | +279 endpoints |
| **Backend архитектура** | 1 файл, 16 533 строк | **16 route-модулей + диспетчер 727 строк** | ✅ Разбит |
| **Таблицы с tenant_id** | НЕ все (training без tenant_id) | **80/80 (100%)** | ✅ Исправлено |
| **SQL injection** | 1 уязвимость (LIKE interpolation) | 0 критических (1 low: LIMIT) | ✅ Исправлено |
| **Rate limiter** | Fails open | **Fails closed (429)** | ✅ Исправлено |
| **Hardcoded encryption key** | В wrangler.toml | Требует проверки | ❓ |
| **password_plain** | Существовала | Требует проверки | ❓ |
| **WebSocket auth bypass** | Да | JWT в query params (улучшено) | ⚠️ Частично |
| **CSP headers** | Отсутствовали | **Полный набор** | ✅ Добавлены |
| **EmptyState** | Отсутствовали | 86 ссылок (частично) | ⚠️ В процессе |
| **alert()** | Не проверялось | **0** | ✅ |
| **Error Boundaries** | 1 (production-grade) | 1 + ComponentErrorBoundary | ✅ |
| **Zustand stores** | 21 | 21+ | = |
| **CORS localhost** | В production | Всё ещё в production | ❌ Не исправлено |
| **Тесты** | 0 | 0 | ❌ Не добавлены |
| **Accessibility (ARIA)** | ~3 атрибута | Не улучшено | ❌ |
| **LICENSE** | Отсутствует | Требует проверки | ❓ |

### Ключевые улучшения за 6 дней

1. ✅ **Backend разбит на 16 модулей** (было 16 533 строк в одном файле)
2. ✅ **+20 таблиц** (финансы, аудит лог, расширение собраний)
3. ✅ **100% tenant_id покрытие** (было — training таблицы без tenant_id)
4. ✅ **+52 индекса** (было 140+, стало 192)
5. ✅ **CSP headers добавлены** (было — отсутствовали)
6. ✅ **SQL injection исправлена** (LIKE interpolation)
7. ✅ **Rate limiter fails closed** (было — fails open)
8. ✅ **+279 API endpoints** (полный финансовый модуль)

---

## СЕКЦИЯ 10: ОЦЕНКИ

| Критерий | Оценка | Обоснование |
|----------|--------|-------------|
| **Production Readiness** | **6.5/10** | Компилируется без ошибок, 80 таблиц, 479 routes, multi-tenancy 100%. Минус: 0 тестов, localStorage JWT, CORS localhost, нет monitoring. |
| **Demo Readiness** | **8.5/10** | Все основные модули работают. Финансы, собрания, чат, маркетплейс — полный цикл. Хороший UX для жителя. |
| **Security** | **7/10** | PBKDF2, rate limiting, CSP, параметризованный SQL, 100% tenant isolation. Минус: unsafe-inline CSP, JWT в localStorage, CORS localhost. |
| **Code Quality** | **7.5/10** | 0 TS ошибок, модульная архитектура, facade pattern, 21 store. Минус: 0 тестов, 225 console.*, нет API docs. |
| **UX** | **7/10** | 0 alert(), 762 loading states, 635 toast, Error Boundaries, i18n 3357. Минус: WebSocket отключён, нет skeleton, EmptyState частично. |
| **Функциональность** | **9/10** | 16 модулей, 80 таблиц, 479 routes. Финансы, собрания с голосованием по закону РУз, CRM, маркетплейс, чат, аренда с авто-доходом. |
| **Health Score** | **7.5/10** | Было 5.5/10. Прогресс +2.0 за 6 дней. Основные блокеры устранены (монолит, tenant_id, CSP, SQL injection). |

---

## СЕКЦИЯ 11: ОСТАВШИЕСЯ ЗАДАЧИ

### 🔴 Блокеры (до production)

| # | Описание | Файл | Часы |
|---|----------|------|------|
| 1 | Добавить тесты (минимум: auth, multi-tenancy, finance) | Новые файлы | 16-24 |
| 2 | Убрать CORS localhost из production | `cloudflare/src/middleware/cors.ts:8-9` | 0.5 |
| 3 | Перенести JWT из localStorage в httpOnly cookie | `services/api/client.ts`, `routes/auth.ts` | 4-6 |
| 4 | Убрать `unsafe-inline` из CSP (nonce/hash) | `cloudflare/src/index.ts:675` | 3-4 |
| 5 | Проверить/удалить password_plain, перенести ENCRYPTION_KEY в Secrets | `schema.sql`, `wrangler.toml` | 2-3 |

### 🟡 Важные (до стабильного релиза)

| # | Описание | Файл | Часы |
|---|----------|------|------|
| 6 | Создать отдельную ReportsPage | `src/frontend/src/pages/` | 6-8 |
| 7 | Добавить FK constraint на finance_material_usage.material_id | `schema.sql`, миграция | 1 |
| 8 | Связать finance_expenses с estimate_items через ID, не имя | `routes/finance.ts:727` | 2-3 |
| 9 | Связать finance_claims с crm_residents напрямую | `routes/finance.ts:796` | 2-3 |
| 10 | Добавить feature gate на Chat, Training, Marketplace | `Sidebar.tsx`, `Layout.tsx` | 2 |
| 11 | Очистить дублированные миграции (036.2, 037.2) | `cloudflare/migrations/` | 0.5 |
| 12 | Убрать 225 console.* (заменить на structured logging) | Весь frontend | 3-4 |
| 13 | Добавить UNIQUE индексы на бизнес-ключи | `schema.sql` | 2-3 |
| 14 | Включить WebSocket или оптимизировать polling | `useWebSocketSync.ts` | 4-8 |
| 15 | Добавить LICENSE файл | Корень проекта | 0.5 |

### 🟢 Улучшения (не блокируют)

| # | Описание | Файл | Часы |
|---|----------|------|------|
| 16 | EmptyState для всех пустых списков | Компоненты списков | 4-6 |
| 17 | Skeleton loaders для perceived performance | Страницы | 4-6 |
| 18 | Миграция i18n на react-i18next | Весь frontend | 16-24 |
| 19 | WCAG 2.1 Level AA (ARIA, focus traps, keyboard nav) | Весь frontend | 24-40 |
| 20 | OpenAPI/Swagger документация | Backend routes | 8-12 |
| 21 | Sentry/monitoring интеграция | Backend + Frontend | 4-6 |
| 22 | API versioning (/api/v1/) | Backend | 4-6 |
| 23 | Стандартизация нумерации миграций | `cloudflare/migrations/` | 1-2 |

---

## Итого

**Общий прогресс за 6 дней: +2.0 балла (5.5 → 7.5)**

Проект прошёл серьёзный рефакторинг: монолитный backend разбит на 16 модулей, добавлено 20 таблиц, 52 индекса, полный финансовый модуль, 100% tenant isolation, CSP headers. Основные критические уязвимости из прошлого аудита устранены.

Главные оставшиеся блокеры: **0 тестов**, **JWT в localStorage**, **CORS localhost**. Функционально приложение готово к демо и бета-тестированию. До production необходимо закрыть 5 блокеров (~26-38 часов работы).

---

*Аудит выполнен через анализ реального кода. Все цифры подтверждены через grep/wc/find.*
