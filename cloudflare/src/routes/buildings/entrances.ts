// Entrances + building documents routes
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId } from '../../middleware/tenant';
import { json, error, generateId, isManagement } from '../../utils/helpers';

export function registerEntranceRoutes() {

// Entrances: List by building
route('GET', '/api/buildings/:buildingId/entrances', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);

  const { results } = await env.DB.prepare(`
    SELECT e.*,
      (SELECT COUNT(*) FROM apartments WHERE building_id = e.building_id AND entrance_id = e.id ${tenantId ? 'AND tenant_id = ?' : ''}) as apartments_count
    FROM entrances e
    WHERE e.building_id = ? ${tenantId ? 'AND e.tenant_id = ?' : ''}
    ORDER BY e.number
  `).bind(...(tenantId ? [tenantId] : []), params.buildingId, ...(tenantId ? [tenantId] : [])).all();
  return json({ entrances: results });
});

// Entrances: Create
route('POST', '/api/buildings/:buildingId/entrances', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Manager access required', 403);

  const body = await request.json() as any;
  const id = generateId();

  try {
    await env.DB.prepare(`
      INSERT INTO entrances (
        id, building_id, number, floors_from, floors_to, apartments_from, apartments_to,
        has_elevator, elevator_id, intercom_type, intercom_code, cleaning_schedule, responsible_id, notes, tenant_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, params.buildingId, body.number,
      body.floors_from || body.floorsFrom || 1, body.floors_to || body.floorsTo || null,
      body.apartments_from || body.apartmentsFrom || null, body.apartments_to || body.apartmentsTo || null,
      body.has_elevator || body.hasElevator ? 1 : 0, body.elevator_id || body.elevatorId || null,
      body.intercom_type || body.intercomType || null, body.intercom_code || body.intercomCode || null,
      body.cleaning_schedule || body.cleaningSchedule || null,
      body.responsible_id || body.responsibleId || null, body.notes || null, getTenantId(request)
    ).run();
  } catch (e: any) {
    if (e.message?.includes('UNIQUE constraint')) {
      return error(`Подъезд №${body.number} уже существует в этом здании`, 409);
    }
    throw e;
  }

  const created = await env.DB.prepare('SELECT * FROM entrances WHERE id = ?').bind(id).first();
  return json({ entrance: created }, 201);
});

// Entrances: Update
route('PATCH', '/api/entrances/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Manager access required', 403);

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  const fieldMappings: Record<string, string> = {
    number: 'number',
    floors_from: 'floors_from', floorsFrom: 'floors_from',
    floors_to: 'floors_to', floorsTo: 'floors_to',
    apartments_from: 'apartments_from', apartmentsFrom: 'apartments_from',
    apartments_to: 'apartments_to', apartmentsTo: 'apartments_to',
    has_elevator: 'has_elevator', hasElevator: 'has_elevator',
    elevator_id: 'elevator_id', elevatorId: 'elevator_id',
    intercom_type: 'intercom_type', intercomType: 'intercom_type',
    intercom_code: 'intercom_code', intercomCode: 'intercom_code',
    cleaning_schedule: 'cleaning_schedule', cleaningSchedule: 'cleaning_schedule',
    responsible_id: 'responsible_id', responsibleId: 'responsible_id',
    last_inspection: 'last_inspection', lastInspection: 'last_inspection',
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
  values.push(params.id);
  const tenantIdUpd = getTenantId(request);

  const updateResult = await env.DB.prepare(
    `UPDATE entrances SET ${updates.join(', ')} WHERE id = ? ${tenantIdUpd ? 'AND tenant_id = ?' : ''}`
  ).bind(...values, ...(tenantIdUpd ? [tenantIdUpd] : [])).run();

  if (!updateResult.meta?.changes) return error('Подъезд не найден или нет доступа', 404);

  const updated = await env.DB.prepare('SELECT * FROM entrances WHERE id = ?').bind(params.id).first() as any;

  // If apartment range or floors changed, auto-generate apartments
  const rangeChanged = body.apartments_from !== undefined || body.apartments_to !== undefined ||
    body.apartmentsFrom !== undefined || body.apartmentsTo !== undefined ||
    body.floors_from !== undefined || body.floors_to !== undefined ||
    body.floorsFrom !== undefined || body.floorsTo !== undefined;

  if (rangeChanged && updated && updated.building_id) {
    const floorsFrom = updated.floors_from || 1;
    const floorsTo = updated.floors_to || 9;
    const aptsFrom = updated.apartments_from || 1;
    const aptsTo = updated.apartments_to || 36;
    const totalApts = aptsTo - aptsFrom + 1;
    const totalFloors = floorsTo - floorsFrom + 1;
    const aptsPerFloor = Math.ceil(totalApts / totalFloors);
    const aptData: Array<{ number: string; floor: number }> = [];
    let aptNum = aptsFrom;
    for (let floor = floorsFrom; floor <= floorsTo && aptNum <= aptsTo; floor++) {
      for (let i = 0; i < aptsPerFloor && aptNum <= aptsTo; i++) {
        aptData.push({ number: String(aptNum), floor });
        aptNum++;
      }
    }
    if (aptData.length > 0) {
      for (let i = 0; i < aptData.length; i += 50) {
        const batch = aptData.slice(i, i + 50);
        const stmts = batch.map((apt) =>
          env.DB.prepare(
            `INSERT OR IGNORE INTO apartments (id, building_id, entrance_id, number, floor, status, tenant_id)
             VALUES (?, ?, ?, ?, ?, 'occupied', ?)`
          ).bind(generateId(), updated.building_id, params.id, apt.number, apt.floor, tenantIdUpd)
        );
        await env.DB.batch(stmts);
      }
    }
  }

  return json({ entrance: updated });
});

// Entrances: Delete
route('DELETE', '/api/entrances/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Manager access required', 403);
  const tenantIdDel = getTenantId(request);
  await env.DB.prepare(`DELETE FROM entrances WHERE id = ? ${tenantIdDel ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantIdDel ? [tenantIdDel] : [])).run();
  return json({ success: true });
});

// Building Documents: List
route('GET', '/api/buildings/:buildingId/documents', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);
  const { results } = await env.DB.prepare(
    `SELECT * FROM building_documents WHERE building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''} ORDER BY uploaded_at DESC LIMIT 500`
  ).bind(params.buildingId, ...(tenantId ? [tenantId] : [])).all();
  return json({ documents: results });
});

// Building Documents: Create
route('POST', '/api/buildings/:buildingId/documents', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Manager access required', 403);
  const body = await request.json() as any;
  const id = generateId();
  const tenantId = getTenantId(request);

  await env.DB.prepare(`
    INSERT INTO building_documents (id, building_id, name, type, file_url, file_size, uploaded_by, expires_at, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, params.buildingId, body.name, body.type || 'other', body.file_url || body.fileUrl,
    body.file_size || body.fileSize || 0, authUser!.id, body.expires_at || body.expiresAt || null, tenantId).run();

  const created = await env.DB.prepare(
    `SELECT * FROM building_documents WHERE id = ?${tenantId ? ' AND tenant_id = ?' : ''}`
  ).bind(id, ...(tenantId ? [tenantId] : [])).first();
  return json({ document: created }, 201);
});

// Building Documents: Delete
route('DELETE', '/api/building-documents/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Manager access required', 403);
  const tenantIdDel = getTenantId(request);
  await env.DB.prepare(`DELETE FROM building_documents WHERE id = ? ${tenantIdDel ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantIdDel ? [tenantIdDel] : [])).run();
  return json({ success: true });
});

} // end registerEntranceRoutes
