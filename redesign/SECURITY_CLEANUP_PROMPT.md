# Промт для очистки утечки Cloudflare API-токена

> Скопировать целиком и отдать новой Claude-сессии когда будешь готов разобраться с этим. Не делать наспех — сначала ротировать токен на dashboard.cloudflare.com.

---

## Контекст

В репозитории `/Users/shaxzodisamahamadov/kamizo` найдена **утечка Cloudflare API-токена** в 26 PowerShell-скриптах (`.ps1`) в корне проекта и в 3 markdown-отчётах.

Список затронутых файлов (можно перепроверить через `grep -lr "CLOUDFLARE_API_TOKEN" .`):

**.ps1 скрипты в корне:**
```
apply-migration-023.ps1
apply-migration-024.ps1
apply-migrations.ps1
build-and-deploy.ps1
build-frontend-and-deploy.ps1
check-channel-e14f.ps1
check-chat-channels.ps1
check-chat-messages-schema.ps1
check-tables.ps1
check-user-status-values.ps1
check-users-schema.ps1
check-worker-logs.ps1
check-worker-version.ps1
create-channel-direct.ps1
find-orphaned-messages.ps1
fix-fk-complete.ps1
fix-fk-final.ps1
fix-fk-step-by-step.ps1
insert-test-message.ps1
install-nodejs.ps1
migrate-d1.ps1
migrate.ps1
quick-deploy.ps1
test-and-migrate.ps1
test-insert-to-channel.ps1
test-message-insert.ps1
```

Плюс 3 audit-отчёта (точные имена нужно перепроверить grep'ом).

## Действия в порядке важности

### 1. ПРОВЕРИТЬ что токен ротирован (вручную пользователем)

Открой dashboard.cloudflare.com/profile/api-tokens → проверь что старый токен удалён или roll'нут. **Не приступай к шагу 2 если не уверен.** Если токен ещё активен — попроси пользователя ротировать СНАЧАЛА.

### 2. Удалить .ps1 скрипты

Они работают только на Windows, у пользователя macOS — они ему не нужны. Если нужны команды быстрого деплоя — заменим на `package.json` scripts или Makefile (без хардкода токенов).

```bash
cd /Users/shaxzodisamahamadov/kamizo
rm -f *.ps1
```

### 3. Отредактировать markdown-отчёты

В 3 .md файлах токен светится текстом. Замени на `***REDACTED — token rotated YYYY-MM-DD***` (без удаления самих отчётов, они audit-история).

### 4. Создать `.gitignore` запись на будущее

Добавь в `.gitignore`:
```
*.ps1
.env
.env.local
.dev.vars
**/secrets.json
```

### 5. Добавить pre-commit hook

В `.husky/pre-commit` (он уже существует):
```bash
#!/bin/sh
# Block any commit that contains a Cloudflare token pattern
if git diff --cached | grep -E "[a-zA-Z0-9_-]{40,}" | grep -iE "(cloudflare|wrangler|api.token|api.key)" > /dev/null; then
  echo "❌ Похоже на API-токен в diff. Если это false-positive — git commit --no-verify"
  exit 1
fi
```

### 6. Перепиcать историю git (если репо приватное и команда маленькая)

Если в репо больше 1-2 коллабораторов или он публичный — **пропустить этот шаг**, force-push сломает у всех.

```bash
brew install git-filter-repo
cd /Users/shaxzodisamahamadov/kamizo
git tag pre-token-cleanup-backup
git filter-repo --replace-text <(echo 'СТАРЫЙ_ТОКЕН==>***REDACTED***')
git push origin --force --all
git push origin --force --tags
```

### 7. Проверить что деплой ещё работает

```bash
cd /Users/shaxzodisamahamadov/kamizo/cloudflare
wrangler whoami    # должен показать аккаунт с новым токеном
wrangler deploy    # тестовый деплой — должен пройти
```

### 8. Зафиксить как commit

```bash
git add -A
git commit -m "security: remove leaked Cloudflare API token from .ps1 scripts and audit reports

- Removed 26 PowerShell deploy/check scripts that hardcoded the API token.
  Replacement: use 'wrangler login' or env var CLOUDFLARE_API_TOKEN.
- Redacted token from 3 historical audit .md files
- Added .ps1 to .gitignore
- Added pre-commit hook to block future token commits

Token was rotated on Cloudflare dashboard before this commit."
git push
```

## Что НЕ делать

- ❌ Не удалять .md отчёты целиком — это история проекта
- ❌ Не делать force-push если репо имеет больше 2 коллабораторов
- ❌ Не оставлять `.ps1` скрипты с placeholder-токеном — если кто-то снова туда впишет настоящий, всё повторится
- ❌ Не пытаться ротировать токен из агента — это должен сделать владелец аккаунта вручную через web UI
