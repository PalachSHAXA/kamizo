// User CRUD routes: get current user, update profile, list users, delete,
// contract template, admin change name
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId } from '../../middleware/tenant';
import { json, error, isManagement, getPaginationParams, createPaginatedResponse } from '../../utils/helpers';

export function registerCrudRoutes() {

// Users: Get current user
route('GET', '/api/users/me', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  return json({ user });
});

// Users: Update profile
route('PATCH', '/api/users/me', async (request, env) => {
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

  const updatedUser = await env.DB.prepare(
    'SELECT id, login, phone, name, role, specialization, address, apartment, building_id, entrance, floor, total_area, password_changed_at, contract_signed_at FROM users WHERE id = ?'
  ).bind(user.id).first();

  return json({ user: updatedUser });
});

// Users: Mark contract as signed
route('POST', '/api/users/me/contract-signed', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  await env.DB.prepare('UPDATE users SET contract_signed_at = datetime("now"), updated_at = datetime("now") WHERE id = ?')
    .bind(user.id).run();

  return json({ success: true, contract_signed_at: new Date().toISOString() });
});

// GET /api/contract/template - get tenant's custom contract template (.docx)
route('GET', '/api/contract/template', async (request, env) => {
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

// Users: Admin change name
route('PATCH', '/api/users/:id/name', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const { name } = await request.json() as any;
  if (!name || !name.trim()) {
    return error('Name is required', 400);
  }

  const tenantId = getTenantId(request);
  const result = await env.DB.prepare(
    `UPDATE users SET name = ?, updated_at = datetime('now') WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(name.trim(), params.id, ...(tenantId ? [tenantId] : [])).run();

  if (!result.meta.changes) {
    return error('User not found', 404);
  }

  return json({ success: true, name: name.trim() });
});

// Users: List all users (admin/manager only)
route('GET', '/api/users', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const url = new URL(request.url);
  const role = url.searchParams.get('role');
  const building_id = url.searchParams.get('building_id');
  const pagination = getPaginationParams(url);

  let whereClause = 'WHERE 1=1';
  const params: any[] = [];

  const tenantId = getTenantId(request);
  if (tenantId) {
    whereClause += ' AND tenant_id = ?';
    params.push(tenantId);
  }

  if (role) {
    whereClause += ' AND role = ?';
    params.push(role);
  }
  if (building_id) {
    whereClause += ' AND building_id = ?';
    params.push(building_id);
  }

  const countQuery = `SELECT COUNT(*) as total FROM users ${whereClause}`;
  const { total } = await env.DB.prepare(countQuery).bind(...params).first() as any;

  const offset = ((pagination.page || 1) - 1) * (pagination.limit || 50);
  const dataQuery = `
    SELECT u.id, u.login, u.phone, u.name, u.role, u.specialization, u.address, u.apartment, u.building_id, u.entrance, u.floor, u.created_at,
           u.contract_signed_at, u.password_changed_at, u.last_login_at,
           (SELECT COUNT(*) FROM vehicles v WHERE v.user_id = u.id) as vehicle_count
    FROM users u
    ${whereClause}
    ORDER BY u.name
    LIMIT ? OFFSET ?
  `;

  const { results } = await env.DB.prepare(dataQuery).bind(...params, pagination.limit, offset).all();
  const response = createPaginatedResponse(results, total || 0, pagination);

  return json({ users: response.data, pagination: response.pagination });
});

// Users: Delete
route('DELETE', '/api/users/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const tenantIdDelUser = getTenantId(request);
  await env.DB.prepare(`DELETE FROM users WHERE id = ? ${tenantIdDelUser ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantIdDelUser ? [tenantIdDelUser] : [])).run();
  return json({ success: true });
});

} // end registerCrudRoutes
