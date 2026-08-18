// Акты приёма-передачи дома в управление (раздел «Протоколы»).
// Храним параметры акта в building_acts; сам PDF/DOCX рендерит фронт из этих
// параметров. Создание ячеек (apartments) — отдельным вызовом bulk с фронта.
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId } from '../../middleware/tenant';
import { json, error, generateId, isManagement } from '../../utils/helpers';

export function registerBuildingActRoutes() {

  // Создать акт (запись параметров). Ячейки создаёт фронт через .../apartments/bulk.
  route('POST', '/api/buildings/:buildingId/acts', async (request, env, params) => {
    const user = await getUser(request, env);
    if (!isManagement(user)) return error('Manager access required', 403);
    const tenantId = getTenantId(request);

    // Дом должен принадлежать тенанту.
    const building = await env.DB.prepare(
      `SELECT id FROM buildings WHERE id = ? AND tenant_id = ? LIMIT 1`
    ).bind(params.buildingId, tenantId).first();
    if (!building) return error('Building not found', 404);

    const body = await request.json() as any;
    const id = generateId();
    await env.DB.prepare(
      `INSERT INTO building_acts
        (id, building_id, tenant_id, act_type, act_number, act_date, basis_json, options_json, snapshot_json, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, params.buildingId, tenantId,
      body.act_type || 'handover',
      body.act_number || null,
      body.act_date || null,
      JSON.stringify(body.basis || {}),
      JSON.stringify(body.options || {}),
      JSON.stringify(body.snapshot || {}),
      user!.id,
    ).run();

    return json({ id }, 201);
  });

  // Список актов дома.
  route('GET', '/api/buildings/:buildingId/acts', async (request, env, params) => {
    const user = await getUser(request, env);
    if (!isManagement(user)) return error('Manager access required', 403);
    const tenantId = getTenantId(request);
    const { results } = await env.DB.prepare(
      `SELECT id, building_id, act_type, act_number, act_date, basis_json, options_json, snapshot_json, created_at
       FROM building_acts WHERE building_id = ? AND tenant_id = ? ORDER BY created_at DESC`
    ).bind(params.buildingId, tenantId).all();
    return json({ acts: results || [] });
  });

  // Один акт (для перегенерации PDF/DOCX).
  route('GET', '/api/acts/:id', async (request, env, params) => {
    const user = await getUser(request, env);
    if (!isManagement(user)) return error('Manager access required', 403);
    const tenantId = getTenantId(request);
    const act = await env.DB.prepare(
      `SELECT * FROM building_acts WHERE id = ? AND tenant_id = ? LIMIT 1`
    ).bind(params.id, tenantId).first();
    if (!act) return error('Act not found', 404);
    return json({ act });
  });

  // Удалить акт.
  route('DELETE', '/api/acts/:id', async (request, env, params) => {
    const user = await getUser(request, env);
    if (!isManagement(user)) return error('Manager access required', 403);
    const tenantId = getTenantId(request);
    await env.DB.prepare(
      `DELETE FROM building_acts WHERE id = ? AND tenant_id = ?`
    ).bind(params.id, tenantId).run();
    return json({ ok: true });
  });

}
