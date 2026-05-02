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
# Frontend тесты (Vitest + jsdom + Testing Library)
cd src/frontend && npm run test

# Backend тесты (Vitest + node)
cd cloudflare && npm run test

# TypeScript проверка (frontend)
cd src/frontend && npx tsc --noEmit

# TypeScript проверка (backend)
cd cloudflare && npx tsc --noEmit
```

## Deployment

### CI/CD (GitHub Actions)

Автоматический деплой настроен в `.github/workflows/deploy.yml`:

| Ветка | Среда | URL |
|-------|-------|-----|
| `main` | Production | https://kamizo.uz |
| `develop` | Staging | https://kamizo-staging.workers.dev |

**Pipeline:**
1. Install frontend deps -> Run frontend tests -> Build frontend
2. Copy dist -> cloudflare/public
3. Install backend deps -> Run backend tests
4. Deploy via Wrangler

Тесты блокируют деплой — если тесты не проходят, деплой не происходит.

### Ручной деплой

```bash
# Frontend build + deploy
cd src/frontend && npm run build
rm -rf ../cloudflare/public && cp -r dist ../cloudflare/public
cd ../cloudflare && wrangler deploy
```

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
