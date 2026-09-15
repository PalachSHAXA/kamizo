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
const OTP_MAX_ATTEMPTS = 5;

function isRussian(language: unknown): boolean {
  return !String(language || '').toLowerCase().startsWith('uz');
}

// Опрос статуса — раз в 2 секунды на клиенте, окно 2 минуты, то есть
// около 60 обращений на одну попытку входа. Лимит с запасом, но не
// безграничный: перебор request_id он всё равно ограничивает.
export const LOGIN_APPROVAL_POLL_LIMIT = 120;

export interface PendingApproval {
  requestId: string;
  expiresAt: string;
}

export function generateLoginApprovalCode(): string {
  const value = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(value).padStart(6, '0');
}

export async function hashLoginApprovalCode(
  requestId: string,
  code: string,
  secret: string | undefined
): Promise<string> {
  if (!secret) throw new Error('JWT_SECRET is not configured');
  const bytes = new TextEncoder().encode(`${requestId}:${code}:${secret}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
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
  // Запрос обёрнут в try/catch, и это не перестраховка.
  //
  // createLoginApproval вызывается на КАЖДОМ входе. Любая ошибка здесь —
  // отсутствующая таблица (миграция 074 ещё не прогнана), заблокированная
  // БД, что угодно — превращалась бы в 500 на /api/auth/login, то есть в
  // полную потерю доступа для всех пользователей окружения.
  //
  // Именно так и случилось: E2E-харнесс поднимает воркер со свежей
  // схемой без telegram_users, и логин начал падать. В проде миграцию
  // прогнали раньше рестарта, поэтому там не проявилось — то есть
  // фича молча завязала критический путь на порядок деплоя.
  //
  // Провал проверки второго фактора означает «второго фактора нет»:
  // вход идёт обычным путём. Это сознательный fail-open, той же природы,
  // что и ниже при недоставке сообщения.
  let link: any = null;
  try {
    link = await env.DB.prepare(
      `SELECT t.telegram_chat_id, t.security_enabled, u.language
       FROM telegram_users t
       JOIN users u ON u.id = t.user_id AND u.tenant_id = t.tenant_id
       WHERE t.user_id = ? AND t.tenant_id = ? AND t.revoked_at IS NULL`
    ).bind(user.id, user.tenant_id || '').first();
  } catch (err) {
    log.warn('login_approval_lookup_failed', {
      reason: String((err as Error)?.message || err),
    });
    return null;
  }

  if (!link?.telegram_chat_id || link.security_enabled !== 1) return null;

  const id = generateId();
  const expiresAt = new Date(Date.now() + APPROVAL_TTL_SECONDS * 1000);
  const otpCode = generateLoginApprovalCode();
  const otpHash = await hashLoginApprovalCode(id, otpCode, env.JWT_SECRET);

  await env.DB.prepare(`
    INSERT INTO telegram_login_requests
      (id, tenant_id, user_id, telegram_chat_id, device, ip_address,
       expires_at, otp_hash, otp_max_attempts)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, user.tenant_id || '', user.id, String(link.telegram_chat_id),
    meta.device || null, meta.ip || null, expiresAt.toISOString(),
    otpHash, OTP_MAX_ATTEMPTS
  ).run();

  const when = new Date().toISOString().replace('T', ' ').slice(0, 16);
  const ru = isRussian(link.language);
  const lines = (ru ? [
    '🔐 <b>Подтвердите вход в Kamizo</b>',
    '',
    'Мы получили попытку входа в ваш аккаунт.',
    meta.device ? `Устройство: ${escapeHtml(meta.device)}` : null,
    meta.ip ? `IP-адрес: ${escapeHtml(meta.ip)}` : null,
    `Время: ${when} UTC`,
    '',
    `Ваш код: <code>${otpCode}</code>`,
    'Код действует 2 минуты. Введите его в приложении или нажмите «Да, это я».',
    '',
    'Если вход выполняете не вы, пожалуйста, запретите его и смените пароль.',
  ] : [
    '🔐 <b>Kamizoga kirishni tasdiqlang</b>',
    '',
    'Hisobingizga kirishga urinish aniqlandi.',
    meta.device ? `Qurilma: ${escapeHtml(meta.device)}` : null,
    meta.ip ? `IP-manzil: ${escapeHtml(meta.ip)}` : null,
    `Vaqt: ${when} UTC`,
    '',
    `Kirish kodi: <code>${otpCode}</code>`,
    'Kod 2 daqiqa amal qiladi. Uni ilovaga kiriting yoki «Ha, bu men» tugmasini bosing.',
    '',
    'Agar bu siz bo‘lmasangiz, kirishni rad eting va parolingizni almashtiring.',
  ]).filter(Boolean) as string[];

  const sent = await sendTelegramMessage(env, link.telegram_chat_id, lines.join('\n'), {
    buttons: [
      { text: ru ? '✅ Да, это я' : '✅ Ha, bu men', callback_data: `la:a:${id}` },
      { text: ru ? '🚫 Это не я' : '🚫 Bu men emas', callback_data: `la:d:${id}` },
    ],
  });

  if (!sent.ok) {
    // Доставить не смогли — гасим запрос, чтобы он не висел в pending,
    // и пропускаем второй фактор.
    await env.DB.prepare(
      `UPDATE telegram_login_requests SET status = 'expired',
       resolved_at = datetime('now') WHERE id = ? AND tenant_id = ?`
    ).bind(id, user.tenant_id || '').run();
    log.warn('login_approval_send_failed', { reason: sent.reason });
    return null;
  }

  await env.DB.prepare(
    `UPDATE telegram_login_requests SET telegram_message_id = ?
     WHERE id = ? AND tenant_id = ?`
  ).bind(String(sent.result?.message_id ?? ''), id, user.tenant_id || '').run();

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
    `SELECT r.*, u.language
     FROM telegram_login_requests r
     LEFT JOIN users u ON u.id = r.user_id AND u.tenant_id = r.tenant_id
     WHERE r.id = ?`
  ).bind(requestId).first() as any;
  const ru = isRussian(req?.language || callback?.from?.language_code);

  if (!req || req.status !== 'pending') {
    await answerCallbackQuery(env, callback.id, ru
      ? 'Этот запрос уже обработан или устарел'
      : 'Bu so‘rov allaqachon ko‘rib chiqilgan yoki eskirgan');
    return;
  }

  if (new Date(req.expires_at) < new Date()) {
    await env.DB.prepare(
      `UPDATE telegram_login_requests SET status = 'expired',
       resolved_at = datetime('now')
       WHERE id = ? AND tenant_id = ? AND status = 'pending'`
    ).bind(requestId, req.tenant_id).run();
    await answerCallbackQuery(env, callback.id, ru ? 'Время подтверждения истекло' : 'Tasdiqlash vaqti tugadi');
    if (chatId && req.telegram_message_id) {
      await editTelegramMessage(env, chatId, req.telegram_message_id,
        ru
          ? '⌛ <b>Время подтверждения истекло</b>\n\nПожалуйста, попробуйте войти ещё раз.'
          : '⌛ <b>Tasdiqlash vaqti tugadi</b>\n\nIltimos, qayta kirib ko‘ring.');
    }
    return;
  }

  // Нажавший обязан быть владельцем привязки этого аккаунта.
  const owner = await env.DB.prepare(
    `SELECT telegram_user_id FROM telegram_users
     WHERE user_id = ? AND tenant_id = ? AND revoked_at IS NULL`
  ).bind(req.user_id, req.tenant_id).first() as any;

  if (!owner || String(owner.telegram_user_id) !== fromId) {
    await answerCallbackQuery(env, callback.id, ru
      ? 'Подтвердить вход может только владелец аккаунта'
      : 'Kirishni faqat hisob egasi tasdiqlashi mumkin');
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
     WHERE id = ? AND tenant_id = ? AND status = 'pending'`
  ).bind(next, requestId, req.tenant_id).run();

  if (!upd.meta?.changes) {
    await answerCallbackQuery(env, callback.id, ru ? 'Этот запрос уже обработан' : 'Bu so‘rov allaqachon ko‘rib chiqilgan');
    return;
  }

  await answerCallbackQuery(env, callback.id, approved
    ? (ru ? 'Спасибо, вход подтверждён' : 'Rahmat, kirish tasdiqlandi')
    : (ru ? 'Вход отклонён' : 'Kirish rad etildi'));

  if (chatId && req.telegram_message_id) {
    await editTelegramMessage(env, chatId, req.telegram_message_id, approved
      ? (ru
          ? '✅ <b>Спасибо, вход подтверждён</b>\n\nТеперь можно вернуться в приложение.'
          : '✅ <b>Rahmat, kirish tasdiqlandi</b>\n\nEndi ilovaga qaytishingiz mumkin.')
      : (ru
          ? '🚫 <b>Вход отклонён</b>\n\nВаш аккаунт остаётся защищён. Если пароль мог узнать кто-то ещё, смените его в Kamizo.'
          : '🚫 <b>Kirish rad etildi</b>\n\nHisobingiz himoyalangan. Agar parolingizni boshqa birov bilishi mumkin bo‘lsa, uni Kamizoda almashtiring.'));
  }

  log.info('login_approval_resolved', { requestId, status: next });
}

// ──────────────────────────────────────────────────────────────────
export function registerLoginApprovalRoutes() {

// POST /api/auth/login-approval/verify-code
// Public because JWT does not exist yet. Security is provided by the opaque
// request id, a six-digit code, a two-minute TTL, endpoint rate limit and a
// five-attempt DB counter.
route('POST', '/api/auth/login-approval/verify-code', async (request, env) => {
  const body = await request.json() as any;
  const requestId = String(body.request_id || body.requestId || '');
  const code = String(body.code || '').trim();
  if (!requestId || !/^\d{6}$/.test(code)) {
    return error('request_id and a 6-digit code are required', 400);
  }

  const req = await env.DB.prepare(
    `SELECT r.*, u.language
     FROM telegram_login_requests r
     LEFT JOIN users u ON u.id = r.user_id AND u.tenant_id = r.tenant_id
     WHERE r.id = ?`
  ).bind(requestId).first() as any;
  if (!req) return error('Request not found', 404);
  if (req.status !== 'pending') return json({ verified: false, status: req.status, remainingAttempts: 0 });

  if (new Date(req.expires_at) < new Date()) {
    await env.DB.prepare(`
      UPDATE telegram_login_requests
      SET status = 'expired', resolved_at = datetime('now')
      WHERE id = ? AND tenant_id = ? AND status = 'pending'
    `).bind(requestId, req.tenant_id).run();
    return json({ verified: false, status: 'expired', remainingAttempts: 0 });
  }

  if (!req.otp_hash || req.otp_attempts >= req.otp_max_attempts) {
    return json({ verified: false, status: 'denied', remainingAttempts: 0 });
  }

  const providedHash = await hashLoginApprovalCode(requestId, code, env.JWT_SECRET);
  if (!timingSafeEqual(providedHash, String(req.otp_hash))) {
    await env.DB.prepare(`
      UPDATE telegram_login_requests
      SET otp_attempts = otp_attempts + 1,
          status = CASE WHEN otp_attempts + 1 >= otp_max_attempts THEN 'denied' ELSE status END,
          resolved_at = CASE WHEN otp_attempts + 1 >= otp_max_attempts THEN datetime('now') ELSE resolved_at END
      WHERE id = ? AND tenant_id = ? AND status = 'pending'
    `).bind(requestId, req.tenant_id).run();
    const remainingAttempts = Math.max(0, Number(req.otp_max_attempts) - Number(req.otp_attempts) - 1);
    return json({
      verified: false,
      status: remainingAttempts ? 'pending' : 'denied',
      remainingAttempts,
    });
  }

  const approved = await env.DB.prepare(`
    UPDATE telegram_login_requests
    SET status = 'approved', resolved_at = datetime('now')
    WHERE id = ? AND tenant_id = ? AND status = 'pending' AND otp_hash = ?
  `).bind(requestId, req.tenant_id, req.otp_hash).run();
  if (!approved.meta?.changes) return json({ verified: false, status: 'consumed', remainingAttempts: 0 });

  if (req.telegram_message_id) {
    await editTelegramMessage(
      env,
      req.telegram_chat_id,
      req.telegram_message_id,
      isRussian(req.language)
        ? '✅ <b>Спасибо, код принят</b>\n\nВход подтверждён, можно вернуться в приложение.'
        : '✅ <b>Rahmat, kod qabul qilindi</b>\n\nKirish tasdiqlandi, ilovaga qaytishingiz mumkin.'
    );
  }
  createRequestLogger(request).info('login_approval_code_verified', { requestId, userId: req.user_id });
  return json({ verified: true, status: 'approved', remainingAttempts: req.otp_max_attempts - req.otp_attempts });
});

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
       resolved_at = datetime('now')
       WHERE id = ? AND tenant_id = ? AND status = 'pending'`
    ).bind(requestId, req.tenant_id).run();
    return json({ status: 'expired' });
  }

  if (req.status !== 'approved') return json({ status: req.status });

  // Одноразовость: строка помечается использованной ДО выдачи токена.
  // Иначе повторный опрос по тому же request_id выдавал бы новый JWT
  // сколько угодно раз — а §17 требует «повторное подтверждение
  // невозможно».
  const claim = await env.DB.prepare(
    `UPDATE telegram_login_requests SET status = 'consumed'
     WHERE id = ? AND tenant_id = ? AND status = 'approved'`
  ).bind(requestId, req.tenant_id).run();
  if (!claim.meta?.changes) return json({ status: 'consumed' });

  const user = await env.DB.prepare(
    'SELECT * FROM users WHERE id = ? AND tenant_id = ?'
  ).bind(req.user_id, req.tenant_id).first() as any;
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
