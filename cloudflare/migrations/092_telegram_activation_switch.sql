-- 092_telegram_activation_switch.sql
--
-- Цель: безопасный переключатель «требовать Telegram-активацию» на уровне
-- тенанта + индивидуальный bypass для сервисных аккаунтов (Apple-ревью,
-- тестовые логины УК и т. п.). По умолчанию ВЫКЛЮЧЕНО везде — поведение
-- входа у всех пользователей после миграции остаётся прежним.
--
-- Логика склейки в auth.ts (новый гейт перед createFirstLoginActivation):
--   tenants.require_telegram_activation = 1
--   AND users.skip_telegram_activation = 0
--   AND tenants.is_demo = 0
--   AND user.role IN ('resident','tenant','commercial_owner')
--   AND users.telegram_activation_required = 1
--   AND users.telegram_activated_at IS NULL
-- Хоть одно нарушено → вход идёт как раньше (без активации).
--
-- Миграция ТОЛЬКО добавляет колонки. Не трогает 074 (telegram_users) и
-- 091 (telegram_activation_requests + триггеры). ALTER TABLE ADD COLUMN
-- без IF NOT EXISTS — так требует SQLite (CLAUDE.md «Абсолютные
-- запреты»).

BEGIN IMMEDIATE;

ALTER TABLE tenants ADD COLUMN require_telegram_activation INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users   ADD COLUMN skip_telegram_activation    INTEGER NOT NULL DEFAULT 0;

-- Индекс только по user bypass (горячий путь — login жителя). По тенанту
-- индекс не нужен: записей в tenants десятки, full scan дёшев.
CREATE INDEX IF NOT EXISTS idx_users_skip_tg_activation
  ON users(tenant_id, skip_telegram_activation)
  WHERE skip_telegram_activation = 1;

COMMIT;
