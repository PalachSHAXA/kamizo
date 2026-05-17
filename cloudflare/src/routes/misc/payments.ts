// Payment details and apartment balance routes

import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId } from '../../middleware/tenant';
import { json, error, isManagement } from '../../utils/helpers';

export function registerPaymentRoutes() {

// GET /api/payments/:id — single payment details
route('GET', '/api/payments/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  const payment = await env.DB.prepare(
    `SELECT * FROM payments WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!payment) return error('Payment not found', 404);

  // Sprint 62 P0: ownership check. Was returning any payment by id to any
  // authenticated tenant member.
  if (!isManagement(authUser)) {
    if (payment.resident_id !== authUser.id) {
      const apt = await env.DB.prepare(
        'SELECT 1 FROM apartments WHERE id = ? AND primary_owner_id = ?'
      ).bind(payment.apartment_id, authUser.id).first();
      if (!apt) return error('Forbidden', 403);
    }
  }

  return json({ payment });
});

// GET /api/apartments/:apartmentId/balance — apartment balance summary
route('GET', '/api/apartments/:apartmentId/balance', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);

  // Sprint 62 P0: ownership check. Was leaking total_charged/total_paid
  // for any apartment id a resident could probe.
  if (!isManagement(authUser)) {
    const apt = await env.DB.prepare(
      `SELECT 1 FROM apartments WHERE id = ? AND primary_owner_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(params.apartmentId, authUser.id, ...(tenantId ? [tenantId] : [])).first();
    if (!apt) return error('Forbidden', 403);
  }

  let where = 'WHERE apartment_id = ?';
  const bindParams: any[] = [params.apartmentId];
  if (tenantId) { where += ' AND tenant_id = ?'; bindParams.push(tenantId); }

  const result = await env.DB.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) as total_charged,
      COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as total_paid
    FROM payments ${where}
  `).bind(...bindParams).first() as any;

  const totalCharged = Number(result?.total_charged || 0);
  const totalPaid = Number(result?.total_paid || 0);

  return json({
    apartment_id: params.apartmentId,
    total_charged: totalCharged,
    total_paid: totalPaid,
    balance: totalPaid - totalCharged,
  });
});

} // end registerPaymentRoutes
