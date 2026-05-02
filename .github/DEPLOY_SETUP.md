# 🚀 Настройка автоматического деплоя на Cloudflare

## 📋 Что это делает?

GitHub Actions автоматически деплоит UK-CRM на Cloudflare Workers при каждом push в ветку `main`.

**Процесс:**
1. ✅ Собирает frontend (React + Vite)
2. ✅ Копирует файлы в `cloudflare/public`
3. ✅ Деплоит на Cloudflare Workers
4. ✅ Применяет миграции к D1 database
5. ✅ Сайт обновляется на https://kamizo.uz

---

## ⚙️ Настройка (ОДИН РАЗ)

### Шаг 1: Получить Cloudflare API Token

1. Зайдите на https://dash.cloudflare.com/profile/api-tokens
2. Нажмите **"Create Token"**
3. Выберите шаблон **"Edit Cloudflare Workers"**
4. Или создайте Custom Token с правами:
   - **Account** → **Cloudflare Workers** → **Edit**
   - **Account** → **D1** → **Edit**
   - **Zone** → **Workers Routes** → **Edit**

5. Нажмите **"Continue to summary"** → **"Create Token"**
6. **СКОПИРУЙТЕ TOKEN** (он показывается только один раз!)

---

### Шаг 2: Добавить токен в GitHub Secrets

1. Откройте ваш репозиторий на GitHub:
   https://github.com/PalachSHAXA/UK-CRM

2. Перейдите в **Settings** → **Secrets and variables** → **Actions**

3. Нажмите **"New repository secret"**

4. Создайте секрет:
   - **Name:** `CLOUDFLARE_API_TOKEN`
   - **Secret:** ваш токен из Шага 1
   - Нажмите **"Add secret"**

---

### Шаг 3: Проверка настроек (опционально)

Убедитесь что в `cloudflare/wrangler.toml` правильные настройки:

```toml
name = "uk-crm"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "uk-crm-db"
database_id = "ваш-database-id"

[durable_objects]
bindings = [
  { name = "CONNECTION_MANAGER", class_name = "ConnectionManager" }
]

[[migrations]]
tag = "v1"
new_classes = ["ConnectionManager"]
```

---

## 🎯 Как использовать?

### Автоматический деплой (рекомендуется):

```bash
# Делаете изменения в коде
git add .
git commit -m "Add new feature"
git push origin main

# GitHub Actions автоматически:
# 1. Соберёт frontend
# 2. Задеплоит на Cloudflare
# 3. Уведомит вас о результате
```

### Ручной деплой через GitHub UI:

1. Откройте **Actions** → **Deploy to Cloudflare**
2. Нажмите **"Run workflow"**
3. Выберите ветку `main`
4. Нажмите **"Run workflow"**

---

## 📊 Мониторинг деплоев

### Проверить статус деплоя:

1. Откройте репозиторий на GitHub
2. Перейдите во вкладку **Actions**
3. Увидите список всех деплоев и их статус:
   - ✅ Зелёная галочка = успешно
   - ❌ Красный крестик = ошибка
   - 🟡 Жёлтый круг = в процессе

### Логи деплоя:

Кликните на любой workflow → откроются подробные логи каждого шага

---

## 🔧 Устранение проблем

### Ошибка: "Invalid API Token"

**Решение:**
1. Проверьте что токен добавлен в GitHub Secrets
2. Убедитесь что токен активен (зайдите в Cloudflare)
3. Пересоздайте токен если истёк

### Ошибка: "Database not found"

**Решение:**
1. Проверьте `database_id` в `wrangler.toml`
2. Узнать ID: `wrangler d1 list`
3. Обновите ID в конфиге

### Ошибка при сборке frontend:

**Решение:**
1. Проверьте что все зависимости в `package.json`
2. Удалите `package-lock.json` и пересоздайте
3. Проверьте Node.js версию (должна быть 18+)

---

## 🔐 Безопасность

✅ **API Token хранится в GitHub Secrets** (зашифрован)
✅ **Токен виден только в логах GitHub Actions** (если явно не выводить)
✅ **Используются только нужные права** (Workers + D1)

⚠️ **НЕ КОММИТЬТЕ** токен в код или конфиг файлы!

---

## 📝 Дополнительно

### Отключить автодеплой:

Удалите файл `.github/workflows/deploy.yml`

### Деплой только для определённых веток:

Измените в `deploy.yml`:
```yaml
on:
  push:
    branches:
      - main
      - production  # добавьте нужные ветки
```

### Деплой по расписанию:

Добавьте в `deploy.yml`:
```yaml
on:
  schedule:
    - cron: '0 2 * * *'  # каждый день в 2:00 UTC
```

---

## ✅ Проверка работы

После настройки:

1. Сделайте любой commit и push
2. Откройте **Actions** на GitHub
3. Дождитесь завершения workflow (≈2-3 минуты)
4. Откройте https://kamizo.uz
5. Проверьте что изменения применились

---

**Готово!** 🎉 Теперь каждый push автоматически деплоится на Cloudflare.
