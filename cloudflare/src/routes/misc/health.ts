// Health check, tenant config, and monitoring/admin metrics routes

import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantForRequest, getTenantId } from '../../middleware/tenant';
import { getCacheStats } from '../../cache';
import { invalidateOnChange } from '../../cache';
import { metricsAggregator, healthCheck, AlertManager, logAnalyticsEvent } from '../../monitoring';
import { json, error } from '../../utils/helpers';
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
function buildConfigResponse(tenant: Record<string, unknown>) {
  let features: string[] = [];
  try {
    features = JSON.parse((tenant.features as string) || '[]');
  } catch {
    features = [];
  }
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
      show_useful_contacts_banner: tenant.show_useful_contacts_banner !== 0 ? 1 : 0,
      show_marketplace_banner: tenant.show_marketplace_banner !== 0 ? 1 : 0,
    },
    features
  });
}

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
    return buildConfigResponse(fromOrigin);
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
        const tenant = await env.DB.prepare(
          'SELECT * FROM tenants WHERE id = ? AND is_active = 1'
        ).bind(payload.tenantId).first() as Record<string, unknown> | null;
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

  // 3. Nothing matched. Same response as before this change for
  //    every existing caller that didn't have an Origin slug.
  return json({ tenant: null, features: [] });
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
