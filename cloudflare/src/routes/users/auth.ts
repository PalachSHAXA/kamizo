// Auth routes: login, register
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, setTenantForRequest } from '../../middleware/tenant';
import { checkRateLimit, getClientIdentifier } from '../../middleware/rateLimit';
import { getCurrentCorsOrigin } from '../../middleware/cors';
import { json, error, bilingualError, generateId, isAdminLevel } from '../../utils/helpers';
import { hashPassword, verifyPassword, createJWT, encryptPassword } from '../../utils/crypto';
import { isExecutorRole, isSuperAdmin } from '../../index';
import { createRequestLogger } from '../../utils/logger';
import { validateBody } from '../../validation/validate';
import { loginSchema } from '../../validation/schemas';
import { createSmsProvider, isTwoFaEnabled, type SmsSendResult } from '../../utils/sms';
import {
  TWO_FA_CONSTANTS,
  generate6DigitCode,
  generateOpaqueToken,
  sha256Hex,
  normalisePhone,
  isTrustedDevice,
  checkSendQuota,
  recordSend,
} from '../../utils/twoFactor';

export function registerAuthRoutes() {

// Auth: Login
// PUBLIC: no auth required
route('POST', '/api/auth/login', async (request, env) => {
  // Check rate limit (by IP before authentication)
  const identifier = getClientIdentifier(request);
  const rateLimit = await checkRateLimit(env, identifier, 'POST:/api/auth/login');

  if (!rateLimit.allowed) {
    const resetIn = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
    return new Response(JSON.stringify({
      error: `Too many login attempts. Try again in ${resetIn} seconds.`
    }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'X-RateLimit-Limit': '5',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': rateLimit.resetAt.toString(),
        'Retry-After': resetIn.toString()
      }
    });
  }

  const { data: body, errors: validationErrors } = await validateBody<{
    login: string;
    password: string;
    // Optional fields used ONLY by the 2FA flow. If TWO_FA_ENABLED is
    // off, these are silently ignored — the schema accepts unknown
    // fields and the original {user, token} response shape is
    // identical to before.
    deviceToken?: string;
    lang?: 'ru' | 'uz';
  }>(request, loginSchema);
  if (validationErrors) return error(validationErrors, 400);
  const { login, password } = body;
  const clientDeviceToken = typeof body.deviceToken === 'string' ? body.deviceToken : undefined;
  const clientLang: 'ru' | 'uz' = body.lang === 'uz' ? 'uz' : 'ru';

  // Trim password to match frontend behavior (prevents whitespace mismatch)
  const trimmedPassword = password.trim();

  // Fetch user with password hash
  // On subdomain: find users of that specific tenant (or super_admin)
  // On main domain: search ALL matching users and verify password against each —
  //   this prevents multi-tenant login collision where LIMIT 1 picks the wrong user
  const tenantId = getTenantId(request);
  const userFields = 'id, login, phone, name, role, specialization, address, apartment, building_id, branch, building, entrance, floor, total_area, password_hash, password_changed_at, contract_signed_at, account_type, tenant_id';

  let userWithHash: any = null;

  if (tenantId) {
    // Subdomain: single-tenant lookup (fast path)
    userWithHash = await env.DB.prepare(
      `SELECT ${userFields} FROM users WHERE login = ? AND is_active = 1 AND (tenant_id = ? OR (role = 'super_admin' AND (tenant_id IS NULL OR tenant_id = '')))`
    ).bind(login.trim(), tenantId).first() as any;

    if (!userWithHash) {
      return error('Invalid credentials', 401);
    }
    const isValid = await verifyPassword(trimmedPassword, userWithHash.password_hash);
    if (!isValid) {
      return error('Invalid credentials', 401);
    }
  } else {
    // Main domain (no subdomain): fetch ALL users with this login and try password against each.
    // This fixes the multi-tenant collision where LIMIT 1 could pick the wrong tenant's user.
    const { results: candidates } = await env.DB.prepare(
      `SELECT ${userFields} FROM users WHERE login = ? AND is_active = 1 ORDER BY CASE WHEN role = 'super_admin' THEN 0 ELSE 1 END LIMIT 10`
    ).bind(login.trim()).all();

    // Sprint 66 P1/F9: timing-attack guard. Non-matching logins used to
    // return after 0 PBKDF2 calls (instant); a match against 1-of-10
    // candidates ran up to ~250ms of PBKDF2. The response-time delta
    // leaked "login exists in at least one tenant" vs "doesn't". Always
    // run one verifyPassword against a dummy hash so both branches pay
    // the same constant cost on the no-match path.
    const DUMMY_HASH = '50000:1234567890abcdef1234567890abcdef:abcdefabcdefabcdefabcdefabcdefab';
    if (!candidates || candidates.length === 0) {
      await verifyPassword(trimmedPassword, DUMMY_HASH).catch(() => false);
      return error('Invalid credentials', 401);
    }

    // Try password against each candidate until one matches
    for (const candidate of candidates) {
      const isValid = await verifyPassword(trimmedPassword, (candidate as any).password_hash);
      if (isValid) {
        userWithHash = candidate;
        break;
      }
    }

    if (!userWithHash) {
      return error('Invalid credentials', 401);
    }
  }

  // Auto-migrate legacy or old-format password hashes to current iteration count
  const parts = userWithHash.password_hash.split(':');
  const needsRehash = !userWithHash.password_hash.includes(':') || // legacy SHA-256
    (parts.length === 2) || // old PBKDF2 without iteration prefix
    (parts.length === 3 && parseInt(parts[0], 10) !== 50000); // different iteration count
  try {
    if (needsRehash) {
      const newHash = await hashPassword(trimmedPassword);
      await env.DB.prepare('UPDATE users SET password_hash = ?, last_login_at = datetime(\'now\') WHERE id = ?')
        .bind(newHash, userWithHash.id).run();
    } else {
      await env.DB.prepare('UPDATE users SET last_login_at = datetime(\'now\') WHERE id = ?')
        .bind(userWithHash.id).run();
    }
  } catch {
    // Non-critical: last_login_at update may fail if column doesn't exist yet (migration 029).
    // Don't block login for this.
  }

  // Remove password_hash from response
  const { password_hash, ...user } = userWithHash;

  // On main domain, derive tenant from user's own tenant_id for data isolation
  if (!tenantId) {
    if (user.tenant_id) {
      setTenantForRequest(request, { id: user.tenant_id });
    } else if (user.role !== 'super_admin') {
      setTenantForRequest(request, { id: '__no_tenant__' });
    }
  }

  // Check if feature-gated role is enabled for this tenant
  const featureGatedRoles: Record<string, string> = { advertiser: 'advertiser' };
  if (tenantId && featureGatedRoles[user.role]) {
    const tenantData = await env.DB.prepare('SELECT features FROM tenants WHERE id = ?').bind(tenantId).first() as any;
    const features: string[] = tenantData?.features ? JSON.parse(tenantData.features) : [];
    if (!features.includes(featureGatedRoles[user.role])) {
      return bilingualError('Ваш аккаунт деактивирован. Обратитесь к администратору.', "Hisobingiz o'chirilgan. Administratorga murojaat qiling.", 403);
    }
  }

  // Create response with rate limit headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': getCurrentCorsOrigin(),
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'X-RateLimit-Limit': '5',
    'X-RateLimit-Remaining': rateLimit.remaining.toString(),
    'X-RateLimit-Reset': rateLimit.resetAt.toString()
  };

  // ────────────────────────────────────────────────────────────────────
  // 2FA-on-login gate — DEFAULT-OFF.
  //
  // When TWO_FA_ENABLED is not '1'/'true', we fall straight through to
  // the legacy issueJwt() path below — response shape, headers, and
  // status code are IDENTICAL to the pre-2FA build.
  //
  // When the flag IS on:
  //   1. If the request carried a trusted-device token for THIS user,
  //      skip the SMS step and issue the JWT immediately.
  //   2. Otherwise: stamp a pending-login row (hashed code, 5-min TTL),
  //      send the SMS via the configured provider (Mock by default;
  //      Eskiz once secrets land), respond with
  //      { twoFactorRequired: true, pendingToken, ... } and NO jwt.
  // ────────────────────────────────────────────────────────────────────
  const issueJwt = async () => {
    const jwtToken = await createJWT(
      { userId: user.id, role: user.role, tenantId: user.tenant_id || undefined },
      env.JWT_SECRET,
      7 * 24 * 60 * 60
    );
    return new Response(JSON.stringify({ user, token: jwtToken }), {
      status: 200,
      headers,
    });
  };

  if (!isTwoFaEnabled(env)) {
    return issueJwt();
  }

  // Trusted device fast-path. Failures here are silent — they just
  // fall through to the SMS path, never blocking login.
  try {
    const td = await isTrustedDevice(env, user.id, clientDeviceToken);
    if (td.trusted) {
      return issueJwt();
    }
  } catch { /* fall through */ }

  // User has no phone on file → 2FA cannot proceed. Don't lock them
  // out: fall back to the legacy path. (Once registration enforces a
  // phone for residents this can become an error instead.)
  const phone = normalisePhone(userWithHash.phone);
  if (!phone) {
    return issueJwt();
  }

  // Per-phone send quota / cooldown. Returns clear `retry_after` so
  // the UI can render "повторно через NN с".
  const quota = await checkSendQuota(env, phone);
  if (!quota.allowed) {
    return new Response(JSON.stringify({
      error: quota.reason === 'cooldown' ? 'sms_cooldown'
           : quota.reason === 'hourly_cap' ? 'sms_hourly_cap'
           : 'sms_daily_cap',
      retry_after_sec: quota.retryAfterSec,
    }), { status: 429, headers });
  }

  // Stamp the pending-login row, send the SMS, persist quota only on
  // successful provider call.
  const code = generate6DigitCode();
  const codeHash = await sha256Hex(code);
  const pendingToken = generateOpaqueToken(TWO_FA_CONSTANTS.PENDING_TOKEN_BYTES);
  const rowId = generateId();
  const nowIso = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const expiresIso = new Date(Date.now() + TWO_FA_CONSTANTS.CODE_TTL_SECONDS * 1000)
    .toISOString().slice(0, 19).replace('T', ' ');

  await env.DB.prepare(
    `INSERT INTO login_otp (id, pending_token, user_id, tenant_id, phone, code_hash, attempt_count, created_at, expires_at, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`
  ).bind(
    rowId, pendingToken, user.id, user.tenant_id || null, phone, codeHash,
    nowIso, expiresIso,
    request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || null,
    (request.headers.get('User-Agent') || '').slice(0, 255),
  ).run();

  const provider = createSmsProvider(env);
  let sendResult: SmsSendResult;
  try {
    sendResult = await provider.sendCode(phone, code, clientLang);
  } catch (e) {
    sendResult = { ok: false, provider: provider.name, error: (e as Error).message || 'send failed' };
  }

  if (!sendResult.ok) {
    // Roll back the pending row so the client can retry cleanly.
    await env.DB.prepare(`DELETE FROM login_otp WHERE id = ?`).bind(rowId).run().catch(() => {});
    return new Response(JSON.stringify({ error: 'sms_send_failed' }), { status: 502, headers });
  }

  // Commit the send-quota bump only after a confirmed send.
  await recordSend(env, phone);

  // Mask the phone tail so the UI can show "···47 12" — never the full
  // number — without a second lookup.
  const tail = phone.length >= 4 ? phone.slice(-4) : phone;
  const phoneMasked = `···${tail.slice(0, 2)} ${tail.slice(2)}`;

  return new Response(JSON.stringify({
    twoFactorRequired: true,
    pendingToken,
    phoneMasked,
    expiresInSec: TWO_FA_CONSTANTS.CODE_TTL_SECONDS,
    resendCooldownSec: TWO_FA_CONSTANTS.RESEND_COOLDOWN_SECONDS,
    // dev_code is ONLY present when the MockProvider opts in via
    // TWO_FA_DEV_MODE. The Eskiz provider never sets it. Production
    // with missing Eskiz creds (Mock without dev mode) also never
    // sets it.
    ...(sendResult.provider === 'mock' && sendResult.devCode ? { dev_code: sendResult.devCode } : {}),
  }), { status: 200, headers });
});

// Auth: Register (protected - only admin/manager can create users)
route('POST', '/api/auth/register', async (request, env) => {
  // SECURITY: Require authentication
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized - login required', 401);
  }

  // SECURITY: Only admin, director, manager, and department_head can create users
  if (authUser.role !== 'admin' && authUser.role !== 'director' && authUser.role !== 'manager' && authUser.role !== 'department_head') {
    return error('Only admin, director, manager, or department head can create users', 403);
  }

  const body = await request.json() as any;
  const { login, password: rawPassword, name, role = 'resident', phone, address, apartment, building_id, entrance, floor, specialization, branch, building } = body;
  const password = rawPassword?.trim();

  if (!login || !password || !name) {
    return error('Login, password, and name required');
  }

  // SECURITY: Only super_admin can create super_admin accounts (prevents privilege escalation)
  if (role === 'super_admin' && !isSuperAdmin(authUser)) {
    return error('Only super admin can create super_admin accounts', 403);
  }

  // SECURITY: Only super_admin can create admin accounts (directors cannot create admins)
  if (role === 'admin' && !isSuperAdmin(authUser)) {
    return error('Only super admin can create admin accounts', 403);
  }

  // SECURITY: Only admin can create director accounts
  if (role === 'director' && authUser.role !== 'admin') {
    return error('Only admin can create director accounts', 403);
  }

  // SECURITY: Only admin or director can create manager accounts (including advertiser)
  if (['manager', 'advertiser'].includes(role) && !isAdminLevel(authUser)) {
    return error('Only admin or director can create manager accounts', 403);
  }

  // SECURITY: Department head can only create executors of their own department
  if (authUser.role === 'department_head') {
    if (!isExecutorRole(role)) {
      return error('Department head can only create executors', 403);
    }
    if (specialization !== authUser.specialization) {
      return error('Department head can only create executors in their own department', 403);
    }
  }

  const registerTenantId = getTenantId(request);
  const existing = await env.DB.prepare(
    `SELECT id FROM users WHERE login = ? ${registerTenantId ? 'AND tenant_id = ?' : "AND (tenant_id IS NULL OR tenant_id = '')"}`
  ).bind(...[login.trim(), ...(registerTenantId ? [registerTenantId] : [])]).first();
  if (existing) {
    return error('Login already exists');
  }

  const id = generateId();
  const passwordHash = await hashPassword(password);
  const passwordPlain = env.ENCRYPTION_KEY ? await encryptPassword(password, env.ENCRYPTION_KEY) : null;

  await env.DB.prepare(`
    INSERT INTO users (id, login, password_hash, password_plain, name, role, phone, address, apartment, building_id, entrance, floor, specialization, branch, building, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, login.trim(), passwordHash, passwordPlain, name, role, phone || null, address || null, apartment || null, building_id || null, entrance || null, floor || null, specialization || null, branch || null, building || null, registerTenantId).run();

  // Auto-create apartment record if resident has building_id + apartment number
  if (building_id && apartment && (role === 'resident' || role === 'tenant')) {
    try {
      const tenantId2 = getTenantId(request);
      const existingApt = await env.DB.prepare(
        `SELECT id FROM apartments WHERE building_id = ? AND number = ? ${tenantId2 ? 'AND tenant_id = ?' : ''}`
      ).bind(building_id, String(apartment), ...(tenantId2 ? [tenantId2] : [])).first() as any;

      if (!existingApt) {
        // Find entrance_id by entrance number
        let entranceId = null;
        if (entrance) {
          const ent = await env.DB.prepare(
            `SELECT id FROM entrances WHERE building_id = ? AND number = ? ${tenantId2 ? 'AND tenant_id = ?' : ''}`
          ).bind(building_id, parseInt(entrance), ...(tenantId2 ? [tenantId2] : [])).first() as any;
          if (ent) entranceId = ent.id;
        }

        const aptId = generateId();
        await env.DB.prepare(`
          INSERT INTO apartments (id, building_id, entrance_id, number, floor, status, primary_owner_id, tenant_id)
          VALUES (?, ?, ?, ?, ?, 'occupied', ?, ?)
        `).bind(aptId, building_id, entranceId, String(apartment), floor ? parseInt(floor) : null, id, tenantId2 || null).run();
      } else {
        // Update existing apartment owner
        await env.DB.prepare('UPDATE apartments SET primary_owner_id = ?, status = ? WHERE id = ?')
          .bind(id, 'occupied', existingApt.id).run();
      }
    } catch (e) {
      createRequestLogger(request).error('Auto-create apartment failed', e);
    }
  }

  return json({ user: { id, login, name, role, phone, address, apartment, building_id, entrance, floor, specialization, branch, building } }, 201);
});

} // end registerAuthRoutes
