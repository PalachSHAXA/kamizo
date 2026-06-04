# CLAUDE.md — Правила разработки Kamizo

> **Главный принцип:** прежде чем что-то делать — **подумай нужно ли это вообще, как лучше, и от какого угла зрения**. Подключай плагины-роли когда задача попадает в их сценарий. Никогда не «делай и сразу пуш» — всегда **триаж → план → реализация → ревью → security → мерж**.

---

## 🎯 Алгоритм обработки КАЖДОГО промта

Перед любым ответом проходи 6 шагов. Большую часть — мысленно, остановки на плагины только когда есть триггер.

### Шаг 1 — Триаж (всегда)
Спроси себя:
- Что пользователь хочет в **конечном итоге**? (не буквально, а по смыслу)
- Это **новая фича**, **фикс бага**, **рефакторинг**, **дизайн**, **вопрос**, или просто чат?
- Это **затронет prod / users**, или локальная правка?
- Нужно ли **сначала уточнить** что-то у пользователя, или всё ясно?
- Можно ли решить **проще** чем предлагает пользователь?
- **Уже существует** ли похожая логика в коде? (`grep` перед началом)

Если триаж показал что задача **переусложнена / не нужна** — скажи об этом, не делай.

### Шаг 2 — Декомпозиция (если задача сложная)
Используй **superpowers** (`/brainstorming`, sub-agents) когда:
- Задача = 3+ независимых шага
- Затрагивает 5+ файлов
- Требует backend + frontend + DB одновременно
- Нужно несколько подходов и выбор лучшего

Для мелких правок (1-2 файла) — пропускай этот шаг.

### Шаг 3 — Точка зрения роли (для архитектурных решений)
Если задача = **архитектура / приоритеты / trade-off**, используй **gstack** роли:
- **CEO** — стоит ли это делать с точки зрения бизнеса
- **EM / Tech Lead** — как это вписывается в кодовую базу
- **QA** — что может сломаться, edge cases
- **Release Manager** — риск регрессии, нужен ли feature-flag
- **Designer** — UX / consistency

Не каждый промт требует роль. Только когда есть **выбор подхода** или **компромисс**.

### Шаг 4 — Реализация
Следуй разделам ниже (Архитектура, Стек, Известные паттерны). Минимум кода, переиспользование, без новых паттернов если есть существующий.

### Шаг 5 — Само-ревью + автоматическое ревью
Перед коммитом:
- TypeScript: `npx tsc --noEmit` в `src/frontend/`
- Сборка: `npm run build` если фронт менялся
- **frontend-design** — если правил UI/JSX (anti-AI-slop check)
- **code-review** — если изменения нетривиальные (5 агентов параллельно)
- **security-review** — если затронуты `auth`, `getUser`, SQL с user-input, password, секреты, любые `/api/` хендлеры

### Шаг 6 — Память
После значимых решений сохраняй в **claude-mem**:
- Архитектурные выборы («почему именно такой паттерн»)
- Тонкие баги и их корень
- Конвенции которые ввели (например «фото в заявках всегда client-compressed 1280px JPEG»)
- Подтверждённые пользователем решения

Не сохраняй: обычный код, файлы, git история — это и так в репо.

---

## 🔌 Плагины — когда какой использовать

| Триггер в задаче | Плагин | Команда |
|---|---|---|
| Меняешь UI / JSX / Tailwind / компонент | **frontend-design** | проверь UI на anti-AI-slop |
| Готов к коммиту значимого изменения | **code-review** | `/code-review` |
| Трогал auth, БД, env, секреты, multi-tenancy | **security-review** | `/security-review` |
| Сессия началась, надо вспомнить контекст | **claude-mem** | автоматически в начале |
| Сложная архитектурная дилемма | **gstack** | `/role:em` или `/role:ceo` |
| Большая задача — нужна декомпозиция | **superpowers** | `/brainstorming` |
| E2E тест UI / проверка как житель видит | **playwright** (MCP) | `mcp__playwright__browser_*` |

**Правило экономии токенов:** плагин = это +1500-3000 токенов на ответ. Не дёргай ради тривиальной правки одной строки.

---

## 📐 Архитектура проекта (после миграции 2026-05-19 — гибрид)

**Из-за требований закона РУз о ПДн (персональные данные граждан Узбекистана хранятся и обрабатываются только в РУз)** проект разделён:

```
ПОЛЬЗОВАТЕЛЬ ОТКРЫВАЕТ {tenant}.kamizo.uz
       │
       ├─ Статика (HTML/CSS/JS)  ─►  Cloudflare CDN (без ПДн)
       │                            kamizo Worker сейчас просто отдаёт ASSETS
       │
       └─ API /api/*  ─►  api.kamizo.uz (DNS-only, не proxied)  ─►  VPS Ташкент
                                                                   95.46.96.209
                                                                   ├─ Node.js 20 + Hono
                                                                   ├─ better-sqlite3
                                                                   └─ /opt/kamizo/data/kamizo.db
```

- **Frontend**: React 18 + Vite + TypeScript, путь: `src/frontend/`. `API_URL = 'https://api.kamizo.uz'` в `services/api/client.ts`.
- **Backend (HISTORICAL NAME)**: код в `cloudflare/src/routes/*/`, `cloudflare/src/middleware/`, `cloudflare/src/utils/`. Это **не воркеры** больше — это Node.js на VPS, под Hono+`@hono/node-server`. Тонкий совместимый шим в `/opt/kamizo/app/src/shim/{d1,kv}.js` адаптирует D1/KV API на `better-sqlite3` и in-memory. Роуты работают БЕЗ ИЗМЕНЕНИЙ.
- **БД**: SQLite на VPS в `/opt/kamizo/data/kamizo.db` (WAL mode). Схема в `cloudflare/schema.sql`.
- **Миграции**: `cloudflare/migrations/0XX_*.sql` — применяются на VPS через `sqlite3 < file.sql` (нет wrangler).
- **Auth**: подписанные JWT (Sprint 66+). Секрет `JWT_SECRET` в `/opt/kamizo/app/.env` на VPS. **НЕ голый UUID** как было раньше.
- **VPS детали**: см. [`~/.claude/projects/-Users-shaxzodisamahamadov-kamizo/memory/reference_infrastructure.md`](memory). Доступ по SSH-ключу `~/.ssh/kamizo_vps` под юзером `kamizo` (sudo) или `root`.
- **Cloudflare**: остался для (1) CDN статики, (2) DNS-зоны, (3) Worker `kamizo` обслуживает `*.kamizo.uz/*` для отдачи статики. D1 пока существует как archive, удалить через 24-48ч стабильности.

## 🚀 Деплой (изменилось!)

| Что меняется | Куда | Команда |
|---|---|---|
| `src/frontend/**` | Cloudflare CDN | `cd src/frontend && npm run build && cp -r dist/* ../../cloudflare/public/ && cd ../../cloudflare && wrangler deploy` |
| `cloudflare/src/**` (backend) | VPS Ташкент | `rsync -avz -e "ssh -i ~/.ssh/kamizo_vps" cloudflare/src/ kamizo@95.46.96.209:/opt/kamizo/app/server-src/ && ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 'sudo systemctl restart kamizo-api'` |
| `cloudflare/migrations/*.sql` | VPS SQLite | `scp -i ~/.ssh/kamizo_vps cloudflare/migrations/NNN.sql kamizo@95.46.96.209:/tmp/ && ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 'sqlite3 /opt/kamizo/data/kamizo.db < /tmp/NNN.sql'` |
| Секреты | VPS `.env` | edit `/opt/kamizo/app/.env` + `sudo systemctl restart kamizo-api` |

После любого фронт-деплоя бамп версии SW (`src/frontend/public/sw.js` суффикс `v{N}`) — иначе кеш у юзеров залипает.

**Логи**: `ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 'tail -f /opt/kamizo/logs/api.{log,err.log}'` или `sudo journalctl -u kamizo-api -f`.

## 🧰 Стек
- **State**: Zustand, модульные store-ы в `src/frontend/src/stores/`. Импортируй точечно: `useRequestStore(s => s.requests)`, **НЕ** `useDataStore()` целиком — barrel-селекторы возвращают весь объект и крашат сайт.
- **API клиент**: `src/frontend/src/services/api/` (14 модулей + `index.ts` barrel). In-memory cache в `client.ts` с TTL.
- **UI**: Tailwind CSS + lucide-react. Брендовые токены в `src/frontend/src/index.css`: `--brand`, `--brand-rgb`, `--app-bg`.
- **i18n**: `language === 'ru' ? '...' : '...'`. Узбекский в апострофах нужно escape-ить или брать русскую двойную кавычку.

---

## ✅ ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА

### 1. Перед правкой
- **Прочитай** все затронутые файлы целиком (не только grep)
- **Проверь** что новая функция не конфликтует с существующими (поищи похожие имена)
- **Сверь** схему БД и миграции если трогаешь данные

### 2. Реализация = минималистичный рефакторинг
- НЕ дублируй логику существующих функций — переиспользуй
- НЕ вводи новый паттерн если есть аналогичный
- Stores импортируй точечно
- Удаляй `useState`/импорты, которые перестали использоваться (typescript подскажет)

### 3. Производительность
- `useEffect` без dep-array = infinite loop — запрещено
- Zustand: подписка на конкретное поле, **не на весь store**
- Большие вычисления — `useMemo`/`useCallback`
- Новый store = отдельный файл, потом регистрация в barrel

### 4. Каждое изменение → видно в проде
После изменений в `cloudflare/`:
```bash
cd cloudflare && wrangler deploy
```
После изменений в `src/frontend/`:
```bash
cd src/frontend && npm run build
cp -r dist/. ../../cloudflare/public/
cd ../../cloudflare && wrangler deploy
```
Перед билдом ВСЕГДА:
```bash
cd src/frontend && npx tsc --noEmit
```

### 5. Миграции БД
- Новые колонки = ВСЕГДА файл миграции `cloudflare/migrations/0XX_описание.sql`
- D1 НЕ поддерживает `IF NOT EXISTS` для `ALTER TABLE ADD COLUMN` — пиши без него, миграция выполняется один раз
- Обновляй `cloudflare/schema.sql` и `cloudflare/schema_no_fk.sql`
- Применяй: `wrangler d1 execute kamizo-db --file=migrations/0XX.sql --remote`

### 6. API Backend
- Новые роуты идут в соответствующий файл `cloudflare/src/routes/<domain>/<file>.ts` (НЕ в монолитный `index.ts`)
- Регистрируются через `registerAllRoutes()` в `cloudflare/src/routes/index.ts`
- ВСЕГДА проверяй `authUser` и `tenantId` для multi-tenancy
- Используй `generateId()` для UUID
- Используй `invalidateOnChange(...)` после мутаций
- Trigger **security-review** перед push если правил auth/SQL/env

### 7. Типы
- Фронт: `src/frontend/src/types/<domain>.ts`
- Бэк: `cloudflare/src/types.ts`
- `any` — только в крайнем случае, с комментарием почему

### 8. Stores — структура
- `crmStore.ts` = фасад (backward-compat), реальная логика в `buildingStore`, `apartmentStore`, `meterStore`, `accountStore`
- `dataStore.ts` = фасад для `requestStore`, `vehicleStore`, `guestAccessStore`, и т.д.
- Новый store = отдельный файл + регистрация в barrel

---

## 🧪 Известные паттерны (читай ПЕРЕД работой с этими доменами)

### Голосование на собраниях жильцов
- Голос = площадь квартиры (кв.м), по закону РУз. `meeting_vote_records.vote_weight` = `users.total_area`
- **Повторное голосование = UPDATE** существующей записи (UNIQUE на `(meeting_id, agenda_item_id, voter_id)`)
- Комментарии голоса: `meeting_agenda_comments` с колонками `resident_id, resident_name, content` (НЕ `user_id, comment`)
- `comment_type`: `'comment'` или `'objection'` (auto при голосе ПРОТИВ)
- При ПРОТИВ: сохраняй `counter_proposal` (опц.)
- `meeting_agenda_items.attachments` = JSON `[{name, url, type, size}]`
- Протокол читает `c.content` после `close-voting`
- Кворум = 50%+ площади здания

### Мульти-тенантность (security-critical)
- ВСЕ запросы к БД фильтруй по `tenant_id` через `getTenantId(request)`
- ВСЕ новые таблицы должны иметь колонку `tenant_id TEXT`
- На main-домене (`app.kamizo.uz`) `tenantId` = `null` — `getUser()` ищет юзера по всем тенантам и привязывает к его tenant_id
- **security-review** перед push если трогаешь tenant-фильтрацию

### Push-уведомления
- `sendPushNotification(env, userId, {title, body, type, tag, data})`
- ВСЕГДА `.catch(() => {})` чтобы не упал основной запрос
- В коммит сообщай: «push добавлен на event X»

### Фото в заявках
- Фронт компрессит до 1280px JPEG q=0.8 (~150-250KB)
- В БД хранятся как JSON array data-URL в колонке `requests.photos TEXT`
- Лимит 5 фото на заявку, сервер режет `body.photos.slice(0, 5)`
- Отображение: thumb-strip на карточке + 3-col grid в деталях

### Координация оверлеев
- Все full-screen overlay-компоненты (tour / push-prompt / sw-update / director-wizard) проходят через `useOverlayStore` в `src/frontend/src/stores/overlayStore.ts`
- Приоритеты: sw_update=90 > tour=80 > director_wizard=70 > push_prompt=50
- `requestOverlay(type)` на mount, `releaseOverlay(type)` на unmount

### Safe-area на iOS
- Корневые контейнеры (`body`, `.layout-root`) НЕ красят фон под home-indicator
- BottomBar — двухслойный: outer wrapper transparent + `padding-bottom: env(safe-area-inset-bottom)`, inner wrapper с `bg-white/95`. Это убирает белую полосу.

---

## 🚫 Что НЕЛЬЗЯ делать
- ❌ Создавать новый файл если можно отредактировать существующий
- ❌ Писать `rm -rf`, `DROP TABLE`, `DELETE FROM` без явного запроса
- ❌ Пушить в git без подтверждения (исключение: ветка `feat/*` если пользователь сказал «деплой и пуш»)
- ❌ Force-push в `main` НИКОГДА без явного запроса
- ❌ Игнорировать TypeScript ошибки (`as any` без коммента)
- ❌ Менять схему БД без миграции
- ❌ Копировать бизнес-логику вместо переиспользования
- ❌ Вставлять секреты в код (`wrangler secret put` для env)
- ❌ Делать prod-деплой не запустив `tsc --noEmit` + `npm run build`
- ❌ Использовать `useDataStore()` без селектора — barrel возвращает весь объект, крашит сайт
- ❌ Использовать `IF NOT EXISTS` на `ALTER TABLE ADD COLUMN` в миграциях D1 (не поддерживается)

---

## 🔄 Финальный воркфлоу для значимого изменения

```
1. Триаж: что хочет пользователь? Нужно ли это? Можно проще?
2. (если сложно) /brainstorming через superpowers
3. (если архитектурный выбор) /role:em или /role:qa через gstack
4. Чтение затронутых файлов
5. Реализация
6. tsc --noEmit
7. (если UI) frontend-design check
8. /code-review
9. (если auth/db/api) /security-review
10. npm run build → cp dist → wrangler deploy
11. git commit (тон fix/feat/refactor + конкретика без эмодзи)
12. git push
13. claude-mem сохранить ключевые решения
```

Если задача мелкая (1 строка, опечатка) — пропускай шаги 2, 3, 7, 8, 9. Шаги 1, 4, 5, 6, 10-13 обязательны для любых изменений в коде.

---

## Git workflow (MANDATORY)
- After EVERY change you make to the code, you MUST:
  1. git add -A
  2. git commit -m "<short descriptive message of what changed>"
  3. git push
- NEVER deploy without first committing and pushing.
- Before any deploy, run: git add -A && git commit -m "deploy: <what changed>" && git push, THEN deploy.
- Every deploy must correspond to a pushed commit, so nothing lives only in the local working directory.
- If there are uncommitted changes at the start of a task, commit them first before doing anything else.

## Loss prevention (MANDATORY)
- pull.rebase is set to false (merge, never rebase) to avoid dropping commits.
- Before ANY git pull, git rebase, git reset, or wrangler deploy, FIRST run:
  git branch backup/$(date +%Y%m%d-%H%M%S)
- NEVER use git reset --hard or git push --force on main.
- After every change: git add -A && git commit -m "..." && git push.
- Every wrangler deploy must be preceded by a committed + pushed state.

