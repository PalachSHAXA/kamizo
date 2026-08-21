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
import { json, error, bilingualError, generateId, isAdminLevel, isManagement, canEditEstimate, estimateEditBlockedReason } from '../utils/helpers';
import {
  computeEstimate,
  computeComplexEstimate,
  type EstimateInput,
  type ComplexEstimateInput,
  type ComplexEstimateResult,
  type EstimateModel,
  type StaffPosition,
  type ExpenseLine,
  type IncomeStream,
} from '../lib/estimate/compute';
import { classifyApartmentForBilling } from '../lib/finance/property-classification';
import { validate } from '../lib/estimate/validators';
import {
  affectedAllocationBindings,
  affectedAllocationSql,
  allocateEstimateItemShares,
  centsToAmount,
  financeChargeId,
  isValidMonthPeriod,
  normalizeBreakdown,
  syncPersonalAccounts,
} from '../lib/finance/accounting';

// ────────────────────────────────────────────────────────────────────
// DB helpers — тонкие обёртки чтобы не размазывать SQL по хендлерам
// ────────────────────────────────────────────────────────────────────

/**
 * Собрать EstimateInput из БД: estimate row + staff + expense/income items.
 * Плюс building facts (floors, has_elevator, has_pumps, residential_area)
 * для validators.
 */
export async function loadEstimateInput(
  env: Env,
  estimateId: string,
  tenantId: string,
): Promise<{ input: EstimateInput; complexInput: ComplexEstimateInput; scopeLevel: 'complex' | 'building'; building: { floors?: number; has_elevator?: boolean; has_pumps?: boolean; scope_level?: string }; row: any } | null> {
  if (!tenantId || tenantId === '__no_tenant__') return null;
  const row = await env.DB.prepare(
    'SELECT * FROM finance_estimates WHERE id = ? AND tenant_id = ? LIMIT 1'
  ).bind(estimateId, tenantId).first() as any;
  if (!row) return null;

  // У черновика без объекта (scope_level='unassigned') building_id пустой —
  // запрос вернёт null, и факты дома (этажность, лифт, насосы) остаются
  // неизвестными до привязки. Валидатор в этом случае выдаст MISSING_AREA.
  const building = await env.DB.prepare(
    'SELECT floors, has_elevator, has_pumps, residential_area FROM buildings WHERE id = ? AND tenant_id = ? LIMIT 1'
  ).bind(row.building_id, tenantId).first() as any;

  // Штат (позиции units × salary)
  const { results: staffRows } = await env.DB.prepare(
    'SELECT title, units, salary, vacation_days FROM finance_estimate_staff WHERE estimate_id = ? AND tenant_id = ? ORDER BY sort_order, title'
  ).bind(estimateId, tenantId).all();
  const staff: StaffPosition[] = (staffRows || []).map((s: any) => ({
    title: s.title,
    units: s.units,
    salary: s.salary,
    vacation_days: s.vacation_days ?? undefined, // NULL → движок берёт 0
  }));

  // Статьи: разделяем на expenses и incomes по kind. building_id = scope
  // (NULL = общая, задано = адресная на конкретный дом ЖК).
  const { results: itemRows } = await env.DB.prepare(
    `SELECT name, category, amount, monthly_amount, section, unit, linked_to_staff, legal_code, kind, building_id
     FROM finance_estimate_items WHERE estimate_id = ? AND tenant_id = ? ORDER BY sort_order, name`
  ).bind(estimateId, tenantId).all();

  const expenses: ExpenseLine[] = [];
  const incomes: IncomeStream[] = [];
  for (const r of (itemRows || []) as any[]) {
    if (r.kind === 'income') {
      // category выступает как type для income
      const type = (['commercial', 'basement', 'parking', 'telecom', 'advertising'].includes(r.category)
        ? r.category
        : 'other') as IncomeStream['type'];
      incomes.push({ type, monthly: r.monthly_amount || 0, building_id: r.building_id || undefined });
    } else {
      expenses.push({
        name: r.name,
        monthly: r.monthly_amount || 0,
        section: (r.section as ExpenseLine['section']) || 'production',
        unit: (r.unit as ExpenseLine['unit']) || 'flat',
        linked_to_staff: !!r.linked_to_staff,
        legal_code: r.legal_code || undefined,
        building_id: r.building_id || undefined,
      });
    }
  }

  // Дома ЖК (для scope_level='complex'): список со снимком жилой площади.
  const { results: cbRows } = await env.DB.prepare(
     `SELECT building_id, residential_area FROM finance_estimate_buildings
     WHERE estimate_id = ? AND tenant_id = ? ORDER BY sort_order`
  ).bind(estimateId, tenantId).all();
  const complexBuildings = (cbRows || []).map((c: any) => ({
    building_id: String(c.building_id),
    residential_area: Number(c.residential_area) || 0,
  }));

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
      periodic_enabled: row.periodic_enabled !== 0, // NULL/1 = вкл, 0 = выкл
      vat_enabled: row.vat_enabled === 1,
      vat_rate: row.vat_rate ?? 0.12,
    },
    staff,
    expenses,
    incomes,
    tariff_manual: row.tariff_approved || undefined,
  };

  // Complex-вход (смета на ЖК): те же штат/статьи/доходы + список домов.
  const complexInput: ComplexEstimateInput = {
    model: input.model,
    object: {
      profit_rate: input.object.profit_rate,
      payroll_tax_rate: input.object.payroll_tax_rate,
      periodic_enabled: input.object.periodic_enabled,
      vat_enabled: input.object.vat_enabled,
      vat_rate: input.object.vat_rate,
    },
    buildings: complexBuildings,
    staff,
    expenses,
    incomes,
    tariff_manual: input.tariff_manual,
  };

  return {
    input,
    complexInput,
    scopeLevel: (row.scope_level === 'complex' ? 'complex' : 'building') as 'complex' | 'building',
    building: {
      floors: building?.floors,
      has_elevator: !!building?.has_elevator,
      has_pumps: !!building?.has_pumps,
      // Валидатору нужно отличать «площадь забыли» от «объекта ещё нет».
      scope_level: row.scope_level || 'building',
    },
    row,
  };
}

/**
 * Записать результат computeEstimate обратно в finance_estimates кешем,
 * чтобы UI мог показывать итоги без пересчёта на каждый GET.
 * Экспортируется: routes/finance.ts пересчитывает смету после привязки
 * черновика к объекту (появляется площадь → тариф меняется).
 */
export async function persistComputedResult(env: Env, estimateId: string, tenantId: string | null, r: ReturnType<typeof computeEstimate>): Promise<void> {
  // total_amount = годовые расходы (для карточки списка, где UI читает total_amount).
  await env.DB.prepare(
    `UPDATE finance_estimates
     SET fot_gross = ?, payroll_tax = ?, fot_total = ?,
         self_cost_resident = ?, base_per_m2 = ?, with_profit_per_m2 = ?,
         telecom_comp_per_m2 = ?, tariff_resident = ?,
         jami_tushum_year = ?, umumiy_year = ?, deficit_year = ?, total_amount = ?
     WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(
    r.fot_gross, r.payroll_tax, r.fot_total,
    r.self_cost_resident, r.base_per_m2, r.with_profit_per_m2,
    r.telecom_comp_per_m2, r.tariff_resident,
    r.jami_tushum_year, r.umumiy_year, r.deficit_year, r.umumiy_year,
    estimateId, ...(tenantId ? [tenantId] : [])
  ).run();
}

// Кеш агрегатов сметы-ЖК (для карточки списка). Тариф — средневзвешенный по
// площади (для отображения), итоги — суммарные по ЖК.
async function persistComplexResult(env: Env, estimateId: string, tenantId: string | null, r: ComplexEstimateResult): Promise<void> {
  const totalArea = r.buildings.reduce((s, b) => s + (b.residential_area || 0), 0);
  const avgTariff = totalArea > 0
    ? Math.round(r.buildings.reduce((s, b) => s + b.tariff_effective * b.residential_area, 0) / totalArea)
    : 0;
  await env.DB.prepare(
    `UPDATE finance_estimates
     SET fot_gross = ?, payroll_tax = ?, fot_total = ?, tariff_resident = ?,
         jami_tushum_year = ?, umumiy_year = ?, deficit_year = ?, total_amount = ?
     WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(
    r.fot_gross, r.payroll_tax, r.fot_total, avgTariff,
    r.jami_tushum_year, r.umumiy_year, r.deficit_year, r.umumiy_year,
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
  // Manager УК тоже составляет сметы (директор потом активирует через
  // отдельный endpoint activate — там уже строгий isAdminLevel).
  if (!canEditEstimate(user)) return error('Нет прав на создание сметы', 403);

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
    periodic_enabled = 1,           // периодические расходы применяются (1) или нет (0)
    scope_level = 'building',       // 'building' (дом) | 'complex' (ЖК) | 'unassigned' (без объекта)
    branch_code = null,             // ЖК сметы (для complex)
    buildings = [],                 // [{building_id, residential_area?}] для complex
  } = body;

  const isComplex = scope_level === 'complex';
  // Черновик без объекта: дом выбирают позже, при привязке (migration 066).
  const isUnassigned = scope_level === 'unassigned';
  if (!period) return error('period required');
  if (isComplex) {
    if (!Array.isArray(buildings) || buildings.length === 0) return error('buildings required for complex');
  } else if (!isUnassigned && !building_id) {
    return error('building_id required');
  }
  if (!['TARIFF_CALCULATED', 'TARIFF_MANUAL', 'TARIFF_FLAT'].includes(model)) {
    return error(`Invalid model: ${model}`);
  }

  const tenantId = getTenantId(request);

  // Первичный дом: для одиночной — building_id; для ЖК — первый из списка
  // (нужен для NOT NULL building_id и совместимости). Для черновика без
  // объекта дома нет — пишем пустую строку, см. шапку migration 066.
  let primaryBuildingId = '';
  let building: any = null;
  if (!isUnassigned) {
    primaryBuildingId = isComplex ? String(buildings[0].building_id) : building_id;
    building = await env.DB.prepare(
      `SELECT id, residential_area FROM buildings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''} LIMIT 1`
    ).bind(primaryBuildingId, ...(tenantId ? [tenantId] : [])).first() as any;
    if (!building) return error('Building not found', 404);
  }

  const id = generateId();
  // Без объекта площади нет — тариф посчитается в нули, валидатор выдаст
  // MISSING_AREA. Реальная площадь подставится при привязке к объекту.
  const finalResidentialArea = isUnassigned
    ? 0
    : (residential_area ?? building.residential_area ?? 0);

  await env.DB.prepare(
    `INSERT INTO finance_estimates (
      id, building_id, period, title, model, status,
      uk_profit_percent, payroll_tax_rate, residential_area,
      commercial_income, basement_income, parking_income, telecom_income,
      tariff_approved, effective_date, periodic_enabled,
      scope_level, branch_code,
      created_by, tenant_id
    ) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, primaryBuildingId, period, title || `Смета ${period}`, model,
    uk_profit_percent, payroll_tax_rate, finalResidentialArea,
    commercial_income, basement_income, parking_income, telecom_income,
    tariff_approved || null, effective_date || null, periodic_enabled ? 1 : 0,
    isComplex ? 'complex' : (isUnassigned ? 'unassigned' : 'building'), branch_code || null,
    user.id, tenantId || ''
  ).run();

  // Дома ЖК: снимок жилой площади каждого (из body или из buildings.residential_area).
  if (isComplex) {
    for (let i = 0; i < buildings.length; i++) {
      const bid = String(buildings[i].building_id);
      let area = Number(buildings[i].residential_area);
      if (!area || area <= 0) {
        const b = await env.DB.prepare(
          `SELECT residential_area FROM buildings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''} LIMIT 1`
        ).bind(bid, ...(tenantId ? [tenantId] : [])).first() as any;
        area = Number(b?.residential_area) || 0;
      }
      await env.DB.prepare(
        `INSERT INTO finance_estimate_buildings (id, estimate_id, building_id, residential_area, sort_order, tenant_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(generateId(), id, bid, area, i, tenantId || '').run();
    }
  }

  return json({ id, model, status: 'draft', scope_level }, 201);
});

// DELETE /api/finance/estimates/:id — удалить смету (только draft).
// Каскадно удаляем статьи и штат. Активные/архивные сметы не трогаем.
route('DELETE', '/api/finance/estimates/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  if (!canEditEstimate(user)) return error('Нет прав на удаление сметы', 403);

  const tenantId = getTenantId(request);
  const est = await env.DB.prepare(
    `SELECT id, status, approval_status, scope_level FROM finance_estimates WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''} LIMIT 1`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!est) return error('Estimate not found', 404);
  if (est.status !== 'draft') return error('Можно удалять только черновики', 409);
  // Пока смета на рассмотрении — её нельзя удалить из-под утверждающего.
  if ((est.approval_status || 'draft') === 'pending') {
    return bilingualError(
      'Смета на рассмотрении. Чтобы удалить, дождитесь возврата на доработку.',
      "Smeta ko'rib chiqilmoqda. O'chirish uchun qaytarilishini kuting.",
      409,
    );
  }

  await env.DB.prepare('DELETE FROM finance_estimate_items WHERE estimate_id = ?').bind(params.id).run();
  await env.DB.prepare('DELETE FROM finance_estimate_staff WHERE estimate_id = ?').bind(params.id).run();
  await env.DB.prepare(
    `DELETE FROM finance_estimates WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).run();
  return json({ ok: true });
});

// PUT /api/finance/estimates/:id/settings — обновить флаги сметы
// (periodic_enabled; в след. фазах — vat_enabled/vat_rate/show_profit).
// Только для draft, только management, только в своём тенанте.
route('PUT', '/api/finance/estimates/:id/settings', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  if (!canEditEstimate(user)) return error('Нет прав на редактирование сметы', 403);

  const tenantId = getTenantId(request);
  const est = await env.DB.prepare(
    `SELECT id, status, approval_status, scope_level FROM finance_estimates WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''} LIMIT 1`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!est) return error('Estimate not found', 404);
  const blocked = estimateEditBlockedReason(est);
  if (blocked) return bilingualError(blocked[0], blocked[1], 409);

  const body = await request.json() as {
    periodic_enabled?: boolean; vat_enabled?: boolean; vat_rate?: number;
    show_profit_to_residents?: boolean;
  };
  const sets: string[] = [];
  const binds: any[] = [];
  if (typeof body.periodic_enabled === 'boolean') {
    sets.push('periodic_enabled = ?'); binds.push(body.periodic_enabled ? 1 : 0);
  }
  if (typeof body.vat_enabled === 'boolean') {
    sets.push('vat_enabled = ?'); binds.push(body.vat_enabled ? 1 : 0);
  }
  if (typeof body.vat_rate === 'number' && body.vat_rate >= 0 && body.vat_rate < 1) {
    sets.push('vat_rate = ?'); binds.push(body.vat_rate);
  }
  if (typeof body.show_profit_to_residents === 'boolean') {
    sets.push('show_profit_to_residents = ?'); binds.push(body.show_profit_to_residents ? 1 : 0);
  }
  if (sets.length === 0) return json({ ok: true, updated: 0 });

  binds.push(params.id, ...(tenantId ? [tenantId] : []));
  await env.DB.prepare(
    `UPDATE finance_estimates SET ${sets.join(', ')} WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(...binds).run();
  return json({ ok: true, updated: sets.length });
});

// PUT /api/finance/estimates/:id/staff — заменить весь массив штата
route('PUT', '/api/finance/estimates/:id/staff', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  if (!canEditEstimate(user)) return error('Нет прав на редактирование сметы', 403);

  const tenantId = getTenantId(request);
  const est = await env.DB.prepare(
    `SELECT id, status, approval_status, scope_level FROM finance_estimates WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''} LIMIT 1`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!est) return error('Estimate not found', 404);
  const blocked = estimateEditBlockedReason(est);
  if (blocked) return bilingualError(blocked[0], blocked[1], 409);

  const body = await request.json() as { staff: StaffPosition[] };
  const staff = body.staff || [];

  // Атомарно: удалить старые + вставить новые
  await env.DB.prepare('DELETE FROM finance_estimate_staff WHERE estimate_id = ?').bind(params.id).run();
  for (let i = 0; i < staff.length; i++) {
    const s = staff[i];
    if (!s.title || s.units <= 0) continue;
    await env.DB.prepare(
      `INSERT INTO finance_estimate_staff (id, estimate_id, title, units, salary, monthly, vacation_days, sort_order, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      generateId(), params.id, s.title, s.units, s.salary,
      s.units * s.salary, s.vacation_days ?? 21, i, tenantId || ''
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
  if (!canEditEstimate(user)) return error('Нет прав на редактирование сметы', 403);

  const tenantId = getTenantId(request);
  const est = await env.DB.prepare(
    `SELECT id, status, approval_status, scope_level FROM finance_estimates WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''} LIMIT 1`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!est) return error('Estimate not found', 404);
  const blocked = estimateEditBlockedReason(est);
  if (blocked) return bilingualError(blocked[0], blocked[1], 409);

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
        section, unit, linked_to_staff, legal_code, kind, building_id, sort_order, tenant_id
      ) VALUES (?, ?, ?, 'maintenance', ?, ?, ?, ?, ?, ?, 'expense', ?, ?, ?)`
    ).bind(
      generateId(), params.id, it.name, monthly * 12, monthly,
      it.section || 'production', it.unit || 'flat',
      it.linked_to_staff ? 1 : 0, it.legal_code || null, it.building_id || null, i, tenantId || ''
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
  if (!canEditEstimate(user)) return error('Нет прав на редактирование сметы', 403);

  const tenantId = getTenantId(request);
  const est = await env.DB.prepare(
    `SELECT id, status, approval_status, scope_level FROM finance_estimates WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''} LIMIT 1`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!est) return error('Estimate not found', 404);
  const blocked = estimateEditBlockedReason(est);
  if (blocked) return bilingualError(blocked[0], blocked[1], 409);

  const body = await request.json() as { items: IncomeStream[] };
  const items = body.items || [];

  await env.DB.prepare(
    `DELETE FROM finance_estimate_items WHERE estimate_id = ? AND kind = 'income'`
  ).bind(params.id).run();

  // Также обновляем summary-колонки в finance_estimates (commercial_income etc.)
  // — они нужны для computeEstimate когда input не пересобирается из items.
  const totals = { commercial: 0, basement: 0, parking: 0, telecom: 0, advertising: 0, other: 0 };
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const type = it.type;
    if (!['commercial', 'basement', 'parking', 'telecom', 'advertising', 'other'].includes(type)) continue;
    const monthly = it.monthly || 0;
    totals[type] += monthly;
    // Пишем как item с category=type — это позволит редактировать per-line в UI
    await env.DB.prepare(
      `INSERT INTO finance_estimate_items (
        id, estimate_id, name, category, amount, monthly_amount,
        kind, building_id, sort_order, tenant_id
      ) VALUES (?, ?, ?, ?, ?, ?, 'income', ?, ?, ?)`
    ).bind(
      generateId(), params.id, `Доход: ${type}`, type, monthly * 12, monthly,
      it.building_id || null, i, tenantId || ''
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
  if (!tenantId || tenantId === '__no_tenant__') return error('Tenant context required', 403);

  const loaded = await loadEstimateInput(env, params.id, tenantId);
  if (!loaded) return error('Estimate not found', 404);

  const result = computeEstimate(loaded.input);
  const complexResult: ComplexEstimateResult | null =
    loaded.scopeLevel === 'complex' ? computeComplexEstimate(loaded.complexInput) : null;
  // Кешируем агрегаты для карточки списка (single — свой результат, complex — сводный).
  if (complexResult) await persistComplexResult(env, params.id, tenantId, complexResult);
  else await persistComputedResult(env, params.id, tenantId, result);

  return json({ input: loaded.input, result, complexResult, scopeLevel: loaded.scopeLevel });
});

// GET /api/finance/estimates/:id/validate — warnings без записи
route('GET', '/api/finance/estimates/:id/validate', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const tenantId = getTenantId(request);
  if (!tenantId || tenantId === '__no_tenant__') return error('Tenant context required', 403);

  const loaded = await loadEstimateInput(env, params.id, tenantId);
  if (!loaded) return error('Estimate not found', 404);

  const result = computeEstimate(loaded.input);
  const warnings = validate(loaded.input, result, loaded.building);

  // Для complex — предупреждаем о домах без жилой площади (иначе их тариф 0).
  if (loaded.scopeLevel === 'complex') {
    for (const b of loaded.complexInput.buildings) {
      if (!b.residential_area || b.residential_area <= 0) {
        warnings.push({
          code: 'MISSING_AREA', severity: 'error',
          message_ru: `У дома в ЖК не заполнена жилая площадь — его тариф рассчитать нельзя (building ${b.building_id}).`,
          message_uz: `Uyning turar joy maydoni yo'q — tarifni hisoblab bo'lmaydi.`,
          meta: { building_id: b.building_id },
        });
      }
    }
  }

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
  if (!tenantId || tenantId === '__no_tenant__') return error('Tenant context required', 403);

  const loaded = await loadEstimateInput(env, params.id, tenantId);
  if (!loaded) return error('Estimate not found', 404);

  const result = computeEstimate(loaded.input);
  const warnings = validate(loaded.input, result, loaded.building);
  const complexResult: ComplexEstimateResult | null =
    loaded.scopeLevel === 'complex' ? computeComplexEstimate(loaded.complexInput) : null;

  return json({
    estimate: loaded.row,
    input: loaded.input,
    result,
    complexResult,
    scopeLevel: loaded.scopeLevel,
    buildings: loaded.complexInput.buildings,
    warnings,
    building: loaded.building,
  });
});

// ────────────────────────────────────────────────────────────────────
// Sync personal_accounts.current_debt/balance/last_payment из finance_charges
// и finance_payments. personal_accounts живёт отдельно от finance_charges —
// раньше поле `current_debt` заполнялось только вручную через PATCH и
// расходилось с реальностью. Функция синхронизирует одним UPDATE-JOIN'ом
// все ЛС конкретного дома (или все дома тенанта если building_id=null).
//
// Вызывается: (1) из ручного endpoint'а /api/finance/sync-accounts (для
// админа) и (2) из cron auto-billing после генерации всех charges.
// ────────────────────────────────────────────────────────────────────

// Ручной endpoint пересчёта — admin/director может дёрнуть после подозрения
// на дрейф (например, ручные правки в БД через sqlite3).
route('POST', '/api/finance/sync-accounts', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isAdminLevel(user)) return error('Admin or director access required', 403);

  const tenantId = getTenantId(request);
  if (!tenantId || tenantId === '__no_tenant__') return error('Tenant context required', 403);
  const url = new URL(request.url);
  const buildingId = url.searchParams.get('building_id');

  const result = await syncPersonalAccounts(env, tenantId, { buildingId });
  return json({ ok: true, ...result });
});

// ────────────────────────────────────────────────────────────────────
// CRON: monthly auto-billing. Триггерится с VPS через systemd timer
// (или crontab) 1-го числа каждого месяца:
//
//   # /etc/cron.d/kamizo-monthly-billing (или systemd .timer)
//   0 6 1 * * kamizo curl -s -X POST \
//     -H "X-Cron-Secret: $CRON_SECRET" \
//     https://api.kamizo.uz/api/finance/cron/generate-monthly
//
// Скрипт итерирует все active v2-сметы во всех тенантах, для каждой
// вызывает существующую логику генерации charges (POST /charges/generate
// сам идемпотентен: не создаёт дубликаты на пару (estimate_id, apt, period)).
// Возвращает суммарный отчёт.
// ────────────────────────────────────────────────────────────────────

route('POST', '/api/finance/cron/generate-monthly', async (request, env) => {
  const secret = request.headers.get('X-Cron-Secret');
  if (!env.CRON_SECRET) return error('CRON_SECRET not configured on server', 500);
  if (secret !== env.CRON_SECRET) return error('Forbidden', 403);

  const url = new URL(request.url);
  const overridePeriod = url.searchParams.get('period'); // для ручного запуска: ?period=2026-08
  const now = new Date();
  const period = overridePeriod
    || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Все активные v2-сметы (легаси не трогаем — их менеджер сам генерит вручную)
  const { results: estimates } = await env.DB.prepare(
    `SELECT id, tenant_id, building_id, period AS estimate_period, model
     FROM finance_estimates
     WHERE status = 'active'
       AND model IN ('TARIFF_CALCULATED', 'TARIFF_MANUAL', 'TARIFF_FLAT')`
  ).all() as any;

  const report: Array<{ estimate_id: string; tenant_id: string; building_id: string; generated: number; skipped: number; error?: string }> = [];

  for (const est of (estimates || []) as any[]) {
    try {
      // Тянем полную смету для расчёта (с новыми колонками v2)
      if (!est.tenant_id) throw new Error('Estimate tenant missing');
      const full = await env.DB.prepare(
        `SELECT * FROM finance_estimates WHERE id = ? AND tenant_id = ?`
      ).bind(est.id, est.tenant_id).first() as any;

      const commercialRate = Number(full.commercial_rate) || 0;
      const basementRate = Number(full.basement_rate) || 0;
      const parkingRate = Number(full.parking_rate) || 0;
      const nonResidentialRate = Number(full.non_commercial_rate_per_sqm) || 0;

      // Пер-домовой ЖИЛОЙ тариф: для complex считаем на каждый дом ЖК;
      // для одиночной — один тариф на building_id сметы.
      let buildingsToBill: Array<{ building_id: string; residentialRate: number }>;
      if (full.scope_level === 'complex') {
        const loaded = await loadEstimateInput(env, est.id, est.tenant_id);
        const cx = loaded ? computeComplexEstimate(loaded.complexInput) : null;
        buildingsToBill = (cx?.buildings || []).map((b) => ({
          building_id: b.building_id, residentialRate: b.tariff_effective,
        }));
      } else {
        buildingsToBill = [{
          building_id: est.building_id,
          residentialRate: Number(full.tariff_approved) || Number(full.tariff_resident) || 0,
        }];
      }

      const { results: itemsRaw } = await env.DB.prepare(
        `SELECT name, amount, kind, building_id FROM finance_estimate_items WHERE estimate_id = ? AND tenant_id = ?`
      ).bind(est.id, est.tenant_id).all() as any;
      const items = (itemsRaw || []).filter((i: any) => (i.kind || 'expense') === 'expense');

      const [year, month] = period.split('-').map(Number);
      const dueDate = new Date(year, month, 0).toISOString().slice(0, 10);

      const stmts: any[] = [];
      const statementApartmentIds: string[] = [];
      let generated = 0, skipped = 0;

      // Для каждого дома сметы — свои квартиры и свой жилой тариф.
      for (const bld of buildingsToBill) {
        const residentialRate = bld.residentialRate;
        const { results: apartments } = await env.DB.prepare(
          `SELECT id, total_area, property_type, is_commercial, is_basement, is_parking
           FROM apartments WHERE building_id = ? AND tenant_id = ?`
        ).bind(bld.building_id, est.tenant_id).all() as any;

        for (const apt of (apartments || []) as any[]) {
          const area = Number(apt.total_area) || 0;
          if (area <= 0 && !apt.is_parking) { skipped++; continue; }

          let rate: number, propertyType: string, isFlat = false;
          const billingKind = classifyApartmentForBilling(apt);
          if (billingKind === 'parking') { rate = parkingRate; propertyType = 'non_commercial'; isFlat = true; }
          else if (billingKind === 'basement') { rate = basementRate > 0 ? basementRate : nonResidentialRate; propertyType = 'non_commercial'; }
          else if (billingKind === 'commercial') { rate = commercialRate > 0 ? commercialRate : nonResidentialRate; propertyType = 'commercial'; }
          else { rate = residentialRate; propertyType = 'residential'; }

          const baseAmount = isFlat ? Math.round(rate * 100) / 100 : Math.round(area * rate * 100) / 100;
          if (baseAmount <= 0) { skipped++; continue; }

          const itemBreakdown = allocateEstimateItemShares(items, bld.building_id, baseAmount);
          const breakdown = { area_sqm: area, rate_per_sqm: rate, base_amount: baseAmount, property_type: propertyType, items: itemBreakdown };
          const dbPropertyType = billingKind === 'residential' ? 'non_commercial' : 'commercial';

          stmts.push(env.DB.prepare(
            `INSERT INTO finance_charges (id, apartment_id, estimate_id, period, amount, amount_breakdown, property_type, area_sqm, rate_per_sqm, status, due_date, tenant_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
             ON CONFLICT(id) DO NOTHING`
          ).bind(
            financeChargeId(est.tenant_id, est.id, period, apt.id), apt.id, est.id, period, baseAmount,
            JSON.stringify(breakdown), dbPropertyType, area, rate, dueDate, est.tenant_id
          ));
          statementApartmentIds.push(apt.id);
        }
      }

      // Each committed chunk includes allocation: 99 inserts + one recompute.
      const BATCH = 99;
      for (let i = 0; i < stmts.length; i += BATCH) {
        const inserts = stmts.slice(i, i + BATCH);
        const apartmentIds = Array.from(new Set(statementApartmentIds.slice(i, i + BATCH)));
        const results = await env.DB.batch([
          ...inserts,
          env.DB.prepare(affectedAllocationSql(apartmentIds.length)).bind(...affectedAllocationBindings(est.tenant_id, apartmentIds)),
        ]);
        if (!results.at(-1)?.success) throw new Error('Charge allocation failed');
        const inserted = results.slice(0, inserts.length).reduce(
          (sum, result) => sum + (((result.meta as { changes?: number })?.changes ?? 0) > 0 ? 1 : 0),
          0,
        );
        generated += inserted;
        skipped += inserts.length - inserted;
      }

      report.push({ estimate_id: est.id, tenant_id: est.tenant_id, building_id: est.building_id, generated, skipped });
    } catch (e: any) {
      report.push({ estimate_id: est.id, tenant_id: est.tenant_id, building_id: est.building_id, generated: 0, skipped: 0, error: e?.message || String(e) });
    }
  }

  const totalGenerated = report.reduce((s, r) => s + r.generated, 0);
  const totalSkipped = report.reduce((s, r) => s + r.skipped, 0);
  const errors = report.filter(r => r.error).length;

  // После генерации charges — синхронизируем personal_accounts по всем
  // тенантам, где что-то поменялось (иначе current_debt будет вечно врать).
  const touchedTenants = Array.from(new Set(report.filter(r => r.generated > 0).map(r => r.tenant_id)));
  let paSyncTotal = 0;
  for (const tid of touchedTenants) {
    try {
      if (!tid) continue;
      const s = await syncPersonalAccounts(env, tid);
      paSyncTotal += s.updated;
    } catch { /* silent */ }
  }

  return json({
    ok: true,
    period,
    estimates_processed: report.length,
    charges_generated: totalGenerated,
    charges_skipped_existing: totalSkipped,
    errors,
    personal_accounts_synced: paSyncTotal,
    report,
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
  if (!tenantId || tenantId === '__no_tenant__') return error('Tenant context required', 403);

  // Все квартиры, где юзер = primary_owner. Тенант отфильтруется через
  // общий фильтр tenant_id ниже.
  const { results: myApts } = await env.DB.prepare(
    `SELECT id, number, total_area, building_id
     FROM apartments
     WHERE primary_owner_id = ? AND tenant_id = ?`
  ).bind(user.id, tenantId).all() as any;

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
        AND c.tenant_id = ?
     ORDER BY c.period DESC, c.created_at DESC
     LIMIT 200`
  ).bind(...aptIds, tenantId).all() as any;

  // Sprint 7 + hotfix: пени по квартирам жителя. Считаем только те, у
  // которых родительский charge всё ещё имеет непогашенный долг
  // (amount > paid_amount). Иначе пеня «зависает» после того как житель
  // погасил основной долг, но cron ещё не пометил её cancelled/paid —
  // и net_balance никогда не обнуляется.
  //
  // JOIN на finance_charges + фильтр в SQL: пеня видна ↔ основной долг > 0.
  // Автопометка cancelled происходит в apply-penalties cron (см. ниже),
  // но этот SQL защищает баланс жителя от гонки до следующего прогона.
  const { results: penalties } = await env.DB.prepare(
    `SELECT p.id, p.charge_id, p.apartment_id, p.principal_amount, p.penalty_rate,
            p.days_overdue, p.penalty_amount, p.status, p.calculated_at
     FROM finance_penalties p
     JOIN finance_charges c ON c.id = p.charge_id AND c.tenant_id = p.tenant_id
     WHERE p.apartment_id IN (${placeholders})
       AND p.status = 'accrued'
       AND c.amount > COALESCE(c.paid_amount, 0)
        AND p.tenant_id = ?
     ORDER BY p.calculated_at DESC`
  ).bind(...aptIds, tenantId).all() as any;
  // Оставляем только последний snapshot per charge_id (защита от старых записей,
  // если cron ещё не почистил дубли — их не должно быть, но на всякий).
  const latestPerCharge = new Map<string, any>();
  for (const p of (penalties || []) as any[]) {
    if (!latestPerCharge.has(p.charge_id)) latestPerCharge.set(p.charge_id, p);
  }
  const activePenalties = Array.from(latestPerCharge.values());
  const totalPenalties = activePenalties.reduce((s, p) => s + (p.penalty_amount || 0), 0);

  const lifetimeTotals = await env.DB.prepare(
    `SELECT
       COALESCE((SELECT SUM(c.amount) FROM finance_charges c
         WHERE c.apartment_id IN (${placeholders}) AND c.tenant_id = ?), 0) AS total_charged,
       COALESCE((SELECT SUM(p.amount) FROM finance_payments p
         WHERE p.apartment_id IN (${placeholders}) AND p.payment_type != 'overpayment'
         AND p.tenant_id = ?), 0) AS total_paid`
  ).bind(
    ...aptIds, tenantId,
    ...aptIds, tenantId,
  ).first<{ total_charged: number; total_paid: number }>();

  // Правильный расчёт баланса (backend GET .../balance путает знаки —
  // см. audit item overpaid/debt). Здесь однозначно:
  //   netBalance = charged + penalties − paid
  //   > 0 → долг жителя (должен УК)
  //   < 0 → переплата (УК должна вернуть)
  const totalCharged = Number(lifetimeTotals?.total_charged || 0);
  const totalPaid = Number(lifetimeTotals?.total_paid || 0);
  const net = totalCharged + totalPenalties - totalPaid;

  return json({
    apartments: myApts,
    charges: charges || [],
    penalties: activePenalties,
    balance: {
      total_charged: totalCharged,
      total_paid: totalPaid,
      total_penalties: totalPenalties,
      debt: net > 0 ? net : 0,
      overpaid: net < 0 ? Math.abs(net) : 0,
      net,
    },
  });
});

// ────────────────────────────────────────────────────────────────────
// Sprint 6: Факт-отчёт по ст.29 ЗРУ-581.
//
// По закону УК обязана раз в год (а по решению собрания — чаще) публиковать
// собственникам отчёт: сколько начислено / оплачено / осталось долгов по
// каждой статье сметы + сколько собственно доход УК (план vs факт).
//
// Строим отчёт агрегацией finance_charges.amount_breakdown (там JSON с
// per-item раскладкой начисления) + finance_payments за период, разбитый
// pro-rata по item'ам пропорционально их доле в accrued.
//
// Endpoints:
//   GET  /api/finance/fact-reports/preview?building_id=X&period_from=YYYY-MM&period_to=YYYY-MM
//        → пересчитать на лету, без записи (для UI preview)
//   POST /api/finance/fact-reports
//        → сохранить снепшот в finance_fact_reports (для истории/шаринга)
//   GET  /api/finance/fact-reports?building_id=X
//        → список сохранённых снепшотов
//   GET  /api/finance/fact-reports/:id
//        → один сохранённый снепшот
// ────────────────────────────────────────────────────────────────────

type FactRow = {
  name: string;
  legal_code?: string | null;
  prior_debt: number;
  accrued: number;
  paid: number;
  arrears: number;
};

async function buildFactReport(
  env: Env,
  tenantId: string,
  buildingId: string,
  periodFrom: string,
  periodTo: string,
): Promise<{
  rows: FactRow[];
  totals: { prior_debt: number; accrued: number; paid: number; arrears: number };
  uk_income_plan: number;
  uk_income_fact: number;
  charges_count: number;
  payments_count: number;
}> {
  // Все charges по домy за период. period в формате YYYY-MM — сравниваем как строки (лексикографический = хронологический для этого формата).
  const { results: charges } = await env.DB.prepare(
    `SELECT c.id, c.apartment_id, c.period, c.amount, c.paid_amount, c.amount_breakdown
     FROM finance_charges c
     JOIN apartments a ON a.id = c.apartment_id AND a.tenant_id = c.tenant_id
     WHERE a.building_id = ?
        AND c.period >= ? AND c.period <= ?
       AND c.tenant_id = ?`
  ).bind(buildingId, periodFrom, periodTo, tenantId).all() as any;

  // Входящий баланс — начисления до периода минус реальные поступления до периода.
  const priorRow = await env.DB.prepare(
    `SELECT
       COALESCE((
         SELECT SUM(c.amount) FROM finance_charges c
         JOIN apartments a ON a.id = c.apartment_id AND a.tenant_id = c.tenant_id
         WHERE a.building_id = ? AND c.period < ? AND c.tenant_id = ?
       ), 0) - COALESCE((
         SELECT SUM(p.amount) FROM finance_payments p
         JOIN apartments a ON a.id = p.apartment_id AND a.tenant_id = p.tenant_id
         WHERE a.building_id = ? AND date(p.payment_date) < date(? || '-01')
           AND p.payment_type != 'overpayment' AND p.tenant_id = ?
       ), 0) AS prior_debt`
  ).bind(buildingId, periodFrom, tenantId, buildingId, periodFrom, tenantId).first() as any;
  const totalPriorDebt = Number(priorRow?.prior_debt || 0);

  // Payments за период (по датам, а не period)
  const paidRow = await env.DB.prepare(
    `SELECT COALESCE(SUM(p.amount), 0) AS paid
     FROM finance_payments p
     JOIN apartments a ON a.id = p.apartment_id AND a.tenant_id = p.tenant_id
     WHERE a.building_id = ?
       AND date(p.payment_date) >= date(? || '-01')
       AND date(p.payment_date) < date(? || '-01', '+1 month')
       AND p.payment_type != 'overpayment'
       AND p.tenant_id = ?`
  ).bind(buildingId, periodFrom, periodTo, tenantId).first() as any;
  const totalPaid = Number(paidRow?.paid || 0);

  const paymentsCountRow = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM finance_payments p
     JOIN apartments a ON a.id = p.apartment_id AND a.tenant_id = p.tenant_id
     WHERE a.building_id = ?
       AND date(p.payment_date) >= date(? || '-01')
       AND date(p.payment_date) < date(? || '-01', '+1 month')
       AND p.payment_type != 'overpayment'
       AND p.tenant_id = ?`
  ).bind(buildingId, periodFrom, periodTo, tenantId).first() as any;

  // Aggregate per-item из amount_breakdown. Каждый charge содержит либо
  // JSON [{name, amount}, ...], либо null (тогда идёт одной строкой "Прочее").
  const perItem = new Map<string, { name: string; legal_code?: string | null; accruedCents: number }>();
  let totalAccruedCents = 0;
  for (const c of (charges || []) as any[]) {
    const amount = Number(c.amount || 0);
    totalAccruedCents += Math.round(amount * 100);
    let breakdown: unknown = null;
    try { breakdown = c.amount_breakdown ? JSON.parse(c.amount_breakdown) : null; } catch { /* keep null */ }
    for (const item of normalizeBreakdown(breakdown, amount)) {
      const key = item.name.toLowerCase().trim();
      const prev = perItem.get(key);
      if (prev) prev.accruedCents += Math.round(item.amount * 100);
      else perItem.set(key, { name: item.name, legal_code: item.legal_code, accruedCents: Math.round(item.amount * 100) });
    }
  }

  const openingCents = Math.round(totalPriorDebt * 100);
  const paidCents = Math.round(totalPaid * 100);
  const openingDebtCents = Math.max(openingCents, 0);
  const paidToOpeningCents = Math.min(paidCents, openingDebtCents);
  const currentCashCents = Math.max(paidCents - paidToOpeningCents, 0);
  const paidToArticlesCents = Math.min(currentCashCents, totalAccruedCents);

  const rows: FactRow[] = [];
  if (openingCents !== 0) {
    rows.push({
      name: openingCents > 0 ? 'Задолженность прошлых периодов' : 'Переплата прошлых периодов',
      legal_code: null,
      prior_debt: centsToAmount(openingCents),
      accrued: 0,
      paid: centsToAmount(paidToOpeningCents),
      arrears: centsToAmount(openingCents - paidToOpeningCents),
    });
  }

  const articles = Array.from(perItem.values()).sort((a, b) =>
    b.accruedCents - a.accruedCents || a.name.localeCompare(b.name)
  );
  const articlePaidCents = articles.map(() => 0);
  if (paidToArticlesCents > 0 && totalAccruedCents > 0) {
    const total = BigInt(totalAccruedCents);
    const target = BigInt(paidToArticlesCents);
    const shares = articles.map((item, index) => {
      const numerator = BigInt(item.accruedCents) * target;
      return { index, cents: numerator / total, remainder: numerator % total };
    });
    let left = target - shares.reduce((sum, share) => sum + share.cents, 0n);
    for (const share of [...shares].sort((a, b) =>
      a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1
    )) {
      if (left === 0n) break;
      shares[share.index].cents += 1n;
      left -= 1n;
    }
    for (const share of shares) articlePaidCents[share.index] = Number(share.cents);
  }
  for (let index = 0; index < articles.length; index++) {
    const item = articles[index];
    const itemPaid = articlePaidCents[index];
    rows.push({
      name: item.name,
      legal_code: item.legal_code,
      prior_debt: 0,
      accrued: centsToAmount(item.accruedCents),
      paid: centsToAmount(itemPaid),
      arrears: centsToAmount(item.accruedCents - itemPaid),
    });
  }
  const currentCreditCents = currentCashCents - paidToArticlesCents;
  if (currentCreditCents > 0) {
    rows.push({
      name: 'Переплата текущего периода', legal_code: null,
      prior_debt: 0, accrued: 0, paid: centsToAmount(currentCreditCents), arrears: centsToAmount(-currentCreditCents),
    });
  }

  // Доход УК (прибыль): sum по finance_estimates.uk_profit_percent × total_expenses / 12 за месяцы периода.
  // План — из активной сметы. Факт — фактически поступившие paid × (uk_profit_percent / (1 + uk_profit_percent)) — приближение.
  const est = await env.DB.prepare(
    `SELECT uk_profit_percent, umumiy_year FROM finance_estimates
     WHERE building_id = ? AND status = 'active'
       AND tenant_id = ?
     ORDER BY effective_date DESC, created_at DESC LIMIT 1`
  ).bind(buildingId, tenantId).first() as any;
  const profitPct = Number(est?.uk_profit_percent || 0);
  const monthsInPeriod = countMonthsInclusive(periodFrom, periodTo);
  const uk_income_plan = est?.umumiy_year
    ? Math.round((Number(est.umumiy_year) * profitPct / 100 / 12) * monthsInPeriod)
    : 0;
  const uk_income_fact = profitPct > 0
    ? Math.round(totalPaid * (profitPct / (100 + profitPct)))
    : 0;

  return {
    rows,
    totals: {
      prior_debt: centsToAmount(openingCents),
      accrued: centsToAmount(totalAccruedCents),
      paid: centsToAmount(paidCents),
      arrears: centsToAmount(openingCents + totalAccruedCents - paidCents),
    },
    uk_income_plan,
    uk_income_fact,
    charges_count: (charges || []).length,
    payments_count: Number(paymentsCountRow?.n || 0),
  };
}

function countMonthsInclusive(from: string, to: string): number {
  // 'YYYY-MM' - 'YYYY-MM' → inclusive months count
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  if (!fy || !fm || !ty || !tm) return 1;
  return Math.max(1, (ty - fy) * 12 + (tm - fm) + 1);
}

// GET preview — быстрый пересчёт без записи (для UI).
route('GET', '/api/finance/fact-reports/preview', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const url = new URL(request.url);
  const buildingId = url.searchParams.get('building_id');
  const periodFrom = url.searchParams.get('period_from');
  const periodTo = url.searchParams.get('period_to');
  if (!buildingId || !periodFrom || !periodTo) {
    return error('building_id, period_from, period_to required (YYYY-MM)');
  }
  if (!isValidMonthPeriod(periodFrom) || !isValidMonthPeriod(periodTo) || periodFrom > periodTo) {
    return error('period_from/period_to must be real YYYY-MM months with period_from <= period_to');
  }

  const tenantId = getTenantId(request);
  if (!tenantId || tenantId === '__no_tenant__') return error('Tenant context required', 403);
  // sanity — building принадлежит тенанту
  const b = await env.DB.prepare(
    'SELECT id, name, address FROM buildings WHERE id = ? AND tenant_id = ? LIMIT 1'
  ).bind(buildingId, tenantId).first() as any;
  if (!b) return error('Building not found', 404);

  const report = await buildFactReport(env, tenantId, buildingId, periodFrom, periodTo);
  return json({
    building: b,
    period_from: periodFrom,
    period_to: periodTo,
    ...report,
  });
});

// POST — сохранить снепшот в finance_fact_reports.
route('POST', '/api/finance/fact-reports', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  // Факт-отчёт — не смета: круг ролей здесь прежний (isManagement).
  if (!isManagement(user)) return error('Нет прав на сохранение факт-отчёта', 403);

  const body = await request.json() as any;
  const { building_id, period_from, period_to } = body;
  if (!building_id || !period_from || !period_to) return error('building_id, period_from, period_to required');
  if (!isValidMonthPeriod(period_from) || !isValidMonthPeriod(period_to) || period_from > period_to) {
    return error('period_from/period_to must be real YYYY-MM months with period_from <= period_to');
  }

  const tenantId = getTenantId(request);
  if (!tenantId || tenantId === '__no_tenant__') return error('Tenant context required', 403);
  const b = await env.DB.prepare(
    'SELECT id FROM buildings WHERE id = ? AND tenant_id = ? LIMIT 1'
  ).bind(building_id, tenantId).first() as any;
  if (!b) return error('Building not found', 404);

  const report = await buildFactReport(env, tenantId, building_id, period_from, period_to);
  const id = generateId();

  await env.DB.prepare(
    `INSERT INTO finance_fact_reports (
       id, building_id, period_from, period_to, rows_json,
       uk_income_plan, uk_income_fact, generated_by, tenant_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, building_id, period_from, period_to, JSON.stringify({
      rows: report.rows,
      totals: report.totals,
      charges_count: report.charges_count,
      payments_count: report.payments_count,
    }),
    report.uk_income_plan, report.uk_income_fact, user.id, tenantId
  ).run();

  return json({ id, ...report }, 201);
});

// GET — список сохранённых снепшотов по дому.
route('GET', '/api/finance/fact-reports', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const url = new URL(request.url);
  const buildingId = url.searchParams.get('building_id');
  const tenantId = getTenantId(request);
  if (!tenantId || tenantId === '__no_tenant__') return error('Tenant context required', 403);

  const where: string[] = ['tenant_id = ?'];
  const params: any[] = [tenantId];
  if (buildingId) { where.push('building_id = ?'); params.push(buildingId); }
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const { results } = await env.DB.prepare(
    `SELECT id, building_id, period_from, period_to, uk_income_plan, uk_income_fact,
            generated_by, generated_at
     FROM finance_fact_reports
     ${whereSql}
     ORDER BY generated_at DESC LIMIT 100`
  ).bind(...params).all();

  return json({ reports: results || [] });
});

// GET :id — один снепшот (для повторного просмотра/печати старого отчёта).
route('GET', '/api/finance/fact-reports/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const tenantId = getTenantId(request);
  if (!tenantId || tenantId === '__no_tenant__') return error('Tenant context required', 403);
  const row = await env.DB.prepare(
    `SELECT r.*, b.name AS building_name, b.address AS building_address
     FROM finance_fact_reports r
     LEFT JOIN buildings b ON b.id = r.building_id AND b.tenant_id = r.tenant_id
     WHERE r.id = ? AND r.tenant_id = ? LIMIT 1`
  ).bind(params.id, tenantId).first() as any;
  if (!row) return error('Not found', 404);

  let saved: unknown = [];
  try { saved = row.rows_json ? JSON.parse(row.rows_json) : []; } catch { saved = []; }
  const rows: FactRow[] = Array.isArray(saved)
    ? saved
    : saved && typeof saved === 'object' && Array.isArray((saved as { rows?: unknown }).rows)
      ? (saved as { rows: FactRow[] }).rows
      : [];
  const computedTotals = rows.reduce((acc, r) => ({
    prior_debt: acc.prior_debt + Number(r.prior_debt || 0),
    accrued:    acc.accrued    + Number(r.accrued || 0),
    paid:       acc.paid       + Number(r.paid || 0),
    arrears:    acc.arrears    + Number(r.arrears || 0),
  }), { prior_debt: 0, accrued: 0, paid: 0, arrears: 0 });
  const snapshot = !Array.isArray(saved) && saved && typeof saved === 'object'
    ? saved as { totals?: typeof computedTotals; charges_count?: number; payments_count?: number }
    : null;
  const totals = snapshot?.totals || computedTotals;

  return json({
    id: row.id,
    building: { id: row.building_id, name: row.building_name, address: row.building_address },
    period_from: row.period_from,
    period_to: row.period_to,
    rows,
    totals,
    charges_count: snapshot?.charges_count ?? null,
    payments_count: snapshot?.payments_count ?? null,
    uk_income_plan: row.uk_income_plan,
    uk_income_fact: row.uk_income_fact,
    generated_by: row.generated_by,
    generated_at: row.generated_at,
  });
});

// ────────────────────────────────────────────────────────────────────
// Sprint 7: Пени за просрочку (ПКМ №930 + гл.29 ГК РУз).
//
// Модель работы:
//   1. У тенанта в finance_penalty_settings хранятся daily_rate (напр.
//      0.001), grace_days (30), max_multiplier (1.0), enabled bool.
//   2. Daily cron POST /api/finance/cron/apply-penalties идёт по всем
//      неоплаченным charges со статусом overdue/partial (или pending +
//      due_date < now − grace_days).
//   3. Для каждого считает days_overdue = (now − due_date) − grace_days.
//      penalty = min(principal × rate × days, principal × max_mult).
//   4. Пишет строку в finance_penalties (idempotent per date — если за
//      сегодня уже есть snapshot для charge, обновляет её вместо вставки).
//
// Пени не смешиваются с charges — они отдельная сущность, легко списываются
// (waive) без изменения истории начислений.
// ────────────────────────────────────────────────────────────────────

async function getPenaltySettings(env: Env, tenantId: string): Promise<{
  enabled: boolean;
  daily_rate: number;
  grace_days: number;
  max_multiplier: number;
}> {
  const row = await env.DB.prepare(
    `SELECT enabled, daily_rate, grace_days, max_multiplier
     FROM finance_penalty_settings WHERE tenant_id = ? LIMIT 1`
  ).bind(tenantId).first() as any;
  return {
    enabled: Boolean(row?.enabled),
    daily_rate: Number(row?.daily_rate ?? 0.001),
    grace_days: Number(row?.grace_days ?? 30),
    max_multiplier: Number(row?.max_multiplier ?? 1.0),
  };
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso).getTime();
  const b = new Date(toIso).getTime();
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.max(0, Math.floor((b - a) / 86400000));
}

// GET/PUT settings — admin/director управляет ставками.
route('GET', '/api/finance/penalty-settings', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const tenantId = getTenantId(request) || '';
  const s = await getPenaltySettings(env, tenantId);
  return json(s);
});

route('PUT', '/api/finance/penalty-settings', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  // Ставка пени — финансовое решение, только admin/director.
  if (!isAdminLevel(user)) return error('Только admin/director может менять ставку пеней', 403);

  const body = await request.json() as any;
  const tenantId = getTenantId(request) || '';
  const enabled = body.enabled ? 1 : 0;
  const daily_rate = Number(body.daily_rate ?? 0.001);
  const grace_days = Math.max(0, Math.floor(Number(body.grace_days ?? 30)));
  const max_multiplier = Math.max(0, Number(body.max_multiplier ?? 1.0));

  if (daily_rate < 0 || daily_rate > 0.1) return error('daily_rate вне диапазона [0, 0.1]');
  if (max_multiplier > 10) return error('max_multiplier не может быть > 10');

  await env.DB.prepare(
    `INSERT INTO finance_penalty_settings (tenant_id, enabled, daily_rate, grace_days, max_multiplier, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(tenant_id) DO UPDATE SET
       enabled = excluded.enabled,
       daily_rate = excluded.daily_rate,
       grace_days = excluded.grace_days,
       max_multiplier = excluded.max_multiplier,
       updated_by = excluded.updated_by,
       updated_at = datetime('now')`
  ).bind(tenantId, enabled, daily_rate, grace_days, max_multiplier, user.id).run();

  return json({ ok: true, enabled: Boolean(enabled), daily_rate, grace_days, max_multiplier });
});

// GET по одной квартире — все её пени (для драйла в UI).
route('GET', '/api/finance/apartments/:id/penalties', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('communal', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const tenantId = getTenantId(request);
  const { results } = await env.DB.prepare(
    `SELECT p.*, c.period AS charge_period
     FROM finance_penalties p
     LEFT JOIN finance_charges c ON c.id = p.charge_id
     WHERE p.apartment_id = ? ${tenantId ? 'AND p.tenant_id = ?' : ''}
     ORDER BY p.calculated_at DESC LIMIT 500`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).all();

  return json({ penalties: results || [] });
});

// Waive penalty — admin/director может списать (соц. случаи, ошибки).
route('POST', '/api/finance/penalties/:id/waive', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  // Списание пени — тоже финансовое решение, admin/director.
  if (!isAdminLevel(user)) return error('Только admin/director может списывать пени', 403);

  const body = await request.json().catch(() => ({})) as any;
  const tenantId = getTenantId(request);
  const res = await env.DB.prepare(
    `UPDATE finance_penalties
     SET status = 'waived',
         waived_by = ?,
         waived_reason = ?
     WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(user.id, body.reason || null, params.id, ...(tenantId ? [tenantId] : [])).run();

  return json({ ok: true, changes: (res.meta as any)?.changes || 0 });
});

// CRON: daily apply. Скан идёт по всем тенантам, у кого enabled=1.
route('POST', '/api/finance/cron/apply-penalties', async (request, env) => {
  const secret = request.headers.get('X-Cron-Secret');
  if (!env.CRON_SECRET) return error('CRON_SECRET not configured on server', 500);
  if (secret !== env.CRON_SECRET) return error('Forbidden', 403);

  // Все тенанты с включёнными пенями
  const { results: settings } = await env.DB.prepare(
    `SELECT tenant_id, daily_rate, grace_days, max_multiplier
     FROM finance_penalty_settings
     WHERE enabled = 1`
  ).all() as any;

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const nowIso = new Date().toISOString();
  let scanned = 0, applied = 0, updated = 0, capped = 0, cancelled = 0;

  for (const s of (settings || []) as any[]) {
    const tenantId = s.tenant_id;
    const rate = Number(s.daily_rate);
    const grace = Number(s.grace_days);
    const maxMult = Number(s.max_multiplier);

    // Hotfix: сначала пробегаемся по «повисшим» пеням — тем, чей charge
    // уже полностью оплачен (amount ≤ paid_amount). Помечаем их
    // status='cancelled', чтобы админ-UI/аудит показал историю, а
    // резидентский баланс перестал их учитывать.
    const cancelRes = await env.DB.prepare(
      `UPDATE finance_penalties
       SET status = 'cancelled'
       WHERE tenant_id = ?
         AND status = 'accrued'
         AND charge_id IN (
           SELECT id FROM finance_charges
           WHERE tenant_id = ? AND amount <= COALESCE(paid_amount, 0)
         )`
    ).bind(tenantId, tenantId).run();
    cancelled += (cancelRes.meta as any)?.changes || 0;

    // Просроченные charges (не полностью оплаченные + прошло больше grace_days)
    const { results: overdue } = await env.DB.prepare(
      `SELECT id, apartment_id, amount, paid_amount, due_date
       FROM finance_charges
       WHERE tenant_id = ?
         AND due_date IS NOT NULL
         AND date(due_date) < date(?, '-' || ? || ' days')
         AND amount > COALESCE(paid_amount, 0)`
    ).bind(tenantId, today, grace).all() as any;

    for (const c of (overdue || []) as any[]) {
      scanned++;
      const principal = Number(c.amount) - Number(c.paid_amount || 0);
      if (principal <= 0) continue;

      const days = daysBetween(c.due_date, nowIso) - grace;
      if (days <= 0) continue;

      let penalty = principal * rate * days;
      const cap = principal * maxMult;
      const wasCapped = penalty > cap;
      if (wasCapped) { penalty = cap; capped++; }
      const penaltyRounded = Math.round(penalty);
      if (penaltyRounded <= 0) continue;

      // Идемпотентность за сутки: если сегодня уже есть snapshot — UPDATE вместо INSERT.
      const existing = await env.DB.prepare(
        `SELECT id FROM finance_penalties
         WHERE charge_id = ? AND date(calculated_at) = date(?)
         LIMIT 1`
      ).bind(c.id, today).first() as any;

      if (existing) {
        await env.DB.prepare(
          `UPDATE finance_penalties
           SET principal_amount = ?, penalty_rate = ?, days_overdue = ?, penalty_amount = ?, calculated_at = datetime('now')
           WHERE id = ?`
        ).bind(principal, rate, days, penaltyRounded, existing.id).run();
        updated++;
      } else {
        await env.DB.prepare(
          `INSERT INTO finance_penalties
             (id, charge_id, apartment_id, tenant_id, principal_amount, penalty_rate, days_overdue, penalty_amount, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'accrued')`
        ).bind(
          generateId(), c.id, c.apartment_id, tenantId,
          principal, rate, days, penaltyRounded
        ).run();
        applied++;
      }
    }
  }

  return json({
    ok: true,
    date: today,
    tenants_processed: (settings || []).length,
    charges_scanned: scanned,
    penalties_created: applied,
    penalties_updated: updated,
    penalties_cancelled: cancelled,   // hotfix: авто-отмена по оплаченным charges
    charges_capped: capped,
  });
});

} // end registerFinanceV2Routes
