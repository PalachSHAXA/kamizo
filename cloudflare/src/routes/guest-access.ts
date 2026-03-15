// Guest access code routes: QR passes, validation, scanning
import type { Env } from '../types';
import { route } from '../router';
import { getUser } from '../middleware/auth';
import { getTenantId } from '../middleware/tenant';
import { json, error, generateId } from '../utils/helpers';
import { getCurrentCorsOrigin } from '../middleware/cors';

// Helper function for sending push notifications
async function sendPushNotification(env: Env, userId: string, options: any) {
  // Placeholder - imported from main index.ts in production
  return Promise.resolve();
}

// ==================== GUEST ACCESS ROUTES ====================

export function registerGuestAccessRoutes(env: Env) {
  // Guest codes: List for user (with auto-expire check)
  route('GET', '/api/guest-codes', async (request) => {
    const user = await getUser(request, env);
    if (!user) return error('Unauthorized', 401);

    const tenantId = getTenantId(request);
    const isManagementUser = ['admin', 'director', 'manager', 'security', 'executor', 'department_head'].includes(user.role);

    // Auto-expire old codes
    if (isManagementUser) {
      await env.DB.prepare(`
        UPDATE guest_access_codes
        SET status = 'expired', updated_at = datetime('now')
        WHERE status = 'active' AND valid_until < datetime('now') ${tenantId ? 'AND tenant_id = ?' : ''}
      `).bind(...(tenantId ? [tenantId] : [])).run();
    } else {
      await env.DB.prepare(`
        UPDATE guest_access_codes
        SET status = 'expired', updated_at = datetime('now')
        WHERE user_id = ? AND status = 'active' AND valid_until < datetime('now') ${tenantId ? 'AND tenant_id = ?' : ''}
      `).bind(user.id, ...(tenantId ? [tenantId] : [])).run();
    }

    let results;
    if (isManagementUser) {
      const response = await env.DB.prepare(`
        SELECT g.*, u.name as creator_name, u.apartment as creator_apartment, u.phone as creator_phone
        FROM guest_access_codes g
        LEFT JOIN users u ON u.id = g.user_id ${tenantId ? 'AND u.tenant_id = ?' : ''}
        WHERE 1=1 ${tenantId ? 'AND g.tenant_id = ?' : ''}
        ORDER BY g.created_at DESC
        LIMIT 200
      `).bind(...(tenantId ? [tenantId, tenantId] : [])).all();
      results = response.results;
    } else {
      const response = await env.DB.prepare(`
        SELECT * FROM guest_access_codes
        WHERE user_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
        ORDER BY created_at DESC
        LIMIT 100
      `).bind(user.id, ...(tenantId ? [tenantId] : [])).all();
      results = response.results;
    }

    return new Response(JSON.stringify({ codes: results }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': getCurrentCorsOrigin(),
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  });

  // Guest codes: Create (full data)
  route('POST', '/api/guest-codes', async (request) => {
    const user = await getUser(request, env);
    if (!user) return error('Unauthorized', 401);

    const body = await request.json() as any;
    const id = generateId();

    // Calculate validity based on access_type
    let validUntil: string;
    let maxUses = 1;
    const now = new Date();
    const validFrom = body.valid_from ? new Date(body.valid_from) : now;

    switch (body.access_type) {
      case 'single_use':
        validUntil = body.valid_until || new Date(validFrom.getTime() + 24 * 60 * 60 * 1000).toISOString();
        maxUses = 1;
        break;
      case 'day':
        validUntil = body.valid_until || new Date(validFrom.getTime() + 24 * 60 * 60 * 1000).toISOString();
        maxUses = 999;
        break;
      case 'week':
        validUntil = body.valid_until || new Date(validFrom.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
        maxUses = 999;
        break;
      case 'month':
        validUntil = body.valid_until || new Date(validFrom.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
        maxUses = 999;
        break;
      case 'custom':
        if (!body.valid_until) {
          return error('valid_until is required for custom access type');
        }
        validUntil = body.valid_until;
        maxUses = 999;
        break;
      default:
        validUntil = body.valid_until || new Date(validFrom.getTime() + 24 * 60 * 60 * 1000).toISOString();
    }

    // Create QR token (self-contained)
    const tokenData = {
      i: id,
      rn: body.resident_name || user.name,
      rp: body.resident_phone || user.phone,
      ra: body.resident_apartment || user.apartment,
      rd: body.resident_address || user.address,
      vt: body.visitor_type || 'guest',
      at: body.access_type || 'single_use',
      vf: validFrom.getTime(),
      vu: new Date(validUntil).getTime(),
      mx: maxUses,
      vn: body.visitor_name || '',
      vp: body.visitor_phone || '',
      vv: body.visitor_vehicle_plate || '',
    };

    const jsonString = JSON.stringify(tokenData);
    const qrToken = 'GAPASS:' + btoa(unescape(encodeURIComponent(jsonString)));

    await env.DB.prepare(`
      INSERT INTO guest_access_codes (
        id, user_id, qr_token, visitor_type, visitor_name, visitor_phone, visitor_vehicle_plate,
        access_type, valid_from, valid_until, max_uses, current_uses, status,
        resident_name, resident_phone, resident_apartment, resident_address, notes, tenant_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', ?, ?, ?, ?, ?, ?)
    `).bind(
      id, user.id, qrToken,
      body.visitor_type || 'guest',
      body.visitor_name || null,
      body.visitor_phone || null,
      body.visitor_vehicle_plate || null,
      body.access_type || 'single_use',
      validFrom.toISOString(),
      validUntil,
      maxUses,
      body.resident_name || user.name,
      body.resident_phone || user.phone,
      body.resident_apartment || user.apartment,
      body.resident_address || user.address,
      body.notes || null,
      getTenantId(request)
    ).run();

    const tenantId = getTenantId(request);
    const created = await env.DB.prepare(`SELECT * FROM guest_access_codes WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(id, ...(tenantId ? [tenantId] : [])).first();
    return json({ code: created }, 201);
  });

  // Guest codes: Get recent scan logs (MUST be before :id route)
  route('GET', '/api/guest-codes/scan-history', async (request) => {
    const user = await getUser(request, env);
    if (!user) return error('Unauthorized', 401);

    const tenantId = getTenantId(request);
    const { results } = await env.DB.prepare(`
      SELECT * FROM guest_access_logs
      WHERE ${tenantId ? 'tenant_id = ?' : '1=1'}
      ORDER BY scanned_at DESC
      LIMIT 50
    `).bind(...(tenantId ? [tenantId] : [])).all();

    return json({ logs: results });
  });

  // Guest codes: Get single code
  route('GET', '/api/guest-codes/:id', async (request, _env, params) => {
    const user = await getUser(request, env);
    if (!user) return error('Unauthorized', 401);

    const tenantId = getTenantId(request);
    const code = await env.DB.prepare(`SELECT * FROM guest_access_codes WHERE id = ? AND user_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`)
      .bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).first();

    if (!code) return error('Not found', 404);
    return json({ code });
  });

  // Guest codes: Revoke
  route('POST', '/api/guest-codes/:id/revoke', async (request, _env, params) => {
    const user = await getUser(request, env);
    if (!user) return error('Unauthorized', 401);

    const body = await request.json() as any;
    const tenantId = getTenantId(request);
    const isManagementUser = ['admin', 'director', 'manager'].includes(user.role);

    // Get the guest code info before revoking
    const guestCode = await env.DB.prepare(
      `SELECT id, user_id, visitor_name, visitor_type FROM guest_access_codes WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

    // Management users can revoke any code, residents can only revoke their own
    if (isManagementUser) {
      await env.DB.prepare(`
        UPDATE guest_access_codes
        SET status = 'revoked', revoked_at = datetime('now'), revoked_by = ?, revoked_reason = ?, updated_at = datetime('now')
        WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
      `).bind(user.id, body.reason || null, params.id, ...(tenantId ? [tenantId] : [])).run();

      // Send notifications to the resident
      if (guestCode && guestCode.user_id && guestCode.user_id !== user.id) {
        const visitorTypeLabels: Record<string, string> = {
          'guest': 'гостя',
          'courier': 'курьера',
          'taxi': 'такси',
          'other': 'посетителя'
        };
        const visitorLabel = visitorTypeLabels[guestCode.visitor_type] || 'посетителя';
        const visitorName = guestCode.visitor_name ? ` (${guestCode.visitor_name})` : '';
        const reasonText = body.reason ? ` Причина: ${body.reason}` : '';

        const notificationTitle = '🚫 Пропуск отменён';
        const notificationBody = `Ваш пропуск для ${visitorLabel}${visitorName} был отменён управляющей компанией.${reasonText}`;

        // Create in-app notification
        try {
          const notifId = generateId();
          await env.DB.prepare(`
            INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at)
            VALUES (?, ?, 'guest_pass_revoked', ?, ?, ?, 0, datetime('now'))
          `).bind(
            notifId,
            guestCode.user_id,
            notificationTitle,
            notificationBody,
            JSON.stringify({ guestCodeId: params.id, reason: body.reason, url: '/guest-access' })
          ).run();
        } catch (notifError) {
          console.error('Failed to create in-app notification:', notifError);
        }

        // Send push notification
        await sendPushNotification(env, guestCode.user_id, {
          title: notificationTitle,
          body: notificationBody,
          type: 'guest_pass_revoked',
          tag: `guest-pass-revoked-${params.id}`,
          data: {
            guestCodeId: params.id,
            reason: body.reason,
            url: '/guest-access'
          },
          requireInteraction: true
        }).catch(err => console.error('Failed to send push notification:', err));
      }
    } else {
      // Residents can only revoke their own codes
      await env.DB.prepare(`
        UPDATE guest_access_codes
        SET status = 'revoked', revoked_at = datetime('now'), revoked_by = ?, revoked_reason = ?, updated_at = datetime('now')
        WHERE id = ? AND user_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
      `).bind(user.id, body.reason || null, params.id, user.id, ...(tenantId ? [tenantId] : [])).run();
    }

    return json({ success: true });
  });

  // Guest codes: Delete
  route('DELETE', '/api/guest-codes/:id', async (request, _env, params) => {
    const user = await getUser(request, env);
    if (!user) return error('Unauthorized', 401);

    const tenantId = getTenantId(request);
    await env.DB.prepare(`DELETE FROM guest_access_codes WHERE id = ? AND user_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).run();
    return json({ success: true });
  });

  // Guest codes: Validate and use (for security scanning)
  route('POST', '/api/guest-codes/validate', async (request) => {
    const authUser = await getUser(request, env);
    if (!authUser) return error('Unauthorized', 401);

    const { qr_token } = await request.json() as { qr_token: string };

    // Decode QR token
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

    // If not in DB, create from token data (for backward compatibility)
    if (!code) {
      const qrToken = qr_token;
      await env.DB.prepare(`
        INSERT OR IGNORE INTO guest_access_codes (
          id, user_id, qr_token, visitor_type, visitor_name, visitor_phone, visitor_vehicle_plate,
          access_type, valid_from, valid_until, max_uses, current_uses, status,
          resident_name, resident_phone, resident_apartment, resident_address
        ) VALUES (?, 'from-token', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', ?, ?, ?, ?)
      `).bind(
        codeId, qrToken,
        tokenData.vt, tokenData.vn || null, tokenData.vp || null, tokenData.vv || null,
        tokenData.at, new Date(tokenData.vf).toISOString(), new Date(tokenData.vu).toISOString(),
        tokenData.mx, tokenData.rn, tokenData.rp, tokenData.ra, tokenData.rd
      ).run();

      code = await env.DB.prepare('SELECT * FROM guest_access_codes WHERE id = ?').bind(codeId).first();
    }

    if (!code) {
      return json({ valid: false, error: 'invalid', message: 'Code not found' });
    }

    // Check expiry
    if (now > new Date(code.valid_until)) {
      if (code.status === 'active') {
        await env.DB.prepare(`UPDATE guest_access_codes SET status = 'expired', updated_at = datetime('now') WHERE id = ?`).bind(codeId).run();
      }
      return json({ valid: false, error: 'expired', message: 'Code expired', code });
    }

    // Check status
    if (code.status === 'revoked') {
      return json({ valid: false, error: 'revoked', message: 'Code revoked', code });
    }

    if (code.status === 'used') {
      return json({ valid: false, error: 'already_used', message: 'Code already used', code });
    }

    // Check max uses
    if (code.current_uses >= code.max_uses) {
      await env.DB.prepare(`UPDATE guest_access_codes SET status = 'used', updated_at = datetime('now') WHERE id = ?`).bind(codeId).run();
      return json({ valid: false, error: 'already_used', message: 'Maximum uses reached', code });
    }

    // Valid!
    return json({ valid: true, code });
  });

  // Guest codes: Use (mark as used after allowing entry)
  route('POST', '/api/guest-codes/:id/use', async (request, _env, params) => {
    const authUser = await getUser(request, env);
    if (!authUser) return error('Unauthorized', 401);

    const tenantId = getTenantId(request);
    const code = await env.DB.prepare(`SELECT * FROM guest_access_codes WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
    if (!code) return error('Not found', 404);

    // Check if code has already reached max uses
    if (code.max_uses && (code.current_uses || 0) >= code.max_uses) {
      return error('Пропуск уже использован максимальное количество раз', 400);
    }

    // Check if code has expired
    if (code.valid_until && new Date(code.valid_until) < new Date()) {
      return error('Срок действия пропуска истёк', 400);
    }

    // Increment uses
    await env.DB.prepare(`
      UPDATE guest_access_codes
      SET current_uses = current_uses + 1, status = CASE WHEN current_uses + 1 >= max_uses THEN 'used' ELSE 'active' END, updated_at = datetime('now')
      WHERE id = ?
    `).bind(params.id).run();

    // Log the scan
    const logId = generateId();
    await env.DB.prepare(`
      INSERT INTO guest_access_logs (id, code_id, scanned_by, scanned_at, tenant_id)
      VALUES (?, ?, ?, datetime('now'), ?)
    `).bind(logId, params.id, authUser.id, tenantId || null).run();

    return json({ success: true });
  });

  // Guest codes: Get logs for a code
  route('GET', '/api/guest-codes/:id/logs', async (request, _env, params) => {
    const user = await getUser(request, env);
    if (!user) return error('Unauthorized', 401);

    const tenantId = getTenantId(request);
    const { results } = await env.DB.prepare(`
      SELECT gl.*, u.name as scanned_by_name
      FROM guest_access_logs gl
      LEFT JOIN users u ON gl.scanned_by = u.id
      WHERE gl.code_id = ? ${tenantId ? 'AND gl.tenant_id = ?' : ''}
      ORDER BY gl.scanned_at DESC
    `).bind(params.id, ...(tenantId ? [tenantId] : [])).all();

    return json({ logs: results });
  });
}
