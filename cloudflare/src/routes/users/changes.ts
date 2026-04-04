// Resident data change routes: change-with-reason, change history, deactivate
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId } from '../../middleware/tenant';
import { invalidateCache } from '../../middleware/cache-local';
import { invalidateOnChange } from '../../cache';
import { json, error, generateId, isManagement } from '../../utils/helpers';
import { hashPassword } from '../../utils/crypto';

export function registerChangesRoutes() {

// Users: Update resident data with documented reason
route('POST', '/api/users/:id/change-with-reason', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const tenantId = getTenantId(request);
  const body = await request.json() as {
    changes: Array<{ field: string; value: string }>;
    reason: string;
    document_number?: string;
    document_date?: string;
    comment?: string;
  };

  if (!body.changes || body.changes.length === 0) return error('No changes specified');
  if (!body.reason) return error('Reason is required');

  const resident = await env.DB.prepare(
    `SELECT id, name, phone, address, apartment, status FROM users WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first<Record<string, unknown>>();
  if (!resident) return error('User not found', 404);

  const allowedFields = ['name', 'phone', 'apartment', 'address', 'status'];
  const updates: string[] = [];
  const values: (string | number)[] = [];

  for (const change of body.changes) {
    if (!allowedFields.includes(change.field)) continue;
    const oldValue = (resident[change.field] as string) || '';
    const newValue = change.value || '';

    updates.push(`${change.field} = ?`);
    values.push(newValue);

    await env.DB.prepare(
      `INSERT INTO resident_changes_log (id, tenant_id, resident_id, changed_by, change_type, field_name, old_value, new_value, reason, document_number, document_date, comment)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      generateId(), tenantId || '', params.id, authUser!.id,
      change.field === 'name' ? 'name_change' : change.field === 'status' ? 'status_change' : 'data_change',
      change.field, oldValue, newValue, body.reason,
      body.document_number || null, body.document_date || null, body.comment || null
    ).run();
  }

  // Handle password change separately
  const passwordChange = body.changes.find(c => c.field === 'password');
  if (passwordChange && passwordChange.value) {
    const hashed = await hashPassword(passwordChange.value);
    updates.push('password_hash = ?');
    values.push(hashed);
    updates.push('password_plain = ?');
    values.push(passwordChange.value);

    await env.DB.prepare(
      `INSERT INTO resident_changes_log (id, tenant_id, resident_id, changed_by, change_type, field_name, old_value, new_value, reason, document_number, document_date, comment)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      generateId(), tenantId || '', params.id, authUser!.id,
      'password_reset', 'password', '***', '***', body.reason,
      body.document_number || null, body.document_date || null, body.comment || null
    ).run();
  }

  if (updates.length === 0) return error('No valid changes to apply');

  values.push(params.id);
  if (tenantId) values.push(tenantId);

  await env.DB.prepare(
    `UPDATE users SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(...values).run();

  await invalidateOnChange('users', env.RATE_LIMITER);

  const updated = await env.DB.prepare(
    `SELECT id, login, name, phone, address, apartment, status FROM users WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  return json({ success: true, user: updated });
});

// Users: Get resident change history
route('GET', '/api/users/:id/changes', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const tenantId = getTenantId(request);
  const { results } = await env.DB.prepare(
    `SELECT rcl.*, u.name as changed_by_name FROM resident_changes_log rcl
     LEFT JOIN users u ON rcl.changed_by = u.id
     WHERE rcl.resident_id = ? ${tenantId ? 'AND rcl.tenant_id = ?' : ''}
     ORDER BY rcl.created_at DESC LIMIT 50`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).all();

  return json({ changes: results || [] });
});

// Users: Deactivate resident (soft delete)
route('POST', '/api/users/:id/deactivate', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const tenantId = getTenantId(request);
  const body = await request.json() as { reason: string; comment?: string };
  if (!body.reason) return error('Reason is required');

  const resident = await env.DB.prepare(
    `SELECT id, name, status FROM users WHERE id = ? AND role = 'resident' ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first<Record<string, unknown>>();
  if (!resident) return error('Resident not found', 404);

  await env.DB.prepare(
    `UPDATE users SET status = 'inactive', updated_at = datetime('now') WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).run();

  await env.DB.prepare(
    `INSERT INTO resident_changes_log (id, tenant_id, resident_id, changed_by, change_type, field_name, old_value, new_value, reason, comment)
     VALUES (?, ?, ?, ?, 'deactivation', 'status', ?, 'inactive', ?, ?)`
  ).bind(
    generateId(), tenantId || '', params.id, authUser!.id,
    (resident.status as string) || 'active', body.reason, body.comment || null
  ).run();

  await env.DB.prepare(
    `INSERT INTO audit_log (id, tenant_id, actor_id, actor_name, actor_role, action, target_type, target_id, details, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    generateId(), tenantId || null, authUser!.id, authUser!.name, authUser!.role,
    'user_deactivated', 'user', params.id,
    JSON.stringify({ reason: body.reason || 'manual' }),
    request.headers.get('CF-Connecting-IP')
  ).run();

  invalidateCache('user:');
  await invalidateOnChange('users', env.RATE_LIMITER);
  return json({ success: true });
});

} // end registerChangesRoutes
