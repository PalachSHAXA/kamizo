-- 074_telegram_users.sql
--
-- Этап 3 ТЗ (§16): личная привязка Telegram переезжает из колонок
-- users.telegram_* в отдельную таблицу.
--
-- ── Зачем переезд ────────────────────────────────────────────────────
-- Миграция 070 положила telegram_chat_id прямо в users. Это работало,
-- но навязывало правило «один Telegram = один аккаунт Kamizo»:
-- обработчик /start обнулял chat_id у всех прочих пользователей, иначе
-- сосед продолжал бы получать чужие уведомления.
--
-- §16 требует обратного: «Один Telegram-пользователь потенциально может
-- иметь аккаунты в нескольких тенантах. Модель должна учитывать это и
-- не полагаться только на telegram_user_id». В мультитенантном ЖКХ это
-- обычный случай: человек владеет квартирой в доме УК A и арендует в
-- доме УК B — два разных аккаунта Kamizo, один Telegram.
--
-- Колонка на users выразить такое не может: там одна строка на
-- пользователя и нет места под «этот же Telegram, но другой тенант».
--
-- ── Правила уникальности ─────────────────────────────────────────────
-- UNIQUE(user_id) среди неотозванных строк: у одного аккаунта Kamizo не
-- больше одной активной привязки. Иначе непонятно, в какой из двух
-- чатов слать код подтверждения.
--
-- НЕТ уникальности по telegram_user_id — это и есть суть §16. Один
-- Telegram законно встречается в нескольких строках, по одной на
-- аккаунт.
--
-- Отзыв мягкий (revoked_at), а не DELETE: §22 требует логировать отзыв
-- привязки, и строка нужна, чтобы ответить, кому и когда уходили коды.
--
-- ── Колонки ──────────────────────────────────────────────────────────
-- telegram_user_id   from.id из апдейта — постоянный ID человека.
-- telegram_chat_id   ID личного чата с ботом. В приватном чате он равен
--                    telegram_user_id, но хранится отдельно: слать надо
--                    именно в chat_id, и завязываться на их равенство
--                    значит зашивать деталь реализации Telegram.
-- notifications_enabled  §16 шаг 8: пользователь выбирает типы
--                    уведомлений. Пока один флаг на всё.
-- security_enabled   Подтверждение входа (§17, Этап 4). Отдельно от
--                    уведомлений: согласие «пишите мне про заявки» не
--                    означает согласия сделать Telegram вторым фактором.
--                    По умолчанию 0.
--
-- ── Старые колонки НЕ удаляются ──────────────────────────────────────
-- users.telegram_chat_id / telegram_username / telegram_linked_at
-- остаются на месте. Причины: SQLite не умеет DROP COLUMN без
-- пересборки таблицы (users — самая нагруженная в схеме), а главное —
-- пока новый код не отработал в проде, откат должен сводиться к
-- возврату предыдущей версии файлов, без обратной миграции данных.
-- Удалить их отдельной миграцией, когда telegram_users отстоится.

CREATE TABLE IF NOT EXISTS telegram_users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  telegram_user_id TEXT NOT NULL,
  telegram_chat_id TEXT NOT NULL,
  telegram_username TEXT,
  notifications_enabled INTEGER NOT NULL DEFAULT 1,
  security_enabled INTEGER NOT NULL DEFAULT 0,
  linked_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_users_active_user
  ON telegram_users(user_id) WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_telegram_users_chat
  ON telegram_users(telegram_chat_id, revoked_at);

CREATE INDEX IF NOT EXISTS idx_telegram_users_tenant
  ON telegram_users(tenant_id, revoked_at);

-- ── Перенос существующих привязок ────────────────────────────────────
-- На момент написания в проде их ноль или одна (тестовая), но миграция
-- обязана быть корректной и на непустых данных.
--
-- telegram_user_id заполняется из chat_id: в личном чате они совпадают,
-- а настоящего from.id для уже привязанных строк у нас нет — 070 его не
-- сохраняла. Значение самокорректируется при следующем апдейте от этого
-- пользователя.
--
-- COALESCE на tenant_id: колонка в users объявлена без NOT NULL, а в
-- telegram_users она обязательная.
INSERT INTO telegram_users
  (id, tenant_id, user_id, telegram_user_id, telegram_chat_id,
   telegram_username, linked_at)
SELECT
  'migrated-' || u.id,
  COALESCE(u.tenant_id, ''),
  u.id,
  u.telegram_chat_id,
  u.telegram_chat_id,
  u.telegram_username,
  COALESCE(u.telegram_linked_at, datetime('now'))
FROM users u
WHERE u.telegram_chat_id IS NOT NULL
  AND u.telegram_chat_id != ''
  AND NOT EXISTS (
    SELECT 1 FROM telegram_users t
    WHERE t.user_id = u.id AND t.revoked_at IS NULL
  );
