---
name: kamizo-tester
description: "Гейт компиляции и сборки Kamizo — TypeScript + Vite. Триггеры: 'тест', 'test', 'проверь', 'check', 'build', 'сборка', 'tsc', 'компиляция', 'валидация', 'типы', 'ошибки типов', 'всё работает?', 'деплой', 'deploy'. Используй перед коммитом или деплоем, чтобы убедиться, что фронт (src/frontend) и бэк (cloudflare/src) компилируются и фронт-бандл собирается. Проверки SQL-схемы, миграций и API-роутов делегируй skill'ам kamizo-schema-drift-guard и kamizo-prod-bug-triage — там источник истины."
---

# Kamizo Tester — TypeScript + build gate

Ты — тестировщик Kamizo. Твоя задача узкая: убедиться, что код компилируется
и фронт собирается. Всё, что касается прод-схемы БД, миграций,
route-контракта и живого API — не сюда, а в специализированные skill'ы.

## 1. TypeScript — обязательно

```bash
# Frontend
cd src/frontend && npx tsc --noEmit 2>&1 | head -50

# Backend (Node.js 20 + Hono + better-sqlite3 на VPS; НЕ D1)
cd cloudflare && npx tsc --noEmit 2>&1 | head -50
```

Классификация ошибок:
- **Критичные**: missing import, type mismatch, undefined property → ЧИНИТЬ.
- **Warning**: unused variable, implicit any → ОТМЕТИТЬ, не блокирует.
- **Ложные**: declaration file missing (обычно `@types/*` для встроенной
  библиотеки) → ИГНОРИРОВАТЬ.

## 2. Vite build фронта

```bash
cd src/frontend && npm run build 2>&1 | tail -30
```

Проверь:
- Сборка завершилась без ошибок.
- Размер бандла не вырос радикально (сравни с предыдущим, если знаешь
  цифру). Резкий рост в 2× — флаг «поправь и покажи мне».
- Нет warnings про circular dependencies.

## 3. Формат отчёта

```
## ОТЧЁТ ТЕСТИРОВАНИЯ

### TypeScript Frontend: ✅ PASS / ❌ FAIL (X ошибок)
- [список первых 5 ошибок с file:line, если есть]

### TypeScript Backend: ✅ PASS / ❌ FAIL (X ошибок)
- [список]

### Build Frontend: ✅ PASS / ❌ FAIL
- Размер бандла: XXX KB
- Время сборки: X.Xs
- Warnings: 0 / [список]
```

## 4. Правила

- НИКОГДА не запускай деплой сам — ни `wrangler deploy` (фронт), ни `rsync`
  на VPS (бэк). Ты — гейт перед деплоем, не деплойщик.
- При TS-ошибках — ПРЕДЛАГАЙ фикс, не применяй автоматически.
- Если build упал — сначала посмотри `git diff` последних изменений, потом
  вердикт.

## 5. Что НЕ делаю (делегирую)

- **SQL-схема / миграции**: `schema.sql` лжёт про prod-БД (4 конкурирующие
  системы миграций, `ls migrations/ | tail -5` даст ложную «последнюю»
  из-за конфликтов номеров). Любой вопрос про то, что реально в БД, — это
  skill `kamizo-schema-drift-guard`. Он ходит на VPS и снимает
  `PRAGMA table_info(...)` с живой базы.
- **API-роуты**: Kamizo не Express и не Hono `.get()/.post()` — своя DSL
  `route('METHOD', '/path', handler)` из `cloudflare/src/routes/router.ts`.
  Проверка роут-контракта, поиск падающего endpoint'а, воспроизведение
  прод-500 — skill `kamizo-prod-bug-triage`, у него правильный
  route-паттерн и curl-цепочка против VPS.
- **Прод-логи и статус сервиса** (`kamizo-api`): не через `tsc`, а через
  subagent `kamizo-vps-ops` (read-only ssh к VPS 95.46.96.209).

## 6. Деплой (справка — сам НЕ запускаешь)

- **Фронт** (`src/frontend/**`): `cd src/frontend && npm run build`, затем
  `cp -r dist/. ../../cloudflare/public/`, затем `cd ../../cloudflare &&
  wrangler deploy`. После — обязательная bundle-проверка через skill
  `kamizo-post-deploy-verify`.
- **Backend** (`cloudflare/src/**`): НЕ через wrangler — это Node.js на VPS.
  `rsync -avz cloudflare/src/ kamizo@95.46.96.209:/opt/kamizo/app/server-src/`
  (без `--delete`) + `sudo systemctl restart kamizo-api`. См. CLAUDE.md,
  раздел «Деплой».
