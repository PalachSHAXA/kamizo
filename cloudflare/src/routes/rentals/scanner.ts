// Guest code scanning: validate, use, scan history, logs

import type { Env } from '../../types';
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { json, error, generateId } from '../../utils/helpers';

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

// Guest codes: Validate and use (for security scanning)
route('POST', '/api/guest-codes/validate', async (request, env) => {
  const fc = await requireFeature('rentals', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const { qr_token } = await request.json() as { qr_token: string };
  if (!qr_token.startsWith('GAPASS:')) {
    return json({ valid: false, error: 'invalid', message: 'Invalid QR format' });
  }

  let tokenData: any;
  try {
    const base64Data = qr_token.substring(7);
    const decoded = decodeURIComponent(escape(atob(base64Data)));
    tokenData = JSON.parse(decoded);
  } catch (e) {
    return json({ valid: false, error: 'invalid', message: 'Failed to decode QR' });
  }

  const codeId = tokenData.i;
  const now = new Date();

  let code = await env.DB.prepare('SELECT * FROM guest_access_codes WHERE id = ?').bind(codeId).first() as any;

  // If not in DB, create from token data (backward compatibility)
  if (!code) {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO guest_access_codes (
        id, user_id, qr_token, visitor_type, visitor_name, visitor_phone, visitor_vehicle_plate,
        access_type, valid_from, valid_until, max_uses, current_uses, status,
        resident_name, resident_phone, resident_apartment, resident_address
      ) VALUES (?, 'from-token', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', ?, ?, ?, ?)
    `).bind(
      codeId, qr_token, tokenData.vt, tokenData.vn || null, tokenData.vp || null,
      tokenData.vv || null, tokenData.at, new Date(tokenData.vf).toISOString(),
      new Date(tokenData.vu).toISOString(), tokenData.mx,
      tokenData.rn, tokenData.rp, tokenData.ra, tokenData.rd
    ).run();
    code = await env.DB.prepare('SELECT * FROM guest_access_codes WHERE id = ?').bind(codeId).first();
  }

  if (!code) return json({ valid: false, error: 'invalid', message: 'Code not found' });

  if (now > new Date(code.valid_until)) {
    if (code.status === 'active') {
      await env.DB.prepare(`UPDATE guest_access_codes SET status = 'expired', updated_at = datetime('now') WHERE id = ?`).bind(codeId).run();
    }
    return json({ valid: false, error: 'expired', message: 'Code expired', code });
  }

  if (code.status === 'revoked') return json({ valid: false, error: 'revoked', message: 'Code revoked', code });
  if (code.status === 'used') return json({ valid: false, error: 'already_used', message: 'Code already used', code });

  if (code.current_uses >= code.max_uses) {
    await env.DB.prepare(`UPDATE guest_access_codes SET status = 'used', updated_at = datetime('now') WHERE id = ?`).bind(codeId).run();
    return json({ valid: false, error: 'already_used', message: 'Maximum uses reached', code });
  }

  return json({ valid: true, code });
});

// Guest codes: Use (mark as used after allowing entry)
route('POST', '/api/guest-codes/:id/use', async (request, env, params) => {
  const fc = await requireFeature('rentals', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  const code = await env.DB.prepare(`SELECT * FROM guest_access_codes WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!code) return error('Not found', 404);

  const newUses = (code.current_uses || 0) + 1;
  const newStatus = newUses >= code.max_uses ? 'used' : 'active';

  await env.DB.prepare(`
    UPDATE guest_access_codes SET current_uses = ?, status = ?, updated_at = datetime('now')
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(newUses, newStatus, params.id, ...(tenantId ? [tenantId] : [])).run();

  await env.DB.prepare(`
    INSERT INTO guest_access_logs (id, code_id, scanned_by_id, scanned_by_name, scanned_by_role, action, visitor_type, resident_name, resident_apartment, tenant_id)
    VALUES (?, ?, ?, ?, ?, 'entry_allowed', ?, ?, ?, ?)
  `).bind(
    generateId(), params.id, authUser.id, authUser.name, authUser.role,
    code.visitor_type, code.resident_name, code.resident_apartment, tenantId
  ).run();

  const updated = await env.DB.prepare(`SELECT * FROM guest_access_codes WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  return json({ success: true, code: updated });
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
