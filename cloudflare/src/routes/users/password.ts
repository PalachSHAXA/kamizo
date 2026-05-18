// Password management routes: change password, admin reset password
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId } from '../../middleware/tenant';
import { invalidateOnChange } from '../../cache';
import { json, error, isManagement, isAdminLevel, canActOnRole } from '../../utils/helpers';
import { hashPassword, verifyPassword, encryptPassword } from '../../utils/crypto';

export function registerPasswordRoutes() {

// Users: Change password
route('POST', '/api/users/me/password', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const { current_password, new_password } = await request.json() as any;

  const userWithHash = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?')
    .bind(user.id).first() as any;

  if (!userWithHash) {
    return error('User not found', 404);
  }

  const isValid = await verifyPassword(current_password, userWithHash.password_hash);

  if (!isValid) {
    return error('Current password is incorrect', 400);
  }

  const newHash = await hashPassword(new_password);
  const newPlain = env.ENCRYPTION_KEY ? await encryptPassword(new_password, env.ENCRYPTION_KEY) : null;
  await env.DB.prepare('UPDATE users SET password_hash = ?, password_plain = ?, password_changed_at = datetime("now"), updated_at = datetime("now") WHERE id = ?')
    .bind(newHash, newPlain, user.id).run();

  return json({ success: true, password_changed_at: new Date().toISOString() });
});

// Users: Admin change password
route('POST', '/api/users/:id/password', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  // Sprint 66 P0/F6: role-relative check. Was authorising any management
  // role to change ANY user's password — a manager could call this on
  // the director or admin row and take over the account. Now: caller
  // must outrank the target. Hierarchy: super_admin > admin/director >
  // department_head > manager/advertiser > everyone else.
  const tenantIdPwd = getTenantId(request);
  const target = await env.DB.prepare(
    `SELECT id, role FROM users WHERE id = ? ${tenantIdPwd ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantIdPwd ? [tenantIdPwd] : [])).first() as { id: string; role: string } | null;
  if (!target) return error('User not found', 404);

  const rank: Record<string, number> = {
    super_admin: 100, admin: 80, director: 80, department_head: 60,
    manager: 50, advertiser: 50, dispatcher: 40, executor: 30,
    security: 30, resident: 10, tenant: 10, commercial_owner: 10,
  };
  const callerRank = rank[authUser!.role] ?? 0;
  const targetRank = rank[target.role] ?? 0;
  // Allow self-reset (e.g. admin resetting their own password) but not
  // peers or higher. super_admin can reset anyone.
  if (authUser!.id !== target.id && authUser!.role !== 'super_admin' && callerRank <= targetRank) {
    return error('Cannot change password of a peer or higher-ranked user', 403);
  }

  const { new_password } = await request.json() as any;
  if (typeof new_password !== 'string' || new_password.length < 6) {
    return error('Password must be at least 6 characters', 400);
  }
  const newHash = await hashPassword(new_password);
  const newPlain = env.ENCRYPTION_KEY ? await encryptPassword(new_password, env.ENCRYPTION_KEY) : null;

  await env.DB.prepare(`UPDATE users SET password_hash = ?, password_plain = ?, updated_at = datetime("now") WHERE id = ? ${tenantIdPwd ? 'AND tenant_id = ?' : ''}`).bind(newHash, newPlain, params.id, ...(tenantIdPwd ? [tenantIdPwd] : [])).run();

  return json({ success: true });
});

// Admin: Update any user's password (admin only)
route('POST', '/api/admin/reset-password', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (user.role !== 'admin') return error('Only admin can reset passwords', 403);

  const body = await request.json() as any;
  const { login, password } = body;

  if (!login || !password) {
    return error('Login and password are required');
  }

  const tenantIdReset = getTenantId(request);
  const targetUser = await env.DB.prepare(
    `SELECT id, login, name, role FROM users WHERE login = ? ${tenantIdReset ? 'AND tenant_id = ?' : ''}`
  ).bind(login, ...(tenantIdReset ? [tenantIdReset] : [])).first() as any;

  if (!targetUser) {
    return error('User not found', 404);
  }

  // Sprint 68 P1/F9: rank check. Without it, an admin could reset
  // super_admin's password if they share a tenant (or null tenant on
  // main domain).
  if (!canActOnRole(user, targetUser)) {
    return error('Cannot reset password of a peer or higher-ranked user', 403);
  }

  const hashedPassword = await hashPassword(password);
  const encryptedPlain = env.ENCRYPTION_KEY ? await encryptPassword(password, env.ENCRYPTION_KEY) : null;
  await env.DB.prepare(`
    UPDATE users SET password_hash = ?, password_plain = ? WHERE id = ? ${tenantIdReset ? 'AND tenant_id = ?' : ''}
  `).bind(hashedPassword, encryptedPlain, targetUser.id, ...(tenantIdReset ? [tenantIdReset] : [])).run();

  await invalidateOnChange('users', env.RATE_LIMITER);

  return json({
    success: true,
    message: `Password updated for ${targetUser.name}`,
    user: { login: targetUser.login, name: targetUser.name, role: targetUser.role }
  });
});

// Admin: Reset user password by ID
route('POST', '/api/users/:id/reset-password', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isAdminLevel(user)) return error('Access denied', 403);

  const tenantId = getTenantId(request);
  const targetUser = await env.DB.prepare(
    `SELECT id, login, name, role FROM users WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!targetUser) return error('User not found', 404);

  // Sprint 68 P1/F9: rank check on /:id/reset-password too.
  if (!canActOnRole(user, targetUser)) {
    return error('Cannot reset password of a peer or higher-ranked user', 403);
  }

  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const tempPassword = `${targetUser.login}_${randomSuffix}`;

  const passwordHash = await hashPassword(tempPassword);
  const encryptedPlain = env.ENCRYPTION_KEY ? await encryptPassword(tempPassword, env.ENCRYPTION_KEY) : null;
  await env.DB.prepare(
    `UPDATE users SET password_hash = ?, password_plain = ? WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(passwordHash, encryptedPlain, targetUser.id, ...(tenantId ? [tenantId] : [])).run();

  await invalidateOnChange('users', env.RATE_LIMITER);

  // Sprint 66 P2/F13: temp password is still returned because the admin
  // UX needs to show it once to relay to the user (no SMS/email rails
  // configured yet). The mitigation is upstream: request_logger must
  // never log this response body, and the admin should treat the
  // response panel like a one-time secret.
  return json({
    success: true,
    message: `Temporary password set for ${targetUser.name}`,
    temporaryPassword: tempPassword,
    user: { id: targetUser.id, login: targetUser.login, name: targetUser.name, role: targetUser.role }
  });
});

// Emergency password reset removed. It was used once to recover super_admin
// access in 2026-04; the route stayed gated by EMERGENCY_RESET_SECRET (unset
// in prod → 503), but the safer move is to delete the code path entirely.
// For future recovery use one of:
//   - `wrangler d1 execute kamizo-db --remote --command "UPDATE users SET ..."`
//   - super_admin → /api/super-admin/reset-password
route('POST', '/api/_emergency-reset', async (_request, _env) => {
  return error('Endpoint removed. Use wrangler d1 execute or super-admin reset.', 410);
});

} // end registerPasswordRoutes
