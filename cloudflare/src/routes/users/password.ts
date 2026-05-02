// Password management routes: change password, admin reset password
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId } from '../../middleware/tenant';
import { invalidateOnChange } from '../../cache';
import { json, error, isManagement, isAdminLevel } from '../../utils/helpers';
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

  const { new_password } = await request.json() as any;
  const newHash = await hashPassword(new_password);
  const newPlain = env.ENCRYPTION_KEY ? await encryptPassword(new_password, env.ENCRYPTION_KEY) : null;

  const tenantIdPwd = getTenantId(request);
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

  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const tempPassword = `${targetUser.login}_${randomSuffix}`;

  const passwordHash = await hashPassword(tempPassword);
  const encryptedPlain = env.ENCRYPTION_KEY ? await encryptPassword(tempPassword, env.ENCRYPTION_KEY) : null;
  await env.DB.prepare(
    `UPDATE users SET password_hash = ?, password_plain = ? WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(passwordHash, encryptedPlain, targetUser.id, ...(tenantId ? [tenantId] : [])).run();

  await invalidateOnChange('users', env.RATE_LIMITER);

  return json({
    success: true,
    message: `Temporary password set for ${targetUser.name}`,
    temporaryPassword: tempPassword,
    user: { id: targetUser.id, login: targetUser.login, name: targetUser.name, role: targetUser.role }
  });
});

// Emergency password reset (no auth, secret-guarded via env var). Used to recover super_admin access.
// Secret is only set in production via `wrangler secret put EMERGENCY_RESET_SECRET`.
// If unset, endpoint is disabled. Use `wrangler d1 execute` for direct DB recovery if disabled.
route('POST', '/api/_emergency-reset', async (request, env) => {
  if (!env.EMERGENCY_RESET_SECRET) {
    return error('Emergency reset is disabled', 503);
  }
  const body = await request.json() as any;
  if (body.secret !== env.EMERGENCY_RESET_SECRET) return error('Forbidden', 403);
  if (!body.user_id || !body.password) return error('user_id and password required', 400);
  const passwordHash = await hashPassword(body.password);
  const encPlain = env.ENCRYPTION_KEY ? await encryptPassword(body.password, env.ENCRYPTION_KEY) : null;
  await env.DB.prepare('UPDATE users SET password_hash = ?, password_plain = ? WHERE id = ?')
    .bind(passwordHash, encPlain, body.user_id).run();
  await invalidateOnChange('users', env.RATE_LIMITER);
  return json({ success: true });
});

} // end registerPasswordRoutes
