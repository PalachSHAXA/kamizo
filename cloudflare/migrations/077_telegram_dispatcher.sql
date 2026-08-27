-- 077_telegram_dispatcher.sql
--
-- Этап 2 ТЗ (§11–§15): умный диспетчер в домовой группе.
--
-- Бот замечает в подключённой группе сообщения о проблемах ЖКХ и
-- предлагает оформить заявку. Заявку он НЕ создаёт (§27 это прямо
-- запрещает) — только предлагает; всё остальное человек делает в
-- приложении и подтверждает сам.
--
-- ── telegram_suggestions ─────────────────────────────────────────────
-- Одна строка на одно предложение. Таблица решает три задачи сразу:
--
--   1. Антиспам (§14). Кулдаун считается запросом «когда мы последний
--      раз писали этому человеку в этой группе». Без строки в БД
--      состояние держать негде — процесс перезапускается, а память
--      обнуляется.
--   2. Дедупликация. «Не создавать несколько предложений по одной
--      проблеме»: проверяем, не предлагали ли уже по той же категории
--      в той же группе за последний час.
--   3. Статистика полезных и ложных срабатываний (§24, Этап 2). Кнопка
--      «Не нужно» пишет сюда dismissed — по этому полю видно, где
--      классификатор ошибается, и на чём его чинить.
--
-- ВАЖНО про приватность (§15): message_text здесь НЕ хранится.
-- Сохраняются категория, уверенность и telegram_message_id — этого
-- хватает и для антиспама, и для статистики. Текст сообщения попадает
-- в систему только если человек сам нажал «Оформить заявку»: тогда он
-- кладётся в черновик (telegram_draft_tokens) с коротким сроком жизни,
-- а дальше — в саму заявку, уже как данные, введённые пользователем.
-- «Не сохранять всю переписку, не создавать скрытый архив» — §15.
--
-- ── telegram_draft_tokens ────────────────────────────────────────────
-- Подписанный (точнее — непрозрачный одноразовый) черновик заявки для
-- deep link https://app.kamizo.uz/requests/new?telegramDraft=<token>.
--
-- §12 запрещает класть полный текст сообщения и доверяемый tenant_id в
-- открытые URL-параметры. Здесь в URL уходит только случайный токен, а
-- все данные лежат в этой строке и читаются сервером после проверки
-- JWT пользователя. §13 требует сверить tenant черновика с tenant
-- авторизованного пользователя — токен без этой сверки не даёт ничего.
--
-- used_at / used_by — одноразовость: ссылка из группового чата видна
-- всем участникам, и без неё сосед открыл бы чужой черновик.
--
-- Одноразовость реализована «привязкой к первому», а не «сгоранием при
-- первом чтении». Наивный вариант ломает обычный сценарий: человек
-- открывает ссылку, попадает на экран входа, логинится — и страница
-- перезагружается, а токен уже сгорел на первом запросе. Поэтому
-- первый авторизованный читатель записывается в used_by и дальше
-- может перечитывать черновик сколько нужно, а все остальные получают
-- отказ.

CREATE TABLE IF NOT EXISTS telegram_suggestions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  telegram_group_id TEXT NOT NULL,
  telegram_chat_id TEXT NOT NULL,
  telegram_user_id TEXT NOT NULL,
  telegram_message_id TEXT,
  category TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0,
  -- 'offered' | 'accepted' | 'dismissed'
  outcome TEXT NOT NULL DEFAULT 'offered',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

-- Горячий путь антиспама: «писали ли мы этому человеку в этой группе
-- недавно» выполняется на КАЖДОМ подходящем сообщении.
CREATE INDEX IF NOT EXISTS idx_telegram_suggestions_cooldown
  ON telegram_suggestions(telegram_chat_id, telegram_user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_telegram_suggestions_dedupe
  ON telegram_suggestions(telegram_chat_id, category, created_at);

CREATE INDEX IF NOT EXISTS idx_telegram_suggestions_tenant
  ON telegram_suggestions(tenant_id, outcome);

CREATE TABLE IF NOT EXISTS telegram_draft_tokens (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  building_id TEXT NOT NULL,
  entrance TEXT,
  category TEXT,
  description TEXT,
  telegram_chat_id TEXT,
  telegram_message_id TEXT,
  suggestion_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  used_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_telegram_draft_tokens_tenant
  ON telegram_draft_tokens(tenant_id);
