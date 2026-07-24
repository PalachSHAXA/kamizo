// Finance estimate engine v2 routes.
//
// Живёт отдельно от finance.ts (там 1200+ строк legacy-логики). Работает
// с новой моделью данных из migration 057:
//   - finance_estimates.model = 'TARIFF_CALCULATED' | 'TARIFF_MANUAL' | 'TARIFF_FLAT'
//   - finance_estimate_staff (штат)
//   - finance_estimate_items с колонками kind='expense'/'income', section,
//     unit, linked_to_staff, legal_code
//
// Старые эндпоинты POST /api/finance/estimates (legacy) продолжают работать
// параллельно — их не трогаем до полной миграции UI.
//
// Порядок вызова из UI типичного wizard'а:
//   1. POST /api/finance/estimates/v2 { building_id, model, period, ... } → id
//   2. PUT  /api/finance/estimates/:id/staff    { staff: [...] }
//   3. PUT  /api/finance/estimates/:id/expenses { items: [...] }
//   4. PUT  /api/finance/estimates/:id/incomes  { items: [...] }
//   5. GET  /api/finance/estimates/:id/compute  → preview EstimateResult
//   6. GET  /api/finance/estimates/:id/validate → warnings
//   7. POST /api/finance/estimates/:id/activate (существует в finance.ts)
//   8. POST /api/finance/charges/generate (существует в finance.ts; модифицирован
//      снизу чтобы понимал tariff_resident из v2)

import type { Env } from '../types';
import { route } from '../router';
import { getUser } from '../middleware/auth';
import { getTenantId, requireFeature } from '../middleware/tenant';
import { json, error, generateId, isAdminLevel } from '../utils/helpers';
import {
  computeEstimate,
  type EstimateInput,
  type EstimateModel,
  type StaffPosition,
  type ExpenseLine,
  type IncomeStream,
} from '../lib/estimate/compute';
import { validate } from '../lib/estimate/validators';

// ────────────────────────────────────────────────────────────────────
// DB helpers — тонкие обёртки чтобы не размазывать SQL по хендлерам
// ────────────────────────────────────────────────────────────────────

/**
 * Собрать EstimateInput из БД: estimate row + staff + expense/income items.
 * Плюс building facts (floors, has_elevator, has_pumps, residential_area)
 * для validators.
 */
async function loadEstimateInput(
  env: Env,
  estimateId: string,
  tenantId: string | null,
): Promise<{ input: EstimateInput; building: { floors?: number; has_elevator?: boolean; has_pumps?: boolean }; row: any } | null> {
  const row = await env.DB.prepare(
    `SELECT * FROM finance_estimates WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''} LIMIT 1`
  ).bind(estimateId, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!row) return null;

  const building = await env.DB.prepare(
    `SELECT floors, has_elevator, has_pumps, residential_area FROM buildings WHERE id = ? LIMIT 1`
  ).bind(row.building_id).first() as any;

  // Штат (позиции units × salary)
  const { results: staffRows } = await env.DB.prepare(
    `SELECT title, units, salary FROM finance_estimate_staff WHERE estimate_id = ? ORDER BY sort_order, title`
  ).bind(estimateId).all();
  const staff: StaffPosition[] = (staffRows || []).map((s: any) => ({
    title: s.title,
    units: s.units,
    salary: s.salary,
  }));

  // Статьи: разделяем на expenses и incomes по kind
  const { results: itemRows } = await env.DB.prepare(
    `SELECT name, category, amount, monthly_amount, section, unit, linked_to_staff, legal_code, kind
     FROM finance_estimate_items WHERE estimate_id = ? ORDER BY sort_order, name`
  ).bind(estimateId).all();

  const expenses: ExpenseLine[] = [];
  const incomes: IncomeStream[] = [];
  for (const r of (itemRows || []) as any[]) {
    if (r.kind === 'income') {
      // category выступает как type для income (commercial/basement/parking/telecom/other)
      const type = (['commercial', 'basement', 'parking', 'telecom'].includes(r.category)
        ? r.category
        : 'other') as IncomeStream['type'];
      incomes.push({ type, monthly: r.monthly_amount || 0 });
    } else {
      expenses.push({
        name: r.name,
        monthly: r.monthly_amount || 0,
        section: (r.section as ExpenseLine['section']) || 'production',
        unit: (r.unit as ExpenseLine['unit']) || 'flat',
        linked_to_staff: !!r.linked_to_staff,
        legal_code: r.legal_code || undefined,
      });
    }
  }

  // residential_area берём приоритетно из estimate (снимок на момент создания),
  // иначе из building. Если и там 0 — падаем в 0 (валидатор выдаст warning).
  const residentialArea = row.residential_area || building?.residential_area || 0;

  const input: EstimateInput = {
    model: (row.model || 'TARIFF_CALCULATED') as EstimateModel,
    object: {
      residential_area: residentialArea,
      floors: building?.floors,
      profit_rate: (row.uk_profit_percent || 0) / 100,
      payroll_tax_rate: row.payroll_tax_rate ?? 0.24,
    },
    staff,
    expenses,
    incomes,
    tariff_manual: row.tariff_approved || undefined,
  };

  return {
    input,
    building: {
      floors: building?.floors,
      has_elevator: !!building?.has_elevator,
      has_pumps: !!building?.has_pumps,
    },
    row,
  };
}

/**
 * Записать результат computeEstimate обратно в finance_estimates кешем,
 * чтобы UI мог показывать итоги без пересчёта на каждый GET.
 */
async function persistComputedResult(env: Env, estimateId: string, tenantId: string | null, r: ReturnType<typeof computeEstimate>): Promise<void> {
  await env.DB.prepare(
    `UPDATE finance_estimates
     SET fot_gross = ?, payroll_tax = ?, fot_total = ?,
         self_cost_resident = ?, base_per_m2 = ?, with_profit_per_m2 = ?,
         telecom_comp_per_m2 = ?, tariff_resident = ?,
         jami_tushum_year = ?, umumiy_year = ?, deficit_year = ?
     WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(
    r.fot_gross, r.payroll_tax, r.fot_total,
    r.self_cost_resident, r.base_per_m2, r.with_profit_per_m2,
    r.telecom_comp_per_m2, r.tariff_resident,
    r.jami_tushum_year, r.umumiy_year, r.deficit_year,
    estimateId, ...(tenantId ? [tenantId] : [])
  ).run();
}

// ────────────────────────────────────────────────────────────────────
// Routes
// ────────────────────────────────────────────────────────────────────

export function registerFinanceV2Routes() {

// POST /api/finance/estimates/v2 — создать новую v2-смету (draft)
route('POST', '/api/finance/estimates/v2', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  if (!isAdminLevel(user)) return error('Только admin/director может создавать сметы', 403);

  const body = await request.json() as any;
  const {
    building_id, period, title,
    model = 'TARIFF_CALCULATED',
    uk_profit_percent = 7,
    payroll_tax_rate = 0.24,
    residential_area,               // необязательно — можно взять с buildings
    commercial_income = 0,
    basement_income = 0,
    parking_income = 0,
    telecom_income = 0,
    tariff_approved,                // для TARIFF_MANUAL
    effective_date,
  } = body;

  if (!building_id || !period) return error('building_id and period required');
  if (!['TARIFF_CALCULATED', 'TARIFF_MANUAL', 'TARIFF_FLAT'].includes(model)) {
    return error(`Invalid model: ${model}`);
  }

  const tenantId = getTenantId(request);

  // Sanity: building должен принадлежать тенанту
  const building = await env.DB.prepare(
    `SELECT id, residential_area FROM buildings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''} LIMIT 1`
  ).bind(building_id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!building) return error('Building not found', 404);

  const id = generateId();
  const finalResidentialArea = residential_area ?? building.residential_area ?? 0;

  await env.DB.prepare(
    `INSERT INTO finance_estimates (
      id, building_id, period, title, model, status,
      uk_profit_percent, payroll_tax_rate, residential_area,
      commercial_income, basement_income, parking_income, telecom_income,
      tariff_approved, effective_date,
      created_by, tenant_id
    ) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, building_id, period, title || `Смета ${period}`, model,
    uk_profit_percent, payroll_tax_rate, finalResidentialArea,
    commercial_income, basement_income, parking_income, telecom_income,
    tariff_approved || null, effective_date || null,
    user.id, tenantId || ''
  ).run();

  return json({ id, model, status: 'draft' }, 201);
});

// PUT /api/finance/estimates/:id/staff — заменить весь массив штата
route('PUT', '/api/finance/estimates/:id/staff', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  if (!isAdminLevel(user)) return error('Только admin/director', 403);

  const tenantId = getTenantId(request);
  const est = await env.DB.prepare(
    `SELECT id, status FROM finance_estimates WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''} LIMIT 1`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!est) return error('Estimate not found', 404);
  if (est.status !== 'draft') return error('Only draft estimates can be edited', 409);

  const body = await request.json() as { staff: StaffPosition[] };
  const staff = body.staff || [];

  // Атомарно: удалить старые + вставить новые
  await env.DB.prepare('DELETE FROM finance_estimate_staff WHERE estimate_id = ?').bind(params.id).run();
  for (let i = 0; i < staff.length; i++) {
    const s = staff[i];
    if (!s.title || s.units <= 0) continue;
    await env.DB.prepare(
      `INSERT INTO finance_estimate_staff (id, estimate_id, title, units, salary, monthly, sort_order, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      generateId(), params.id, s.title, s.units, s.salary,
      s.units * s.salary, i, tenantId || ''
    ).run();
  }

  return json({ ok: true, count: staff.length });
});

// PUT /api/finance/estimates/:id/expenses — заменить статьи расходов (kind='expense')
route('PUT', '/api/finance/estimates/:id/expenses', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  if (!isAdminLevel(user)) return error('Только admin/director', 403);

  const tenantId = getTenantId(request);
  const est = await env.DB.prepare(
    `SELECT id, status FROM finance_estimates WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''} LIMIT 1`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!est) return error('Estimate not found', 404);
  if (est.status !== 'draft') return error('Only draft estimates can be edited', 409);

  const body = await request.json() as { items: ExpenseLine[] };
  const items = body.items || [];

  // Удалить только expenses (не трогаем income-строки)
  await env.DB.prepare(
    `DELETE FROM finance_estimate_items WHERE estimate_id = ? AND (kind = 'expense' OR kind IS NULL)`
  ).bind(params.id).run();

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it.name) continue;
    const monthly = it.monthly || 0;
    await env.DB.prepare(
      `INSERT INTO finance_estimate_items (
        id, estimate_id, name, category, amount, monthly_amount,
        section, unit, linked_to_staff, legal_code, kind, sort_order, tenant_id
      ) VALUES (?, ?, ?, 'maintenance', ?, ?, ?, ?, ?, ?, 'expense', ?, ?)`
    ).bind(
      generateId(), params.id, it.name, monthly * 12, monthly,
      it.section || 'production', it.unit || 'flat',
      it.linked_to_staff ? 1 : 0, it.legal_code || null, i, tenantId || ''
    ).run();
  }

  return json({ ok: true, count: items.length });
});

// PUT /api/finance/estimates/:id/incomes — заменить доходные потоки (kind='income')
route('PUT', '/api/finance/estimates/:id/incomes', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  if (!isAdminLevel(user)) return error('Только admin/director', 403);

  const tenantId = getTenantId(request);
  const est = await env.DB.prepare(
    `SELECT id, status FROM finance_estimates WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''} LIMIT 1`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!est) return error('Estimate not found', 404);
  if (est.status !== 'draft') return error('Only draft estimates can be edited', 409);

  const body = await request.json() as { items: IncomeStream[] };
  const items = body.items || [];

  await env.DB.prepare(
    `DELETE FROM finance_estimate_items WHERE estimate_id = ? AND kind = 'income'`
  ).bind(params.id).run();

  // Также обновляем summary-колонки в finance_estimates (commercial_income etc.)
  // — они нужны для computeEstimate когда input не пересобирается из items.
  const totals = { commercial: 0, basement: 0, parking: 0, telecom: 0, other: 0 };
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const type = it.type;
    if (!['commercial', 'basement', 'parking', 'telecom', 'other'].includes(type)) continue;
    const monthly = it.monthly || 0;
    totals[type] += monthly;
    // Пишем как item с category=type — это позволит редактировать per-line в UI
    await env.DB.prepare(
      `INSERT INTO finance_estimate_items (
        id, estimate_id, name, category, amount, monthly_amount,
        kind, sort_order, tenant_id
      ) VALUES (?, ?, ?, ?, ?, ?, 'income', ?, ?)`
    ).bind(
      generateId(), params.id, `Доход: ${type}`, type, monthly * 12, monthly,
      i, tenantId || ''
    ).run();
  }

  await env.DB.prepare(
    `UPDATE finance_estimates
     SET commercial_income = ?, basement_income = ?, parking_income = ?, telecom_income = ?
     WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(
    totals.commercial, totals.basement, totals.parking, totals.telecom,
    params.id, ...(tenantId ? [tenantId] : [])
  ).run();

  return json({ ok: true, count: items.length, totals });
});

// GET /api/finance/estimates/:id/compute — preview без записи
route('GET', '/api/finance/estimates/:id/compute', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const tenantId = getTenantId(request);

  const loaded = await loadEstimateInput(env, params.id, tenantId);
  if (!loaded) return error('Estimate not found', 404);

  const result = computeEstimate(loaded.input);
  // Кэшируем в БД для быстрого GET списком (без пересчёта)
  await persistComputedResult(env, params.id, tenantId, result);

  return json({ input: loaded.input, result });
});

// GET /api/finance/estimates/:id/validate — warnings без записи
route('GET', '/api/finance/estimates/:id/validate', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const tenantId = getTenantId(request);

  const loaded = await loadEstimateInput(env, params.id, tenantId);
  if (!loaded) return error('Estimate not found', 404);

  const result = computeEstimate(loaded.input);
  const warnings = validate(loaded.input, result, loaded.building);

  return json({ warnings });
});

// GET /api/finance/estimates/:id/full — полный снимок (row + staff + items + result)
// для страницы просмотра/редактирования сметы
route('GET', '/api/finance/estimates/:id/full', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const tenantId = getTenantId(request);

  const loaded = await loadEstimateInput(env, params.id, tenantId);
  if (!loaded) return error('Estimate not found', 404);

  const result = computeEstimate(loaded.input);
  const warnings = validate(loaded.input, result, loaded.building);

  return json({
    estimate: loaded.row,
    input: loaded.input,
    result,
    warnings,
    building: loaded.building,
  });
});

// ────────────────────────────────────────────────────────────────────
// Resident: одним запросом — все свои начисления + баланс.
// Работает без apartment_id — резолвим квартиры по primary_owner_id.
// Раньше frontend вынужден был передавать user.id как apartment_id
// (см. B-046 в аудите), и виджет тихо получал 403.
// ────────────────────────────────────────────────────────────────────

route('GET', '/api/finance/my-charges', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);

  // Все квартиры, где юзер = primary_owner. Тенант отфильтруется через
  // общий фильтр tenant_id ниже.
  const { results: myApts } = await env.DB.prepare(
    `SELECT id, number, total_area, building_id
     FROM apartments
     WHERE primary_owner_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(user.id, ...(tenantId ? [tenantId] : [])).all() as any;

  const aptIds = (myApts || []).map((a: any) => a.id);
  if (aptIds.length === 0) {
    return json({
      apartments: [],
      charges: [],
      balance: { total_charged: 0, total_paid: 0, debt: 0, overpaid: 0 },
    });
  }

  // Начисления по всем квартирам за 24 последних месяца
  const placeholders = aptIds.map(() => '?').join(',');
  const { results: charges } = await env.DB.prepare(
    `SELECT c.id, c.apartment_id, c.period, c.amount, c.paid_amount,
            c.amount_breakdown, c.status, c.due_date, c.created_at
     FROM finance_charges c
     WHERE c.apartment_id IN (${placeholders})
       ${tenantId ? 'AND c.tenant_id = ?' : ''}
     ORDER BY c.period DESC, c.created_at DESC
     LIMIT 200`
  ).bind(...aptIds, ...(tenantId ? [tenantId] : [])).all() as any;

  // Правильный расчёт баланса (backend GET .../balance путает знаки —
  // см. audit item overpaid/debt). Здесь однозначно:
  //   netBalance = charged − paid
  //   > 0 → долг жителя (должен УК)
  //   < 0 → переплата (УК должна вернуть)
  const totalCharged = (charges || []).reduce((s: number, c: any) => s + (c.amount || 0), 0);
  const totalPaid = (charges || []).reduce((s: number, c: any) => s + (c.paid_amount || 0), 0);
  const net = totalCharged - totalPaid;

  return json({
    apartments: myApts,
    charges: charges || [],
    balance: {
      total_charged: totalCharged,
      total_paid: totalPaid,
      debt: net > 0 ? net : 0,
      overpaid: net < 0 ? Math.abs(net) : 0,
      net,
    },
  });
});

} // end registerFinanceV2Routes
