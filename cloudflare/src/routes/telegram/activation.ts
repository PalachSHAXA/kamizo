import type { Env } from '../../types';
import { route } from '../../router';
import { createJWT, hashPassword } from '../../utils/crypto';
import { error, generateId, json } from '../../utils/helpers';
import { getUser } from '../../middleware/auth';
import { getTenantId } from '../../middleware/tenant';
import {
  answerCallbackQuery, editTelegramMessage, escapeHtml, sendTelegramMessage,
} from '../../utils/telegram';
import { timingSafeEqual } from './helpers';

const ACTIVATION_TTL_MINUTES = 10;
const RECOVERY_CODE_COUNT = 8;
const TOKEN_BYTES = 32;

function randomHex(bytes = TOKEN_BYTES): string {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(value, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function normalizeActivationPhone(raw: unknown): string | null {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 9) return `+998${digits}`;
  if (digits.length === 12 && digits.startsWith('998')) return `+${digits}`;
  return null;
}

function challengeOptions(challenge: string): string[] {
  const value = Number(challenge);
  return [challenge, String((value + 23) % 90 + 10).slice(-2), String((value + 47) % 90 + 10).slice(-2)]
    .sort((a, b) => Number(a) - Number(b));
}

function recoveryCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const raw = Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('');
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

async function recoveryHash(userId: string, code: string, secret: string): Promise<string> {
  return sha256(`${userId}:${code}:${secret}`);
}

export async function createFirstLoginActivation(
  env: Env,
  user: { id: string; tenant_id?: string | null; phone?: string | null; auth_revoked_at?: string | null },
): Promise<{
  requestId: string; tenantId: string; browserSecret: string; telegramUrl: string;
  expiresAt: string; challenge: string;
} | null> {
  const tenantId = String(user.tenant_id || '');
  if (!tenantId || !normalizeActivationPhone(user.phone) || !env.TELEGRAM_BOT_USERNAME) return null;

  const requestId = generateId();
  const linkToken = randomHex();
  const browserSecret = randomHex();
  const challenge = String(crypto.getRandomValues(new Uint8Array(1))[0] % 90 + 10);
  const expiresAt = new Date(Date.now() + ACTIVATION_TTL_MINUTES * 60_000).toISOString();
  const [linkTokenHash, browserSecretHash] = await Promise.all([
    sha256(linkToken), sha256(browserSecret),
  ]);

  await env.DB.batch([
    env.DB.prepare(`
      UPDATE telegram_activation_requests
      SET status = 'expired'
      WHERE tenant_id = ? AND user_id = ? AND status NOT IN ('consumed', 'expired')
    `).bind(tenantId, user.id),
    env.DB.prepare(`
      INSERT INTO telegram_activation_requests
        (id, tenant_id, user_id, link_token_hash, browser_secret_hash, credential_version, challenge, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(requestId, tenantId, user.id, linkTokenHash, browserSecretHash, String(user.auth_revoked_at || ''), challenge, expiresAt),
  ]);

  return {
    requestId,
    tenantId,
    browserSecret,
    telegramUrl: `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=${linkToken}`,
    expiresAt,
    challenge,
  };
}

export async function handleActivationStart(
  env: Env, message: any, token: string,
): Promise<boolean> {
  const tokenHash = await sha256(token);
  const request = await env.DB.prepare(`
    SELECT r.id, r.tenant_id, r.user_id, r.expires_at, u.name, u.language
    FROM telegram_activation_requests r
    JOIN users u ON u.id = r.user_id AND u.tenant_id = r.tenant_id
    WHERE r.link_token_hash = ? AND r.status = 'pending' AND u.is_active = 1
  `).bind(tokenHash).first() as any;
  if (!request) return false;

  const chatId = String(message.chat.id);
  const ru = (request.language || 'ru') === 'ru';
  if (new Date(request.expires_at) < new Date()) {
    await env.DB.prepare(`
      UPDATE telegram_activation_requests SET status = 'expired'
      WHERE id = ? AND tenant_id = ?
    `).bind(request.id, request.tenant_id).run();
    await sendTelegramMessage(env, chatId, ru
      ? 'Срок ссылки истёк. Пожалуйста, начните вход в Kamizo заново.'
      : 'Havola muddati tugadi. Kamizoga kirishni qaytadan boshlang.');
    return true;
  }

  const claimed = await env.DB.prepare(`
    UPDATE telegram_activation_requests
    SET telegram_user_id = ?, telegram_chat_id = ?, status = 'awaiting_contact'
    WHERE id = ? AND tenant_id = ? AND status = 'pending'
  `).bind(String(message.from.id), chatId, request.id, request.tenant_id).run();
  if (!(claimed.meta?.changes ?? 0)) return true;

  await sendTelegramMessage(env, chatId, ru
    ? `Здравствуйте, ${escapeHtml(request.name || '')}! Чтобы подтвердить первый вход, поделитесь номером, зарегистрированным в вашем Telegram.`
    : `Assalomu alaykum, ${escapeHtml(request.name || '')}! Birinchi kirishni tasdiqlash uchun Telegram raqamingizni yuboring.`, {
    replyMarkup: {
      keyboard: [[{
        text: ru ? 'Поделиться моим номером' : 'Telefon raqamimni yuborish',
        request_contact: true,
      }]],
      resize_keyboard: true,
      one_time_keyboard: true,
      selective: true,
    },
  });
  return true;
}

export async function handleActivationContact(env: Env, message: any): Promise<boolean> {
  const fromId = String(message?.from?.id || '');
  const contact = message?.contact;
  if (!fromId || !contact) return false;

  const request = await env.DB.prepare(`
    SELECT r.*, u.phone, u.language
    FROM telegram_activation_requests r
    JOIN users u ON u.id = r.user_id AND u.tenant_id = r.tenant_id
    WHERE r.telegram_user_id = ? AND r.status = 'awaiting_contact'
    ORDER BY r.created_at DESC LIMIT 1
  `).bind(fromId).first() as any;
  if (!request) return false;
  const ru = (request.language || 'ru') === 'ru';
  const chatId = String(message.chat.id);

  if (String(contact.user_id || '') !== fromId
    || normalizeActivationPhone(contact.phone_number) !== normalizeActivationPhone(request.phone)) {
    await env.DB.prepare(`
      UPDATE telegram_activation_requests SET attempts = attempts + 1
      WHERE id = ? AND tenant_id = ?
    `).bind(request.id, request.tenant_id).run();
    await sendTelegramMessage(env, chatId, ru
      ? 'Этот номер не совпадает с номером аккаунта Kamizo. Обратитесь к администратору УК.'
      : 'Bu raqam Kamizo hisobidagi raqamga mos kelmadi. BK administratoriga murojaat qiling.', {
      replyMarkup: { remove_keyboard: true },
    });
    return true;
  }

  await env.DB.prepare(`
    UPDATE telegram_activation_requests
    SET status = 'awaiting_match', phone_verified_at = datetime('now')
    WHERE id = ? AND tenant_id = ? AND status = 'awaiting_contact'
  `).bind(request.id, request.tenant_id).run();

  const sent = await sendTelegramMessage(env, chatId, ru
    ? 'Номер подтверждён. Выберите число, показанное на экране Kamizo.'
    : 'Raqam tasdiqlandi. Kamizo ekranida ko‘rsatilgan sonni tanlang.', {
    replyMarkup: { remove_keyboard: true },
  });
  const choice = await sendTelegramMessage(env, chatId, ru ? 'Какое число показано?' : 'Qaysi son ko‘rsatilgan?', {
    buttons: challengeOptions(request.challenge).map(value => ({
      text: value,
      callback_data: `ta:${request.id}:${value}`,
    })),
  });
  if (sent.ok && choice.ok) {
    await env.DB.prepare(`
      UPDATE telegram_activation_requests SET telegram_message_id = ?
      WHERE id = ? AND tenant_id = ?
    `).bind(String(choice.result?.message_id || ''), request.id, request.tenant_id).run();
  }
  return true;
}

export async function handleActivationCallback(env: Env, callback: any): Promise<void> {
  const data = String(callback?.data || '');
  if (!data.startsWith('ta:')) return;
  const [, requestId, choice] = data.split(':');
  const fromId = String(callback?.from?.id || '');
  const request = await env.DB.prepare(`
    SELECT r.*, u.language
    FROM telegram_activation_requests r
    JOIN users u ON u.id = r.user_id AND u.tenant_id = r.tenant_id
    WHERE r.id = ?
  `).bind(requestId).first() as any;
  const ru = (request?.language || 'ru') === 'ru';
  if (!request || request.status !== 'awaiting_match'
    || String(request.telegram_user_id) !== fromId) {
    await answerCallbackQuery(env, callback.id, ru ? 'Запрос уже недействителен' : 'So‘rov endi amal qilmaydi');
    return;
  }
  if (new Date(request.expires_at) < new Date()) {
    await answerCallbackQuery(env, callback.id, ru ? 'Время подтверждения истекло' : 'Tasdiqlash vaqti tugadi');
    return;
  }
  if (!timingSafeEqual(String(choice), String(request.challenge))) {
    await env.DB.prepare(`
      UPDATE telegram_activation_requests
      SET attempts = attempts + 1, status = 'denied'
      WHERE id = ? AND tenant_id = ?
    `).bind(request.id, request.tenant_id).run();
    await answerCallbackQuery(env, callback.id, ru ? 'Число не совпало' : 'Son mos kelmadi');
    return;
  }
  await env.DB.prepare(`
    UPDATE telegram_activation_requests
    SET status = 'approved', approved_at = datetime('now')
    WHERE id = ? AND tenant_id = ? AND status = 'awaiting_match'
  `).bind(request.id, request.tenant_id).run();
  await answerCallbackQuery(env, callback.id, ru ? 'Telegram подтверждён' : 'Telegram tasdiqlandi');
  if (callback?.message?.chat?.id && request.telegram_message_id) {
    await editTelegramMessage(env, callback.message.chat.id, request.telegram_message_id,
      ru ? 'Telegram подтверждён. Вернитесь в Kamizo и задайте новый пароль.'
        : 'Telegram tasdiqlandi. Kamizoga qaytib, yangi parol o‘rnating.');
  }
}

function activationSecretMatches(request: any, browserSecret: string): Promise<boolean> {
  return sha256(browserSecret).then(hash => timingSafeEqual(hash, String(request.browser_secret_hash || '')));
}

export async function acquireSecurityLock(env: Env, tenantId: string, userId: string): Promise<string | null> {
  const token = randomHex(16);
  const expiresAt = new Date(Date.now() + 2 * 60_000).toISOString();
  try {
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM auth_security_locks WHERE tenant_id = ? AND user_id = ? AND expires_at < ?`)
        .bind(tenantId, userId, new Date().toISOString()),
      env.DB.prepare(`INSERT INTO auth_security_locks (tenant_id, user_id, lock_token, expires_at) VALUES (?, ?, ?, ?)`)
        .bind(tenantId, userId, token, expiresAt),
    ]);
    return token;
  } catch {
    return null;
  }
}

export async function releaseSecurityLock(env: Env, tenantId: string, userId: string, token: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM auth_security_locks WHERE tenant_id = ? AND user_id = ? AND lock_token = ?`)
    .bind(tenantId, userId, token).run().catch(() => {});
}

function activationUser(row: any, passwordChangedAt: string) {
  return {
    id: row.user_id,
    login: row.login,
    phone: row.phone,
    name: row.name,
    role: row.role,
    language: row.language,
    tenant_id: row.tenant_id,
    address: row.address,
    apartment: row.apartment,
    building_id: row.building_id,
    entrance: row.entrance,
    floor: row.floor,
    total_area: row.total_area,
    account_type: row.account_type,
    personal_account: row.personal_account,
    password_changed_at: passwordChangedAt,
    telegram_activated_at: row.telegram_activated_at || passwordChangedAt,
  };
}

export function registerTelegramActivationRoutes() {
  route('POST', '/api/auth/telegram-activation/status', async (request, env) => {
    const body = await request.json() as any;
    const tenantId = String(body.tenantId || '');
    const row = await env.DB.prepare(`
      SELECT id, tenant_id, status, expires_at, browser_secret_hash
      FROM telegram_activation_requests WHERE id = ? AND tenant_id = ?
    `).bind(String(body.requestId || ''), tenantId).first() as any;
    if (!row || !await activationSecretMatches(row, String(body.browserSecret || ''))) {
      return error('Activation request not found', 404);
    }
    if (new Date(row.expires_at) < new Date()) return json({ status: 'expired' });
    return json({ status: row.status });
  });

  route('POST', '/api/auth/telegram-activation/complete', async (request, env) => {
    const body = await request.json() as any;
    const requestId = String(body.requestId || '');
    const tenantId = String(body.tenantId || '');
    const browserSecret = String(body.browserSecret || '');
    const newPassword = String(body.newPassword || '').trim();
    if (newPassword.length < 6 || newPassword.length > 128) {
      return error('Password must be between 6 and 128 characters', 400);
    }
    const row = await env.DB.prepare(`
      SELECT r.*, u.login, u.phone, u.name, u.role, u.language, u.tenant_id,
             u.address, u.apartment, u.building_id, u.entrance, u.floor,
             u.total_area, u.account_type, u.personal_account,
             u.telegram_activation_required, u.telegram_activated_at, u.password_changed_at,
             u.auth_revoked_at
      FROM telegram_activation_requests r
      JOIN users u ON u.id = r.user_id AND u.tenant_id = r.tenant_id
      WHERE r.id = ? AND r.tenant_id = ? AND r.status = 'approved'
        AND u.is_active = 1 AND r.credential_version = COALESCE(u.auth_revoked_at, '')
    `).bind(requestId, tenantId).first() as any;
    if (!row || !await activationSecretMatches(row, browserSecret)) {
      return error('Activation request not found', 404);
    }
    if (new Date(row.expires_at) < new Date()) return error('Activation request expired', 410);

    if (Number(row.telegram_activation_required) !== 1) return error('Activation is not required', 409);

    const passwordHash = await hashPassword(newPassword);
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, recoveryCode);
    const codeHashes = await Promise.all(codes.map(code => recoveryHash(row.user_id, code, env.JWT_SECRET)));
    const now = new Date().toISOString();
    const token = await createJWT({ userId: row.user_id, role: row.role, tenantId: row.tenant_id }, env.JWT_SECRET, 7 * 24 * 60 * 60);
    const lockToken = await acquireSecurityLock(env, row.tenant_id, row.user_id);
    if (!lockToken) return error('Security operation already in progress', 409);

    const freshUser = await env.DB.prepare(`
      SELECT auth_revoked_at, telegram_activation_required FROM users
      WHERE id = ? AND tenant_id = ?
    `).bind(row.user_id, row.tenant_id).first() as any;
    if (!freshUser
      || String(freshUser.auth_revoked_at || '') !== String(row.credential_version || '')
      || Number(freshUser.telegram_activation_required) !== 1) {
      await env.DB.prepare(`
        UPDATE telegram_activation_requests SET status = 'expired'
        WHERE id = ? AND tenant_id = ? AND status = 'approved'
      `).bind(row.id, row.tenant_id).run();
      await releaseSecurityLock(env, row.tenant_id, row.user_id, lockToken);
      return error('Activation credentials changed. Start again.', 409);
    }

    const claimed = await env.DB.prepare(`
      UPDATE telegram_activation_requests SET status = 'consuming'
      WHERE id = ? AND tenant_id = ? AND status = 'approved'
    `).bind(row.id, row.tenant_id).run();
    if ((claimed.meta?.changes ?? 0) !== 1) {
      await releaseSecurityLock(env, row.tenant_id, row.user_id, lockToken);
      return error('Activation already completed', 409);
    }

    try {
      await env.DB.batch([
      env.DB.prepare(`
        UPDATE users SET password_hash = ?, password_changed_at = ?, auth_revoked_at = ?,
          telegram_activation_required = 0, telegram_activated_at = ?, updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ? AND telegram_activation_required = 1
      `).bind(passwordHash, now, now, now, row.user_id, row.tenant_id),
      env.DB.prepare(`
        UPDATE telegram_users SET revoked_at = datetime('now')
        WHERE user_id = ? AND tenant_id = ? AND revoked_at IS NULL
      `).bind(row.user_id, row.tenant_id),
      env.DB.prepare(`
        INSERT INTO telegram_users
          (id, tenant_id, user_id, telegram_user_id, telegram_chat_id, notifications_enabled, security_enabled)
        VALUES (?, ?, ?, ?, ?, 1, 1)
      `).bind(generateId(), row.tenant_id, row.user_id, row.telegram_user_id, row.telegram_chat_id),
      env.DB.prepare(`
        UPDATE auth_recovery_codes SET used_at = datetime('now')
        WHERE tenant_id = ? AND user_id = ? AND used_at IS NULL
      `).bind(row.tenant_id, row.user_id),
      ...codeHashes.map(hash => env.DB.prepare(`
        INSERT INTO auth_recovery_codes (id, tenant_id, user_id, code_hash)
        VALUES (?, ?, ?, ?)
      `).bind(generateId(), row.tenant_id, row.user_id, hash)),
      env.DB.prepare(`
        UPDATE telegram_activation_requests SET status = 'consumed', consumed_at = datetime('now')
        WHERE id = ? AND tenant_id = ? AND status = 'consuming'
      `).bind(row.id, row.tenant_id),
      ]);
    } catch (batchError) {
      await env.DB.prepare(`
        UPDATE telegram_activation_requests SET status = 'approved'
        WHERE id = ? AND tenant_id = ? AND status = 'consuming'
      `).bind(row.id, row.tenant_id).run().catch(() => {});
      await releaseSecurityLock(env, row.tenant_id, row.user_id, lockToken);
      throw batchError;
    }
    await releaseSecurityLock(env, row.tenant_id, row.user_id, lockToken);

    const user = activationUser(row, now);
    return json({ user, token, recoveryCodes: codes }, 200, 'no-store');
  });

  route('POST', '/api/auth/recovery-code', async (request, env) => {
    const body = await request.json() as any;
    const login = String(body.login || '').trim();
    const tenantSlug = String(body.tenantSlug || '').trim();
    const code = String(body.code || '').trim().toUpperCase();
    const newPassword = String(body.newPassword || '').trim();
    if (!login || !tenantSlug || !/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code)
      || newPassword.length < 6 || newPassword.length > 128) {
      return error('Invalid recovery request', 400);
    }

    const tenant = await env.DB.prepare(
      'SELECT id FROM tenants WHERE slug = ? AND is_active = 1'
    ).bind(tenantSlug).first() as any;
    if (!tenant) return error('Invalid recovery request', 400);
    const user = await env.DB.prepare(`
      SELECT id, login, phone, name, role, language, tenant_id, address, apartment,
             building_id, entrance, floor, total_area, account_type, personal_account,
             password_changed_at, telegram_activated_at, telegram_activation_required
      FROM users
      WHERE login = ? AND tenant_id = ? AND is_active = 1
    `).bind(login, tenant.id).first() as any;
    if (!user) return error('Invalid recovery request', 400);

    const hash = await recoveryHash(user.id, code, env.JWT_SECRET);
    const passwordHash = await hashPassword(newPassword);
    const now = new Date().toISOString();
    const token = await createJWT({ userId: user.id, role: user.role, tenantId: tenant.id }, env.JWT_SECRET, 7 * 24 * 60 * 60);
    const priorActivationState = Number(user.telegram_activation_required) === 1 ? 1 : 0;
    const lockToken = await acquireSecurityLock(env, tenant.id, user.id);
    if (!lockToken) return error('Security operation already in progress', 409);
    const claimed = await env.DB.prepare(`
      UPDATE auth_recovery_codes SET used_at = datetime('now')
      WHERE tenant_id = ? AND user_id = ? AND code_hash = ? AND used_at IS NULL
    `).bind(tenant.id, user.id, hash).run();
    if ((claimed.meta?.changes ?? 0) !== 1) {
      await releaseSecurityLock(env, tenant.id, user.id, lockToken);
      return error('Invalid recovery request', 400);
    }

    try {
      await env.DB.batch([
        env.DB.prepare(`
          UPDATE users SET password_hash = ?, password_changed_at = ?, auth_revoked_at = ?,
            telegram_activation_required = 0, updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ? AND telegram_activation_required = ?
        `).bind(passwordHash, now, now, user.id, tenant.id, priorActivationState),
        env.DB.prepare(`
          UPDATE telegram_users SET revoked_at = datetime('now')
          WHERE user_id = ? AND tenant_id = ? AND revoked_at IS NULL
        `).bind(user.id, tenant.id),
        env.DB.prepare(`
          UPDATE telegram_activation_requests SET status = 'expired'
          WHERE user_id = ? AND tenant_id = ?
            AND status IN ('pending', 'awaiting_contact', 'awaiting_match', 'approved', 'denied', 'consuming')
        `).bind(user.id, tenant.id),
      ]);
      await releaseSecurityLock(env, tenant.id, user.id, lockToken);
      return json({
        success: true,
        token,
        user: activationUser({ ...user, user_id: user.id }, now),
      }, 200, 'no-store');
    } catch (recoveryError) {
      await env.DB.prepare(`
        UPDATE auth_recovery_codes SET used_at = NULL
        WHERE tenant_id = ? AND user_id = ? AND code_hash = ?
      `).bind(tenant.id, user.id, hash).run().catch(() => {});
      await releaseSecurityLock(env, tenant.id, user.id, lockToken);
      throw recoveryError;
    }
  });

  route('POST', '/api/users/me/recovery-codes', async (request, env) => {
    const user = await getUser(request, env);
    const tenantId = getTenantId(request);
    if (!user || !tenantId || user.tenant_id !== tenantId) return error('Unauthorized', 401);
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, recoveryCode);
    const hashes = await Promise.all(codes.map(code => recoveryHash(user.id, code, env.JWT_SECRET)));
    const lockToken = await acquireSecurityLock(env, tenantId, user.id);
    if (!lockToken) return error('Security operation already in progress', 409);
    try {
      await env.DB.batch([
        env.DB.prepare(`
          UPDATE auth_recovery_codes SET used_at = datetime('now')
          WHERE tenant_id = ? AND user_id = ? AND used_at IS NULL
        `).bind(tenantId, user.id),
        ...hashes.map(hash => env.DB.prepare(`
          INSERT INTO auth_recovery_codes (id, tenant_id, user_id, code_hash)
          VALUES (?, ?, ?, ?)
        `).bind(generateId(), tenantId, user.id, hash)),
      ]);
    } finally {
      await releaseSecurityLock(env, tenantId, user.id, lockToken);
    }
    return json({ recoveryCodes: codes }, 200, 'no-store');
  });
}
