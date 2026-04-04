// Request categories

import type { Env } from '../../types';
import { route } from '../../router';
import { getTenantId } from '../../middleware/tenant';
import { cachedQuery, CacheTTL, CachePrefix } from '../../cache';
import { json } from '../../utils/helpers';

export function registerCategoryRoutes() {

// PUBLIC: no auth required
route('GET', '/api/categories', async (request, env) => {
  const tenantId = getTenantId(request);
  const cacheKey = `${CachePrefix.CATEGORIES_ALL}:${tenantId || 'global'}`;
  const results = await cachedQuery(
    cacheKey,
    CacheTTL.CATEGORIES,
    async () => {
      const { results } = await env.DB.prepare(
        `SELECT * FROM categories WHERE is_active = 1 ${tenantId ? 'AND (tenant_id = ? OR tenant_id IS NULL)' : ''}`
      ).bind(...(tenantId ? [tenantId] : [])).all();
      return results;
    },
    env.RATE_LIMITER
  );

  return json(results, 200, 'public, max-age=86400');
});

} // end registerCategoryRoutes
