# KAMIZO — ПРОМТ ДЛЯ ИСПРАВЛЕНИЯ ПРОИЗВОДИТЕЛЬНОСТИ

> Этот промт содержит ВСЕ найденные проблемы производительности с точными файлами, строками и готовыми решениями.
> Копируй целиком в Claude Code / Cowork. Говори: "Начни с PERF-01" и далее по порядку.

---

## КОНТЕКСТ

**Kamizo** — UK-CRM платформа на React + Cloudflare Workers + D1.
**Цель:** ускорить приложение для пользователей на 60-70%.
**Текущее состояние:** Дашборд грузится 1-2с (80+ DB запросов). Цель: 300-600мс (4-6 запросов).

---

## ФАЗА 1: БЭКЕНД — N+1 ЗАПРОСЫ И БАТЧИНГ (экономия 2-8 секунд)

---

### PERF-01: Объявления — push в цикле по 500 юзерам [CRITICAL, экономия 3-8с]

**Файл:** `cloudflare/src/routes/misc.ts`, примерно строки 905-962

**Проблема:** При создании объявления для каждого юзера ОТДЕЛЬНЫЙ запрос на push:
```js
// ПЛОХО: 500 юзеров = 500 отдельных INSERT + 500 push запросов
for (const user of targetUsers) {
  await env.DB.prepare('INSERT INTO notifications ...').bind(...).run();
  sendPushNotification(env, user.id, {...}).catch(() => {});
}
```

**Решение:**
```js
// ХОРОШО: 1 batch INSERT + параллельные push
const stmts = targetUsers.map(user =>
  env.DB.prepare('INSERT INTO notifications (id, user_id, title, body, type, tenant_id, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime("now"))')
    .bind(generateId(), user.id, title, body, 'announcement', tenantId)
);
await env.DB.batch(stmts); // 1 запрос вместо 500!

// Push параллельно, не блокируя
Promise.allSettled(
  targetUsers.map(u => sendPushNotification(env, u.id, {title, body, type: 'announcement'}))
).catch(() => {});
```

---

### PERF-02: Финансы — начисления в цикле по квартирам [CRITICAL, экономия 2-5с]

**Файл:** `cloudflare/src/routes/finance.ts`, примерно строки 351-354

**Проблема:** Генерация начислений — отдельный INSERT для каждой квартиры:
```js
for (const apt of apartments) {
  await env.DB.prepare('INSERT INTO finance_charges ...').bind(...).run();
}
// 100 квартир = 100 INSERT = 2-5 секунд
```

**Решение:**
```js
const stmts = apartments.map(apt =>
  env.DB.prepare('INSERT INTO finance_charges (id, apartment_id, amount, period, ..., tenant_id) VALUES (?, ?, ?, ?, ..., ?)')
    .bind(generateId(), apt.id, calculateCharge(apt), period, ..., tenantId)
);
// D1 batch — до 100 statements за 1 раунд-трип
for (let i = 0; i < stmts.length; i += 100) {
  await env.DB.batch(stmts.slice(i, i + 100));
}
```

---

### PERF-03: Собрания — N+1 при загрузке голосов [CRITICAL, экономия 500мс-2с]

**Файл:** `cloudflare/src/routes/meetings.ts`, примерно строки 580-620

**Проблема:** Для каждого пункта повестки — отдельный запрос за голосами:
```js
const agendaItems = await DB.prepare('SELECT * FROM meeting_agenda_items WHERE meeting_id = ?').bind(id).all();
for (const item of agendaItems.results) {
  const votes = await DB.prepare('SELECT * FROM meeting_vote_records WHERE meeting_id = ? AND agenda_item_id = ?')
    .bind(id, item.id).all();
  item.votes = votes.results;
}
// 10 пунктов = 10 запросов
```

**Решение:**
```js
const [agendaItems, allVotes] = await Promise.all([
  DB.prepare('SELECT * FROM meeting_agenda_items WHERE meeting_id = ? ORDER BY order_num').bind(id).all(),
  DB.prepare('SELECT * FROM meeting_vote_records WHERE meeting_id = ?').bind(id).all(),
]);

// Группировка в памяти O(n)
const votesByItem = new Map();
for (const v of allVotes.results) {
  if (!votesByItem.has(v.agenda_item_id)) votesByItem.set(v.agenda_item_id, []);
  votesByItem.get(v.agenda_item_id).push(v);
}
for (const item of agendaItems.results) {
  item.votes = votesByItem.get(item.id) || [];
}
```

---

### PERF-04: Маркетплейс заказы — N+1 товары [CRITICAL, экономия 1.5-3с]

**Файл:** `cloudflare/src/routes/marketplace.ts`, примерно строки 138-144

**Проблема:** Для каждого заказа — отдельный запрос за товарами:
```js
for (const order of orders) {
  const items = await DB.prepare('SELECT * FROM marketplace_order_items WHERE order_id = ?').bind(order.id).all();
  order.items = items.results;
}
```

**Решение:**
```js
const orderIds = orders.map(o => o.id);
const placeholders = orderIds.map(() => '?').join(',');
const allItems = await DB.prepare(
  `SELECT * FROM marketplace_order_items WHERE order_id IN (${placeholders})`
).bind(...orderIds).all();

const itemsByOrder = new Map();
for (const item of allItems.results) {
  if (!itemsByOrder.has(item.order_id)) itemsByOrder.set(item.order_id, []);
  itemsByOrder.get(item.order_id).push(item);
}
for (const order of orders) {
  order.items = itemsByOrder.get(order.id) || [];
}
```

---

### PERF-05: Уведомления менеджерам при заявках — 6 мест с циклом [HIGH, экономия 100мс×6]

**Файл:** `cloudflare/src/routes/requests.ts`, строки ~202, ~506, ~838, ~905, ~1064, ~1144

**Проблема:** В 6 местах один и тот же паттерн:
```js
const managers = await DB.prepare('SELECT id FROM users WHERE role IN (?, ?) AND tenant_id = ? AND is_active = 1')
  .bind('admin', 'manager', tenantId).all();
for (const m of managers.results) {
  await DB.prepare('INSERT INTO notifications ...').bind(..., m.id, ...).run();
}
```

**Решение:** Вынести в helper:
```js
// utils/notifications.ts
export async function notifyManagers(env, tenantId, notification) {
  const managers = await env.DB.prepare(
    'SELECT id FROM users WHERE role IN (?, ?, ?) AND tenant_id = ? AND is_active = 1'
  ).bind('admin', 'director', 'manager', tenantId).all();

  const stmts = managers.results.map(m =>
    env.DB.prepare('INSERT INTO notifications (id, user_id, title, body, type, tenant_id, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime("now"))')
      .bind(generateId(), m.id, notification.title, notification.body, notification.type, tenantId)
  );
  if (stmts.length) await env.DB.batch(stmts);

  // Push параллельно
  Promise.allSettled(
    managers.results.map(m => sendPushNotification(env, m.id, notification))
  ).catch(() => {});
}
```

---

### PERF-06: Здания — COUNT подзапросы в списке [HIGH, экономия 1-2с]

**Файл:** `cloudflare/src/routes/buildings.ts`, примерно строки 100-150

**Проблема:** Для каждого здания — 4 отдельных COUNT:
```js
for (const building of buildings) {
  const aptCount = await DB.prepare('SELECT COUNT(*) as c FROM apartments WHERE building_id = ?').bind(building.id).all();
  const resCount = await DB.prepare('SELECT COUNT(*) as c FROM residents WHERE building_id = ?').bind(building.id).all();
  const entrCount = await DB.prepare('SELECT COUNT(*) as c FROM entrances WHERE building_id = ?').bind(building.id).all();
  const meterCount = await DB.prepare('SELECT COUNT(*) as c FROM meters WHERE building_id = ?').bind(building.id).all();
}
// 20 зданий × 4 запроса = 80 запросов!
```

**Решение:**
```js
const buildings = await DB.prepare('SELECT * FROM buildings WHERE tenant_id = ?').bind(tenantId).all();

const [aptCounts, resCounts, entrCounts] = await Promise.all([
  DB.prepare(`SELECT building_id, COUNT(*) as count FROM apartments WHERE tenant_id = ? GROUP BY building_id`).bind(tenantId).all(),
  DB.prepare(`SELECT building_id, COUNT(*) as count FROM residents WHERE tenant_id = ? GROUP BY building_id`).bind(tenantId).all(),
  DB.prepare(`SELECT building_id, COUNT(*) as count FROM entrances WHERE tenant_id = ? GROUP BY building_id`).bind(tenantId).all(),
]);

const aptMap = new Map(aptCounts.results.map(r => [r.building_id, r.count]));
const resMap = new Map(resCounts.results.map(r => [r.building_id, r.count]));
const entrMap = new Map(entrCounts.results.map(r => [r.building_id, r.count]));

for (const b of buildings.results) {
  b.apartmentCount = aptMap.get(b.id) || 0;
  b.residentCount = resMap.get(b.id) || 0;
  b.entranceCount = entrMap.get(b.id) || 0;
}
// 4 запроса вместо 80!
```

---

### PERF-07: Протокол собрания — N+1 комментарии [HIGH, экономия 500мс-1с]

**Файл:** `cloudflare/src/routes/meetings.ts`, примерно строки 2800-2900

**Проблема:** Генерация протокола загружает комментарии для каждого пункта отдельно.

**Решение:** Один запрос `WHERE meeting_id = ?` + группировка в Map по `agenda_item_id`.

---

## ФАЗА 2: БАЗА ДАННЫХ — ИНДЕКСЫ (экономия 30-50%)

---

### PERF-08: 16 недостающих составных индексов [CRITICAL]

**Файл:** Создать миграцию `cloudflare/migrations/039_performance_indexes.sql`

```sql
-- Пользователи: рассылка уведомлений менеджерам
CREATE INDEX IF NOT EXISTS idx_users_tenant_role_active
  ON users(tenant_id, role, is_active);

-- Заявки: фильтрация по статусу
CREATE INDEX IF NOT EXISTS idx_requests_tenant_status
  ON requests(tenant_id, status);

-- Заявки: назначение исполнителю
CREATE INDEX IF NOT EXISTS idx_requests_tenant_executor
  ON requests(tenant_id, assigned_to, status);

-- Квартиры: список по зданию
CREATE INDEX IF NOT EXISTS idx_apartments_building_tenant
  ON apartments(building_id, tenant_id);

-- Начисления: по квартире и периоду
CREATE INDEX IF NOT EXISTS idx_finance_charges_apt_period
  ON finance_charges(apartment_id, period);

-- Начисления: по тенанту и статусу
CREATE INDEX IF NOT EXISTS idx_finance_charges_tenant_status
  ON finance_charges(tenant_id, status);

-- Оплаты: по тенанту и дате
CREATE INDEX IF NOT EXISTS idx_finance_payments_tenant_date
  ON finance_payments(tenant_id, created_at DESC);

-- Объявления: активные по тенанту
CREATE INDEX IF NOT EXISTS idx_announcements_tenant_active
  ON announcements(tenant_id, is_active, type);

-- Чат: сообщения по каналу и дате (ОЧЕНЬ важно)
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_date
  ON chat_messages(channel_id, created_at DESC);

-- Чат: непрочитанные
CREATE INDEX IF NOT EXISTS idx_chat_reads_channel_user
  ON chat_channel_reads(channel_id, user_id);

-- Голоса: по собранию и пункту
CREATE INDEX IF NOT EXISTS idx_votes_meeting_agenda
  ON meeting_vote_records(meeting_id, agenda_item_id);

-- Уведомления: по юзеру и прочитанности
CREATE INDEX IF NOT EXISTS idx_notifications_user_read
  ON notifications(user_id, is_read, created_at DESC);

-- Жители: по зданию
CREATE INDEX IF NOT EXISTS idx_residents_building_tenant
  ON residents(building_id, tenant_id);

-- Счётчики: по квартире
CREATE INDEX IF NOT EXISTS idx_meters_apartment
  ON meters(apartment_id, tenant_id);

-- Гостевой доступ: по коду и статусу
CREATE INDEX IF NOT EXISTS idx_guest_access_code_status
  ON guest_access(code, status);

-- Рейтинги: по исполнителю
CREATE INDEX IF NOT EXISTS idx_ratings_executor_tenant
  ON ratings(executor_id, tenant_id);
```

**Применение:**
```bash
wrangler d1 execute kamizo-db --file=migrations/039_performance_indexes.sql --remote
```

---

### PERF-09: Кэш TTL — увеличить для статических данных [HIGH, экономия 500-1000 запросов/мин]

**Файл:** `cloudflare/src/cache.ts`

**Проблема:** Building stats кэшируются 5 минут, но дашборд запрашивает их ~5000 раз за 5 минут. Категории кэшируются 24ч — ОК. Но buildings и apartments — нет.

**Решение:** В `cache.ts` увеличить TTL:
```js
// Было:
setCache(`buildings:${tenantId}`, buildings, 300_000);  // 5 мин

// Стало:
setCache(`buildings:${tenantId}`, buildings, 3_600_000);  // 1 час
// + invalidateCache('buildings:') при CRUD операциях
```

---

## ФАЗА 3: ФРОНТЕНД — РЕ-РЕНДЕРЫ И ОПТИМИЗАЦИЯ (экономия 30-40% CPU)

---

### PERF-10: Store подписки без селекторов [CRITICAL]

**Файлы и строки:**
- `src/App.tsx:71` — `useDataStore()` без селектора
- `src/components/layout/MobileHeader.tsx:22` — `useDataStore()` без селектора
- `src/components/layout/Header.tsx:143` — широкая подписка
- `src/components/layout/Sidebar.tsx:32` — широкая подписка

**Проблема:**
```tsx
// ПЛОХО: любое изменение в ЛЮБОМ сторе → ре-рендер Header
const { notifications, requests, announcements } = useDataStore();
```

**Решение:**
```tsx
// ХОРОШО: ре-рендер только при изменении notifications
const notifications = useNotificationStore(s => s.notifications);
const unreadCount = useNotificationStore(s => s.unreadCount);
```

**Затронутые файлы (проверить ВСЕ):**
```bash
grep -rn "useDataStore()\|useCrmStore()" src/frontend/src/ --include="*.tsx"
```

---

### PERF-11: TenantDashboard — O(n²) календарь [CRITICAL, экономия 60-70% на переключении месяца]

**Файл:** `src/frontend/src/pages/tenant/TenantDashboard.tsx`, строки 40-185

**Проблема:** Для каждого из 31 дня фильтруется ВЕСЬ массив записей. 31 × n = O(n²). Плюс 150+ объектов Date создаются при каждом рендере.

**Решение:**
```tsx
// Прекомпьютить Map дат один раз
const recordsByDate = useMemo(() => {
  const map = new Map<string, Record[]>();
  for (const r of records) {
    const key = r.date.slice(0, 10); // "2026-04-04"
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return map;
}, [records]);

// Рендер: O(1) lookup вместо O(n) filter
const dayRecords = recordsByDate.get(dayKey) || [];
```

---

### PERF-12: 42 картинки без lazy loading [MEDIUM, экономия 50-200мс]

**Файлы:** MarketplacePage, ResidentProfilePage, ResidentUsefulContactsPage, AnnouncementsPage и другие.

**Решение — глобальный поиск и замена:**
```bash
# Найти все <img без loading="lazy"
grep -rn "<img " src/frontend/src/ --include="*.tsx" | grep -v 'loading='
```

Добавить `loading="lazy"` на все `<img>` кроме первого экрана (above-the-fold).

---

### PERF-13: VirtualizedList есть но не используется [MEDIUM]

**Файл:** `src/frontend/src/components/VirtualizedList.tsx` — существует, 0 использований.

**Где подключить (списки 100+ элементов):**
- ResidentsPage — список жителей
- RequestsPage — список заявок
- ExecutorsPage — список исполнителей
- ApartmentsPage — список квартир

```tsx
import { VirtualizedList } from '../components/VirtualizedList';

// Вместо:
{residents.map(r => <ResidentCard key={r.id} {...r} />)}

// Использовать:
<VirtualizedList
  items={residents}
  itemHeight={80}
  renderItem={(r) => <ResidentCard key={r.id} {...r} />}
/>
```

---

### PERF-14: Header/Sidebar — фильтрация без useMemo [MEDIUM]

**Файл:** `src/frontend/src/components/layout/Header.tsx`, строки 163-294
**Файл:** `src/frontend/src/components/layout/Sidebar.tsx`, строки 178-250

**Проблема:**
```tsx
// Каждый рендер пересчитывает:
const pendingTasks = requests.filter(r => r.status === 'pending');
const unreadAnnouncements = announcements.filter(a => !a.isRead);
```

**Решение:**
```tsx
const pendingTasks = useMemo(
  () => requests.filter(r => r.status === 'pending'),
  [requests]
);
```

---

### PERF-15: Водопад загрузки на дашбордах [HIGH, экономия 300-800мс]

**Файлы:**
- `src/frontend/src/pages/ExecutorDashboard.tsx`, строки 66-84
- `src/frontend/src/pages/DirectorDashboard.tsx`
- `src/frontend/src/pages/AdminDashboard.tsx`

**Проблема:**
```tsx
useEffect(() => {
  fetchRequests();        // ждём 300мс
  fetchAnnouncements();   // потом ещё 300мс
  fetchMeetings();        // потом ещё 300мс
}, []);
// Итого: 900мс последовательно
```

**Решение:**
```tsx
useEffect(() => {
  Promise.all([
    fetchRequests(),
    fetchAnnouncements(),
    fetchMeetings(),
  ]);
}, []);
// Итого: 300мс параллельно (самый медленный запрос)
```

---

## ПОРЯДОК ВЫПОЛНЕНИЯ

### День 1: Индексы + N+1 критические (экономия 40-50%)
```
1. PERF-08: Создать миграцию с 16 индексами → wrangler d1 execute
2. PERF-03: Собрания — убрать N+1 голосов
3. PERF-06: Здания — убрать 4× COUNT в цикле
4. PERF-01: Объявления — batch INSERT уведомлений
```

### День 2: Остальные N+1 + фронтенд критические (экономия 20-30%)
```
5. PERF-02: Финансы — batch начисления
6. PERF-04: Маркетплейс — убрать N+1 заказов
7. PERF-05: Заявки — helper notifyManagers()
8. PERF-10: Store селекторы на Header/Sidebar/MobileHeader
9. PERF-11: TenantDashboard — Map вместо O(n²)
```

### День 3: Оптимизация + полировка (экономия 10%)
```
10. PERF-09: Увеличить cache TTL
11. PERF-12: loading="lazy" на все картинки
12. PERF-13: VirtualizedList на длинные списки
13. PERF-14: useMemo на Header/Sidebar
14. PERF-15: Promise.all на дашбордах
```

---

## ПРОВЕРКА ПОСЛЕ КАЖДОГО ФИКСА

```
□ npx tsc --noEmit — 0 ошибок
□ wrangler dev — эндпоинт работает
□ Время ответа уменьшилось (проверить в DevTools Network)
□ Данные корректны (сравнить с до-фикса)
□ wrangler deploy (после всех фиксов дня)
□ npm run build (для фронтенда)
```

---

## ОЖИДАЕМЫЙ РЕЗУЛЬТАТ

| Метрика | Было | Станет | Улучшение |
|---|---|---|---|
| Дашборд (загрузка) | 1-2с | 300-600мс | **60-70%** |
| Создание объявления | 4-10с | 0.5-1.5с | **80%** |
| Генерация начислений (100 кв.) | 3-6с | 0.8-1.5с | **70%** |
| Загрузка собрания | 1-2с | 300-500мс | **65%** |
| Список зданий | 1-2с | 200-400мс | **75%** |
| Маркетплейс заказы | 2-3.5с | 500мс-1с | **75%** |
| Переключение месяца (календарь) | 500мс-1с | 50-100мс | **90%** |
| Header ре-рендеры | 10+/мин | 2-3/мин | **70%** |
| DB запросов на дашборд | 80+ | 4-6 | **95%** |

---

## КАК ИСПОЛЬЗОВАТЬ

1. Скопируй этот промт в Claude Code / Cowork
2. Скажи: **"Начни с PERF-08 — создай миграцию индексов"**
3. После деплоя: **"Теперь PERF-03 — исправь N+1 в собраниях"**
4. Продолжай по порядку
5. После каждого дня: деплой и проверка
