// Personal accounts routes
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId } from '../../middleware/tenant';
import { json, error, generateId, isManagement } from '../../utils/helpers';

export function registerAccountRoutes() {

// Personal Accounts: List by building
route('GET', '/api/buildings/:buildingId/accounts', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const hasDebt = url.searchParams.get('has_debt');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = (page - 1) * limit;
  const tenantId = getTenantId(request);

  let query = `SELECT * FROM personal_accounts WHERE building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`;
  const bindings: any[] = [params.buildingId, ...(tenantId ? [tenantId] : [])];
  if (status) { query += ' AND status = ?'; bindings.push(status); }
  if (hasDebt === 'true') query += ' AND current_debt > 0';
  query += ' ORDER BY apartment_number LIMIT ? OFFSET ?';
  bindings.push(limit, offset);
  const { results } = await env.DB.prepare(query).bind(...bindings).all();

  let countQuery = `SELECT COUNT(*) as total FROM personal_accounts WHERE building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`;
  const countBindings: any[] = [params.buildingId, ...(tenantId ? [tenantId] : [])];
  if (status) { countQuery += ' AND status = ?'; countBindings.push(status); }
  if (hasDebt === 'true') countQuery += ' AND current_debt > 0';
  const countResult = await env.DB.prepare(countQuery).bind(...countBindings).first() as any;

  return json({
    accounts: results,
    pagination: { page, limit, total: countResult?.total || 0, pages: Math.ceil((countResult?.total || 0) / limit) }
  });
});

// Personal Accounts: Get single
route('GET', '/api/accounts/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);

  const account = await env.DB.prepare(`
    SELECT pa.*, a.number as apt_number, a.floor, a.rooms, b.name as building_name, b.address as building_address
    FROM personal_accounts pa LEFT JOIN apartments a ON pa.apartment_id = a.id LEFT JOIN buildings b ON pa.building_id = b.id
    WHERE pa.id = ? ${tenantId ? 'AND pa.tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  if (!account) return error('Account not found', 404);
  return json({ account });
});

// Personal Accounts: Create
route('POST', '/api/accounts', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Manager access required', 403);

  const body = await request.json() as any;
  const id = generateId();
  const accountNumber = body.number || `ЛС-${Date.now().toString(36).toUpperCase()}`;

  await env.DB.prepare(`
    INSERT INTO personal_accounts (
      id, number, apartment_id, building_id, primary_owner_id,
      owner_name, apartment_number, address, total_area,
      residents_count, registered_count, balance, current_debt, penalty_amount,
      has_subsidy, subsidy_amount, subsidy_end_date,
      has_discount, discount_percent, discount_reason, status, tenant_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, accountNumber, body.apartment_id || body.apartmentId,
    body.building_id || body.buildingId, body.primary_owner_id || body.primaryOwnerId || null,
    body.owner_name || body.ownerName || null, body.apartment_number || body.apartmentNumber || null,
    body.address || null, body.total_area || body.totalArea || null,
    body.residents_count || body.residentsCount || 0, body.registered_count || body.registeredCount || 0,
    body.balance || 0, body.current_debt || body.currentDebt || 0, body.penalty_amount || body.penaltyAmount || 0,
    body.has_subsidy || body.hasSubsidy ? 1 : 0, body.subsidy_amount || body.subsidyAmount || 0,
    body.subsidy_end_date || body.subsidyEndDate || null,
    body.has_discount || body.hasDiscount ? 1 : 0, body.discount_percent || body.discountPercent || 0,
    body.discount_reason || body.discountReason || null, body.status || 'active', getTenantId(request) || null
  ).run();

  if (body.apartment_id || body.apartmentId) {
    await env.DB.prepare('UPDATE apartments SET personal_account_id = ? WHERE id = ?').bind(id, body.apartment_id || body.apartmentId).run();
  }

  const created = await env.DB.prepare('SELECT * FROM personal_accounts WHERE id = ?').bind(id).first();
  return json({ account: created }, 201);
});

// Personal Accounts: Update
route('PATCH', '/api/accounts/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Manager access required', 403);

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];
  const fieldMappings: Record<string, string> = {
    owner_name: 'owner_name', ownerName: 'owner_name', apartment_number: 'apartment_number', apartmentNumber: 'apartment_number',
    address: 'address', total_area: 'total_area', totalArea: 'total_area',
    residents_count: 'residents_count', residentsCount: 'residents_count',
    registered_count: 'registered_count', registeredCount: 'registered_count',
    balance: 'balance', current_debt: 'current_debt', currentDebt: 'current_debt',
    penalty_amount: 'penalty_amount', penaltyAmount: 'penalty_amount',
    last_payment_date: 'last_payment_date', lastPaymentDate: 'last_payment_date',
    last_payment_amount: 'last_payment_amount', lastPaymentAmount: 'last_payment_amount',
    has_subsidy: 'has_subsidy', hasSubsidy: 'has_subsidy',
    subsidy_amount: 'subsidy_amount', subsidyAmount: 'subsidy_amount',
    subsidy_end_date: 'subsidy_end_date', subsidyEndDate: 'subsidy_end_date',
    has_discount: 'has_discount', hasDiscount: 'has_discount',
    discount_percent: 'discount_percent', discountPercent: 'discount_percent',
    discount_reason: 'discount_reason', discountReason: 'discount_reason',
    status: 'status',
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

  await env.DB.prepare(`UPDATE personal_accounts SET ${updates.join(', ')} ${whereClause}`).bind(...values).run();
  const updated = await env.DB.prepare(`SELECT * FROM personal_accounts WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  return json({ account: updated });
});

// Personal Accounts: Get debtors
route('GET', '/api/accounts/debtors', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const url = new URL(request.url);
  const minDebt = parseInt(url.searchParams.get('min_debt') || '0');
  const buildingId = url.searchParams.get('building_id');
  const tenantId = getTenantId(request);

  let query = `
    SELECT pa.*, b.name as building_name FROM personal_accounts pa JOIN buildings b ON pa.building_id = b.id
    WHERE pa.current_debt > ? ${tenantId ? 'AND pa.tenant_id = ?' : ''}
  `;
  const bindings: any[] = [minDebt, ...(tenantId ? [tenantId] : [])];
  if (buildingId) { query += ' AND pa.building_id = ?'; bindings.push(buildingId); }
  query += ' ORDER BY pa.current_debt DESC LIMIT 500';

  const { results } = await env.DB.prepare(query).bind(...bindings).all();
  return json({ debtors: results });
});

} // end registerAccountRoutes
