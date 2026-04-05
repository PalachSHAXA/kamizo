// Ad categories route

import { route } from '../../router';
import { requireFeature } from '../../middleware/tenant';
import { getCached, setCache } from '../../middleware/cache-local';
import { json, error } from '../../utils/helpers';
import { createRequestLogger } from '../../utils/logger';

export function registerCategoryRoutes() {

// Get ad categories
// PUBLIC: no auth required
route('GET', '/api/ads/categories', async (request, env) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  try {
    const cacheKey = 'ad-categories:all';
    const cached = getCached<any>(cacheKey);
    if (cached) return json(cached);

    const { results } = await env.DB.prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM ads WHERE category_id = c.id AND is_active = 1) as active_ads_count
       FROM ad_categories c ORDER BY sort_order LIMIT 500`
    ).all();
    const result = { categories: results };
    setCache(cacheKey, result, 300000); // 5 min cache
    return json(result);
  } catch (err: any) {
    const log = createRequestLogger(request);
    log.error('Error fetching categories', err);
    return error('Internal server error', 500);
  }
});

} // end registerCategoryRoutes
