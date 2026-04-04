// Super Admin, Tenants & Banners routes — extracted from index.ts
// Contains: banners CRUD, super-admin ads, tenants CRUD, impersonation, analytics

import type { Env } from '../types';
import { route } from '../router';
import { getUser } from '../middleware/auth';
import { getTenantId, clearFeatureCache } from '../middleware/tenant';
import { json, error, generateId, isManagement, sanitizeInput, sanitizeUrl } from '../utils/helpers';
import { hashPassword, createJWT } from '../utils/crypto';
import { isSuperAdmin } from '../index';
import { createRequestLogger } from '../utils/logger';
import { validateBody } from '../validation/validate';
import { createPaymentSchema } from '../validation/schemas';

export function registerSuperAdminRoutes() {

// ==================== SUPER ADMIN BANNERS ====================

// GET /api/super-admin/banners - list all banners
route('GET', '/api/super-admin/banners', async (request, env) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);
  const { results } = await env.DB.prepare('SELECT * FROM super_banners ORDER BY sort_order, created_at DESC LIMIT 500').all();
  return json({ banners: results });
});

// GET /api/banners?placement=marketplace - public, get active banners for a placement
route('GET', '/api/banners', async (request, env) => {
  const url = new URL(request.url);
  const placement = url.searchParams.get('placement') || 'marketplace';
  const { results } = await env.DB.prepare('SELECT * FROM super_banners WHERE is_active = 1 AND placement = ? ORDER BY sort_order, created_at DESC LIMIT 500').bind(placement).all();
  return json({ banners: results });
});

// POST /api/super-admin/banners - create banner
route('POST', '/api/super-admin/banners', async (request, env) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);
  const body = await request.json() as any;
  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO super_banners (id, title, description, image_url, link_url, placement, is_active, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, body.title, body.description || null, body.image_url || null, body.link_url || null, body.placement || 'marketplace', body.is_active !== false ? 1 : 0, body.sort_order || 0).run();
  const banner = await env.DB.prepare('SELECT * FROM super_banners WHERE id = ?').bind(id).first();
  return json({ banner }, 201);
});

// PATCH /api/super-admin/banners/:id - update banner
route('PATCH', '/api/super-admin/banners/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);
  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];
  for (const [key, dbField] of Object.entries({ title: 'title', description: 'description', image_url: 'image_url', link_url: 'link_url', placement: 'placement', is_active: 'is_active', sort_order: 'sort_order' })) {
    if (body[key] !== undefined) {
      updates.push(`${dbField} = ?`);
      values.push(typeof body[key] === 'boolean' ? (body[key] ? 1 : 0) : body[key]);
    }
  }
  if (updates.length === 0) return json({ success: true });
  updates.push("updated_at = datetime('now')");
  values.push(params.id);
  await env.DB.prepare(`UPDATE super_banners SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
  const banner = await env.DB.prepare('SELECT * FROM super_banners WHERE id = ?').bind(params.id).first();
  return json({ banner });
});

// DELETE /api/super-admin/banners/:id
route('DELETE', '/api/super-admin/banners/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);
  await env.DB.prepare('DELETE FROM super_banners WHERE id = ?').bind(params.id).run();
  return json({ success: true });
});

// ==================== SUPER ADMIN ADS MANAGEMENT ====================

// GET /api/super-admin/ads - list all ads across all tenants
route('GET', '/api/super-admin/ads', async (request, env) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);

  const { results } = await env.DB.prepare(`
    SELECT a.*, c.name_ru as category_name, c.icon as category_icon,
      t.name as tenant_name, t.slug as tenant_slug,
      u.name as creator_name,
      (SELECT COUNT(*) FROM ad_tenant_assignments ata WHERE ata.ad_id = a.id) as assigned_tenants_count,
      (SELECT GROUP_CONCAT(t2.name, ', ') FROM ad_tenant_assignments ata2
        JOIN tenants t2 ON ata2.tenant_id = t2.id WHERE ata2.ad_id = a.id) as assigned_tenant_names
    FROM ads a
    LEFT JOIN ad_categories c ON a.category_id = c.id
    LEFT JOIN tenants t ON a.tenant_id = t.id
    LEFT JOIN users u ON a.created_by = u.id
    ORDER BY a.created_at DESC
    LIMIT 500
  `).all();

  return json({ ads: results || [] });
});

// POST /api/super-admin/ads - create ONE platform ad and assign to selected tenants
route('POST', '/api/super-admin/ads', async (request, env) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);

  const body = await request.json() as any;
  if (!body.category_id || !body.title || !body.phone) {
    return error('category_id, title, and phone are required', 400);
  }

  // Sanitize text inputs to prevent stored XSS
  body.title = sanitizeInput(body.title, 200);
  body.description = sanitizeInput(body.description, 2000);
  body.phone = sanitizeInput(body.phone, 20);
  body.phone2 = sanitizeInput(body.phone2, 20);
  body.address = sanitizeInput(body.address, 500);
  body.work_hours = sanitizeInput(body.work_hours, 200);
  body.work_days = sanitizeInput(body.work_days, 200);
  body.logo_url = sanitizeUrl(body.logo_url);
  body.website = sanitizeUrl(body.website);
  body.link_url = sanitizeUrl(body.link_url);

  const targetTenantIds: string[] = body.target_tenant_ids || [];
  if (targetTenantIds.length === 0) {
    return error('Select at least one УК', 400);
  }

  const now = new Date();
  const startsAt = body.starts_at || now.toISOString();
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

  // Create ONE platform ad (tenant_id = NULL means it belongs to the platform)
  const adId = generateId();
  await env.DB.prepare(`
    INSERT INTO ads (
      id, category_id, title, description, phone, phone2, telegram, instagram, facebook, website,
      address, work_hours, work_days, logo_url, photos, discount_percent, badges,
      target_type, target_branches, target_buildings, starts_at, expires_at, duration_type, status, created_by, tenant_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `).bind(
    adId, body.category_id, body.title, body.description || null,
    body.phone, body.phone2 || null, body.telegram || null, body.instagram || null,
    body.facebook || null, body.website || null, body.address || null,
    body.work_hours || null, body.work_days || null, body.logo_url || null,
    body.photos ? JSON.stringify(body.photos) : null,
    body.discount_percent || 0, body.badges ? JSON.stringify(body.badges) : null,
    body.target_type || 'all',
    body.target_branches ? JSON.stringify(body.target_branches) : '[]',
    body.target_buildings ? JSON.stringify(body.target_buildings) : '[]',
    startsAt, expiresAt, body.duration_type || 'month',
    body.status || 'active', user.id
  ).run();

  // Create assignment records (one per tenant, enabled by default)
  for (const tenantId of targetTenantIds) {
    const assignId = generateId();
    await env.DB.prepare(`
      INSERT OR IGNORE INTO ad_tenant_assignments (id, ad_id, tenant_id, enabled)
      VALUES (?, ?, ?, 1)
    `).bind(assignId, adId, tenantId).run();
  }

  return json({ created: 1, id: adId, assigned_tenants: targetTenantIds.length }, 201);
});

// GET /api/super-admin/ads/:id/tenants - list tenant assignments for a platform ad
route('GET', '/api/super-admin/ads/:id/tenants', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);

  const { results: assignments } = await env.DB.prepare(`
    SELECT ata.tenant_id, ata.enabled, ata.assigned_at,
      t.name as tenant_name, t.slug as tenant_slug, t.color, t.color_secondary
    FROM ad_tenant_assignments ata
    JOIN tenants t ON ata.tenant_id = t.id
    WHERE ata.ad_id = ?
    ORDER BY t.name
  `).bind(params.id).all();

  const { results: allTenants } = await env.DB.prepare(`
    SELECT id, name, slug, color, color_secondary FROM tenants ORDER BY name
  `).all();

  return json({ assignments: assignments || [], all_tenants: allTenants || [] });
});

// POST /api/super-admin/ads/:id/assign-tenants - replace tenant assignments
route('POST', '/api/super-admin/ads/:id/assign-tenants', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);

  const body = await request.json() as any;
  const tenantIds: string[] = body.tenant_ids || [];

  // Remove tenants not in new list
  if (tenantIds.length > 0) {
    const placeholders = tenantIds.map(() => '?').join(',');
    await env.DB.prepare(
      `DELETE FROM ad_tenant_assignments WHERE ad_id = ? AND tenant_id NOT IN (${placeholders})`
    ).bind(params.id, ...tenantIds).run();
  } else {
    await env.DB.prepare(`DELETE FROM ad_tenant_assignments WHERE ad_id = ?`).bind(params.id).run();
  }

  // Insert new assignments (preserve existing enabled state via INSERT OR IGNORE)
  for (const tenantId of tenantIds) {
    const assignId = generateId();
    await env.DB.prepare(`
      INSERT OR IGNORE INTO ad_tenant_assignments (id, ad_id, tenant_id, enabled)
      VALUES (?, ?, ?, 1)
    `).bind(assignId, params.id, tenantId).run();
  }

  return json({ success: true, assigned: tenantIds.length });
});

// PATCH /api/super-admin/ads/:id/tenants/:tenantId - toggle enabled for a specific tenant
// Callable by: super_admin (any tenant) OR admin/manager/director of that tenant
route('PATCH', '/api/super-admin/ads/:id/tenants/:tenantId', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const isSA = isSuperAdmin(user);
  const isOwnTenant = ['admin', 'manager', 'director'].includes(user.role) &&
    (user as any).tenant_id === params.tenantId;

  if (!isSA && !isOwnTenant) return error('Access denied', 403);

  const body = await request.json() as any;
  const enabled = body.enabled ? 1 : 0;

  await env.DB.prepare(`
    UPDATE ad_tenant_assignments SET enabled = ? WHERE ad_id = ? AND tenant_id = ?
  `).bind(enabled, params.id, params.tenantId).run();

  return json({ success: true, enabled });
});

// DELETE /api/super-admin/ads/:id - delete ad
route('DELETE', '/api/super-admin/ads/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);

  await env.DB.prepare(`DELETE FROM ads WHERE id = ?`).bind(params.id).run();
  return json({ success: true });
});

// PATCH /api/super-admin/ads/:id/status - toggle ad status
route('PATCH', '/api/super-admin/ads/:id/status', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);

  const body = await request.json() as any;
  await env.DB.prepare(`UPDATE ads SET status = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(body.status, params.id).run();

  return json({ success: true });
});

// GET /api/super-admin/ads/:id/views - who viewed this ad
route('GET', '/api/super-admin/ads/:id/views', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);

  const { results } = await env.DB.prepare(`
    SELECT v.id, v.created_at as viewed_at, u.name as user_name, u.phone as user_phone,
      u.apartment_number, u.role
    FROM ad_views v
    JOIN users u ON v.user_id = u.id
    WHERE v.ad_id = ?
    ORDER BY v.created_at DESC
    LIMIT 200
  `).bind(params.id).all();

  return json({ views: results || [] });
});

// GET /api/super-admin/ads/:id/coupons - coupons for this ad
route('GET', '/api/super-admin/ads/:id/coupons', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);

  const { results } = await env.DB.prepare(`
    SELECT c.*, u.name as user_name, u.phone as user_phone,
      checker.name as activated_by_name
    FROM ad_coupons c
    JOIN users u ON c.user_id = u.id
    LEFT JOIN users checker ON c.activated_by = checker.id
    WHERE c.ad_id = ?
    ORDER BY c.issued_at DESC
    LIMIT 200
  `).bind(params.id).all();

  return json({ coupons: results || [] });
});

// ==================== TENANTS API (SUPER ADMIN ONLY) ====================
// Helper to check super_admin role

route('GET', '/api/tenants', async (request, env) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);

  const result = await env.DB.prepare(`SELECT * FROM tenants ORDER BY created_at DESC LIMIT 500`).all();
  return json({ tenants: result.results || [] });
});

// POST /api/tenants - create tenant
route('POST', '/api/tenants', async (request, env) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);

  const body = await request.json() as any;
  if (!body.name || !body.slug || !body.url) {
    return error('name, slug, and url are required');
  }

  // Check slug uniqueness
  const existing = await env.DB.prepare(`SELECT id FROM tenants WHERE slug = ?`).bind(body.slug).first();
  if (existing) return error('Tenant with this slug already exists');

  const id = generateId();
  const features = body.features ? JSON.stringify(body.features) : '["requests","votes","qr","rentals","notepad","reports"]';

  await env.DB.prepare(`
    INSERT INTO tenants (id, name, slug, url, admin_url, color, color_secondary, plan, features, admin_email, admin_phone, logo, contract_template)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, body.name, body.slug, body.url, body.admin_url || null,
    body.color || '#6366f1', body.color_secondary || '#a855f7',
    body.plan || 'basic', features,
    body.admin_email || null, body.admin_phone || null,
    body.logo || null, body.contract_template || null
  ).run();

  // Create initial director user for the tenant
  let directorCreated = false;
  if (body.director_login && body.director_password && body.director_name) {
    const directorId = generateId();
    const passwordHash = await hashPassword(body.director_password);
    await env.DB.prepare(`
      INSERT INTO users (id, login, password_hash, name, role, is_active, tenant_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'director', 1, ?, datetime('now'), datetime('now'))
    `).bind(directorId, body.director_login, passwordHash, body.director_name, id).run();
    directorCreated = true;
  }

  // Create initial admin user for the tenant
  let adminCreated = false;
  if (body.admin_login && body.admin_password && body.admin_name) {
    const adminId = generateId();
    const adminPasswordHash = await hashPassword(body.admin_password);
    await env.DB.prepare(`
      INSERT INTO users (id, login, password_hash, name, role, is_active, tenant_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'admin', 1, ?, datetime('now'), datetime('now'))
    `).bind(adminId, body.admin_login, adminPasswordHash, body.admin_name, id).run();
    adminCreated = true;
  }

  const tenant = await env.DB.prepare(`SELECT * FROM tenants WHERE id = ?`).bind(id).first();
  return json({ tenant, directorCreated, adminCreated }, 201);
});

// PATCH /api/tenants/:id - update tenant
route('PATCH', '/api/tenants/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);

  const existing = await env.DB.prepare(`SELECT * FROM tenants WHERE id = ?`).bind(params.id).first();
  if (!existing) return error('Tenant not found', 404);

  const body = await request.json() as any;

  // Check slug uniqueness if changing slug
  if (body.slug && body.slug !== (existing as any).slug) {
    const slugTaken = await env.DB.prepare(`SELECT id FROM tenants WHERE slug = ? AND id != ?`).bind(body.slug, params.id).first();
    if (slugTaken) return error('Tenant with this slug already exists');
    // Auto-update url and admin_url when slug changes
    const baseDomain = env.BASE_DOMAIN || 'kamizo.uz';
    if (!body.url) body.url = `https://${body.slug}.${baseDomain}`;
    if (!body.admin_url) body.admin_url = `https://${body.slug}.${baseDomain}/admin`;
  }

  const fields = ['name', 'slug', 'url', 'admin_url', 'color', 'color_secondary', 'plan', 'admin_email', 'admin_phone', 'users_count', 'requests_count', 'votes_count', 'qr_count', 'revenue', 'is_active', 'logo', 'contract_template'];
  const updates: string[] = [];
  const values: any[] = [];

  for (const field of fields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(field === 'is_active' ? (body[field] ? 1 : 0) : body[field]);
    }
  }

  if (body.features !== undefined) {
    updates.push('features = ?');
    values.push(JSON.stringify(body.features));
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    values.push(params.id);
    await env.DB.prepare(`UPDATE tenants SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();

    // Invalidate feature cache when plan or features change
    if (body.features !== undefined || body.plan !== undefined) {
      clearFeatureCache(params.id);
    }
  }

  const tenant = await env.DB.prepare(`SELECT * FROM tenants WHERE id = ?`).bind(params.id).first();
  return json({ tenant });
});

// DELETE /api/tenants/:id - delete tenant
route('DELETE', '/api/tenants/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);

  const existing = await env.DB.prepare(`SELECT * FROM tenants WHERE id = ?`).bind(params.id).first();
  if (!existing) return error('Tenant not found', 404);

  await env.DB.prepare(`DELETE FROM tenants WHERE id = ?`).bind(params.id).run();
  return json({ success: true });
});

// GET /api/super-admin/tenants/:id/details - detailed tenant data for super admin
route('GET', '/api/super-admin/tenants/:id/details', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);

  const tenantId = params.id;
  const tenant = await env.DB.prepare(`SELECT * FROM tenants WHERE id = ?`).bind(tenantId).first();
  if (!tenant) return error('Tenant not found', 404);

  try {
    const url = new URL(request.url);
    const tab = url.searchParams.get('tab') || 'stats';
    const log = createRequestLogger(request);

    // Safe count query helper - returns 0 if table/column doesn't exist
    const safeCount = async (sql: string, binds: any[]) => {
      try {
        const result = await env.DB.prepare(sql).bind(...binds).first();
        return Number((result as any)?.cnt || 0);
      } catch (e) {
        log.error('safeCount failed', e, { sql });
        return 0;
      }
    };

    // Always return stats (each query is individually safe)
    const [residents, requests, votes, qr_codes, buildings, staff] = await Promise.all([
      safeCount(`SELECT COUNT(*) as cnt FROM users WHERE tenant_id = ? AND role = 'resident'`, [tenantId]),
      safeCount(`SELECT COUNT(*) as cnt FROM requests WHERE tenant_id = ?`, [tenantId]),
      safeCount(`SELECT COUNT(*) as cnt FROM meetings WHERE tenant_id = ?`, [tenantId]),
      safeCount(`SELECT COUNT(*) as cnt FROM guest_access_codes WHERE tenant_id = ?`, [tenantId]),
      safeCount(`SELECT COUNT(*) as cnt FROM buildings WHERE tenant_id = ?`, [tenantId]),
      safeCount(`SELECT COUNT(*) as cnt FROM users WHERE tenant_id = ? AND role NOT IN ('resident', 'director')`, [tenantId]),
    ]);

    const stats = { residents, requests, votes, qr_codes, buildings, staff };

    let tabData: any = [];

    // Safe query helper - returns empty array on failure
    const safeQuery = async (sql: string, binds: any[]) => {
      try {
        const result = await env.DB.prepare(sql).bind(...binds).all();
        return result.results || [];
      } catch (e) {
        log.error('safeQuery failed', e, { sql });
        return [];
      }
    };

    if (tab === 'requests') {
      tabData = await safeQuery(`
        SELECT r.id, r.title, r.status, r.priority, r.category, r.created_at,
               u.name as creator_name, e.name as executor_name
        FROM requests r
        LEFT JOIN users u ON r.user_id = u.id
        LEFT JOIN users e ON r.assigned_to = e.id
        WHERE r.tenant_id = ?
        ORDER BY r.created_at DESC
        LIMIT 50
      `, [tenantId]);
    } else if (tab === 'residents') {
      tabData = await safeQuery(`
        SELECT u.id, u.name, u.phone, u.login, u.building_id, u.apartment, u.created_at,
               b.address as building_address
        FROM users u
        LEFT JOIN buildings b ON u.building_id = b.id
        WHERE u.tenant_id = ? AND u.role = 'resident'
        ORDER BY u.created_at DESC
        LIMIT 50
      `, [tenantId]);
    } else if (tab === 'votes') {
      tabData = await safeQuery(`
        SELECT m.id, m.title, m.status, m.meeting_type, m.scheduled_date, m.created_at,
               u.name as creator_name
        FROM meetings m
        LEFT JOIN users u ON m.created_by = u.id
        WHERE m.tenant_id = ?
        ORDER BY m.created_at DESC
        LIMIT 50
      `, [tenantId]);
    } else if (tab === 'qr') {
      tabData = await safeQuery(`
        SELECT g.id, g.code, g.guest_name, g.status, g.valid_from, g.valid_until, g.created_at,
               u.name as creator_name
        FROM guest_access_codes g
        LEFT JOIN users u ON g.user_id = u.id
        WHERE g.tenant_id = ?
        ORDER BY g.created_at DESC
        LIMIT 50
      `, [tenantId]);
    } else if (tab === 'staff') {
      tabData = await safeQuery(`
        SELECT u.id, u.name, u.phone, u.login, u.role, u.specialization, u.status, u.created_at
        FROM users u
        WHERE u.tenant_id = ? AND u.role NOT IN ('resident')
        ORDER BY
          CASE u.role
            WHEN 'director' THEN 1
            WHEN 'admin' THEN 2
            WHEN 'manager' THEN 3
            WHEN 'department_head' THEN 4
            WHEN 'executor' THEN 5
            ELSE 6
          END,
          u.created_at DESC
        LIMIT 100
      `, [tenantId]);
    } else if (tab === 'settings') {
      try {
        tabData = {
          features: JSON.parse((tenant as any).features || '[]'),
          plan: (tenant as any).plan,
          color: (tenant as any).color,
          color_secondary: (tenant as any).color_secondary,
          is_active: (tenant as any).is_active,
        };
      } catch (e) {
        tabData = { features: [], plan: 'basic' };
      }
    }

    return json({ tenant, stats, tabData });
  } catch (err: any) {
    createRequestLogger(request).error('Tenant details error', err);
    return error(`Failed to load tenant details: ${err?.message || 'Unknown error'}`, 500);
  }
});

// POST /api/super-admin/impersonate/:tenantId - get admin credentials for auto-login
route('POST', '/api/super-admin/impersonate/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);

  const tenantId = params.id;
  const tenant = await env.DB.prepare(`SELECT * FROM tenants WHERE id = ?`).bind(tenantId).first() as any;
  if (!tenant) return error('Tenant not found', 404);

  // Find management user for this tenant: admin → director → manager (by priority)
  const adminUser = await env.DB.prepare(
    `SELECT id, login, name, role, phone, specialization, address, apartment, building_id, branch, building, entrance, floor, total_area, account_type, tenant_id
     FROM users WHERE tenant_id = ? AND role IN ('admin', 'director', 'manager') AND is_active = 1
     ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'director' THEN 1 WHEN 'manager' THEN 2 END, created_at ASC
     LIMIT 1`
  ).bind(tenantId).first() as any;

  if (!adminUser) return error('В выбранной компании нет активных сотрудников', 404);

  // Issue JWT for impersonated admin (7 days)
  const impersonateToken = await createJWT(
    { userId: adminUser.id, role: adminUser.role, tenantId: adminUser.tenant_id || undefined },
    env.JWT_SECRET,
    7 * 24 * 60 * 60
  );

  return json({ user: adminUser, token: impersonateToken, tenantUrl: tenant.url, tenantName: tenant.name });
});

// GET /api/super-admin/users - list all users across all tenants with credentials (super_admin only)
route('GET', '/api/super-admin/users', async (request, env) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);

  const url = new URL(request.url);
  const search = url.searchParams.get('search') || '';
  const role = url.searchParams.get('role') || '';
  const tenantSlug = url.searchParams.get('tenant') || '';
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '50');

  let whereClause = "WHERE 1=1";
  const params: any[] = [];

  if (search) {
    whereClause += " AND (u.login LIKE ? OR u.name LIKE ? OR u.phone LIKE ?)";
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  if (role) {
    whereClause += " AND u.role = ?";
    params.push(role);
  }
  if (tenantSlug) {
    whereClause += " AND t.slug = ?";
    params.push(tenantSlug);
  }

  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) as total FROM users u LEFT JOIN tenants t ON u.tenant_id = t.id ${whereClause}`
  ).bind(...params).first() as any;
  const total = countResult?.total || 0;

  const offset = (page - 1) * limit;
  const { results } = await env.DB.prepare(`
    SELECT u.id, u.login, u.password_hash as password, u.name, u.phone, u.role, u.specialization,
           u.tenant_id, t.name as tenant_name, t.slug as tenant_slug,
           u.branch, u.building, u.created_at, u.is_active
    FROM users u
    LEFT JOIN tenants t ON u.tenant_id = t.id
    ${whereClause}
    ORDER BY t.name, u.role, u.name
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();

  return json({ users: results, total, page, limit });
});

// PATCH /api/super-admin/tenants/:id/banners - toggle coming soon banners
route('PATCH', '/api/super-admin/tenants/:id/banners', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  if (typeof body.show_useful_contacts_banner === 'boolean' || typeof body.show_useful_contacts_banner === 'number') {
    updates.push('show_useful_contacts_banner = ?');
    values.push(body.show_useful_contacts_banner ? 1 : 0);
  }
  if (typeof body.show_marketplace_banner === 'boolean' || typeof body.show_marketplace_banner === 'number') {
    updates.push('show_marketplace_banner = ?');
    values.push(body.show_marketplace_banner ? 1 : 0);
  }

  if (updates.length === 0) return error('No fields to update', 400);

  await env.DB.prepare(`UPDATE tenants SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`)
    .bind(...values, params.id).run();

  const tenant = await env.DB.prepare('SELECT * FROM tenants WHERE id = ?').bind(params.id).first();
  return json({ success: true, tenant });
});

// GET /api/super-admin/analytics - cross-tenant analytics
route('GET', '/api/super-admin/analytics', async (request, env) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);

  try {
    // Helper: build time-series queries for a given period
    const timeQueries = (groupExpr: string, periodAlias: string, dateFilter: string) => [
      env.DB.prepare(`SELECT ${groupExpr} as period, COUNT(*) as count FROM users WHERE created_at >= ${dateFilter} GROUP BY ${groupExpr} ORDER BY period`).all(),
      env.DB.prepare(`SELECT ${groupExpr} as period, COUNT(*) as count FROM requests WHERE created_at >= ${dateFilter} GROUP BY ${groupExpr} ORDER BY period`).all(),
      env.DB.prepare(`SELECT ${groupExpr} as period, COALESCE(SUM(CASE WHEN status = 'delivered' THEN final_amount ELSE 0 END), 0) as revenue, COUNT(*) as orders FROM marketplace_orders WHERE created_at >= ${dateFilter} GROUP BY ${groupExpr} ORDER BY period`).all(),
      env.DB.prepare(`SELECT ${groupExpr} as period, COUNT(*) as count FROM buildings WHERE created_at >= ${dateFilter} GROUP BY ${groupExpr} ORDER BY period`).all(),
    ];

    const [
      perTenantResult, planResult, tenantsResult,
      // Daily (last 30 days)
      udRes, rdRes, revdRes, bdRes,
      // Weekly (last 12 weeks)
      uwRes, rwRes, revwRes, bwRes,
      // Monthly (last 12 months)
      umRes, rmRes, revmRes, bmRes,
    ] = await Promise.all([
      // Per-tenant real counts
      env.DB.prepare(`
        SELECT
          t.id, t.name, t.slug, t.plan, t.is_active,
          COALESCE(u.cnt, 0) as users_count,
          COALESCE(r.cnt, 0) as requests_count,
          COALESCE(b.cnt, 0) as buildings_count,
          COALESCE(o.revenue, 0) as revenue
        FROM tenants t
        LEFT JOIN (SELECT tenant_id, COUNT(*) as cnt FROM users GROUP BY tenant_id) u ON u.tenant_id = t.id
        LEFT JOIN (SELECT tenant_id, COUNT(*) as cnt FROM requests GROUP BY tenant_id) r ON r.tenant_id = t.id
        LEFT JOIN (SELECT tenant_id, COUNT(*) as cnt FROM buildings GROUP BY tenant_id) b ON b.tenant_id = t.id
        LEFT JOIN (SELECT tenant_id, COALESCE(SUM(CASE WHEN status = 'delivered' THEN final_amount ELSE 0 END), 0) as revenue FROM marketplace_orders GROUP BY tenant_id) o ON o.tenant_id = t.id
        ORDER BY u.cnt DESC
      `).all(),
      env.DB.prepare(`SELECT plan, COUNT(*) as count FROM tenants GROUP BY plan`).all(),
      env.DB.prepare(`SELECT features FROM tenants`).all(),
      // Daily
      ...timeQueries("date(created_at)", "day", "date('now', '-30 days')"),
      // Weekly
      ...timeQueries("strftime('%Y-W%W', created_at)", "week", "date('now', '-84 days')"),
      // Monthly
      ...timeQueries("strftime('%Y-%m', created_at)", "month", "date('now', '-12 months')"),
    ]);

    const perTenant = (perTenantResult.results || []) as any[];
    const planDistribution = (planResult.results || []) as any[];

    // Calculate totals
    const totals = perTenant.reduce((acc: any, t: any) => ({
      users: acc.users + Number(t.users_count || 0),
      requests: acc.requests + Number(t.requests_count || 0),
      buildings: acc.buildings + Number(t.buildings_count || 0),
      revenue: acc.revenue + Number(t.revenue || 0),
    }), { users: 0, requests: 0, buildings: 0, revenue: 0 });
    totals.tenants = perTenant.length;

    // Parse feature usage from tenants
    const featureUsage: Record<string, number> = {};
    for (const t of (tenantsResult.results || []) as any[]) {
      try {
        const features = JSON.parse(t.features || '[]');
        for (const f of features) {
          featureUsage[f] = (featureUsage[f] || 0) + 1;
        }
      } catch {}
    }
    const featureUsageArr = Object.entries(featureUsage).map(([feature, count]) => ({ feature, count }));

    // Merge time-series data for a given period
    const mergeGrowth = (usersR: any, requestsR: any, revenueR: any, buildingsR: any) => {
      const u = (usersR.results || []) as any[];
      const r = (requestsR.results || []) as any[];
      const rev = (revenueR.results || []) as any[];
      const b = (buildingsR.results || []) as any[];
      const allPeriods = new Set([
        ...u.map((x: any) => x.period),
        ...r.map((x: any) => x.period),
        ...rev.map((x: any) => x.period),
        ...b.map((x: any) => x.period),
      ]);
      return Array.from(allPeriods).sort().map(p => ({
        period: p,
        users: Number(u.find((x: any) => x.period === p)?.count || 0),
        requests: Number(r.find((x: any) => x.period === p)?.count || 0),
        revenue: Number(rev.find((x: any) => x.period === p)?.revenue || 0),
        orders: Number(rev.find((x: any) => x.period === p)?.orders || 0),
        buildings: Number(b.find((x: any) => x.period === p)?.count || 0),
      }));
    };

    return json({
      analytics: {
        totals,
        perTenant,
        planDistribution,
        featureUsage: featureUsageArr,
        growth: {
          daily: mergeGrowth(udRes, rdRes, revdRes, bdRes),
          weekly: mergeGrowth(uwRes, rwRes, revwRes, bwRes),
          monthly: mergeGrowth(umRes, rmRes, revmRes, bmRes),
        },
      }
    });
  } catch (err: any) {
    createRequestLogger(request).error('Super admin analytics error', err);
    return error('Failed to load analytics', 500);
  }
});

// ==================== PAYMENTS MODULE ====================

// POST /api/payments — create a payment (admin/manager only)
route('POST', '/api/payments', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Manager access required', 403);

  const tenantId = getTenantId(request);
  const { data: body, errors: validationErrors } = await validateBody(request, createPaymentSchema);
  if (validationErrors) return error(validationErrors, 400);

  const id = generateId();

  // Generate receipt number: PAY-YYYY-NNNN
  const year = new Date().getFullYear();
  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM payments WHERE receipt_number LIKE ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(`PAY-${year}-%`, ...(tenantId ? [tenantId] : [])).first() as any;
  const seq = (Number(countResult?.cnt || 0) + 1).toString().padStart(4, '0');
  const receiptNumber = `PAY-${year}-${seq}`;

  await env.DB.prepare(`
    INSERT INTO payments (id, apartment_id, resident_id, amount, payment_type, period, description, receipt_number, paid_by, created_by, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    body.apartment_id || null,
    body.resident_id || null,
    body.amount,
    body.payment_type || 'cash',
    body.period || null,
    body.description || null,
    receiptNumber,
    body.paid_by || null,
    authUser!.id,
    tenantId || ''
  ).run();

  const created = await env.DB.prepare('SELECT * FROM payments WHERE id = ?').bind(id).first();
  return json({ payment: created }, 201);
});

// GET /api/payments — list payments with filters and pagination
route('GET', '/api/payments', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  const url = new URL(request.url);
  const apartmentId = url.searchParams.get('apartment_id');
  const residentId = url.searchParams.get('resident_id');
  const period = url.searchParams.get('period');
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50')));
  const offset = (page - 1) * limit;

  let where = 'WHERE 1=1';
  const params: any[] = [];

  if (tenantId) { where += ' AND tenant_id = ?'; params.push(tenantId); }
  if (apartmentId) { where += ' AND apartment_id = ?'; params.push(apartmentId); }
  if (residentId) { where += ' AND resident_id = ?'; params.push(residentId); }
  if (period) { where += ' AND period = ?'; params.push(period); }

  const countStmt = env.DB.prepare(`SELECT COUNT(*) as total FROM payments ${where}`).bind(...params);
  const countResult = await countStmt.first() as any;
  const total = Number(countResult?.total || 0);

  const dataStmt = env.DB.prepare(
    `SELECT * FROM payments ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).bind(...params, limit, offset);
  const { results } = await dataStmt.all();

  return json({
    payments: results || [],
    pagination: {
      page, limit, total,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    }
  });
});

} // end registerSuperAdminRoutes
