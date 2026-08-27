-- 075_meeting_otp_records_drift.sql
--
-- Приведение meeting_otp_records к тому, что уже написано в коде.
--
-- ── Как обнаружено ───────────────────────────────────────────────────
-- Первый в истории вызов POST /api/meetings/otp/request (2026-08-26)
-- упал 500:
--
--   SqliteError: table meeting_otp_records has no column named phone
--       at routes/meetings/otp.ts:29
--
-- Эндпоинт существовал давно, но код никуда не отправлялся, поэтому его
-- никто не дёргал и расхождение не всплывало. Ровно тот сценарий, о
-- котором предупреждает .claude/skills/kamizo-schema-drift-guard —
-- meeting_otp_records перечислена там среди пяти таблиц с дрейфом.
--
-- ── Что было в проде ─────────────────────────────────────────────────
--   id, meeting_id NOT NULL, user_id NOT NULL, otp_code NOT NULL,
--   is_used, created_at, expires_at, tenant_id
--
-- ── Чего не хватало коду ─────────────────────────────────────────────
-- phone, purpose, agenda_item_id, attempts, max_attempts, verified_at.
--
-- Взято решение добавить колонки, а не упростить код, потому что
-- каждая из них несёт функцию, которая иначе молча исчезает:
--
--   attempts / max_attempts — ограничение перебора шестизначного кода.
--       Ветка `if (otp.attempts >= otp.max_attempts)` в verify уже
--       написана, но при отсутствии колонок сравнение шло с undefined
--       и НИКОГДА не срабатывало. Rate-limit (10 попыток за 10 минут)
--       прикрывает лишь частично: он ключуется по вызывающему, а не по
--       конкретному OTP.
--   verified_at — доказательство в протоколе собрания: когда именно
--       подтверждён голос.
--   agenda_item_id / purpose — привязка кода к конкретному вопросу
--       повестки. Без неё код, выданный для одного голосования,
--       предъявляется в другом.
--   phone — номер на момент выдачи. Житель может сменить телефон
--       позже, а протокол должен остаться воспроизводимым.
--
-- ── Чего здесь НЕТ ───────────────────────────────────────────────────
-- Колонку `code` не добавляем: в проде она называется otp_code, и это
-- имя ничем не хуже. Переименование потребовало бы пересборки таблицы
-- ради косметики — вместо этого поправлен код (otp.ts).
--
-- meeting_id остаётся NOT NULL. Ослабить ограничение без пересборки
-- SQLite не даёт, а само требование верное: OTP без привязки к
-- собранию — слабое доказательство. Роут теперь требует meeting_id и
-- проверяет, что собрание принадлежит тенанту вызывающего (раньше туда
-- принималась любая строка и молча уходила в протокол).
--
-- SQLite запрещает IF NOT EXISTS у ALTER ADD COLUMN — миграция
-- прогоняется ровно один раз.

ALTER TABLE meeting_otp_records ADD COLUMN phone TEXT;
ALTER TABLE meeting_otp_records ADD COLUMN purpose TEXT DEFAULT 'agenda_vote';
ALTER TABLE meeting_otp_records ADD COLUMN agenda_item_id TEXT;
ALTER TABLE meeting_otp_records ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE meeting_otp_records ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 5;
ALTER TABLE meeting_otp_records ADD COLUMN verified_at TEXT;

-- Канал доставки кода. Нужен протоколу собрания: подтверждение по SMS
-- и подтверждение через мессенджер — юридически разные вещи, и запись
-- «подтверждено кодом» без указания канала не восстанавливается задним
-- числом. Значения: 'telegram' | 'sms' | 'none'.
ALTER TABLE meeting_otp_records ADD COLUMN delivery_channel TEXT;

CREATE INDEX IF NOT EXISTS idx_meeting_otp_user
  ON meeting_otp_records(user_id, is_used);
