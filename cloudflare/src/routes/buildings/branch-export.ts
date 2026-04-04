// Branch export route
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId } from '../../middleware/tenant';
import { json, error } from '../../utils/helpers';

export function registerBranchExportRoutes() {

// Branch Export — full snapshot
route('GET', '/api/branches/:id/export', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager'].includes(user.role)) {
    return error('Access denied', 403);
  }

  const tenantId = getTenantId(request);
  const branch = await env.DB.prepare(
    `SELECT * FROM branches WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!branch) return error('Branch not found', 404);

  const { results: buildings } = await env.DB.prepare(
    `SELECT * FROM buildings WHERE (branch_id = ? OR branch_code = ?) ${tenantId ? 'AND tenant_id = ?' : ''} ORDER BY name`
  ).bind(params.id, branch.code, ...(tenantId ? [tenantId] : [])).all() as any;

  const buildingIds: string[] = buildings.map((b: any) => b.id);
  const buildingsWithData: any[] = [];
  for (const building of buildings) {
    const { results: entrances } = await env.DB.prepare(
      `SELECT * FROM entrances WHERE building_id = ? ORDER BY number`
    ).bind(building.id).all() as any;
    const { results: apartments } = await env.DB.prepare(
      `SELECT * FROM apartments WHERE building_id = ? ORDER BY number`
    ).bind(building.id).all() as any;
    buildingsWithData.push({ ...building, entrances, apartments });
  }

  let residents: any[] = [];
  if (buildingIds.length > 0) {
    const ph = buildingIds.map(() => '?').join(',');
    const { results } = await env.DB.prepare(
      `SELECT * FROM users WHERE building_id IN (${ph}) AND role = 'resident' ORDER BY name LIMIT 500`
    ).bind(...buildingIds).all() as any;
    residents = results;
  }

  let staff: any[] = [];
  if (tenantId) {
    const { results } = await env.DB.prepare(
      `SELECT * FROM users WHERE tenant_id = ? AND role NOT IN ('resident','super_admin','advertiser','tenant') ORDER BY name LIMIT 500`
    ).bind(tenantId).all() as any;
    staff = results;
  } else if (buildingIds.length > 0) {
    const ph = buildingIds.map(() => '?').join(',');
    const { results } = await env.DB.prepare(
      `SELECT * FROM users WHERE building_id IN (${ph}) AND role NOT IN ('resident','super_admin') ORDER BY name LIMIT 500`
    ).bind(...buildingIds).all() as any;
    staff = results;
  }

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
