// Password management routes: self change and privileged resets
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId } from '../../middleware/tenant';
import { invalidateOnChange } from '../../cache';
import { json, error, bilingualError, isManagement, isAdminLevel, canActOnRole } from '../../utils/helpers';
import { hashPassword, verifyPassword } from '../../utils/crypto';

const MAX_PASSWORD_LENGTH = 128;

function hasTenantContext(tenantId: string | null): tenantId is string {
  return Boolean(tenantId && tenantId !== '__no_tenant__');
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body !== null && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function validatePassword(value: unknown, field: 'current' | 'new'): string | Response {
  if (typeof value !== 'string') {
    return error(field === 'current'
      ? 'Current password is required'
      : 'Password must be at least 6 characters', 400);
  }
  const password = value.trim();
  if (password.length < 6) {
    return error(field === 'current' && password.length === 0
      ? 'Current password is required'
      : 'Password must be at least 6 characters', 400);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return error('Password must be at most 128 characters', 400);
  }
  return password;
}

function hasOnlyFields(body: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(body).every(field => allowed.includes(field));
}

function secureToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function registerPasswordRoutes() {

// Users: Change password
route('POST', '/api/users/me/password', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  if (!hasTenantContext(tenantId)) return error('Tenant context required', 403);

  const body = await readBody(request);
  if (!body) return error('Request body must be a plain object', 400);
  if (!hasOnlyFields(body, ['current_password', 'new_password'])) return error('Unexpected request field', 400);
  const currentPassword = validatePassword(body.current_password, 'current');
  if (currentPassword instanceof Response) return currentPassword;
  const newPassword = validatePassword(body.new_password, 'new');
  if (newPassword instanceof Response) return newPassword;

  const userWithHash = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ? AND tenant_id = ?')
    .bind(user.id, tenantId).first() as { password_hash: string } | null;

  if (!userWithHash) {
    return error('User not found', 404);
  }

  const isValid = await verifyPassword(currentPassword, userWithHash.password_hash);

  if (!isValid) {
    return error('Current password is incorrect', 400);
  }

  const newHash = await hashPassword(newPassword);
  const result = await env.DB.prepare(
    "UPDATE users SET password_hash = ?, password_changed_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND tenant_id = ?"
  ).bind(newHash, user.id, tenantId).run();
  if ((result.meta?.changes ?? 0) !== 1) return error('Password change conflict', 409);

  return json({ success: true, password_changed_at: new Date().toISOString() });
});

// Users: Admin change password
route('POST', '/api/users/:id/password', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const tenantIdPwd = getTenantId(request);
  if (!hasTenantContext(tenantIdPwd)) return error('Tenant context required', 403);

  const body = await readBody(request);
  if (!body) return error('Request body must be a plain object', 400);
  if (!hasOnlyFields(body, ['new_password'])) return error('Unexpected request field', 400);
  const newPassword = validatePassword(body.new_password, 'new');
  if (newPassword instanceof Response) return newPassword;

  const target = await env.DB.prepare(
    'SELECT id, role FROM users WHERE id = ? AND tenant_id = ?'
  ).bind(params.id, tenantIdPwd).first() as { id: string; role: string } | null;
  if (!target) return error('User not found', 404);

  if (!canActOnRole(authUser, target)) {
    return error('Cannot change password of a peer or higher-ranked user', 403);
  }

  const newHash = await hashPassword(newPassword);
  const result = await env.DB.prepare(
    "UPDATE users SET password_hash = ?, password_changed_at = NULL, updated_at = datetime('now') WHERE id = ? AND tenant_id = ? AND role = ?"
  ).bind(newHash, params.id, tenantIdPwd, target.role).run();
  if ((result.meta?.changes ?? 0) !== 1) return error('Password change conflict', 409);

  await invalidateOnChange('users', env.RATE_LIMITER);

  return json({ success: true });
});

// Admin: Reset user password by ID
route('POST', '/api/users/:id/reset-password', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isAdminLevel(user)) return bilingualError('Доступ запрещён', 'Kirish taqiqlangan', 403);

  const tenantId = getTenantId(request);
  if (!hasTenantContext(tenantId)) return error('Tenant context required', 403);
  const targetUser = await env.DB.prepare(
    'SELECT id, login, name, role FROM users WHERE id = ? AND tenant_id = ?'
  ).bind(params.id, tenantId).first() as { id: string; login: string; name: string; role: string } | null;

  if (!targetUser) return error('User not found', 404);

  if (!canActOnRole(user, targetUser)) {
    return error('Cannot reset password of a peer or higher-ranked user', 403);
  }

  const tempPassword = `${targetUser.login}_${secureToken()}`;

  const passwordHash = await hashPassword(tempPassword);
  const result = await env.DB.prepare(
    "UPDATE users SET password_hash = ?, password_changed_at = NULL, updated_at = datetime('now') WHERE id = ? AND tenant_id = ? AND role = ?"
  ).bind(passwordHash, targetUser.id, tenantId, targetUser.role).run();
  if ((result.meta?.changes ?? 0) !== 1) return error('Password reset conflict', 409);

  await invalidateOnChange('users', env.RATE_LIMITER);

  const response = json({
    success: true,
    message: `Temporary password set for ${targetUser.name}`,
    temporaryPassword: tempPassword,
    user: { id: targetUser.id, login: targetUser.login, name: targetUser.name, role: targetUser.role }
  }, 200, 'no-store');
  response.headers.set('Pragma', 'no-cache');
  return response;
});

} // end registerPasswordRoutes
