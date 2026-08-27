// Telegram Bot API client.
//
// Архитектурная заметка: бот — НЕ отдельный сервис.
// docs/integrations/02-telegram-bot.md описывает standalone-контейнер на
// Python/aiogram, но этот план старше нынешнего бэкенда (Node 20 + Hono
// на VPS). Бот с точки зрения инфраструктуры — это HTTP-эндпоинт,
// принимающий JSON-апдейты, поэтому он живёт здесь же, рядом с
// остальными роутами, и делит с ними хендл БД, i18n и деплой. Второй
// рантайм ради этого не нужен.
//
// Стоимость: sendMessage через Bot API бесплатен и не лимитируется по
// деньгам — в отличие от SMS и от Telegram Gateway ($0.01 за код).
// Плата за это — бот не может написать первым: пока пользователь не
// нажал /start, отправить ему нельзя ничего. Привязку делает
// routes/telegram/link.ts через deep-link с одноразовым токеном.

import type { Env } from '../types';

const TELEGRAM_API = 'https://api.telegram.org';

// api.telegram.org — сторонний хост. Зависший сокет держал бы открытым
// хендлер запроса, поэтому жёсткий таймаут. 10s с запасом хватает на
// sendMessage; Telegram отвечает за десятки миллисекунд.
const SEND_TIMEOUT_MS = 10_000;

export interface TelegramResult {
  ok: boolean;
  // Заполняется только при ok=false. Пригодно для логов, НЕ для показа
  // пользователю — может содержать текст ошибки Telegram.
  reason?: string;
  result?: any;
}

// Экранирование под parse_mode=HTML. Telegram принимает ограниченный
// набор тегов, но любой сырой '<' в пользовательских данных (имя
// жителя, тема заявки) ломает разбор и сообщение не доставляется
// вообще. Экранируем всё, что подставляем.
export function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Низкоуровневый вызов метода Bot API.
//
// Токен отсутствует → ok=false с причиной 'not configured', БЕЗ
// исключения. Тот же контракт, что у sendApnsNotification (см. Env в
// types.ts): не настроенный канал уведомлений не должен ронять
// бизнес-операцию, породившую уведомление.
export async function callTelegram(
  env: Env,
  method: string,
  payload: Record<string, unknown>
): Promise<TelegramResult> {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, reason: 'not configured' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await res.json() as any;
    if (!res.ok || !data?.ok) {
      // description — поле ошибки Bot API, напр. "Forbidden: bot was
      // blocked by the user" (403). Вызывающий код может по нему
      // решить отвязать chat_id — см. sendTelegramToUser.
      return { ok: false, reason: data?.description || `HTTP ${res.status}` };
    }
    return { ok: true, result: data.result };
  } catch (e: any) {
    return { ok: false, reason: e?.name === 'AbortError' ? 'timeout' : String(e?.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

// Кнопка под сообщением. callback_data ограничена Telegram'ом 64
// байтами — держим её короткой: `<действие>:<id>`.
export interface InlineButton { text: string; callback_data: string }

export async function sendTelegramMessage(
  env: Env,
  chatId: string | number,
  text: string,
  opts: {
    buttons?: InlineButton[];
    // Сырой reply_markup для клавиатур, которых не выразить кнопками:
    // запрос контакта (request_contact) и снятие клавиатуры. Взаимно
    // исключается с buttons — Telegram принимает только одну разметку.
    replyMarkup?: unknown;
  } = {}
): Promise<TelegramResult> {
  const markup = opts.replyMarkup
    ?? (opts.buttons?.length ? { inline_keyboard: [opts.buttons] } : null);

  return callTelegram(env, 'sendMessage', {
    chat_id: String(chatId),
    text,
    parse_mode: 'HTML',
    // Уведомления Kamizo — служебные, ссылки в них на собственный
    // домен. Превью только зашумляет ленту.
    disable_web_page_preview: true,
    ...(markup ? { reply_markup: markup } : {}),
  });
}

// Клавиатура с единственной кнопкой «поделиться номером».
//
// request_contact работает ТОЛЬКО в личном чате и только как обычная
// (reply), а не inline-кнопка — так устроен Telegram. Нажатие
// присылает боту message.contact с номером, подтверждённым Telegram:
// это номер, на который зарегистрирован аккаунт, а не введённая руками
// строка.
export const REQUEST_CONTACT_KEYBOARD = {
  keyboard: [[{ text: '📱 Поделиться номером', request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
};

// Снятие клавиатуры после того, как номер получен: оставленная кнопка
// «Поделиться номером» висит внизу экрана и предлагает сделать то, что
// уже сделано.
export const REMOVE_KEYBOARD = { remove_keyboard: true };

// Правка уже отправленного сообщения.
//
// Используется после решения по входу (§17) и при обновлении
// объявления (§9). Кнопки при этом убираются: оставленные кнопки под
// обработанным запросом человек жмёт повторно и не понимает, почему
// ничего не происходит.
export async function editTelegramMessage(
  env: Env,
  chatId: string | number,
  messageId: string | number,
  text: string
): Promise<TelegramResult> {
  return callTelegram(env, 'editMessageText', {
    chat_id: String(chatId),
    message_id: Number(messageId),
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}

// Ответ на нажатие inline-кнопки.
//
// Вызывать ОБЯЗАТЕЛЬНО и как можно раньше: пока ответа нет, у
// пользователя крутится «часики» на кнопке, а через несколько секунд
// клиент показывает ошибку — даже если запрос на самом деле обработан.
export async function answerCallbackQuery(
  env: Env,
  callbackQueryId: string,
  text?: string
): Promise<TelegramResult> {
  return callTelegram(env, 'answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    ...(text ? { text, show_alert: false } : {}),
  });
}

// Отправка по users.id — основная точка входа для бизнес-кода.
//
// Читает telegram_users (миграция 074), а не колонку в users: §16
// допускает один Telegram у нескольких аккаунтов Kamizo в разных
// тенантах, и колонкой такое не выразить. Активная привязка у аккаунта
// ровно одна — это гарантирует частичный UNIQUE(user_id).
//
// Возвращает ok=false, если Telegram не привязан. Это НЕ ошибка:
// подавляющее большинство пользователей канал не подключит, и
// вызывающий код должен спокойно уйти на push/SMS.
//
// requireNotifications=false для сообщений, от которых нельзя
// отписаться: код подтверждения человек запросил сам, нажав кнопку, и
// не доставить его из-за выключенного тумблера уведомлений значит
// сломать голосование. Флаг notifications_enabled управляет рассылками,
// а не ответами на явные действия пользователя.
export async function sendTelegramToUser(
  env: Env,
  userId: string,
  text: string,
  opts: { requireNotifications?: boolean } = {}
): Promise<TelegramResult> {
  // Запрос обёрнут: telegram_users появляется только с миграцией 074, а
  // эта функция вызывается из бизнес-путей (например, выдача кода
  // подтверждения). Незавершённая миграция или сбой БД не должны
  // превращаться в 500 на операции, которая к Telegram отношения не
  // имеет — «канал недоступен» здесь корректный ответ.
  let row: any = null;
  try {
    row = await env.DB.prepare(
      `SELECT id, telegram_chat_id, notifications_enabled
       FROM telegram_users WHERE user_id = ? AND revoked_at IS NULL`
    ).bind(userId).first();
  } catch (e: any) {
    return { ok: false, reason: `lookup failed: ${String(e?.message || e)}` };
  }

  if (!row?.telegram_chat_id) return { ok: false, reason: 'telegram not linked' };
  if (opts.requireNotifications !== false && row.notifications_enabled !== 1) {
    return { ok: false, reason: 'notifications disabled' };
  }

  const res = await sendTelegramMessage(env, row.telegram_chat_id, text);

  // Самоочистка: бот заблокирован или чат удалён — Telegram отвечает
  // 403. Держать мёртвую привязку смысла нет, каждое следующее
  // уведомление тратило бы сетевой вызов на заведомо недоставимое
  // сообщение. Та же логика, по которой гасятся device_tokens при
  // BadDeviceToken. Отзыв мягкий: строка остаётся для аудита (§22).
  if (!res.ok && /blocked|chat not found|deactivated|user is deactivated/i.test(res.reason || '')) {
    await env.DB.prepare(
      `UPDATE telegram_users SET revoked_at = datetime('now') WHERE id = ?`
    ).bind(row.id).run();
  }

  return res;
}
