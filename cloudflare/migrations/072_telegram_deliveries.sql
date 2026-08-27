-- 072_telegram_deliveries.sql
--
-- Журнал доставки объявлений в Telegram (§10 ТЗ).
--
-- Зачем таблица, а не просто лог: §19 требует, чтобы админ УК видел
-- «доставлено в 8 из 9 групп», а §18 — чтобы суперадмин мог повторить
-- неудачную доставку. И то и другое — запросы к данным, а не к логам.
--
-- Колонки:
--   tenant_id            NOT NULL. Каждая доставка принадлежит тенанту
--                        объявления. Фильтр по нему обязателен на
--                        КАЖДОМ чтении (§3).
--   announcement_id      Объявление-источник. Без FK — см. 071.
--   telegram_group_id    Заполнен для доставки в группу, NULL для
--                        личного сообщения.
--   telegram_user_id     Заполнен для личной доставки (Этап 3), NULL
--                        для групповой. Ровно одно из двух полей
--                        непусто; какое именно — говорит delivery_type.
--   telegram_chat_id     Куда реально отправляли. Дублирует то, что
--                        можно получить джойном, и это намеренно:
--                        группу могут отключить или перепривязать, а
--                        журнал должен остаться воспроизводимым — «в
--                        какой чат ушло сообщение в тот момент».
--   telegram_message_id  ID отправленного сообщения. Нужен для §9:
--                        при правке объявления сообщение редактируется,
--                        а не отправляется заново.
--   delivery_type        'group' | 'private'.
--   status               'pending' | 'sent' | 'failed' | 'disabled' |
--                        'blocked' — набор из §10.
--                        disabled — доставка не пробовалась, потому что
--                        группа отключена или у неё announcements_enabled=0.
--                        blocked — Telegram ответил, что бота выгнали
--                        или заблокировали; повторять бессмысленно,
--                        нужно чинить привязку.
--   error_message        Техническая ошибка Telegram API для §18.
--                        Тексты объявлений сюда НЕ попадают.
--   attempts             Счётчик попыток (§23: повторы ограничены).
--
-- Идемпотентность повторной отправки (§23: «повторная отправка не
-- должна создавать дубликаты») обеспечивается UNIQUE-индексом
-- idx_telegram_deliveries_once: на пару (объявление, чат) существует
-- ровно одна строка. Отправка идёт через INSERT … ON CONFLICT DO
-- UPDATE, поэтому и параллельный вызов, и ручной ретрай из суперадминки
-- обновляют одну и ту же строку, а не плодят дубли. Счётчик attempts
-- при этом инкрементируется, так что видно, сколько раз пытались.

CREATE TABLE IF NOT EXISTS telegram_deliveries (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  announcement_id TEXT NOT NULL,
  telegram_group_id TEXT,
  telegram_user_id TEXT,
  telegram_chat_id TEXT NOT NULL,
  telegram_message_id TEXT,
  delivery_type TEXT NOT NULL DEFAULT 'group',
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_deliveries_once
  ON telegram_deliveries(announcement_id, telegram_chat_id);

CREATE INDEX IF NOT EXISTS idx_telegram_deliveries_announcement
  ON telegram_deliveries(announcement_id);

CREATE INDEX IF NOT EXISTS idx_telegram_deliveries_tenant_status
  ON telegram_deliveries(tenant_id, status);
