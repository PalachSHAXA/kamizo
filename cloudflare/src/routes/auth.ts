// Auth routes: login, register, password management
import type { Env, User } from '../types';
import { route } from '../router';
import { getUser } from '../middleware/auth';
import { getTenantId, setTenantForRequest } from '../middleware/tenant';
import { json, error, generateId, isManagement } from '../utils/helpers';
import { hashPassword, verifyPassword, createJWT, verifyJWT } from '../utils/crypto';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '../middleware/rateLimit';
import { getCurrentCorsOrigin } from '../middleware/cors';
import { createRequestLogger } from '../utils/logger';

// Helper functions
function isSuperAdmin(user: any): boolean {
  return user?.role === 'super_admin';
}

function isExecutorRole(role: string): boolean {
  return ['executor', 'plumber', 'electrician'].includes(role);
}

// ==================== AUTH ROUTES ====================

// Auth: Login
export function registerAuthRoutes(env: Env) {
  route('POST', '/api/auth/login', async (request) => {
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

    const { login, password } = await request.json() as { login: string; password: string };

    if (!login || !password) {
      return error('Login and password required');
    }

    // Fetch user with password hash (filter by tenant if on a subdomain)
    const tenantId = getTenantId(request);
    // BUG-AUTH-01 fix: always filter is_active = 1 at login
    // BUG-AUTH-05 fix: input validation — limit login length
    const trimmedLogin = login.trim().slice(0, 100);

    let userWithHash: any = null;
    if (tenantId) {
      // Subdomain: filter by tenant + allow super_admin
      userWithHash = await env.DB.prepare(
        `SELECT id, login, phone, name, role, specialization, address, apartment, building_id, branch, building, entrance, floor, total_area, password_hash, password_changed_at, contract_signed_at, account_type, tenant_id, is_active FROM users WHERE login = ? AND is_active = 1 AND (tenant_id = ? OR (role = 'super_admin' AND (tenant_id IS NULL OR tenant_id = ''))) LIMIT 1`
      ).bind(trimmedLogin, tenantId).first() as any;
    } else {
      // Main domain: try all tenants, match password against each (BUG-AUTH-01 multi-tenant)
      const { results: candidates } = await env.DB.prepare(
        `SELECT id, login, phone, name, role, specialization, address, apartment, building_id, branch, building, entrance, floor, total_area, password_hash, password_changed_at, contract_signed_at, account_type, tenant_id, is_active FROM users WHERE login = ? AND is_active = 1 ORDER BY CASE WHEN role = 'super_admin' THEN 0 ELSE 1 END LIMIT 10`
      ).bind(trimmedLogin).all() as { results: any[] };

      for (const candidate of (candidates || [])) {
        const valid = await verifyPassword(password, candidate.password_hash);
        if (valid) {
          userWithHash = candidate;
          break;
        }
      }
      // If multi-tenant match found, skip second verify below
      if (userWithHash) {
        // password already verified — jump to rehash logic
        const { password_hash: _ph, is_active: _ia, ...user } = userWithHash;

        // Auto-migrate password hash if needed
        const parts = userWithHash.password_hash.split(':');
        const CURRENT_ITERATIONS = 50000;
        const needsRehash = !userWithHash.password_hash.includes(':') ||
          (parts.length === 2) ||
          (parts.length === 3 && parseInt(parts[0], 10) !== CURRENT_ITERATIONS);
        if (needsRehash) {
          const newHash = await hashPassword(password);
          await env.DB.prepare('UPDATE users SET password_hash = ?, last_login_at = datetime(\'now\') WHERE id = ?')
            .bind(newHash, userWithHash.id).run();
        } else {
          await env.DB.prepare('UPDATE users SET last_login_at = datetime(\'now\') WHERE id = ?')
            .bind(userWithHash.id).run();
        }

        if (!tenantId) {
          if (user.tenant_id) {
            setTenantForRequest(request, { id: user.tenant_id });
          } else if (user.role !== 'super_admin') {
            setTenantForRequest(request, { id: '__no_tenant__' });
          }
        }

        const featureGatedRoles: Record<string, string> = { advertiser: 'advertiser' };
        if (user.tenant_id && featureGatedRoles[user.role]) {
          const tenantData = await env.DB.prepare('SELECT features FROM tenants WHERE id = ?').bind(user.tenant_id).first() as any;
          const features: string[] = tenantData?.features ? JSON.parse(tenantData.features) : [];
          if (!features.includes(featureGatedRoles[user.role])) {
            return error('Ваш аккаунт деактивирован. Обратитесь к администратору.', 403);
          }
        }

        const jwt = await createJWT(
          { userId: user.id, role: user.role, tenantId: user.tenant_id || undefined },
          env.JWT_SECRET,
          24 * 60 * 60
        );

        return new Response(JSON.stringify({ user, token: jwt }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': getCurrentCorsOrigin(),
            'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'X-RateLimit-Limit': '5',
            'X-RateLimit-Remaining': rateLimit.remaining.toString(),
            'X-RateLimit-Reset': rateLimit.resetAt.toString()
          }
        });
      }
    }

    if (!userWithHash) {
      return error('Invalid credentials', 401);
    }

    // Check if deactivated (explicit message instead of generic "invalid credentials")
    if (userWithHash.is_active === 0) {
      return error('Аккаунт деактивирован. Обратитесь к администратору.', 403);
    }

    // Verify password using new secure method (supports both legacy SHA-256 and new PBKDF2)
    const isValidPassword = await verifyPassword(password, userWithHash.password_hash);

    if (!isValidPassword) {
      return error('Invalid credentials', 401);
    }

    // Auto-migrate password hashes to current iteration count on successful login
    const parts = userWithHash.password_hash.split(':');
    const CURRENT_ITERATIONS = 50000;
    const needsRehash = !userWithHash.password_hash.includes(':') || // legacy SHA-256
      (parts.length === 2) || // old PBKDF2 without iteration prefix
      (parts.length === 3 && parseInt(parts[0], 10) !== CURRENT_ITERATIONS);
    if (needsRehash) {
      const newHash = await hashPassword(password);
      await env.DB.prepare('UPDATE users SET password_hash = ?, last_login_at = datetime(\'now\') WHERE id = ?')
        .bind(newHash, userWithHash.id).run();
    } else {
      await env.DB.prepare('UPDATE users SET last_login_at = datetime(\'now\') WHERE id = ?')
        .bind(userWithHash.id).run();
    }

    // Remove sensitive fields from response
    const { password_hash, is_active, ...user } = userWithHash;

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

    // Create signed JWT (24h expiry)
    const jwt = await createJWT(
      { userId: user.id, role: user.role, tenantId: user.tenant_id || undefined },
      env.JWT_SECRET,
      24 * 60 * 60 // 24 hours
    );

    return new Response(JSON.stringify({ user, token: jwt }), {
      status: 200,
      headers
    });
  });

  // Auth: Register (protected - only admin/manager can create users)
  route('POST', '/api/auth/register', async (request) => {
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

    // SECURITY: Only super_admin can create admin accounts
    if (role === 'admin' && !isSuperAdmin(authUser)) {
      return error('Only super admin can create admin accounts', 403);
    }

    // SECURITY: Only admin can create director accounts
    if (role === 'director' && authUser.role !== 'admin') {
      return error('Only admin can create director accounts', 403);
    }

    // SECURITY: Only admin or director can create manager accounts
    if (['manager', 'advertiser'].includes(role) && authUser.role !== 'admin' && authUser.role !== 'director') {
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

    const tenantId = getTenantId(request);
    const existing = await env.DB.prepare(
      `SELECT id FROM users WHERE login = ? ${tenantId ? 'AND tenant_id = ?' : "AND (tenant_id IS NULL OR tenant_id = '')"}`
    ).bind(...[login.trim(), ...(tenantId ? [tenantId] : [])]).first();
    if (existing) {
      return error('Login already exists');
    }

    const id = generateId();
    const passwordHash = await hashPassword(password);

    await env.DB.prepare(`
      INSERT INTO users (id, login, password_hash, name, role, phone, address, apartment, building_id, entrance, floor, specialization, branch, building, tenant_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, login.trim(), passwordHash, name, role, phone || null, address || null, apartment || null, building_id || null, entrance || null, floor || null, specialization || null, branch || null, building || null, tenantId).run();

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

  // Auth: Bulk register
  route('POST', '/api/auth/register-bulk', async (request) => {
    const authUser = await getUser(request, env);
    if (!isManagement(authUser)) {
      return error('Manager access required', 403);
    }

    const { users } = await request.json() as { users: any[] };
    const created: any[] = [];
    const updated: any[] = [];

    const bulkTenantId = getTenantId(request);
    for (const u of users) {
      const existing = await env.DB.prepare(
        `SELECT id FROM users WHERE login = ? ${bulkTenantId ? 'AND tenant_id = ?' : "AND (tenant_id IS NULL OR tenant_id = '')"}`
      ).bind(...[u.login.trim(), ...(bulkTenantId ? [bulkTenantId] : [])]).first() as any;

      if (existing) {
        // UPDATE existing user with new data
        await env.DB.prepare(`
          UPDATE users SET
            name = ?, address = ?, apartment = ?, building_id = ?, entrance = ?, floor = ?,
            updated_at = datetime('now')
          WHERE id = ?
        `).bind(
          u.name, u.address || null, u.apartment || null, u.building_id || null,
          u.entrance || null, u.floor || null, existing.id
        ).run();

        // Also update password if provided
        if (u.password) {
          const passwordHash = await hashPassword(u.password);
          await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
            .bind(passwordHash, existing.id).run();
        }

        updated.push({ id: existing.id, login: u.login, name: u.name });
      } else {
        // CREATE new user
        const id = generateId();
        const rawPwd = u.password || 'kamizo';
        const passwordHash = await hashPassword(rawPwd);

        await env.DB.prepare(`
          INSERT INTO users (id, login, password_hash, name, role, phone, address, apartment, building_id, entrance, floor, total_area, tenant_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          id, u.login.trim(), passwordHash, u.name, 'resident',
          u.phone || null, u.address || null, u.apartment || null, u.building_id || null, u.entrance || null, u.floor || null, u.total_area || null, getTenantId(request)
        ).run();

        created.push({ id, login: u.login, name: u.name });
      }

      // Link data to apartment
      const userId = existing ? existing.id : created[created.length - 1]?.id;
      if (u.building_id && u.apartment && userId) {
        try {
          const apt = await env.DB.prepare(
            `SELECT id FROM apartments WHERE building_id = ? AND number = ? ${bulkTenantId ? 'AND tenant_id = ?' : ''}`
          ).bind(u.building_id, String(u.apartment), ...(bulkTenantId ? [bulkTenantId] : [])).first() as any;

          let aptId = apt?.id;

          if (apt) {
            // Update apartment
            const updateParts: string[] = [];
            const updateBinds: any[] = [];
            if (u.total_area) {
              updateParts.push('total_area = ?');
              updateBinds.push(u.total_area);
            }
            updateParts.push('primary_owner_id = ?');
            updateBinds.push(userId);
            updateParts.push('status = ?');
            updateBinds.push('occupied');

            if (updateParts.length > 0) {
              await env.DB.prepare(
                `UPDATE apartments SET ${updateParts.join(', ')} WHERE id = ?`
              ).bind(...updateBinds, apt.id).run();
            }
          } else {
            // Auto-create apartment
            aptId = generateId();
            let entranceId = null;
            if (u.entrance) {
              const ent = await env.DB.prepare(
                `SELECT id FROM entrances WHERE building_id = ? AND number = ? ${bulkTenantId ? 'AND tenant_id = ?' : ''}`
              ).bind(u.building_id, parseInt(u.entrance), ...(bulkTenantId ? [bulkTenantId] : [])).first() as any;
              if (ent) entranceId = ent.id;
            }
            await env.DB.prepare(`
              INSERT INTO apartments (id, building_id, entrance_id, number, floor, total_area, status, primary_owner_id, tenant_id)
              VALUES (?, ?, ?, ?, ?, ?, 'occupied', ?, ?)
            `).bind(
              aptId, u.building_id, entranceId, String(u.apartment),
              u.floor ? parseInt(u.floor) : null, u.total_area || null,
              userId, bulkTenantId || null
            ).run();
          }

          if (aptId) {
            const loginTrimmed = u.login?.trim();
            if (loginTrimmed && /^\d+$/.test(loginTrimmed)) {
              const existingAccount = await env.DB.prepare(
                `SELECT id FROM personal_accounts WHERE account_number = ? ${bulkTenantId ? 'AND tenant_id = ?' : ''}`
              ).bind(loginTrimmed, ...(bulkTenantId ? [bulkTenantId] : [])).first();

              if (!existingAccount) {
                const paId = generateId();
                await env.DB.prepare(`
                  INSERT INTO personal_accounts (id, account_number, apartment_id, building_id, tenant_id)
                  VALUES (?, ?, ?, ?, ?)
                `).bind(paId, loginTrimmed, aptId, u.building_id, bulkTenantId || null).run();

                await env.DB.prepare(
                  'UPDATE apartments SET personal_account_id = ? WHERE id = ?'
                ).bind(paId, aptId).run();
              }
            }
          }
        } catch (linkErr) {
          createRequestLogger(request).error('Failed to link apartment data', linkErr);
        }
      }
    }

    return json({ created, updated }, 201);
  });

  // Users: Get current user
  route('GET', '/api/users/me', async (request) => {
    const user = await getUser(request, env);
    if (!user) return error('Unauthorized', 401);
    return json({ user });
  });

  // Users: Update profile
  route('PATCH', '/api/users/me', async (request) => {
    const user = await getUser(request, env);
    if (!user) return error('Unauthorized', 401);

    const updates = await request.json() as any;
    const allowed = ['phone', 'name', 'address', 'language'];
    const setClauses: string[] = [];
    const values: any[] = [];

    for (const key of allowed) {
      if (updates[key] !== undefined) {
        setClauses.push(`${key} = ?`);
        values.push(updates[key]);
      }
    }

    if (setClauses.length === 0) return json({ user });

    setClauses.push('updated_at = datetime("now")');
    values.push(user.id);

    await env.DB.prepare(`UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`).bind(...values).run();

    // Fetch updated user
    const updatedUser = await env.DB.prepare(
      'SELECT id, login, phone, name, role, specialization, address, apartment, building_id, entrance, floor, total_area, password_changed_at, contract_signed_at FROM users WHERE id = ?'
    ).bind(user.id).first();

    return json({ user: updatedUser });
  });

  // Users: Mark contract as signed
  route('POST', '/api/users/me/contract-signed', async (request) => {
    const user = await getUser(request, env);
    if (!user) return error('Unauthorized', 401);

    await env.DB.prepare('UPDATE users SET contract_signed_at = datetime("now"), updated_at = datetime("now") WHERE id = ?')
      .bind(user.id).run();

    return json({ success: true, contract_signed_at: new Date().toISOString() });
  });

  // GET /api/contract/template
  route('GET', '/api/contract/template', async (request) => {
    const user = await getUser(request, env);
    if (!user) return error('Unauthorized', 401);

    const tenantId = getTenantId(request);
    if (!tenantId) return error('No tenant', 404);

    const tenant = await env.DB.prepare('SELECT contract_template FROM tenants WHERE id = ?').bind(tenantId).first() as any;
    if (!tenant || !tenant.contract_template) {
      return error('No custom template', 404);
    }

    const base64Data = tenant.contract_template.split(',')[1] || tenant.contract_template;
    const binaryStr = atob(base64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    return new Response(bytes.buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': 'attachment; filename="contract_template.docx"',
        'Access-Control-Allow-Origin': '*',
      }
    });
  });

  // Users: Change password
  route('POST', '/api/users/me/password', async (request) => {
    const user = await getUser(request, env);
    if (!user) return error('Unauthorized', 401);

    const { current_password, new_password } = await request.json() as any;

    if (!new_password || new_password.length < 4) {
      return error('Пароль должен быть минимум 4 символа', 400);
    }

    // Fetch current password hash
    const userWithHash = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?')
      .bind(user.id).first() as any;

    if (!userWithHash) {
      return error('User not found', 404);
    }

    // Verify current password
    const isValid = await verifyPassword(current_password, userWithHash.password_hash);
    if (!isValid) {
      return error('Current password is incorrect', 400);
    }

    // Hash new password
    const newHash = await hashPassword(new_password);
    await env.DB.prepare('UPDATE users SET password_hash = ?, password_changed_at = datetime("now"), updated_at = datetime("now") WHERE id = ?')
      .bind(newHash, user.id).run();

    return json({ success: true, password_changed_at: new Date().toISOString() });
  });

  // Users: Admin change password
  route('POST', '/api/users/:id/password', async (request, _env, params) => {
    const authUser = await getUser(request, env);
    if (!isManagement(authUser)) {
      return error('Manager access required', 403);
    }

    const { new_password } = await request.json() as any;
    const newHash = await hashPassword(new_password);

    const tenantIdPwd = getTenantId(request);
    await env.DB.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ? ${tenantIdPwd ? 'AND tenant_id = ?' : ''}`).bind(newHash, params.id, ...(tenantIdPwd ? [tenantIdPwd] : [])).run();

    return json({ success: true });
  });

  // Auth: Refresh token — exchange a valid (non-expired) JWT for a fresh one
  route('POST', '/api/auth/refresh', async (request) => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return error('Authorization required', 401);
    }

    const token = authHeader.slice(7);
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return error('Invalid or expired token', 401);
    }

    // Verify user still exists and is active
    const tenantId = getTenantId(request);
    const user = await env.DB.prepare(
      `SELECT id, role, tenant_id FROM users WHERE id = ? AND is_active = 1 ${tenantId ? 'AND tenant_id = ?' : ''} LIMIT 1`
    ).bind(...[payload.userId, ...(tenantId ? [tenantId] : [])]).first() as { id: string; role: string; tenant_id?: string } | null;

    if (!user) {
      return error('User not found or deactivated', 401);
    }

    // Issue fresh JWT (24h)
    const newToken = await createJWT(
      { userId: user.id, role: user.role, tenantId: user.tenant_id || undefined },
      env.JWT_SECRET,
      24 * 60 * 60
    );

    return json({ token: newToken });
  });
}
