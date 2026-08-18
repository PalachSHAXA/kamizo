# Kamizo - Система управления жилым комплексом

Полнофункциональная платформа для управляющих компаний: заявки, собрания, голосование, маркетплейс, чат, QR-доступ, аналитика.

## Quick Start

```bash
# 1. Клонировать
git clone <repo-url> && cd kamizo

# 2. Установить зависимости (три папки)
cd src/frontend && npm install && cd ../..
cd cloudflare && npm install && cd ..
cd mobile && npm install && cd ..

# 3. Создать файл секретов для локальной разработки
cat > cloudflare/.dev.vars <<EOF
ENCRYPTION_KEY=your-32-char-encryption-key-here
JWT_SECRET=your-jwt-secret-key-here
EOF

# 4. Запустить фронтенд (терминал 1)
cd src/frontend && npm run dev
# -> http://localhost:5173

# 5. Запустить бэкенд (терминал 2)
cd cloudflare && npm run dev
# -> http://localhost:8787
```

## Project Structure

```
kamizo/
├── src/frontend/            # React + Vite + TypeScript (веб-приложение)
│   ├── src/
│   │   ├── components/      # UI-компоненты
│   │   ├── pages/           # Страницы по ролям
│   │   ├── stores/          # Zustand stores (модульная архитектура)
│   │   ├── services/api/    # API-клиент (14 модулей)
│   │   └── types/           # TypeScript типы
│   └── vitest.config.ts
├── cloudflare/              # Cloudflare Workers (бэкенд)
│   ├── src/
│   │   ├── index.ts         # Главный роутер + fetch handler
│   │   ├── routes/          # Роуты (users, training, meetings, ...)
│   │   ├── middleware/       # CORS, auth, rate-limit, features
│   │   ├── utils/           # helpers, logger, crypto
│   │   └── __tests__/       # Vitest unit-тесты
│   ├── migrations/          # SQL-миграции (001..033)
│   ├── schema.sql           # Полная схема БД
│   └── wrangler.toml        # Конфиг Cloudflare
├── mobile/                  # React Native + Expo (мобильное приложение)
├── docs/                    # Документация, архитектура, интеграции
├── .github/workflows/       # CI/CD (GitHub Actions)
└── LICENSE                  # Проприетарная лицензия
```

## Tech Stack

| Слой | Технологии |
|------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Zustand, React Router |
| Backend | Cloudflare Workers, D1 (SQLite), KV (rate-limiting) |
| Mobile | React Native, Expo, TypeScript, Zustand |
| CI/CD | GitHub Actions, Wrangler |
| i18n | Русский / O'zbek (inline conditional) |

## Environment Setup

### Локальная разработка

Создайте `cloudflare/.dev.vars` (не коммитится в git):

```
ENCRYPTION_KEY=<32-символьный ключ шифрования>
JWT_SECRET=<секретный ключ для JWT-токенов>
```

### Production secrets (Cloudflare)

```bash
cd cloudflare
wrangler secret put ENCRYPTION_KEY
wrangler secret put JWT_SECRET
```

## Testing

```bash
# Frontend unit-тесты (Vitest + jsdom + Testing Library)
cd src/frontend && npm run test

# Read-only CI smoke (локальный Vite preview, Chromium, без backend writes)
cd src/frontend && npm run build && npm run test:e2e:smoke

# Полный Playwright e2e — только вручную: global setup и mutable-сценарии
cd src/frontend && npm run test:e2e

# Проверка post-deploy frontend bundle на локальных HTTP fixtures
./scripts/tests/verify_frontend_bundle_test.sh

# Backend тесты (Vitest + node)
cd cloudflare && npm run test

# Полная строгая TypeScript проверка frontend
cd src/frontend && npm run typecheck

# TypeScript проверка (backend)
cd cloudflare && npx tsc --noEmit
```

## Deployment

### CI/CD (GitHub Actions)

Деплой настроен в `.github/workflows/deploy.yml`:

| Ветка | Среда | Запуск | URL |
|-------|-------|--------|-----|
| `main` | Production | Только ручной `workflow_dispatch` | https://kamizo.uz |
| `develop` | Staging | Автоматически при push | https://kamizo-staging.workers.dev |

**Production pipeline:**
1. Install frontend deps -> Unit tests -> Full strict type-check -> Build
2. Install backend deps -> Type-check backend -> Backend tests
3. Install Chromium -> Full `npm run test:e2e:isolated` against local Wrangler/D1/KV only
4. Copy dist -> `cloudflare/public`
5. Deploy via Wrangler
6. Verify the deployed `/assets/*.js` entry returns HTTP 200, JavaScript MIME and more than 100 KiB

Все проверки блокируют production deploy. Isolated E2E запрещает production
origin access. Staging остаётся автоматическим и использует только read-only
`npm run test:e2e:smoke`, чтобы не увеличивать время develop pipeline. Отдельный
`.github/workflows/e2e-isolated.yml` запускает полный isolated E2E для PR и
каждого прямого push в `main`, но ничего не деплоит.

Post-deploy проверку можно запустить отдельно:

```bash
./scripts/verify-frontend-bundle.sh https://kamizo.uz
./scripts/verify-frontend-bundle.sh https://kamizo-staging.workers.dev
```

### Ручной production release

Production frontend запрещено выпускать до backend. Точный порядок:

```bash
# 1. Deploy backend to VPS without --delete, restart it, then smoke both endpoints.
rsync -avz -e "ssh -i ~/.ssh/kamizo_vps" \
  cloudflare/src/ kamizo@95.46.96.209:/opt/kamizo/app/server-src/
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 \
  'sudo systemctl restart kamizo-api && curl --fail http://127.0.0.1:3000/api/health'
curl --fail https://api.kamizo.uz/api/health

# 2. Only after both smokes pass, dispatch the main workflow with the checkbox true.
gh workflow run deploy.yml --ref main -f backend_release_verified=true
gh run watch --exit-status
```

В GitHub UI выберите `Deploy to Cloudflare` -> `Run workflow`, ветку `main`,
отметьте обязательный checkbox `Backend deployed and smoke-tested on VPS` и
только затем нажмите `Run workflow`. Job дополнительно требует GitHub
environment `production`; настройте required reviewers в environment settings.

## Database Migrations

Миграции хранятся в `cloudflare/migrations/` с нумерацией `001_`, `002_`, ..., `033_`.

```bash
# Применить миграцию к production
cd cloudflare
wrangler d1 execute kamizo-db --remote --file=migrations/033_add_tenant_id_training_indexes.sql

# Применить миграцию локально
wrangler d1 execute kamizo-db --local --file=migrations/033_add_tenant_id_training_indexes.sql

# Применить полную схему (только для новой БД)
wrangler d1 execute kamizo-db --remote --file=schema.sql
```

**Правила миграций:**
- Всегда используйте `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`
- Обновляйте `schema.sql` и `schema_no_fk.sql` параллельно
- Все таблицы должны содержать `tenant_id TEXT` для мультитенантности

## Compatibility / Known Issues

- **OTP rollout blocker for meeting voting:** `require_otp=1` is currently not
  enforced. Voting records login verification honestly as `verification_method=login`
  and `otp_verified=0`; this is not legal OTP compliance. Do not describe or
  release meeting-voting changes as OTP-compliant until an OTP provider and
  tenant rollout policy are approved and end-to-end enforcement is implemented.
- Legacy `POST /api/payments` is retired and returns `410 Gone`; create payments through `POST /api/finance/payments`.
- Legacy `GET /api/payments`, `GET /api/payments/:id`, and `GET /api/apartments/:apartmentId/balance` remain read compatibility endpoints. They reject missing/sentinel tenant context before SQL, use unconditional tenant equality, and return RFC 9745 `Deprecation: @1786752000` plus endpoint-specific successor links.
- Frontend `/payments` redirects to `/finance/charges`. The legacy page, store, and API client retain read compatibility only; their mutation action was removed. The database table remains in place, with no table drop or data migration in this retirement.

## Key Features

- **Заявки** — создание, назначение, отслеживание статуса, оценка исполнителей
- **Собрания** — повестка дня, голосование по площади (закон РУз), протоколы
- **Маркетплейс** — каталог товаров для жильцов (ru/uz)
- **QR-доступ** — гостевые пропуска: разовые, дневные, постоянные
- **Чат** — каналы по зданиям, прямые сообщения
- **Объявления** — с приоритетами и таргетингом
- **Транспорт** — учёт автомобилей жильцов
- **Обучение** — предложения, голосование, регистрация, обратная связь
- **Коллеги** — система оценки сотрудников (10 критериев)
- **Блокнот** — персональные заметки для сотрудников
- **Мультитенантность** — изоляция данных по `tenant_id`
- **Rate-limiting** — защита через Cloudflare KV
- **Structured logging** — JSON-логи с requestId

## Roles

| Роль | Доступ |
|------|--------|
| `super_admin` | Полный доступ ко всем тенантам |
| `admin` | Управление тенантом, пользователями |
| `director` | Управление зданиями, собраниями |
| `manager` | Заявки, объявления, чат, маркетплейс |
| `dispatcher` | Распределение заявок исполнителям |
| `department_head` | Управление отделом исполнителей |
| `executor` | Выполнение заявок (plumber/electrician/general) |
| `security` | Проверка QR-кодов, контроль доступа |
| `marketplace_manager` | Управление товарами маркетплейса |
| `resident` | Создание заявок, голосование, чат |
| `tenant` | Арендатор — ограниченный доступ |

## License

Copyright (c) 2026 Kamizo. All rights reserved. See [LICENSE](./LICENSE).

For licensing inquiries: info@kamizo.uz
