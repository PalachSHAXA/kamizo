// WebSocket route — JWT auth via query parameter

import type { Env, User } from '../../types';
import { route } from '../../router';
import { verifyJWT } from '../../utils/crypto';
import { getTenantId } from '../../middleware/tenant';
import { json, error } from '../../utils/helpers';

export function registerWebSocketRoutes() {

route('GET', '/api/ws', async (request, env) => {
  const url = new URL(request.url);
  const upgradeHeader = request.headers.get('Upgrade');

  if (!upgradeHeader || upgradeHeader !== 'websocket') {
    return error('Expected WebSocket upgrade', 400);
  }

  // Authenticate via JWT token in query parameter
  const token = url.searchParams.get('token');
  if (!token) {
    return error('Unauthorized', 401);
  }

  const payload = await verifyJWT(token, env.JWT_SECRET);
  if (!payload) {
    return error('Invalid or expired token', 401);
  }

  // Resolve user from DB using verified JWT userId
  const tenantFilter = payload.tenantId
    ? 'AND tenant_id = ?'
    : "AND (tenant_id IS NULL OR tenant_id = '')";
  const binds = payload.tenantId
    ? [payload.userId, payload.tenantId]
    : [payload.userId];

  const result = await env.DB.prepare(
    `SELECT id, login, phone, name, role, specialization, address, apartment, building_id, entrance, floor, total_area FROM users WHERE id = ? ${tenantFilter}`
  ).bind(...binds).first();

  if (!result) {
    return error('Unauthorized', 401);
  }
  const user = result as unknown as User;

  // Single global DO shard — all connections in one instance for reliable broadcasts
  const id = env.CONNECTION_MANAGER.idFromName('global');
  const stub = env.CONNECTION_MANAGER.get(id);

  // Forward request to Durable Object with user info (clean URL — no token in logs)
  const doUrl = new URL(request.url);
  doUrl.searchParams.delete('token');
  doUrl.searchParams.set('userId', user.id);
  doUrl.searchParams.set('userName', user.name);
  doUrl.searchParams.set('role', user.role);
  if (user.building_id) {
    doUrl.searchParams.set('buildingId', user.building_id);
  }
  // Pass tenantId to ConnectionManager for tenant-isolated broadcasts
  if (payload.tenantId) {
    doUrl.searchParams.set('tenantId', payload.tenantId);
  }

  return stub.fetch(doUrl.toString(), request);
});

} // end registerWebSocketRoutes
