// Request pause/resume

import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { json, error, sqliteDatetimeToMs } from '../../utils/helpers';
import { isExecutorRole } from '../../index';

export function registerPauseResumeRoutes() {

// Requests: Pause work
route('POST', '/api/requests/:id/pause', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !isExecutorRole(user.role)) return error('Only executors can pause work', 403);
  const fc = await requireFeature('requests', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const tenantId = getTenantId(request);
  const body = await request.json() as any;
  const { reason } = body;

  const requestData = await env.DB.prepare(`
    SELECT * FROM requests WHERE id = ? AND executor_id = ? AND status = 'in_progress' ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!requestData) return error('Request not found, not assigned to you, or not in progress', 404);
  if (requestData.is_paused) return error('Request is already paused', 400);

  await env.DB.prepare(`
    UPDATE requests SET is_paused = 1, paused_at = datetime('now'), pause_reason = ?, updated_at = datetime('now')
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(reason || null, params.id, ...(tenantId ? [tenantId] : [])).run();

  const updated = await env.DB.prepare(`SELECT * FROM requests WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  return json({ success: true, request: updated });
});

// Requests: Resume work
route('POST', '/api/requests/:id/resume', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !isExecutorRole(user.role)) return error('Only executors can resume work', 403);
  const fc = await requireFeature('requests', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const tenantId = getTenantId(request);
  const requestData = await env.DB.prepare(`
    SELECT * FROM requests WHERE id = ? AND executor_id = ? AND status = 'in_progress' AND is_paused = 1 ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!requestData) return error('Request not found, not assigned to you, or not paused', 404);

  // paused_at is stored via SQLite `datetime('now')` → UTC text without a
  // timezone marker. `new Date(text).getTime()` treats it as local time on
  // the Node VPS (Tashkent / UTC+5) and the resulting duration overshoots
  // by ~5 h, which then zeroes out the executor's work timer on resume.
  // sqliteDatetimeToMs forces UTC parsing.
  const pausedDuration = Math.floor((Date.now() - sqliteDatetimeToMs(requestData.paused_at)) / 1000);
  const newTotalPausedTime = (requestData.total_paused_time || 0) + Math.max(0, pausedDuration);

  await env.DB.prepare(`
    UPDATE requests SET is_paused = 0, paused_at = NULL, pause_reason = NULL, total_paused_time = ?, updated_at = datetime('now')
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(newTotalPausedTime, params.id, ...(tenantId ? [tenantId] : [])).run();

  const updated = await env.DB.prepare(`SELECT * FROM requests WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  return json({ success: true, request: updated, pausedDuration, totalPausedTime: newTotalPausedTime });
});

} // end registerPauseResumeRoutes
