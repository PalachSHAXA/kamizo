// Device-token routes (Sprint 86) — APNs / FCM registration surface.
//
// Three endpoints, mounted under /api/devices/* :
//   POST /api/devices/register     — authed; UPSERT (token, user_id, tenant_id)
//   POST /api/devices/unregister   — authed; soft-deactivate one of caller's tokens
//   POST /api/devices/test-push    — super-admin only; sends a manual APNs ping
//
// Security guarantees (intentionally repeated as comments at each
// site, because a future change can easily lose them):
//   • tenant_id always comes from the JWT — never from the request
//     body. Cross-tenant token poisoning is impossible by construction.
//   • Device tokens are secret-equivalent. We never log them in
//     plaintext; error returns mention a truncated token at most.
//   • Soft-deactivate (is_active=0) on unregister, not DELETE. Same
//     reason every other audit-bearing table does: we keep the row so
//     "device X belonged to user Y at time Z" is reconstructible.
//
// Business-event push fan-out is intentionally NOT implemented here.
// That's the next sprint — once chat/request/meeting events start
// calling sendApnsNotification(), they'll do it through this table's
// `WHERE user_id = ? AND is_active = 1` read path.

import type { Env } from '../types';
import { route } from '../router';
import { getUser } from '../middleware/auth';
import { getTenantId } from '../middleware/tenant';
import { json, error, generateId, isSuperAdmin } from '../utils/helpers';
import { sendApnsNotification } from '../services/apns-client';

export function registerDeviceRoutes() {

// ──────────────────────────────────────────────────────────────────
// POST /api/devices/register
// Body: { token, platform, app_version?, os_version? }
//
// UPSERT semantics:
//   • New token         → INSERT a fresh row, is_active=1
//   • Existing token,
//     same user/tenant  → UPDATE last_seen_at, app_version, os_version,
//                         flip is_active=1 (re-activates after logout)
//   • Existing token,
//     different user    → user_id + tenant_id REPLACED (a phone was
//                         signed in as user A, then logged out, then
//                         signed in as user B without uninstalling).
//                         The previous user simply stops receiving
//                         push on this device — exactly what an
//                         account switch should do.
//
// We rely on the UNIQUE(token) constraint to drive the UPSERT, using
// INSERT … ON CONFLICT(token) DO UPDATE so the whole thing is a
// single round-trip and no SELECT-then-INSERT race exists.

route('POST', '/api/devices/register', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  // tenant_id MUST come from the JWT-resolved session, never from
  // the request body. This closes the obvious cross-tenant attack
  // (caller in tenant A registering a token under tenant B's id).
  const tenantId = getTenantId(request) || authUser.tenant_id || null;
  if (!tenantId && !isSuperAdmin(authUser)) {
    return error('No tenant context — cannot register device', 400);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return error('Invalid JSON body', 400);
  }

  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  const platform = body?.platform;
  if (!token) return error('token is required', 400);
  if (token.length > 512) return error('token too long', 400);
  if (platform !== 'ios' && platform !== 'android') {
    return error('platform must be "ios" or "android"', 400);
  }

  // Optional metadata; truncate so a misbehaving client can't pad
  // the column with megabytes of garbage.
  const appVersion = typeof body?.app_version === 'string'
    ? body.app_version.slice(0, 32) : null;
  const osVersion = typeof body?.os_version === 'string'
    ? body.os_version.slice(0, 64) : null;

  const id = generateId();
  const effectiveTenantId = tenantId || authUser.tenant_id || '';

  // Single-statement UPSERT keyed by the UNIQUE(token) constraint.
  // On conflict, EVERY column except id + created_at is rewritten so
  // a re-registration after an account switch correctly re-points
  // the token at the new owner.
  await env.DB.prepare(`
    INSERT INTO device_tokens
      (id, user_id, tenant_id, platform, token, app_version, os_version,
       created_at, last_seen_at, is_active)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), 1)
    ON CONFLICT(token) DO UPDATE SET
      user_id = excluded.user_id,
      tenant_id = excluded.tenant_id,
      platform = excluded.platform,
      app_version = excluded.app_version,
      os_version = excluded.os_version,
      last_seen_at = datetime('now'),
      is_active = 1
  `).bind(id, authUser.id, effectiveTenantId, platform, token, appVersion, osVersion).run();

  // Look up the id of the row we just upserted — on conflict the
  // value we passed is discarded in favour of the existing id.
  const row = await env.DB.prepare(
    'SELECT id FROM device_tokens WHERE token = ? LIMIT 1'
  ).bind(token).first() as { id?: string } | null;

  return json({ success: true, device_id: row?.id ?? id });
});

// ──────────────────────────────────────────────────────────────────
// POST /api/devices/unregister
// Body: { token }
//
// Called from the frontend on explicit logout. Soft-deactivate only —
// we keep the row so audit queries can still resolve "which user
// owned this token at time T". The next sendApnsNotification() pass
// over WHERE is_active = 1 just skips it.
//
// Auth scope: the caller may only deactivate a token they own. A
// stolen JWT can't be used to silence push for another tenant's
// users.

route('POST', '/api/devices/unregister', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return error('Invalid JSON body', 400);
  }

  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  if (!token) return error('token is required', 400);

  await env.DB.prepare(
    `UPDATE device_tokens
        SET is_active = 0, last_seen_at = datetime('now')
      WHERE token = ? AND user_id = ?`
  ).bind(token, authUser.id).run();

  return json({ success: true });
});

// ──────────────────────────────────────────────────────────────────
// POST /api/devices/test-push
// Body: { user_id, title, body, data? }
//
// Super-admin-only manual fan-out tool — sends one APNs alert per
// active device the target user owns. Used to validate the APNs
// plumbing end-to-end without waiting for a real business event.
//
// Returns per-device results (truncated token + Apple's reason)
// instead of a single boolean so the caller can spot e.g. a single
// stale token reporting BadDeviceToken among otherwise-healthy ones.

route('POST', '/api/devices/test-push', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  if (!isSuperAdmin(authUser)) return error('Super-admin only', 403);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return error('Invalid JSON body', 400);
  }

  const userId = body?.user_id;
  const title = body?.title;
  const text = body?.body;
  if (typeof userId !== 'string' || !userId) {
    return error('user_id is required', 400);
  }
  if (typeof title !== 'string' || !title) {
    return error('title is required', 400);
  }
  if (typeof text !== 'string' || !text) {
    return error('body is required', 400);
  }
  const customData = body?.data && typeof body.data === 'object'
    ? body.data as Record<string, unknown>
    : undefined;

  const tokensRes = await env.DB.prepare(
    `SELECT token, platform FROM device_tokens
       WHERE user_id = ? AND is_active = 1`
  ).bind(userId).all();
  const tokens = (tokensRes.results || []) as { token: string; platform: string }[];

  if (tokens.length === 0) {
    return json({ sent: 0, failed: 0, results: [] });
  }

  let sent = 0;
  let failed = 0;
  const results: Array<{
    platform: string;
    token_prefix: string;
    ok: boolean;
    status: number;
    reason?: string;
  }> = [];

  for (const row of tokens) {
    // Android tokens (FCM) are out of scope this sprint — record an
    // unsupported result instead of attempting a non-existent send.
    if (row.platform === 'android') {
      failed += 1;
      results.push({
        platform: 'android',
        token_prefix: row.token.slice(0, 8),
        ok: false,
        status: 0,
        reason: 'Android (FCM) not implemented yet',
      });
      continue;
    }

    const res = await sendApnsNotification(env, row.token, {
      alert: { title, body: text },
      sound: 'default',
      ...(customData ? { data: customData } : {}),
    });

    if (res.ok) sent += 1;
    else failed += 1;
    results.push({
      platform: row.platform,
      token_prefix: row.token.slice(0, 8),
      ok: res.ok,
      status: res.statusCode,
      reason: res.reason,
    });

    // If Apple says BadDeviceToken / Unregistered, sweep is_active=0
    // immediately — otherwise we'll keep wasting JWT cycles on a
    // dead token every future broadcast.
    if (!res.ok && (res.reason === 'BadDeviceToken' || res.reason === 'Unregistered' || res.statusCode === 410)) {
      await env.DB.prepare(
        `UPDATE device_tokens SET is_active = 0, last_seen_at = datetime('now')
          WHERE token = ?`
      ).bind(row.token).run();
    }
  }

  return json({ sent, failed, results });
});

} // registerDeviceRoutes
