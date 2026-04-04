// Announcements: View tracking routes

import type { Env } from '../../types';
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { json, error, generateId, isManagement } from '../../utils/helpers';

export function registerAnnouncementViewRoutes() {

// Announcements: Mark as viewed
route('POST', '/api/announcements/:id/view', async (request, env, params) => {
  const fc = await requireFeature('announcements', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const announcementId = params.id;
  const tenantIdView = getTenantId(request);

  // Check if already viewed
  const existing = await env.DB.prepare(
    `SELECT id FROM announcement_views WHERE announcement_id = ? AND user_id = ? ${tenantIdView ? 'AND tenant_id = ?' : ''}`
  ).bind(announcementId, user.id, ...(tenantIdView ? [tenantIdView] : [])).first();

  if (!existing) {
    const id = generateId();
    await env.DB.prepare(
      'INSERT INTO announcement_views (id, announcement_id, user_id, tenant_id) VALUES (?, ?, ?, ?)'
    ).bind(id, announcementId, user.id, getTenantId(request)).run();
  }

  return json({ success: true });
});

// Announcements: Get view count and viewers list with statistics
route('GET', '/api/announcements/:id/views', async (request, env, params) => {
  const fc = await requireFeature('announcements', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const announcementId = params.id;
  const tenantIdViews = getTenantId(request);

  // Get announcement details for targeting
  const announcement = await env.DB.prepare(
    `SELECT * FROM announcements WHERE id = ? ${tenantIdViews ? 'AND tenant_id = ?' : ''}`
  ).bind(announcementId, ...(tenantIdViews ? [tenantIdViews] : [])).first() as any;

  if (!announcement) {
    return error('Announcement not found', 404);
  }

  // Get total view count
  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM announcement_views WHERE announcement_id = ? ${tenantIdViews ? 'AND tenant_id = ?' : ''}`
  ).bind(announcementId, ...(tenantIdViews ? [tenantIdViews] : [])).first() as any;

  const viewCount = countResult?.count || 0;

  // Calculate target audience size based on targeting
  let targetAudienceSize = 0;
  let targetAudienceQuery = `SELECT COUNT(*) as count FROM users WHERE role = 'resident' ${tenantIdViews ? 'AND tenant_id = ?' : ''}`;
  const queryParams: any[] = tenantIdViews ? [tenantIdViews] : [];

  if (announcement.target_type === 'building' && announcement.target_building_id) {
    targetAudienceQuery += ' AND building_id = ?';
    queryParams.push(announcement.target_building_id);
  } else if (announcement.target_type === 'custom' && announcement.target_logins) {
    const logins = announcement.target_logins.split(',').filter(Boolean);
    if (logins.length > 0) {
      const placeholders = logins.map(() => '?').join(',');
      targetAudienceQuery += ` AND login IN (${placeholders})`;
      queryParams.push(...logins);
    }
  }

  const audienceResult = await env.DB.prepare(targetAudienceQuery).bind(...queryParams).first() as any;
  targetAudienceSize = audienceResult?.count || 0;

  // Calculate percentage
  const viewPercentage = targetAudienceSize > 0 ? Math.round((viewCount / targetAudienceSize) * 100) : 0;

  // For admin/director/manager - also get list of viewers
  let viewers: any[] = [];
  if (isManagement(user)) {
    const { results } = await env.DB.prepare(`
      SELECT u.id, u.name, u.login, u.apartment, u.address, av.viewed_at
      FROM announcement_views av
      JOIN users u ON av.user_id = u.id
      WHERE av.announcement_id = ? ${tenantIdViews ? 'AND av.tenant_id = ?' : ''}
      ORDER BY av.viewed_at DESC
      LIMIT 100
    `).bind(announcementId, ...(tenantIdViews ? [tenantIdViews] : [])).all();
    viewers = results as any[];
  }

  // Check if current user has viewed
  const userViewed = await env.DB.prepare(
    `SELECT id FROM announcement_views WHERE announcement_id = ? AND user_id = ? ${tenantIdViews ? 'AND tenant_id = ?' : ''}`
  ).bind(announcementId, user.id, ...(tenantIdViews ? [tenantIdViews] : [])).first();

  return json({
    count: viewCount,
    targetAudienceSize,
    viewPercentage,
    viewers,
    userViewed: !!userViewed
  });
});

} // end registerAnnouncementViewRoutes
