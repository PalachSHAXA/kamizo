// Debt reports route
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { json, error, isManagement } from '../../utils/helpers';

export function registerDebtReportRoutes() {

// Reports: Debts
route('GET', '/api/reports/debts', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Manager access required', 403);
  const fc = await requireFeature('reports', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const tenantId = getTenantId(request);
  const url = new URL(request.url);
  const buildingId = url.searchParams.get('building_id');
  const district = url.searchParams.get('district');
  const search = url.searchParams.get('search')?.trim().toLowerCase();
  const debtorsOnly = url.searchParams.get('debtors_only') === 'true';
  const sortBy = url.searchParams.get('sort_by') || 'debt';
  const sortDir = url.searchParams.get('sort_dir') === 'asc' ? 'ASC' : 'DESC';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '1000'), 2000);
  const offset = parseInt(url.searchParams.get('offset') || '0');

  const conditions: string[] = ["u.role = 'resident'", "u.building_id IS NOT NULL", "u.apartment IS NOT NULL"];
  const bindings: any[] = [];
  if (tenantId) { conditions.push('u.tenant_id = ?'); bindings.push(tenantId); }
  if (buildingId) { conditions.push('u.building_id = ?'); bindings.push(buildingId); }
  if (district) { conditions.push('br.district = ?'); bindings.push(district); }
  if (debtorsOnly) conditions.push('COALESCE(pa.current_debt, 0) > 0');

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const orderMap: Record<string, string> = {
    debt: `COALESCE(pa.current_debt, 0) ${sortDir}`,
    name: `u.name ${sortDir}`,
    apartment: `u.apartment ${sortDir}`,
  };
  const orderBy = orderMap[sortBy] || orderMap['debt'];
  const paJoinTenant = tenantId ? 'AND pa.tenant_id = ?' : '';

  const query = `
    SELECT u.id AS resident_id, u.name AS resident_name, u.phone AS resident_phone,
      u.apartment AS apartment_number, u.entrance, u.floor, u.building_id,
      b.name AS building_name, b.address AS building_address, b.collection_rate AS tariff,
      br.id AS branch_id, br.name AS branch_name, br.district,
      pa.id AS account_id, pa.number AS account_number,
      COALESCE(pa.balance, 0) AS balance, COALESCE(pa.current_debt, 0) AS current_debt,
      pa.last_payment_date, pa.last_payment_amount, COALESCE(pa.status, 'active') AS account_status
    FROM users u JOIN buildings b ON u.building_id = b.id
    LEFT JOIN branches br ON b.branch_id = br.id
    LEFT JOIN personal_accounts pa ON pa.building_id = u.building_id
      AND pa.apartment_number = u.apartment ${paJoinTenant}
    ${whereClause} ORDER BY ${orderBy} LIMIT ? OFFSET ?
  `;

  const finalBindings: any[] = [];
  if (tenantId) finalBindings.push(tenantId);
  finalBindings.push(...bindings);
  finalBindings.push(limit, offset);

  const { results } = await env.DB.prepare(query).bind(...finalBindings).all();

  let filtered = results as any[];
  if (search) {
    filtered = filtered.filter(r =>
      (r.resident_name || '').toLowerCase().includes(search) ||
      (r.apartment_number || '').toLowerCase().includes(search) ||
      (r.account_number || '').toLowerCase().includes(search)
    );
  }

  const totalDebt = filtered.reduce((s: number, r: any) => s + (r.current_debt || 0), 0);
  const totalBalance = filtered.reduce((s: number, r: any) => s + (r.balance || 0), 0);
  const debtorCount = filtered.filter((r: any) => (r.current_debt || 0) > 0).length;

  return json({
    records: filtered,
    total: filtered.length,
    summary: { totalDebt, totalBalance, debtorCount },
  });
});

} // end registerDebtReportRoutes
