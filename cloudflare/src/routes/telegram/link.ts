// Привязка / отвязка Telegram — сторона веб-приложения.
//
// Три эндпоинта, все авторизованные:
//   GET    /api/telegram/status      — привязан ли Telegram у вызывающего
//   POST   /api/telegram/link-token  — выдать одноразовый deep-link
//   DELETE /api/telegram/link        — отвязать
//
// Сам факт привязки проставляет вебхук (webhook.ts), когда пользователь
// нажимает /start по выданной ссылке. Здесь только выдача токена.

import {
  route, getUser, getTenantId, json, error, generateId,
  generateLinkToken, LINK_TOKEN_TTL_MINUTES, type Env
} from './helpers';

export function registerTelegramLinkRoutes() {

// ──────────────────────────────────────────────────────────────────
// GET /api/telegram/status
//
// Фронт поллит его после открытия deep-link, чтобы перерисовать
// кнопку без перезагрузки страницы.
route('GET', '/api/telegram/status', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  // telegram_users, а не колонка в users: §16 допускает один Telegram у
  // нескольких аккаунтов Kamizo в разных тенантах. Активная привязка у
  // аккаунта одна — это держит частичный UNIQUE(user_id).
  const row = await env.DB.prepare(
    `SELECT telegram_chat_id, telegram_username, linked_at,
            notifications_enabled, security_enabled
     FROM telegram_users WHERE user_id = ? AND revoked_at IS NULL`
  ).bind(authUser.id).first() as any;

  return json({
    linked: !!row?.telegram_chat_id,
    username: row?.telegram_username || null,
    linkedAt: row?.linked_at || null,
    notificationsEnabled: row ? row.notifications_enabled === 1 : true,
    securityEnabled: row ? row.security_enabled === 1 : false,
    // Фронту нужен username бота, чтобы собрать ссылку; хардкодить его
    // в двух местах — верный способ разъехаться при смене бота.
    botUsername: (env as Env).TELEGRAM_BOT_USERNAME || null,
  });
});

// ──────────────────────────────────────────────────────────────────
// PATCH /api/telegram/preferences
// Body: { notifications_enabled?, security_enabled? }
//
// §16 шаг 8: после привязки пользователь выбирает типы уведомлений.
// Два флага раздельные намеренно — согласие получать уведомления о
// заявках не равно согласию сделать Telegram вторым фактором входа.
route('PATCH', '/api/telegram/preferences', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const sets: string[] = [];
  const binds: any[] = [];

  if (typeof body.notifications_enabled === 'boolean') {
    sets.push('notifications_enabled = ?');
    binds.push(body.notifications_enabled ? 1 : 0);
  }
  if (typeof body.security_enabled === 'boolean') {
    sets.push('security_enabled = ?');
    binds.push(body.security_enabled ? 1 : 0);
  }
  if (!sets.length) return error('Nothing to update', 400);

  binds.push(authUser.id);
  const res = await env.DB.prepare(
    `UPDATE telegram_users SET ${sets.join(', ')}
     WHERE user_id = ? AND revoked_at IS NULL`
  ).bind(...binds).run();

  if (!res.meta?.changes) return error('Telegram is not linked', 404);
  return json({ ok: true });
});

// ──────────────────────────────────────────────────────────────────
// POST /api/telegram/link-token
//
// Возвращает { url, expiresAt }. Тело запроса не читаем вообще:
// пользователь берётся ИСКЛЮЧИТЕЛЬНО из JWT. Ровно та же ошибка, что
// чинил Sprint 79 P0/F3 в meetings/otp.ts — там body.phone позволял
// выпустить OTP на произвольный номер; здесь body.user_id позволил бы
// выпустить ссылку привязки к чужому аккаунту.
route('POST', '/api/telegram/link-token', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const botUsername = (env as Env).TELEGRAM_BOT_USERNAME;
  if (!botUsername) return error('Telegram bot is not configured', 503);

  // Гасим прежние невыданные токены этого пользователя. Иначе каждое
  // нажатие «Привязать» плодит параллельно живые ссылки, и отозвать
  // случайно расшаренную нельзя — просто выпустив новую.
  await env.DB.prepare(
    `UPDATE telegram_link_tokens SET used_at = datetime('now')
     WHERE user_id = ? AND used_at IS NULL`
  ).bind(authUser.id).run();

  const token = generateLinkToken();
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + LINK_TOKEN_TTL_MINUTES);

  await env.DB.prepare(
    `INSERT INTO telegram_link_tokens (id, user_id, token, expires_at, tenant_id)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(
    generateId(), authUser.id, token, expiresAt.toISOString(),
    getTenantId(request) || (authUser as any).tenant_id || ''
  ).run();

  return json({
    url: `https://t.me/${botUsername}?start=${token}`,
    expiresAt: expiresAt.toISOString(),
  });
});

// ──────────────────────────────────────────────────────────────────
// DELETE /api/telegram/link
//
// Отзыв мягкий (revoked_at), а не DELETE: §22 требует логировать отзыв
// привязки, и строка нужна, чтобы потом ответить, кому и когда уходили
// коды подтверждения.
//
// Пользователю в Telegram ничего не пишем: он мог отвязаться именно
// потому, что потерял доступ к тому Telegram-аккаунту, и сообщение
// ушло бы тому, у кого аккаунт сейчас.
route('DELETE', '/api/telegram/link', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  await env.DB.prepare(
    `UPDATE telegram_users SET revoked_at = datetime('now')
     WHERE user_id = ? AND revoked_at IS NULL`
  ).bind(authUser.id).run();

  await env.DB.prepare(
    `UPDATE telegram_link_tokens SET used_at = datetime('now')
     WHERE user_id = ? AND used_at IS NULL`
  ).bind(authUser.id).run();

  return json({ ok: true });
});

} // end registerTelegramLinkRoutes
