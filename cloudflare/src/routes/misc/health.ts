// Health check, tenant config, and monitoring/admin metrics routes

import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { clearFeatureCache, getTenantForRequest, getTenantId, getTenantSlug } from '../../middleware/tenant';
import { mirrorTenantWriteToD1 } from '../../lib/tenantMirror';
import { getCacheStats } from '../../cache';
import { invalidateOnChange } from '../../cache';
import { metricsAggregator, healthCheck, AlertManager, logAnalyticsEvent } from '../../monitoring';
import { json, error, bilingualError, isAdminLevel } from '../../utils/helpers';
import {
  FALLBACK_TENANT_FEATURES,
  TENANT_FEATURES,
  isTenantFeature,
  normalizeFeatures,
} from '../../lib/features';
import { createRequestLogger } from '../../utils/logger';
import { verifyJWT } from '../../utils/crypto';

export function registerHealthRoutes() {

// Health Check
// PUBLIC: no auth required
route('GET', '/api/health', async (_request, env) => {
  const health = await healthCheck(env);
  const status = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 503 : 503;
  return json(health, status);
});

// Tenant existence check by slug.
// PUBLIC: no auth required. Returns { exists: boolean }.
//
// WHY THIS EXISTS: the Cloudflare Worker serves the SPA shell for
// {slug}.kamizo.uz and must 404 unregistered subdomains. It used to check
// its own env.DB — but on the Worker that's the FROZEN D1 archive, which
// has no tenant created after the D1→VPS migration, so every new УК 404'd.
// This endpoint runs on the VPS (api.kamizo.uz) against the LIVE SQLite, so
// the Worker can ask the authoritative source. It returns only a boolean —
// no tenant data leaks, so it's safe to expose unauthenticated.
route('GET', '/api/public/tenant-exists', async (request, env) => {
  const url = new URL(request.url);
  const slug = (url.searchParams.get('slug') || '').trim().toLowerCase();
  // Validate shape before touching the DB — same charset the Worker's
  // getTenantSlug() accepts. Rejects junk early; the query is parametrised
  // regardless, so this is defence-in-depth, not the only guard.
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return json({ exists: false });
  }
  const row = await env.DB.prepare(
    'SELECT 1 FROM tenants WHERE slug = ? AND is_active = 1'
  ).bind(slug).first();
  return json({ exists: !!row });
});

// Tenant Config (returns current tenant's configuration)
// PUBLIC: no auth required, BUT optionally honours a Bearer JWT.
//
// Resolution order:
//   1. Origin/subdomain — set by index.ts via setTenantForRequest()
//      before this handler runs. This is the browser PWA path
//      (demo.kamizo.uz → tenant 'demo'). Unchanged behaviour for
//      every caller that has a usable Origin.
//   2. JWT fallback — for the unified Capacitor native app, whose
//      WebView origin is https://localhost (Android) /
//      capacitor://localhost (iOS). getTenantSlug() can't extract a
//      slug from those, so without this fallback every native
//      caller saw { tenant: null, features: [] } and the Sidebar /
//      BottomBar / feature gating defaulted to "no tenant" — making
//      the app feel locked to a generic / demo experience.
//
// Strict isolation guarantees:
//   • Only the JWT's OWN tenantId is exposed. We don't accept a
//     tenantId from query/body — only what the verifier extracts
//     from the cryptographically-signed token payload.
//   • If the JWT is invalid / expired / has no tenantId, we return
//     the same { tenant: null, features: [] } shape as the
//     no-Origin case. No leak about WHY the lookup failed.
//   • A token's tenantId still has to match an active tenant row —
//     we filter on is_active = 1 to refuse stale/disabled workspaces.
function buildConfigResponse(tenant: Record<string, unknown>, context: 'tenant' | 'apex' | 'unresolved' = 'tenant') {
  // Нормализуем перед отдачей фронту: старые строки хранят легаси-ключ
  // "votes", а ProtectedRoute/hasFeature спрашивают "meetings" — без
  // приведения раздел «Собрания» молча редиректил на главную.
  // features = NULL трактуем так же, как requireFeature на бэке
  // (FALLBACK_TENANT_FEATURES), иначе фронт запирал бы то, что сервер
  // на самом деле разрешает.
  const features: string[] = tenant.features == null
    ? [...FALLBACK_TENANT_FEATURES]
    : normalizeFeatures(tenant.features);
  // Sprint 85 commit 2 — surface the tenant contract metadata so the
  // director-dashboard widget can render "kamizo-uk-choko.pdf · 17 июн
  // 2026" without a second fetch, and so the resident-side download
  // surface (commit 3) can decide whether to even show the row. Only
  // metadata travels here — the PDF bytes stay behind the
  // /api/admin/tenant/contract and /api/resident/contract streaming
  // routes. contract_uploaded_by_name comes from `tenant._contract_uploaded_by_name`
  // which the caller stitches via a JOIN before invoking this helper
  // (see the two call sites below).
  const hasContract = !!tenant.contract_r2_key;
  return json({
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      color: tenant.color,
      color_secondary: tenant.color_secondary,
      plan: tenant.plan,
      logo: tenant.logo || null,
      is_demo: tenant.is_demo === 1 || tenant.is_demo === true,
      admin_phone: (tenant.admin_phone as string | null) || null,
      show_useful_contacts_banner: tenant.show_useful_contacts_banner !== 0 ? 1 : 0,
      show_marketplace_banner: tenant.show_marketplace_banner !== 0 ? 1 : 0,
      contract: hasContract ? {
        filename: (tenant.contract_filename as string | null) || null,
        uploaded_at: (tenant.contract_uploaded_at as string | null) || null,
        uploaded_by_name: (tenant._contract_uploaded_by_name as string | null) || null,
      } : null,
    },
    features,
    context,
  });
}

// KNOWN_APEX — единственный список доменов, для которых main-app с
// открытыми фичами; всё остальное с tenant=null → 'unresolved'
// (native pre-login, чужие домены). Ключ используется фронтом:
// hasFeature для tenant=null возвращает true ТОЛЬКО при context='apex'.
const KNOWN_APEX_HOSTS = new Set(['kamizo.uz', 'app.kamizo.uz', 'www.kamizo.uz']);

route('GET', '/api/tenant/config', async (request, env) => {
  // 1. Origin / subdomain path (browser PWA, VPS [node-port] patch).
  //    Caveat: getUser() in the auth middleware ALSO calls
  //    setTenantForRequest(request, { id: tenant_id }) — a "stub" tenant
  //    with ONLY the id field — purely for downstream multi-tenant
  //    row filtering. That stub satisfies a naive truthy check but has
  //    no name/slug/color, so we'd return a half-empty config object
  //    (the original bug). We discriminate by looking for `name`,
  //    which only the full SELECT * row from index.ts has.
  const fromOrigin = getTenantForRequest(request);
  if (fromOrigin && (fromOrigin as { name?: unknown }).name) {
    // Sprint 85 commit 2 — the in-request tenant came from
    // setTenantForRequest() which mirrored the full SELECT * row,
    // but the contract_uploaded_by_name JOIN wasn't part of that
    // query. Look it up here when a key is present.
    let enrichedTenant = fromOrigin as Record<string, unknown>;
    if (enrichedTenant.contract_uploaded_by) {
      const u = await env.DB.prepare('SELECT name FROM users WHERE id = ?')
        .bind(enrichedTenant.contract_uploaded_by).first() as { name?: string } | null;
      if (u?.name) enrichedTenant = { ...enrichedTenant, _contract_uploaded_by_name: u.name };
    }
    return buildConfigResponse(enrichedTenant);
  }

  // 2. JWT fallback (Capacitor native shell, or any browser request
  //    where only the auth-middleware stub was set). For both we fetch
  //    the full tenant row keyed on the JWT's tenantId.
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const payload = await verifyJWT(token, env.JWT_SECRET);
      if (payload?.tenantId) {
        // Sprint 85 commit 2 — JOIN users on the tenant's
        // contract_uploaded_by so /api/tenant/config can return the
        // uploader's display name without a second round-trip from
        // the director dashboard widget.
        const tenant = await env.DB.prepare(`
          SELECT t.*, u.name as _contract_uploaded_by_name
          FROM tenants t
          LEFT JOIN users u ON t.contract_uploaded_by = u.id
          WHERE t.id = ? AND t.is_active = 1
        `).bind(payload.tenantId).first() as Record<string, unknown> | null;
        if (tenant) {
          return buildConfigResponse(tenant);
        }
      }
    } catch (err) {
      createRequestLogger(request).error('JWT-fallback tenant config lookup failed', err);
      // Fall through to the no-tenant response. Don't surface the
      // error — same shape as the pre-login case.
    }
  }

  // 2.5. Public subdomain resolution (anonymous / logged-out). On
  //      {slug}.kamizo.uz the login page has NO JWT, and on the VPS the
  //      request Host is api.kamizo.uz — so neither path above resolves the
  //      tenant, and the login page loses its branding/logo/colour AND the
  //      demo quick-login buttons (is_demo was always null pre-login). This
  //      is why demo.kamizo.uz/login showed a bare form. Resolve the tenant
  //      from the Origin/Referer subdomain. Only PUBLIC branding is returned
  //      — contract metadata is stripped (contract_r2_key nulled) so an
  //      anonymous, Origin-spoofable caller can't read the contract filename
  //      / uploader.
  const originHeader = request.headers.get('Origin') || request.headers.get('Referer') || '';
  try {
    const host = originHeader ? new URL(originHeader).hostname : '';
    const slug = getTenantSlug(host);
    if (slug) {
      const tenant = await env.DB.prepare(
        'SELECT * FROM tenants WHERE slug = ? AND is_active = 1'
      ).bind(slug).first() as Record<string, unknown> | null;
      if (tenant) {
        return buildConfigResponse({ ...tenant, contract_r2_key: null });
      }
    }
  } catch {
    // Malformed Origin / DB hiccup → fall through to the no-tenant response.
  }

  // 3. Nothing matched. Разделяем apex (главный сайт, все фичи) и
  //    unresolved (нативный клиент до логина, чужой домен, ошибка).
  //    Фронт использует context для решения, разрешать ли фичи при
  //    tenant=null. Без этого различия hasFeature на нативе до логина
  //    возвращал true на всё, а на apex — то же самое; теперь
  //    единый источник истины на бэке.
  let context: 'apex' | 'unresolved' = 'unresolved';
  try {
    const originForContext = request.headers.get('Origin') || request.headers.get('Referer') || '';
    if (originForContext) {
      const h = new URL(originForContext).hostname;
      if (KNOWN_APEX_HOSTS.has(h)) context = 'apex';
    }
  } catch {
    // Malformed Origin — оставляем unresolved.
  }
  return json({ tenant: null, features: [], context });
});

// PATCH /api/tenant/features — включить/выключить модуль своего тенанта.
//
// Раздел «Модули платформы» в настройках УК дёргал этот путь с самого
// начала, но роут никогда не существовал: запрос уходил в 404, фронт
// глушил ошибку в пустом catch, тумблер отщёлкивал назад. В итоге
// включить «Собрания» / «Объявления» из кабинета УК было невозможно —
// только через супер-админку, а пункты меню при этом рендерились и
// молча выбрасывали на главную.
//
// Изоляция: тенант берётся ТОЛЬКО из запроса (JWT/сабдомен) через
// getTenantId — id из тела не принимаем, чужой тенант отредактировать
// нельзя. Демо-сессии режет глобальный enforceDemoSessionPolicy до
// хендлера (мутации вне allowlist → 403).
route('PATCH', '/api/tenant/features', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) {
    return bilingualError('Требуется авторизация', 'Avtorizatsiya talab qilinadi', 401);
  }
  // Вкладка «Модули» видна и менеджеру, но менять состав модулей —
  // владельческое действие: только админ и директор.
  if (!isAdminLevel(user)) {
    return bilingualError(
      'Менять модули может только администратор или директор',
      'Modullarni faqat administrator yoki direktor o‘zgartira oladi',
      403,
    );
  }

  const tenantId = getTenantId(request);
  if (!tenantId || tenantId === '__no_tenant__') {
    return bilingualError('Тенант не определён', 'Tenant aniqlanmadi', 400);
  }

  let body: { feature?: unknown; enabled?: unknown };
  try {
    body = await request.json() as { feature?: unknown; enabled?: unknown };
  } catch {
    return error('Invalid JSON body', 400);
  }

  const feature = body.feature;
  if (!isTenantFeature(feature)) {
    return error(`Unknown feature. Allowed: ${TENANT_FEATURES.join(', ')}`, 400);
  }
  if (typeof body.enabled !== 'boolean') {
    return error('`enabled` must be a boolean', 400);
  }

  const row = await env.DB.prepare(
    'SELECT features FROM tenants WHERE id = ? AND is_active = 1'
  ).bind(tenantId).first() as { features?: string | null } | null;
  if (!row) return error('Tenant not found', 404);

  const current = row.features == null
    ? [...FALLBACK_TENANT_FEATURES]
    : normalizeFeatures(row.features);
  const next = body.enabled
    ? (current.includes(feature) ? current : [...current, feature])
    : current.filter(f => f !== feature);

  const updateSql = "UPDATE tenants SET features = ?, updated_at = datetime('now') WHERE id = ?";
  const updateParams = [JSON.stringify(next), tenantId];
  await env.DB.prepare(updateSql).bind(...updateParams).run();
  // Тот же дуал-райт, что и в super-admin PATCH: без него Worker'ский D1
  // остался бы со старым набором фич.
  await mirrorTenantWriteToD1(env, request, updateSql, updateParams);
  clearFeatureCache(tenantId);

  createRequestLogger(request).info('tenant_feature_toggled', {
    tenantId,
    userId: user.id,
    role: user.role,
    feature,
    enabled: body.enabled,
  });

  return json({ features: next });
});

// Metrics Dashboard (Admin only)
route('GET', '/api/admin/metrics', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') {
    return error('Admin access required', 403);
  }

  const stats = metricsAggregator.getAggregatedStats();
  const cacheStats = getCacheStats();

  // Check thresholds and send alerts if needed
  AlertManager.checkThresholds(stats);

  return json({
    performance: stats,
    cache: cacheStats,
    health: await healthCheck(env),
  });
});

// Performance Metrics (detailed)
route('GET', '/api/admin/metrics/performance', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') {
    return error('Admin access required', 403);
  }

  const url = new URL(request.url);
  const endpoint = url.searchParams.get('endpoint');

  const perfMetrics = endpoint
    ? metricsAggregator.getPerformanceMetrics(endpoint)
    : metricsAggregator.getPerformanceMetrics();

  return json({
    metrics: perfMetrics,
    aggregated: metricsAggregator.getAggregatedStats(),
  });
});

// Error Logs (Admin only)
route('GET', '/api/admin/metrics/errors', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') {
    return error('Admin access required', 403);
  }

  const errors = metricsAggregator.getErrors();

  return json({
    total: errors.length,
    errors: errors.slice(-50), // Last 50 errors
  });
});

// Clear metrics (Admin only)
route('POST', '/api/admin/metrics/clear', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') {
    return error('Admin access required', 403);
  }

  metricsAggregator.clear();

  return json({ message: 'Metrics cleared successfully' });
});

// Reset/Clear all requests (Admin only)
route('POST', '/api/admin/requests/reset', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') {
    return error('Admin access required', 403);
  }

  try {
    const tenantId = getTenantId(request);
    const tenantFilter = tenantId ? ' WHERE tenant_id = ?' : '';
    const tenantBinds = tenantId ? [tenantId] : [];

    // Delete request history first (FK constraint)
    await env.DB.prepare(`DELETE FROM request_history${tenantFilter}`).bind(...tenantBinds).run();

    // Delete messages related to requests
    await env.DB.prepare(`DELETE FROM messages${tenantFilter}`).bind(...tenantBinds).run();

    // Delete all requests
    await env.DB.prepare(`DELETE FROM requests${tenantFilter}`).bind(...tenantBinds).run();

    // Reset request number sequence
    await env.DB.prepare(`
      UPDATE settings SET value = '0' WHERE key = 'last_request_number'${tenantId ? ' AND tenant_id = ?' : ''}
    `).bind(...tenantBinds).run();

    // Invalidate caches
    await invalidateOnChange('requests', env.RATE_LIMITER);

    return json({ message: 'All requests have been deleted successfully' });
  } catch (err: any) {
    createRequestLogger(request).error('Error resetting requests', err);
    return error('Failed to reset requests', 500);
  }
});

// Frontend Error Reporting (Public - errors from React)
//
// Sprint 79 P0/F2: was reading body.userId verbatim (forge / log
// injection) and had no body-size cap (multi-MB stack-trace data-URLs
// could be planted). Now: read identity from token if present, ignore
// body.userId entirely, hard-truncate all free-text fields, reject
// oversized payloads.
route('POST', '/api/admin/monitoring/frontend-error', async (request, env) => {
  try {
    const raw = await request.text();
    if (raw.length > 16_000) return error('Payload too large', 413);
    const body = JSON.parse(raw) as any;

    const truncate = (s: unknown, n: number) => typeof s === 'string' ? s.slice(0, n) : null;
    const errorMessage = truncate(body?.error?.message, 2000);
    const errorStack = truncate(body?.error?.stack, 4000);
    const errorName = truncate(body?.error?.name, 200) || 'UnknownError';
    const userAgent = truncate(body?.userAgent, 500);
    const errorUrl = truncate(body?.url, 500);

    // Resolve userId from token; ignore body-supplied value.
    let userId: string | null = null;
    try {
      const { getUser } = await import('../../middleware/auth');
      const u = await getUser(request, env);
      userId = u?.id ?? null;
    } catch { userId = null; }

    const log = createRequestLogger(request);
    log.error('Frontend error reported', null, {
      timestamp: body?.timestamp,
      errorMessage,
      errorUrl,
      userId,
    });

    metricsAggregator.logError({
      message: `[Frontend] ${errorMessage || 'Unknown error'}`,
      endpoint: errorUrl || 'unknown',
      method: 'FRONTEND',
      timestamp: Date.now(),
      stack: errorStack || undefined,
      userAgent: userAgent || undefined,
      userId: userId || undefined,
    });

    if (env.ENVIRONMENT === 'production') {
      logAnalyticsEvent(request, 'frontend_error', {
        error_name: errorName,
        error_message: errorMessage || 'Unknown error',
        url: errorUrl,
        userId,
      });
    }

    return json({ message: 'Error logged successfully' });
  } catch (err) {
    createRequestLogger(request).error('Failed to log frontend error', err);
    return error('Failed to log error', 500);
  }
});

} // end registerHealthRoutes
