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

  const { data: body, errors: validationErrors } = await validateBody<{ login: string; password: string; tenantSlug?: string }>(request, loginSchema);
  if (validationErrors) return error(validationErrors, 400);
  const { login, password, tenantSlug: bodyTenantSlug } = body;

  // Trim password to match frontend behavior (prevents whitespace mismatch)
  const trimmedPassword = password.trim();
  const trimmedLogin = login.trim();
  const userFields = 'id, login, phone, name, role, specialization, address, apartment, building_id, branch, building, entrance, floor, total_area, password_hash, password_changed_at, contract_signed_at, account_type, personal_account, tenant_id';

  // Sprint 66 P1/F9 timing-attack guard. The previous "search all tenants
  // then verify against each candidate" code leaked timing because the
  // no-match path skipped PBKDF2 entirely. Keep one constant-cost verify
  // on every no-match branch so the response-time delta cannot be used
  // to enumerate which tenant a login lives in.
  const DUMMY_HASH = '50000:1234567890abcdef1234567890abcdef:abcdefabcdefabcdefabcdefabcdefab';

  // ────────────────────────────────────────────────────────────────
  // STEP 1: resolve tenant.
  //
  // Login MUST be scoped to a single tenant before we compare any
  // password hash. The previous implementation fell back to a global
  // cross-tenant search when no tenant could be resolved — that
  // returned the FIRST candidate whose hash matched, which silently
  // logged users in as the wrong identity whenever the same login
  // string existed in multiple tenants (e.g. demo-resident1 lives on
  // 2 tenants; `director` on 11). That global fallback is removed.
  //
  // Resolution priority:
  //   1. Host-derived tenant (subdomain `demo.kamizo.uz` or the VPS
  //      Origin-header fallback for `api.kamizo.uz`). Populated by
  //      index.ts via setTenantForRequest() before the handler runs.
  //   2. Body field `tenantSlug` — explicit override for callers
  //      without a usable Origin (native Capacitor shell, apex
  //      `app.kamizo.uz`, curl/Postman). Looked up in `tenants` and
  //      must point at an active row.
  //   3. None — only `super_admin` accounts (which are designed to
  //      be tenant-less) are reachable. Everyone else gets a clear
  //      "specify your workspace" error instead of being silently
  //      routed to some other tenant's user row.
  // ────────────────────────────────────────────────────────────────
  let tenantId: string | null = getTenantId(request);
  let tenantResolvedFromBody = false;

  if (!tenantId && typeof bodyTenantSlug === 'string' && bodyTenantSlug.trim()) {
    const slug = bodyTenantSlug.trim().toLowerCase();
    const tenant = await env.DB.prepare(
      'SELECT id FROM tenants WHERE slug = ? AND is_active = 1'
    ).bind(slug).first() as { id: string } | null;
    if (tenant) {
      tenantId = tenant.id;
      tenantResolvedFromBody = true;
    } else {
      // Caller asked for a workspace that doesn't exist (or is disabled).
      // Burn one PBKDF2 to keep the response time matched to the real
      // verify path, then reject with a specific message — knowing the
      // slug is invalid isn't sensitive (slugs are public subdomains).
      await verifyPassword(trimmedPassword, DUMMY_HASH).catch(() => false);
      return bilingualError(
        'Управляющая компания не найдена. Проверьте поддомен.',
        "Boshqaruv kompaniyasi topilmadi. Subdomenni tekshiring.",
        401
      );
    }
  }

  // ────────────────────────────────────────────────────────────────
  // STEP 2: user lookup.
  //
  // Two paths:
  //
  //   A) tenantId resolved (subdomain / Origin patch / body slug) →
  //      single scoped row, exactly like the deployed flow. No change.
  //
  //   B) NO tenant resolved AND no body slug → the unified-mobile-app
  //      "auto-resolve" path. This is the NEW behaviour. The earlier
  //      deployed code only let super_admin reach this branch and
  //      rejected everyone else with a bilingual "specify workspace".
  //      But ~35% of real residents share their phone-login across
  //      2–3 tenants (same person in multiple ЖК), and forcing every
  //      one of them to type a slug is bad UX.
  //
  //      Path B fans out across candidates and verifies the password
  //      against each. The number of verifies is held CONSTANT
  //      regardless of candidate count, so an attacker probing
  //      "director" (4 tenants) vs "nonexistent" (0 tenants) can't
  //      tell the difference from response time. The verifies run in
  //      parallel via Promise.all so wall-clock stays at ~one verify
  //      for any non-empty candidate set.
  //
  //      Branching on the count of candidates whose password VERIFIED:
  //        0 → return the same bilingual "specify workspace" 401 as
  //            today. Critically, this is identical to the response
  //            for logins that don't exist at all — we never leak
  //            which tenants the login lives in when the password
  //            doesn't verify.
  //        1 → success. Set userWithHash, fall through to the JWT
  //            issuance path. One-tap login for both the globally-
  //            unique 65% of logins and the cases where only one of
  //            several same-login rows actually matches the password.
  //        2+ → return { needs_tenant_pick: true, tenants: [...] }
  //             listing ONLY the tenants where the password verified
  //             (never the other candidates). 200 OK — credentials
  //             ARE valid, the user just needs to choose a workspace.
  //             Client re-submits with body.tenantSlug, which hits
  //             path A on the next request.
  // ────────────────────────────────────────────────────────────────
  let userWithHash: any = null;
  let skipFinalVerify = false; // path B already verified — don't waste a 2nd PBKDF

  if (tenantId) {
    // PATH A: tenant-scoped. Single row, may include a global super_admin.
    userWithHash = await env.DB.prepare(
      `SELECT ${userFields} FROM users
       WHERE login = ? AND is_active = 1
         AND (tenant_id = ? OR (role = 'super_admin' AND (tenant_id IS NULL OR tenant_id = '')))`
    ).bind(trimmedLogin, tenantId).first() as any;
  } else {
    // PATH B: unified disambiguation.

    // Hard cap. We've observed up to 4 tenants for `director`, 3 for
    // resident phones. 5 is comfortably above today's worst-case and
    // is still bounded enough to keep wall-clock predictable.
    const MAX_CANDIDATES = 5;

    // Active rows in active tenants, plus the (tenant-less) super_admin.
    // Limited to MAX_CANDIDATES; super_admin sorted first so a global
    // admin's row never gets bumped out by tenant rows.
    const candResp = await env.DB.prepare(
      `SELECT ${userFields} FROM users
       WHERE login = ? AND is_active = 1
         AND (
           (role = 'super_admin' AND (tenant_id IS NULL OR tenant_id = ''))
           OR tenant_id IN (SELECT id FROM tenants WHERE is_active = 1)
         )
       ORDER BY CASE WHEN role = 'super_admin' THEN 0 ELSE 1 END
       LIMIT ?`
    ).bind(trimmedLogin, MAX_CANDIDATES).all();
    const candidates = (candResp.results ?? []) as any[];

    // Constant-cost verify: ALWAYS exactly MAX_CANDIDATES PBKDF2 calls,
    // padded with DUMMY_HASH for slots where no real candidate exists.
    // Run in parallel via Promise.all so wall-clock is ~one verify
    // (assuming WebCrypto's async deriveBits — even if the runtime
    // serialises internally, the response time becomes a CONSTANT max
    // rather than a sum, and the same constant regardless of how many
    // tenants the login lives in).
    const verifyResults: boolean[] = await Promise.all(
      Array.from({ length: MAX_CANDIDATES }, async (_, i) => {
        const hash = candidates[i]?.password_hash ?? DUMMY_HASH;
        return verifyPassword(trimmedPassword, hash).catch(() => false);
      })
    );

    const verified = candidates.filter((_c, i) => verifyResults[i] === true);

    if (verified.length === 0) {
      // Same response as today for "no super_admin found" — see comment
      // block above for why we don't differentiate from "login doesn't
      // exist." Rate-limit (5/min) bounds enumeration regardless.
      return bilingualError(
        'Не удалось определить вашу управляющую компанию. Войдите по адресу {название}.kamizo.uz или передайте поле tenantSlug.',
        "Boshqaruv kompaniyangizni aniqlay olmadik. {nomi}.kamizo.uz orqali kiring yoki tenantSlug maydonini yuboring.",
        401
      );
    }

    if (verified.length > 1) {
      // 2+ candidates verified against the SAME password — this person
      // legitimately has accounts in multiple workspaces. List the
      // tenants in which their password verified. Never expose the
      // others; never expose any tenant for an unverified login.
      const tenantIds = verified
        .map(c => c.tenant_id)
        .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);

      let pickList: { slug: string; name: string; logo: string | null }[] = [];
      if (tenantIds.length > 0) {
        const placeholders = tenantIds.map(() => '?').join(',');
        const metaResp = await env.DB.prepare(
          `SELECT slug, name, logo FROM tenants WHERE id IN (${placeholders}) AND is_active = 1`
        ).bind(...tenantIds).all();
        pickList = (metaResp.results ?? []) as { slug: string; name: string; logo: string | null }[];
      }

      // 200 OK on purpose: the user authenticated successfully (the
      // password DID verify) — they just need to choose where to land.
      // Frontend distinguishes by `needs_tenant_pick` (no `token`).
      return json({
        needs_tenant_pick: true,
        tenants: pickList,
      });
    }

    // Exactly one verified → fall through to the JWT path.
    userWithHash = verified[0];
    skipFinalVerify = true;
  }

  // ────────────────────────────────────────────────────────────────
  // STEP 3: verify password (with the timing-attack guard).
  //
  // Path A (tenant-scoped) reaches here with one row OR none.
  // Path B (disambiguation) reaches here with exactly one verified row
  // and skipFinalVerify=true — we re-verified-once would waste a PBKDF.
  // ────────────────────────────────────────────────────────────────
  if (!userWithHash) {
    // Burn one PBKDF2 cycle on every no-match branch so the response
    // time matches the real verify path.
    await verifyPassword(trimmedPassword, DUMMY_HASH).catch(() => false);

    if (!tenantId) {
      // Apex / no-tenant path with no super_admin match. Tell the
      // caller the policy (instead of a misleading "Invalid creds")
      // so a real user on app.kamizo.uz can recover by going to
      // their subdomain. Generic for super_admin attackers — we
      // still 401, and rate-limiting (5/min) caps enumeration.
      //
      // Reachable today only via path A's no-row case — path B
      // returns its own bilingual error inline above.
      return bilingualError(
        'Не удалось определить вашу управляющую компанию. Войдите по адресу {название}.kamizo.uz или передайте поле tenantSlug.',
        "Boshqaruv kompaniyangizni aniqlay olmadik. {nomi}.kamizo.uz orqali kiring yoki tenantSlug maydonini yuboring.",
        401
      );
    }

    return error('Invalid credentials', 401);
  }

  if (!skipFinalVerify) {
    const isValid = await verifyPassword(trimmedPassword, userWithHash.password_hash);
    if (!isValid) {
      return error('Invalid credentials', 401);
    }
  }
  void tenantResolvedFromBody; // reserved for future audit logging

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

  // Issue JWT token (7 days)
  const jwtToken = await createJWT(
    { userId: user.id, role: user.role, tenantId: user.tenant_id || undefined },
    env.JWT_SECRET,
    7 * 24 * 60 * 60
  );

  return new Response(JSON.stringify({ user, token: jwtToken }), {
    status: 200,
    headers
  });
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
