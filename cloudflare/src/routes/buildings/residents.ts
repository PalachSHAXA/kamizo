// CRM residents routes
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId } from '../../middleware/tenant';
import { json, error, generateId, isManagement } from '../../utils/helpers';

export function registerResidentRoutes() {

// CRM Residents: List by apartment
route('GET', '/api/apartments/:apartmentId/residents', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const url = new URL(request.url);
  const isActive = url.searchParams.get('is_active');
  const tenantId = getTenantId(request);

  let query = `SELECT * FROM crm_residents WHERE apartment_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`;
  const bindings: any[] = [params.apartmentId, ...(tenantId ? [tenantId] : [])];
  if (isActive !== null) { query += ' AND is_active = ?'; bindings.push(isActive === 'true' ? 1 : 0); }
  query += ' ORDER BY resident_type, full_name LIMIT 500';

  const { results } = await env.DB.prepare(query).bind(...bindings).all();
  return json({ residents: results });
});

// CRM Residents: Get single
route('GET', '/api/residents/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);

  const resident = await env.DB.prepare(`
    SELECT r.*, a.number as apartment_number, a.floor,
      b.name as building_name, b.address as building_address,
      o.full_name as owner_name, o.phone as owner_phone
    FROM crm_residents r LEFT JOIN apartments a ON r.apartment_id = a.id
    LEFT JOIN buildings b ON a.building_id = b.id LEFT JOIN owners o ON r.owner_id = o.id
    WHERE r.id = ? ${tenantId ? 'AND r.tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  if (!resident) return error('Resident not found', 404);
  return json({ resident });
});

// CRM Residents: Create
route('POST', '/api/apartments/:apartmentId/residents', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Manager access required', 403);

  const body = await request.json() as any;
  const id = generateId();
  const fullName = body.full_name || body.fullName ||
    [body.last_name || body.lastName, body.first_name || body.firstName, body.middle_name || body.middleName].filter(Boolean).join(' ');

  await env.DB.prepare(`
    INSERT INTO crm_residents (
      id, apartment_id, owner_id, last_name, first_name, middle_name, full_name, birth_date,
      resident_type, relation_to_owner, registration_type, registration_date, registration_end_date,
      phone, additional_phone, email, is_active, moved_in_date,
      passport_series, passport_number, notes, tenant_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, params.apartmentId, body.owner_id || body.ownerId || null,
    body.last_name || body.lastName || null, body.first_name || body.firstName || null,
    body.middle_name || body.middleName || null, fullName, body.birth_date || body.birthDate || null,
    body.resident_type || body.residentType || 'owner',
    body.relation_to_owner || body.relationToOwner || null,
    body.registration_type || body.registrationType || 'permanent',
    body.registration_date || body.registrationDate || null,
    body.registration_end_date || body.registrationEndDate || null,
    body.phone || null, body.additional_phone || body.additionalPhone || null, body.email || null,
    body.is_active !== false ? 1 : 0,
    body.moved_in_date || body.movedInDate || new Date().toISOString().split('T')[0],
    body.passport_series || body.passportSeries || null,
    body.passport_number || body.passportNumber || null,
    body.notes || null, getTenantId(request) || null
  ).run();

  const created = await env.DB.prepare('SELECT * FROM crm_residents WHERE id = ?').bind(id).first();
  return json({ resident: created }, 201);
});

// CRM Residents: Update
route('PATCH', '/api/residents/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Manager access required', 403);

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];
  const fieldMappings: Record<string, string> = {
    last_name: 'last_name', lastName: 'last_name', first_name: 'first_name', firstName: 'first_name',
    middle_name: 'middle_name', middleName: 'middle_name', full_name: 'full_name', fullName: 'full_name',
    birth_date: 'birth_date', birthDate: 'birth_date',
    resident_type: 'resident_type', residentType: 'resident_type',
    relation_to_owner: 'relation_to_owner', relationToOwner: 'relation_to_owner',
    registration_type: 'registration_type', registrationType: 'registration_type',
    registration_date: 'registration_date', registrationDate: 'registration_date',
    registration_end_date: 'registration_end_date', registrationEndDate: 'registration_end_date',
    phone: 'phone', additional_phone: 'additional_phone', additionalPhone: 'additional_phone',
    email: 'email', is_active: 'is_active', isActive: 'is_active',
    moved_in_date: 'moved_in_date', movedInDate: 'moved_in_date',
    moved_out_date: 'moved_out_date', movedOutDate: 'moved_out_date',
    moved_out_reason: 'moved_out_reason', movedOutReason: 'moved_out_reason',
    notes: 'notes',
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

  await env.DB.prepare(`UPDATE crm_residents SET ${updates.join(', ')} ${whereClause}`).bind(...values).run();
  const updated = await env.DB.prepare(`SELECT * FROM crm_residents WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  return json({ resident: updated });
});

// CRM Residents: Delete
route('DELETE', '/api/residents/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Manager access required', 403);
  const tenantId = getTenantId(request);
  await env.DB.prepare(`DELETE FROM crm_residents WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).run();
  return json({ success: true });
});

// CRM Residents: Move out (soft delete)
route('POST', '/api/residents/:id/move-out', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Manager access required', 403);
  const tenantId = getTenantId(request);
  const body = await request.json() as any;

  await env.DB.prepare(`
    UPDATE crm_residents SET is_active = 0, moved_out_date = ?, moved_out_reason = ?, updated_at = datetime('now')
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(
    body.moved_out_date || body.movedOutDate || new Date().toISOString().split('T')[0],
    body.reason || null, params.id, ...(tenantId ? [tenantId] : [])
  ).run();

  return json({ success: true });
});

} // end registerResidentRoutes
