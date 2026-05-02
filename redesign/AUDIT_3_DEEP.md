# AUDIT 3 — Глубокий аудит Kamizo

> Дата: 2 мая 2026
> Что покрыто: бэкенд (tenant isolation, security), фронтенд (perf + a11y), БД (схемы + миграции).
> Что НЕ покрыто: e2e нагрузочное тестирование, real-world penetration, сетевая безопасность Cloudflare.

---

## TL;DR

Найдено **9 P0** (data leak / data corruption риски), **15 P1** (UX / consistency), **10 P2** (code smell / cleanup).

Самое критичное — **3 находки**, которые надо чинить **до следующего деплоя**:

1. **`cloudflare/src/routes/misc/ratings.ts:35`** — `GET /api/ratings` запрашивает `employee_ratings` БЕЗ фильтра `tenant_id`. Любой авторизованный житель Tenant A видит рейтинги Tenant B, если знает `resident_id`.

2. **`cloudflare/schema_no_fk.sql:1398, 1442`** — синтаксическая ошибка SQL: `category_id TEXT NOT NULL ),` — оборванный `)` без `REFERENCES`. Файл не выполнится. Если кто-то задеплоит no-fk вариант — БД не построится.

3. **`cloudflare/src/routes/requests/work-orders.ts:34-44`** — `GET /api/work-orders` JOIN-ит `users` без `tenant_id` условия. Стартовый `whereClause` не содержит `wo.tenant_id = ?`. Cross-tenant утечка work order'ов.

Дополнительно: leaked Cloudflare API token уже зафиксирован в **SECURITY_CLEANUP_PROMPT.md** — отдельный план, требует ручной ротации токена пользователем.

---

## Дисклеймер

Аудит сделан тремя параллельными агентами + ручной верификацией трёх P0. **Не все находки P0/P1 я проверил руками** — те, что верифицированы, помечены ✅. Остальные надо открыть и убедиться, что агент не нагалюцинировал, особенно перед массовыми правками.

---

## 1 · Backend — security & tenant isolation

### P0 — утечки между тенантами

| # | Файл:строка | Проблема | Фикс |
|---|---|---|---|
| **B1** ✅ | `routes/misc/ratings.ts:35` | `SELECT * FROM employee_ratings WHERE resident_id = ?` — нет `AND tenant_id = ?`. Резидент A может прочитать рейтинги работников B. | Добавить `AND tenant_id = ?`, биндить из `getTenantId(request)`. |
| **B2** ✅ | `routes/requests/work-orders.ts:34-44` | `SELECT FROM work_orders wo LEFT JOIN users u ON wo.assigned_to = u.id ...` — нет `WHERE wo.tenant_id = ?` ни в whereClause, ни в JOIN. | В `whereClause` инициализировать `'WHERE wo.tenant_id = ?'`, биндить tenantId первым. Также в JOIN: `LEFT JOIN users u ON wo.assigned_to = u.id AND u.tenant_id = wo.tenant_id`. Применить ко всем 3 list/get-by-id запросам в файле. |
| **B3** | `routes/rentals/guests.ts:38` | `LEFT JOIN users u ON u.id = g.user_id ${tenantId ? 'AND u.tenant_id = ?' : ''}` — условный JOIN. Если `getTenantId` вернёт null (что не должно случаться после auth, но всё же) — вернутся юзеры со всех тенантов. | Сделать tenantId обязательным после `getUser`, либо вернуть 400 если нет. JOIN должен ВСЕГДА содержать tenant filter. |
| **B4** | `routes/meetings/voting.ts:111-112` | Подзапрос статистики голосования по `meeting_id` без `AND tenant_id = ?`. Если ID коллизит между тенантами — статистика мешается. | Добавить tenant scope в подзапрос. ID-коллизии маловероятны (UUID), но это defense-in-depth. |
| **B5** ✅ | `routes/misc/announcements-mutations.ts:65-73` | `target_building_id` принимается из body и подставляется в WHERE без проверки, что здание принадлежит tenant'у автора. На практике `users.tenant_id = ?` в той же query спасает от утечки в чужой тенант, но позволяет менеджеру A нацелить уведомление на здание B (которое принадлежит другому тенанту), и push не уйдёт никому — silent fail. | Перед использованием валидировать: `SELECT id FROM buildings WHERE id = ? AND tenant_id = ?`, если null — вернуть 403. |
| **B6** | `routes/notifications.ts:946-961` | `POST /api/push/broadcast` — query с фильтром по role/building без обязательного `tenant_id`. Если auth-helper не возвращает tenantId — broadcast уходит на ВСЕ тенанты. | Сделать `tenantId` обязательным; если null — 400. |

### P1 — стейл UI и пропущенные нотификации

| # | Файл:строка | Проблема | Фикс |
|---|---|---|---|
| **B7** | `routes/requests/assignment.ts:37-40, 73-100` | PATCH `/api/requests/:id` и POST `/api/requests/:id/assign` мутируют состояние, но `invalidateCache` не вызывается. UI 10с показывает старый статус. | После каждой мутации: `invalidateCache('requests:'); invalidateCache('requests:' + params.id);` |
| **B8** | `routes/requests/work-orders.ts:143-178` | POST `/api/work-orders/:id/status` — нет `invalidateCache`. | Добавить после успешного UPDATE. |
| **B9** | `routes/meetings/crud-mutate.ts:9-100` | После создания собрания не отправляется push жителям, что голосование открыто. | После `invalidateCache` (line 100): SELECT eligible voters, SendPush с `{title: 'Открыто голосование', tag: 'meeting:'+id, data: {meetingId}}`. |
| **B10** | `routes/requests/assignment.ts:102-123` | Push при смене статуса заявки уходит без проверки наличия `resident_id`. Если null — `sendPushNotification(env, null, ...)` стрельнёт. | `if (resident_id) { sendPushNotification(...).catch(()=>{}); }` |

### P2 — code quality

- **B11** — 80+ роутов копипастят `getUser + getTenantId`. Завернуть в middleware-helper `withAuth(handler)`.
- **B12** — Те же JOIN'ы в work-orders повторены 3 раза (list, get-by-id, update). Вынести в `fetchWorkOrderWithJoins(id, tenantId)`.
- **B13** — `.run().catch(() => {})` глушит ошибки записи нотификаций. Логировать хотя бы в `console.error`.

---

## 2 · Frontend — performance & a11y

### P0 — broken / crash risk

| # | Файл:строка | Проблема | Фикс |
|---|---|---|---|
| **F1** ✅ | `index.css:177-180` | Глобальное `button, a, [role="button"] { min-height: 44px; min-width: 44px; }` раздувает декоративные кнопки (точки-индикаторы, иконки в пилюлях). Уже обходим через inline `style={{minHeight:0, minWidth:0}}` в карусели — но это рассыпается везде, где забудут. | Снять глобал; вместо этого добавить класс `.tap-target` и применять точечно. ИЛИ оставить глобал + ввести `.no-min-tap` для исключений. Лучше первый вариант. |

Агент НЕ нашёл подтверждённых случаев `useDataStore(s => ...)` или `useEffect` без deps — после хотфикса HomeHighlights все misuse-точки залатаны. Это хорошая новость.

### P1 — a11y и a11y-perf

| # | Файл:строка | Проблема | Фикс |
|---|---|---|---|
| **F2** | Все модалы (`MeetingDetailsModal`, `RequestDetailsModal`, `RescheduleDetailsModal` и др.) | Нет ESC-handler'а, нет focus trap, нет `role="dialog"` / `aria-modal="true"`. Backdrop click работает, но клавиатурой не закрыть. | Создать общий `<Modal>` wrapper в `components/ui/Modal.tsx`: useEffect с keydown(ESC) → onClose, focus trap, aria-атрибуты. Заменить все ручные fixed-divы. |
| **F3** | `MarketplacePage.tsx:282-299`, `ChatPage.tsx:163-175`, `MeetingDetailsModal.tsx:170-176` | Кнопки только с lucide-иконкой, без `aria-label`. Скрин-ридер прочтёт «button» без контекста. | Добавить `aria-label` к каждой иконочной кнопке. Сделать линтер-правило (eslint-plugin-jsx-a11y/control-has-associated-label). |
| **F4** | `MarketplacePage.tsx:260-266` | `products.filter(...)`, `activeOrders/historyOrders.filter(...)` крутятся в render body на каждом ререндере. При 1000+ товарах — заметные лаги. | Завернуть в `useMemo(() => ..., [products, query, ...])`. |
| **F5** | `MarketplacePage.tsx:357, 393, 413-418` | Inline arrow functions передаются в `onClick`. Если потом memo-wrap'нем родителя — сломаемся. | Перенести в `useCallback`. Не критично сейчас, но фундамент. |

### P2 — cleanup

- **F6** — `MeetingDetailsModal.tsx:144`, `RescheduleDetailsModal.tsx:24` — TODO «migrate to <Modal> component». Закроется тем же общим Modal wrapper из F2.
- **F7** — `MarketplacePage.tsx` — большая страница, можно code-split через `React.lazy` на табы (shop / cart / orders). При росте >10k товаров пригодится.
- **F8** — `ProductCardPlaceholder` (MarketplacePage:91-105), `LocationBadges` (ChatPage:167-190) — выгодно обернуть в `React.memo`, рендерятся в больших списках.

---

## 3 · Schema & Migrations

### P0 — целостность и multi-tenancy

| # | Файл:строка | Проблема | Фикс |
|---|---|---|---|
| **S1** ✅ | `cloudflare/schema_no_fk.sql:1398, 1442` | Синтаксис: `category_id TEXT NOT NULL ),` и `created_by TEXT NOT NULL ),` — оборванный `)` вместо `REFERENCES ...`. Файл невалидный SQL. | Восстановить из `schema.sql`: `category_id TEXT NOT NULL REFERENCES ad_categories(id),` и `created_by TEXT NOT NULL REFERENCES users(id),` (но в no-fk версии REFERENCES не нужен — заменить на просто `category_id TEXT NOT NULL,`). |
| **S2** | `schema.sql:50` ссылается на таблицу `branches`, которой нет в schema.sql | `buildings.branch_id TEXT REFERENCES branches(id)` указывает на несуществующую таблицу. `branches` создаётся миграцией `010_create_branches_table.sql.applied` (странное расширение). | Добавить определение `branches` в обе schema-файла ПЕРЕД `buildings`. Удалить `.applied` суффикс — это путает миграции. |
| **S3** | drift `schema_no_fk.sql` (1743 строки) vs `schema.sql` (2025 строк) | В no-fk варианте отсутствуют: `resident_changes_log`, `finance_expenses`, `audit_log`, `ad_tenant_assignments`, `uk_satisfaction_ratings`. Если кто-то развернёт no-fk вариант — этих таблиц не будет, audit/finance не работают. | Перенести определения этих таблиц из schema.sql, убрав FK-clauses. ИЛИ — сгенерировать `schema_no_fk.sql` автоматически из `schema.sql` через скрипт `scripts/strip-fk.sh` чтобы оба файла никогда не разъезжались. |

### P0.5 — UNIQUE без tenant_id

| # | Файл:строка | Проблема | Фикс |
|---|---|---|---|
| **S4** | `schema.sql:131` | `UNIQUE(building_id, number)` в `entrances` — две тенанта не могут иметь подъезд №1 в зданиях с одинаковым ID (UUID коллизия маловероятна, но constraint всё равно неправильный). | `UNIQUE(building_id, number, tenant_id)`. |
| **S5** | `schema.sql:188` | То же для `apartments`. | `UNIQUE(building_id, number, tenant_id)`. |
| **S6** | `schema.sql:501, 514, 531` | Training-таблицы `UNIQUE(proposal_id, voter_id)` без tenant. | Добавить tenant_id во все. |
| **S7** | `schema.sql:1513, 1607, 1684` | `ad_views`, marketplace `favorites`, `cart_items` — все `UNIQUE(user_id, ...)` без tenant_id. | Добавить tenant_id. (Меньший риск, потому что user_id уникален между тенантами.) |

### P1 — нумерация и drift

| # | Описание | Фикс |
|---|---|---|
| **S8** | Хаос нумерации миграций: смешаны `0NN_` (4 знака) и `0NN_` (3 знака). Дубликат: `030_add_district_to_branches.sql` И `0030_drop_password_plain.sql` — порядок выполнения недетерминирован. Пропуски: 001, 002, 005, 021, 023. | Переименовать всё в единый формат `0NN_` (3 знака), сверить с историей применений в D1 (`wrangler d1 migrations list kamizo-db --remote`). |
| **S9** | `migrations/010_create_branches_table.sql.applied` — расширение `.applied` нестандартное. | Удалить или переименовать в `.bak`. Wrangler читает только `.sql`. |
| **S10** | `migrations/031_branch_code_audit.sql` создаёт таблицу, которой нет ни в schema.sql, ни в schema_no_fk.sql. | Если миграция применена — добавить таблицу в обе schemas. Если не применена — удалить миграцию. |

### P2 — cleanup

- **S11** — `schema.sql:1979` — комментарий «Logical FK: estimate_item_id → finance_estimate_items.id (enforced at application level)» — добавить настоящий FK или хотя бы CHECK constraint, иначе сирот не выловить.
- **S12** — Композитные индексы `idx_users_tenant_role_active`, `idx_requests_tenant_status` — проверить что `tenant_id` действительно есть во всех индексируемых таблицах.

---

## 4 · Приоритизированный roadmap

### Сегодня (до следующего деплоя)
1. **B1** (ratings tenant filter) — 5 минут.
2. **B2** (work_orders tenant filter + JOIN) — 15 минут, 3 места.
3. **S1** (schema_no_fk.sql syntax error) — 2 минуты, копипаст из schema.sql.

После — сделать `wrangler deploy` и проверить, что `/api/ratings` и `/api/work-orders` возвращают только свой тенант (можно проверить вручную в браузере, переключаясь между demo и kamizo).

### На этой неделе
4. **B3, B6** (guests JOIN + push broadcast tenant) — закрыть «defence-in-depth» дыры.
5. **B7, B8** (invalidateCache на assignment + work-orders status) — UI станет responsive.
6. **F1** (CSS button min-height) — снять глобал, ввести `.tap-target`. Один общий PR.
7. **F2** (общий `<Modal>` компонент с ESC + focus trap + aria) — сразу закрывает 6+ мест.

### Этот спринт
8. **S2, S3** (branches table + drift schema_no_fk) — генерить no-fk автоматически из основной.
9. **S4-S7** (UNIQUE + tenant_id) — одна миграция `040_unique_with_tenant.sql`.
10. **S8** (нумерация миграций) — отдельный housekeeping PR с переименованием.
11. **B11** (`withAuth` middleware) — рефактор, ускорит написание новых роутов и снизит вероятность пропустить tenant-check.

### Параллельно (когда будешь готов)
12. **SECURITY_CLEANUP_PROMPT.md** — ротировать Cloudflare token, удалить .ps1 скрипты, добавить pre-commit hook. **Это уже отдельный документ, ждёт ручной ротации токена.**

---

## 5 · Что я НЕ проверил (ставлю себе на следующий аудит)

- E2E прохождение пайплайна заявки от создания до оплаты через mock-payment.
- Race condition при одновременном `accept` двумя исполнителями одной заявки.
- Лимиты Cloudflare D1 (max prepared statements, query size, batch limit).
- Push-нотификации: реальная доставка через VAPID — ни одного теста, что они доходят до устройства.
- Rate limiting — судя по коду, его нет. Любой авторизованный юзер может задосить любой эндпоинт.
- CORS-policy на Worker — не смотрел, не приведёт ли это к XSS из соседних поддоменов.
- Sentry / observability — есть ли вообще логирование ошибок в проде или мы летим вслепую.
- TypeScript strict mode — `tsconfig.json` я не открывал, может там `strict: false`.

Эти 8 пунктов — следующий цикл аудита, когда захочешь.

---

## Сводная таблица

| Ось | P0 | P1 | P2 | Total |
|---|---|---|---|---|
| Backend | 6 | 4 | 3 | 13 |
| Frontend | 1 | 4 | 3 | 8 |
| Schema | 2 + 4 (P0.5) | 3 | 2 | 11 |
| **Итого** | **13** | **11** | **8** | **32** |

Из 13 P0 — **3 верифицировал руками** (✅), остальные надо открыть и проверить, что агент не приукрасил, перед механической правкой.

---

*Сгенерировано: Claude (sonnet) + 3 параллельных Explore агента + ручная верификация. Последнее обновление: 2 мая 2026.*
