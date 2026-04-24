// Team management routes: staff CRUD, colleagues, reset all passwords
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId } from '../../middleware/tenant';
import { invalidateOnChange } from '../../cache';
import { json, error, isAdminLevel } from '../../utils/helpers';
import { hashPassword, decryptPassword, encryptPassword } from '../../utils/crypto';

export function registerTeamRoutes() {

// Team: Get all staff (managers, department_heads, executors) - Admin and Director
route('GET', '/api/team', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isAdminLevel(user)) return error('Access denied', 403);

  const url = new URL(request.url);
  const roleFilter = url.searchParams.get('role');
  const search = url.searchParams.get('search');

  let whereClause = "WHERE u.role IN ('admin', 'manager', 'department_head', 'executor', 'advertiser')";
  const params: any[] = [];

  const tenantId = getTenantId(request);
  if (tenantId) {
    whereClause += ' AND u.tenant_id = ?';
    params.push(tenantId);
  }

  if (roleFilter) {
    whereClause += ' AND u.role = ?';
    params.push(roleFilter);
  }

  if (search && search.length >= 2) {
    whereClause += ' AND (u.name LIKE ? OR u.phone LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  const canSeePasswords = user.role === 'admin' || user.role === 'director';

  const { results: staff } = await env.DB.prepare(`
    SELECT
      u.id, u.login, u.name, u.phone, u.role, u.specialization, u.is_active, u.created_at,
      u.password_plain,
      COALESCE(stats.completed_count, 0) as completed_count,
      COALESCE(stats.active_count, 0) as active_count,
      COALESCE(stats.avg_rating, 0) as avg_rating
    FROM users u
    LEFT JOIN (
      SELECT
        executor_id,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
        SUM(CASE WHEN status IN ('assigned', 'accepted', 'in_progress') THEN 1 ELSE 0 END) as active_count,
        ROUND(AVG(CASE WHEN rating IS NOT NULL THEN rating ELSE NULL END), 1) as avg_rating
      FROM requests
      ${tenantId ? 'WHERE tenant_id = ?' : ''}
      GROUP BY executor_id
    ) stats ON stats.executor_id = u.id
    ${whereClause}
    ORDER BY
      CASE u.role
        WHEN 'admin' THEN 0
        WHEN 'manager' THEN 1
        WHEN 'advertiser' THEN 1
        WHEN 'department_head' THEN 2
        WHEN 'executor' THEN 3
      END,
      u.name
    LIMIT 500
  `).bind(...(tenantId ? [tenantId] : []), ...params).all();

  // Decrypt passwords for admin/director, strip for others
  for (const s of staff as any[]) {
    if (canSeePasswords && s.password_plain && env.ENCRYPTION_KEY) {
      try {
        s.password = await decryptPassword(s.password_plain, env.ENCRYPTION_KEY);
      } catch { s.password = null; }
    }
    delete s.password_plain;
  }

  const admins = staff.filter((s: any) => s.role === 'admin');
  const managers = staff.filter((s: any) => ['manager', 'advertiser'].includes(s.role));
  const departmentHeads = staff.filter((s: any) => s.role === 'department_head');
  const executors = staff.filter((s: any) => s.role === 'executor');

  return json({
    admins,
    managers,
    departmentHeads,
    executors,
    total: staff.length
  });
});

// Team: Get single staff member by ID
route('GET', '/api/team/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isAdminLevel(user)) return error('Access denied', 403);

  const tenantId = getTenantId(request);
  const canSeePasswords = user.role === 'admin' || user.role === 'director';
  const staff = await env.DB.prepare(`
    SELECT id, login, name, phone, role, specialization, status, created_at, password_plain
    FROM users
    WHERE id = ? AND role IN ('admin', 'manager', 'department_head', 'executor', 'director', 'advertiser')
      ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!staff) {
    return error('Staff member not found', 404);
  }

  // Decrypt password for admin/director
  if (canSeePasswords && staff.password_plain && env.ENCRYPTION_KEY) {
    try {
      staff.password = await decryptPassword(staff.password_plain, env.ENCRYPTION_KEY);
    } catch { staff.password = null; }
  }
  delete staff.password_plain;

  return json({ user: staff });
});

// Team: Update staff member
route('PATCH', '/api/team/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isAdminLevel(user)) return error('Access denied', 403);

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  if (body.name) { updates.push('name = ?'); values.push(body.name); }
  if (body.phone) { updates.push('phone = ?'); values.push(body.phone); }
  if (body.login) { updates.push('login = ?'); values.push(body.login); }
  if (body.password) {
    const hashedPassword = await hashPassword(body.password.trim());
    updates.push('password_hash = ?');
    values.push(hashedPassword);
    if (env.ENCRYPTION_KEY) {
      const encrypted = await encryptPassword(body.password.trim(), env.ENCRYPTION_KEY);
      updates.push('password_plain = ?');
      values.push(encrypted);
    }
  }
  if (body.specialization) { updates.push('specialization = ?'); values.push(body.specialization); }
  if (body.status) { updates.push('status = ?'); values.push(body.status); }

  if (updates.length === 0) {
    return error('No fields to update');
  }

  const tenantId = getTenantId(request);
  values.push(params.id);
  if (tenantId) {
    values.push(tenantId);
  }

  await env.DB.prepare(`
    UPDATE users SET ${updates.join(', ')}, updated_at = datetime('now')
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(...values).run();

  await invalidateOnChange('users', env.RATE_LIMITER);

  const updated = await env.DB.prepare(`
    SELECT id, login, name, phone, role, specialization, status, created_at
    FROM users
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  return json({ user: updated });
});

// Team: Delete staff member
route('DELETE', '/api/team/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isAdminLevel(user)) return error('Access denied', 403);

  const tenantId = getTenantId(request);

  const targetUser = await env.DB.prepare(
    `SELECT id, role FROM users WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!targetUser) {
    return error('User not found', 404);
  }

  const staffRoles = ['manager', 'department_head', 'executor', 'advertiser'];
  if (!staffRoles.includes(targetUser.role)) {
    return error('Can only delete staff members', 400);
  }

  await env.DB.prepare(
    `DELETE FROM users WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).run();

  await invalidateOnChange('users', env.RATE_LIMITER);

  return json({ success: true });
});

// Team: Reset passwords for all staff members
route('POST', '/api/team/reset-all-passwords', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (user.role !== 'admin') return error('Only admin can perform this operation', 403);

  const tenantId = getTenantId(request);

  const staffRoles = ['manager', 'department_head', 'executor'];
  const { results: staffMembers } = await env.DB.prepare(`
    SELECT id, login, name, role FROM users
    WHERE role IN (?, ?, ?)
    ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(...staffRoles, ...(tenantId ? [tenantId] : [])).all();

  if (!staffMembers || staffMembers.length === 0) {
    return json({ message: 'No staff members found', updated: 0 });
  }

  const results: { id: string; login: string; name: string; password: string }[] = [];

  for (const staff of staffMembers as any[]) {
    const randomSuffix = Math.random().toString(36).substring(2, 6);
    const newPassword = `${staff.login}${staff.role.charAt(0)}${randomSuffix}`;

    const hashedPassword = await hashPassword(newPassword);
    const encryptedPlain = env.ENCRYPTION_KEY ? await encryptPassword(newPassword, env.ENCRYPTION_KEY) : null;

    await env.DB.prepare(`
      UPDATE users SET password_hash = ?, password_plain = ? WHERE id = ?
    `).bind(hashedPassword, encryptedPlain, staff.id).run();

    results.push({
      id: staff.id,
      login: staff.login,
      name: staff.name,
      password: newPassword
    });
  }

  await invalidateOnChange('users', env.RATE_LIMITER);

  return json({
    message: `Updated ${results.length} staff members with new passwords`,
    updated: results.length,
    staff: results
  });
});

} // end registerTeamRoutes
