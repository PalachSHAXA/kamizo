// Branches CRUD routes
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId } from '../../middleware/tenant';
import { json, error, generateId, isManagement } from '../../utils/helpers';

export function registerBranchRoutes() {

// Branches: List all
route('GET', '/api/branches', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);

  const { results } = await env.DB.prepare(`
    SELECT b.*,
      (SELECT COUNT(*) FROM buildings WHERE branch_code = b.code ${tenantId ? 'AND tenant_id = ?' : ''}) as buildings_count,
      (SELECT COUNT(*) FROM users u
       JOIN buildings bld ON u.building_id = bld.id
       WHERE bld.branch_code = b.code AND u.role = 'resident' ${tenantId ? 'AND bld.tenant_id = ?' : ''}) as residents_count
    FROM branches b
    ${tenantId ? 'WHERE b.tenant_id = ?' : ''}
    ORDER BY b.name
  `).bind(...(tenantId ? [tenantId, tenantId, tenantId] : [])).all();

  return json({ branches: results });
});

// Branches: Get single
route('GET', '/api/branches/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);

  const branch = await env.DB.prepare(`
    SELECT b.*,
      (SELECT COUNT(*) FROM buildings WHERE branch_code = b.code ${tenantId ? 'AND tenant_id = ?' : ''}) as buildings_count,
      (SELECT COUNT(*) FROM users u
       JOIN buildings bld ON u.building_id = bld.id
       WHERE bld.branch_code = b.code AND u.role = 'resident' ${tenantId ? 'AND bld.tenant_id = ?' : ''}) as residents_count
    FROM branches b
    WHERE b.id = ? ${tenantId ? 'AND b.tenant_id = ?' : ''}
  `).bind(...(tenantId ? [tenantId, tenantId] : []), params.id, ...(tenantId ? [tenantId] : [])).first();

  if (!branch) return error('Branch not found', 404);
  return json({ branch });
});

// Branches: Create
route('POST', '/api/branches', async (request, env) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager'].includes(user.role)) {
    return error('Admin access required', 403);
  }

  const body = await request.json() as any;
  const { code, name, address, phone, district } = body;
  if (!code || !name) return error('Code and name are required', 400);

  const tenantId = getTenantId(request);
  const existing = await env.DB.prepare(
    `SELECT id FROM branches WHERE code = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(code.toUpperCase(), ...(tenantId ? [tenantId] : [])).first();

  if (existing) return error('Branch with this code already exists', 400);

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO branches (id, code, name, address, phone, district, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, code.toUpperCase(), name, address || null, phone || null, district || null, getTenantId(request)).run();

  const branch = await env.DB.prepare('SELECT * FROM branches WHERE id = ?').bind(id).first();
  return json({ branch }, 201);
});

// Branches: Update
route('PATCH', '/api/branches/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager'].includes(user.role)) {
    return error('Admin access required', 403);
  }

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name); }
  if (body.address !== undefined) { updates.push('address = ?'); values.push(body.address); }
  if (body.phone !== undefined) { updates.push('phone = ?'); values.push(body.phone); }
  if (body.district !== undefined) { updates.push('district = ?'); values.push(body.district || null); }
  if (body.is_active !== undefined) { updates.push('is_active = ?'); values.push(body.is_active ? 1 : 0); }

  if (updates.length === 0) return error('No fields to update', 400);

  const tenantId = getTenantId(request);
  values.push(params.id);
  if (tenantId) values.push(tenantId);
  await env.DB.prepare(
    `UPDATE branches SET ${updates.join(', ')} WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(...values).run();

  const branch = await env.DB.prepare(
    `SELECT * FROM branches WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  return json({ branch });
});

// Branches: Delete
route('DELETE', '/api/branches/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager'].includes(user.role)) {
    return error('Admin access required', 403);
  }
  const tenantId = getTenantId(request);

  const buildingsCount = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM buildings WHERE branch_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (buildingsCount?.count > 0) {
    return error('Cannot delete branch with buildings. Remove buildings first.', 400);
  }

  await env.DB.prepare(
    `DELETE FROM branches WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).run();
  return json({ success: true });
});

// Branch: Change code with cascade update
route('POST', '/api/branches/:id/change-code', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'super_admin'].includes(user.role)) {
    return error('Admin access required', 403);
  }

  const tenantId = getTenantId(request);
  const body = await request.json() as any;
  const newCode = (body.new_code || '').trim().toUpperCase();

  if (!newCode || newCode.length < 1 || newCode.length > 20) return error('Invalid code', 400);
  if (!/^[A-Z0-9_-]+$/.test(newCode)) return error('Code must contain only Latin letters, digits, - or _', 400);

  const branch = await env.DB.prepare(
    `SELECT * FROM branches WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!branch) return error('Branch not found', 404);

  const oldCode = branch.code;
  if (oldCode === newCode) return json({ branch, changed: false });

  const existing = await env.DB.prepare(
    `SELECT id FROM branches WHERE code = ? AND id != ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(newCode, params.id, ...(tenantId ? [tenantId] : [])).first();
  if (existing) return error(`Код "${newCode}" уже используется другим ЖК`, 409);

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE branches SET code = ?, updated_at = datetime('now') WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(newCode, params.id, ...(tenantId ? [tenantId] : [])),
    env.DB.prepare(
      `UPDATE buildings SET branch_code = ? WHERE branch_code = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(newCode, oldCode, ...(tenantId ? [tenantId] : [])),
  ]);

  await env.DB.prepare(
    `INSERT INTO branch_code_audit (id, branch_id, old_code, new_code, changed_by, changed_by_name, tenant_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).bind(generateId(), params.id, oldCode, newCode, user.id, user.name || user.email, tenantId || null).run().catch(() => {});

  const updated = await env.DB.prepare(
    `SELECT * FROM branches WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  return json({ branch: updated, changed: true, old_code: oldCode, new_code: newCode });
});

} // end registerBranchRoutes
