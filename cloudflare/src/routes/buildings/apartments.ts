// Apartments CRUD routes
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId } from '../../middleware/tenant';
import { json, error } from '../../utils/helpers';

export function registerApartmentRoutes() {

// Apartments: List by building
route('GET', '/api/buildings/:buildingId/apartments', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const url = new URL(request.url);
  const entranceId = url.searchParams.get('entrance_id');
  const status = url.searchParams.get('status');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '100');
  const offset = (page - 1) * limit;
  const tenantId = getTenantId(request);

  let query = `
    SELECT a.*,
      o.full_name as owner_name, o.phone as owner_phone,
      pa.account_number, pa.balance,
      (SELECT COUNT(*) FROM users u WHERE u.building_id = a.building_id AND TRIM(u.apartment) = TRIM(a.number) AND u.role = 'resident' ${tenantId ? 'AND u.tenant_id = a.tenant_id' : ''}) as resident_count
    FROM apartments a
    LEFT JOIN owners o ON a.primary_owner_id = o.id
    LEFT JOIN personal_accounts pa ON a.personal_account_id = pa.id
    WHERE a.building_id = ?
  `;
  const bindings: any[] = [params.buildingId];

  if (tenantId) { query += ' AND a.tenant_id = ?'; bindings.push(tenantId); }
  if (entranceId) { query += ' AND a.entrance_id = ?'; bindings.push(entranceId); }
  if (status) { query += ' AND a.status = ?'; bindings.push(status); }

  query += ' ORDER BY CAST(a.number AS INTEGER), a.number LIMIT ? OFFSET ?';
  bindings.push(limit, offset);

  const { results } = await env.DB.prepare(query).bind(...bindings).all();

  let countQuery = `SELECT COUNT(*) as total FROM apartments WHERE building_id = ?`;
  const countBindings: any[] = [params.buildingId];
  if (tenantId) { countQuery += ' AND tenant_id = ?'; countBindings.push(tenantId); }
  if (entranceId) { countQuery += ' AND entrance_id = ?'; countBindings.push(entranceId); }
  if (status) { countQuery += ' AND status = ?'; countBindings.push(status); }
  const countResult = await env.DB.prepare(countQuery).bind(...countBindings).first() as any;

  return json({
    apartments: results,
    pagination: { page, limit, total: countResult?.total || 0, pages: Math.ceil((countResult?.total || 0) / limit) }
  });
});

// Apartments: Get single with details
route('GET', '/api/apartments/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);

  let apartment = await env.DB.prepare(`
    SELECT a.*, b.name as building_name, b.address as building_address, e.number as entrance_number
    FROM apartments a LEFT JOIN buildings b ON a.building_id = b.id LEFT JOIN entrances e ON a.entrance_id = e.id
    WHERE a.id = ? ${tenantId ? 'AND a.tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  if (!apartment && tenantId) {
    apartment = await env.DB.prepare(`
      SELECT a.*, b.name as building_name, b.address as building_address, e.number as entrance_number
      FROM apartments a LEFT JOIN buildings b ON a.building_id = b.id LEFT JOIN entrances e ON a.entrance_id = e.id
      WHERE a.id = ?
    `).bind(params.id).first();
  }
  if (!apartment) return error('Apartment not found', 404);

  let owners: any[] = [];
  try {
    const { results } = await env.DB.prepare(`
      SELECT o.*, oa.ownership_share, oa.is_primary, oa.start_date
      FROM owners o JOIN owner_apartments oa ON o.id = oa.owner_id WHERE oa.apartment_id = ? ORDER BY oa.is_primary DESC
    `).bind(params.id).all();
    owners = results || [];
  } catch (e) {}

  let account = null;
  try { account = await env.DB.prepare('SELECT * FROM personal_accounts WHERE apartment_id = ?').bind(params.id).first(); } catch (e) {}

  let userResidents: any[] = [];
  try {
    const apt = apartment as any;
    const aptNumber = String(apt.number || '').trim();
    if (aptNumber && apt.building_id) {
      const { results } = await env.DB.prepare(`
        SELECT id, name, phone, login, address, apartment, total_area, role FROM users
        WHERE building_id = ? AND TRIM(apartment) = ? AND role IN ('resident', 'tenant')
      `).bind(apt.building_id, aptNumber).all();
      userResidents = results || [];
    }
  } catch (e) {}

  return json({ apartment, owners, personalAccount: account, userResidents });
});

} // end registerApartmentRoutes
