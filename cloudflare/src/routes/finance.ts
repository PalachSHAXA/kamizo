// Finance module routes: estimates, charges, payments, income, materials, claims, access
import type { Env, User } from '../types';
import { route } from '../router';
import { getUser } from '../middleware/auth';
import { getTenantId, requireFeature } from '../middleware/tenant';
import { json, error, generateId, isManagement, isAdminLevel, getPaginationParams, createPaginatedResponse } from '../utils/helpers';
import { createRequestLogger } from '../utils/logger';

// ── Helper: finance access check ──────────────────────────────────

async function hasFinanceAccess(
  user: User,
  env: Env,
  request: Request,
  requiredLevel?: 'full' | 'payments_only' | 'view_only'
): Promise<boolean> {
  if (user.role === 'super_admin' || user.role === 'admin' || user.role === 'director') return true;
  const tenantId = getTenantId(request);
  const row = await env.DB.prepare(
    `SELECT access_level FROM finance_access WHERE user_id = ? ${tenantId ? 'AND tenant_id = ?' : ''} LIMIT 1`
  ).bind(user.id, ...(tenantId ? [tenantId] : [])).first<{ access_level: string }>();
  if (!row) return false;
  if (!requiredLevel) return true;
  const levels: Record<string, number> = { view_only: 1, payments_only: 2, full: 3 };
  return (levels[row.access_level] || 0) >= (levels[requiredLevel] || 0);
}

// ==================== FINANCE ROUTES ====================

export function registerFinanceRoutes() {

// ── РАСХОДНАЯ СМЕТА ──────────────────────────────────────────────

// 1. GET /api/finance/estimates — список смет
route('GET', '/api/finance/estimates', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  if (user.role === 'resident' || user.role === 'tenant') {
    if (!await hasFinanceAccess(user, env, request, 'view_only')) return error('Access denied', 403);
  }

  const tenantId = getTenantId(request);
  const url = new URL(request.url);
  const buildingId = url.searchParams.get('building_id');
  const period = url.searchParams.get('period');
  const status = url.searchParams.get('status');

  let where = tenantId ? 'e.tenant_id = ?' : '1=1';
  const params: (string | number)[] = tenantId ? [tenantId] : [];
  if (buildingId) { where += ' AND e.building_id = ?'; params.push(buildingId); }
  if (period) { where += ' AND e.period = ?'; params.push(period); }
  if (status) { where += ' AND e.status = ?'; params.push(status); }

  const { results: estimates } = await env.DB.prepare(
    `SELECT e.*, b.name as building_name FROM finance_estimates e LEFT JOIN buildings b ON e.building_id = b.id WHERE ${where} ORDER BY e.period DESC, e.created_at DESC LIMIT 500`
  ).bind(...params).all();

  // Fetch items for each estimate
  const ids = estimates.map((e: Record<string, unknown>) => e.id);
  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    const { results: items } = await env.DB.prepare(
      `SELECT * FROM finance_estimate_items WHERE estimate_id IN (${placeholders}) ORDER BY sort_order`
    ).bind(...ids).all();
    const itemMap = new Map<string, unknown[]>();
    for (const item of items) {
      const eid = (item as Record<string, unknown>).estimate_id as string;
      if (!itemMap.has(eid)) itemMap.set(eid, []);
      itemMap.get(eid)!.push(item);
    }
    for (const est of estimates) {
      (est as Record<string, unknown>).items = itemMap.get((est as Record<string, unknown>).id as string) || [];
    }
  }

  return json({ estimates });
});

// 2. GET /api/finance/estimates/:id — детали сметы
route('GET', '/api/finance/estimates/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const tenantId = getTenantId(request);
  const estimate = await env.DB.prepare(
    `SELECT e.*, b.name as building_name FROM finance_estimates e LEFT JOIN buildings b ON e.building_id = b.id WHERE e.id = ? ${tenantId ? 'AND e.tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  if (!estimate) return error('Estimate not found', 404);

  const { results: items } = await env.DB.prepare(
    'SELECT * FROM finance_estimate_items WHERE estimate_id = ? ORDER BY sort_order'
  ).bind(params.id).all();

  return json({ estimate: { ...estimate, items } });
});

// 3. POST /api/finance/estimates — создать смету
route('POST', '/api/finance/estimates', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  if (!isAdminLevel(user)) return error('Admin or director access required', 403);

  const tenantId = getTenantId(request);
  const body = await request.json() as Record<string, unknown>;
  const { building_id, period, title, items, uk_profit_percent, non_commercial_coefficient, show_profit_to_residents,
    effective_date, enterprise_profit_percent, commercial_rate: commercialRateInput, basement_rate, parking_rate } = body as {
    building_id: string; period: string; title?: string; items: { name: string; category?: string; amount: number; monthly_amount?: number; description?: string }[];
    uk_profit_percent?: number; non_commercial_coefficient?: number; show_profit_to_residents?: number;
    effective_date?: string; enterprise_profit_percent?: number; commercial_rate?: number; basement_rate?: number; parking_rate?: number;
  };

  if (!building_id || !items?.length) return error('building_id and items are required');

  const profitPct = uk_profit_percent ?? enterprise_profit_percent ?? 9;
  const ncCoeff = non_commercial_coefficient ?? 1.5;
  const totalAmount = items.reduce((sum, i) => sum + (i.amount || 0), 0);
  const totalWithProfit = totalAmount * (1 + profitPct / 100);

  // Get building areas
  const areaQuery = tenantId
    ? 'SELECT COALESCE(SUM(CASE WHEN property_type = \'non_commercial\' THEN total_area ELSE 0 END), 0) as nc_area, COALESCE(SUM(CASE WHEN property_type != \'non_commercial\' OR property_type IS NULL THEN total_area ELSE 0 END), 0) as c_area FROM apartments WHERE building_id = ? AND tenant_id = ?'
    : 'SELECT COALESCE(SUM(CASE WHEN property_type = \'non_commercial\' THEN total_area ELSE 0 END), 0) as nc_area, COALESCE(SUM(CASE WHEN property_type != \'non_commercial\' OR property_type IS NULL THEN total_area ELSE 0 END), 0) as c_area FROM apartments WHERE building_id = ?';
  const areas = await env.DB.prepare(areaQuery).bind(building_id, ...(tenantId ? [tenantId] : [])).first<{ nc_area: number; c_area: number }>();
  const cArea = areas?.c_area || 0;
  const ncArea = areas?.nc_area || 0;
  const totalWeightedArea = cArea + ncArea * ncCoeff;
  const commercialRate = totalWeightedArea > 0 ? totalWithProfit / totalWeightedArea : 0;
  const nonCommercialRate = commercialRate * ncCoeff;

  const id = generateId();
  await env.DB.prepare(
    `INSERT INTO finance_estimates (id, building_id, period, title, total_amount, commercial_rate_per_sqm, non_commercial_rate_per_sqm, non_commercial_coefficient, uk_profit_percent, show_profit_to_residents, effective_date, enterprise_profit_percent, commercial_rate, basement_rate, parking_rate, status, created_by, tenant_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`
  ).bind(id, building_id, period || null, title || (effective_date ? `Смета с ${effective_date}` : `Смета за ${period}`), totalAmount, commercialRate, nonCommercialRate, ncCoeff, profitPct, show_profit_to_residents || 0, effective_date || null, enterprise_profit_percent ?? 9, commercialRateInput ?? 0, basement_rate ?? 0, parking_rate ?? 0, user.id, tenantId || '').run();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    await env.DB.prepare(
      'INSERT INTO finance_estimate_items (id, estimate_id, name, category, amount, monthly_amount, description, sort_order, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(generateId(), id, item.name, item.category || 'maintenance', item.amount || 0, item.monthly_amount || 0, item.description || null, i, tenantId || '').run();
  }

  return json({ estimate: { id, building_id, period, effective_date, total_amount: totalAmount, commercial_rate_per_sqm: commercialRate, non_commercial_rate_per_sqm: nonCommercialRate, status: 'draft' } }, 201);
});

// 4. PUT /api/finance/estimates/:id — обновить смету (только draft)
route('PUT', '/api/finance/estimates/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  if (!isAdminLevel(user)) return error('Admin or director access required', 403);

  const tenantId = getTenantId(request);
  const existing = await env.DB.prepare(
    `SELECT * FROM finance_estimates WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first<{ status: string; building_id: string }>();
  if (!existing) return error('Estimate not found', 404);
  if (existing.status !== 'draft') return error('Only draft estimates can be edited', 400);

  const body = await request.json() as Record<string, unknown>;
  const { title, items, uk_profit_percent, non_commercial_coefficient, show_profit_to_residents, show_debtor_status_to_residents } = body as {
    title?: string; items?: { name: string; category?: string; amount: number; description?: string }[];
    uk_profit_percent?: number; non_commercial_coefficient?: number; show_profit_to_residents?: number; show_debtor_status_to_residents?: number;
  };

  // P07 fix: use existing estimate's profit percent as fallback instead of hardcoded 10
  const existingEstimate = await env.DB.prepare(
    `SELECT uk_profit_percent FROM finance_estimates WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first<{ uk_profit_percent?: number }>();
  const profitPct = uk_profit_percent ?? existingEstimate?.uk_profit_percent ?? 9;
  const ncCoeff = non_commercial_coefficient ?? 1.5;

  if (items?.length) {
    // Delete old items, insert new
    await env.DB.prepare('DELETE FROM finance_estimate_items WHERE estimate_id = ?').bind(params.id).run();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      await env.DB.prepare(
        'INSERT INTO finance_estimate_items (id, estimate_id, name, category, amount, description, sort_order, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(generateId(), params.id, item.name, item.category || 'maintenance', item.amount || 0, item.description || null, i, tenantId || '').run();
    }

    const totalAmount = items.reduce((sum, i) => sum + (i.amount || 0), 0);
    const totalWithProfit = totalAmount * (1 + profitPct / 100);

    const areaQuery = tenantId
      ? 'SELECT COALESCE(SUM(CASE WHEN property_type = \'non_commercial\' THEN total_area ELSE 0 END), 0) as nc_area, COALESCE(SUM(CASE WHEN property_type != \'non_commercial\' OR property_type IS NULL THEN total_area ELSE 0 END), 0) as c_area FROM apartments WHERE building_id = ? AND tenant_id = ?'
      : 'SELECT COALESCE(SUM(CASE WHEN property_type = \'non_commercial\' THEN total_area ELSE 0 END), 0) as nc_area, COALESCE(SUM(CASE WHEN property_type != \'non_commercial\' OR property_type IS NULL THEN total_area ELSE 0 END), 0) as c_area FROM apartments WHERE building_id = ?';
    const areas = await env.DB.prepare(areaQuery).bind(existing.building_id, ...(tenantId ? [tenantId] : [])).first<{ nc_area: number; c_area: number }>();
    const cArea = areas?.c_area || 0;
    const ncArea = areas?.nc_area || 0;
    const totalWeightedArea = cArea + ncArea * ncCoeff;
    const commercialRate = totalWeightedArea > 0 ? totalWithProfit / totalWeightedArea : 0;
    const nonCommercialRate = commercialRate * ncCoeff;

    await env.DB.prepare(
      `UPDATE finance_estimates SET title = COALESCE(?, title), total_amount = ?, commercial_rate_per_sqm = ?, non_commercial_rate_per_sqm = ?, non_commercial_coefficient = ?, uk_profit_percent = ?, show_profit_to_residents = COALESCE(?, show_profit_to_residents), show_debtor_status_to_residents = COALESCE(?, show_debtor_status_to_residents) WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(title || null, totalAmount, commercialRate, nonCommercialRate, ncCoeff, profitPct, show_profit_to_residents ?? null, show_debtor_status_to_residents ?? null, params.id, ...(tenantId ? [tenantId] : [])).run();
  } else {
    await env.DB.prepare(
      `UPDATE finance_estimates SET title = COALESCE(?, title), uk_profit_percent = ?, non_commercial_coefficient = ?, show_profit_to_residents = COALESCE(?, show_profit_to_residents), show_debtor_status_to_residents = COALESCE(?, show_debtor_status_to_residents) WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(title || null, profitPct, ncCoeff, show_profit_to_residents ?? null, show_debtor_status_to_residents ?? null, params.id, ...(tenantId ? [tenantId] : [])).run();
  }

  return json({ success: true });
});

// 5. POST /api/finance/estimates/:id/activate — draft → active
route('POST', '/api/finance/estimates/:id/activate', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  if (!isAdminLevel(user)) return error('Admin or director access required', 403);

  const tenantId = getTenantId(request);
  const existing = await env.DB.prepare(
    `SELECT status FROM finance_estimates WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first<{ status: string }>();
  if (!existing) return error('Estimate not found', 404);
  if (existing.status !== 'draft') return error('Only draft estimates can be activated', 400);

  // P06 fix: validate estimate has items and positive total before activation
  const itemsCount = await env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM finance_estimate_items WHERE estimate_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first<{ cnt: number }>();
  if (!itemsCount?.cnt || itemsCount.cnt === 0) return error('Невозможно активировать смету без статей расходов', 400);

  const estimateData = await env.DB.prepare(
    `SELECT total_amount FROM finance_estimates WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first<{ total_amount: number }>();
  if (!estimateData?.total_amount || estimateData.total_amount <= 0) return error('Невозможно активировать смету с нулевой суммой', 400);

  // P09: Check for existing active estimate for same building
  const existingActive = await env.DB.prepare(
    `SELECT id FROM finance_estimates WHERE building_id = (SELECT building_id FROM finance_estimates WHERE id = ?) AND status = 'active' AND id != ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, params.id, ...(tenantId ? [tenantId] : [])).first();
  if (existingActive) return error('Для этого здания уже есть активная смета. Деактивируйте её перед активацией новой.', 400);

  await env.DB.prepare(`UPDATE finance_estimates SET status = 'active' WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).run();

  // Check if charges already exist for this estimate
  const chargesCount = await env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM finance_charges WHERE estimate_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first<{ cnt: number }>();

  const cnt = chargesCount?.cnt || 0;
  return json({
    success: true,
    charges_generated: cnt > 0,
    charges_count: cnt,
    message: cnt > 0 ? `Начисления уже сформированы (${cnt})` : 'Начисления ещё не сформированы',
  });
});

// ── НАЧИСЛЕНИЯ ───────────────────────────────────────────────────

// 6. POST /api/finance/charges/generate — массовое начисление
route('POST', '/api/finance/charges/generate', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  if (!isAdminLevel(user)) return error('Admin or director access required', 403);

  const tenantId = getTenantId(request);
  const { estimate_id } = await request.json() as { estimate_id: string };
  if (!estimate_id) return error('estimate_id is required');

  const estimate = await env.DB.prepare(
    `SELECT * FROM finance_estimates WHERE id = ? AND status = 'active' ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(estimate_id, ...(tenantId ? [tenantId] : [])).first<Record<string, unknown>>();
  if (!estimate) return error('Active estimate not found', 404);

  // Get estimate items for breakdown
  const { results: items } = await env.DB.prepare(
    'SELECT * FROM finance_estimate_items WHERE estimate_id = ? ORDER BY sort_order'
  ).bind(estimate_id).all();

  // Get all apartments for this building (include is_commercial flag)
  const { results: apartments } = await env.DB.prepare(
    `SELECT id, number, total_area, living_area, property_type, is_commercial, status FROM apartments WHERE building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(estimate.building_id as string, ...(tenantId ? [tenantId] : [])).all();

  const period = estimate.period as string;

  // Rate hierarchy: specific rates from estimate, fallback to per-sqm rates
  const commercialRate = Number(estimate.commercial_rate) || 0;       // rate for commercial premises per sqm
  const basementRate = Number(estimate.basement_rate) || 0;           // rate for basement per sqm
  const parkingRate = Number(estimate.parking_rate) || 0;             // rate per parking space
  const residentialRate = Number(estimate.commercial_rate_per_sqm) || 0;     // residential rate per sqm
  const nonResidentialRate = Number(estimate.non_commercial_rate_per_sqm) || 0; // non-residential rate per sqm

  // Calculate last day of month for due_date
  const [year, month] = period.split('-').map(Number);
  const dueDate = new Date(year, month, 0).toISOString().split('T')[0]; // last day of month

  let generated = 0;
  for (const apt of apartments) {
    const a = apt as Record<string, unknown>;
    const area = Number(a.total_area) || 0;
    if (area <= 0) continue;

    // Determine rate based on apartment type
    let rate: number;
    let propertyType: string;

    if (a.is_commercial) {
      // Commercial premise — uses commercial_rate if set, otherwise non_commercial rate
      rate = commercialRate > 0 ? commercialRate : nonResidentialRate;
      propertyType = 'commercial';
    } else if (a.property_type === 'non_commercial' || a.property_type === 'basement') {
      rate = basementRate > 0 ? basementRate : nonResidentialRate;
      propertyType = 'non_commercial';
    } else {
      // Regular residential
      rate = residentialRate;
      propertyType = 'residential';
    }

    const baseAmount = Math.round(area * rate * 100) / 100;

    // Build detailed breakdown
    const totalEstimate = estimate.total_amount as number;
    const itemBreakdown = items.map((item: Record<string, unknown>) => ({
      name: item.name,
      share: totalEstimate > 0 ? Math.round((item.amount as number) / totalEstimate * baseAmount * 100) / 100 : 0,
    }));
    const breakdown = {
      area_sqm: area,
      rate_per_sqm: rate,
      base_amount: baseAmount,
      property_type: propertyType,
      items: itemBreakdown,
    };

    const amount = baseAmount;

    // Map property_type to DB CHECK constraint values:
    // 'residential' → 'commercial' (existing schema naming), others → 'non_commercial'
    const dbPropertyType = propertyType === 'non_commercial' ? 'non_commercial' : 'commercial';

    // Check if charge already exists for this apartment+period
    const existingCharge = await env.DB.prepare(
      `SELECT id FROM finance_charges WHERE apartment_id = ? AND period = ? AND estimate_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(a.id as string, period, estimate_id, ...(tenantId ? [tenantId] : [])).first();
    if (existingCharge) continue; // skip duplicates

    await env.DB.prepare(
      `INSERT INTO finance_charges (id, apartment_id, estimate_id, period, amount, amount_breakdown, property_type, area_sqm, rate_per_sqm, status, due_date, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
    ).bind(
      generateId(), a.id as string, estimate_id, period, amount,
      JSON.stringify(breakdown), dbPropertyType,
      area, rate, dueDate, tenantId || ''
    ).run();
    generated++;
  }

  // P10: Auto-record UK income from enterprise profit in estimate
  const enterpriseProfit = Number(estimate.enterprise_profit) || 0;
  if (generated > 0 && enterpriseProfit > 0) {
    await env.DB.prepare(
      'INSERT INTO finance_income (id, category_id, amount, period, description, source_type, source_id, created_by, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      generateId(), 'fic_other', enterpriseProfit, period,
      `Доход предприятия от сметы (${generated} квартир)`,
      'estimate', estimate_id, user.id, tenantId || ''
    ).run();
  }

  return json({ success: true, generated, total_apartments: apartments.length });
});

// 7. GET /api/finance/charges — список начислений
route('GET', '/api/finance/charges', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const tenantId = getTenantId(request);
  const url = new URL(request.url);
  const pagination = getPaginationParams(url);
  const apartmentId = url.searchParams.get('apartment_id');
  const period = url.searchParams.get('period');
  const status = url.searchParams.get('status');
  const buildingId = url.searchParams.get('building_id');

  let where = tenantId ? 'c.tenant_id = ?' : '1=1';
  const bindParams: (string | number)[] = tenantId ? [tenantId] : [];

  // Resident sees only their own
  if (user.role === 'resident' || user.role === 'tenant') {
    where += ' AND c.apartment_id IN (SELECT id FROM apartments WHERE primary_owner_id = ?)';
    bindParams.push(user.id);
  }

  if (apartmentId) { where += ' AND c.apartment_id = ?'; bindParams.push(apartmentId); }
  if (period) { where += ' AND c.period = ?'; bindParams.push(period); }
  if (status) { where += ' AND c.status = ?'; bindParams.push(status); }
  if (buildingId) { where += ' AND c.apartment_id IN (SELECT id FROM apartments WHERE building_id = ?)'; bindParams.push(buildingId); }

  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) as total FROM finance_charges c WHERE ${where}`
  ).bind(...bindParams).first<{ total: number }>();
  const total = countResult?.total || 0;

  const offset = ((pagination.page || 1) - 1) * (pagination.limit || 50);
  const { results } = await env.DB.prepare(
    `SELECT c.*, a.number as apartment_number, a.building_id, b.name as building_name
     FROM finance_charges c
     LEFT JOIN apartments a ON c.apartment_id = a.id
     LEFT JOIN buildings b ON a.building_id = b.id
     WHERE ${where} ORDER BY c.period DESC, a.number ASC LIMIT ? OFFSET ?`
  ).bind(...bindParams, pagination.limit || 50, offset).all();

  return json(createPaginatedResponse(results, total, pagination));
});

// 8. GET /api/finance/charges/summary — сводка по зданию
route('GET', '/api/finance/charges/summary', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  if (!await hasFinanceAccess(user, env, request, 'view_only')) return error('Finance access required', 403);

  const tenantId = getTenantId(request);
  const url = new URL(request.url);
  const buildingId = url.searchParams.get('building_id');
  const period = url.searchParams.get('period');

  if (!buildingId) return json({ summary: { total_charged: 0, total_paid: 0, total_debt: 0, total_overpaid: 0 } });

  let where = 'c.apartment_id IN (SELECT id FROM apartments WHERE building_id = ?)';
  const bindParams: (string | number)[] = [buildingId];
  if (tenantId) { where += ' AND c.tenant_id = ?'; bindParams.push(tenantId); }
  if (period) { where += ' AND c.period = ?'; bindParams.push(period); }

  const summary = await env.DB.prepare(
    `SELECT COALESCE(SUM(c.amount), 0) as total_charged, COALESCE(SUM(c.paid_amount), 0) as total_paid,
     COALESCE(SUM(CASE WHEN c.amount > c.paid_amount THEN c.amount - c.paid_amount ELSE 0 END), 0) as total_debt,
     COALESCE(SUM(CASE WHEN c.paid_amount > c.amount THEN c.paid_amount - c.amount ELSE 0 END), 0) as total_overpaid
     FROM finance_charges c WHERE ${where}`
  ).bind(...bindParams).first();

  return json({ summary });
});

// ── ОПЛАТЫ ───────────────────────────────────────────────────────

// 9. POST /api/finance/payments — принять оплату
route('POST', '/api/finance/payments', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  if (!await hasFinanceAccess(user, env, request, 'payments_only')) return error('Finance payment access required', 403);

  const tenantId = getTenantId(request);
  const body = await request.json() as Record<string, unknown>;
  const { apartment_id, amount, payment_type, receipt_number, description } = body as {
    apartment_id: string; amount: number; payment_type?: string; receipt_number?: string; description?: string;
  };

  // P24: isFinite check
  const parsedAmount = Number(amount);
  if (!apartment_id || !parsedAmount || !isFinite(parsedAmount) || parsedAmount <= 0) return error('apartment_id and positive amount are required');
  // P23: Max payment amount
  if (parsedAmount > 100_000_000) return error('Сумма оплаты не может превышать 100 000 000', 400);

  // Generate receipt number: FIN-YYYY-NNNN
  const year = new Date().getFullYear();
  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM finance_payments WHERE receipt_number LIKE ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(`FIN-${year}-%`, ...(tenantId ? [tenantId] : [])).first<{ cnt: number }>();
  const seq = (countResult?.cnt || 0) + 1;
  const generatedReceipt = receipt_number || `FIN-${year}-${String(seq).padStart(4, '0')}`;

  // Get unpaid charges for this apartment, oldest first
  const { results: unpaidCharges } = await env.DB.prepare(
    `SELECT id, amount, paid_amount FROM finance_charges
     WHERE apartment_id = ? AND status != 'paid' ${tenantId ? 'AND tenant_id = ?' : ''}
     ORDER BY period ASC, created_at ASC`
  ).bind(apartment_id, ...(tenantId ? [tenantId] : [])).all();

  let remaining = parsedAmount;
  let firstChargeId: string | null = null;

  // P01+P17: Collect batch updates instead of N+1 loop
  const batchStatements: D1PreparedStatement[] = [];

  for (const charge of unpaidCharges) {
    if (remaining <= 0) break;
    const c = charge as Record<string, unknown>;
    const chargeAmount = c.amount as number;
    const paidAmount = (c.paid_amount as number) || 0;
    const owed = chargeAmount - paidAmount;
    if (owed <= 0) continue;

    if (!firstChargeId) firstChargeId = c.id as string;
    const apply = Math.min(remaining, owed);
    const newPaid = paidAmount + apply;
    const newStatus = newPaid >= chargeAmount ? 'paid' : 'partial';

    batchStatements.push(
      env.DB.prepare('UPDATE finance_charges SET paid_amount = ?, status = ? WHERE id = ?')
        .bind(newPaid, newStatus, c.id as string)
    );

    remaining -= apply;
  }

  const paymentId = generateId();
  batchStatements.push(
    env.DB.prepare(
      `INSERT INTO finance_payments (id, charge_id, apartment_id, amount, payment_type, receipt_number, description, received_by, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(paymentId, firstChargeId, apartment_id, parsedAmount, payment_type || 'cash', generatedReceipt, description || null, user.id, tenantId || '')
  );

  // P15: If overpayment remains, record it as credit
  if (remaining > 0) {
    batchStatements.push(
      env.DB.prepare(
        `INSERT INTO finance_payments (id, charge_id, apartment_id, amount, payment_type, receipt_number, description, received_by, tenant_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(generateId(), null, apartment_id, remaining, 'overpayment', generatedReceipt + '-OVP', 'Переплата (автоматически)', user.id, tenantId || '')
    );
  }

  // Execute all in single batch transaction
  await env.DB.batch(batchStatements);

  return json({ payment: { id: paymentId, receipt_number: generatedReceipt, amount: parsedAmount, remaining_overpay: remaining > 0 ? remaining : 0 } }, 201);
});

// 10. GET /api/finance/payments — список оплат
route('GET', '/api/finance/payments', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const tenantId = getTenantId(request);
  const url = new URL(request.url);
  const pagination = getPaginationParams(url);
  const apartmentId = url.searchParams.get('apartment_id');
  const period = url.searchParams.get('period');
  const paymentType = url.searchParams.get('payment_type');

  let where = tenantId ? 'p.tenant_id = ?' : '1=1';
  const bindParams: (string | number)[] = tenantId ? [tenantId] : [];

  if (user.role === 'resident' || user.role === 'tenant') {
    where += ' AND p.apartment_id IN (SELECT id FROM apartments WHERE primary_owner_id = ?)';
    bindParams.push(user.id);
  }

  if (apartmentId) { where += ' AND p.apartment_id = ?'; bindParams.push(apartmentId); }
  if (period) { where += " AND strftime('%Y-%m', p.payment_date) = ?"; bindParams.push(period); }
  if (paymentType) { where += ' AND p.payment_type = ?'; bindParams.push(paymentType); }

  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) as total FROM finance_payments p WHERE ${where}`
  ).bind(...bindParams).first<{ total: number }>();

  const offset = ((pagination.page || 1) - 1) * (pagination.limit || 50);
  const { results } = await env.DB.prepare(
    `SELECT p.*, a.number as apartment_number FROM finance_payments p
     LEFT JOIN apartments a ON p.apartment_id = a.id
     WHERE ${where} ORDER BY p.payment_date DESC LIMIT ? OFFSET ?`
  ).bind(...bindParams, pagination.limit || 50, offset).all();

  return json(createPaginatedResponse(results, countResult?.total || 0, pagination));
});

// ── ДОЛЖНИКИ ─────────────────────────────────────────────────────

// 11. GET /api/finance/debtors — список должников
route('GET', '/api/finance/debtors', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  if (!await hasFinanceAccess(user, env, request, 'view_only')) return error('Finance access required', 403);

  const tenantId = getTenantId(request);
  const url = new URL(request.url);
  const buildingId = url.searchParams.get('building_id');
  const minDebt = parseFloat(url.searchParams.get('min_debt') || '0');
  const minMonths = parseInt(url.searchParams.get('min_months_overdue') || '0', 10);
  // P24: guard against NaN
  if (!isFinite(minDebt) || !isFinite(minMonths)) return error('Invalid filter parameters', 400);

  let where = tenantId ? 'c.tenant_id = ?' : '1=1';
  const bindParams: (string | number)[] = tenantId ? [tenantId] : [];
  if (buildingId) {
    where += ' AND a.building_id = ?';
    bindParams.push(buildingId);
  }

  const { results } = await env.DB.prepare(
    `SELECT a.id as apartment_id, a.number as apartment_number, a.building_id,
       b.name as building_name, u.name as owner_name, u.phone as owner_phone,
       SUM(c.amount - c.paid_amount) as total_debt,
       COUNT(DISTINCT c.period) as months_overdue,
       (SELECT MAX(p.payment_date) FROM finance_payments p WHERE p.apartment_id = a.id) as last_payment_date
     FROM finance_charges c
     JOIN apartments a ON c.apartment_id = a.id
     LEFT JOIN buildings b ON a.building_id = b.id
     LEFT JOIN users u ON a.primary_owner_id = u.id
     WHERE ${where} AND c.status != 'paid' AND c.amount > c.paid_amount AND c.due_date < date('now')
     GROUP BY a.id
     HAVING total_debt >= ?
     ${minMonths > 0 ? 'AND months_overdue >= ?' : ''}
     ORDER BY total_debt DESC LIMIT 500`
  ).bind(...bindParams, minDebt, ...(minMonths > 0 ? [minMonths] : [])).all();

  return json({ debtors: results });
});

// ── ДОХОДЫ УК ────────────────────────────────────────────────────

// 12. GET /api/finance/income — список доходов
route('GET', '/api/finance/income', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  if (!isAdminLevel(user)) return error('Admin or director access required', 403);

  const tenantId = getTenantId(request);
  const url = new URL(request.url);
  const period = url.searchParams.get('period');
  const categoryId = url.searchParams.get('category_id');

  let where = tenantId ? 'i.tenant_id = ?' : '1=1';
  const bindParams: (string | number)[] = tenantId ? [tenantId] : [];
  if (period) { where += ' AND i.period = ?'; bindParams.push(period); }
  if (categoryId) { where += ' AND i.category_id = ?'; bindParams.push(categoryId); }

  const { results } = await env.DB.prepare(
    `SELECT i.*, c.name as category_name FROM finance_income i
     LEFT JOIN finance_income_categories c ON i.category_id = c.id
     WHERE ${where} ORDER BY i.created_at DESC LIMIT 500`
  ).bind(...bindParams).all();

  return json({ income: results });
});

// 13. POST /api/finance/income — добавить доход
route('POST', '/api/finance/income', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  if (!isAdminLevel(user)) return error('Admin or director access required', 403);

  const tenantId = getTenantId(request);
  const body = await request.json() as Record<string, unknown>;
  const { category_id, amount, period, description, source_type, source_id } = body as {
    category_id?: string; amount: number; period?: string; description?: string; source_type?: string; source_id?: string;
  };

  if (!amount || !isFinite(Number(amount)) || Number(amount) <= 0) return error('Positive amount is required');

  const id = generateId();
  await env.DB.prepare(
    'INSERT INTO finance_income (id, category_id, amount, period, description, source_type, source_id, created_by, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, category_id || null, amount, period || null, description || null, source_type || null, source_id || null, user.id, tenantId || '').run();

  return json({ income: { id, amount, period } }, 201);
});

// 14. GET /api/finance/income/categories — категории доходов
route('GET', '/api/finance/income/categories', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  if (!isAdminLevel(user)) return error('Admin or director access required', 403);

  const tenantId = getTenantId(request);
  const { results } = await env.DB.prepare(
    `SELECT * FROM finance_income_categories WHERE (tenant_id = ? OR is_default = 1) AND is_active = 1 ORDER BY name`
  ).bind(tenantId || '').all();

  return json({ categories: results });
});

// 15. POST /api/finance/income/categories — создать кастомную категорию
route('POST', '/api/finance/income/categories', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  if (!isAdminLevel(user)) return error('Admin or director access required', 403);

  const tenantId = getTenantId(request);
  const { name } = await request.json() as { name: string };
  if (!name?.trim()) return error('Name is required');

  const id = generateId();
  await env.DB.prepare(
    'INSERT INTO finance_income_categories (id, name, is_default, is_active, tenant_id) VALUES (?, ?, 0, 1, ?)'
  ).bind(id, name.trim(), tenantId || '').run();

  return json({ category: { id, name: name.trim() } }, 201);
});

// ── МАТЕРИАЛЫ ────────────────────────────────────────────────────

// 16. GET /api/finance/materials — список материалов
route('GET', '/api/finance/materials', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  // P11 fix: restrict materials to management only
  if (!isManagement(user)) return error('Manager access required', 403);

  const tenantId = getTenantId(request);
  const url = new URL(request.url);
  const buildingId = url.searchParams.get('building_id');

  let where = tenantId ? 'tenant_id = ?' : '1=1';
  const bindParams: (string | number)[] = tenantId ? [tenantId] : [];
  if (buildingId) { where += ' AND building_id = ?'; bindParams.push(buildingId); }

  const { results } = await env.DB.prepare(
    `SELECT * FROM finance_materials WHERE ${where} ORDER BY name LIMIT 500`
  ).bind(...bindParams).all();

  return json({ materials: results });
});

// 17. POST /api/finance/materials — добавить/обновить материал
route('POST', '/api/finance/materials', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  if (!isManagement(user)) return error('Manager access required', 403);

  const tenantId = getTenantId(request);
  const body = await request.json() as Record<string, unknown>;
  const { id: existingId, name, unit, quantity, price_per_unit, min_quantity, building_id } = body as {
    id?: string; name: string; unit?: string; quantity?: number; price_per_unit?: number; min_quantity?: number; building_id?: string;
  };

  if (!name?.trim()) return error('Name is required');

  if (existingId) {
    // P20 fix: add tenant_id to WHERE clause
    await env.DB.prepare(
      `UPDATE finance_materials SET name = ?, unit = ?, quantity = ?, price_per_unit = ?, min_quantity = ?, building_id = ? WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(name.trim(), unit || 'шт', quantity ?? 0, price_per_unit ?? 0, min_quantity ?? 0, building_id || null, existingId, ...(tenantId ? [tenantId] : [])).run();
    return json({ material: { id: existingId } });
  }

  const id = generateId();
  await env.DB.prepare(
    'INSERT INTO finance_materials (id, name, unit, quantity, price_per_unit, min_quantity, building_id, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, name.trim(), unit || 'шт', quantity ?? 0, price_per_unit ?? 0, min_quantity ?? 0, building_id || null, tenantId || '').run();

  return json({ material: { id, name: name.trim() } }, 201);
});

// 18. POST /api/finance/materials/:id/usage — списать материал
route('POST', '/api/finance/materials/:id/usage', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  // P12 fix: restrict material usage to management only
  if (!isManagement(user)) return error('Manager access required', 403);

  const tenantId = getTenantId(request);
  const material = await env.DB.prepare(
    `SELECT id, quantity FROM finance_materials WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first<{ id: string; quantity: number }>();
  if (!material) return error('Material not found', 404);

  const body = await request.json() as Record<string, unknown>;
  const { quantity, request_id, estimate_item_id, description } = body as {
    quantity: number; request_id?: string; estimate_item_id?: string; description?: string;
  };

  if (!quantity || quantity <= 0) return error('Positive quantity is required');
  if (quantity > material.quantity) return error('Insufficient stock', 400);

  const usageId = generateId();
  await env.DB.prepare(
    'INSERT INTO finance_material_usage (id, material_id, quantity, request_id, estimate_item_id, used_by, description, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(usageId, params.id, quantity, request_id || null, estimate_item_id || null, user.id, description || null, tenantId || '').run();

  // P21+P22 fix: atomic update with tenant_id and quantity check
  const updateResult = await env.DB.prepare(
    `UPDATE finance_materials SET quantity = quantity - ? WHERE id = ? AND quantity >= ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(quantity, params.id, quantity, ...(tenantId ? [tenantId] : [])).run();

  if (!updateResult.meta.changes) return error('Insufficient stock or material not found', 400);

  return json({ usage: { id: usageId }, new_quantity: material.quantity - quantity }, 201);
});

// ── АКТ СВЕРКИ / ПРЕТЕНЗИЯ ───────────────────────────────────────

// 19. POST /api/finance/claims/reconciliation — акт сверки
route('POST', '/api/finance/claims/reconciliation', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const tenantId = getTenantId(request);
  const body = await request.json() as Record<string, unknown>;
  const { apartment_id, period_from, period_to, resident_id } = body as { apartment_id: string; period_from: string; period_to: string; resident_id?: string };

  if (!apartment_id || !period_from || !period_to) return error('apartment_id, period_from, period_to are required');

  // Resident can only view their own
  if (user.role === 'resident' || user.role === 'tenant') {
    const owns = await env.DB.prepare(
      'SELECT id FROM apartments WHERE id = ? AND primary_owner_id = ?'
    ).bind(apartment_id, user.id).first();
    if (!owns) return error('Access denied', 403);
  } else if (!await hasFinanceAccess(user, env, request, 'view_only')) {
    return error('Finance access required', 403);
  }

  // Get charges
  const { results: charges } = await env.DB.prepare(
    `SELECT * FROM finance_charges WHERE apartment_id = ? AND period >= ? AND period <= ? ${tenantId ? 'AND tenant_id = ?' : ''} ORDER BY period`
  ).bind(apartment_id, period_from, period_to, ...(tenantId ? [tenantId] : [])).all();

  // Get payments
  const { results: payments } = await env.DB.prepare(
    `SELECT * FROM finance_payments WHERE apartment_id = ? AND payment_date >= ? AND payment_date <= ? ${tenantId ? 'AND tenant_id = ?' : ''} ORDER BY payment_date`
  ).bind(apartment_id, period_from + '-01', period_to + '-31', ...(tenantId ? [tenantId] : [])).all();

  // Get apartment & owner info
  const apartment = await env.DB.prepare(
    'SELECT a.*, u.name as owner_name, u.phone as owner_phone, b.name as building_name, b.address as building_address FROM apartments a LEFT JOIN users u ON a.primary_owner_id = u.id LEFT JOIN buildings b ON a.building_id = b.id WHERE a.id = ?'
  ).bind(apartment_id).first();

  const totalCharged = charges.reduce((s, c) => s + ((c as Record<string, unknown>).amount as number || 0), 0);
  const totalPaid = payments.reduce((s, p) => s + ((p as Record<string, unknown>).amount as number || 0), 0);

  // Resolve resident_id: use provided or fall back to primary_owner_id
  const resolvedResidentId = resident_id || (apartment as any)?.primary_owner_id || null;

  // Save claim record
  const claimId = generateId();
  await env.DB.prepare(
    `INSERT INTO finance_claims (id, apartment_id, resident_id, claim_type, total_debt, period_from, period_to, generated_by, tenant_id)
     VALUES (?, ?, ?, 'reconciliation', ?, ?, ?, ?, ?)`
  ).bind(claimId, apartment_id, resolvedResidentId, totalCharged - totalPaid, period_from, period_to, user.id, tenantId || '').run();

  return json({
    claim: { id: claimId, type: 'reconciliation', resident_id: resolvedResidentId },
    apartment, charges, payments,
    totals: { charged: totalCharged, paid: totalPaid, balance: totalCharged - totalPaid }
  });
});

// 20. POST /api/finance/claims/pretension — претензия
route('POST', '/api/finance/claims/pretension', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  if (!isAdminLevel(user)) return error('Admin or director access required', 403);

  const tenantId = getTenantId(request);
  const { apartment_id } = await request.json() as { apartment_id: string };
  if (!apartment_id) return error('apartment_id is required');

  // Get total debt
  const debtResult = await env.DB.prepare(
    `SELECT SUM(amount - paid_amount) as total_debt, MIN(period) as first_overdue_period
     FROM finance_charges WHERE apartment_id = ? AND status != 'paid' AND amount > paid_amount ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(apartment_id, ...(tenantId ? [tenantId] : [])).first<{ total_debt: number; first_overdue_period: string }>();

  if (!debtResult?.total_debt || debtResult.total_debt <= 0) return error('No debt found for this apartment', 400);

  // Get apartment & owner info
  const apartment = await env.DB.prepare(
    'SELECT a.*, u.name as owner_name, u.phone as owner_phone, u.address as owner_address, b.name as building_name, b.address as building_address FROM apartments a LEFT JOIN users u ON a.primary_owner_id = u.id LEFT JOIN buildings b ON a.building_id = b.id WHERE a.id = ?'
  ).bind(apartment_id).first();

  const now = new Date().toISOString().split('T')[0];
  const currentPeriod = now.substring(0, 7);

  // Save claim record
  const claimId = generateId();
  await env.DB.prepare(
    `INSERT INTO finance_claims (id, apartment_id, claim_type, total_debt, period_from, period_to, deadline_days, generated_by, tenant_id)
     VALUES (?, ?, 'pretension', ?, ?, ?, 14, ?, ?)`
  ).bind(claimId, apartment_id, debtResult.total_debt, debtResult.first_overdue_period || currentPeriod, currentPeriod, user.id, tenantId || '').run();

  return json({
    claim: { id: claimId, type: 'pretension', deadline_days: 14 },
    apartment,
    debt: { total: debtResult.total_debt, first_overdue_period: debtResult.first_overdue_period },
    generated_date: now
  });
});

// ── КОНТРОЛЬ ДОСТУПА ─────────────────────────────────────────────

// 21. GET /api/finance/access — список с доступом
route('GET', '/api/finance/access', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  if (!isAdminLevel(user)) return error('Admin or director access required', 403);

  const tenantId = getTenantId(request);
  const { results } = await env.DB.prepare(
    `SELECT fa.*, u.name as user_name, u.role as user_role, gu.name as granted_by_name
     FROM finance_access fa
     LEFT JOIN users u ON fa.user_id = u.id
     LEFT JOIN users gu ON fa.granted_by = gu.id
     WHERE ${tenantId ? 'fa.tenant_id = ?' : '1=1'} ORDER BY fa.granted_at DESC LIMIT 500`
  ).bind(...(tenantId ? [tenantId] : [])).all();

  return json({ access: results });
});

// 22. POST /api/finance/access — дать доступ
route('POST', '/api/finance/access', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  if (!isAdminLevel(user)) return error('Admin or director access required', 403);

  const tenantId = getTenantId(request);
  const body = await request.json() as Record<string, unknown>;
  const { user_id, access_level } = body as { user_id: string; access_level?: string };

  if (!user_id) return error('user_id is required');
  const level = access_level || 'view_only';
  if (!['full', 'payments_only', 'view_only'].includes(level)) return error('Invalid access_level');

  // Upsert: remove old, insert new
  await env.DB.prepare(
    `DELETE FROM finance_access WHERE user_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(user_id, ...(tenantId ? [tenantId] : [])).run();

  const id = generateId();
  await env.DB.prepare(
    'INSERT INTO finance_access (id, user_id, access_level, granted_by, tenant_id) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, user_id, level, user.id, tenantId || '').run();

  return json({ access: { id, user_id, access_level: level } }, 201);
});

// 23. DELETE /api/finance/access/:id — убрать доступ
route('DELETE', '/api/finance/access/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  if (!isAdminLevel(user)) return error('Admin or director access required', 403);

  const tenantId = getTenantId(request);
  await env.DB.prepare(
    `DELETE FROM finance_access WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).run();

  return json({ success: true });
});

// ── БАЛАНС КВАРТИРЫ ──────────────────────────────────────────────

// 24. GET /api/finance/apartments/:apartmentId/balance — полный баланс
// Residents can always view their own balance (even if 'communal' feature is off for admin panel)
route('GET', '/api/finance/apartments/:apartmentId/balance', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  // Only require 'communal' feature for staff (not residents viewing their own balance)
  if (user.role !== 'resident' && user.role !== 'tenant') {
    const fc = await requireFeature('communal', env, request);
    if (!fc.allowed) return error(fc.error!, 403);
  }

  const tenantId = getTenantId(request);
  const aptId = params.apartmentId;

  // Resident can only view their own
  if (user.role === 'resident' || user.role === 'tenant') {
    const owns = await env.DB.prepare(
      'SELECT id FROM apartments WHERE id = ? AND primary_owner_id = ?'
    ).bind(aptId, user.id).first();
    if (!owns) return error('Access denied', 403);
  } else if (!await hasFinanceAccess(user, env, request, 'view_only')) {
    return error('Finance access required', 403);
  }

  // Total charged and paid
  const totals = await env.DB.prepare(
    `SELECT COALESCE(SUM(amount), 0) as total_charged, COALESCE(SUM(paid_amount), 0) as total_paid
     FROM finance_charges WHERE apartment_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(aptId, ...(tenantId ? [tenantId] : [])).first<{ total_charged: number; total_paid: number }>();

  const totalCharged = totals?.total_charged || 0;
  const totalPaid = totals?.total_paid || 0;
  const balance = totalCharged - totalPaid;

  // Charges by month
  const { results: chargesByMonth } = await env.DB.prepare(
    `SELECT period, SUM(amount) as charged, SUM(paid_amount) as paid, SUM(amount - paid_amount) as debt
     FROM finance_charges WHERE apartment_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
     GROUP BY period ORDER BY period DESC LIMIT 24`
  ).bind(aptId, ...(tenantId ? [tenantId] : [])).all();

  return json({
    balance: {
      total_charged: totalCharged,
      total_paid: totalPaid,
      balance,
      overpaid: balance > 0 ? balance : 0,
      debt: balance < 0 ? Math.abs(balance) : 0,
    },
    charges_by_month: chargesByMonth,
  });
});

// ── BUILDING CHARGE STATUS (for residents) ───────────────────────

// 25. GET /api/finance/charges/building-status — apartment payment statuses (no amounts, no names)
route('GET', '/api/finance/charges/building-status', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const tenantId = getTenantId(request);
  const url = new URL(request.url);
  const buildingId = url.searchParams.get('building_id');
  const period = url.searchParams.get('period');

  if (!buildingId || !period) return json({ statuses: [] });

  // If resident — check that the active estimate allows showing debtor status
  if (user.role === 'resident' || user.role === 'tenant') {
    const estimate = await env.DB.prepare(
      `SELECT show_debtor_status_to_residents FROM finance_estimates WHERE building_id = ? AND period = ? AND status = 'active' ${tenantId ? 'AND tenant_id = ?' : ''} LIMIT 1`
    ).bind(buildingId, period, ...(tenantId ? [tenantId] : [])).first<{ show_debtor_status_to_residents: number }>();

    if (!estimate || !estimate.show_debtor_status_to_residents) {
      return error('Status view not enabled for residents', 403);
    }
  }

  const { results } = await env.DB.prepare(
    `SELECT a.number as apartment_number, c.status
     FROM finance_charges c
     JOIN apartments a ON c.apartment_id = a.id
     WHERE a.building_id = ? AND c.period = ? ${tenantId ? 'AND c.tenant_id = ?' : ''}
     ORDER BY CAST(a.number AS INTEGER)`
  ).bind(buildingId, period, ...(tenantId ? [tenantId] : [])).all();

  return json({ statuses: results });
});

// ==================== EXPENSES ====================

// GET /api/finance/expenses — list expenses with filters
route('GET', '/api/finance/expenses', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);

  const url = new URL(request.url);
  const buildingId = url.searchParams.get('building_id') || '';
  const period = url.searchParams.get('period') || ''; // YYYY-MM

  let sql = `SELECT e.*, u.name as created_by_name, ei.name as item_name FROM finance_expenses e LEFT JOIN users u ON e.created_by = u.id LEFT JOIN finance_estimate_items ei ON e.estimate_item_id = ei.id WHERE 1=1`;
  const binds: any[] = [];

  if (tenantId) { sql += ` AND e.tenant_id = ?`; binds.push(tenantId); }
  if (buildingId) { sql += ` AND e.building_id = ?`; binds.push(buildingId); }
  if (period) { sql += ` AND e.expense_date LIKE ?`; binds.push(period + '%'); }

  sql += ` ORDER BY e.expense_date DESC, e.created_at DESC LIMIT 500`;

  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return json({ expenses: results });
});

// POST /api/finance/expenses — create expense
route('POST', '/api/finance/expenses', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isManagement(user)) return error('Forbidden', 403);
  const tenantId = getTenantId(request);

  const body = await request.json() as any;
  const { building_id, estimate_id, estimate_item_id, estimate_item_name, amount, expense_date, description, document_url, request_id } = body;

  if (!amount || !expense_date) return error('Amount and date required');

  // Resolve item name from ID if provided
  let resolvedItemName = estimate_item_name || null;
  if (estimate_item_id && !resolvedItemName) {
    const item = await env.DB.prepare('SELECT name FROM finance_estimate_items WHERE id = ?').bind(estimate_item_id).first<{ name: string }>();
    if (item) resolvedItemName = item.name;
  }

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO finance_expenses (id, tenant_id, building_id, estimate_id, estimate_item_name, amount, expense_date, description, document_url, request_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, tenantId || '', building_id || null, estimate_id || null, resolvedItemName,
    amount, expense_date, description || null, document_url || null, request_id || null, user.id
  ).run();

  return json({ expense: { id, ...body, created_by: user.id, created_by_name: user.name } }, 201);
});

// GET /api/finance/expenses/summary — plan vs fact by estimate items
route('GET', '/api/finance/expenses/summary', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);

  const url = new URL(request.url);
  const buildingId = url.searchParams.get('building_id') || '';
  const period = url.searchParams.get('period') || '';

  // Get active estimate for this building
  let estimateSql = `SELECT * FROM finance_estimates WHERE status = 'active'`;
  const estBinds: any[] = [];
  if (tenantId) { estimateSql += ` AND tenant_id = ?`; estBinds.push(tenantId); }
  if (buildingId) { estimateSql += ` AND building_id = ?`; estBinds.push(buildingId); }
  estimateSql += ` ORDER BY created_at DESC LIMIT 1`;

  const estimate = await env.DB.prepare(estimateSql).bind(...estBinds).first<any>();

  // Get plan items
  let planItems: any[] = [];
  if (estimate) {
    const { results: items } = await env.DB.prepare(
      `SELECT * FROM finance_estimate_items WHERE estimate_id = ? ORDER BY sort_order`
    ).bind(estimate.id).all();
    planItems = items || [];
  }

  // Get actual expenses grouped by item name
  let factSql = `SELECT estimate_item_name, SUM(amount) as total_spent, COUNT(*) as count FROM finance_expenses WHERE 1=1`;
  const factBinds: any[] = [];
  if (tenantId) { factSql += ` AND tenant_id = ?`; factBinds.push(tenantId); }
  if (buildingId) { factSql += ` AND building_id = ?`; factBinds.push(buildingId); }
  if (period) { factSql += ` AND expense_date LIKE ?`; factBinds.push(period + '%'); }
  factSql += ` GROUP BY estimate_item_name`;

  const { results: factRows } = await env.DB.prepare(factSql).bind(...factBinds).all();
  const factMap: Record<string, number> = {};
  (factRows || []).forEach((r: any) => { if (r.estimate_item_name) factMap[r.estimate_item_name] = r.total_spent; });

  // Combine plan + fact
  const summary = planItems.map((item: any) => ({
    name: item.name,
    plan_monthly: item.monthly_amount || Math.round(Number(item.amount) / 12),
    plan_yearly: item.amount,
    fact: factMap[item.name] || 0,
    difference: (item.amount || 0) - (factMap[item.name] || 0),
  }));

  return json({
    summary,
    estimate_id: estimate?.id || null,
    enterprise_profit_percent: estimate?.enterprise_profit_percent || estimate?.uk_profit_percent || 0,
  });
});

} // end registerFinanceRoutes
