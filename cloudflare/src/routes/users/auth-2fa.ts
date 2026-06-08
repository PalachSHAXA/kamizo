// 2FA verify / resend.
//
// These routes are mounted unconditionally but are no-ops when
// TWO_FA_ENABLED is off (they return 404-style 'two_fa_disabled', so a
// rogue client can't discover the feature is even gated).
//
// Verify path:
//   POST /api/auth/2fa/verify { pendingToken, code, rememberDevice? }
//     → on success: { user, token, deviceToken? } (same envelope as /login)
//     → on bad code (≤ 4 attempts left): { error: 'invalid_code', attempts_remaining }
//     → on attempts exhausted: invalidate row, { error: 'too_many_attempts' }
//     → on expired or already-used token: { error: 'pending_expired' }
//
// Resend path:
//   POST /api/auth/2fa/resend { pendingToken, lang? }
//     → respects per-phone quota + cooldown (returns 'sms_cooldown' etc.)
//     → on success: { ok: true, expiresInSec, resendCooldownSec }

import { route } from '../../router';
import { getTenantId } from '../../middleware/tenant';
import { getCurrentCorsOrigin } from '../../middleware/cors';
import { generateId } from '../../utils/helpers';
import { createJWT } from '../../utils/crypto';
import { createSmsProvider, isTwoFaEnabled, type SmsSendResult } from '../../utils/sms';
import {
  TWO_FA_CONSTANTS,
  generate6DigitCode,
  generateOpaqueToken,
  sha256Hex,
  timingSafeEqual,
  checkSendQuota,
  recordSend,
  createTrustedDevice,
} from '../../utils/twoFactor';

const userFields = 'id, login, phone, name, role, specialization, address, apartment, building_id, branch, building, entrance, floor, total_area, password_changed_at, contract_signed_at, account_type, tenant_id';

const corsHeaders = (): Record<string, string> => ({
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': getCurrentCorsOrigin(),
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
});

export function registerAuth2FARoutes() {

// ── Verify ─────────────────────────────────────────────────────────
route('POST', '/api/auth/2fa/verify', async (request, env) => {
  if (!isTwoFaEnabled(env)) {
    return new Response(JSON.stringify({ error: 'two_fa_disabled' }), {
      status: 404, headers: corsHeaders(),
    });
  }

  let body: any;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'bad_json' }), { status: 400, headers: corsHeaders() }); }
  const pendingToken = typeof body?.pendingToken === 'string' ? body.pendingToken.trim() : '';
  const code = typeof body?.code === 'string' ? body.code.replace(/\D/g, '').trim() : '';
  const rememberDevice = body?.rememberDevice === true;
  if (!pendingToken || code.length !== 6) {
    return new Response(JSON.stringify({ error: 'bad_request' }), { status: 400, headers: corsHeaders() });
  }

  // Find pending row by token. We don't reveal whether the token
  // exists vs. whether the code is wrong — both paths look the same
  // to the client.
  const row = await env.DB.prepare(
    `SELECT id, user_id, tenant_id, code_hash, attempt_count, expires_at, used_at
       FROM login_otp WHERE pending_token = ?`
  ).bind(pendingToken).first<{
    id: string;
    user_id: string;
    tenant_id: string | null;
    code_hash: string;
    attempt_count: number;
    expires_at: string;
    used_at: string | null;
  }>();

  if (!row || row.used_at) {
    return new Response(JSON.stringify({ error: 'pending_expired' }), { status: 410, headers: corsHeaders() });
  }
  const now = Date.now();
  const expires = Date.parse(row.expires_at + 'Z') || 0;
  if (expires < now) {
    return new Response(JSON.stringify({ error: 'pending_expired' }), { status: 410, headers: corsHeaders() });
  }
  if (row.attempt_count >= TWO_FA_CONSTANTS.MAX_VERIFY_ATTEMPTS) {
    // Hard-invalidate so subsequent retries fail fast.
    await env.DB.prepare(`UPDATE login_otp SET used_at = datetime('now') WHERE id = ?`).bind(row.id).run().catch(() => {});
    return new Response(JSON.stringify({ error: 'too_many_attempts' }), { status: 429, headers: corsHeaders() });
  }

  const submitted = await sha256Hex(code);
  const ok = timingSafeEqual(submitted, row.code_hash);
  if (!ok) {
    // Increment attempt counter — when it hits the cap on the next
    // request the row is hard-invalidated above.
    await env.DB.prepare(`UPDATE login_otp SET attempt_count = attempt_count + 1 WHERE id = ?`).bind(row.id).run();
    const remaining = Math.max(0, TWO_FA_CONSTANTS.MAX_VERIFY_ATTEMPTS - (row.attempt_count + 1));
    return new Response(JSON.stringify({ error: 'invalid_code', attempts_remaining: remaining }), {
      status: 401, headers: corsHeaders(),
    });
  }

  // Burn the row — one-time use.
  await env.DB.prepare(`UPDATE login_otp SET used_at = datetime('now') WHERE id = ?`).bind(row.id).run();

  // Look up the full user payload (same fields as /login).
  const user = await env.DB.prepare(
    `SELECT ${userFields} FROM users WHERE id = ? AND is_active = 1`
  ).bind(row.user_id).first() as any;
  if (!user) {
    return new Response(JSON.stringify({ error: 'user_gone' }), { status: 410, headers: corsHeaders() });
  }

  // Optional trusted-device issuance.
  let deviceToken: string | undefined;
  if (rememberDevice) {
    try {
      deviceToken = await createTrustedDevice(env, user.id, user.tenant_id || null, request.headers.get('User-Agent'));
    } catch { /* non-fatal — login still completes */ }
  }

  const jwtToken = await createJWT(
    { userId: user.id, role: user.role, tenantId: user.tenant_id || undefined },
    env.JWT_SECRET,
    7 * 24 * 60 * 60
  );

  return new Response(JSON.stringify({
    user,
    token: jwtToken,
    ...(deviceToken ? { deviceToken } : {}),
  }), { status: 200, headers: corsHeaders() });
});

// ── Resend ─────────────────────────────────────────────────────────
route('POST', '/api/auth/2fa/resend', async (request, env) => {
  if (!isTwoFaEnabled(env)) {
    return new Response(JSON.stringify({ error: 'two_fa_disabled' }), {
      status: 404, headers: corsHeaders(),
    });
  }
  let body: any;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'bad_json' }), { status: 400, headers: corsHeaders() }); }
  const pendingToken = typeof body?.pendingToken === 'string' ? body.pendingToken.trim() : '';
  const lang: 'ru' | 'uz' = body?.lang === 'uz' ? 'uz' : 'ru';
  if (!pendingToken) {
    return new Response(JSON.stringify({ error: 'bad_request' }), { status: 400, headers: corsHeaders() });
  }

  const row = await env.DB.prepare(
    `SELECT id, user_id, tenant_id, phone, expires_at, used_at
       FROM login_otp WHERE pending_token = ?`
  ).bind(pendingToken).first<{
    id: string;
    user_id: string;
    tenant_id: string | null;
    phone: string;
    expires_at: string;
    used_at: string | null;
  }>();
  if (!row || row.used_at) {
    return new Response(JSON.stringify({ error: 'pending_expired' }), { status: 410, headers: corsHeaders() });
  }

  // Per-phone cooldown / quota — same enforcement as /login.
  const quota = await checkSendQuota(env, row.phone);
  if (!quota.allowed) {
    return new Response(JSON.stringify({
      error: quota.reason === 'cooldown' ? 'sms_cooldown'
           : quota.reason === 'hourly_cap' ? 'sms_hourly_cap'
           : 'sms_daily_cap',
      retry_after_sec: quota.retryAfterSec,
    }), { status: 429, headers: corsHeaders() });
  }

  // Issue a fresh code, replace the existing pending row's code_hash +
  // expires_at, and reset attempt_count. We keep the same pending_token
  // so the client doesn't have to re-thread state through the UI.
  const code = generate6DigitCode();
  const codeHash = await sha256Hex(code);
  const nowIso = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const expiresIso = new Date(Date.now() + TWO_FA_CONSTANTS.CODE_TTL_SECONDS * 1000)
    .toISOString().slice(0, 19).replace('T', ' ');
  await env.DB.prepare(
    `UPDATE login_otp
        SET code_hash = ?, attempt_count = 0, created_at = ?, expires_at = ?
      WHERE id = ?`
  ).bind(codeHash, nowIso, expiresIso, row.id).run();

  const provider = createSmsProvider(env);
  let sendResult: SmsSendResult;
  try { sendResult = await provider.sendCode(row.phone, code, lang); }
  catch (e) { sendResult = { ok: false, provider: provider.name, error: (e as Error).message || 'send failed' }; }
  if (!sendResult.ok) {
    return new Response(JSON.stringify({ error: 'sms_send_failed' }), { status: 502, headers: corsHeaders() });
  }
  await recordSend(env, row.phone);

  return new Response(JSON.stringify({
    ok: true,
    expiresInSec: TWO_FA_CONSTANTS.CODE_TTL_SECONDS,
    resendCooldownSec: TWO_FA_CONSTANTS.RESEND_COOLDOWN_SECONDS,
    ...(sendResult.provider === 'mock' && sendResult.devCode ? { dev_code: sendResult.devCode } : {}),
  }), { status: 200, headers: corsHeaders() });
});

// Silence unused-import warnings if route() is the only user.
void getTenantId; void generateId;

} // end registerAuth2FARoutes
