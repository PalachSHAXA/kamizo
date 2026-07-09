// Vehicles CRUD: list, create, update, delete, all, search

import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { json, error, generateId, getPaginationParams, createPaginatedResponse } from '../../utils/helpers';

// Sprint 69 P1/F5: normalize plate to canonical [A-Z0-9]. Cyrillic
// lookalikes (А, В, Е, К, М, Н, О, Р, С, Т, Х, У) → Latin (A B E K M H
// O P C T X Y). Without this, an attacker registers `01А123АА` (Cyrillic
// А) which is visually identical to `01A123AA` but won't match guards'
// searches.
const CYRILLIC_TO_LATIN: Record<string, string> = {
  'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H',
  'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X', 'У': 'Y',
};
function normalizePlate(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let s = raw.toUpperCase();
  s = s.replace(/[АВЕКМНОРСТХУ]/g, ch => CYRILLIC_TO_LATIN[ch] || ch);
  s = s.replace(/[^A-Z0-9]/g, '');
  return s;
}

const STAFF_ROLES = new Set(['admin', 'director', 'manager', 'executor', 'department_head', 'security', 'dispatcher']);
function isStaff(user: { role: string } | null | undefined): boolean {
  return !!user && STAFF_ROLES.has(user.role);
}

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

  // Sprint 69 P1/F5: canonicalize plate.
  const normalizedPlate = normalizePlate(plate_number);
  if (normalizedPlate.length < 4 || normalizedPlate.length > 12) {
    return error('Plate must be 4-12 alphanumeric characters', 400);
  }

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO vehicles (id, resident_id, user_id, plate_number, brand, model, color, year, vehicle_type, owner_type, company_name, parking_spot, notes, is_primary, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, user.id, user.id, normalizedPlate,
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
      if (field === 'plate_number') {
        // Sprint 69 P1/F5: canonicalize plate on update too.
        const np = normalizePlate(body[field]);
        if (np.length < 4 || np.length > 12) return error('Plate must be 4-12 alphanumeric characters', 400);
        updates.push(`${field} = ?`); values.push(np);
      }
      else if (field === 'is_primary') { updates.push(`${field} = ?`); values.push(body[field] ? 1 : 0); }
      else { updates.push(`${field} = ?`); values.push(body[field]); }
    }
  }

  if (updates.length === 0) return json({ success: true });

  const tenantId = getTenantId(request);
  updates.push("updated_at = datetime('now')");
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
  // Sprint 69 P1/F3: cap limit at 100. Was unbounded — a security user
  // could pull thousands of rows of phone-book PII in one call with no
  // audit trail.
  if (pagination.limit && pagination.limit > 100) pagination.limit = 100;
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
//
// Sprint 69 P0/F1+F2: was an open directory-mining oracle. Any
// authenticated user (incl. residents) could probe `?q=A` and get
// back 20 rows of owner_name + phone + apartment + address — full
// tenant phone book via 1-char queries.
//
// Now:
//  - Residents NEVER see owner identity (name/phone/address). They
//    get plate + brand/model/color only — useful for "is this car
//    registered to a neighbour" checks, no PII.
//  - Staff (security/manager/admin/director/dept_head/dispatcher) get
//    the full row for guard-shift use.
//  - Min query length 3 + prefix-anchored LIKE to prevent mass-enum.
route('GET', '/api/vehicles/search', async (request, env) => {
  const fc = await requireFeature('vehicles', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const url = new URL(request.url);
  const rawQuery = url.searchParams.get('q') || url.searchParams.get('plate') || '';
  // Canonicalize same way as INSERT so Cyrillic А matches Latin A.
  const query = normalizePlate(rawQuery);
  if (query.length < 3) return json({ vehicles: [] });

  const tenantId = getTenantId(request);
  const staff = isStaff(user);

  // Residents: minimal columns. Staff: full row.
  const selectCols = staff
    ? 'v.*, u.name as owner_name, u.phone as owner_phone, u.apartment, u.address'
    : 'v.id, v.plate_number, v.brand, v.model, v.color, v.year, v.vehicle_type';

  // Prefix-anchored LIKE — `?q=A` no longer matches half the dataset.
  const { results } = await env.DB.prepare(`
    SELECT ${selectCols}
    FROM vehicles v JOIN users u ON COALESCE(v.user_id, v.resident_id) = u.id
    WHERE v.plate_number LIKE ? ${tenantId ? 'AND v.tenant_id = ?' : ''}
    ORDER BY v.plate_number LIMIT 20
  `).bind(`${query}%`, ...(tenantId ? [tenantId] : [])).all();

  return json({ vehicles: results });
});

} // end registerVehicleRoutes
