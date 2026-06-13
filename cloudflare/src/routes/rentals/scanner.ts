// Guest code scanning: validate, use, scan history, logs

import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature, auditCrossTenantAttempt } from '../../middleware/tenant';
import { json, error, generateId } from '../../utils/helpers';

// Sprint 65 P0: only scanner roles may validate/burn passes. Was open
// to any authenticated user — any resident could enumerate codes,
// burn other residents' single-use passes, and read all visitor PII.
const SCANNER_ROLES = new Set([
  'security', 'guard', 'manager', 'director', 'admin', 'super_admin',
  // dispatcher is intentionally allowed for kiosk/concierge desk scenarios
  'dispatcher',
]);

async function logScan(
  env: { DB: D1Database },
  args: {
    codeId: string | null;
    user: { id: string; name: string; role: string };
    action: string;
    visitorType?: string | null;
    residentName?: string | null;
    residentApartment?: string | null;
    tenantId: string | null;
  },
) {
  try {
    await env.DB.prepare(`
      INSERT INTO guest_access_logs (id, code_id, scanned_by_id, scanned_by_name, scanned_by_role, action, visitor_type, resident_name, resident_apartment, tenant_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      generateId(), args.codeId, args.user.id, args.user.name, args.user.role,
      args.action, args.visitorType || null, args.residentName || null,
      args.residentApartment || null, args.tenantId,
    ).run();
  } catch { /* fire-and-forget */ }
}

export function registerScannerRoutes() {

// Guest codes: Get recent scan logs (MUST be before :id route)
route('GET', '/api/guest-codes/scan-history', async (request, env) => {
  const fc = await requireFeature('rentals', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  const { results } = await env.DB.prepare(`
    SELECT * FROM guest_access_logs
    WHERE ${tenantId ? 'tenant_id = ?' : '1=1'}
    ORDER BY scanned_at DESC LIMIT 50
  `).bind(...(tenantId ? [tenantId] : [])).all();

  return json({ logs: results });
});

// Guest codes: Validate (for security scanning)
//
// Sprint 65 P0 — all of the following were broken simultaneously, now fixed:
//   F4: any logged-in user could call this. Now scanner roles only.
//   F2: lookup had no tenant filter. Now scoped.
//   F1: when the token id wasn't in DB, server inserted a row "from-token" —
//       FORGED QRs (anyone with a base64 encoder) were minted into real
//       active passes. That fallback is REMOVED. Forged tokens 404.
//   F5: FE was sending `qr_data` but BE expected `qr_token`. Accept both
//       to roll out without an FE-coupled deploy.
//   F10: valid_from was never enforced (a pass dated for tomorrow worked
//       today). Now: reject if `now < valid_from`.
//   F8: every outcome (valid/expired/revoked/used/invalid/not_yet_valid/
//       cross-tenant) is logged to guest_access_logs.
//
// We do NOT mark used inside /validate — that still happens in /use
// (the "Allow entry" tap). Stops a guard accidentally burning a pass
// just by scanning to look up details. The atomic-use lives in /use.
route('POST', '/api/guest-codes/validate', async (request, env) => {
  const fc = await requireFeature('rentals', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  if (!SCANNER_ROLES.has(authUser.role)) {
    return error('Only security/management can scan passes', 403);
  }

  const tenantId = getTenantId(request);
  const body = await request.json() as { qr_token?: string; qr_data?: string };
  const qrToken = body.qr_token || body.qr_data || '';
  if (!qrToken.startsWith('GAPASS:')) {
    await logScan(env, { codeId: null, user: authUser, action: 'invalid', tenantId });
    return json({ valid: false, error: 'invalid', message: 'Invalid QR format' });
  }

  let tokenData: any;
  try {
    const base64Data = qrToken.substring(7);
    const decoded = decodeURIComponent(escape(atob(base64Data)));
    tokenData = JSON.parse(decoded);
  } catch {
    await logScan(env, { codeId: null, user: authUser, action: 'invalid', tenantId });
    return json({ valid: false, error: 'invalid', message: 'Failed to decode QR' });
  }

  const codeId = typeof tokenData?.i === 'string' ? tokenData.i : null;
  if (!codeId) {
    await logScan(env, { codeId: null, user: authUser, action: 'invalid', tenantId });
    return json({ valid: false, error: 'invalid', message: 'Malformed token' });
  }

  // Sprint 81 P0: 2-stage lookup so a real-but-foreign pass returns
  // an explicit `cross_tenant` denial instead of being indistinguishable
  // from a forged code. The 403 response does NOT reveal the foreign
  // tenant's name or any owner detail — the guard just learns "this
  // pass belongs to a different УК". Defense-in-depth audit log lands
  // in security_audit_log via auditCrossTenantAttempt().
  //
  // Stage 1: unfiltered lookup by id. Super-admins (no tenantId) and
  // legit same-tenant scans both fall through to the regular flow
  // below. Stage 2 only fires when caller IS scoped AND the code's
  // tenant differs.
  const code = await env.DB.prepare(
    `SELECT * FROM guest_access_codes WHERE id = ?`,
  ).bind(codeId).first() as any;

  if (!code) {
    await logScan(env, { codeId, user: authUser, action: 'invalid', tenantId });
    return json({ valid: false, error: 'invalid', message: 'Code not found' });
  }

  if (tenantId && code.tenant_id && code.tenant_id !== tenantId) {
    await logScan(env, { codeId, user: authUser, action: 'denied_cross_tenant', tenantId });
    await auditCrossTenantAttempt(env, {
      staffId: authUser.id,
      staffName: authUser.name,
      staffRole: authUser.role,
      staffTenantId: tenantId,
      resourceType: 'guest_code',
      resourceId: codeId,
      resourceTenantId: code.tenant_id,
    });
    return json({
      valid: false,
      error: 'cross_tenant',
      message: 'Пропуск принадлежит другой УК. Доступ запрещён.',
    }, 403);
  }

  const now = new Date();
  const validFrom = code.valid_from ? new Date(code.valid_from) : null;
  const validUntil = code.valid_until ? new Date(code.valid_until) : null;

  if (validFrom && now < validFrom) {
    await logScan(env, {
      codeId, user: authUser, action: 'not_yet_valid', tenantId,
      visitorType: code.visitor_type, residentName: code.resident_name, residentApartment: code.resident_apartment,
    });
    return json({ valid: false, error: 'not_yet_valid', message: 'Code is not yet valid', code });
  }

  if (validUntil && now > validUntil) {
    if (code.status === 'active') {
      await env.DB.prepare(`UPDATE guest_access_codes SET status = 'expired', updated_at = datetime('now') WHERE id = ?`).bind(codeId).run();
    }
    await logScan(env, {
      codeId, user: authUser, action: 'expired', tenantId,
      visitorType: code.visitor_type, residentName: code.resident_name, residentApartment: code.resident_apartment,
    });
    return json({ valid: false, error: 'expired', message: 'Code expired', code });
  }

  if (code.status === 'revoked') {
    await logScan(env, {
      codeId, user: authUser, action: 'revoked', tenantId,
      visitorType: code.visitor_type, residentName: code.resident_name, residentApartment: code.resident_apartment,
    });
    return json({ valid: false, error: 'revoked', message: 'Code revoked', code });
  }
  if (code.status === 'used' || (code.current_uses ?? 0) >= (code.max_uses ?? 1)) {
    await logScan(env, {
      codeId, user: authUser, action: 'already_used', tenantId,
      visitorType: code.visitor_type, residentName: code.resident_name, residentApartment: code.resident_apartment,
    });
    return json({ valid: false, error: 'already_used', message: 'Code already used', code });
  }

  // Don't log "valid" here — the /use call will log entry_allowed once
  // the guard taps "Allow". Otherwise simply opening the scan modal
  // would flood the log with valid-without-decision rows.
  return json({ valid: true, code });
});

// Guest codes: Use (mark as used after allowing entry)
//
// Sprint 65 P0:
//   F4: scanner roles only (was open to any user — could burn other
//     residents' single-use passes).
//   F3 + F12: atomic conditional UPDATE. Was SELECT-then-UPDATE which
//     let two concurrent guards both pass current_uses<max_uses then
//     both write +1 — both allowed entry on a single_use pass.
route('POST', '/api/guest-codes/:id/use', async (request, env, params) => {
  const fc = await requireFeature('rentals', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  if (!SCANNER_ROLES.has(authUser.role)) {
    return error('Only security/management can burn passes', 403);
  }

  const tenantId = getTenantId(request);
  // Sprint 81 P0: 2-stage lookup so /use mirrors /validate — a foreign
  // pass returns 403 cross_tenant, not 404 (otherwise a guard who
  // bypassed the FE validate step and went straight to /use would see
  // "Not found" instead of the clear cross-tenant denial).
  const code = await env.DB.prepare(
    `SELECT * FROM guest_access_codes WHERE id = ?`
  ).bind(params.id).first() as any;
  if (!code) return error('Not found', 404);

  if (tenantId && code.tenant_id && code.tenant_id !== tenantId) {
    await logScan(env, { codeId: params.id, user: authUser, action: 'denied_cross_tenant', tenantId });
    await auditCrossTenantAttempt(env, {
      staffId: authUser.id,
      staffName: authUser.name,
      staffRole: authUser.role,
      staffTenantId: tenantId,
      resourceType: 'guest_code',
      resourceId: params.id,
      resourceTenantId: code.tenant_id,
    });
    return json({
      valid: false,
      error: 'cross_tenant',
      message: 'Пропуск принадлежит другой УК. Доступ запрещён.',
    }, 403);
  }

  // Atomic increment + flip status. The CASE WHEN inside SET means we
  // only need one round-trip. Filter on `status='active'` and
  // `current_uses < max_uses` so a parallel /use can't double-allow.
  const inc = await env.DB.prepare(`
    UPDATE guest_access_codes
    SET current_uses = current_uses + 1,
        status = CASE WHEN current_uses + 1 >= max_uses THEN 'used' ELSE 'active' END,
        updated_at = datetime('now')
    WHERE id = ? AND status = 'active' AND current_uses < max_uses ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).run();

  if (!inc.meta || inc.meta.changes === 0) {
    // Another guard already burned it, or it expired/was revoked between
    // /validate and /use.
    await logScan(env, {
      codeId: params.id, user: authUser, action: 'denied', tenantId,
      visitorType: code.visitor_type, residentName: code.resident_name, residentApartment: code.resident_apartment,
    });
    return error('Pass is no longer available', 409);
  }

  await logScan(env, {
    codeId: params.id, user: authUser, action: 'entry_allowed', tenantId,
    visitorType: code.visitor_type, residentName: code.resident_name, residentApartment: code.resident_apartment,
  });

  const updated = await env.DB.prepare(
    `SELECT * FROM guest_access_codes WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  return json({ success: true, code: updated });
});

// Guest codes: Deny entry (audit log only)
//
// Sprint 65 P0/F8: denial path used to update only client state. Server
// had no record of "guard tried this QR and rejected it" — invisible to
// auditors. Now: POST /:id/deny logs a row.
route('POST', '/api/guest-codes/:id/deny', async (request, env, params) => {
  const fc = await requireFeature('rentals', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  if (!SCANNER_ROLES.has(authUser.role)) {
    return error('Only security/management can deny passes', 403);
  }

  const tenantId = getTenantId(request);
  const code = await env.DB.prepare(
    `SELECT visitor_type, resident_name, resident_apartment FROM guest_access_codes WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!code) return error('Not found', 404);

  await logScan(env, {
    codeId: params.id, user: authUser, action: 'entry_denied', tenantId,
    visitorType: code.visitor_type, residentName: code.resident_name, residentApartment: code.resident_apartment,
  });

  return json({ success: true });
});

// Guest codes: Get usage logs for a code
route('GET', '/api/guest-codes/:id/logs', async (request, env, params) => {
  const fc = await requireFeature('rentals', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  const { results } = await env.DB.prepare(`
    SELECT * FROM guest_access_logs WHERE code_id = ? ${tenantId ? 'AND tenant_id = ?' : ''} ORDER BY scanned_at DESC LIMIT 500
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).all();

  return json({ logs: results });
});

} // end registerScannerRoutes
