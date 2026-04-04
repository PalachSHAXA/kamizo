// Protocol signing routes: chairman, secretary, counting commission

import {
  route, getUser, getTenantId, requireFeature,
  invalidateCache, json, error, isManagement, generateVoteHash
} from './helpers';

export function registerProtocolSignRoutes() {

// Sign as chairman
route('POST', '/api/meetings/:id/protocol/sign-chairman', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);

  const meeting = await env.DB.prepare(`SELECT protocol_id, building_id FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`)
    .bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!meeting?.protocol_id) return error('Protocol not found', 404);

  const userInfo = await env.DB.prepare('SELECT apartment FROM users WHERE id = ? AND building_id = ?').bind(authUser.id, meeting.building_id).first() as any;
  const signatureHash = generateVoteHash({ userId: authUser.id, role: 'chairman', signedAt: new Date().toISOString() });

  await env.DB.prepare(`UPDATE meeting_protocols SET chairman_user_id = ?, chairman_name = ?, chairman_apartment = ?, chairman_signed_at = datetime('now'), chairman_signature_hash = ? WHERE id = ?`)
    .bind(authUser.id, authUser.name, userInfo?.apartment || null, signatureHash, meeting.protocol_id).run();

  invalidateCache('meetings:');
  const protocol = await env.DB.prepare('SELECT * FROM meeting_protocols WHERE id = ?').bind(meeting.protocol_id).first();
  return json({ protocol });
});

// Sign as secretary
route('POST', '/api/meetings/:id/protocol/sign-secretary', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);

  const meeting = await env.DB.prepare(`SELECT protocol_id, building_id FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`)
    .bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!meeting?.protocol_id) return error('Protocol not found', 404);

  const userInfo = await env.DB.prepare('SELECT apartment FROM users WHERE id = ? AND building_id = ?').bind(authUser.id, meeting.building_id).first() as any;
  const signatureHash = generateVoteHash({ userId: authUser.id, role: 'secretary', signedAt: new Date().toISOString() });

  await env.DB.prepare(`UPDATE meeting_protocols SET secretary_user_id = ?, secretary_name = ?, secretary_apartment = ?, secretary_signed_at = datetime('now'), secretary_signature_hash = ? WHERE id = ?`)
    .bind(authUser.id, authUser.name, userInfo?.apartment || null, signatureHash, meeting.protocol_id).run();

  invalidateCache('meetings:');
  const protocol = await env.DB.prepare('SELECT * FROM meeting_protocols WHERE id = ?').bind(meeting.protocol_id).first();
  return json({ protocol });
});

// Set counting commission members
route('POST', '/api/meetings/:id/protocol/counting-commission', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Manager access required', 403);
  const tenantId = getTenantId(request);

  const body = await request.json() as any;
  const meeting = await env.DB.prepare(`SELECT protocol_id FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`)
    .bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!meeting?.protocol_id) return error('Protocol not found', 404);

  const members = body.members || [];
  await env.DB.prepare(`UPDATE meeting_protocols SET counting_commission = ? WHERE id = ?`).bind(JSON.stringify(members), meeting.protocol_id).run();

  invalidateCache('meetings:');
  const protocol = await env.DB.prepare('SELECT * FROM meeting_protocols WHERE id = ?').bind(meeting.protocol_id).first();
  return json({ protocol });
});

} // end registerProtocolSignRoutes
