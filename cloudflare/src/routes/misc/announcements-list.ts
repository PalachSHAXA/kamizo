// Announcements: List route (complex targeting logic)

import type { Env } from '../../types';
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { json, error, isManagement, getPaginationParams, createPaginatedResponse } from '../../utils/helpers';
import { createRequestLogger } from '../../utils/logger';

export function registerAnnouncementListRoutes() {

// Announcements: List
route('GET', '/api/announcements', async (request, env) => {
  const fc = await requireFeature('announcements', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const pagination = getPaginationParams(url);
  const tenantId = getTenantId(request);

  let whereClause: string;
  let params: any[] = [];

  if (isManagement(user)) {
    // Admins/directors/managers see all
    whereClause = `WHERE 1=1 ${tenantId ? 'AND tenant_id = ?' : ''}`;
    if (tenantId) params.push(tenantId);
  } else if (user.role === 'resident') {
    // Residents see announcements targeted to them
    const hasBuilding = user.building_id !== null && user.building_id !== undefined;
    const userEntrance = user.entrance || null;
    const userFloor = user.floor || null;

    // Get user's branch code from their building
    let userBranchCode: string | null = null;
    if (hasBuilding) {
      const buildingInfo = await env.DB.prepare(
        `SELECT branch_code FROM buildings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
      ).bind(user.building_id, ...(tenantId ? [tenantId] : [])).first() as any;
      userBranchCode = buildingInfo?.branch_code || null;
    }

    whereClause = `
      WHERE is_active = 1
        AND (expires_at IS NULL OR expires_at > datetime('now'))
        AND (type = 'residents' OR type = 'all')
        ${tenantId ? 'AND tenant_id = ?' : ''}
        AND (
          target_type IS NULL
          OR target_type = ''
          OR target_type = 'all'
          ${userBranchCode ? `OR (target_type = 'branch' AND target_branch = ?)` : ''}
          ${hasBuilding ? `OR (target_type = 'building' AND target_building_id = ?)` : ''}
          ${hasBuilding && userEntrance ? `OR (target_type = 'entrance' AND target_building_id = ? AND target_entrance = ?)` : ''}
          ${hasBuilding && userEntrance && userFloor ? `OR (target_type = 'floor' AND target_building_id = ? AND target_entrance = ? AND target_floor = ?)` : ''}
          OR (target_type = 'custom' AND ((',' || target_logins || ',') LIKE ? OR (',' || target_logins || ',') LIKE ?))
        )
    `;

    params = [];
    if (tenantId) params.push(tenantId);
    if (userBranchCode) params.push(userBranchCode);
    if (hasBuilding) params.push(user.building_id);
    if (hasBuilding && userEntrance) {
      params.push(user.building_id, userEntrance);
    }
    if (hasBuilding && userEntrance && userFloor) {
      params.push(user.building_id, userEntrance, userFloor);
    }
    // For target_type = 'custom' - match by login OR apartment number
    params.push(`%,${user.login || ''},%`);
    params.push(`%,${user.apartment || ''},%`);
  } else {
    // Employees (executors, department_heads) see employee announcements
    whereClause = `
      WHERE is_active = 1
        AND (expires_at IS NULL OR expires_at > datetime('now'))
        AND (type = 'employees' OR type = 'staff' OR type = 'all')
        ${tenantId ? 'AND tenant_id = ?' : ''}
    `;
    if (tenantId) params.push(tenantId);
  }

  // Count total
  const countQuery = `SELECT COUNT(*) as total FROM announcements ${whereClause}`;
  const { total } = await env.DB.prepare(countQuery).bind(...params).first() as any;

  // Fetch paginated data with view counts
  const offset = ((pagination.page || 1) - 1) * (pagination.limit || 50);
  const dataQuery = `
    SELECT a.*,
      (SELECT COUNT(*) FROM announcement_views WHERE announcement_id = a.id ${tenantId ? 'AND tenant_id = ?' : ''}) as view_count,
      (SELECT name FROM users WHERE id = a.created_by ${tenantId ? 'AND tenant_id = ?' : ''}) as author_name
    FROM announcements a
    ${whereClause}
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const subqueryTenantIds = tenantId ? [tenantId, tenantId] : [];
  // IMPORTANT: subquery ?s appear in SELECT (before WHERE), so they must be bound FIRST
  const { results } = await env.DB.prepare(dataQuery).bind(...subqueryTenantIds, ...params, pagination.limit, offset).all();

  // For current user, check which announcements they've viewed
  const announcementIds = (results as any[]).map(a => a.id);
  let viewedByUser: Set<string> = new Set();

  if (announcementIds.length > 0) {
    const placeholders = announcementIds.map(() => '?').join(',');
    const { results: views } = await env.DB.prepare(
      `SELECT announcement_id FROM announcement_views WHERE user_id = ? AND announcement_id IN (${placeholders}) ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(user.id, ...announcementIds, ...(tenantId ? [tenantId] : [])).all();
    viewedByUser = new Set((views as any[]).map(v => v.announcement_id));
  }

  // Add viewed_by_user flag and apply personalized content for residents
  const enrichedResults = (results as any[]).map(a => {
    let content = a.content;

    // For residents, apply personalized content if available
    if (user.role === 'resident' && a.personalized_data) {
      try {
        const personalizedData = typeof a.personalized_data === 'string'
          ? JSON.parse(a.personalized_data)
          : a.personalized_data;

        const userData = personalizedData[user.login];
        if (userData) {
          content = content
            .replace(/\{name\}/g, userData.name || user.name || '')
            .replace(/\{debt\}/g, (userData.debt || 0).toLocaleString('ru-RU'));
        }
      } catch (e) {
        createRequestLogger(request).error('Error parsing personalized_data', e);
      }
    }

    return {
      ...a,
      content,
      viewed_by_user: viewedByUser.has(a.id),
      personalized_data: user.role === 'resident' ? undefined : a.personalized_data
    };
  });

  const response = createPaginatedResponse(enrichedResults, total || 0, pagination);

  return json({ announcements: response.data, pagination: response.pagination });
});

} // end registerAnnouncementListRoutes
