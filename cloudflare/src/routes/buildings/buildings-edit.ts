// Buildings update + delete routes
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId } from '../../middleware/tenant';
import { invalidateOnChange } from '../../cache';
import { json, error, isManagement } from '../../utils/helpers';

export function registerBuildingEditRoutes() {

// Buildings: Update
route('PATCH', '/api/buildings/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Manager access required', 403);

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  const fieldMappings: Record<string, string> = {
    name: 'name', address: 'address', zone: 'zone',
    cadastral_number: 'cadastral_number', cadastralNumber: 'cadastral_number',
    branch_code: 'branch_code', branchCode: 'branch_code',
    building_number: 'building_number', buildingNumber: 'building_number',
    floors: 'floors', entrances_count: 'entrances_count', entrances: 'entrances_count',
    apartments_count: 'apartments_count', totalApartments: 'apartments_count',
    total_area: 'total_area', totalArea: 'total_area',
    living_area: 'living_area', livingArea: 'living_area',
    common_area: 'common_area', commonArea: 'common_area',
    land_area: 'land_area', landArea: 'land_area',
    year_built: 'year_built', yearBuilt: 'year_built',
    year_renovated: 'year_renovated', yearRenovated: 'year_renovated',
    building_type: 'building_type', buildingType: 'building_type',
    roof_type: 'roof_type', roofType: 'roof_type',
    wall_material: 'wall_material', wallMaterial: 'wall_material',
    foundation_type: 'foundation_type', foundationType: 'foundation_type',
    has_elevator: 'has_elevator', hasElevator: 'has_elevator',
    elevator_count: 'elevator_count', elevatorCount: 'elevator_count',
    has_gas: 'has_gas', hasGas: 'has_gas',
    heating_type: 'heating_type', heatingType: 'heating_type',
    has_hot_water: 'has_hot_water', hasHotWater: 'has_hot_water',
    water_supply_type: 'water_supply_type', waterSupplyType: 'water_supply_type',
    sewerage_type: 'sewerage_type', sewerageType: 'sewerage_type',
    has_intercom: 'has_intercom', hasIntercom: 'has_intercom',
    has_video_surveillance: 'has_video_surveillance', hasVideoSurveillance: 'has_video_surveillance',
    has_concierge: 'has_concierge', hasConcierge: 'has_concierge',
    has_parking_lot: 'has_parking_lot', hasParkingLot: 'has_parking_lot',
    parking_spaces: 'parking_spaces', parkingSpaces: 'parking_spaces',
    has_playground: 'has_playground', hasPlayground: 'has_playground',
    manager_id: 'manager_id', managerId: 'manager_id',
    manager_name: 'manager_name', managerName: 'manager_name',
    management_start_date: 'management_start_date', managementStartDate: 'management_start_date',
    contract_number: 'contract_number', contractNumber: 'contract_number',
    contract_end_date: 'contract_end_date', contractEndDate: 'contract_end_date',
    monthly_budget: 'monthly_budget', monthlyBudget: 'monthly_budget',
    reserve_fund: 'reserve_fund', reserveFund: 'reserve_fund',
    total_debt: 'total_debt', totalDebt: 'total_debt',
    collection_rate: 'collection_rate', collectionRate: 'collection_rate',
    latitude: 'latitude', longitude: 'longitude',
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
  values.push(params.id);
  const tenantId = getTenantId(request);
  if (tenantId) values.push(tenantId);

  await env.DB.prepare(
    `UPDATE buildings SET ${updates.join(', ')} WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(...values).run();

  await invalidateOnChange('buildings', env.RATE_LIMITER);
  const updated = await env.DB.prepare(
    `SELECT * FROM buildings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  return json({ building: updated });
});

// Buildings: Delete
route('DELETE', '/api/buildings/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Manager access required', 403);

  const buildingId = params.id;
  const tenantId = getTenantId(request);

  await env.DB.prepare(`UPDATE users SET building_id = NULL WHERE building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(buildingId, ...(tenantId ? [tenantId] : [])).run();
  await env.DB.prepare(`UPDATE announcements SET target_building_id = NULL WHERE target_building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(buildingId, ...(tenantId ? [tenantId] : [])).run();
  await env.DB.prepare(`DELETE FROM chat_channels WHERE building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(buildingId, ...(tenantId ? [tenantId] : [])).run();
  await env.DB.prepare(`DELETE FROM executor_zones WHERE building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(buildingId, ...(tenantId ? [tenantId] : [])).run();
  await env.DB.prepare(`DELETE FROM meeting_voting_units WHERE building_id = ?`).bind(buildingId).run();
  await env.DB.prepare(`DELETE FROM meeting_building_settings WHERE building_id = ?`).bind(buildingId).run();
  await env.DB.prepare(`DELETE FROM buildings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(buildingId, ...(tenantId ? [tenantId] : [])).run();

  await invalidateOnChange('buildings', env.RATE_LIMITER);
  return json({ success: true });
});

} // end registerBuildingEditRoutes
