// Branch export route
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId } from '../../middleware/tenant';
import { json, error, bilingualError } from '../../utils/helpers';

// Sprint 72 P0/F2:
//  - Was using `SELECT *` on users which includes password_hash, auth_token,
//    plaintext password_plain — every export was effectively a credential
//    dump. Switched to explicit safe column list.
//  - On apex domain (tenantId === null) the users queries had NO tenant
//    filter and would happily pull staff/residents from any tenant that
//    shared the branch_code/building_id. Now: refuse the export without a
//    tenant context (super-admin can hit subdomains directly).
const USER_EXPORT_COLS = [
  'id', 'login', 'name', 'phone', 'role', 'specialization',
  'apartment', 'address', 'building_id', 'building', 'branch',
  'entrance', 'floor', 'is_active', 'created_at',
].join(', ');

export function registerBranchExportRoutes() {

// Branch Export — full snapshot
route('GET', '/api/branches/:id/export', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager'].includes(user.role)) {
    return bilingualError('Доступ запрещён', 'Kirish taqiqlangan', 403);
  }

  const tenantId = getTenantId(request);
  // Sprint 72 P0/F2: require tenant context. Without it, the users
  // queries below would skip the tenant filter and return foreign
  // tenants' rows.
  if (!tenantId) return error('Tenant context required for export', 401);

  const branch = await env.DB.prepare(
    `SELECT * FROM branches WHERE id = ? AND tenant_id = ?`
  ).bind(params.id, tenantId).first() as any;
  if (!branch) return error('Branch not found', 404);

  const { results: buildings } = await env.DB.prepare(
    `SELECT * FROM buildings WHERE (branch_id = ? OR branch_code = ?) AND tenant_id = ? ORDER BY name`
  ).bind(params.id, branch.code, tenantId).all() as any;

  const buildingIds: string[] = buildings.map((b: any) => b.id);
  const buildingsWithData: any[] = [];
  for (const building of buildings) {
    const { results: entrances } = await env.DB.prepare(
      `SELECT * FROM entrances WHERE building_id = ? AND tenant_id = ? ORDER BY number`
    ).bind(building.id, tenantId).all() as any;
    const { results: apartments } = await env.DB.prepare(
      `SELECT * FROM apartments WHERE building_id = ? AND tenant_id = ? ORDER BY number`
    ).bind(building.id, tenantId).all() as any;
    buildingsWithData.push({ ...building, entrances, apartments });
  }

  let residents: any[] = [];
  if (buildingIds.length > 0) {
    const ph = buildingIds.map(() => '?').join(',');
    const { results } = await env.DB.prepare(
      `SELECT ${USER_EXPORT_COLS} FROM users WHERE building_id IN (${ph}) AND role = 'resident' AND tenant_id = ? ORDER BY name LIMIT 500`
    ).bind(...buildingIds, tenantId).all() as any;
    residents = results;
  }

  const { results: staffRows } = await env.DB.prepare(
    `SELECT ${USER_EXPORT_COLS} FROM users WHERE tenant_id = ? AND role NOT IN ('resident','super_admin','advertiser','tenant') ORDER BY name LIMIT 500`
  ).bind(tenantId).all() as any;
  const staff: any[] = staffRows;

  return json({
    version: '1.0',
    exported_at: new Date().toISOString(),
    branch,
    buildings: buildingsWithData,
    residents,
    staff,
  });
});

} // end registerBranchExportRoutes
