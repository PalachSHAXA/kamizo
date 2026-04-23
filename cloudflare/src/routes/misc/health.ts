// Health check, tenant config, and monitoring/admin metrics routes

import type { Env } from '../../types';
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantForRequest, getTenantId } from '../../middleware/tenant';
import { getCacheStats } from '../../cache';
import { invalidateOnChange } from '../../cache';
import { metricsAggregator, healthCheck, AlertManager, logAnalyticsEvent } from '../../monitoring';
import { json, error } from '../../utils/helpers';
import { createRequestLogger } from '../../utils/logger';

export function registerHealthRoutes() {

// Health Check
// PUBLIC: no auth required
route('GET', '/api/health', async (request, env) => {
  const health = await healthCheck(env);
  const status = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 503 : 503;
  return json(health, status);
});

// Tenant Config (returns current tenant's configuration)
// PUBLIC: no auth required
route('GET', '/api/tenant/config', async (request, env) => {
  const tenant = getTenantForRequest(request);
  if (!tenant) {
    return json({ tenant: null, features: [] });
  }

  try {
    const features = JSON.parse((tenant.features as string) || '[]');
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
  } catch (err) {
    createRequestLogger(request).error('Error parsing tenant features', err);
    return json({ tenant: null, features: [] });
  }
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
// PUBLIC: no auth required
route('POST', '/api/admin/monitoring/frontend-error', async (request, env) => {
  try {
    const body = await request.json() as any;

    // Log frontend error
    const log = createRequestLogger(request);
    log.error('Frontend error reported', null, {
      timestamp: body.timestamp,
      errorMessage: body.error?.message,
      errorUrl: body.url,
      userId: body.userId,
    });

    // Store in metrics aggregator
    metricsAggregator.logError({
      message: `[Frontend] ${body.error?.message || 'Unknown error'}`,
      endpoint: body.url || 'unknown',
      method: 'FRONTEND',
      timestamp: Date.now(),
      stack: body.error?.stack,
      userAgent: body.userAgent,
      userId: body.userId,
    });

    // Send to Cloudflare Analytics if available
    if (env.ENVIRONMENT === 'production') {
      logAnalyticsEvent(request, 'frontend_error', {
        error_name: body.error?.name || 'UnknownError',
        error_message: body.error?.message || 'Unknown error',
        url: body.url,
        userId: body.userId,
      });
    }

    return json({ message: 'Error logged successfully' });
  } catch (err) {
    createRequestLogger(request).error('Failed to log frontend error', err);
    return error('Failed to log error', 500);
  }
});

} // end registerHealthRoutes
