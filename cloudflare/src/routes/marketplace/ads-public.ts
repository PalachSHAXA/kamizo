// Resident-facing ad endpoints — browse ads, view details, assigned ads

import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { json, error, generateId } from '../../utils/helpers';
import { createRequestLogger } from '../../utils/logger';

export function registerAdPublicRoutes() {

// Get active ads for residents (public viewing)
route('GET', '/api/ads', async (request, env) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const url = new URL(request.url);
  const categoryId = url.searchParams.get('category');
  const search = url.searchParams.get('search')?.toLowerCase();

  let userBranch = (authUser as any).branch;
  if (!userBranch && (authUser as any).building_id) {
    const building = await env.DB.prepare(
      'SELECT branch_code FROM buildings WHERE id = ?'
    ).bind((authUser as any).building_id).first() as any;
    userBranch = building?.branch_code;
  }
  userBranch = userBranch || 'YS';
  const now = new Date().toISOString();
  const userTenantId = (authUser as any).tenant_id;

  let query = `
    SELECT a.*, c.name_ru as category_name, c.name_uz as category_name_uz, c.icon as category_icon,
      (SELECT COUNT(*) FROM ad_coupons WHERE ad_id = a.id AND user_id = ?) as user_has_coupon
    FROM ads a
    JOIN ad_categories c ON a.category_id = c.id
    WHERE a.status = 'active'
      AND (a.starts_at IS NULL OR ? >= a.starts_at)
      AND (a.expires_at IS NULL OR ? <= a.expires_at)
      AND (a.target_type IS NULL OR a.target_type = '' OR a.target_type = 'all'
           OR (a.target_type = 'branches' AND (a.target_branches IS NULL OR a.target_branches = '[]' OR a.target_branches LIKE ?)))
  `;
  const params: any[] = [authUser.id, now, now, `%${userBranch}%`];

  if (userTenantId) {
    query += ` AND (
      a.tenant_id = ?
      OR (a.tenant_id IS NULL AND EXISTS (
        SELECT 1 FROM ad_tenant_assignments ata
        WHERE ata.ad_id = a.id AND ata.tenant_id = ? AND ata.enabled = 1
      ))
    )`;
    params.push(userTenantId, userTenantId);
  }

  if (categoryId) { query += ` AND a.category_id = ?`; params.push(categoryId); }
  if (search) {
    query += ` AND (LOWER(a.title) LIKE ? OR LOWER(a.description) LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }

  query += ` ORDER BY json_extract(a.badges, '$.recommended') DESC, a.views_count DESC, a.created_at DESC LIMIT 500`;

  try {
    const { results } = await env.DB.prepare(query).bind(...params).all();
    const ads = results.map((ad: any) => ({
      ...ad,
      badges: ad.badges ? JSON.parse(ad.badges) : {},
      photos: ad.photos ? JSON.parse(ad.photos) : [],
      target_branches: ad.target_branches ? JSON.parse(ad.target_branches) : []
    }));
    return json({ ads });
  } catch (err: any) {
    const log = createRequestLogger(request);
    log.error('Error fetching ads', err, { query, params });
    return error('Internal server error', 500);
  }
});

// GET /api/ads/assigned - admin/manager/director sees platform ads assigned to their tenant
route('GET', '/api/ads/assigned', async (request, env) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  if (!['admin', 'manager', 'director'].includes(authUser.role)) return error('Access denied', 403);

  const tenantId = (authUser as any).tenant_id;
  if (!tenantId) return json({ ads: [] });

  const { results } = await env.DB.prepare(`
    SELECT a.*, c.name_ru as category_name, c.name_uz as category_name_uz, c.icon as category_icon,
      ata.enabled as tenant_enabled, ata.assigned_at
    FROM ads a
    JOIN ad_categories c ON a.category_id = c.id
    JOIN ad_tenant_assignments ata ON ata.ad_id = a.id AND ata.tenant_id = ?
    WHERE a.tenant_id IS NULL AND a.status != 'archived'
    ORDER BY a.created_at DESC
    LIMIT 500
  `).bind(tenantId).all();

  const ads = (results || []).map((ad: any) => ({
    ...ad,
    badges: ad.badges ? JSON.parse(ad.badges) : {},
    photos: ad.photos ? JSON.parse(ad.photos) : [],
  }));

  return json({ ads });
});

// Get single ad details
route('GET', '/api/ads/:id', async (request, env, params) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const ad = await env.DB.prepare(`
    SELECT a.*, c.name_ru as category_name, c.name_uz as category_name_uz, c.icon as category_icon
    FROM ads a
    JOIN ad_categories c ON a.category_id = c.id
    WHERE a.id = ?
  `).bind(params.id).first() as any;

  if (!ad) return error('Ad not found', 404);

  const viewId = generateId();
  try {
    await env.DB.prepare(`INSERT INTO ad_views (id, ad_id, user_id) VALUES (?, ?, ?)`).bind(viewId, params.id, authUser.id).run();
    await env.DB.prepare(`UPDATE ads SET views_count = views_count + 1 WHERE id = ?`).bind(params.id).run();
  } catch (e) { /* Ignore duplicate view errors */ }

  const existingCoupon = await env.DB.prepare(`SELECT * FROM ad_coupons WHERE ad_id = ? AND user_id = ?`).bind(params.id, authUser.id).first();

  ad.badges = ad.badges ? JSON.parse(ad.badges) : {};
  ad.photos = ad.photos ? JSON.parse(ad.photos) : [];

  return json({ ad, userCoupon: existingCoupon });
});

} // end registerAdPublicRoutes
