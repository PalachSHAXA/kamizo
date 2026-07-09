---
name: kamizo-post-deploy-verify
description: Обязательная проверка после frontend/wrangler-деплоя в Kamizo. Активируется автоматически ПОСЛЕ `wrangler deploy`, "задеплоил фронт", "выкатил на app.kamizo.uz", "фронт-релиз", а также вручную если сомневаешься в актуальности prod-бандла. Use proactively immediately after any frontend / wrangler deploy — deploy is NOT done until this passes. Гарантирует, что новый bundle реально сериется как JavaScript (>100KB), а не как text/html-заглушка от wrangler asset-manifest bug (инцидент 2026-07-08: 0-byte bundle, deploy отрапортовал успех, дашборд УК не работал день).
---

# Kamizo — проверка после деплоя фронта

Wrangler может отрапортовать `Uploaded X files` и `Deployed successfully`, но
физически не связать новый bundle с opublicованной версией — тогда
`/assets/index-*.js` отдаётся как 0-байт `text/html` (SPA-fallback вместо
файла). Пользователь получает пустой экран или замороженный UI.

Единственный надёжный способ узнать, что деплой действительно доехал — curl
свежего bundle с прода и проверить, что это реально JavaScript нужного
размера.

## ШАГ 1 — вытащить актуальный bundle-hash из свежего index.html

```bash
MAIN=$(curl -s "https://app.kamizo.uz/?t=$(date +%s)" \
  | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' \
  | head -1)
echo "bundle path: $MAIN"
```

`?t=timestamp` — cache-buster для Cloudflare edge, чтобы получить именно
свеже-деплоенный index.html, а не кэшированный со старым hash'ем.

**Если `$MAIN` пустой** → сам index.html не сериется. Это критично: либо
worker вообще не отвечает, либо SPA-fallback вернул что-то без ссылок на
bundle. **СТОП, не считать деплой пройденным.** Смотреть `curl -sI
https://app.kamizo.uz/` — что там за статус.

## ШАГ 2 — проверить сам bundle

```bash
curl -sI "https://app.kamizo.uz${MAIN}"
```

**Критерии PASS (все три):**
- HTTP `200`
- `content-type: text/javascript` (или `application/javascript`)
- `content-length` > 100000 (>100KB — реальный JS-бандл фронта)

**Критерии FAIL (любой из):**
- `content-type: text/html` → это SPA-fallback, bundle не найден в манифесте
- `content-length` = 0 или <10 KB → пустой ответ
- HTTP `404` → путь не найден вообще

Дополнительно можно уточнить полное тело:

```bash
curl -sS "https://app.kamizo.uz${MAIN}" | wc -c
# > 100000  — PASS
# 0..10000  — FAIL (пустой / крошечный)
```

## ШАГ 3 — если FAIL: wrangler asset-manifest bug

Инцидент 2026-07-08: `Uploaded 23171 files` в выводе wrangler, но при этом
`content-type: text/html`, `content-length: 0`, `cf-cache-status: HIT` на JS.
Причина — новый bundle не привязан к текущей deployment-версии manifest'а.

**Действие:**

```bash
cd cloudflare
wrangler deploy
sleep 30   # дать edge синхронизироваться
```

Затем **повторить ШАГИ 1-2**. Обычно проходит со второй попытки.

**Если после 2 повторов всё ещё FAIL:**
- Не оставляй прод в этом состоянии.
- Эскалируй пользователю: «wrangler deploy не связывает bundle, нужен ручной
  разбор — Cloudflare dashboard / контакт с CF-поддержкой».
- Пока не решено — сообщи, что прод-фронт битый.

## ШАГ 4 — sanity API

Backend не задет фронт-деплоем, но подтвердить, что связка «фронт зовёт API»
не сломана внешним фактором:

```bash
curl -sS https://api.kamizo.uz/api/health
```

Ожидание: `{"status":"healthy","checks":{"database":true,"cache":true,
"websocket":true}, ...}`.

Если API вернул 5xx / timeout — фронт может задеплоиться корректно, но
пользователь всё равно увидит ошибки. Это отдельный класс инцидентов;
запустить `kamizo-prod-bug-triage`.

## Фронт-деплой НЕ считается завершённым, пока bundle-проверка не PASS

Никаких «задеплоил» / «раскатал» / «готово» в ответ пользователю **до
успеха ШАГА 2**. Ложное «готово» — это ровно то, что случилось 2026-07-08:
wrangler отрапортовал ok, я передал «готово», а живой сайт был битый весь
день, пока не сделали второй `wrangler deploy` и не проверили curl'ом.

Порядок формулировок:

- ❌ «wrangler deploy прошёл успешно, релиз готов»
- ✅ «wrangler deploy прошёл, проверил bundle: 417 KB text/javascript,
  content-type ok — релиз готов»

## Backend-деплой (rsync на VPS) — проверяется иначе

Этот skill — только про фронт (Cloudflare Worker). Backend-часть
(`cloudflare/src/**` через rsync) проверяется другой цепочкой:

```bash
# 1. Сервис активен и не в crash-loop
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 \
  'sudo systemctl status kamizo-api --no-pager | head -10'
# Ожидание: Active: active (running) since <сегодня, только что>

# 2. API отвечает
curl -sS https://api.kamizo.uz/api/health
# Ожидание: {"status":"healthy", "checks":{"database":true, ...}}

# 3. Файлы на VPS свежие (mtime сегодня)
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 \
  'ls -la /opt/kamizo/app/server-src/routes/<changed-file>.ts'
```

При смешанном деплое (фронт + бэк) — пройти обе цепочки: bundle-check для
фронта + systemctl/health/mtime для бэка.
