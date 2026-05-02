// Work orders CRUD

import type { Env } from '../../types';
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { invalidateCache } from '../../middleware/cache-local';
import { json, error, generateId } from '../../utils/helpers';

// Shared SELECT for work_orders with consistent JOINs and tenant filter on user joins.
// extraWhere is appended to a base WHERE that already enforces wo.tenant_id = ?.
async function fetchWorkOrderRows(
  env: Env,
  tenantId: string | null | undefined,
  extraWhere: string,
  extraBindings: any[],
  options: { orderBy?: string; limit?: number; firstOnly?: boolean } = {}
) {
  const { orderBy = 'wo.created_at DESC', limit = 500, firstOnly = false } = options;

  // tenantId is the load-bearing first bind for the base WHERE and for join tenant filters.
  // Joins use wo.tenant_id (column) so they remain consistent even if filter were absent,
  // but we always enforce wo.tenant_id = ? in the WHERE when tenantId is set.
  let whereClause: string;
  const bindings: any[] = [];

  if (tenantId) {
    whereClause = 'WHERE wo.tenant_id = ?';
    bindings.push(tenantId);
  } else {
    whereClause = 'WHERE 1=1';
  }
  if (extraWhere) {
    whereClause += ' ' + extraWhere;
    bindings.push(...extraBindings);
  }

  const sql = `
    SELECT wo.*, b.name as building_name,
           u.name as assigned_to_name, u.phone as assigned_to_phone,
           cu.name as created_by_name
    FROM work_orders wo
    LEFT JOIN buildings b ON wo.building_id = b.id
    LEFT JOIN users u ON wo.assigned_to = u.id AND u.tenant_id = wo.tenant_id
    LEFT JOIN users cu ON wo.created_by = cu.id AND cu.tenant_id = wo.tenant_id
    ${whereClause}
    ORDER BY ${orderBy}
    ${firstOnly ? 'LIMIT 1' : `LIMIT ${limit}`}
  `;

  const stmt = env.DB.prepare(sql).bind(...bindings);
  if (firstOnly) return await stmt.first();
  const { results } = await stmt.all();
  return results;
}

export function registerWorkOrderRoutes() {

// Work Orders: List
route('GET', '/api/work-orders', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('requests', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const type = url.searchParams.get('type');
  const priority = url.searchParams.get('priority');
  const buildingId = url.searchParams.get('building_id');

  const tenantId = getTenantId(request);
  const extraClauses: string[] = [];
  const extraBindings: any[] = [];

  if (status && status !== 'all') { extraClauses.push('AND wo.status = ?'); extraBindings.push(status); }
  if (type && type !== 'all') { extraClauses.push('AND wo.type = ?'); extraBindings.push(type); }
  if (priority && priority !== 'all') { extraClauses.push('AND wo.priority = ?'); extraBindings.push(priority); }
  if (buildingId) { extraClauses.push('AND wo.building_id = ?'); extraBindings.push(buildingId); }

  const results = await fetchWorkOrderRows(env, tenantId, extraClauses.join(' '), extraBindings);
  return json({ workOrders: results });
});

// Work Orders: Create
route('POST', '/api/work-orders', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('requests', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const body = await request.json() as any;
  const id = generateId();
  const tenantId = getTenantId(request);

  const year = new Date().getFullYear();
  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM work_orders WHERE tenant_id = ?`
  ).bind(tenantId).first() as any;
  const count = (countResult?.count || 0) + 1;
  const number = `НР-${year}-${String(count).padStart(3, '0')}`;

  await env.DB.prepare(`
    INSERT INTO work_orders (id, tenant_id, number, title, description, type, priority, status, building_id, apartment_id, assigned_to, scheduled_date, scheduled_time, estimated_duration, materials, checklist, notes, request_id, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    id, tenantId, number, body.title, body.description || null,
    body.type || 'planned', body.priority || 'medium', body.status || 'pending',
    body.building_id || null, body.apartment_id || null, body.assigned_to || null,
    body.scheduled_date || null, body.scheduled_time || null,
    body.estimated_duration || 60,
    body.materials ? JSON.stringify(body.materials) : null,
    body.checklist ? JSON.stringify(body.checklist) : null,
    body.notes || null, body.request_id || null, user.id
  ).run();

  const created = await fetchWorkOrderRows(env, tenantId, 'AND wo.id = ?', [id], { firstOnly: true });

  invalidateCache('work-orders:');
  return json({ workOrder: created }, 201);
});

// Work Orders: Update
route('PATCH', '/api/work-orders/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('requests', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const tenantId = getTenantId(request);
  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  if (body.title !== undefined) { updates.push('title = ?'); values.push(body.title); }
  if (body.description !== undefined) { updates.push('description = ?'); values.push(body.description); }
  if (body.type !== undefined) { updates.push('type = ?'); values.push(body.type); }
  if (body.priority !== undefined) { updates.push('priority = ?'); values.push(body.priority); }
  if (body.status !== undefined) { updates.push('status = ?'); values.push(body.status); }
  if (body.building_id !== undefined) { updates.push('building_id = ?'); values.push(body.building_id); }
  if (body.apartment_id !== undefined) { updates.push('apartment_id = ?'); values.push(body.apartment_id); }
  if (body.assigned_to !== undefined) { updates.push('assigned_to = ?'); values.push(body.assigned_to); }
  if (body.scheduled_date !== undefined) { updates.push('scheduled_date = ?'); values.push(body.scheduled_date); }
  if (body.scheduled_time !== undefined) { updates.push('scheduled_time = ?'); values.push(body.scheduled_time); }
  if (body.estimated_duration !== undefined) { updates.push('estimated_duration = ?'); values.push(body.estimated_duration); }
  if (body.actual_duration !== undefined) { updates.push('actual_duration = ?'); values.push(body.actual_duration); }
  if (body.materials !== undefined) { updates.push('materials = ?'); values.push(JSON.stringify(body.materials)); }
  if (body.checklist !== undefined) { updates.push('checklist = ?'); values.push(JSON.stringify(body.checklist)); }
  if (body.notes !== undefined) { updates.push('notes = ?'); values.push(body.notes); }
  if (body.request_id !== undefined) { updates.push('request_id = ?'); values.push(body.request_id); }

  if (updates.length === 0) return error('No fields to update', 400);

  updates.push('updated_at = datetime("now")');
  values.push(params!.id);
  if (tenantId) values.push(tenantId);

  await env.DB.prepare(`UPDATE work_orders SET ${updates.join(', ')} WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(...values).run();

  const updated = await fetchWorkOrderRows(env, tenantId, 'AND wo.id = ?', [params!.id], { firstOnly: true });

  invalidateCache('work-orders:');
  invalidateCache('work-orders:' + params!.id);
  return json({ workOrder: updated });
});

// Work Orders: Change status
route('POST', '/api/work-orders/:id/status', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('requests', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const tenantId = getTenantId(request);
  const body = await request.json() as any;
  const newStatus = body.status;

  if (!newStatus || !['pending', 'scheduled', 'in_progress', 'completed', 'cancelled'].includes(newStatus)) {
    return error('Invalid status', 400);
  }

  const updates: string[] = ['status = ?', 'updated_at = datetime("now")'];
  const values: any[] = [newStatus];

  if (newStatus === 'in_progress') updates.push('started_at = datetime("now")');
  if (newStatus === 'completed') {
    updates.push('completed_at = datetime("now")');
    const wo = await env.DB.prepare(
      `SELECT started_at FROM work_orders WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(params!.id, ...(tenantId ? [tenantId] : [])).first() as any;
    if (wo?.started_at) {
      const durationMinutes = Math.round((Date.now() - new Date(wo.started_at).getTime()) / 60000);
      updates.push('actual_duration = ?');
      values.push(durationMinutes);
    }
  }

  values.push(params!.id);
  if (tenantId) values.push(tenantId);
  await env.DB.prepare(`UPDATE work_orders SET ${updates.join(', ')} WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(...values).run();

  invalidateCache('work-orders:');
  invalidateCache('work-orders:' + params!.id);
  return json({ success: true });
});

// Work Orders: Delete
route('DELETE', '/api/work-orders/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('requests', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const tenantId = getTenantId(request);
  await env.DB.prepare(
    `DELETE FROM work_orders WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params!.id, ...(tenantId ? [tenantId] : [])).run();

  invalidateCache('work-orders:');
  invalidateCache('work-orders:' + params!.id);
  return json({ success: true });
});

} // end registerWorkOrderRoutes
