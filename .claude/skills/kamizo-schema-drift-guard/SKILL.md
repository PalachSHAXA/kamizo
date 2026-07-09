---
name: kamizo-schema-drift-guard
description: Обязательная сверка кода с РЕАЛЬНОЙ prod-схемой БД перед любой SQL-записью в Kamizo. Активируется когда собираешься писать миграцию, `ALTER TABLE ADD COLUMN`, новый INSERT / UPDATE / SELECT с колонками, ссылку на новое поле таблицы, или слышишь фразы "добавить колонку", "новая таблица", "поменять схему". Use proactively before writing any migration, INSERT, or UPDATE that references table columns — prod schema is the ONLY source of truth, schema.sql lies. За сессию 2026-07-09 найдено 5 таблиц с drift'ом (employee_ratings, meters, meter_readings, meeting_otp_records, finance_claims) — каждая = гарантированный 500 при первом же вызове.
---

# Kamizo — защита от schema-drift

## Принцип

**Единственный источник истины про схему БД — реальная prod-база**, а именно
`/opt/kamizo/data/kamizo.db` на VPS 95.46.96.209.

- `cloudflare/schema.sql` — **лжёт** (расходится с prod в обе стороны).
- `cloudflare/schema_no_fk.sql` — тоже лжёт.
- Файлы `cloudflare/migrations/*.sql` — часть применена, часть нет, часть
  конфликтует по номерам.
- `runMigrations()` в `cloudflare/src/index.ts` — самостоятельная система,
  создаёт таблицы `tenants`, `super_banners`,
  `meeting_vote_reconsideration_requests` в рантайме.
- Значительная часть колонок и таблиц добавлена **руками через `sqlite3`
  прямо на VPS** — эти изменения не зафиксированы нигде, кроме самой БД.

Если код целится в схему из `schema.sql` — код умрёт 500-й в проде.

## ШАГ 1 — снять реальную схему целевой таблицы

Перед любой работой с таблицей `<TABLE>`:

```bash
# Полный DDL (CREATE TABLE + все ALTER TABLE, слитые):
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 \
  "sqlite3 /opt/kamizo/data/kamizo.db '.schema <TABLE>'"

# Или таблица колонок с типами:
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 \
  "sqlite3 -header /opt/kamizo/data/kamizo.db 'PRAGMA table_info(<TABLE>);'"
```

Зафиксируй **точный список колонок** (имена, типы, дефолты). Это твой
контракт.

## ШАГ 2 — сверить с колонками, которые трогает код

Выпиши, какие колонки твой INSERT / UPDATE / SELECT собирается писать или
читать:

```bash
# Все SQL против таблицы:
grep -rnE "(SELECT.*FROM <TABLE>|INSERT INTO <TABLE>|UPDATE <TABLE>|DELETE FROM <TABLE>)" \
  cloudflare/src/routes/
```

**Сравни построчно.** Любая колонка, которую упоминает код и которой нет в
выводе ШАГА 1 — будущий 500 `no such column: X`.

Особые случаи, которые мы уже словили:

- **Rename с расходящимися именами**: `resident_id` (в schema.sql) vs
  `rated_by` (в prod) — employee_ratings; `type` vs `meter_type` — meters;
  `install_date` vs `installation_date` — meters.
- **Полностью отсутствующая колонка**: `finance_claims.resident_id` в
  schema.sql, но не в prod → INSERT reconciliation ломался.
- **Несуществующие в prod «продвинутые» колонки**: `meters.current_value`,
  `meter_readings.previous_value`, `meeting_otp_records.attempts` —
  недостроенная фича, prod остался на минимальной модели.
- **Опечатка в SQL-функции** (тоже класс drift): `datetime("now")` с двойными
  кавычками — SQLite воспринимает `"now"` как identifier, а не строку.
  Всегда `datetime('now')`.

## ШАГ 3 — проверить данные

Прежде чем менять контракт (переименовать колонку, дропнуть, изменить тип):

```bash
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 \
  "sqlite3 /opt/kamizo/data/kamizo.db \
   'SELECT COUNT(*) FROM <TABLE>; SELECT * FROM <TABLE> LIMIT 3;'"
```

- **0 строк** → менять контракт безопасно (никого не задеваешь).
- **>0 строк** → продумай миграцию данных. Может ли новый код прочитать
  старую строку? Может ли старый код (если откатим) прочитать новую?
- **Особый случай**: строки создавались одной УК, у остальных 0 → отсчёты
  делай per-tenant (`GROUP BY tenant_id`), может выясниться, что «нужная»
  таблица используется только 1 tenant'ом.

## ШАГ 4 — если добавляешь колонку / новую таблицу

**Файл миграции** в `cloudflare/migrations/NNN_описание.sql`. NNN — следующий
свободный номер (сейчас есть до 053, плюс 5 конфликтов по номерам 3/4/6/30/31
— не повторяй их).

**Применение**:
```bash
scp -i ~/.ssh/kamizo_vps cloudflare/migrations/NNN.sql \
  kamizo@95.46.96.209:/tmp/
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 \
  'sqlite3 /opt/kamizo/data/kamizo.db < /tmp/NNN.sql'
```

**Не через**:
- `wrangler d1 execute` — у нас нет D1 в проде, это устарело.
- Ручной `sqlite3 kamizo.db "ALTER TABLE ..."` без файла миграции — именно
  так набежал текущий drift.

**Ловушки SQLite**, которые надо помнить:
- **`IF NOT EXISTS` НЕ работает** на `ALTER TABLE ADD COLUMN`. Пиши без него;
  миграция применяется ровно один раз.
- **RENAME COLUMN** доступен только с SQLite ≥ 3.25 (VPS ok, но перепроверь).
- **DROP COLUMN** — с SQLite ≥ 3.35 (снова перепроверь на VPS перед
  использованием).
- **NOT NULL без default** на существующей таблице с данными — падёт;
  либо DEFAULT, либо двухшаговая миграция (ADD nullable → backfill → ALTER
  to NOT NULL через recreate).

**После применения** обнови `cloudflare/schema.sql` и `schema_no_fk.sql`
руками до финального состояния — да, они лгут, но пусть хотя бы новый
разработчик, начавший с `wrangler d1 execute --file=schema.sql`, получил
близкую к prod картину.

## 4 конкурирующие системы миграций — карта

За сессию найдены 4 разные системы, влияющие на реальную схему в проде.
Если работаешь со схемой — держи их все в голове:

1. **`cloudflare/migrations/*.sql`** — 51 файл. Применяются вручную через
   `sqlite3 < file.sql` на VPS. Порядок: сначала база (schema.sql), потом
   миграции по возрастанию номера. **Проблемы**: 5 конфликтов номеров
   (двойные `030_`, `031_`, `003_`/`0003_`, `004_`/`0004_`, `006_`/`0006_`);
   часть миграций конфликтует с schema.sql (`duplicate column name`); часть
   ссылается на несуществующие таблицы.

2. **Таблица `d1_migrations`** — трекер применённых миграций. **Ненадёжен**:
   содержит только 2 записи (`0001_create_marketplace_tables.sql`,
   `0003_add_multi_tenancy.sql` от февраля 2026). Остальные 49 миграций
   применены, но не отмечены — то есть трекер не поддерживался.

3. **`runMigrations()` в `cloudflare/src/index.ts:34-365`** — вызывается на
   старте `kamizo-api`. Создаёт:
   - Таблицы: `tenants`, `super_banners`,
     `meeting_vote_reconsideration_requests`.
   - Колонки: `tenants.{logo, is_demo, contract_template}`,
     `users.password_plain`, `requests.{is_paused, paused_at,
     total_paused_time}`, `meeting_vote_records.{is_revote,
     previous_vote_id}`, `tenant_id` на 9 meeting-таблицах.
   - Пересобирает `users` целиком (DROP + CREATE_NEW + INSERT SELECT).
   - Backfill: `entrances.tenant_id`, `apartments.tenant_id`,
     `building_documents.tenant_id`, `users.tenant_id`.

   **НЕ трогать без полного понимания** — `tenants` держит всю
   мультитенантность.

4. **Ручные `sqlite3 ... "ALTER TABLE ..."`** прямо на VPS. Именно этот
   путь добавил в prod: `employee_ratings.{rated_by, rating, request_id}`,
   `meters.{meter_type, installation_date, last_reading}`, всю
   post-минимальную структуру `ad_coupons`. Нигде в репо не зафиксированы.

**Из этого следует правило**: `schema.sql` и `migrations/*.sql` — это архив
«что мы _хотели_ иметь», а не «что реально в проде». **Эталон — только
живая база на VPS.**

## ЗАПРЕЩЕНО

- **Не доверяй `schema.sql` и `migrations/` как источнику того, что реально
  в базе.** За сессию 2026-07-09 найдено 5 таблиц, где код целился в колонки
  из schema.sql, которых нет в проде → гарантированный 500:
  - `employee_ratings` — уже 500 в err.log (2026-07-09 04:00 UTC), исправлено
  - `meters`, `meter_readings` — latent 500 (0 rows, но код падает при первом
    же INSERT); недостроенная фича, отложено
  - `meeting_otp_records` — retired feature (заменено на QRSignatureModal),
    отложено
  - `finance_claims.reconciliation` — latent 500, исправлено (2026-07-09)
  Плюс отдельный класс: `datetime("now")` вместо `datetime('now')` — не
  schema-drift, но проявляется тем же `no such column`. Исправлено в 15
  файлах.

- **Не трогай `runMigrations()`** без полного понимания. Он создаёт core-
  инфраструктуру мультитенантности при каждом старте сервиса.

- **Не пиши миграцию, применяющуюся вручную на VPS без файла.** Именно так
  набежал текущий drift. Всегда файл в `cloudflare/migrations/`, всегда
  через `sqlite3 < file.sql`, всегда с копией `schema.sql`/`schema_no_fk.sql`
  обновлённой.

- **Не полагайся на `d1_migrations`** как на трекер применённого. Проверяй
  прямо в `PRAGMA table_info(<TABLE>)`.

Всегда сверяй с живой prod-базой через SSH перед любым SQL-контрактом.
