// Announcements: View tracking routes

import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { json, error, generateId, isManagement } from '../../utils/helpers';

// Sprint 67 P1 #5/6: shared targeting check so the view endpoints
// don't accept reads/writes from users outside the announcement's
// audience. Mirrors announcements-list.ts logic.
async function userCanSeeAnnouncement(
  env: { DB: D1Database },
  user: { id: string; role: string; login?: string; apartment?: string; building_id?: string; entrance?: string; floor?: string },
  announcement: any,
): Promise<boolean> {
  if (isManagement(user)) return true;
  if (!announcement.is_active) return false;
  if (announcement.expires_at && new Date(announcement.expires_at) <= new Date()) return false;

  const isResidentLike = user.role === 'resident' || user.role === 'tenant' || user.role === 'commercial_owner';

  if (isResidentLike) {
    if (announcement.type !== 'residents' && announcement.type !== 'all') return false;
  } else {
    // employees: executor, department_head, security, ...
    if (announcement.type !== 'employees' && announcement.type !== 'staff' && announcement.type !== 'all') return false;
  }

  const t = announcement.target_type;
  if (!t || t === '' || t === 'all') return true;

  if (t === 'building') return user.building_id === announcement.target_building_id;
  if (t === 'entrance') return user.building_id === announcement.target_building_id && user.entrance === announcement.target_entrance;
  if (t === 'floor') return user.building_id === announcement.target_building_id && user.entrance === announcement.target_entrance && user.floor === announcement.target_floor;
  if (t === 'branch') {
    if (!user.building_id) return false;
    const b = await env.DB.prepare('SELECT branch_code FROM buildings WHERE id = ?').bind(user.building_id).first() as any;
    return b?.branch_code === announcement.target_branch;
  }
  if (t === 'custom') {
    const haystack = ',' + (announcement.target_logins || '') + ',';
    const userLogin = user.login || '';
    const userApt = user.apartment || '';
    if (userLogin && haystack.includes(`,${userLogin},`)) return true;
    if (userApt && haystack.includes(`,${userApt},`)) return true;
    return false;
  }
  return false;
}

export function registerAnnouncementViewRoutes() {

// Announcements: Mark as viewed
route('POST', '/api/announcements/:id/view', async (request, env, params) => {
  const fc = await requireFeature('announcements', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const announcementId = params.id;
  const tenantIdView = getTenantId(request);

  // Sprint 67 P1 #5: was accepting view inserts for announcements the
  // user can't even see. Inflated view_count and let a curious resident
  // "tag themselves" on staff-only announcements. Load + audience-check
  // first.
  const announcement = await env.DB.prepare(
    `SELECT * FROM announcements WHERE id = ? ${tenantIdView ? 'AND tenant_id = ?' : ''}`
  ).bind(announcementId, ...(tenantIdView ? [tenantIdView] : [])).first() as any;
  if (!announcement) return error('Announcement not found', 404);
  if (!(await userCanSeeAnnouncement(env, user, announcement))) {
    return error('Forbidden', 403);
  }

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

  // Sprint 67 P1 #6: gate the count/percent leak. A curious resident
  // could ID any announcement and learn "N people read it" — including
  // for staff-only announcements. Block non-audience non-management.
  if (!(await userCanSeeAnnouncement(env, user, announcement))) {
    return error('Forbidden', 403);
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
