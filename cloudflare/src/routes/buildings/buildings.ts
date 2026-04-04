// Buildings CRUD + stats routes
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId } from '../../middleware/tenant';
import { cachedQueryWithArgs, invalidateOnChange, CacheTTL, CachePrefix } from '../../cache';
import { json, error, generateId, isManagement, getPaginationParams, createPaginatedResponse } from '../../utils/helpers';
import { validateBody } from '../../validation/validate';
import { createBuildingSchema } from '../../validation/schemas';

export function registerBuildingCrudRoutes() {

// Buildings: List all with stats
route('GET', '/api/buildings', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const url = new URL(request.url);
  const branchCode = url.searchParams.get('branch_code');
  const search = url.searchParams.get('search')?.toLowerCase();
  const pagination = getPaginationParams(url);
  const tenantId = getTenantId(request);

  let whereClause = 'WHERE 1=1';
  const bindValues: any[] = [];

  if (tenantId) { whereClause += ` AND b.tenant_id = ?`; bindValues.push(tenantId); }
  if (branchCode) { whereClause += ` AND b.branch_code = ?`; bindValues.push(branchCode); }
  if (search) {
    whereClause += ` AND (LOWER(b.name) LIKE ? OR LOWER(b.address) LIKE ?)`;
    const searchPattern = `%${search}%`;
    bindValues.push(searchPattern, searchPattern);
  }

  const countQuery = `SELECT COUNT(*) as total FROM buildings b ${whereClause}`;
  const countStmt = env.DB.prepare(countQuery);
  const { total } = bindValues.length > 0
    ? await countStmt.bind(...bindValues).first() as any
    : await countStmt.first() as any;

  const offset = ((pagination.page || 1) - 1) * (pagination.limit || 50);

  // First: get paginated building IDs
  const idsQuery = `SELECT b.id FROM buildings b ${whereClause} ORDER BY b.name LIMIT ? OFFSET ?`;
  const { results: idRows } = await env.DB.prepare(idsQuery).bind(...bindValues, pagination.limit, offset).all();
  const buildingIds = (idRows || []).map((r: any) => r.id);

  if (buildingIds.length === 0) {
    const response = createPaginatedResponse([], total || 0, pagination);
    return json({ buildings: response.data, pagination: response.pagination });
  }

  const placeholders = buildingIds.map(() => '?').join(',');
  const tenantFilter = tenantId ? ' AND tenant_id = ?' : '';
  const tenantBinds = tenantId ? [tenantId] : [];

  // Batch COUNT queries using GROUP BY instead of per-row subqueries
  const [residentsAgg, entrancesAgg, apartmentsAgg, activeReqAgg, buildingsData] = await Promise.all([
    env.DB.prepare(`SELECT building_id, COUNT(*) as cnt FROM users WHERE building_id IN (${placeholders}) AND role = 'resident'${tenantFilter} GROUP BY building_id`).bind(...buildingIds, ...tenantBinds).all(),
    env.DB.prepare(`SELECT building_id, COUNT(*) as cnt FROM entrances WHERE building_id IN (${placeholders})${tenantFilter} GROUP BY building_id`).bind(...buildingIds, ...tenantBinds).all(),
    env.DB.prepare(`SELECT building_id, COUNT(*) as cnt FROM apartments WHERE building_id IN (${placeholders})${tenantFilter} GROUP BY building_id`).bind(...buildingIds, ...tenantBinds).all(),
    env.DB.prepare(`SELECT u.building_id, COUNT(*) as cnt FROM requests r JOIN users u ON u.id = r.resident_id WHERE u.building_id IN (${placeholders}) AND r.status NOT IN ('completed','cancelled','closed')${tenantFilter ? ' AND r.tenant_id = ?' : ''} GROUP BY u.building_id`).bind(...buildingIds, ...tenantBinds).all(),
    env.DB.prepare(`SELECT b.*, br.code as branch_code_from_branch, br.name as branch_name FROM buildings b LEFT JOIN branches br ON b.branch_id = br.id WHERE b.id IN (${placeholders}) ORDER BY b.name`).bind(...buildingIds).all(),
  ]);

  // Build lookup maps
  const toMap = (rows: any[]) => { const m = new Map<string, number>(); for (const r of rows) m.set(r.building_id, r.cnt); return m; };
  const residentsMap = toMap(residentsAgg.results || []);
  const entrancesMap = toMap(entrancesAgg.results || []);
  const apartmentsMap = toMap(apartmentsAgg.results || []);
  const activeReqMap = toMap(activeReqAgg.results || []);

  const results = ((buildingsData.results || []) as any[]).map((b: any) => ({
    ...b,
    residents_count: residentsMap.get(b.id) || 0,
    entrances_actual: entrancesMap.get(b.id) || 0,
    apartments_actual: apartmentsMap.get(b.id) || 0,
    active_requests_count: activeReqMap.get(b.id) || 0,
  }));

  const response = createPaginatedResponse(results, total || 0, pagination);
  return json({ buildings: response.data, pagination: response.pagination });
});

// Buildings: Get single with full details
route('GET', '/api/buildings/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);

  const data = await cachedQueryWithArgs(
    CachePrefix.BUILDING, CacheTTL.BUILDING_STATS,
    [params.id, tenantId || 'no-tenant'],
    async (buildingId: string, _tenantKey: string) => {
      const building = await env.DB.prepare(`
        SELECT b.*,
          (SELECT COUNT(*) FROM users WHERE building_id = b.id AND role = 'resident' ${tenantId ? 'AND tenant_id = ?' : ''}) as residents_count,
          (SELECT COUNT(*) FROM entrances WHERE building_id = b.id ${tenantId ? 'AND tenant_id = ?' : ''}) as entrances_actual,
          (SELECT COUNT(*) FROM apartments WHERE building_id = b.id ${tenantId ? 'AND tenant_id = ?' : ''}) as apartments_actual,
          (SELECT COUNT(*) FROM requests WHERE resident_id IN (SELECT id FROM users WHERE building_id = b.id ${tenantId ? 'AND tenant_id = ?' : ''}) AND status NOT IN ('completed', 'cancelled', 'closed') ${tenantId ? 'AND tenant_id = ?' : ''}) as active_requests_count
        FROM buildings b WHERE b.id = ? ${tenantId ? 'AND b.tenant_id = ?' : ''}
      `).bind(...(tenantId ? [tenantId, tenantId, tenantId, tenantId, tenantId] : []), buildingId, ...(tenantId ? [tenantId] : [])).first();
      if (!building) return null;

      const { results: entrances } = await env.DB.prepare(
        `SELECT * FROM entrances WHERE building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''} ORDER BY number`
      ).bind(buildingId, ...(tenantId ? [tenantId] : [])).all();

      let documents: any[] = [];
      try {
        const docsResult = await env.DB.prepare(
          `SELECT * FROM building_documents WHERE building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
        ).bind(buildingId, ...(tenantId ? [tenantId] : [])).all();
        documents = docsResult.results;
      } catch (e) {}

      return { building, entrances, documents };
    },
    env.RATE_LIMITER
  );

  if (!data || !data.building) return error('Building not found', 404);
  return json(data);
});

// Buildings: Create
route('POST', '/api/buildings', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Manager access required', 403);

  const { data: body, errors: validationErrors } = await validateBody(request, createBuildingSchema);
  if (validationErrors) return error(validationErrors, 400);
  const id = generateId();

  await env.DB.prepare(`
    INSERT INTO buildings (
      id, name, address, zone, cadastral_number, branch_code, building_number, branch_id,
      floors, entrances_count, apartments_count, total_area, living_area, common_area, land_area,
      year_built, year_renovated, building_type, roof_type, wall_material, foundation_type,
      has_elevator, elevator_count, has_gas, heating_type, has_hot_water, water_supply_type, sewerage_type,
      has_intercom, has_video_surveillance, has_concierge, has_parking_lot, parking_spaces, has_playground,
      manager_id, manager_name, management_start_date, contract_number, contract_end_date,
      monthly_budget, reserve_fund, total_debt, collection_rate,
      latitude, longitude, tenant_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, body.name, body.address, body.zone || null,
    body.cadastral_number || body.cadastralNumber || null,
    body.branch_code || body.branchCode || 'YS',
    body.building_number || body.buildingNumber || null,
    body.branch_id || body.branchId || null,
    body.floors || null, body.entrances_count || body.entrances || 1,
    body.apartments_count || body.totalApartments || null,
    body.total_area || body.totalArea || null, body.living_area || body.livingArea || null,
    body.common_area || body.commonArea || null, body.land_area || body.landArea || null,
    body.year_built || body.yearBuilt || null, body.year_renovated || body.yearRenovated || null,
    body.building_type || body.buildingType || 'monolith',
    body.roof_type || body.roofType || 'flat',
    body.wall_material || body.wallMaterial || null, body.foundation_type || body.foundationType || null,
    body.has_elevator || body.hasElevator ? 1 : 0, body.elevator_count || body.elevatorCount || 0,
    body.has_gas || body.hasGas ? 1 : 0, body.heating_type || body.heatingType || 'central',
    body.has_hot_water || body.hasHotWater ? 1 : 0,
    body.water_supply_type || body.waterSupplyType || 'central',
    body.sewerage_type || body.sewerageType || 'central',
    body.has_intercom || body.hasIntercom ? 1 : 0,
    body.has_video_surveillance || body.hasVideoSurveillance ? 1 : 0,
    body.has_concierge || body.hasConcierge ? 1 : 0,
    body.has_parking_lot || body.hasParkingLot ? 1 : 0,
    body.parking_spaces || body.parkingSpaces || 0,
    body.has_playground || body.hasPlayground ? 1 : 0,
    body.manager_id || body.managerId || null, body.manager_name || body.managerName || null,
    body.management_start_date || body.managementStartDate || null,
    body.contract_number || body.contractNumber || null,
    body.contract_end_date || body.contractEndDate || null,
    body.monthly_budget || body.monthlyBudget || 0, body.reserve_fund || body.reserveFund || 0,
    body.total_debt || body.totalDebt || 0, body.collection_rate || body.collectionRate || 0,
    body.latitude || null, body.longitude || null, getTenantId(request)
  ).run();

  await invalidateOnChange('buildings', env.RATE_LIMITER);
  const tenantId = getTenantId(request);
  const created = await env.DB.prepare(`SELECT * FROM buildings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(id, ...(tenantId ? [tenantId] : [])).first();
  return json({ building: created }, 201);
});

} // end registerBuildingCrudRoutes
