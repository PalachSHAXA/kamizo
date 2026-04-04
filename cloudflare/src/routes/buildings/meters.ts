// Meters CRUD routes
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { json, error, generateId, isManagement } from '../../utils/helpers';

export function registerMeterRoutes() {

// Meters: List by apartment
route('GET', '/api/apartments/:apartmentId/meters', async (request, env, params) => {
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const isActive = url.searchParams.get('is_active');
  const tenantId = getTenantId(request);

  let query = `SELECT * FROM meters WHERE apartment_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`;
  const bindings: any[] = [params.apartmentId, ...(tenantId ? [tenantId] : [])];
  if (type) { query += ' AND type = ?'; bindings.push(type); }
  if (isActive !== null) { query += ' AND is_active = ?'; bindings.push(isActive === 'true' ? 1 : 0); }
  query += ' ORDER BY type, serial_number';

  const { results } = await env.DB.prepare(query).bind(...bindings).all();
  return json({ meters: results });
});

// Meters: List by building
route('GET', '/api/buildings/:buildingId/meters', async (request, env, params) => {
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const isCommon = url.searchParams.get('is_common');
  const tenantId = getTenantId(request);

  let query = `SELECT * FROM meters WHERE building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`;
  const bindings: any[] = [params.buildingId, ...(tenantId ? [tenantId] : [])];
  if (type) { query += ' AND type = ?'; bindings.push(type); }
  if (isCommon !== null) { query += ' AND is_common = ?'; bindings.push(isCommon === 'true' ? 1 : 0); }
  query += ' ORDER BY type, serial_number';

  const { results } = await env.DB.prepare(query).bind(...bindings).all();
  return json({ meters: results });
});

// Meters: Get single with latest readings
route('GET', '/api/meters/:id', async (request, env, params) => {
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);

  const meter = await env.DB.prepare(`
    SELECT m.*, a.number as apartment_number, a.floor,
      b.name as building_name, b.address as building_address
    FROM meters m LEFT JOIN apartments a ON m.apartment_id = a.id
    LEFT JOIN buildings b ON COALESCE(m.building_id, a.building_id) = b.id
    WHERE m.id = ? ${tenantId ? 'AND m.tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  if (!meter) return error('Meter not found', 404);

  const { results: readings } = await env.DB.prepare(
    `SELECT * FROM meter_readings WHERE meter_id = ? ORDER BY reading_date DESC LIMIT 12`
  ).bind(params.id).all();

  return json({ meter, readings });
});

// Meters: Create
route('POST', '/api/meters', async (request, env) => {
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Manager access required', 403);

  const body = await request.json() as any;
  const id = generateId();

  await env.DB.prepare(`
    INSERT INTO meters (
      id, apartment_id, building_id, type, is_common, serial_number, model, brand,
      install_date, install_location, initial_value, verification_date, next_verification_date,
      seal_number, seal_date, is_active, current_value, last_reading_date, tariff_zone, notes, tenant_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, body.apartment_id || body.apartmentId || null, body.building_id || body.buildingId || null,
    body.type, body.is_common || body.isCommon ? 1 : 0,
    body.serial_number || body.serialNumber, body.model || null, body.brand || null,
    body.install_date || body.installDate || null,
    body.install_location || body.installLocation || body.location || null,
    body.initial_value || body.initialValue || 0,
    body.verification_date || body.verificationDate || null,
    body.next_verification_date || body.nextVerificationDate || null,
    body.seal_number || body.sealNumber || null, body.seal_date || body.sealDate || null,
    body.is_active !== false ? 1 : 0,
    body.current_value || body.currentValue || body.initial_value || body.initialValue || 0,
    body.last_reading_date || body.lastReadingDate || null,
    body.tariff_zone || body.tariffZone || 'single', body.notes || null, getTenantId(request) || null
  ).run();

  const created = await env.DB.prepare('SELECT * FROM meters WHERE id = ?').bind(id).first();
  return json({ meter: created }, 201);
});

// Meters: Update
route('PATCH', '/api/meters/:id', async (request, env, params) => {
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Manager access required', 403);

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];
  const fieldMappings: Record<string, string> = {
    serial_number: 'serial_number', serialNumber: 'serial_number', model: 'model', brand: 'brand',
    install_date: 'install_date', installDate: 'install_date',
    install_location: 'install_location', installLocation: 'install_location', location: 'install_location',
    verification_date: 'verification_date', verificationDate: 'verification_date',
    next_verification_date: 'next_verification_date', nextVerificationDate: 'next_verification_date',
    seal_number: 'seal_number', sealNumber: 'seal_number', seal_date: 'seal_date', sealDate: 'seal_date',
    is_active: 'is_active', isActive: 'is_active',
    current_value: 'current_value', currentValue: 'current_value',
    last_reading_date: 'last_reading_date', lastReadingDate: 'last_reading_date',
    tariff_zone: 'tariff_zone', tariffZone: 'tariff_zone', notes: 'notes',
  };

  for (const [key, dbField] of Object.entries(fieldMappings)) {
    if (body[key] !== undefined) {
      let value = body[key];
      if (typeof value === 'boolean') value = value ? 1 : 0;
      updates.push(`${dbField} = ?`);
      values.push(value);
    }
  }
  if (updates.length === 0) return json({ success: true });
  updates.push('updated_at = datetime("now")');

  const tenantId = getTenantId(request);
  let whereClause = 'WHERE id = ?';
  values.push(params.id);
  if (tenantId) { whereClause += ' AND tenant_id = ?'; values.push(tenantId); }

  await env.DB.prepare(`UPDATE meters SET ${updates.join(', ')} ${whereClause}`).bind(...values).run();
  const updated = await env.DB.prepare(`SELECT * FROM meters WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  return json({ meter: updated });
});

// Meters: Delete
route('DELETE', '/api/meters/:id', async (request, env, params) => {
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Manager access required', 403);
  const tenantId = getTenantId(request);
  await env.DB.prepare(`DELETE FROM meters WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).run();
  return json({ success: true });
});

// Meters: Decommission
route('POST', '/api/meters/:id/decommission', async (request, env, params) => {
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Manager access required', 403);
  const tenantId = getTenantId(request);
  const body = await request.json() as any;

  await env.DB.prepare(`
    UPDATE meters SET is_active = 0, decommissioned_at = datetime('now'), decommissioned_reason = ?, updated_at = datetime('now')
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(body.reason || null, params.id, ...(tenantId ? [tenantId] : [])).run();
  return json({ success: true });
});

} // end registerMeterRoutes
