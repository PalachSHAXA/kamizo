// Apartments create/update/delete routes
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId } from '../../middleware/tenant';
import { json, error, generateId, isManagement } from '../../utils/helpers';

export function registerApartmentEditRoutes() {

// Apartments: Bulk Create
route('POST', '/api/buildings/:buildingId/apartments/bulk', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Manager access required', 403);

  const body = await request.json() as any;
  const apartments = body.apartments;
  if (!Array.isArray(apartments) || apartments.length === 0) return error('apartments array is required', 400);
  if (apartments.length > 1000) return error('Maximum 1000 apartments per batch', 400);

  const tenantId = getTenantId(request);
  let createdCount = 0;
  const errors: string[] = [];

  for (let i = 0; i < apartments.length; i += 50) {
    const batch = apartments.slice(i, i + 50);
    const stmts = batch.map((apt: any) => {
      const id = generateId();
      return env.DB.prepare(`
        INSERT OR IGNORE INTO apartments (id, building_id, entrance_id, number, floor, status, is_commercial, tenant_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(id, params.buildingId, apt.entrance_id || null, String(apt.number), apt.floor || null,
        apt.status || 'occupied', apt.is_commercial ? 1 : 0, tenantId);
    });
    try {
      const results = await env.DB.batch(stmts);
      for (const r of results) { if (r.meta?.changes && r.meta.changes > 0) createdCount++; }
    } catch (e: any) { errors.push(`Batch ${Math.floor(i / 50) + 1}: ${e.message}`); }
  }

  return json({ created: createdCount, total: apartments.length, errors: errors.length > 0 ? errors : undefined }, 201);
});

// Apartments: Create (single)
route('POST', '/api/buildings/:buildingId/apartments', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Manager access required', 403);

  const body = await request.json() as any;
  const tenantId = getTenantId(request);

  const existing = await env.DB.prepare(
    `SELECT id, entrance_id FROM apartments WHERE building_id = ? AND number = ?${tenantId ? ' AND tenant_id = ?' : ''}`
  ).bind(params.buildingId, String(body.number), ...(tenantId ? [tenantId] : [])).first();

  if (existing) {
    const newEntranceId = body.entrance_id || body.entranceId || null;
    if (newEntranceId && existing.entrance_id !== newEntranceId) {
      await env.DB.prepare(
        `UPDATE apartments SET entrance_id = ? WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
      ).bind(newEntranceId, existing.id, ...(tenantId ? [tenantId] : [])).run();
      const updated = await env.DB.prepare(
        `SELECT * FROM apartments WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
      ).bind(existing.id, ...(tenantId ? [tenantId] : [])).first();
      return json({ apartment: updated, updated: true });
    }
    return error(`Квартира №${body.number} уже существует в этом доме`, 409);
  }

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO apartments (
      id, building_id, entrance_id, number, floor,
      total_area, living_area, kitchen_area, balcony_area, rooms,
      has_balcony, has_loggia, ceiling_height, window_view,
      ownership_type, ownership_share, cadastral_number,
      status, is_commercial, property_type, primary_owner_id, personal_account_id, tenant_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, params.buildingId, body.entrance_id || body.entranceId || null, body.number, body.floor || null,
    body.total_area || body.totalArea || null, body.living_area || body.livingArea || null,
    body.kitchen_area || body.kitchenArea || null, body.balcony_area || body.balconyArea || null, body.rooms || null,
    body.has_balcony || body.hasBalcony ? 1 : 0, body.has_loggia || body.hasLoggia ? 1 : 0,
    body.ceiling_height || body.ceilingHeight || null, body.window_view || body.windowView || null,
    body.ownership_type || body.ownershipType || 'private', body.ownership_share || body.ownershipShare || 1.0,
    body.cadastral_number || body.cadastralNumber || null,
    body.status || 'occupied', body.is_commercial || body.isCommercial ? 1 : 0,
    body.property_type || (body.is_commercial || body.isCommercial ? 'non_commercial' : 'commercial'),
    body.primary_owner_id || body.primaryOwnerId || null,
    body.personal_account_id || body.personalAccountId || null, getTenantId(request)
  ).run();

  const created = await env.DB.prepare(
    `SELECT * FROM apartments WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(id, ...(tenantId ? [tenantId] : [])).first();
  return json({ apartment: created }, 201);
});

// Apartments: Update
route('PATCH', '/api/apartments/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Manager access required', 403);

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];
  const fieldMappings: Record<string, string> = {
    entrance_id: 'entrance_id', entranceId: 'entrance_id', number: 'number', floor: 'floor',
    total_area: 'total_area', totalArea: 'total_area', living_area: 'living_area', livingArea: 'living_area',
    kitchen_area: 'kitchen_area', kitchenArea: 'kitchen_area', balcony_area: 'balcony_area', balconyArea: 'balcony_area',
    rooms: 'rooms', has_balcony: 'has_balcony', hasBalcony: 'has_balcony',
    has_loggia: 'has_loggia', hasLoggia: 'has_loggia',
    ceiling_height: 'ceiling_height', ceilingHeight: 'ceiling_height',
    window_view: 'window_view', windowView: 'window_view',
    ownership_type: 'ownership_type', ownershipType: 'ownership_type',
    ownership_share: 'ownership_share', ownershipShare: 'ownership_share',
    cadastral_number: 'cadastral_number', cadastralNumber: 'cadastral_number',
    status: 'status', is_commercial: 'is_commercial', isCommercial: 'is_commercial',
    property_type: 'property_type',
    primary_owner_id: 'primary_owner_id', primaryOwnerId: 'primary_owner_id',
    personal_account_id: 'personal_account_id', personalAccountId: 'personal_account_id',
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
  const tenantIdUpd = getTenantId(request);

  await env.DB.prepare(
    `UPDATE apartments SET ${updates.join(', ')} WHERE id = ? ${tenantIdUpd ? 'AND tenant_id = ?' : ''}`
  ).bind(...values, ...(tenantIdUpd ? [tenantIdUpd] : [])).run();
  const updated = await env.DB.prepare(
    `SELECT * FROM apartments WHERE id = ? ${tenantIdUpd ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantIdUpd ? [tenantIdUpd] : [])).first();
  return json({ apartment: updated });
});

// Apartments: Delete
route('DELETE', '/api/apartments/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Manager access required', 403);
  const tenantIdDel = getTenantId(request);
  await env.DB.prepare(
    `DELETE FROM apartments WHERE id = ? ${tenantIdDel ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantIdDel ? [tenantIdDel] : [])).run();
  return json({ success: true });
});

} // end registerApartmentEditRoutes
