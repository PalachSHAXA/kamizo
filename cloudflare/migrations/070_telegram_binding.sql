-- 070_telegram_binding.sql
--
-- Привязка аккаунта Kamizo к Telegram-аккаунту жителя.
--
-- Зачем: Bot API sendMessage бесплатен и не тарифицируется, в отличие
-- от SMS и от Telegram Gateway ($0.01 за код). Но бот НЕ МОЖЕТ написать
-- пользователю первым — по номеру телефона отправить нельзя, Bot API
-- так не устроен. Пользователь обязан один раз нажать /start. Отсюда
-- вся конструкция ниже: одноразовый токен в deep-link, по которому
-- бот при /start понимает, какому users.id принадлежит написавший.
--
-- users.telegram_chat_id
--   chat.id из Telegram-апдейта. Именно chat_id, не username: username
--   пользователь может сменить в любой момент, chat_id постоянен.
--   Числовой, но храним TEXT — chat_id для каналов/супергрупп выходит
--   за 32 бита, а SQLite-типизация здесь всё равно динамическая.
--   NULL = Telegram не привязан, уведомления идут прежними каналами.
--
-- users.telegram_username
--   Только для отображения в админке («кому реально уходит»). НИКОГДА
--   не использовать как идентификатор при отправке — см. выше.
--
-- users.telegram_linked_at
--   ISO-датавремя привязки. Нужно для аудита: житель заявляет, что не
--   получал уведомление о собрании — по этому полю видно, был ли канал
--   вообще подключён на тот момент.
--
-- telegram_link_tokens
--   Одноразовые токены для deep-link https://t.me/<bot>?start=<token>.
--   Ключевые свойства:
--     • TTL 10 минут (expires_at) — deep-link утекает в историю
--       браузера, в скриншоты, в пересланные сообщения. Короткое окно
--       ограничивает ущерб.
--     • used_at — одноразовость. Без неё перехваченная ссылка
--       переиспользуется и чужой Telegram привязывается к аккаунту
--       жителя, то есть уводит себе все его уведомления и OTP.
--     • token UNIQUE — гонка «два /start с одним токеном» разрешается
--       на уровне БД, а не приложения.
--     • tenant_id — инвариант проекта: каждая новая таблица имеет
--       колонку tenant_id (CLAUDE.md, «Обязательные архитектурные
--       инварианты»).
--
-- Индекс idx_users_telegram_chat покрывает горячий путь вебхука:
-- «кто владелец этого chat_id» вызывается на КАЖДОМ входящем апдейте.
--
-- SQLite запрещает IF NOT EXISTS у ALTER ADD COLUMN — эта миграция
-- прогоняется ровно один раз (см. CLAUDE.md, раздел «Миграции»).

ALTER TABLE users ADD COLUMN telegram_chat_id TEXT;
ALTER TABLE users ADD COLUMN telegram_username TEXT;
ALTER TABLE users ADD COLUMN telegram_linked_at TEXT;

CREATE INDEX IF NOT EXISTS idx_users_telegram_chat
  ON users(telegram_chat_id);

CREATE TABLE IF NOT EXISTS telegram_link_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_user
  ON telegram_link_tokens(user_id);
