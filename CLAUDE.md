# CLAUDE.md — Правила разработки Kamizo

## Архитектура проекта
- **Frontend**: React + Vite + TypeScript, путь: `src/frontend/`
- **Backend**: Cloudflare Workers, путь: `cloudflare/src/index.ts`
- **БД**: Cloudflare D1 (SQLite), схема: `cloudflare/schema.sql`
- **Миграции**: `cloudflare/migrations/` — нумерация 001, 002, ..., 026, ...
- **Деплой**: `wrangler deploy` из папки `cloudflare/`

## Стек
- Stores: Zustand (разбиты на модули: requestStore, vehicleStore, crmStore-фасад и т.д.)
- API: `src/frontend/src/services/api/` (разбит на 14 модулей + index.ts barrel)
- UI: Tailwind CSS + lucide-react иконки
- i18n: `language === 'ru' ? '...' : '...'` (русский + узбекский)

---

## ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА для каждого промта / каждой функции

### 1. Думай перед тем как делать
- Прочитай все затронутые файлы ПЕРЕД правкой
- Проверь что новая функция не конфликтует с существующими
- Проверь схему БД перед добавлением колонок

### 2. Каждая новая функция — монолитный рефакторинг
- Новая функция НЕ должна создавать конфликты интересов
- НЕ дублировать логику уже существующих функций
- НЕ вводить новые паттерны если аналогичный паттерн уже есть
- Магазины (stores) импортируй точечно, а не весь useDataStore везде

### 3. Производительность — никаких лагов
- Не добавляй `useEffect` без dep array (infinite loop)
- Zustand: подписывайся только на нужные поля, не на весь store
- При добавлении нового store — добавляй как отдельный файл, НЕ в монолит
- Большие вычисления — `useMemo`/`useCallback`

### 4. Каждое изменение должно быть видно в продакшне
- После изменений в `cloudflare/`: запускай `cd cloudflare && wrangler deploy`
- После изменений в `src/frontend/`: делай build `npm run build` и деплой
- Всегда проверяй TypeScript: `npx tsc --noEmit` в `src/frontend/`

### 5. Миграции БД
- При добавлении новых колонок — ВСЕГДА создавай файл миграции `cloudflare/migrations/0XX_описание.sql`
- Используй `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`
- Обновляй `cloudflare/schema.sql` и `cloudflare/schema_no_fk.sql`
- Применяй миграции через wrangler: `wrangler d1 execute kamizo-db --file=migrations/0XX.sql --remote`

### 6. API Backend (cloudflare/src/index.ts)
- Все новые роуты добавляй ПЕРЕД строкой `// 404 handler`
- Всегда проверяй `authUser` и `tenantId` для multi-tenancy
- Используй `generateId()` для UUID
- Используй `invalidateCache('key:')` после мутаций

### 7. Типы (TypeScript)
- Новые типы добавляй в `src/frontend/src/types/` — соответствующий файл
- Backend типы — в `cloudflare/src/types.ts`
- Не используй `any` без крайней необходимости

### 8. Stores — структура
- `crmStore.ts` — фасад (backward-compatible), реальная логика в buildingStore, apartmentStore, meterStore, accountStore
- `dataStore.ts` — фасад, реальная логика в requestStore, vehicleStore, guestAccessStore, и т.д.
- Новые stores: создавай отдельный файл, добавляй в barrel `dataStore.ts` или `crmStore.ts`

---

## Известные паттерны

### Голосование на собраниях жильцов
- Голос = площадь квартиры (кв.м), по закону РУз
- `meeting_vote_records.vote_weight` = `users.total_area`
- **Повторное голосование: UPDATE существующей записи** (не INSERT — UNIQUE constraint на `(meeting_id, agenda_item_id, voter_id)` заблокирует)
- Комментарии голоса сохраняются в `meeting_agenda_comments` — колонки: `resident_id, resident_name, content` (НЕ `user_id, comment`)
- `comment_type`:
  - `'comment'` — обычный комментарий
  - `'objection'` — возражение при голосовании ПРОТИВ (автоматически)
- При голосовании ПРОТИВ: дополнительно сохраняется `counter_proposal` (альтернативное предложение)
- Пункты повестки дня поддерживают прикреплённые файлы: `meeting_agenda_items.attachments` (JSON array `[{name, url, type, size}]`)
- Протокол генерируется только после `close-voting`, читает `c.content` (не `c.comment`)
- Кворум = 50%+ площади здания
- Фронтенд: при выборе ПРОТИВ показывать форму возражения (обязательное поле) + контрпредложение (опционально)

### Мульти-тенантность
- Все запросы к БД фильтруй по `tenant_id` (получай через `getTenantId(request)`)
- Все новые таблицы должны иметь колонку `tenant_id TEXT`

### Push-уведомления
- `sendPushNotification(env, userId, {title, body, type, tag, data})`
- Всегда добавляй `.catch(() => {})` чтобы не упал основной запрос

---

## Что НЕЛЬЗЯ делать
- ❌ Создавать файлы если можно отредактировать существующий
- ❌ Писать `rm -rf`, `DROP TABLE`, `DELETE FROM` без явного запроса
- ❌ Пушить в git без подтверждения пользователя
- ❌ Игнорировать TypeScript ошибки
- ❌ Менять схему БД без миграции
- ❌ Копировать бизнес-логику вместо переиспользования существующих функций
