// Meter readings routes
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { requireFeature, getTenantId } from '../../middleware/tenant';
import { json, error, generateId, isManagement } from '../../utils/helpers';
import { isExecutorRole } from '../../index';

export function registerMeterReadingRoutes() {

// Meter Readings: List by meter
route('GET', '/api/meters/:meterId/readings', async (request, env, params) => {
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const status = url.searchParams.get('status');

  const tenantId = getTenantId(request);
  let query = `SELECT * FROM meter_readings WHERE meter_id = ?${tenantId ? ' AND tenant_id = ?' : ''}`;
  const bindings: any[] = [params.meterId, ...(tenantId ? [tenantId] : [])];
  if (status) { query += ' AND status = ?'; bindings.push(status); }
  query += ' ORDER BY reading_date DESC LIMIT ? OFFSET ?';
  bindings.push(limit, offset);

  const { results } = await env.DB.prepare(query).bind(...bindings).all();
  return json({ readings: results });
});

// Meter Readings: Submit
route('POST', '/api/meters/:meterId/readings', async (request, env, params) => {
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const id = generateId();
  const tenantId = getTenantId(request);
  const meter = await env.DB.prepare(`SELECT id, current_value FROM meters WHERE id = ?${tenantId ? ' AND tenant_id = ?' : ''}`)
    .bind(...[params.meterId, ...(tenantId ? [tenantId] : [])]).first() as any;
  if (!meter) return error('Meter not found', 404);

  const newValue = body.value;
  const readingDate = body.reading_date || body.readingDate || new Date().toISOString().split('T')[0];

  const prevReading = await env.DB.prepare(
    'SELECT value FROM meter_readings WHERE meter_id = ? ORDER BY reading_date DESC, created_at DESC LIMIT 1'
  ).bind(params.meterId).first() as any;

  let previousValue: number | null = null;
  let consumption: number | null = null;
  if (prevReading) {
    previousValue = Number(prevReading.value);
    if (newValue < previousValue) return error('Текущее показание не может быть меньше предыдущего', 400);
    consumption = newValue - previousValue;
  }

  const source = authUser.role === 'resident' ? 'resident' :
    (isExecutorRole(authUser.role) ? 'inspector' : body.source || 'resident');

  await env.DB.prepare(`
    INSERT INTO meter_readings (id, meter_id, value, previous_value, consumption, reading_date,
      source, submitted_by, submitted_at, photo_url, status, notes, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?)
  `).bind(id, params.meterId, newValue, previousValue, consumption, readingDate,
    source, authUser.id, body.photo_url || body.photoUrl || null, 'pending', body.notes || null, tenantId).run();

  await env.DB.prepare(
    `UPDATE meters SET current_value = ?, last_reading_date = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(newValue, readingDate, params.meterId).run();

  const created = await env.DB.prepare('SELECT * FROM meter_readings WHERE id = ?').bind(id).first();
  return json({ reading: created }, 201);
});

// Meter Readings: Approve/Reject
route('POST', '/api/meter-readings/:id/verify', async (request, env, params) => {
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Manager access required', 403);

  const body = await request.json() as any;
  const verifyStatus = body.approved ? 'approved' : 'rejected';
  const tenantId = getTenantId(request);

  await env.DB.prepare(`
    UPDATE meter_readings SET status = ?, is_verified = ?, verified_by = ?, verified_at = datetime('now'),
      rejection_reason = ? WHERE id = ?${tenantId ? ' AND tenant_id = ?' : ''}
  `).bind(verifyStatus, body.approved ? 1 : 0, authUser!.id,
    body.rejection_reason || body.rejectionReason || null, params.id, ...(tenantId ? [tenantId] : [])).run();

  if (!body.approved) {
    const reading = await env.DB.prepare(
      'SELECT meter_id, previous_value FROM meter_readings WHERE id = ?'
    ).bind(params.id).first() as any;
    if (reading) {
      await env.DB.prepare(
        'UPDATE meters SET current_value = ?, updated_at = datetime("now") WHERE id = ?'
      ).bind(reading.previous_value, reading.meter_id).run();
    }
  }
  return json({ success: true });
});

// Meter Readings: Get last reading
route('GET', '/api/meters/:meterId/last-reading', async (request, env, params) => {
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  const reading = await env.DB.prepare(
    `SELECT * FROM meter_readings WHERE meter_id = ?${tenantId ? ' AND tenant_id = ?' : ''} ORDER BY reading_date DESC LIMIT 1`
  ).bind(...[params.meterId, ...(tenantId ? [tenantId] : [])]).first();
  return json({ reading: reading || null });
});

} // end registerMeterReadingRoutes
