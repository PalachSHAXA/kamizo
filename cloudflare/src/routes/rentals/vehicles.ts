// Vehicles CRUD: list, create, update, delete, all, search

import type { Env } from '../../types';
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { json, error, generateId, getPaginationParams, createPaginatedResponse } from '../../utils/helpers';

export function registerVehicleRoutes() {

// Vehicles: List for user
route('GET', '/api/vehicles', async (request, env) => {
  const fc = await requireFeature('vehicles', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  const { results } = await env.DB.prepare(`
    SELECT v.*, u.name as owner_name, u.phone as owner_phone, u.apartment, u.address
    FROM vehicles v JOIN users u ON COALESCE(v.user_id, v.resident_id) = u.id
    WHERE COALESCE(v.user_id, v.resident_id) = ?
    ${tenantId ? 'AND v.tenant_id = ?' : ''}
    ORDER BY v.is_primary DESC, v.created_at DESC
  `).bind(user.id, ...(tenantId ? [tenantId] : [])).all();

  return json({ vehicles: results });
});

// Vehicles: Create
route('POST', '/api/vehicles', async (request, env) => {
  const fc = await requireFeature('vehicles', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const { plate_number, brand, model, color, year, vehicle_type, owner_type, company_name, parking_spot, notes, is_primary } = body;
  if (!plate_number) return error('Plate number required');

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO vehicles (id, resident_id, user_id, plate_number, brand, model, color, year, vehicle_type, owner_type, company_name, parking_spot, notes, is_primary, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, user.id, user.id, plate_number.toUpperCase(),
    brand || null, model || null, color || null, year || null,
    vehicle_type || 'car', owner_type || 'individual',
    company_name || null, parking_spot || null, notes || null,
    is_primary ? 1 : 0, getTenantId(request)
  ).run();

  const created = await env.DB.prepare(`
    SELECT v.*, u.name as owner_name, u.phone as owner_phone, u.apartment, u.address
    FROM vehicles v JOIN users u ON COALESCE(v.user_id, v.resident_id) = u.id WHERE v.id = ?
  `).bind(id).first();

  return json({ vehicle: created }, 201);
});

// Vehicles: Update
route('PATCH', '/api/vehicles/:id', async (request, env, params) => {
  const fc = await requireFeature('vehicles', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];
  const allowedFields = ['plate_number', 'brand', 'model', 'color', 'year', 'vehicle_type', 'owner_type', 'company_name', 'parking_spot', 'notes', 'is_primary'];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      if (field === 'plate_number') { updates.push(`${field} = ?`); values.push(body[field].toUpperCase()); }
      else if (field === 'is_primary') { updates.push(`${field} = ?`); values.push(body[field] ? 1 : 0); }
      else { updates.push(`${field} = ?`); values.push(body[field]); }
    }
  }

  if (updates.length === 0) return json({ success: true });

  const tenantId = getTenantId(request);
  updates.push('updated_at = datetime("now")');
  values.push(params.id, user.id, user.id);
  if (tenantId) values.push(tenantId);

  await env.DB.prepare(`UPDATE vehicles SET ${updates.join(', ')} WHERE id = ? AND (user_id = ? OR resident_id = ?) ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(...values).run();

  const updated = await env.DB.prepare(`
    SELECT v.*, u.name as owner_name, u.phone as owner_phone, u.apartment, u.address
    FROM vehicles v JOIN users u ON COALESCE(v.user_id, v.resident_id) = u.id
    WHERE v.id = ? ${tenantId ? 'AND v.tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  return json({ vehicle: updated });
});

// Vehicles: Delete
route('DELETE', '/api/vehicles/:id', async (request, env, params) => {
  const fc = await requireFeature('vehicles', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  await env.DB.prepare(`DELETE FROM vehicles WHERE id = ? AND (user_id = ? OR resident_id = ?) ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, user.id, user.id, ...(tenantId ? [tenantId] : [])).run();
  return json({ success: true });
});

// Vehicles: Get ALL (for security/managers/admins)
route('GET', '/api/vehicles/all', async (request, env) => {
  const fc = await requireFeature('vehicles', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const allowedRoles = ['admin', 'director', 'manager', 'executor', 'department_head', 'security'];
  if (!allowedRoles.includes(user.role)) return error('Forbidden', 403);

  const url = new URL(request.url);
  const pagination = getPaginationParams(url);
  const search = url.searchParams.get('search')?.toUpperCase();
  const tenantId = getTenantId(request);

  let whereClause = tenantId ? 'WHERE v.tenant_id = ?' : '';
  const params: any[] = tenantId ? [tenantId] : [];

  if (search && search.length >= 2) {
    whereClause += (whereClause ? ' AND ' : 'WHERE ') + '(v.plate_number LIKE ? OR u.name LIKE ? OR u.apartment LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const { total } = await env.DB.prepare(`
    SELECT COUNT(*) as total FROM vehicles v JOIN users u ON COALESCE(v.user_id, v.resident_id) = u.id ${whereClause}
  `).bind(...params).first() as any;

  const offset = ((pagination.page || 1) - 1) * (pagination.limit || 50);
  const { results } = await env.DB.prepare(`
    SELECT v.*, u.name as owner_name, u.phone as owner_phone, u.apartment, u.address
    FROM vehicles v JOIN users u ON COALESCE(v.user_id, v.resident_id) = u.id
    ${whereClause} ORDER BY v.created_at DESC LIMIT ? OFFSET ?
  `).bind(...params, pagination.limit, offset).all();

  const response = createPaginatedResponse(results, total || 0, pagination);
  return json({ vehicles: response.data, pagination: response.pagination });
});

// Vehicles: Search
route('GET', '/api/vehicles/search', async (request, env) => {
  const fc = await requireFeature('vehicles', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const url = new URL(request.url);
  const query = url.searchParams.get('q')?.toUpperCase() || url.searchParams.get('plate')?.toUpperCase();
  if (!query || query.length < 1) return json({ vehicles: [] });

  const tenantId = getTenantId(request);
  const { results } = await env.DB.prepare(`
    SELECT v.*, u.name as owner_name, u.phone as owner_phone, u.apartment, u.address
    FROM vehicles v JOIN users u ON COALESCE(v.user_id, v.resident_id) = u.id
    WHERE v.plate_number LIKE ? ${tenantId ? 'AND v.tenant_id = ?' : ''}
    ORDER BY v.plate_number LIMIT 20
  `).bind(`%${query}%`, ...(tenantId ? [tenantId] : [])).all();

  return json({ vehicles: results });
});

} // end registerVehicleRoutes
