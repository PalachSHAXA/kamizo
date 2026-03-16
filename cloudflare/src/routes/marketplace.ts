// Marketplace, Advertising & Coupons routes — extracted from index.ts
// Contains: ads CRUD, coupons check/activate/history, marketplace products/cart/orders/admin

import type { Env } from '../types';
import { route } from '../router';
import { getUser } from '../middleware/auth';
import { getTenantId } from '../middleware/tenant';
import { json, error, generateId } from '../utils/helpers';
import { sendPushNotification, isExecutorRole } from '../index';

export function registerMarketplaceRoutes() {

// ==================== ADVERTISING PLATFORM (ПОЛЕЗНЫЕ КОНТАКТЫ) ====================
// Рекламная платформа с купонами
// - advertiser (менеджер рекламы): создаёт объявления, видит статистику, проверяет и активирует купоны
// - residents: только просмотр и получение купонов

// Helper: Generate 6-character coupon code (letters + numbers)
function generateCouponCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I,O,0,1 to avoid confusion
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Get ad categories
// PUBLIC: no auth required
route('GET', '/api/ads/categories', async (request, env) => {
  try {
    const { results } = await env.DB.prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM ads WHERE category_id = c.id AND is_active = 1) as active_ads_count
       FROM ad_categories c ORDER BY sort_order`
    ).all();
    return json({ categories: results });
  } catch (err: any) {
    console.error('Error fetching categories:', err.message);
    return error(`Database error: ${err.message}`, 500);
  }
});

// ==================== ADVERTISER (ukreklama) ENDPOINTS ====================

// Helper: Check if user is advertiser (account_type or role)
function isAdvertiser(user: any): boolean {
  return user?.account_type === 'advertiser' || user?.role === 'advertiser';
}


// Get advertiser dashboard stats
route('GET', '/api/ads/dashboard', async (request, env) => {
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

  // Ads expiring soon (within 3 days)
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

  query += ` ORDER BY a.created_at DESC`;

  const { results } = await env.DB.prepare(query).bind(...params).all();
  return json({ ads: results });
});

// Create new ad
route('POST', '/api/ads', async (request, env) => {
  try {
    const authUser = await getUser(request, env);
    if (!authUser || !isAdvertiser(authUser)) {
      return error('Advertiser access required', 403);
    }

    const body = await request.json() as any;

    if (!body.category_id || !body.title || !body.phone) {
      return error('category_id, title, and phone are required', 400);
    }

    // Calculate dates based on duration_type
    const now = new Date();
    let startsAt = body.starts_at || now.toISOString();
    let expiresAt = body.expires_at;

    if (!expiresAt) {
      const expDate = new Date(startsAt);
      switch (body.duration_type) {
        case 'week':
          expDate.setDate(expDate.getDate() + 7);
          break;
        case '2weeks':
          expDate.setDate(expDate.getDate() + 14);
          break;
        case '3months':
          expDate.setMonth(expDate.getMonth() + 3);
          break;
        case '6months':
          expDate.setMonth(expDate.getMonth() + 6);
          break;
        case 'year':
          expDate.setFullYear(expDate.getFullYear() + 1);
          break;
        default: // month
          expDate.setMonth(expDate.getMonth() + 1);
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
      id,
      authUser.id,
      body.category_id,
      body.title,
      body.description || null,
      body.phone,
      body.phone2 || null,
      body.telegram || null,
      body.instagram || null,
      body.facebook || null,
      body.website || null,
      body.address || null,
      body.work_hours || null,
      body.work_days || null,
      body.logo_url || null,
      body.photos ? JSON.stringify(body.photos) : null,
      body.discount_percent || 0,
      body.badges ? JSON.stringify(body.badges) : null,
      body.target_type || 'all',
      body.target_branches ? JSON.stringify(body.target_branches) : '[]',
      body.target_buildings ? JSON.stringify(body.target_buildings) : '[]',
      startsAt,
      expiresAt,
      body.duration_type || 'month',
      body.status || 'active',
      authUser.id,
      getTenantId(request)
    ).run();

    const created = await env.DB.prepare('SELECT * FROM ads WHERE id = ?').bind(id).first();
    return json({ ad: created }, 201);
  } catch (err: any) {
    console.error('Error creating ad:', err.message);
    return error(`Failed to create ad: ${err.message}`, 500);
  }
});

// Update ad
route('PATCH', '/api/ads/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser || !isAdvertiser(authUser)) {
    return error('Advertiser access required', 403);
  }

  const ad = await env.DB.prepare('SELECT * FROM ads WHERE id = ? AND created_by = ?')
    .bind(params.id, authUser.id).first();

  if (!ad) {
    return error('Ad not found', 404);
  }

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  const fields = ['category_id', 'title', 'description', 'phone', 'phone2', 'telegram', 'instagram', 'facebook', 'website',
    'address', 'work_hours', 'work_days', 'logo_url', 'discount_percent', 'target_type',
    'starts_at', 'expires_at', 'duration_type', 'status'];

  for (const field of fields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(body[field]);
    }
  }

  // JSON fields
  if (body.photos !== undefined) {
    updates.push('photos = ?');
    values.push(JSON.stringify(body.photos));
  }
  if (body.badges !== undefined) {
    updates.push('badges = ?');
    values.push(JSON.stringify(body.badges));
  }
  if (body.target_branches !== undefined) {
    updates.push('target_branches = ?');
    values.push(JSON.stringify(body.target_branches));
  }
  if (body.target_buildings !== undefined) {
    updates.push('target_buildings = ?');
    values.push(JSON.stringify(body.target_buildings));
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    values.push(params.id);
    await env.DB.prepare(`UPDATE ads SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
  }

  const updated = await env.DB.prepare('SELECT * FROM ads WHERE id = ?').bind(params.id).first();
  return json({ ad: updated });
});

// Delete ad
route('DELETE', '/api/ads/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser || !isAdvertiser(authUser)) {
    return error('Advertiser access required', 403);
  }

  const ad = await env.DB.prepare('SELECT id FROM ads WHERE id = ? AND created_by = ?')
    .bind(params.id, authUser.id).first();

  if (!ad) {
    return error('Ad not found', 404);
  }

  // Archive instead of delete
  await env.DB.prepare("UPDATE ads SET status = 'archived' WHERE id = ?").bind(params.id).run();
  return json({ success: true });
});

// Get coupon history for an ad
route('GET', '/api/ads/:id/coupons', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser || !isAdvertiser(authUser)) {
    return error('Advertiser access required', 403);
  }

  const ad = await env.DB.prepare('SELECT id FROM ads WHERE id = ? AND created_by = ?')
    .bind(params.id, authUser.id).first();

  if (!ad) {
    return error('Ad not found', 404);
  }

  const { results } = await env.DB.prepare(`
    SELECT c.*, u.name as user_name, u.phone as user_phone,
      checker.name as activated_by_name
    FROM ad_coupons c
    JOIN users u ON c.user_id = u.id
    LEFT JOIN users checker ON c.activated_by = checker.id
    WHERE c.ad_id = ?
    ORDER BY c.issued_at DESC
    LIMIT 100
  `).bind(params.id).all();

  return json({ coupons: results });
});

// ==================== COUPON MANAGEMENT ENDPOINTS ====================

// Check coupon (get info without activating)
route('GET', '/api/coupons/check/:code', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser || !isAdvertiser(authUser)) {
    return error('Coupon checker access required', 403);
  }

  const code = params.code.toUpperCase();

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const coupon = await env.DB.prepare(`
    SELECT c.*,
      a.title as ad_title, a.phone as ad_phone, a.description as ad_description,
      u.name as user_name, u.phone as user_phone
    FROM ad_coupons c
    JOIN ads a ON c.ad_id = a.id
    JOIN users u ON c.user_id = u.id
    WHERE c.code = ? ${tenantId ? 'AND c.tenant_id = ?' : ''}
  `).bind(code, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!coupon) {
    return error('Купон не найден', 404);
  }

  // Check if expired
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return json({
      coupon,
      valid: false,
      reason: 'Срок действия купона истёк'
    });
  }

  if (coupon.status === 'activated') {
    return json({
      coupon,
      valid: false,
      reason: `Купон уже активирован ${new Date(coupon.activated_at).toLocaleString('ru-RU')}`
    });
  }

  if (coupon.status === 'cancelled') {
    return json({
      coupon,
      valid: false,
      reason: 'Купон отменён'
    });
  }

  return json({
    coupon,
    valid: true,
    discount_percent: coupon.discount_percent
  });
});

// Activate coupon
route('POST', '/api/coupons/activate/:code', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser || !isAdvertiser(authUser)) {
    return error('Coupon checker access required', 403);
  }

  const code = params.code.toUpperCase();
  const body = await request.json() as any;
  const amount = body.amount || 0;

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const coupon = await env.DB.prepare(`
    SELECT c.*, a.id as ad_id
    FROM ad_coupons c
    JOIN ads a ON c.ad_id = a.id
    WHERE c.code = ? ${tenantId ? 'AND c.tenant_id = ?' : ''}
  `).bind(code, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!coupon) {
    return error('Купон не найден', 404);
  }

  if (coupon.status !== 'issued') {
    return error('Купон уже использован или недействителен', 400);
  }

  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return error('Срок действия купона истёк', 400);
  }

  const discountAmount = amount * (coupon.discount_percent / 100);

  // Activate coupon
  await env.DB.prepare(`
    UPDATE ad_coupons SET
      status = 'activated',
      activated_at = datetime('now'),
      activated_by = ?,
      activation_amount = ?,
      discount_amount = ?
    WHERE code = ?
  `).bind(authUser.id, amount, discountAmount, code).run();

  // Update ad stats
  await env.DB.prepare(`
    UPDATE ads SET coupons_activated = coupons_activated + 1 WHERE id = ?
  `).bind(coupon.ad_id).run();

  const updated = await env.DB.prepare('SELECT * FROM ad_coupons WHERE code = ?').bind(code).first();

  return json({
    success: true,
    coupon: updated,
    discount_amount: discountAmount,
    final_amount: amount - discountAmount
  });
});

// Get activation history for checker
route('GET', '/api/coupons/history', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser || !isAdvertiser(authUser)) {
    return error('Coupon checker access required', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const { results } = await env.DB.prepare(`
    SELECT c.*, a.title as ad_title, u.name as user_name
    FROM ad_coupons c
    JOIN ads a ON c.ad_id = a.id
    JOIN users u ON c.user_id = u.id
    WHERE c.activated_by = ? ${tenantId ? 'AND c.tenant_id = ?' : ''}
    ORDER BY c.activated_at DESC
    LIMIT 100
  `).bind(authUser.id, ...(tenantId ? [tenantId] : [])).all();

  return json({ activations: results });
});

// ==================== RESIDENT (жители) ENDPOINTS ====================

// Get active ads for residents (public viewing)
route('GET', '/api/ads', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const url = new URL(request.url);
  const categoryId = url.searchParams.get('category');
  const search = url.searchParams.get('search')?.toLowerCase();

  // Get user's branch for targeting - try from user.branch first, then from building
  let userBranch = (authUser as any).branch;
  if (!userBranch && (authUser as any).building_id) {
    const building = await env.DB.prepare(
      'SELECT branch_code FROM buildings WHERE id = ?'
    ).bind((authUser as any).building_id).first() as any;
    userBranch = building?.branch_code;
  }
  userBranch = userBranch || 'YS'; // Default fallback
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

  // Filter by tenant: show tenant-specific ads OR enabled platform ads for this tenant
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

  if (categoryId) {
    query += ` AND a.category_id = ?`;
    params.push(categoryId);
  }

  if (search) {
    query += ` AND (LOWER(a.title) LIKE ? OR LOWER(a.description) LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }

  // Order: recommended first, then by views
  query += ` ORDER BY json_extract(a.badges, '$.recommended') DESC, a.views_count DESC, a.created_at DESC`;

  try {
    const { results } = await env.DB.prepare(query).bind(...params).all();

    // Parse JSON fields
    const ads = results.map((ad: any) => ({
      ...ad,
      badges: ad.badges ? JSON.parse(ad.badges) : {},
      photos: ad.photos ? JSON.parse(ad.photos) : [],
      target_branches: ad.target_branches ? JSON.parse(ad.target_branches) : []
    }));

    return json({ ads });
  } catch (err: any) {
    console.error('Error fetching ads:', err.message, 'Query:', query, 'Params:', params);
    return error(`Database error: ${err.message}`, 500);
  }
});

// GET /api/ads/assigned - admin/manager/director sees platform ads assigned to their tenant
route('GET', '/api/ads/assigned', async (request, env) => {
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
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const ad = await env.DB.prepare(`
    SELECT a.*, c.name_ru as category_name, c.name_uz as category_name_uz, c.icon as category_icon
    FROM ads a
    JOIN ad_categories c ON a.category_id = c.id
    WHERE a.id = ?
  `).bind(params.id).first() as any;

  if (!ad) {
    return error('Ad not found', 404);
  }

  // Record view (once per user per day)
  const viewId = generateId();
  try {
    await env.DB.prepare(`
      INSERT INTO ad_views (id, ad_id, user_id) VALUES (?, ?, ?)
    `).bind(viewId, params.id, authUser.id).run();

    // Update view count
    await env.DB.prepare(`UPDATE ads SET views_count = views_count + 1 WHERE id = ?`).bind(params.id).run();
  } catch (e) {
    // Ignore duplicate view errors (UNIQUE constraint)
  }

  // Check if user already has a coupon
  const existingCoupon = await env.DB.prepare(`
    SELECT * FROM ad_coupons WHERE ad_id = ? AND user_id = ?
  `).bind(params.id, authUser.id).first();

  // Parse JSON fields
  ad.badges = ad.badges ? JSON.parse(ad.badges) : {};
  ad.photos = ad.photos ? JSON.parse(ad.photos) : [];

  return json({
    ad,
    userCoupon: existingCoupon
  });
});

// Get coupon for an ad (resident only)
route('POST', '/api/ads/:id/get-coupon', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  if (authUser.role !== 'resident') {
    return error('Only residents can get coupons', 403);
  }

  const now = new Date().toISOString();
  const ad = await env.DB.prepare(`
    SELECT * FROM ads WHERE id = ? AND status = 'active'
    AND (starts_at IS NULL OR ? >= starts_at)
    AND (expires_at IS NULL OR ? <= expires_at)
  `).bind(params.id, now, now).first() as any;

  if (!ad) {
    return error('Ad not found or not active', 404);
  }

  if (!ad.discount_percent || ad.discount_percent <= 0) {
    return error('This ad has no discount', 400);
  }

  // Check if user already has a coupon for this ad
  const existing = await env.DB.prepare(`
    SELECT * FROM ad_coupons WHERE ad_id = ? AND user_id = ?
  `).bind(params.id, authUser.id).first();

  if (existing) {
    return json({ coupon: existing, message: 'Вы уже получили купон на эту акцию' });
  }

  // Generate unique coupon code
  let code: string;
  let attempts = 0;
  do {
    code = generateCouponCode();
    const exists = await env.DB.prepare('SELECT id FROM ad_coupons WHERE code = ?').bind(code).first();
    if (!exists) break;
    attempts++;
  } while (attempts < 10);

  if (attempts >= 10) {
    return error('Failed to generate unique code', 500);
  }

  const couponId = generateId();

  await env.DB.prepare(`
    INSERT INTO ad_coupons (id, ad_id, user_id, code, discount_percent, discount_value, expires_at, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(couponId, params.id, authUser.id, code, ad.discount_percent, ad.discount_percent || 0, ad.expires_at, getTenantId(request)).run();

  // Update ad stats
  await env.DB.prepare(`UPDATE ads SET coupons_issued = coupons_issued + 1 WHERE id = ?`).bind(params.id).run();

  const coupon = await env.DB.prepare('SELECT * FROM ad_coupons WHERE id = ?').bind(couponId).first();

  return json({
    coupon,
    message: `Ваш промокод: ${code}. Скидка ${ad.discount_percent}%`
  }, 201);
});

// Get user's coupons
route('GET', '/api/my-coupons', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const { results } = await env.DB.prepare(`
    SELECT c.*, a.title as ad_title, a.phone as ad_phone, a.description as ad_description,
      a.logo_url, cat.name_ru as category_name
    FROM ad_coupons c
    JOIN ads a ON c.ad_id = a.id
    JOIN ad_categories cat ON a.category_id = cat.id
    WHERE c.user_id = ? ${tenantId ? 'AND c.tenant_id = ?' : ''}
    ORDER BY c.issued_at DESC
  `).bind(authUser.id, ...(tenantId ? [tenantId] : [])).all();

  return json({ coupons: results });
});

// ==================== MARKETPLACE API ====================

// Marketplace: Get categories
// PUBLIC: no auth required
route('GET', '/api/marketplace/categories', async (request, env) => {
  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);
  const { results } = await env.DB.prepare(`
    SELECT * FROM marketplace_categories WHERE is_active = 1 ${tenantId ? "AND (tenant_id = ? OR tenant_id IS NULL OR tenant_id = '')" : ''}
    ORDER BY sort_order
  `).bind(...(tenantId ? [tenantId] : [])).all();
  return json({ categories: results });
});

// Marketplace: Get products (with filtering)
// PUBLIC: no auth required
route('GET', '/api/marketplace/products', async (request, env) => {
  const url = new URL(request.url);
  const categoryId = url.searchParams.get('category');
  const search = url.searchParams.get('search');
  const featured = url.searchParams.get('featured');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = (page - 1) * limit;

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  let whereClause = 'WHERE p.is_active = 1';
  const params: any[] = [];

  if (tenantId) {
    whereClause += ' AND p.tenant_id = ?';
    params.push(tenantId);
  }

  if (categoryId) {
    whereClause += ' AND p.category_id = ?';
    params.push(categoryId);
  }
  if (search) {
    whereClause += ' AND (p.name_ru LIKE ? OR p.name_uz LIKE ? OR p.description_ru LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (featured === 'true') {
    whereClause += ' AND p.is_featured = 1';
  }

  const countResult = await env.DB.prepare(`SELECT COUNT(*) as total FROM marketplace_products p ${whereClause}`).bind(...params).first() as any;
  const total = countResult?.total || 0;

  params.push(limit, offset);
  const { results } = await env.DB.prepare(`
    SELECT p.*, c.name_ru as category_name_ru, c.name_uz as category_name_uz, c.icon as category_icon
    FROM marketplace_products p
    LEFT JOIN marketplace_categories c ON p.category_id = c.id
    ${whereClause}
    ORDER BY p.is_featured DESC, p.orders_count DESC, p.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...params).all();

  return json({
    products: results,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

// Marketplace: Get single product
// PUBLIC: no auth required
route('GET', '/api/marketplace/products/:id', async (request, env, params) => {
  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const product = await env.DB.prepare(`
    SELECT p.*, c.name_ru as category_name_ru, c.name_uz as category_name_uz, c.icon as category_icon
    FROM marketplace_products p
    LEFT JOIN marketplace_categories c ON p.category_id = c.id
    WHERE p.id = ? ${tenantId ? 'AND p.tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  if (!product) return error('Product not found', 404);

  // Get reviews
  const { results: reviews } = await env.DB.prepare(`
    SELECT r.*, u.name as user_name
    FROM marketplace_reviews r
    LEFT JOIN users u ON r.user_id = u.id
    WHERE r.product_id = ? AND r.is_visible = 1 ${tenantId ? 'AND r.tenant_id = ?' : ''}
    ORDER BY r.created_at DESC
    LIMIT 10
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).all();

  return json({ product, reviews });
});

// Marketplace: Cart - Get
route('GET', '/api/marketplace/cart', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantIdCart = getTenantId(request);
  const { results } = await env.DB.prepare(`
    SELECT c.*, p.name_ru, p.name_uz, p.price, p.old_price, p.image_url, p.stock_quantity, p.unit,
           cat.name_ru as category_name_ru, cat.icon as category_icon
    FROM marketplace_cart c
    JOIN marketplace_products p ON c.product_id = p.id
    LEFT JOIN marketplace_categories cat ON p.category_id = cat.id
    WHERE c.user_id = ? ${tenantIdCart ? 'AND p.tenant_id = ?' : ''}
    ORDER BY c.created_at DESC
  `).bind(user.id, ...(tenantIdCart ? [tenantIdCart] : [])).all();

  const total = (results as any[]).reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const itemsCount = (results as any[]).reduce((sum, item) => sum + item.quantity, 0);

  return json({ cart: results, total, itemsCount });
});

// Marketplace: Cart - Add/Update item
route('POST', '/api/marketplace/cart', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantIdCart = getTenantId(request);
  const body = await request.json() as any;
  const { product_id, quantity = 1 } = body;

  if (!product_id || typeof quantity !== 'number' || quantity < 1) {
    return error('Invalid product or quantity');
  }

  // Check product exists and in stock (tenant-filtered)
  const product = await env.DB.prepare(`SELECT * FROM marketplace_products WHERE id = ? AND is_active = 1 ${tenantIdCart ? 'AND tenant_id = ?' : ''}`).bind(product_id, ...(tenantIdCart ? [tenantIdCart] : [])).first() as any;
  if (!product) return error('Product not found', 404);

  // Get current quantity in cart (if any)
  const existingCartItem = await env.DB.prepare(`
    SELECT quantity FROM marketplace_cart WHERE user_id = ? AND product_id = ?
  `).bind(user.id, product_id).first() as any;

  // Calculate total reserved stock from ALL users' carts for this product (excluding current user's existing quantity)
  const reservedStock = await env.DB.prepare(`
    SELECT COALESCE(SUM(quantity), 0) as total FROM marketplace_cart
    WHERE product_id = ? AND user_id != ? ${tenantIdCart ? 'AND tenant_id = ?' : ''}
  `).bind(product_id, user.id, ...(tenantIdCart ? [tenantIdCart] : [])).first() as any;

  const otherUsersReserved = reservedStock?.total || 0;
  const availableStock = product.stock_quantity - otherUsersReserved;

  if (availableStock < quantity) {
    return error(`Недостаточно товара. Доступно: ${Math.max(0, availableStock)} шт.`, 400);
  }

  // Upsert cart item
  await env.DB.prepare(`
    INSERT INTO marketplace_cart (id, user_id, product_id, quantity, created_at, updated_at, tenant_id)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), ?)
    ON CONFLICT(user_id, product_id) DO UPDATE SET quantity = ?, updated_at = datetime('now')
  `).bind(generateId(), user.id, product_id, quantity, tenantIdCart, quantity).run();

  return json({ success: true });
});

// Marketplace: Cart - Remove item
route('DELETE', '/api/marketplace/cart/:productId', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantIdCartDel = getTenantId(request);
  if (tenantIdCartDel) {
    // Only delete if product belongs to this tenant
    await env.DB.prepare(`DELETE FROM marketplace_cart WHERE user_id = ? AND product_id IN (SELECT id FROM marketplace_products WHERE id = ? AND tenant_id = ?)`).bind(user.id, params.productId, tenantIdCartDel).run();
  } else {
    await env.DB.prepare(`DELETE FROM marketplace_cart WHERE user_id = ? AND product_id = ?`).bind(user.id, params.productId).run();
  }
  return json({ success: true });
});

// Marketplace: Cart - Clear
route('DELETE', '/api/marketplace/cart', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantIdCartClear = getTenantId(request);
  await env.DB.prepare(`DELETE FROM marketplace_cart WHERE user_id = ? ${tenantIdCartClear ? 'AND tenant_id = ?' : ''}`).bind(user.id, ...(tenantIdCartClear ? [tenantIdCartClear] : [])).run();
  return json({ success: true });
});

// Marketplace: Create order
route('POST', '/api/marketplace/orders', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  try {
    const body = await request.json() as any;
    const { delivery_date, delivery_time_slot, delivery_notes, payment_method } = body;

    const tenantIdOrder = getTenantId(request);
    console.log('[Marketplace Order] Creating order for user:', user.id, user.name);
    console.log('[Marketplace Order] Request body:', body);

    // Get cart items with current stock (tenant-filtered via products)
    const { results: cartItems } = await env.DB.prepare(`
      SELECT c.*, p.name_ru, p.price, p.image_url, p.stock_quantity
      FROM marketplace_cart c
      JOIN marketplace_products p ON c.product_id = p.id
      WHERE c.user_id = ? ${tenantIdOrder ? 'AND p.tenant_id = ?' : ''}
    `).bind(user.id, ...(tenantIdOrder ? [tenantIdOrder] : [])).all() as { results: any[] };

    console.log('[Marketplace Order] Cart items found:', cartItems?.length || 0);

    if (!cartItems || cartItems.length === 0) {
      console.log('[Marketplace Order] ERROR: Cart is empty');
      return error('Cart is empty', 400);
    }

    // Validate stock availability BEFORE creating order
    const outOfStockItems: string[] = [];
    for (const item of cartItems) {
      if (item.stock_quantity < item.quantity) {
        outOfStockItems.push(`${item.name_ru} (доступно: ${item.stock_quantity}, в корзине: ${item.quantity})`);
      }
    }
    if (outOfStockItems.length > 0) {
      console.log('[Marketplace Order] ERROR: Insufficient stock for items:', outOfStockItems);
      return error(`Недостаточно товара на складе: ${outOfStockItems.join(', ')}`, 400);
    }

    // Calculate totals
    const totalAmount = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const deliveryFee = totalAmount >= 100000 ? 0 : 15000; // Free delivery over 100k
    const finalAmount = totalAmount + deliveryFee;

    // Generate order number (MP-YYYYMMDD-XXXX)
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const orderCount = await env.DB.prepare(`SELECT COUNT(*) as count FROM marketplace_orders WHERE order_number LIKE ? ${tenantIdOrder ? 'AND tenant_id = ?' : ''}`).bind(`MP-${today}%`, ...(tenantIdOrder ? [tenantIdOrder] : [])).first() as any;
    const orderNumber = `MP-${today}-${String((orderCount?.count || 0) + 1).padStart(4, '0')}`;

    const orderId = generateId();

    // Use batch to ensure atomicity - all operations succeed or all fail
    const statements = [];

    // 1. Create order (MULTI-TENANCY: Add tenant_id)
    statements.push(env.DB.prepare(`
      INSERT INTO marketplace_orders (
        id, order_number, user_id, status, total_amount, delivery_fee, final_amount,
        delivery_address, delivery_apartment, delivery_entrance, delivery_floor, delivery_phone,
        delivery_date, delivery_time_slot, delivery_notes, payment_method, tenant_id
      ) VALUES (?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      orderId, orderNumber, user.id, totalAmount, deliveryFee, finalAmount,
      user.address || '', user.apartment || '', user.entrance || '', user.floor || '', user.phone || '',
      delivery_date || null, delivery_time_slot || null, delivery_notes || null, payment_method || 'cash', getTenantId(request)
    ));

    // 2. Create order items and update stock atomically
    for (const item of cartItems) {
      // Insert order item
      statements.push(env.DB.prepare(`
        INSERT INTO marketplace_order_items (id, order_id, product_id, product_name, product_image, quantity, unit_price, total_price, tenant_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(generateId(), orderId, item.product_id, item.name_ru, item.image_url, item.quantity, item.price, item.price * item.quantity, getTenantId(request)));

      // Update stock with validation to prevent negative values
      statements.push(env.DB.prepare(`
        UPDATE marketplace_products
        SET orders_count = orders_count + 1,
            stock_quantity = CASE
              WHEN stock_quantity >= ? THEN stock_quantity - ?
              ELSE stock_quantity
            END
        WHERE id = ? AND stock_quantity >= ? ${tenantIdOrder ? 'AND tenant_id = ?' : ''}
      `).bind(item.quantity, item.quantity, item.product_id, item.quantity, ...(tenantIdOrder ? [tenantIdOrder] : [])));
    }

    // 3. Add order history
    statements.push(env.DB.prepare(`
      INSERT INTO marketplace_order_history (id, order_id, status, comment, changed_by, tenant_id)
      VALUES (?, ?, 'new', 'Заказ создан', ?, ?)
    `).bind(generateId(), orderId, user.id, getTenantId(request)));

    // 4. Clear cart
    statements.push(env.DB.prepare(`DELETE FROM marketplace_cart WHERE user_id = ?`).bind(user.id));

    // Execute all statements as a batch (atomic transaction)
    await env.DB.batch(statements);

    // Create notification for managers (DB + push)
    const managers = await env.DB.prepare(`SELECT id FROM users WHERE role IN ('admin', 'director', 'manager', 'marketplace_manager') ${tenantIdOrder ? 'AND tenant_id = ?' : ''}`).bind(...(tenantIdOrder ? [tenantIdOrder] : [])).all() as { results: any[] };
    const orderNotifBody = `Заказ ${orderNumber} на сумму ${finalAmount.toLocaleString()} сум`;
    for (const manager of (managers.results || [])) {
      await env.DB.prepare(`
        INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id)
        VALUES (?, ?, 'marketplace_order', 'Новый заказ', ?, ?, 0, datetime('now'), ?)
      `).bind(generateId(), manager.id, orderNotifBody, JSON.stringify({ order_id: orderId }), getTenantId(request)).run();
      sendPushNotification(env, manager.id, {
        title: '🛒 Новый заказ',
        body: orderNotifBody,
        type: 'marketplace_order',
        tag: `order-new-${orderId}`,
        data: { orderId, url: '/marketplace' },
        requireInteraction: true
      }).catch(() => {});
    }

    console.log('[Marketplace Order] Order created successfully:', orderNumber);
    return json({ order: { id: orderId, order_number: orderNumber, final_amount: finalAmount } }, 201);
  } catch (e: any) {
    console.error('[Marketplace Order] ERROR:', e.message, e.stack);
    return error(e.message || 'Failed to create order', 500);
  }
});

// Marketplace: Get user orders
route('GET', '/api/marketplace/orders', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const url = new URL(request.url);
  const status = url.searchParams.get('status');

  let whereClause = 'WHERE o.user_id = ?';
  const params: any[] = [user.id];

  if (tenantId) {
    whereClause += ' AND o.tenant_id = ?';
    params.push(tenantId);
  }

  if (status) {
    whereClause += ' AND o.status = ?';
    params.push(status);
  }

  const { results } = await env.DB.prepare(`
    SELECT o.*,
      (SELECT COUNT(*) FROM marketplace_order_items WHERE order_id = o.id) as items_count
    FROM marketplace_orders o
    ${whereClause}
    ORDER BY o.created_at DESC
  `).bind(...params).all();

  // Fetch items for each order
  const ordersWithItems = await Promise.all((results || []).map(async (order: any) => {
    const { results: items } = await env.DB.prepare(`
      SELECT id, product_id, product_name, product_image, quantity, unit_price, total_price
      FROM marketplace_order_items WHERE order_id = ?
    `).bind(order.id).all();
    return { ...order, items: items || [] };
  }));

  return json({ orders: ordersWithItems });
});

// Marketplace: Get single order with items
route('GET', '/api/marketplace/orders/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const order = await env.DB.prepare(`
    SELECT * FROM marketplace_orders WHERE id = ? AND (user_id = ? OR ? IN ('admin', 'director', 'manager', 'marketplace_manager'))
    ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, user.id, user.role, ...(tenantId ? [tenantId] : [])).first();

  if (!order) return error('Order not found', 404);

  const { results: items } = await env.DB.prepare(`
    SELECT * FROM marketplace_order_items WHERE order_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).all();

  const { results: history } = await env.DB.prepare(`
    SELECT h.*, u.name as changed_by_name
    FROM marketplace_order_history h
    LEFT JOIN users u ON h.changed_by = u.id
    WHERE h.order_id = ? ${tenantId ? 'AND h.tenant_id = ?' : ''}
    ORDER BY h.created_at DESC
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).all();

  return json({ order, items, history });
});

// Marketplace: Get order items (for manager dashboard)
route('GET', '/api/marketplace/orders/:id/items', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantIdItems = getTenantId(request);

  // Allow marketplace managers and admins to view order items
  if (!['admin', 'director', 'manager', 'marketplace_manager'].includes(user.role)) {
    // For regular users, check if it's their order
    const order = await env.DB.prepare(`
      SELECT id FROM marketplace_orders WHERE id = ? AND user_id = ? ${tenantIdItems ? 'AND tenant_id = ?' : ''}
    `).bind(params.id, user.id, ...(tenantIdItems ? [tenantIdItems] : [])).first();

    if (!order) return error('Access denied', 403);
  } else if (tenantIdItems) {
    // For managers, verify the order belongs to this tenant
    const order = await env.DB.prepare(`SELECT id FROM marketplace_orders WHERE id = ? AND tenant_id = ?`).bind(params.id, tenantIdItems).first();
    if (!order) return error('Order not found', 404);
  }

  const { results: items } = await env.DB.prepare(`
    SELECT * FROM marketplace_order_items WHERE order_id = ?
  `).bind(params.id).all();

  return json({ items });
});

// Marketplace: Cancel order (by user)
route('POST', '/api/marketplace/orders/:id/cancel', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantIdCancel = getTenantId(request);
  const body = await request.json() as any;
  const order = await env.DB.prepare(`SELECT * FROM marketplace_orders WHERE id = ? AND user_id = ? ${tenantIdCancel ? 'AND tenant_id = ?' : ''}`).bind(params.id, user.id, ...(tenantIdCancel ? [tenantIdCancel] : [])).first() as any;

  if (!order) return error('Order not found', 404);
  if (!['new', 'confirmed'].includes(order.status)) {
    return error('Cannot cancel order in this status');
  }

  // Get order items to return stock
  const orderItems = await env.DB.prepare(`
    SELECT product_id, quantity FROM marketplace_order_items WHERE order_id = ? ${tenantIdCancel ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantIdCancel ? [tenantIdCancel] : [])).all() as { results: { product_id: string, quantity: number }[] };

  // Return stock for each item
  for (const item of (orderItems.results || [])) {
    await env.DB.prepare(`
      UPDATE marketplace_products
      SET stock_quantity = stock_quantity + ?
      WHERE id = ? ${tenantIdCancel ? 'AND tenant_id = ?' : ''}
    `).bind(item.quantity, item.product_id, ...(tenantIdCancel ? [tenantIdCancel] : [])).run();
  }

  await env.DB.prepare(`
    UPDATE marketplace_orders SET status = 'cancelled', cancelled_at = datetime('now'), cancellation_reason = ?, updated_at = datetime('now')
    WHERE id = ? ${tenantIdCancel ? 'AND tenant_id = ?' : ''}
  `).bind(body.reason || 'Отменено покупателем', params.id, ...(tenantIdCancel ? [tenantIdCancel] : [])).run();

  await env.DB.prepare(`
    INSERT INTO marketplace_order_history (id, order_id, status, comment, changed_by, tenant_id)
    VALUES (?, ?, 'cancelled', ?, ?, ?)
  `).bind(generateId(), params.id, body.reason || 'Отменено покупателем', user.id, tenantIdCancel).run();

  return json({ success: true });
});

// Marketplace: Rate order
route('POST', '/api/marketplace/orders/:id/rate', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const { rating, review } = body;

  // Validate rating value
  if (typeof rating !== 'number' || rating < 1 || rating > 5) {
    return error('Рейтинг должен быть от 1 до 5', 400);
  }

  const tenantIdRate = getTenantId(request);
  const order = await env.DB.prepare(`SELECT * FROM marketplace_orders WHERE id = ? AND user_id = ? AND status = 'delivered' ${tenantIdRate ? 'AND tenant_id = ?' : ''}`).bind(params.id, user.id, ...(tenantIdRate ? [tenantIdRate] : [])).first() as any;
  if (!order) return error('Order not found or not delivered', 404);

  // Prevent double rating
  if (order.rating) {
    return error('Вы уже оценили этот заказ', 400);
  }

  await env.DB.prepare(`UPDATE marketplace_orders SET rating = ?, review = ? WHERE id = ? ${tenantIdRate ? 'AND tenant_id = ?' : ''}`).bind(rating, review || null, params.id, ...(tenantIdRate ? [tenantIdRate] : [])).run();
  return json({ success: true });
});

// Marketplace: Favorites - Get
route('GET', '/api/marketplace/favorites', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantIdFav = getTenantId(request);
  const { results } = await env.DB.prepare(`
    SELECT p.*, c.name_ru as category_name_ru, c.icon as category_icon
    FROM marketplace_favorites f
    JOIN marketplace_products p ON f.product_id = p.id
    LEFT JOIN marketplace_categories c ON p.category_id = c.id
    WHERE f.user_id = ? ${tenantIdFav ? 'AND p.tenant_id = ?' : ''}
    ORDER BY f.created_at DESC
  `).bind(user.id, ...(tenantIdFav ? [tenantIdFav] : [])).all();

  return json({ favorites: results });
});

// Marketplace: Favorites - Toggle
route('POST', '/api/marketplace/favorites/:productId', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // Verify product belongs to this tenant
  const tenantIdFavToggle = getTenantId(request);
  if (tenantIdFavToggle) {
    const product = await env.DB.prepare(`SELECT id FROM marketplace_products WHERE id = ? AND tenant_id = ?`).bind(params.productId, tenantIdFavToggle).first();
    if (!product) return error('Product not found', 404);
  }

  const existing = await env.DB.prepare(`SELECT id FROM marketplace_favorites WHERE user_id = ? AND product_id = ?`).bind(user.id, params.productId).first();

  if (existing) {
    await env.DB.prepare(`DELETE FROM marketplace_favorites WHERE user_id = ? AND product_id = ?`).bind(user.id, params.productId).run();
    return json({ favorited: false });
  } else {
    await env.DB.prepare(`INSERT INTO marketplace_favorites (id, user_id, product_id, tenant_id) VALUES (?, ?, ?, ?)`).bind(generateId(), user.id, params.productId, tenantIdFavToggle).run();
    return json({ favorited: true });
  }
});

// ==================== MARKETPLACE MANAGER API ====================

// Manager: Get all orders
route('GET', '/api/marketplace/admin/orders', async (request, env) => {
  const user = await getUser(request, env);
  const userRoleNorm = (user?.role || '').trim().toLowerCase();
  if (!user || !['admin', 'director', 'manager', 'marketplace_manager'].includes(userRoleNorm)) {
    console.error(`[403] GET /api/marketplace/admin/orders - user role: "${user?.role}", id: "${user?.id}"`);
    return error('Access denied', 403);
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = (page - 1) * limit;

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  let whereClause = 'WHERE 1=1';
  const params: any[] = [];

  if (tenantId) {
    whereClause += ' AND o.tenant_id = ?';
    params.push(tenantId);
  }

  if (status) {
    whereClause += ' AND o.status = ?';
    params.push(status);
  }

  const countResult = await env.DB.prepare(`SELECT COUNT(*) as total FROM marketplace_orders o ${whereClause}`).bind(...params).first() as any;
  const total = countResult?.total || 0;

  params.push(limit, offset);
  const { results } = await env.DB.prepare(`
    SELECT o.*, u.name as user_name, u.phone as user_phone,
      e.name as executor_name, e.phone as executor_phone,
      (SELECT COUNT(*) FROM marketplace_order_items WHERE order_id = o.id) as items_count
    FROM marketplace_orders o
    LEFT JOIN users u ON o.user_id = u.id
    LEFT JOIN users e ON o.executor_id = e.id
    ${whereClause}
    ORDER BY o.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...params).all();

  // Fetch items for each order to avoid N+1 on frontend
  const ordersWithItems = await Promise.all((results || []).map(async (order: any) => {
    const { results: items } = await env.DB.prepare(`
      SELECT id, product_id, product_name, product_image, quantity, unit_price, total_price
      FROM marketplace_order_items WHERE order_id = ?
    `).bind(order.id).all();
    return { ...order, items: items || [] };
  }));

  return json({ orders: ordersWithItems, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

// Manager: Update order status or assign executor
route('PATCH', '/api/marketplace/admin/orders/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager', 'marketplace_manager'].includes(user.role)) {
    return error('Access denied', 403);
  }

  const tenantIdAdmOrd = getTenantId(request);
  const body = await request.json() as any;
  const { status, comment, executor_id } = body;

  // If assigning executor
  if (executor_id !== undefined) {
    // Update executor_id and also set status to confirmed
    await env.DB.prepare(`
      UPDATE marketplace_orders SET executor_id = ?, assigned_at = datetime('now'), status = 'confirmed', confirmed_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? ${tenantIdAdmOrd ? 'AND tenant_id = ?' : ''}
    `).bind(executor_id, params.id, ...(tenantIdAdmOrd ? [tenantIdAdmOrd] : [])).run();

    // Add status change to history
    await env.DB.prepare(`
      INSERT INTO marketplace_order_history (id, order_id, status, comment, changed_by, tenant_id)
      VALUES (?, ?, 'confirmed', 'Назначен исполнитель', ?, ?)
    `).bind(generateId(), params.id, user.id, getTenantId(request)).run();

    // Notify executor about new order (DB + push)
    if (executor_id) {
      const order = await env.DB.prepare(`SELECT order_number, user_id FROM marketplace_orders WHERE id = ? ${tenantIdAdmOrd ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantIdAdmOrd ? [tenantIdAdmOrd] : [])).first() as any;
      const execOrderBody = `Вам назначен заказ ${order?.order_number || ''}`;
      await env.DB.prepare(`
        INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id)
        VALUES (?, ?, 'marketplace_order', 'Новый заказ', ?, ?, 0, datetime('now'), ?)
      `).bind(generateId(), executor_id, execOrderBody, JSON.stringify({ order_id: params.id }), getTenantId(request)).run();
      sendPushNotification(env, executor_id, {
        title: '🛒 Новый заказ назначен',
        body: execOrderBody,
        type: 'marketplace_order',
        tag: `order-assigned-${params.id}`,
        data: { orderId: params.id, url: '/' },
        requireInteraction: true
      }).catch(() => {});

      // Notify customer that order is confirmed (DB + push)
      if (order?.user_id) {
        const custConfirmBody = `Заказ ${order.order_number} подтверждён`;
        await env.DB.prepare(`
          INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id)
          VALUES (?, ?, 'marketplace_order', 'Статус заказа', ?, ?, 0, datetime('now'), ?)
        `).bind(generateId(), order.user_id, custConfirmBody, JSON.stringify({ order_id: params.id }), getTenantId(request)).run();
        sendPushNotification(env, order.user_id, {
          title: '🛒 Заказ подтверждён',
          body: custConfirmBody,
          type: 'marketplace_order',
          tag: `order-status-${params.id}`,
          data: { orderId: params.id, url: '/' },
          requireInteraction: false
        }).catch(() => {});
      }
    }

    return json({ success: true });
  }

  // If updating status
  if (status) {
    const validStatuses = ['confirmed', 'preparing', 'ready', 'delivering', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return error('Invalid status');
    }

    // If cancelling order, return stock
    if (status === 'cancelled') {
      const currentOrder = await env.DB.prepare(`SELECT status FROM marketplace_orders WHERE id = ? ${tenantIdAdmOrd ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantIdAdmOrd ? [tenantIdAdmOrd] : [])).first() as any;
      // Only return stock if order wasn't already cancelled
      if (currentOrder && currentOrder.status !== 'cancelled') {
        const orderItems = await env.DB.prepare(`
          SELECT product_id, quantity FROM marketplace_order_items WHERE order_id = ? ${tenantIdAdmOrd ? 'AND tenant_id = ?' : ''}
        `).bind(params.id, ...(tenantIdAdmOrd ? [tenantIdAdmOrd] : [])).all() as { results: { product_id: string, quantity: number }[] };

        for (const item of (orderItems.results || [])) {
          await env.DB.prepare(`
            UPDATE marketplace_products
            SET stock_quantity = stock_quantity + ?
            WHERE id = ? ${tenantIdAdmOrd ? 'AND tenant_id = ?' : ''}
          `).bind(item.quantity, item.product_id, ...(tenantIdAdmOrd ? [tenantIdAdmOrd] : [])).run();
        }
      }
    }

    const statusField = status === 'cancelled' ? 'cancelled_at' :
                        status === 'confirmed' ? 'confirmed_at' :
                        status === 'preparing' ? 'preparing_at' :
                        status === 'ready' ? 'ready_at' :
                        status === 'delivering' ? 'delivering_at' :
                        status === 'delivered' ? 'delivered_at' : null;

    await env.DB.prepare(`
      UPDATE marketplace_orders SET status = ?, ${statusField} = datetime('now'), updated_at = datetime('now')
      WHERE id = ? ${tenantIdAdmOrd ? 'AND tenant_id = ?' : ''}
    `).bind(status, params.id, ...(tenantIdAdmOrd ? [tenantIdAdmOrd] : [])).run();

    await env.DB.prepare(`
      INSERT INTO marketplace_order_history (id, order_id, status, comment, changed_by, tenant_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(generateId(), params.id, status, comment || null, user.id, getTenantId(request)).run();

    // Notify user (DB + push)
    const order = await env.DB.prepare(`SELECT user_id, order_number FROM marketplace_orders WHERE id = ? ${tenantIdAdmOrd ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantIdAdmOrd ? [tenantIdAdmOrd] : [])).first() as any;
    if (order) {
      const statusLabels: Record<string, string> = {
        confirmed: 'подтверждён',
        preparing: 'готовится',
        ready: 'готов к выдаче',
        delivering: 'доставляется',
        delivered: 'доставлен',
        cancelled: 'отменён'
      };
      const orderStatusBody = `Заказ ${order.order_number} ${statusLabels[status]}`;
      await env.DB.prepare(`
        INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id)
        VALUES (?, ?, 'marketplace_order', 'Статус заказа', ?, ?, 0, datetime('now'), ?)
      `).bind(generateId(), order.user_id, orderStatusBody, JSON.stringify({ order_id: params.id }), getTenantId(request)).run();
      sendPushNotification(env, order.user_id, {
        title: status === 'cancelled' ? '❌ Заказ отменён' : '🛒 Статус заказа',
        body: orderStatusBody,
        type: 'marketplace_order',
        tag: `order-status-${params.id}`,
        data: { orderId: params.id, url: '/' },
        requireInteraction: status === 'delivered' || status === 'cancelled'
      }).catch(() => {});
    }
  }

  return json({ success: true });
});

// Executor: Get my marketplace orders
route('GET', '/api/marketplace/executor/orders', async (request, env) => {
  const user = await getUser(request, env);
  if (!user || !isExecutorRole(user.role)) {
    return error('Access denied', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const { results } = await env.DB.prepare(`
    SELECT o.*, u.name as user_name, u.phone as user_phone,
      (SELECT COUNT(*) FROM marketplace_order_items WHERE order_id = o.id) as items_count
    FROM marketplace_orders o
    LEFT JOIN users u ON o.user_id = u.id
    WHERE o.executor_id = ? AND o.status NOT IN ('delivered', 'cancelled')
    ${tenantId ? 'AND o.tenant_id = ?' : ''}
    ORDER BY
      CASE o.status
        WHEN 'confirmed' THEN 1
        WHEN 'preparing' THEN 2
        WHEN 'ready' THEN 3
        WHEN 'delivering' THEN 4
        ELSE 5
      END,
      o.created_at DESC
  `).bind(user.id, ...(tenantId ? [tenantId] : [])).all();

  // Fetch items for each order
  const ordersWithItems = await Promise.all((results || []).map(async (order: any) => {
    const { results: items } = await env.DB.prepare(`
      SELECT id, product_id, product_name, product_image, quantity, unit_price, total_price
      FROM marketplace_order_items WHERE order_id = ?
    `).bind(order.id).all();
    return { ...order, items: items || [] };
  }));

  return json({ orders: ordersWithItems });
});

// Executor (courier): Get delivered marketplace orders
route('GET', '/api/marketplace/executor/delivered', async (request, env) => {
  const user = await getUser(request, env);
  if (!user || !isExecutorRole(user.role)) {
    return error('Access denied', 403);
  }

  // Only couriers have delivered orders
  if (user.specialization !== 'courier') {
    return json({ orders: [] });
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const { results } = await env.DB.prepare(`
    SELECT o.*, u.name as user_name, u.phone as user_phone,
      (SELECT COUNT(*) FROM marketplace_order_items WHERE order_id = o.id) as items_count
    FROM marketplace_orders o
    LEFT JOIN users u ON o.user_id = u.id
    WHERE o.executor_id = ? AND o.status = 'delivered'
    ${tenantId ? 'AND o.tenant_id = ?' : ''}
    ORDER BY o.delivered_at DESC, o.updated_at DESC
  `).bind(user.id, ...(tenantId ? [tenantId] : [])).all();

  // Fetch items for each order
  const ordersWithItems = await Promise.all((results || []).map(async (order: any) => {
    const { results: items } = await env.DB.prepare(`
      SELECT id, product_id, product_name, product_image, quantity, unit_price, total_price
      FROM marketplace_order_items WHERE order_id = ?
    `).bind(order.id).all();
    return { ...order, items: items || [] };
  }));

  return json({ orders: ordersWithItems });
});

// Executor (courier): Get available marketplace orders to take
route('GET', '/api/marketplace/executor/available', async (request, env) => {
  const user = await getUser(request, env);
  if (!user || !isExecutorRole(user.role)) {
    return error('Access denied', 403);
  }

  // Only couriers can take marketplace orders
  if (user.specialization !== 'courier') {
    return json({ orders: [] });
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const { results } = await env.DB.prepare(`
    SELECT o.*, u.name as user_name, u.phone as user_phone,
      (SELECT COUNT(*) FROM marketplace_order_items WHERE order_id = o.id) as items_count
    FROM marketplace_orders o
    LEFT JOIN users u ON o.user_id = u.id
    WHERE o.executor_id IS NULL AND o.status = 'new'
    ${tenantId ? 'AND o.tenant_id = ?' : ''}
    ORDER BY o.created_at ASC
  `).bind(...(tenantId ? [tenantId] : [])).all();

  // Fetch items for each order
  const ordersWithItems = await Promise.all((results || []).map(async (order: any) => {
    const { results: items } = await env.DB.prepare(`
      SELECT id, product_id, product_name, product_image, quantity, unit_price, total_price
      FROM marketplace_order_items WHERE order_id = ?
    `).bind(order.id).all();
    return { ...order, items: items || [] };
  }));

  return json({ orders: ordersWithItems });
});

// Executor (courier): Take a marketplace order
route('POST', '/api/marketplace/executor/orders/:id/take', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !isExecutorRole(user.role)) {
    return error('Access denied', 403);
  }

  // Only couriers can take marketplace orders
  if (user.specialization !== 'courier') {
    return error('Only couriers can take marketplace orders', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  // Check if order exists and is available
  const order = await env.DB.prepare(`
    SELECT * FROM marketplace_orders WHERE id = ? AND executor_id IS NULL AND status = 'new'
    ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!order) {
    return error('Order not available or already taken', 404);
  }

  // Assign order to this courier and set status to confirmed
  await env.DB.prepare(`
    UPDATE marketplace_orders
    SET executor_id = ?, assigned_at = datetime('now'), status = 'confirmed', confirmed_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(user.id, params.id, ...(tenantId ? [tenantId] : [])).run();

  // Add to history
  await env.DB.prepare(`
    INSERT INTO marketplace_order_history (id, order_id, status, comment, changed_by, tenant_id)
    VALUES (?, ?, 'confirmed', 'Курьер взял заказ', ?, ?)
  `).bind(generateId(), params.id, user.id, tenantId).run();

  // Notify customer (DB + push)
  const execTakeBody = `Заказ ${order.order_number} подтверждён`;
  await env.DB.prepare(`
    INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id)
    VALUES (?, ?, 'marketplace_order', 'Статус заказа', ?, ?, 0, datetime('now'), ?)
  `).bind(generateId(), order.user_id, execTakeBody, JSON.stringify({ order_id: params.id }), tenantId).run();
  sendPushNotification(env, order.user_id, {
    title: '🛒 Заказ подтверждён',
    body: execTakeBody,
    type: 'marketplace_order',
    tag: `order-status-${params.id}`,
    data: { orderId: params.id, url: '/' },
    requireInteraction: false
  }).catch(() => {});

  return json({ success: true });
});

// Executor: Update order status (accept, prepare, deliver)
route('PATCH', '/api/marketplace/executor/orders/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !isExecutorRole(user.role)) {
    return error('Access denied', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  // Verify this order is assigned to this executor
  const order = await env.DB.prepare(`
    SELECT * FROM marketplace_orders WHERE id = ? AND executor_id = ?
    ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!order) {
    return error('Order not found or not assigned to you', 404);
  }

  const body = await request.json() as any;
  const { status, comment } = body;

  // Executor can only move to certain statuses
  // Flow: confirmed -> preparing -> ready -> delivering -> delivered
  const allowedTransitions: Record<string, string[]> = {
    'confirmed': ['preparing'],
    'preparing': ['ready'],
    'ready': ['delivering'],
    'delivering': ['delivered']
  };

  const allowed = allowedTransitions[order.status];
  if (!allowed || !allowed.includes(status)) {
    return error(`Cannot change status from ${order.status} to ${status}`);
  }

  const statusField = status === 'preparing' ? 'preparing_at' :
                      status === 'ready' ? 'ready_at' :
                      status === 'delivering' ? 'delivering_at' :
                      status === 'delivered' ? 'delivered_at' : null;

  if (statusField) {
    await env.DB.prepare(`
      UPDATE marketplace_orders SET status = ?, ${statusField} = datetime('now'), updated_at = datetime('now')
      WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(status, params.id, ...(tenantId ? [tenantId] : [])).run();
  } else {
    await env.DB.prepare(`
      UPDATE marketplace_orders SET status = ?, updated_at = datetime('now')
      WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(status, params.id, ...(tenantId ? [tenantId] : [])).run();
  }

  await env.DB.prepare(`
    INSERT INTO marketplace_order_history (id, order_id, status, comment, changed_by, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(generateId(), params.id, status, comment || null, user.id, getTenantId(request)).run();

  // Notify customer (DB + push)
  const statusLabels: Record<string, string> = {
    preparing: 'готовится',
    ready: 'готов к выдаче',
    delivering: 'доставляется',
    delivered: 'доставлен'
  };
  const execStatusBody = `Заказ ${order.order_number} ${statusLabels[status]}`;
  await env.DB.prepare(`
    INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id)
    VALUES (?, ?, 'marketplace_order', 'Статус заказа', ?, ?, 0, datetime('now'), ?)
  `).bind(generateId(), order.user_id, execStatusBody, JSON.stringify({ order_id: params.id }), getTenantId(request)).run();
  sendPushNotification(env, order.user_id, {
    title: status === 'delivered' ? '✅ Заказ доставлен' : '🛒 Статус заказа',
    body: execStatusBody,
    type: 'marketplace_order',
    tag: `order-status-${params.id}`,
    data: { orderId: params.id, url: '/' },
    requireInteraction: status === 'delivered'
  }).catch(() => {});

  return json({ success: true });
});

// Manager: Dashboard stats
route('GET', '/api/marketplace/admin/dashboard', async (request, env) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager', 'marketplace_manager'].includes(user.role)) {
    return error('Access denied', 403);
  }

  const today = new Date().toISOString().slice(0, 10);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);
  const tFilter = tenantId ? ' AND tenant_id = ?' : '';
  const tBind = tenantId ? [tenantId] : [];

  const [newOrders, preparingOrders, deliveringOrders, todayOrders, todayRevenue, totalProducts] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) as count FROM marketplace_orders WHERE status = 'new'${tFilter}`).bind(...tBind).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM marketplace_orders WHERE status IN ('confirmed', 'preparing', 'ready')${tFilter}`).bind(...tBind).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM marketplace_orders WHERE status = 'delivering'${tFilter}`).bind(...tBind).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM marketplace_orders WHERE date(created_at) = ?${tFilter}`).bind(today, ...tBind).first(),
    env.DB.prepare(`SELECT COALESCE(SUM(final_amount), 0) as total FROM marketplace_orders WHERE date(created_at) = ? AND status != 'cancelled'${tFilter}`).bind(today, ...tBind).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM marketplace_products WHERE is_active = 1${tFilter}`).bind(...tBind).first()
  ]);

  return json({
    stats: {
      new_orders: (newOrders as any)?.count || 0,
      preparing_orders: (preparingOrders as any)?.count || 0,
      delivering_orders: (deliveringOrders as any)?.count || 0,
      today_orders: (todayOrders as any)?.count || 0,
      today_revenue: (todayRevenue as any)?.total || 0,
      total_products: (totalProducts as any)?.count || 0
    }
  });
});

// Manager: Marketplace Reports (for Director)
route('GET', '/api/marketplace/admin/reports', async (request, env) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager', 'marketplace_manager'].includes(user.role)) {
    return error('Access denied', 403);
  }

  const url = new URL(request.url);
  const startDate = url.searchParams.get('start_date') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const endDate = url.searchParams.get('end_date') || new Date().toISOString().slice(0, 10);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);
  const tFilter = tenantId ? ' AND tenant_id = ?' : '';
  const tFilterO = tenantId ? ' AND o.tenant_id = ?' : '';
  const tBind = tenantId ? [tenantId] : [];

  try {
    // Overall stats for period
    const overallStats = await env.DB.prepare(`
      SELECT
        COUNT(*) as total_orders,
        COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_orders,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders,
        COALESCE(SUM(CASE WHEN status = 'delivered' THEN final_amount ELSE 0 END), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN status = 'delivered' THEN delivery_fee ELSE 0 END), 0) as total_delivery_fees,
        COALESCE(AVG(CASE WHEN rating IS NOT NULL THEN rating END), 0) as avg_rating,
        COUNT(CASE WHEN rating IS NOT NULL THEN 1 END) as rated_orders
      FROM marketplace_orders
      WHERE date(created_at) BETWEEN ? AND ?${tFilter}
    `).bind(startDate, endDate, ...tBind).first() as any;

    // Top selling products
    const topProducts = await env.DB.prepare(`
      SELECT
        oi.product_id,
        oi.product_name,
        p.image_url,
        SUM(oi.quantity) as total_sold,
        SUM(oi.total_price) as total_revenue,
        COUNT(DISTINCT oi.order_id) as order_count
      FROM marketplace_order_items oi
      JOIN marketplace_orders o ON oi.order_id = o.id
      LEFT JOIN marketplace_products p ON oi.product_id = p.id
      WHERE o.status = 'delivered' AND date(o.created_at) BETWEEN ? AND ?${tFilterO}
      GROUP BY oi.product_id, oi.product_name
      ORDER BY total_revenue DESC
      LIMIT 20
    `).bind(startDate, endDate, ...tBind).all() as { results: any[] };

    // Sales by category
    const categoryStats = await env.DB.prepare(`
      SELECT
        COALESCE(c.name_ru, 'Без категории') as category_name,
        SUM(oi.quantity) as total_sold,
        SUM(oi.total_price) as total_revenue,
        COUNT(DISTINCT oi.order_id) as order_count
      FROM marketplace_order_items oi
      JOIN marketplace_orders o ON oi.order_id = o.id
      LEFT JOIN marketplace_products p ON oi.product_id = p.id
      LEFT JOIN marketplace_categories c ON p.category_id = c.id
      WHERE o.status = 'delivered' AND date(o.created_at) BETWEEN ? AND ?${tFilterO}
      GROUP BY c.id, c.name_ru
      ORDER BY total_revenue DESC
    `).bind(startDate, endDate, ...tBind).all() as { results: any[] };

    // Daily sales (for chart)
    const dailySales = await env.DB.prepare(`
      SELECT
        date(created_at) as date,
        COUNT(*) as orders,
        SUM(CASE WHEN status = 'delivered' THEN final_amount ELSE 0 END) as revenue
      FROM marketplace_orders
      WHERE date(created_at) BETWEEN ? AND ?${tFilter}
      GROUP BY date(created_at)
      ORDER BY date(created_at)
    `).bind(startDate, endDate, ...tBind).all() as { results: any[] };

    // Orders by status
    const ordersByStatus = await env.DB.prepare(`
      SELECT
        status,
        COUNT(*) as count
      FROM marketplace_orders
      WHERE date(created_at) BETWEEN ? AND ?${tFilter}
      GROUP BY status
    `).bind(startDate, endDate, ...tBind).all() as { results: any[] };

    // Top customers
    const topCustomers = await env.DB.prepare(`
      SELECT
        u.id as user_id,
        u.name as user_name,
        u.phone as user_phone,
        COUNT(o.id) as order_count,
        SUM(o.final_amount) as total_spent
      FROM marketplace_orders o
      JOIN users u ON o.user_id = u.id
      WHERE o.status = 'delivered' AND date(o.created_at) BETWEEN ? AND ?${tFilterO}
      GROUP BY u.id, u.name, u.phone
      ORDER BY total_spent DESC
      LIMIT 10
    `).bind(startDate, endDate, ...tBind).all() as { results: any[] };

    // Executor performance (couriers)
    const executorStats = await env.DB.prepare(`
      SELECT
        u.id as executor_id,
        u.name as executor_name,
        COUNT(o.id) as delivered_count,
        COALESCE(AVG(o.rating), 0) as avg_rating
      FROM marketplace_orders o
      JOIN users u ON o.executor_id = u.id
      WHERE o.status = 'delivered' AND date(o.created_at) BETWEEN ? AND ?${tFilterO}
      GROUP BY u.id, u.name
      ORDER BY delivered_count DESC
    `).bind(startDate, endDate, ...tBind).all() as { results: any[] };

    return json({
      period: { start_date: startDate, end_date: endDate },
      overall: overallStats,
      top_products: topProducts.results || [],
      categories: categoryStats.results || [],
      daily_sales: dailySales.results || [],
      orders_by_status: ordersByStatus.results || [],
      top_customers: topCustomers.results || [],
      executor_stats: executorStats.results || [],
    });
  } catch (err: any) {
    console.error('Marketplace reports error:', err);
    return error('Failed to generate report', 500);
  }
});

// Manager: Products CRUD
route('GET', '/api/marketplace/admin/products', async (request, env) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager', 'marketplace_manager'].includes(user.role)) {
    return error('Access denied', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const { results } = await env.DB.prepare(`
    SELECT p.*, c.name_ru as category_name_ru, c.icon as category_icon
    FROM marketplace_products p
    LEFT JOIN marketplace_categories c ON p.category_id = c.id
    WHERE p.is_active = 1 ${tenantId ? 'AND p.tenant_id = ?' : ''}
    ORDER BY p.created_at DESC
  `).bind(...(tenantId ? [tenantId] : [])).all();

  return json({ products: results });
});

route('POST', '/api/marketplace/admin/products', async (request, env) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager', 'marketplace_manager'].includes(user.role)) {
    return error('Access denied', 403);
  }

  const body = await request.json() as any;
  const id = generateId();

  // MULTI-TENANCY: Add tenant_id on creation
  await env.DB.prepare(`
    INSERT INTO marketplace_products (
      id, category_id, name_ru, name_uz, description_ru, description_uz,
      price, old_price, unit, stock_quantity, min_order_quantity, max_order_quantity,
      weight, weight_unit, image_url, images, is_active, is_featured, created_by, tenant_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, body.category_id, body.name_ru, body.name_uz || body.name_ru,
    body.description_ru || null, body.description_uz || null,
    body.price, body.old_price || null, body.unit || 'шт',
    body.stock_quantity || 0, body.min_order_quantity || 1, body.max_order_quantity || null,
    body.weight || null, body.weight_unit || 'кг',
    body.image_url || null, body.images ? JSON.stringify(body.images) : null,
    body.is_active !== false ? 1 : 0, body.is_featured ? 1 : 0, user.id, getTenantId(request)
  ).run();

  const tenantIdProd = getTenantId(request);
  const created = await env.DB.prepare(`SELECT * FROM marketplace_products WHERE id = ? ${tenantIdProd ? 'AND tenant_id = ?' : ''}`).bind(id, ...(tenantIdProd ? [tenantIdProd] : [])).first();
  return json({ product: created }, 201);
});

route('PATCH', '/api/marketplace/admin/products/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager', 'marketplace_manager'].includes(user.role)) {
    return error('Access denied', 403);
  }

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  // Note: is_active is intentionally excluded to prevent accidental deactivation during edits
  // Use DELETE endpoint to deactivate products
  const fields = ['category_id', 'name_ru', 'name_uz', 'description_ru', 'description_uz', 'price', 'old_price', 'unit', 'stock_quantity', 'min_order_quantity', 'max_order_quantity', 'weight', 'weight_unit', 'image_url', 'is_featured'];
  for (const field of fields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(field === 'is_featured' ? (body[field] ? 1 : 0) : body[field]);
    }
  }
  if (body.images) {
    updates.push('images = ?');
    values.push(JSON.stringify(body.images));
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  if (updates.length > 0) {
    updates.push('updated_at = datetime("now")');
    values.push(params.id);
    if (tenantId) values.push(tenantId);
    await env.DB.prepare(`UPDATE marketplace_products SET ${updates.join(', ')} WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(...values).run();
  }

  const updated = await env.DB.prepare(`SELECT * FROM marketplace_products WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  return json({ product: updated });
});

route('DELETE', '/api/marketplace/admin/products/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager', 'marketplace_manager'].includes(user.role)) {
    return error('Access denied', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);
  await env.DB.prepare(`UPDATE marketplace_products SET is_active = 0 WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).run();
  return json({ success: true });
});

// Upload image for product (base64)
route('POST', '/api/marketplace/admin/upload-image', async (request, env) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager', 'marketplace_manager'].includes(user.role)) {
    return error('Access denied', 403);
  }

  try {
    const contentType = request.headers.get('Content-Type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('image') as unknown as File;

      if (!file) {
        return error('No image file provided', 400);
      }

      // Sanitize filename - remove path traversal and dangerous characters
      const originalName = file.name || 'image';
      const sanitizedName = originalName
        .replace(/\.\./g, '') // Remove path traversal
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '') // Remove dangerous characters
        .replace(/^\.+/, ''); // Remove leading dots

      // Validate file type by both MIME type and extension
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
      const fileExtension = sanitizedName.toLowerCase().match(/\.[^.]+$/)?.[0] || '';

      if (!allowedTypes.includes(file.type)) {
        return error('Invalid file type. Allowed: JPEG, PNG, GIF, WEBP', 400);
      }

      // If there's an extension, validate it matches the MIME type
      if (fileExtension && !allowedExtensions.includes(fileExtension)) {
        return error('Invalid file extension. Allowed: .jpg, .jpeg, .png, .gif, .webp', 400);
      }

      // Max 5MB
      const maxSize = 5 * 1024 * 1024;
      if (file.size > maxSize) {
        return error('File too large. Maximum size: 5MB', 400);
      }

      // Convert to base64
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      const dataUrl = `data:${file.type};base64,${base64}`;

      return json({ image_url: dataUrl });
    } else {
      return error('Content-Type must be multipart/form-data', 400);
    }
  } catch (err) {
    console.error('Image upload error:', err);
    return error('Failed to upload image', 500);
  }
});

// Manager: Categories CRUD
route('POST', '/api/marketplace/admin/categories', async (request, env) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager', 'marketplace_manager'].includes(user.role)) {
    return error('Access denied', 403);
  }

  const body = await request.json() as any;
  const id = generateId();

  await env.DB.prepare(`
    INSERT INTO marketplace_categories (id, name_ru, name_uz, icon, parent_id, sort_order, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, body.name_ru, body.name_uz || body.name_ru, body.icon || '📦', body.parent_id || null, body.sort_order || 99, getTenantId(request)).run();

  const tenantIdCat = getTenantId(request);
  const created = await env.DB.prepare(`SELECT * FROM marketplace_categories WHERE id = ? ${tenantIdCat ? 'AND tenant_id = ?' : ''}`).bind(id, ...(tenantIdCat ? [tenantIdCat] : [])).first();
  return json({ category: created }, 201);
});

route('PATCH', '/api/marketplace/admin/categories/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager', 'marketplace_manager'].includes(user.role)) {
    return error('Access denied', 403);
  }

  const tenantIdCatUpd = getTenantId(request);
  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  const fields = ['name_ru', 'name_uz', 'icon', 'parent_id', 'sort_order', 'is_active'];
  for (const field of fields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(field === 'is_active' ? (body[field] ? 1 : 0) : body[field]);
    }
  }

  if (updates.length > 0) {
    values.push(params.id);
    if (tenantIdCatUpd) values.push(tenantIdCatUpd);
    await env.DB.prepare(`UPDATE marketplace_categories SET ${updates.join(', ')} WHERE id = ? ${tenantIdCatUpd ? 'AND tenant_id = ?' : ''}`).bind(...values).run();
  }

  const updated = await env.DB.prepare(`SELECT * FROM marketplace_categories WHERE id = ? ${tenantIdCatUpd ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantIdCatUpd ? [tenantIdCatUpd] : [])).first();
  return json({ category: updated });
});

} // end registerMarketplaceRoutes
