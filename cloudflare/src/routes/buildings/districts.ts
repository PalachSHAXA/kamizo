// Districts routes (cascade delete, unlink)
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId } from '../../middleware/tenant';
import { json, error, isManagement } from '../../utils/helpers';

export function registerDistrictRoutes() {

// Districts: Cascade Delete (delete entire hierarchy)
route('DELETE', '/api/districts/cascade', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Manager access required', 403);

  const url = new URL(request.url);
  const name = url.searchParams.get('name');
  if (!name) return error('District name is required', 400);

  const tenantId = getTenantId(request);
  const tq = tenantId ? ' AND tenant_id = ?' : '';
  const tb = (col: string) => tenantId ? ` AND ${col} = ?` : '';

  const branchRows = await env.DB.prepare(
    `SELECT id FROM branches WHERE district = ?${tq}`
  ).bind(name, ...(tenantId ? [tenantId] : [])).all();
  const branchIds = (branchRows.results as any[]).map(r => r.id as string);

  if (branchIds.length === 0) {
    return json({ success: true, deleted: { branches: 0, buildings: 0, residents: 0 } });
  }

  const branchPlaceholders = branchIds.map(() => '?').join(',');

  const buildingRows = await env.DB.prepare(
    `SELECT id FROM buildings WHERE branch_id IN (${branchPlaceholders})${tb('tenant_id')}`
  ).bind(...branchIds, ...(tenantId ? [tenantId] : [])).all();
  const buildingIds = (buildingRows.results as any[]).map(r => r.id as string);
  const buildingPlaceholders = buildingIds.length > 0 ? buildingIds.map(() => '?').join(',') : null;

  const statements: any[] = [];

  if (buildingIds.length > 0) {
    statements.push(
      env.DB.prepare(
        `DELETE FROM users WHERE role = 'resident' AND building_id IN (${buildingPlaceholders!})${tb('tenant_id')}`
      ).bind(...buildingIds, ...(tenantId ? [tenantId] : []))
    );
    statements.push(
      env.DB.prepare(
        `DELETE FROM chat_channels WHERE building_id IN (${buildingPlaceholders!})${tb('tenant_id')}`
      ).bind(...buildingIds, ...(tenantId ? [tenantId] : []))
    );
    statements.push(
      env.DB.prepare(
        `DELETE FROM executor_zones WHERE building_id IN (${buildingPlaceholders!})${tb('tenant_id')}`
      ).bind(...buildingIds, ...(tenantId ? [tenantId] : []))
    );
    statements.push(
      env.DB.prepare(
        `UPDATE announcements SET target_building_id = NULL WHERE target_building_id IN (${buildingPlaceholders!})${tb('tenant_id')}`
      ).bind(...buildingIds, ...(tenantId ? [tenantId] : []))
    );
    statements.push(
      env.DB.prepare(
        `DELETE FROM buildings WHERE id IN (${buildingPlaceholders!})${tb('tenant_id')}`
      ).bind(...buildingIds, ...(tenantId ? [tenantId] : []))
    );
  }

  statements.push(
    env.DB.prepare(
      `DELETE FROM branches WHERE district = ?${tq}`
    ).bind(name, ...(tenantId ? [tenantId] : []))
  );

  await env.DB.batch(statements);

  return json({
    success: true,
    deleted: { branches: branchIds.length, buildings: buildingIds.length },
  });
});

// Districts: Delete (unlink all branches from a district)
route('DELETE', '/api/districts', async (request, env) => {
  const user = await getUser(request, env);
  if (!isManagement(user)) return error('Manager access required', 403);

  const url = new URL(request.url);
  const name = url.searchParams.get('name');
  if (!name) return error('District name is required', 400);

  const tenantId = getTenantId(request);

  const blockers = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM branches
     WHERE district = ? ${tenantId ? 'AND tenant_id = ?' : ''}
     AND (buildings_count > 0 OR residents_count > 0)`
  ).bind(name, ...(tenantId ? [tenantId] : [])).first() as any;

  if (blockers?.count > 0) {
    return error(
      `Невозможно удалить: в районе есть здания или жители. Сначала удалите или перенесите все жилые комплексы.`,
      409
    );
  }

  await env.DB.prepare(
    `UPDATE branches SET district = NULL, updated_at = datetime('now')
     WHERE district = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(name, ...(tenantId ? [tenantId] : [])).run();

  return json({ success: true });
});

} // end registerDistrictRoutes
