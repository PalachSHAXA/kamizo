// Protocol signing routes: chairman, secretary, counting commission

import {
  route, getUser, getTenantId, requireFeature,
  invalidateCache, json, error, isManagement, generateVoteHash
} from './helpers';

export function registerProtocolSignRoutes() {

// Sign as chairman
//
// Sprint 79 P0/F6: was zero-gated — any authenticated user (incl. a
// resident in another building) could sign as chairman/secretary,
// overwrite an existing signature, and replace its hash. Now: must be a
// voter in this meeting (resident in the same building who actually
// participated), or management. Idempotent — once signed, only an admin
// with `?force=1` can re-sign.
async function gateProtocolSign(env: any, meetingId: string, user: { id: string; role: string }, tenantId: string | null): Promise<{ meeting: any } | { error: string; status: number }> {
  const meeting = await env.DB.prepare(
    `SELECT protocol_id, building_id, tenant_id FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(meetingId, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!meeting?.protocol_id) return { error: 'Protocol not found', status: 404 };
  // Cross-tenant defence even if subdomain didn't pin tenantId.
  if (tenantId && meeting.tenant_id && meeting.tenant_id !== tenantId) {
    return { error: 'Forbidden', status: 403 };
  }
  if (isManagement(user)) return { meeting };
  // Resident must (a) live in the meeting's building and (b) have voted
  // — proves they're a real participant.
  const voted = await env.DB.prepare(
    'SELECT 1 FROM meeting_vote_records WHERE meeting_id = ? AND voter_id = ? LIMIT 1'
  ).bind(meetingId, user.id).first();
  if (!voted) return { error: 'Only meeting participants may sign the protocol', status: 403 };
  const sameBuilding = await env.DB.prepare(
    'SELECT 1 FROM users WHERE id = ? AND building_id = ? LIMIT 1'
  ).bind(user.id, meeting.building_id).first();
  if (!sameBuilding) return { error: 'Only building residents may sign the protocol', status: 403 };
  return { meeting };
}

route('POST', '/api/meetings/:id/protocol/sign-chairman', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);
  const gated = await gateProtocolSign(env, params.id, authUser, tenantId);
  if ('error' in gated) return error(gated.error, gated.status);
  const { meeting } = gated;

  // Idempotency — refuse re-sign unless admin with ?force=1.
  const existing = await env.DB.prepare(
    'SELECT chairman_signed_at FROM meeting_protocols WHERE id = ?'
  ).bind(meeting.protocol_id).first() as any;
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';
  if (existing?.chairman_signed_at && !(force && isManagement(authUser))) {
    return error('Chairman already signed (admin can re-sign with ?force=1)', 409);
  }

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
  const gated = await gateProtocolSign(env, params.id, authUser, tenantId);
  if ('error' in gated) return error(gated.error, gated.status);
  const { meeting } = gated;

  const existing = await env.DB.prepare(
    'SELECT secretary_signed_at FROM meeting_protocols WHERE id = ?'
  ).bind(meeting.protocol_id).first() as any;
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';
  if (existing?.secretary_signed_at && !(force && isManagement(authUser))) {
    return error('Secretary already signed (admin can re-sign with ?force=1)', 409);
  }

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
