// OTP request and verify routes

import {
  route, getUser, getTenantId, requireFeature,
  json, error, generateId, generateOTPCode
} from './helpers';

export function registerOTPRoutes() {

// OTP: Request
//
// Sprint 79 P0/F3: ignore body.phone — always use authUser.phone. Was
// letting any authed caller issue an OTP to an arbitrary phone tied to
// their own user_id.
route('POST', '/api/meetings/otp/request', async (request, env) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  if (!authUser.phone) return error('User has no phone on file', 400);

  const body = await request.json() as any;
  const code = generateOTPCode();
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 5);

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO meeting_otp_records (id, user_id, phone, code, purpose, meeting_id, agenda_item_id, expires_at, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, authUser.id, authUser.phone, code, body.purpose || 'agenda_vote', body.meeting_id || body.meetingId || null, body.agenda_item_id || body.agendaItemId || null, expiresAt.toISOString(), getTenantId(request)).run();

  return json({ otpId: id, expiresAt: expiresAt.toISOString() });
});

// OTP: Verify
//
// Sprint 79 P0/F3: was unauthenticated — anyone with an otp_id (UUID
// guessable via timing/leakage) could brute-force the 6-digit code.
// Now: require auth + tenant filter + user_id binding. The OTP must
// belong to the caller.
route('POST', '/api/meetings/otp/verify', async (request, env) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const otpId = body.otp_id || body.otpId;
  const code = body.code;
  if (!otpId || !code) return error('otp_id and code are required', 400);

  const tenantId = getTenantId(request);
  const otp = await env.DB.prepare(
    `SELECT * FROM meeting_otp_records WHERE id = ? AND user_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(otpId, authUser.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!otp) return json({ verified: false, error: 'OTP not found' });
  if (otp.is_used) return json({ verified: false, error: 'OTP already used' });
  if (new Date(otp.expires_at) < new Date()) return json({ verified: false, error: 'OTP expired' });
  if (otp.attempts >= otp.max_attempts) return json({ verified: false, error: 'Max attempts exceeded' });

  if (otp.code === code) {
    await env.DB.prepare(`UPDATE meeting_otp_records SET is_used = 1, verified_at = datetime('now') WHERE id = ?`).bind(otpId).run();
    return json({ verified: true });
  } else {
    await env.DB.prepare(`UPDATE meeting_otp_records SET attempts = attempts + 1 WHERE id = ?`).bind(otpId).run();
    return json({ verified: false, error: 'Invalid code' });
  }
});

} // end registerOTPRoutes
