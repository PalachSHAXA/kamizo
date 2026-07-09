# Kamizo

Kamizo — мульти-тенантная SaaS для управляющих компаний ЖКХ Узбекистана.
Прежде чем что-то делать — подумай, нужно ли это, можно ли проще,
не существует ли уже похожего в коде.

## Стек

- **Frontend**: React 18 + Vite + TypeScript в `src/frontend/`. State — Zustand,
  модульные stores в `src/frontend/src/stores/`. UI — Tailwind + lucide-react,
  брендовые токены `--brand`, `--brand-rgb`, `--app-bg` в `src/frontend/src/index.css`.
- **Backend**: Node.js 20 + Hono + better-sqlite3 на VPS Ташкент 95.46.96.209.
  Код в `cloudflare/src/routes/**` (историческое имя — это не Cloudflare Workers).
  Shim `/opt/kamizo/app/src/shim/{d1,kv,r2}.js` адаптирует D1/KV/R2 API на
  better-sqlite3 + in-memory + FS.
- **DB**: SQLite `/opt/kamizo/data/kamizo.db` (WAL). Схема в `cloudflare/schema.sql`,
  миграции в `cloudflare/migrations/*.sql`. По закону РУз о ПДн вся БД в РУз.
- **Native**: Capacitor iOS + Android из `src/frontend/`.
- **Auth**: подписанные JWT, секрет `JWT_SECRET` в `/opt/kamizo/app/.env`.

## Инфраструктура

- `app.kamizo.uz`, `*.kamizo.uz` → Cloudflare Worker `kamizo` (только статика).
- `api.kamizo.uz` → DNS-only A-record → nginx на VPS → `127.0.0.1:3000`
  (systemd `kamizo-api.service`, tsx-runtime).
- SSH: `~/.ssh/kamizo_vps`, user `kamizo` (sudo).

## Деплой

**Backend (`cloudflare/src/**`) → VPS:**
```bash
rsync -avz -e "ssh -i ~/.ssh/kamizo_vps" \
  cloudflare/src/ \
  kamizo@95.46.96.209:/opt/kamizo/app/server-src/
# НИКОГДА не добавляй --delete: на проде есть файлы вне репо (ручные таблицы,
# snapshots, orphan artefacts), --delete их снесёт.
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 'sudo systemctl restart kamizo-api'
```

**Frontend (`src/frontend/**`) → Cloudflare:**
```bash
cd src/frontend && npm run build
rm -rf ../../cloudflare/public/assets   # обязательно: иначе старые хешированные
                                        # бандлы копятся + wrangler-manifest
                                        # выбирает не тот файл
cp -r dist/. ../../cloudflare/public/
cd ../../cloudflare && wrangler deploy
# После деплоя ОБЯЗАТЕЛЬНА проверка: curl bundle (index.html → /assets/index-*.js)
# → content-type: text/javascript, size > 100KB. Если 0 байт или text/html —
# wrangler-manifest bug, надо повторить wrangler deploy (инцидент 2026-07-08).
```

**Миграции (`cloudflare/migrations/NNN.sql`) → VPS SQLite:**
```bash
scp -i ~/.ssh/kamizo_vps cloudflare/migrations/NNN.sql \
  kamizo@95.46.96.209:/tmp/
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 \
  'sqlite3 /opt/kamizo/data/kamizo.db < /tmp/NNN.sql'
```
ВНИМАНИЕ: `cloudflare/src/index.ts → runMigrations()` — ОТДЕЛЬНАЯ система
миграций, создаёт таблицы `tenants`, `super_banners`,
`meeting_vote_reconsideration_requests` в рантайме (не через файлы миграций).
Вся мультитенантность держится на `tenants`. НЕ трогать и не «чистить» без
полного понимания — это несущая конструкция.

**Секреты → VPS `.env`:**
```bash
# edit /opt/kamizo/app/.env then:
sudo systemctl restart kamizo-api
```

## Обязательные архитектурные инварианты

- **Multi-tenancy**: КАЖДЫЙ SQL к БД (SELECT/INSERT/UPDATE/DELETE) фильтруй по
  `tenant_id` через `getTenantId(request)`. КАЖДАЯ новая таблица имеет колонку
  `tenant_id TEXT`. На apex-домене `getUser()` резолвит tenant_id из JWT.
- **API routes**: новые endpoint'ы кладём в `cloudflare/src/routes/<domain>/<file>.ts`,
  регистрируем через `registerAllRoutes()` в `cloudflare/src/routes/index.ts`.
  UUID — через `generateId()`, invalidation — через `invalidateOnChange(...)`.
- **Frontend stores**: подписка на конкретное поле — `useRequestStore(s => s.requests)`,
  НЕ `useDataStore()` целиком (barrel-селектор крашит сайт).
- **Типы**: фронт — `src/frontend/src/types/<domain>.ts`, бэк — `cloudflare/src/types.ts`.
  `as any` только с комментарием почему.
- **i18n**: `language === 'ru' ? '...' : '...'`. Узбекский апостроф — экранируй
  или используй русскую двойную кавычку.

## Доменные факты (non-obvious, не из кода)

- **Собрания**: голос = площадь квартиры кв.м (`users.total_area`), кворум = 50%+
  площади здания. Повторное голосование — `UPDATE` существующей записи
  (UNIQUE на `meeting_id, agenda_item_id, voter_id`), НЕ новый INSERT.
- **Push**: `sendPushNotification(...)` всегда обёрнут в `.catch(() => {})` —
  иначе роняет основной запрос.
- **Фото заявок**: JSON array data-URL в `requests.photos TEXT`, лимит 5,
  клиент компрессит до 1280px JPEG q=0.8. Сервер режет `.slice(0, 5)`.
- **Оверлеи**: полноэкранные (tour/push-prompt/sw-update/director-wizard)
  проходят через `useOverlayStore`, приоритет sw_update(90) > tour(80) >
  director_wizard(70) > push_prompt(50).
- **iOS safe-area**: `body`, `.layout-root` НЕ красят фон под home-indicator.
  BottomBar двухслойный: transparent outer + `padding-bottom:
  env(safe-area-inset-bottom)` + solid inner. Иначе белая полоса.

## Абсолютные запреты

- `git push --force`, `git reset --hard main` — НИКОГДА без явного запроса.
- `rm -rf`, `DROP TABLE`, `DELETE FROM` без явной user-инструкции.
- Прод-деплой без `tsc --noEmit` + `npm run build`.
- Изменение схемы БД без файла миграции в `cloudflare/migrations/`.
- `IF NOT EXISTS` на `ALTER TABLE ADD COLUMN` (SQLite не поддерживает).
- `useDataStore()` без селектора.
- Плейн-секреты в код (используй `/opt/kamizo/app/.env` на VPS или
  `wrangler secret put`).
- Игнорировать TypeScript-ошибки без комментария.
- `rsync --delete` на VPS. `--delete` снесёт файлы вне репо.
