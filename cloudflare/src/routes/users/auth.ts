// Auth routes: login, register
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, setTenantForRequest } from '../../middleware/tenant';
import { checkRateLimit, getClientIdentifier } from '../../middleware/rateLimit';
import { getCurrentCorsOrigin } from '../../middleware/cors';
import { json, error, generateId, isAdminLevel } from '../../utils/helpers';
import { hashPassword, verifyPassword, createJWT } from '../../utils/crypto';
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

  const { data: body, errors: validationErrors } = await validateBody<{ login: string; password: string }>(request, loginSchema);
  if (validationErrors) return error(validationErrors, 400);
  const { login, password } = body;

  // Fetch user with password hash
  // On subdomain: find users of that specific tenant (or super_admin)
  // On main domain (workers.dev has no subdomains): search all users by login —
  //   tenant context is derived post-login from user.tenant_id (see below)
  const tenantId = getTenantId(request);
  let userWithHash = await env.DB.prepare(
    tenantId
      ? `SELECT id, login, phone, name, role, specialization, address, apartment, building_id, branch, building, entrance, floor, total_area, password_hash, password_changed_at, contract_signed_at, account_type, tenant_id FROM users WHERE login = ? AND is_active = 1 AND (tenant_id = ? OR (role = 'super_admin' AND (tenant_id IS NULL OR tenant_id = '')))`
      : `SELECT id, login, phone, name, role, specialization, address, apartment, building_id, branch, building, entrance, floor, total_area, password_hash, password_changed_at, contract_signed_at, account_type, tenant_id FROM users WHERE login = ? AND is_active = 1 ORDER BY CASE WHEN role = 'super_admin' THEN 0 ELSE 1 END LIMIT 1`
  ).bind(...(tenantId ? [login.trim(), tenantId] : [login.trim()])).first() as any;

  if (!userWithHash) {
    return error('Invalid credentials', 401);
  }

  // Verify password using new secure method (supports both legacy SHA-256 and new PBKDF2)
  const isValidPassword = await verifyPassword(password, userWithHash.password_hash);

  if (!isValidPassword) {
    return error('Invalid credentials', 401);
  }

  // Auto-migrate legacy or old-format password hashes to new 10k-iteration format on successful login
  const parts = userWithHash.password_hash.split(':');
  const needsRehash = !userWithHash.password_hash.includes(':') || // legacy SHA-256
    (parts.length === 2) || // old PBKDF2-100k without iteration prefix
    (parts.length === 3 && parseInt(parts[0], 10) !== 50000); // different iteration count
  if (needsRehash) {
    const newHash = await hashPassword(password);
    await env.DB.prepare('UPDATE users SET password_hash = ?, last_login_at = datetime(\'now\') WHERE id = ?')
      .bind(newHash, userWithHash.id).run();
  } else {
    await env.DB.prepare('UPDATE users SET last_login_at = datetime(\'now\') WHERE id = ?')
      .bind(userWithHash.id).run();
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
      return error('Ваш аккаунт деактивирован. Обратитесь к администратору.', 403);
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
  const { login, password, name, role = 'resident', phone, address, apartment, building_id, entrance, floor, specialization, branch, building } = body;

  if (!login || !password || !name) {
    return error('Login, password, and name required');
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

  await env.DB.prepare(`
    INSERT INTO users (id, login, password_hash, name, role, phone, address, apartment, building_id, entrance, floor, specialization, branch, building, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, login.trim(), passwordHash, name, role, phone || null, address || null, apartment || null, building_id || null, entrance || null, floor || null, specialization || null, branch || null, building || null, registerTenantId).run();

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

  return json({ user: { id, login, name, role, phone, address, apartment, building_id, entrance, floor, specialization, branch, building, password } }, 201);
});

} // end registerAuthRoutes
