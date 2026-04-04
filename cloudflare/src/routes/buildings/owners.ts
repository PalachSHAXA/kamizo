// Owners CRUD + apartment linking routes
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId } from '../../middleware/tenant';
import { json, error, generateId, isManagement } from '../../utils/helpers';

export function registerOwnerRoutes() {

// Owners: List all
route('GET', '/api/owners', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const search = url.searchParams.get('search');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = (page - 1) * limit;
  const tenantId = getTenantId(request);

  let query = 'SELECT * FROM owners WHERE 1=1';
  const bindings: any[] = [];
  if (tenantId) { query += ' AND tenant_id = ?'; bindings.push(tenantId); }
  if (type) { query += ' AND type = ?'; bindings.push(type); }
  if (search) {
    query += ' AND (full_name LIKE ? OR phone LIKE ? OR email LIKE ?)';
    const s = `%${search}%`;
    bindings.push(s, s, s);
  }
  query += ' ORDER BY full_name LIMIT ? OFFSET ?';
  bindings.push(limit, offset);
  const { results } = await env.DB.prepare(query).bind(...bindings).all();

  let countQuery = 'SELECT COUNT(*) as total FROM owners WHERE 1=1';
  const countBindings: any[] = [];
  if (tenantId) { countQuery += ' AND tenant_id = ?'; countBindings.push(tenantId); }
  if (type) { countQuery += ' AND type = ?'; countBindings.push(type); }
  if (search) {
    countQuery += ' AND (full_name LIKE ? OR phone LIKE ? OR email LIKE ?)';
    const s = `%${search}%`;
    countBindings.push(s, s, s);
  }
  const countResult = await env.DB.prepare(countQuery).bind(...countBindings).first() as any;

  return json({ owners: results, pagination: { page, limit, total: countResult?.total || 0, pages: Math.ceil((countResult?.total || 0) / limit) } });
});

// Owners: Get single with apartments
route('GET', '/api/owners/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);

  const owner = await env.DB.prepare(`SELECT * FROM owners WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  if (!owner) return error('Owner not found', 404);

  const { results: apartments } = await env.DB.prepare(`
    SELECT a.*, oa.ownership_share, oa.is_primary, b.name as building_name, b.address as building_address
    FROM apartments a JOIN owner_apartments oa ON a.id = oa.apartment_id JOIN buildings b ON a.building_id = b.id
    WHERE oa.owner_id = ? ${tenantId ? 'AND a.tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).all();

  return json({ owner, apartments });
});

// Owners: Create
route('POST', '/api/owners', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Manager access required', 403);

  const body = await request.json() as any;
  const id = generateId();
  let fullName = body.full_name || body.fullName;
  if (!fullName && body.type !== 'legal_entity') {
    fullName = [body.last_name || body.lastName, body.first_name || body.firstName, body.middle_name || body.middleName].filter(Boolean).join(' ');
  }

  await env.DB.prepare(`
    INSERT INTO owners (
      id, type, last_name, first_name, middle_name, full_name,
      company_name, inn, ogrn, legal_address, phone, email, preferred_contact,
      passport_series, passport_number, passport_issued_by, passport_issued_date, registration_address,
      ownership_type, ownership_share, ownership_start_date,
      ownership_document, ownership_document_number, ownership_document_date,
      is_active, notes, tenant_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, body.type || 'individual',
    body.last_name || body.lastName || null, body.first_name || body.firstName || null,
    body.middle_name || body.middleName || null, fullName,
    body.company_name || body.companyName || null, body.inn || null, body.ogrn || null,
    body.legal_address || body.legalAddress || null, body.phone || null, body.email || null,
    body.preferred_contact || body.preferredContact || 'phone',
    body.passport_series || body.passportSeries || null, body.passport_number || body.passportNumber || null,
    body.passport_issued_by || body.passportIssuedBy || null, body.passport_issued_date || body.passportIssuedDate || null,
    body.registration_address || body.registrationAddress || null,
    body.ownership_type || body.ownershipType || 'owner',
    body.ownership_share || body.ownershipShare || 100,
    body.ownership_start_date || body.ownershipStartDate || null,
    body.ownership_document || body.ownershipDocument || null,
    body.ownership_document_number || body.ownershipDocumentNumber || null,
    body.ownership_document_date || body.ownershipDocumentDate || null,
    body.is_active !== false ? 1 : 0, body.notes || null, getTenantId(request) || null
  ).run();

  const createdTenantId = getTenantId(request);
  const created = await env.DB.prepare(`SELECT * FROM owners WHERE id = ? ${createdTenantId ? 'AND tenant_id = ?' : ''}`).bind(id, ...(createdTenantId ? [createdTenantId] : [])).first();
  return json({ owner: created }, 201);
});

// Owners: Update
route('PATCH', '/api/owners/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Manager access required', 403);

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];
  const fieldMappings: Record<string, string> = {
    type: 'type', last_name: 'last_name', lastName: 'last_name',
    first_name: 'first_name', firstName: 'first_name', middle_name: 'middle_name', middleName: 'middle_name',
    full_name: 'full_name', fullName: 'full_name', company_name: 'company_name', companyName: 'company_name',
    inn: 'inn', ogrn: 'ogrn', legal_address: 'legal_address', legalAddress: 'legal_address',
    phone: 'phone', email: 'email', preferred_contact: 'preferred_contact', preferredContact: 'preferred_contact',
    passport_series: 'passport_series', passportSeries: 'passport_series',
    passport_number: 'passport_number', passportNumber: 'passport_number',
    passport_issued_by: 'passport_issued_by', passportIssuedBy: 'passport_issued_by',
    passport_issued_date: 'passport_issued_date', passportIssuedDate: 'passport_issued_date',
    registration_address: 'registration_address', registrationAddress: 'registration_address',
    ownership_type: 'ownership_type', ownershipType: 'ownership_type',
    ownership_share: 'ownership_share', ownershipShare: 'ownership_share',
    ownership_start_date: 'ownership_start_date', ownershipStartDate: 'ownership_start_date',
    ownership_document: 'ownership_document', ownershipDocument: 'ownership_document',
    ownership_document_number: 'ownership_document_number', ownershipDocumentNumber: 'ownership_document_number',
    ownership_document_date: 'ownership_document_date', ownershipDocumentDate: 'ownership_document_date',
    is_active: 'is_active', isActive: 'is_active', is_verified: 'is_verified', isVerified: 'is_verified',
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

  await env.DB.prepare(`UPDATE owners SET ${updates.join(', ')} ${whereClause}`).bind(...values).run();
  const updated = await env.DB.prepare(`SELECT * FROM owners WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  return json({ owner: updated });
});

// Owners: Delete
route('DELETE', '/api/owners/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Manager access required', 403);
  const tenantId = getTenantId(request);
  await env.DB.prepare(`DELETE FROM owners WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).run();
  return json({ success: true });
});

// Owner-Apartment: Link
route('POST', '/api/owners/:ownerId/apartments/:apartmentId', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Manager access required', 403);
  const body = await request.json() as any;

  await env.DB.prepare(`
    INSERT OR REPLACE INTO owner_apartments (owner_id, apartment_id, ownership_share, is_primary, start_date) VALUES (?, ?, ?, ?, ?)
  `).bind(params.ownerId, params.apartmentId, body.ownership_share || body.ownershipShare || 100,
    body.is_primary || body.isPrimary ? 1 : 0, body.start_date || body.startDate || new Date().toISOString().split('T')[0]).run();

  if (body.is_primary || body.isPrimary) {
    await env.DB.prepare('UPDATE apartments SET primary_owner_id = ? WHERE id = ?').bind(params.ownerId, params.apartmentId).run();
  }
  return json({ success: true }, 201);
});

// Owner-Apartment: Unlink
route('DELETE', '/api/owners/:ownerId/apartments/:apartmentId', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Manager access required', 403);

  await env.DB.prepare('DELETE FROM owner_apartments WHERE owner_id = ? AND apartment_id = ?').bind(params.ownerId, params.apartmentId).run();
  await env.DB.prepare('UPDATE apartments SET primary_owner_id = NULL WHERE id = ? AND primary_owner_id = ?').bind(params.apartmentId, params.ownerId).run();
  return json({ success: true });
});

} // end registerOwnerRoutes
