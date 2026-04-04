// Coupon management routes — check, activate, history, issue, user coupons

import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { json, error, generateId } from '../../utils/helpers';
import { isAdvertiser, generateCouponCode } from './helpers';

export function registerCouponRoutes() {

// Get coupon history for an ad (advertiser)
route('GET', '/api/ads/:id/coupons', async (request, env, params) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!authUser || !isAdvertiser(authUser)) return error('Advertiser access required', 403);

  const ad = await env.DB.prepare('SELECT id FROM ads WHERE id = ? AND created_by = ?')
    .bind(params.id, authUser.id).first();
  if (!ad) return error('Ad not found', 404);

  const { results } = await env.DB.prepare(`
    SELECT c.*, u.name as user_name, u.phone as user_phone, checker.name as activated_by_name
    FROM ad_coupons c
    JOIN users u ON c.user_id = u.id
    LEFT JOIN users checker ON c.activated_by = checker.id
    WHERE c.ad_id = ?
    ORDER BY c.issued_at DESC LIMIT 100
  `).bind(params.id).all();

  return json({ coupons: results });
});

// Check coupon (get info without activating)
route('GET', '/api/coupons/check/:code', async (request, env, params) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!authUser || !isAdvertiser(authUser)) return error('Coupon checker access required', 403);

  const code = params.code.toUpperCase();
  const tenantId = getTenantId(request);

  const coupon = await env.DB.prepare(`
    SELECT c.*, a.title as ad_title, a.phone as ad_phone, a.description as ad_description,
      u.name as user_name, u.phone as user_phone
    FROM ad_coupons c
    JOIN ads a ON c.ad_id = a.id
    JOIN users u ON c.user_id = u.id
    WHERE c.code = ? ${tenantId ? 'AND c.tenant_id = ?' : ''}
  `).bind(code, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!coupon) return error('Купон не найден', 404);

  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return json({ coupon, valid: false, reason: 'Срок действия купона истёк' });
  }
  if (coupon.status === 'activated') {
    return json({ coupon, valid: false, reason: `Купон уже активирован ${new Date(coupon.activated_at).toLocaleString('ru-RU')}` });
  }
  if (coupon.status === 'cancelled') {
    return json({ coupon, valid: false, reason: 'Купон отменён' });
  }

  return json({ coupon, valid: true, discount_percent: coupon.discount_percent });
});

// Activate coupon
route('POST', '/api/coupons/activate/:code', async (request, env, params) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!authUser || !isAdvertiser(authUser)) return error('Coupon checker access required', 403);

  const code = params.code.toUpperCase();
  const body = await request.json() as any;
  const amount = body.amount || 0;
  const tenantId = getTenantId(request);

  const coupon = await env.DB.prepare(`
    SELECT c.*, a.id as ad_id
    FROM ad_coupons c JOIN ads a ON c.ad_id = a.id
    WHERE c.code = ? ${tenantId ? 'AND c.tenant_id = ?' : ''}
  `).bind(code, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!coupon) return error('Купон не найден', 404);
  if (coupon.status !== 'issued') return error('Купон уже использован или недействителен', 400);
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) return error('Срок действия купона истёк', 400);

  const discountAmount = amount * (coupon.discount_percent / 100);

  await env.DB.prepare(`
    UPDATE ad_coupons SET status = 'activated', activated_at = datetime('now'),
      activated_by = ?, activation_amount = ?, discount_amount = ?
    WHERE code = ?
  `).bind(authUser.id, amount, discountAmount, code).run();

  await env.DB.prepare(`UPDATE ads SET coupons_activated = coupons_activated + 1 WHERE id = ?`).bind(coupon.ad_id).run();

  const updated = await env.DB.prepare('SELECT * FROM ad_coupons WHERE code = ?').bind(code).first();
  return json({ success: true, coupon: updated, discount_amount: discountAmount, final_amount: amount - discountAmount });
});

// Get activation history for checker
route('GET', '/api/coupons/history', async (request, env) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!authUser || !isAdvertiser(authUser)) return error('Coupon checker access required', 403);

  const tenantId = getTenantId(request);
  const { results } = await env.DB.prepare(`
    SELECT c.*, a.title as ad_title, u.name as user_name
    FROM ad_coupons c JOIN ads a ON c.ad_id = a.id JOIN users u ON c.user_id = u.id
    WHERE c.activated_by = ? ${tenantId ? 'AND c.tenant_id = ?' : ''}
    ORDER BY c.activated_at DESC LIMIT 100
  `).bind(authUser.id, ...(tenantId ? [tenantId] : [])).all();

  return json({ activations: results });
});

// Get coupon for an ad (resident only)
route('POST', '/api/ads/:id/get-coupon', async (request, env, params) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  if (authUser.role !== 'resident') return error('Only residents can get coupons', 403);

  const now = new Date().toISOString();
  const ad = await env.DB.prepare(`
    SELECT * FROM ads WHERE id = ? AND status = 'active'
    AND (starts_at IS NULL OR ? >= starts_at) AND (expires_at IS NULL OR ? <= expires_at)
  `).bind(params.id, now, now).first() as any;

  if (!ad) return error('Ad not found or not active', 404);
  if (!ad.discount_percent || ad.discount_percent <= 0) return error('This ad has no discount', 400);

  const existing = await env.DB.prepare(`SELECT * FROM ad_coupons WHERE ad_id = ? AND user_id = ?`).bind(params.id, authUser.id).first();
  if (existing) return json({ coupon: existing, message: 'Вы уже получили купон на эту акцию' });

  let code: string;
  let attempts = 0;
  do {
    code = generateCouponCode();
    const exists = await env.DB.prepare('SELECT id FROM ad_coupons WHERE code = ?').bind(code).first();
    if (!exists) break;
    attempts++;
  } while (attempts < 10);
  if (attempts >= 10) return error('Failed to generate unique code', 500);

  const couponId = generateId();
  await env.DB.prepare(`
    INSERT INTO ad_coupons (id, ad_id, user_id, code, discount_percent, discount_value, expires_at, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(couponId, params.id, authUser.id, code, ad.discount_percent, ad.discount_percent || 0, ad.expires_at, getTenantId(request)).run();

  await env.DB.prepare(`UPDATE ads SET coupons_issued = coupons_issued + 1 WHERE id = ?`).bind(params.id).run();
  const coupon = await env.DB.prepare('SELECT * FROM ad_coupons WHERE id = ?').bind(couponId).first();
  return json({ coupon, message: `Ваш промокод: ${code}. Скидка ${ad.discount_percent}%` }, 201);
});

// Get user's coupons
route('GET', '/api/my-coupons', async (request, env) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  const { results } = await env.DB.prepare(`
    SELECT c.*, a.title as ad_title, a.phone as ad_phone, a.description as ad_description,
      a.logo_url, cat.name_ru as category_name
    FROM ad_coupons c JOIN ads a ON c.ad_id = a.id JOIN ad_categories cat ON a.category_id = cat.id
    WHERE c.user_id = ? ${tenantId ? 'AND c.tenant_id = ?' : ''}
    ORDER BY c.issued_at DESC LIMIT 500
  `).bind(authUser.id, ...(tenantId ? [tenantId] : [])).all();

  return json({ coupons: results });
});

} // end registerCouponRoutes
