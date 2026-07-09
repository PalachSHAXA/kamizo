---
name: kamizo-prod-bug-triage
description: Обязательный порядок диагностики прод-бага в Kamizo. Активируется когда пользователь сообщает о симптомах живого прод-инцидента — 500-ках, "не работает в проде", "пользователи жалуются", "экран пустой/сломан", "не могу залогиниться", "запрос падает", ошибки в err.log или в консоли браузера. Use proactively whenever investigating any production bug — до любых гипотез, до любых предположений о причине. Заставляет собрать данные из VPS-логов + воспроизвести проблему curl'ом ДО того, как формулировать теории про кэш / SW / race conditions / CORS / т.п.
---

# Kamizo — диагностика прод-бага

Прод-баг — это данные, а не гипотезы. Гипотеза до данных потратила день в
инциденте 2026-07-08 (диагноз "stale Service Worker" оказался ложным, реальная
причина — Cloudflare wrangler asset manifest, увиденная в 3 curl-запросах).

Ниже — **жёсткий обязательный порядок**. Не пропускать ни один шаг. Не менять
местами. Не начинать «Скорее всего это…» до завершения шагов 1 и 2.

## ШАГ 1 — ДАННЫЕ ПЕРВЫМИ

До любых гипотез собери:

**VPS-логи** (API-запросы обслуживаются здесь, не в Worker'е):

```bash
# Systemd — старт/стоп/crash-loop сервиса
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 \
  'sudo journalctl -u kamizo-api -n 200 --no-pager'

# Приложение — реальные request_start / request_end / api_error
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 \
  'tail -200 /opt/kamizo/logs/api.log'

# Ошибки со стеком
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 \
  'tail -100 /opt/kamizo/logs/api.err.log'

# Точечно по симптому — если знаешь endpoint или строку ошибки:
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 \
  'grep -E "PATH_OR_STRING" /opt/kamizo/logs/api.err.log | tail -20'
```

**Зафиксируй точный HTTP-статус падающего запроса** — это три РАЗНЫЕ причины,
диагностируемые по-разному:

- **403** → auth/tenant-middleware отбивает. Копай `getUser`, `getTenantSlug`,
  `isSuperAdmin`, feature-flag'и (`requireFeature`).
- **500** → uncaught throw в handler'е. err.log покажет `api_error` + стек. Это
  обычно SQL-drift (`no such column: X`), опечатка в SQL (`datetime("now")` с
  двойными кавычками), или крэш во внешнем вызове.
- **200 с пустым/невалидным телом** → SPA-fallback / кэш / скоп tenant'а
  вернул 0 rows. Смотри `content-type`, `content-length`, `cf-cache-status`.

**НАПОМИНАНИЕ про топологию** (легко забыть и уйти не туда):
- `api.kamizo.uz` → **VPS напрямую** (DNS-only A-record, nginx → 127.0.0.1:3000).
  **Wrangler tail здесь ничего не покажет.**
- `app.kamizo.uz` / `*.kamizo.uz` → **Cloudflare Worker** (только статика).
  `wrangler tail` — только для отладки asset-serving, не API.

Если баг про API — все логи на VPS. Если баг про белый экран/битый bundle/SW —
там и Cloudflare-логи (`npx wrangler tail`) могут пригодиться.

## ШАГ 2 — ВОСПРОИЗВЕСТИ

Не полагайся на пересказ. Симптом надо увидеть своими глазами.

**Для API-бага** — curl с реальным токеном против прода:

```bash
# 1. Логин, взять JWT
LOGIN=$(curl -sS -X POST "https://api.kamizo.uz/api/auth/login" \
  -H "Content-Type: application/json" \
  -H "Origin: https://<tenant>.kamizo.uz" \
  -d '{"login":"<login>","password":"<password>"}')
TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# 2. Дёрнуть падающий endpoint, зафиксировать статус + тело
curl -sS -i -X GET "https://api.kamizo.uz/<endpoint>" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Origin: https://<tenant>.kamizo.uz"
```

Зафиксируй буквально: HTTP-код, `content-type`, тело. Если статус на живом
curl'е отличается от того, что видит пользователь — проверь `Origin`,
`Authorization`, свежесть JWT, `cf-cache-status`.

**Для фронт-бага** — DevTools Network tab у пользователя (или у себя, если
воспроизводится):
- Точный URL запроса, HTTP-статус, response body, `Content-Type`, размер.
- Отправляется ли `Authorization` header (кладка «Headers → Request Headers»)?
- Что говорит Console — есть ли `Uncaught` или CSP violation?

**НЕ гадать «наверное кэш»** — либо `cf-cache-status: HIT` в реальном
ответе, либо это не про кэш.

## ШАГ 3 — ТОЛЬКО ТЕПЕРЬ гипотезы про код

С данными из шагов 1 и 2 — grep по найденному:

```bash
# Ошибка в err.log содержит имя колонки / таблицы / файла — grep по нему
grep -rnE "<column-or-table>" cloudflare/src/routes/

# Endpoint из URL — найди handler
grep -rnE "route\(.*'<PATH>'" cloudflare/src/routes/
```

Проверь целевой файл целиком (не только grep-строчку — контекст важен).
Сверься с prod-схемой если ошибка похожа на schema drift (`no such column`,
`table X has no column named Y` — уже видели с ratings, meters, otp_records,
finance_claims, password.ts).

## ЗАПРЕЩЕНО

**Не предлагай причину и не пиши фикс до того, как:**
- собрал реальный лог из VPS **и**
- воспроизвёл симптом curl'ом или из DevTools с точным статусом + телом.

Формулировки типа «Скорее всего это stale cache», «Возможно проблема в
Service Worker», «Может быть race condition» **без данных из шагов 1-2 —
запрещены**. Именно эти формулировки съели день в инциденте 2026-07-08:

- Диагноз-гипотеза «stale SW / нужно hard refresh» → пользователь несколько
  раз hard-refresh'ил → не помогало.
- Реальная причина, найденная в 3-й curl-серии: Cloudflare wrangler asset
  manifest не связал новый bundle → `content-type: text/html`, 0 bytes на
  `/assets/index-*.js`. Fix — повторный `wrangler deploy`.

Разница между «час» и «день» здесь была одна: **сначала данные, потом теория**.
