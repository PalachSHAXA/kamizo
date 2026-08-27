-- 071_telegram_groups.sql
--
-- Этап 1 ТЗ: домовые Telegram-группы, подключённые к тенанту и дому.
--
-- Две таблицы: сами группы и одноразовые токены подключения.
--
-- ── Почему без FK и без CHECK ────────────────────────────────────────
-- Сверка с реальной prod-схемой (2026-08-26) показала, что живые
-- таблицы их не содержат: `announcements.target_building_id` объявлен
-- просто TEXT, хотя schema.sql обещает REFERENCES buildings(id); ни
-- одного CHECK в announcements/buildings в проде нет, хотя schema.sql
-- их декларирует. То же наблюдение зафиксировано в 052_device_tokens.
-- Добавлять ограничения только в новых таблицах — значит завести две
-- разные модели целостности в одной БД. Целостность обеспечивается
-- кодом (проверка принадлежности дома тенанту в routes/telegram/
-- groups.ts), как и во всём остальном проекте.
--
-- ── telegram_groups ──────────────────────────────────────────────────
-- tenant_id     NOT NULL. Отклонение от конвенции проекта, где везде
--               `tenant_id TEXT DEFAULT ''`. Здесь пустого значения
--               взяться неоткуда: группа подключается только
--               авторизованным админом тенанта, и §3 ТЗ запрещает
--               доверять tenant_id из Telegram/URL/фронта.
-- building_id   NOT NULL. Группа ВСЕГДА привязана к дому — на этом
--               держится маршрутизация объявлений (§26: объявление
--               чужого тенанта не должно попасть в чужую группу).
-- entrance      TEXT, NULL = группа обслуживает дом целиком.
--
--               Именно TEXT, а НЕ entrance_id — хотя таблица entrances
--               в Kamizo есть (id, building_id, number INTEGER,
--               UNIQUE(building_id, number)). Причина в том, что
--               таргетинг объявлений её не использует: он сверяет
--               announcements.target_entrance с users.entrance, и оба
--               поля — обычный TEXT с номером подъезда. Группа обязана
--               участвовать в ТОЙ ЖЕ сверке, иначе адресация «на
--               подъезд» её не найдёт.
--
--               Хранить здесь entrance_id значило бы на каждом фанауте
--               резолвить id → number ради сравнения с текстовым
--               target_entrance, и молча терять группу, если строки в
--               entrances нет (а обязательной её никто не делает —
--               users.entrance заполняется независимо).
-- telegram_chat_id  ID чата от Telegram. TEXT, а не INTEGER: у
--               супергрупп он отрицательный и выходит за 32 бита, а при
--               миграции группы в супергруппу МЕНЯЕТСЯ (§20) — тогда
--               пишется новая строка, старая гасится.
-- bot_status    'member' | 'administrator' | 'left' | 'kicked'.
--               Обновляется из апдейта my_chat_member. Нужен, чтобы
--               админ УК видел «бота выгнали из группы» (§19), а
--               фан-аут не тратил вызовы на заведомо мёртвые чаты.
-- disabled_at   Мягкое отключение вместо DELETE — та же логика, что у
--               device_tokens.is_active: нужно уметь ответить на
--               вопрос «какая группа обслуживала дом X в момент Y»
--               при разборе жалобы на недоставленное объявление.
--
-- ── Ключевая гарантия изоляции ───────────────────────────────────────
-- idx_telegram_groups_active_chat — ЧАСТИЧНЫЙ UNIQUE по
-- telegram_chat_id среди строк с disabled_at IS NULL. Это выполнение
-- требования §7: один чат не может быть одновременно активен у двух
-- тенантов. Проверять это в коде недостаточно — две одновременные
-- попытки подключения прошли бы обе. БД отвергает вторую всегда.
-- Отключённые строки из-под UNIQUE выпадают, поэтому группу можно
-- отключить у тенанта A и подключить у тенанта B.

CREATE TABLE IF NOT EXISTS telegram_groups (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  building_id TEXT NOT NULL,
  entrance TEXT,
  telegram_chat_id TEXT NOT NULL,
  telegram_chat_title TEXT,
  listener_enabled INTEGER NOT NULL DEFAULT 0,
  announcements_enabled INTEGER NOT NULL DEFAULT 1,
  bot_status TEXT NOT NULL DEFAULT 'member',
  connected_by TEXT NOT NULL,
  connected_at TEXT NOT NULL DEFAULT (datetime('now')),
  disabled_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_groups_active_chat
  ON telegram_groups(telegram_chat_id) WHERE disabled_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_telegram_groups_tenant
  ON telegram_groups(tenant_id, disabled_at);

CREATE INDEX IF NOT EXISTS idx_telegram_groups_building
  ON telegram_groups(building_id, disabled_at);

-- ── telegram_group_tokens ────────────────────────────────────────────
-- Одноразовые токены для ссылки https://t.me/<bot>?startgroup=<token>.
--
-- §6 ТЗ требует, чтобы в токене лежали tenant_id, building_id,
-- entrance, id администратора и срок — и чтобы токен был подписан.
-- Здесь выбран не подписанный JWT, а непрозрачный случайный токен со
-- строкой в БД. Причины:
--   • Telegram ограничивает startgroup-параметр 64 символами — полезная
--     нагрузка JWT туда физически не влезет.
--   • Одноразовость всё равно требует состояния на сервере: подпись
--     сама по себе не мешает предъявить токен дважды.
-- Полезные данные лежат в этой таблице и берутся ТОЛЬКО отсюда, из
-- строки, найденной по токену. Ничего из Telegram-апдейта не
-- используется как источник tenant/building — это и есть §3.
--
-- expires_at хранится в формате toISOString() и сверяется в JS через
-- new Date(). Через SQL сравнивать нельзя: datetime('now') отдаёт
-- "YYYY-MM-DD HH:MM:SS", а ISO-строка — "YYYY-MM-DDTHH:MM:SS.sssZ", и
-- побайтовое сравнение упирается в 'T' (0x54) против пробела (0x20) на
-- 10-й позиции. 'T' больше всегда, поэтому такой токен «истекал» бы
-- только в полночь UTC. Эта ошибка уже была допущена в 070 и
-- исправлена там же.

CREATE TABLE IF NOT EXISTS telegram_group_tokens (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  building_id TEXT NOT NULL,
  entrance TEXT,
  token TEXT NOT NULL UNIQUE,
  announcements_enabled INTEGER NOT NULL DEFAULT 1,
  listener_enabled INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_telegram_group_tokens_tenant
  ON telegram_group_tokens(tenant_id);
