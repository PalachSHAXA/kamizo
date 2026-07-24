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
// Sync personal_accounts.current_debt/balance/last_payment из finance_charges
// и finance_payments. personal_accounts живёт отдельно от finance_charges —
// раньше поле `current_debt` заполнялось только вручную через PATCH и
// расходилось с реальностью. Функция синхронизирует одним UPDATE-JOIN'ом
// все ЛС конкретного дома (или все дома тенанта если building_id=null).
//
// Вызывается: (1) из ручного endpoint'а /api/finance/sync-accounts (для
// админа) и (2) из cron auto-billing после генерации всех charges.
// ────────────────────────────────────────────────────────────────────

async function syncPersonalAccounts(env: Env, tenantId: string | null, buildingId?: string | null): Promise<{ updated: number }> {
  // Один UPDATE ... FROM (SELECT ...) — SQLite 3.33+ поддерживает.
  // Обновляем apartments-level agg: charged - paid = current_debt, а также
  // last_payment_date/amount берём из максимального finance_payments.
  const params: any[] = [];
  let where = '1=1';
  if (tenantId) { where += ' AND pa.tenant_id = ?'; params.push(tenantId); }
  if (buildingId) { where += ' AND pa.building_id = ?'; params.push(buildingId); }

  const res = await env.DB.prepare(
    `UPDATE personal_accounts AS pa
     SET current_debt = COALESCE((
           SELECT SUM(c.amount) - SUM(c.paid_amount)
           FROM finance_charges c
           WHERE c.apartment_id = pa.apartment_id
             ${tenantId ? 'AND c.tenant_id = pa.tenant_id' : ''}
         ), 0),
         balance = COALESCE((
           SELECT SUM(c.paid_amount) - SUM(c.amount)
           FROM finance_charges c
           WHERE c.apartment_id = pa.apartment_id
             ${tenantId ? 'AND c.tenant_id = pa.tenant_id' : ''}
         ), 0),
         last_payment_date = (
           SELECT MAX(p.payment_date)
           FROM finance_payments p
           WHERE p.apartment_id = pa.apartment_id
             ${tenantId ? 'AND p.tenant_id = pa.tenant_id' : ''}
         ),
         updated_at = datetime('now')
     WHERE ${where}`
  ).bind(...params).run();

  return { updated: (res.meta as any)?.changes || 0 };
}

// Ручной endpoint пересчёта — admin/director может дёрнуть после подозрения
// на дрейф (например, ручные правки в БД через sqlite3).
route('POST', '/api/finance/sync-accounts', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isAdminLevel(user)) return error('Admin or director access required', 403);

  const tenantId = getTenantId(request);
  const url = new URL(request.url);
  const buildingId = url.searchParams.get('building_id');

  const result = await syncPersonalAccounts(env, tenantId, buildingId);
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
      // Все квартиры дома
      const { results: apartments } = await env.DB.prepare(
        `SELECT id, total_area, property_type, is_commercial, is_basement, is_parking
         FROM apartments WHERE building_id = ? AND tenant_id = ?`
      ).bind(est.building_id, est.tenant_id).all() as any;

      // Уже сгенерированные на этот период (идемпотентность)
      const { results: existing } = await env.DB.prepare(
        `SELECT apartment_id FROM finance_charges
         WHERE estimate_id = ? AND period = ? AND tenant_id = ?`
      ).bind(est.id, period, est.tenant_id).all() as any;
      const existingSet = new Set((existing || []).map((c: any) => c.apartment_id));

      // Тянем полную смету для расчёта (с новыми колонками v2)
      const full = await env.DB.prepare(
        `SELECT * FROM finance_estimates WHERE id = ?`
      ).bind(est.id).first() as any;

      const commercialRate = Number(full.commercial_rate) || 0;
      const basementRate = Number(full.basement_rate) || 0;
      const parkingRate = Number(full.parking_rate) || 0;
      const nonResidentialRate = Number(full.non_commercial_rate_per_sqm) || 0;
      const residentialRate = Number(full.tariff_approved) || Number(full.tariff_resident) || 0;

      const { results: itemsRaw } = await env.DB.prepare(
        `SELECT name, amount, kind FROM finance_estimate_items WHERE estimate_id = ?`
      ).bind(est.id).all() as any;
      const items = (itemsRaw || []).filter((i: any) => (i.kind || 'expense') === 'expense');
      const totalItems = items.reduce((s: number, i: any) => s + (Number(i.amount) || 0), 0);

      const [year, month] = period.split('-').map(Number);
      const dueDate = new Date(year, month, 0).toISOString().slice(0, 10);

      const stmts: any[] = [];
      let generated = 0, skipped = 0;

      for (const apt of (apartments || []) as any[]) {
        if (existingSet.has(apt.id)) { skipped++; continue; }
        const area = Number(apt.total_area) || 0;
        if (area <= 0 && !apt.is_parking) { skipped++; continue; }

        let rate: number, propertyType: string, isFlat = false;
        if (apt.is_parking) { rate = parkingRate; propertyType = 'non_commercial'; isFlat = true; }
        else if (apt.is_basement || apt.property_type === 'basement') { rate = basementRate > 0 ? basementRate : nonResidentialRate; propertyType = 'non_commercial'; }
        else if (apt.is_commercial) { rate = commercialRate > 0 ? commercialRate : nonResidentialRate; propertyType = 'commercial'; }
        else if (apt.property_type === 'non_commercial') { rate = basementRate > 0 ? basementRate : nonResidentialRate; propertyType = 'non_commercial'; }
        else { rate = residentialRate; propertyType = 'residential'; }

        const baseAmount = isFlat ? Math.round(rate * 100) / 100 : Math.round(area * rate * 100) / 100;
        if (baseAmount <= 0) { skipped++; continue; }

        const itemBreakdown = items.map((it: any) => ({
          name: it.name,
          share: totalItems > 0 ? Math.round((Number(it.amount) / totalItems) * baseAmount * 100) / 100 : 0,
        }));
        const breakdown = { area_sqm: area, rate_per_sqm: rate, base_amount: baseAmount, property_type: propertyType, items: itemBreakdown };
        const dbPropertyType = propertyType === 'non_commercial' ? 'non_commercial' : 'commercial';

        stmts.push(env.DB.prepare(
          `INSERT INTO finance_charges (id, apartment_id, estimate_id, period, amount, amount_breakdown, property_type, area_sqm, rate_per_sqm, status, due_date, tenant_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
        ).bind(
          generateId(), apt.id, est.id, period, baseAmount,
          JSON.stringify(breakdown), dbPropertyType, area, rate, dueDate, est.tenant_id
        ));
        generated++;
      }

      // Batch insert
      const BATCH = 100;
      for (let i = 0; i < stmts.length; i += BATCH) {
        await env.DB.batch(stmts.slice(i, i + BATCH));
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
      const s = await syncPersonalAccounts(env, tid || null);
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
  tenantId: string | null,
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
  const tenantWhereC = tenantId ? 'AND c.tenant_id = ?' : '';
  const tenantWhereP = tenantId ? 'AND p.tenant_id = ?' : '';
  const tenantParams = tenantId ? [tenantId] : [];

  // Все charges по домy за период. period в формате YYYY-MM — сравниваем как строки (лексикографический = хронологический для этого формата).
  const { results: charges } = await env.DB.prepare(
    `SELECT c.id, c.apartment_id, c.period, c.amount, c.paid_amount, c.amount_breakdown
     FROM finance_charges c
     JOIN apartments a ON a.id = c.apartment_id
     WHERE a.building_id = ?
       AND c.period >= ? AND c.period <= ?
       ${tenantWhereC}`
  ).bind(buildingId, periodFrom, periodTo, ...tenantParams).all() as any;

  // Долг ДО периода (prior_debt) — суммы charges с period < periodFrom, минус их paid_amount.
  const priorRow = await env.DB.prepare(
    `SELECT COALESCE(SUM(c.amount - c.paid_amount), 0) AS prior_debt
     FROM finance_charges c
     JOIN apartments a ON a.id = c.apartment_id
     WHERE a.building_id = ?
       AND c.period < ?
       ${tenantWhereC}`
  ).bind(buildingId, periodFrom, ...tenantParams).first() as any;
  const totalPriorDebt = Number(priorRow?.prior_debt || 0);

  // Payments за период (по датам, а не period)
  const paidRow = await env.DB.prepare(
    `SELECT COALESCE(SUM(p.amount), 0) AS paid
     FROM finance_payments p
     JOIN apartments a ON a.id = p.apartment_id
     WHERE a.building_id = ?
       AND date(p.payment_date) >= date(? || '-01')
       AND date(p.payment_date) < date(? || '-01', '+1 month')
       ${tenantWhereP}`
  ).bind(buildingId, periodFrom, periodTo, ...tenantParams).first() as any;
  const totalPaid = Number(paidRow?.paid || 0);

  const paymentsCountRow = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM finance_payments p
     JOIN apartments a ON a.id = p.apartment_id
     WHERE a.building_id = ?
       AND date(p.payment_date) >= date(? || '-01')
       AND date(p.payment_date) < date(? || '-01', '+1 month')
       ${tenantWhereP}`
  ).bind(buildingId, periodFrom, periodTo, ...tenantParams).first() as any;

  // Aggregate per-item из amount_breakdown. Каждый charge содержит либо
  // JSON [{name, amount}, ...], либо null (тогда идёт одной строкой "Прочее").
  const perItem = new Map<string, { name: string; legal_code?: string | null; accrued: number }>();
  let totalAccrued = 0;
  for (const c of (charges || []) as any[]) {
    const amount = Number(c.amount || 0);
    totalAccrued += amount;
    let breakdown: any = null;
    try { breakdown = c.amount_breakdown ? JSON.parse(c.amount_breakdown) : null; } catch { /* keep null */ }
    if (Array.isArray(breakdown) && breakdown.length) {
      for (const item of breakdown) {
        const name = String(item.name || item.category || 'Прочее');
        const amt = Number(item.amount || 0);
        const key = name.toLowerCase().trim();
        const prev = perItem.get(key);
        if (prev) prev.accrued += amt;
        else perItem.set(key, { name, legal_code: item.legal_code || null, accrued: amt });
      }
    } else {
      const key = 'прочие услуги';
      const prev = perItem.get(key);
      if (prev) prev.accrued += amount;
      else perItem.set(key, { name: 'Прочие услуги', legal_code: null, accrued: amount });
    }
  }

  // Разбираем прошлый долг и оплаты pro-rata по доле статей в accrued.
  const rows: FactRow[] = [];
  for (const item of perItem.values()) {
    const share = totalAccrued > 0 ? item.accrued / totalAccrued : 0;
    const paidShare = totalPaid * share;
    const priorShare = totalPriorDebt * share;
    rows.push({
      name: item.name,
      legal_code: item.legal_code,
      prior_debt: Math.round(priorShare),
      accrued: Math.round(item.accrued),
      paid: Math.round(paidShare),
      arrears: Math.round(priorShare + item.accrued - paidShare),
    });
  }
  rows.sort((a, b) => b.accrued - a.accrued);

  // Доход УК (прибыль): sum по finance_estimates.uk_profit_percent × total_expenses / 12 за месяцы периода.
  // План — из активной сметы. Факт — фактически поступившие paid × (uk_profit_percent / (1 + uk_profit_percent)) — приближение.
  const est = await env.DB.prepare(
    `SELECT uk_profit_percent, umumiy_year FROM finance_estimates
     WHERE building_id = ? AND status = 'active'
       ${tenantId ? 'AND tenant_id = ?' : ''}
     ORDER BY effective_date DESC, created_at DESC LIMIT 1`
  ).bind(buildingId, ...(tenantId ? [tenantId] : [])).first() as any;
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
      prior_debt: Math.round(totalPriorDebt),
      accrued: Math.round(totalAccrued),
      paid: Math.round(totalPaid),
      arrears: Math.round(totalPriorDebt + totalAccrued - totalPaid),
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
  if (!/^\d{4}-\d{2}$/.test(periodFrom) || !/^\d{4}-\d{2}$/.test(periodTo)) {
    return error('period_from/period_to must be YYYY-MM');
  }

  const tenantId = getTenantId(request);
  // sanity — building принадлежит тенанту
  const b = await env.DB.prepare(
    `SELECT id, name, address FROM buildings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''} LIMIT 1`
  ).bind(buildingId, ...(tenantId ? [tenantId] : [])).first() as any;
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
  if (!isAdminLevel(user)) return error('Только admin/director', 403);

  const body = await request.json() as any;
  const { building_id, period_from, period_to } = body;
  if (!building_id || !period_from || !period_to) return error('building_id, period_from, period_to required');

  const tenantId = getTenantId(request);
  const b = await env.DB.prepare(
    `SELECT id FROM buildings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''} LIMIT 1`
  ).bind(building_id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!b) return error('Building not found', 404);

  const report = await buildFactReport(env, tenantId, building_id, period_from, period_to);
  const id = generateId();

  await env.DB.prepare(
    `INSERT INTO finance_fact_reports (
       id, building_id, period_from, period_to, rows_json,
       uk_income_plan, uk_income_fact, generated_by, tenant_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, building_id, period_from, period_to, JSON.stringify(report.rows),
    report.uk_income_plan, report.uk_income_fact, user.id, tenantId || ''
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

  const where: string[] = [];
  const params: any[] = [];
  if (buildingId) { where.push('building_id = ?'); params.push(buildingId); }
  if (tenantId)   { where.push('tenant_id   = ?'); params.push(tenantId); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

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
  const row = await env.DB.prepare(
    `SELECT r.*, b.name AS building_name, b.address AS building_address
     FROM finance_fact_reports r
     LEFT JOIN buildings b ON b.id = r.building_id
     WHERE r.id = ? ${tenantId ? 'AND r.tenant_id = ?' : ''} LIMIT 1`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!row) return error('Not found', 404);

  let rows: FactRow[] = [];
  try { rows = row.rows_json ? JSON.parse(row.rows_json) : []; } catch { rows = []; }

  const totals = rows.reduce((acc, r) => ({
    prior_debt: acc.prior_debt + Number(r.prior_debt || 0),
    accrued:    acc.accrued    + Number(r.accrued || 0),
    paid:       acc.paid       + Number(r.paid || 0),
    arrears:    acc.arrears    + Number(r.arrears || 0),
  }), { prior_debt: 0, accrued: 0, paid: 0, arrears: 0 });

  return json({
    id: row.id,
    building: { id: row.building_id, name: row.building_name, address: row.building_address },
    period_from: row.period_from,
    period_to: row.period_to,
    rows,
    totals,
    uk_income_plan: row.uk_income_plan,
    uk_income_fact: row.uk_income_fact,
    generated_by: row.generated_by,
    generated_at: row.generated_at,
  });
});

} // end registerFinanceV2Routes
