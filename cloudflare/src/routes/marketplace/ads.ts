// Advertising platform CRUD routes — advertiser + resident endpoints

import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { json, error, generateId, sanitizeAttachmentUrl, sanitizeUrl } from '../../utils/helpers';

// Sprint 78 P0/F2: validator for ad `photos` array. Same shape used in
// crud.ts for request photos but tailored to ads (5 images, 1 MB each).
function sanitizeAdPhotos(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const MAX_PHOTOS = 5;
  const MAX_PHOTO_BYTES = 1_400_000; // ~1 MB binary, ~33% base64 overhead
  const MAX_TOTAL_BYTES = 6_000_000;
  const out: string[] = [];
  let total = 0;
  for (const p of raw) {
    if (out.length >= MAX_PHOTOS) break;
    const url = sanitizeAttachmentUrl(p, { maxDataUrlBytes: MAX_PHOTO_BYTES });
    if (!url) continue;
    // Photo arrays should be images, never PDFs.
    if (url.startsWith('data:application/pdf')) continue;
    if (total + url.length > MAX_TOTAL_BYTES) break;
    out.push(url);
    total += url.length;
  }
  return out;
}
import { createRequestLogger } from '../../utils/logger';
import { isAdvertiser } from './helpers';

export function registerAdRoutes() {

// Get advertiser dashboard stats
route('GET', '/api/ads/dashboard', async (request, env) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!authUser || !isAdvertiser(authUser)) {
    return error('Advertiser access required', 403);
  }

  const stats = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM ads WHERE created_by = ? AND status = 'active') as active_ads,
      (SELECT COUNT(*) FROM ads WHERE created_by = ? AND status = 'expired') as expired_ads,
      (SELECT COUNT(*) FROM ads WHERE created_by = ? AND status = 'draft') as draft_ads,
      (SELECT SUM(views_count) FROM ads WHERE created_by = ?) as total_views,
      (SELECT SUM(coupons_issued) FROM ads WHERE created_by = ?) as total_coupons_issued,
      (SELECT SUM(coupons_activated) FROM ads WHERE created_by = ?) as total_coupons_activated
  `).bind(authUser.id, authUser.id, authUser.id, authUser.id, authUser.id, authUser.id).first();

  const { results: expiringSoon } = await env.DB.prepare(`
    SELECT id, title, expires_at
    FROM ads
    WHERE created_by = ? AND status = 'active'
      AND datetime(expires_at) BETWEEN datetime('now') AND datetime('now', '+3 days')
    ORDER BY expires_at ASC
    LIMIT 10
  `).bind(authUser.id).all();

  return json({ stats, expiringSoon });
});

// Get all ads for advertiser
route('GET', '/api/ads/my', async (request, env) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!authUser || !isAdvertiser(authUser)) {
    return error('Advertiser access required', 403);
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status');

  let query = `
    SELECT a.*, c.name_ru as category_name, c.icon as category_icon
    FROM ads a
    JOIN ad_categories c ON a.category_id = c.id
    WHERE a.created_by = ?
  `;
  const params: any[] = [authUser.id];

  if (status) {
    query += ` AND a.status = ?`;
    params.push(status);
  }

  query += ` ORDER BY a.created_at DESC LIMIT 500`;

  const { results } = await env.DB.prepare(query).bind(...params).all();
  return json({ ads: results });
});

// Create new ad
route('POST', '/api/ads', async (request, env) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  try {
    const authUser = await getUser(request, env);
    if (!authUser || !isAdvertiser(authUser)) {
      return error('Advertiser access required', 403);
    }

    const body = await request.json() as any;

    if (!body.category_id || !body.title || !body.phone) {
      return error('category_id, title, and phone are required', 400);
    }

    const now = new Date();
    let startsAt = body.starts_at || now.toISOString();
    let expiresAt = body.expires_at;

    if (!expiresAt) {
      const expDate = new Date(startsAt);
      switch (body.duration_type) {
        case 'week': expDate.setDate(expDate.getDate() + 7); break;
        case '2weeks': expDate.setDate(expDate.getDate() + 14); break;
        case '3months': expDate.setMonth(expDate.getMonth() + 3); break;
        case '6months': expDate.setMonth(expDate.getMonth() + 6); break;
        case 'year': expDate.setFullYear(expDate.getFullYear() + 1); break;
        default: expDate.setMonth(expDate.getMonth() + 1);
      }
      expiresAt = expDate.toISOString();
    }

    const id = generateId();

    await env.DB.prepare(`
      INSERT INTO ads (
        id, advertiser_id, category_id, title, description, phone, phone2, telegram, instagram, facebook, website,
        address, work_hours, work_days, logo_url, photos, discount_percent, badges,
        target_type, target_branches, target_buildings, starts_at, expires_at, duration_type, status, created_by, tenant_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, authUser.id, body.category_id, body.title, body.description || null,
      body.phone, body.phone2 || null, body.telegram || null, body.instagram || null,
      body.facebook || null, body.website || null, body.address || null,
      body.work_hours || null, body.work_days || null,
      // Sprint 78 P0/F2: sanitize logo + photos. Was passthrough, accepting
      // `javascript:` URLs and uncapped data-URL bombs that landed on every
      // resident's "useful contacts" page.
      sanitizeAttachmentUrl(body.logo_url, { maxDataUrlBytes: 1_400_000 }),
      (() => { const ph = sanitizeAdPhotos(body.photos); return ph && ph.length > 0 ? JSON.stringify(ph) : null; })(),
      body.discount_percent || 0,
      body.badges ? JSON.stringify(body.badges) : null, body.target_type || 'all',
      body.target_branches ? JSON.stringify(body.target_branches) : '[]',
      body.target_buildings ? JSON.stringify(body.target_buildings) : '[]',
      startsAt, expiresAt, body.duration_type || 'month', body.status || 'active',
      authUser.id, getTenantId(request)
    ).run();

    const created = await env.DB.prepare('SELECT * FROM ads WHERE id = ?').bind(id).first();
    return json({ ad: created }, 201);
  } catch (err: any) {
    const log = createRequestLogger(request);
    log.error('Error creating ad', err);
    return error('Failed to create ad', 500);
  }
});

// Update ad
route('PATCH', '/api/ads/:id', async (request, env, params) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!authUser || !isAdvertiser(authUser)) {
    return error('Advertiser access required', 403);
  }

  const ad = await env.DB.prepare('SELECT * FROM ads WHERE id = ? AND created_by = ?')
    .bind(params.id, authUser.id).first();
  if (!ad) return error('Ad not found', 404);

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  const fields = ['category_id', 'title', 'description', 'phone', 'phone2', 'telegram', 'instagram', 'facebook', 'website',
    'address', 'work_hours', 'work_days', 'logo_url', 'discount_percent', 'target_type',
    'starts_at', 'expires_at', 'duration_type', 'status'];

  for (const field of fields) {
    if (body[field] !== undefined) {
      let value = body[field];
      // Sprint 78 P0/F2: sanitize URL-like fields on update.
      if (field === 'logo_url') value = sanitizeAttachmentUrl(value, { maxDataUrlBytes: 1_400_000 });
      else if (field === 'website') value = sanitizeUrl(value);
      updates.push(`${field} = ?`); values.push(value);
    }
  }

  for (const jf of ['photos', 'badges', 'target_branches', 'target_buildings']) {
    if (body[jf] !== undefined) {
      // Sprint 78 P0/F2: photos go through the same sanitizer as create.
      if (jf === 'photos') {
        const ph = sanitizeAdPhotos(body[jf]);
        updates.push(`${jf} = ?`); values.push(ph && ph.length > 0 ? JSON.stringify(ph) : null);
      } else {
        updates.push(`${jf} = ?`); values.push(JSON.stringify(body[jf]));
      }
    }
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    values.push(params.id);
    await env.DB.prepare(`UPDATE ads SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
  }

  const updated = await env.DB.prepare('SELECT * FROM ads WHERE id = ?').bind(params.id).first();
  return json({ ad: updated });
});

// Delete ad (archive)
route('DELETE', '/api/ads/:id', async (request, env, params) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!authUser || !isAdvertiser(authUser)) {
    return error('Advertiser access required', 403);
  }

  const ad = await env.DB.prepare('SELECT id FROM ads WHERE id = ? AND created_by = ?')
    .bind(params.id, authUser.id).first();
  if (!ad) return error('Ad not found', 404);

  await env.DB.prepare("UPDATE ads SET status = 'archived' WHERE id = ?").bind(params.id).run();
  return json({ success: true });
});

} // end registerAdRoutes
