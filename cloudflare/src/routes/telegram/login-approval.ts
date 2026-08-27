// Подтверждение входа через Telegram (§17 ТЗ, Этап 4).
//
// Схема:
//   1. Пароль проверен в routes/users/auth.ts. Если у аккаунта включён
//      security_enabled — JWT НЕ выдаётся.
//   2. Создаётся запрос, в Telegram уходит сообщение с кнопками
//      «Это я» / «Запретить вход».
//   3. Клиент опрашивает POST /api/auth/login-approval/status.
//   4. Нажатие приходит вебхуком как callback_query → resolveLoginRequest.
//   5. При 'approved' статус-роут выпускает JWT.
//
// Почему JWT рождается только на шаге 5, а не кладётся в строку заранее:
// строка живёт в БД, попадает в бэкапы и дампы, а готовый токен — это
// уже доступ. Пока вход не подтверждён, выдавать нечего.

import type { Env } from '../../types';
import { route } from '../../router';
import { json, error, generateId } from '../../utils/helpers';
import { createJWT } from '../../utils/crypto';
import { createRequestLogger } from '../../utils/logger';
import {
  sendTelegramMessage, editTelegramMessage, answerCallbackQuery, escapeHtml,
} from '../../utils/telegram';

// §17: «срок действия около двух минут».
//
// Короткое окно здесь не про удобство. Пока запрос висит в pending,
// злоумышленник, знающий пароль, ждёт, что владелец по невнимательности
// нажмёт «Это я». Чем уже окно, тем меньше шанс.
const APPROVAL_TTL_SECONDS = 120;

// Опрос статуса — раз в 2 секунды на клиенте, окно 2 минуты, то есть
// около 60 обращений на одну попытку входа. Лимит с запасом, но не
// безграничный: перебор request_id он всё равно ограничивает.
export const LOGIN_APPROVAL_POLL_LIMIT = 120;

export interface PendingApproval {
  requestId: string;
  expiresAt: string;
}

// ──────────────────────────────────────────────────────────────────
// Создание запроса. Зовётся из auth.ts после успешной проверки пароля.
//
// Возвращает null, если подтверждение не требуется или недоступно —
// тогда auth.ts выдаёт JWT как раньше. Список причин для null:
//   • у аккаунта нет активной привязки Telegram;
//   • security_enabled = 0 (пользователь не включал второй фактор);
//   • сообщение не удалось доставить.
//
// Последний пункт важен: если бот заблокирован или Telegram лежит,
// человек не должен остаться заперт снаружи собственного аккаунта.
// §17 оставляет цифровой OTP резервным способом, но пока его в UI нет,
// единственный безопасный вариант — пропустить второй фактор и
// записать это в лог. Иначе падение стороннего сервиса превращается в
// отказ в обслуживании для всех, кто включил защиту.
export async function createLoginApproval(
  env: Env,
  user: { id: string; name?: string; tenant_id?: string | null },
  meta: { device?: string | null; ip?: string | null },
  log: ReturnType<typeof createRequestLogger>
): Promise<PendingApproval | null> {
  const link = await env.DB.prepare(
    `SELECT telegram_chat_id, security_enabled
     FROM telegram_users WHERE user_id = ? AND revoked_at IS NULL`
  ).bind(user.id).first() as any;

  if (!link?.telegram_chat_id || link.security_enabled !== 1) return null;

  const id = generateId();
  const expiresAt = new Date(Date.now() + APPROVAL_TTL_SECONDS * 1000);

  await env.DB.prepare(`
    INSERT INTO telegram_login_requests
      (id, tenant_id, user_id, telegram_chat_id, device, ip_address, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, user.tenant_id || '', user.id, String(link.telegram_chat_id),
    meta.device || null, meta.ip || null, expiresAt.toISOString()
  ).run();

  const when = new Date().toISOString().replace('T', ' ').slice(0, 16);
  const lines = [
    '🔐 <b>Новый вход в Kamizo</b>',
    '',
    meta.device ? `Устройство: ${escapeHtml(meta.device)}` : null,
    meta.ip ? `IP: ${escapeHtml(meta.ip)}` : null,
    `Время: ${when} UTC`,
    '',
    'Если это не вы — нажмите «Запретить вход» и смените пароль.',
  ].filter(Boolean) as string[];

  const sent = await sendTelegramMessage(env, link.telegram_chat_id, lines.join('\n'), {
    buttons: [
      { text: '✅ Это я', callback_data: `la:a:${id}` },
      { text: '🚫 Запретить вход', callback_data: `la:d:${id}` },
    ],
  });

  if (!sent.ok) {
    // Доставить не смогли — гасим запрос, чтобы он не висел в pending,
    // и пропускаем второй фактор.
    await env.DB.prepare(
      `UPDATE telegram_login_requests SET status = 'expired',
       resolved_at = datetime('now') WHERE id = ?`
    ).bind(id).run();
    log.warn('login_approval_send_failed', { reason: sent.reason });
    return null;
  }

  await env.DB.prepare(
    'UPDATE telegram_login_requests SET telegram_message_id = ? WHERE id = ?'
  ).bind(String(sent.result?.message_id ?? ''), id).run();

  log.info('login_approval_sent', { userId: user.id, requestId: id });
  return { requestId: id, expiresAt: expiresAt.toISOString() };
}

// ──────────────────────────────────────────────────────────────────
// Обработка нажатия. Зовётся из вебхука на callback_query.
//
// Проверок три, и каждая закрывает свой сценарий:
//   1. Запрос существует и ещё в pending — одноразовость (§17).
//   2. Не истёк — сверка в JS, см. комментарий в миграции 076.
//   3. Нажавший — владелец той самой привязки. Без этого пересланное
//      в другой чат сообщение позволило бы постороннему подтвердить
//      чужой вход.
export async function resolveLoginRequest(
  env: Env,
  callback: any,
  log: ReturnType<typeof createRequestLogger>
): Promise<void> {
  const data: string = callback?.data || '';
  if (!data.startsWith('la:')) return;

  const [, action, requestId] = data.split(':');
  if (!requestId || (action !== 'a' && action !== 'd')) return;

  const fromId = String(callback?.from?.id ?? '');
  const chatId = callback?.message?.chat?.id;

  const req = await env.DB.prepare(
    'SELECT * FROM telegram_login_requests WHERE id = ?'
  ).bind(requestId).first() as any;

  if (!req || req.status !== 'pending') {
    await answerCallbackQuery(env, callback.id, 'Запрос уже обработан или устарел');
    return;
  }

  if (new Date(req.expires_at) < new Date()) {
    await env.DB.prepare(
      `UPDATE telegram_login_requests SET status = 'expired',
       resolved_at = datetime('now') WHERE id = ? AND status = 'pending'`
    ).bind(requestId).run();
    await answerCallbackQuery(env, callback.id, 'Срок запроса истёк');
    if (chatId && req.telegram_message_id) {
      await editTelegramMessage(env, chatId, req.telegram_message_id,
        '⌛ <b>Запрос входа истёк</b>\n\nПопробуйте войти заново.');
    }
    return;
  }

  // Нажавший обязан быть владельцем привязки этого аккаунта.
  const owner = await env.DB.prepare(
    `SELECT telegram_user_id FROM telegram_users
     WHERE user_id = ? AND revoked_at IS NULL`
  ).bind(req.user_id).first() as any;

  if (!owner || String(owner.telegram_user_id) !== fromId) {
    await answerCallbackQuery(env, callback.id, 'Недостаточно прав');
    log.warn('login_approval_foreign_press', { requestId, fromId });
    return;
  }

  const approved = action === 'a';
  const next = approved ? 'approved' : 'denied';

  // status='pending' в WHERE — защита от двойного нажатия: два быстрых
  // тапа приходят двумя апдейтами, и без этого условия второй перевёл
  // бы уже решённый запрос в другое состояние.
  const upd = await env.DB.prepare(
    `UPDATE telegram_login_requests SET status = ?, resolved_at = datetime('now')
     WHERE id = ? AND status = 'pending'`
  ).bind(next, requestId).run();

  if (!upd.meta?.changes) {
    await answerCallbackQuery(env, callback.id, 'Запрос уже обработан');
    return;
  }

  await answerCallbackQuery(env, callback.id, approved ? 'Вход подтверждён' : 'Вход запрещён');

  if (chatId && req.telegram_message_id) {
    await editTelegramMessage(env, chatId, req.telegram_message_id, approved
      ? '✅ <b>Вход подтверждён</b>\n\nМожете вернуться в приложение.'
      : '🚫 <b>Вход запрещён</b>\n\nЕсли это были не вы — смените пароль в Kamizo.');
  }

  log.info('login_approval_resolved', { requestId, status: next });
}

// ──────────────────────────────────────────────────────────────────
export function registerLoginApprovalRoutes() {

// POST /api/auth/login-approval/status
// Body: { request_id }
//
// PUBLIC: JWT ещё не выдан, авторизоваться нечем. Защита строится на
// том, что request_id — непредсказуемый UUID с временем жизни две
// минуты, а сам роут ограничен rate-limit'ом.
//
// Возвращает:
//   { status: 'pending' }                 — ждём
//   { status: 'approved', user, token }   — вход состоялся
//   { status: 'denied' | 'expired' }      — нет
route('POST', '/api/auth/login-approval/status', async (request, env) => {
  const body = await request.json() as any;
  const requestId = body.request_id || body.requestId;
  if (!requestId) return error('request_id is required', 400);

  const req = await env.DB.prepare(
    'SELECT * FROM telegram_login_requests WHERE id = ?'
  ).bind(requestId).first() as any;

  if (!req) return error('Request not found', 404);

  if (req.status === 'pending' && new Date(req.expires_at) < new Date()) {
    await env.DB.prepare(
      `UPDATE telegram_login_requests SET status = 'expired',
       resolved_at = datetime('now') WHERE id = ? AND status = 'pending'`
    ).bind(requestId).run();
    return json({ status: 'expired' });
  }

  if (req.status !== 'approved') return json({ status: req.status });

  // Одноразовость: строка помечается использованной ДО выдачи токена.
  // Иначе повторный опрос по тому же request_id выдавал бы новый JWT
  // сколько угодно раз — а §17 требует «повторное подтверждение
  // невозможно».
  const claim = await env.DB.prepare(
    `UPDATE telegram_login_requests SET status = 'consumed'
     WHERE id = ? AND status = 'approved'`
  ).bind(requestId).run();
  if (!claim.meta?.changes) return json({ status: 'consumed' });

  const user = await env.DB.prepare(
    'SELECT * FROM users WHERE id = ?'
  ).bind(req.user_id).first() as any;
  if (!user) return error('User not found', 404);

  // tenant берётся из строки запроса и профиля, а НЕ из чего-либо,
  // пришедшего с Telegram-стороны (§17).
  const token = await createJWT(
    { userId: user.id, role: user.role, tenantId: user.tenant_id || undefined },
    (env as Env).JWT_SECRET,
    7 * 24 * 60 * 60
  );

  delete user.password_hash;
  return json({ status: 'approved', user, token });
});

} // end registerLoginApprovalRoutes
