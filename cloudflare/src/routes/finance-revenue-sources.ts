// PR-9 (feat/smeta-write-endpoints): CRUD-эндпоинты для revenue_sources
// (миграция 083). До этого таблица только читалась в GET /:id.
//
// Права: canEditEstimate (тот же круг, что редактирует expenses/staff).
// Tenant-isolation: любая операция валидирует, что смета принадлежит
// текущему tenant'у, и revenue_source привязан к этой смете.
//
// Валидация source_type: CHECK на уровне SQLite фильтрует enum, но мы
// возвращаем 400 с понятной ошибкой раньше — чтобы не полагаться на
// низкоуровневый SQL error.

import { route } from '../router';
import { getUser } from '../middleware/auth';
import { getTenantId, requireFeature } from '../middleware/tenant';
import {
  json,
  error,
  bilingualError,
  generateId,
  canEditEstimate,
  estimateEditBlockedReason,
} from '../utils/helpers';

const ALLOWED_SOURCE_TYPES = new Set([
  'commercial',
  'parking',
  'basement',
  'telecom',
  'advertising',
  'common_property_rent',
  'other',
]);

interface RevenueSourceBody {
  source_type?: string;
  description?: string | null;
  amount?: number;
  contract_ref?: string | null;
  period?: string | null;
  legal_classification?: boolean | number;
  sort_order?: number;
}

async function loadEstimateForEdit(env: any, request: Request, estimateId: string) {
  const tenantId = getTenantId(request);
  const est = await env.DB.prepare(
    `SELECT id, status, approval_status, scope_level FROM finance_estimates
      WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''} LIMIT 1`
  ).bind(estimateId, ...(tenantId ? [tenantId] : [])).first();
  return { est, tenantId };
}

export function registerFinanceRevenueSourcesRoutes() {

  // POST — создать источник дохода.
  route('POST', '/api/finance/estimates/:id/revenue-sources', async (request, env, params) => {
    const user = await getUser(request, env);
    if (!user) return error('Unauthorized', 401);
    const fc = await requireFeature('communal', env, request);
    if (!fc.allowed) return error(fc.error!, 403);
    if (!canEditEstimate(user)) return error('Нет прав на редактирование сметы', 403);

    const { est, tenantId } = await loadEstimateForEdit(env, request, params.id);
    if (!est) return error('Estimate not found', 404);
    const blocked = estimateEditBlockedReason(est);
    if (blocked) return bilingualError(blocked[0], blocked[1], 409);

    const body = await request.json() as RevenueSourceBody;

    if (!body.source_type || !ALLOWED_SOURCE_TYPES.has(body.source_type)) {
      return error(`Invalid source_type; must be one of ${Array.from(ALLOWED_SOURCE_TYPES).join(', ')}`, 400);
    }
    if (typeof body.amount !== 'number' || !isFinite(body.amount) || body.amount < 0) {
      return error('amount must be a non-negative number', 400);
    }

    const id = generateId();
    await env.DB.prepare(
      `INSERT INTO revenue_sources
        (id, tenant_id, estimate_id, source_type, description, amount,
         contract_ref, period, legal_classification, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      tenantId || '',
      params.id,
      body.source_type,
      body.description ?? null,
      body.amount,
      body.contract_ref ?? null,
      body.period ?? null,
      body.legal_classification ? 1 : 0,
      typeof body.sort_order === 'number' ? body.sort_order : 0
    ).run();

    const created = await env.DB.prepare(
      `SELECT * FROM revenue_sources WHERE id = ?`
    ).bind(id).first();
    return json({ revenue_source: created }, 201);
  });

  // PUT — обновить существующий (partial-friendly, но без магии: только
  // явно переданные поля меняются). id + estimate_id + tenant_id не
  // редактируются никогда.
  route('PUT', '/api/finance/estimates/:id/revenue-sources/:sourceId', async (request, env, params) => {
    const user = await getUser(request, env);
    if (!user) return error('Unauthorized', 401);
    const fc = await requireFeature('communal', env, request);
    if (!fc.allowed) return error(fc.error!, 403);
    if (!canEditEstimate(user)) return error('Нет прав на редактирование сметы', 403);

    const { est, tenantId } = await loadEstimateForEdit(env, request, params.id);
    if (!est) return error('Estimate not found', 404);
    const blocked = estimateEditBlockedReason(est);
    if (blocked) return bilingualError(blocked[0], blocked[1], 409);

    const existing = await env.DB.prepare(
      `SELECT id FROM revenue_sources
        WHERE id = ? AND estimate_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(params.sourceId, params.id, ...(tenantId ? [tenantId] : [])).first();
    if (!existing) return error('Revenue source not found', 404);

    const body = await request.json() as RevenueSourceBody;
    const updates: string[] = [];
    const values: unknown[] = [];

    if (body.source_type !== undefined) {
      if (!ALLOWED_SOURCE_TYPES.has(body.source_type)) {
        return error(`Invalid source_type; must be one of ${Array.from(ALLOWED_SOURCE_TYPES).join(', ')}`, 400);
      }
      updates.push('source_type = ?'); values.push(body.source_type);
    }
    if (body.description !== undefined)      { updates.push('description = ?');      values.push(body.description ?? null); }
    if (body.amount !== undefined) {
      if (typeof body.amount !== 'number' || !isFinite(body.amount) || body.amount < 0) {
        return error('amount must be a non-negative number', 400);
      }
      updates.push('amount = ?'); values.push(body.amount);
    }
    if (body.contract_ref !== undefined)     { updates.push('contract_ref = ?');     values.push(body.contract_ref ?? null); }
    if (body.period !== undefined)           { updates.push('period = ?');           values.push(body.period ?? null); }
    if (body.legal_classification !== undefined) {
      updates.push('legal_classification = ?'); values.push(body.legal_classification ? 1 : 0);
    }
    if (body.sort_order !== undefined) {
      if (typeof body.sort_order !== 'number') return error('sort_order must be a number', 400);
      updates.push('sort_order = ?'); values.push(body.sort_order);
    }

    if (updates.length === 0) {
      return json({ revenue_source: await env.DB.prepare(`SELECT * FROM revenue_sources WHERE id = ?`).bind(params.sourceId).first() });
    }

    values.push(params.sourceId);
    await env.DB.prepare(
      `UPDATE revenue_sources SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...values).run();

    const updated = await env.DB.prepare(
      `SELECT * FROM revenue_sources WHERE id = ?`
    ).bind(params.sourceId).first();
    return json({ revenue_source: updated });
  });

  // DELETE — удалить.
  route('DELETE', '/api/finance/estimates/:id/revenue-sources/:sourceId', async (request, env, params) => {
    const user = await getUser(request, env);
    if (!user) return error('Unauthorized', 401);
    const fc = await requireFeature('communal', env, request);
    if (!fc.allowed) return error(fc.error!, 403);
    if (!canEditEstimate(user)) return error('Нет прав на редактирование сметы', 403);

    const { est, tenantId } = await loadEstimateForEdit(env, request, params.id);
    if (!est) return error('Estimate not found', 404);
    const blocked = estimateEditBlockedReason(est);
    if (blocked) return bilingualError(blocked[0], blocked[1], 409);

    const existing = await env.DB.prepare(
      `SELECT id FROM revenue_sources
        WHERE id = ? AND estimate_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(params.sourceId, params.id, ...(tenantId ? [tenantId] : [])).first();
    if (!existing) return error('Revenue source not found', 404);

    await env.DB.prepare(
      `DELETE FROM revenue_sources WHERE id = ?`
    ).bind(params.sourceId).run();
    return json({ success: true });
  });

}
