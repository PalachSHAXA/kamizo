import {
  syncPersonalAccounts,
} from '../finance/accounting';
import { computeComplexEstimate } from '../estimate/compute';
import { classifyApartmentForBilling } from '../finance/property-classification';
import type { Env } from '../../types';
import { demoId } from './ids';
import { DEMO_BUILDING_AREAS } from './scenario';
import type {
  DemoDomainSeeder,
  DemoEntityCounter,
  DemoProvisionContext,
  DemoProvisionResult,
  DemoResultCounters,
} from './types';

const BATCH_SIZE = 100;

function dateAt(now: Date, days: number): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

function timestampAt(now: Date, days: number): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}

function monthAt(now: Date, monthOffset = 0): string {
  const value = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthOffset, 1));
  return value.toISOString().slice(0, 7);
}

async function runBatches(db: D1Database, statements: D1PreparedStatement[]): Promise<void> {
  for (let index = 0; index < statements.length; index += BATCH_SIZE) {
    await db.batch(statements.slice(index, index + BATCH_SIZE));
  }
}

async function existingIds(
  db: D1Database,
  table: string,
  ids: string[],
  tenantId: string,
): Promise<Set<string>> {
  const existing = new Set<string>();
  for (let index = 0; index < ids.length; index += BATCH_SIZE) {
    const batch = ids.slice(index, index + BATCH_SIZE);
    const placeholders = batch.map(() => '?').join(',');
    const result = await db.prepare(
      `SELECT id FROM ${table} WHERE tenant_id = ? AND id IN (${placeholders})`,
    ).bind(tenantId, ...batch).all<{ id: string }>();
    for (const row of result.results) existing.add(row.id);
  }
  return existing;
}

async function upsertEntities(
  context: DemoProvisionContext,
  table: string,
  ids: string[],
  statements: D1PreparedStatement[],
): Promise<DemoEntityCounter> {
  const existing = await existingIds(context.db, table, ids, context.tenantId);
  await runBatches(context.db, statements);
  return { created: ids.length - existing.size, updated: existing.size };
}

function upsertStatement(
  context: DemoProvisionContext,
  table: string,
  columns: string[],
  values: unknown[],
  updateColumns: string[] = columns.filter((column) => column !== 'id' && column !== 'tenant_id'),
): D1PreparedStatement {
  if (updateColumns.length === 0) {
    return context.db.prepare(`
      INSERT INTO ${table} (${columns.join(',')})
      VALUES (${columns.map(() => '?').join(',')})
      ON CONFLICT(id) DO NOTHING
    `).bind(...values);
  }
  const updates = updateColumns.map((column) => `${column}=excluded.${column}`).join(', ');
  return context.db.prepare(`
    INSERT INTO ${table} (${columns.join(',')})
    VALUES (${columns.map(() => '?').join(',')})
    ON CONFLICT(id) DO UPDATE SET ${updates}
    WHERE ${table}.tenant_id=excluded.tenant_id
  `).bind(...values);
}

function seededAllocationSql(apartmentCount: number, chargeCount: number): string {
  if (apartmentCount < 1 || apartmentCount > 99 || chargeCount < 1 || chargeCount > 99) {
    throw new Error('seeded allocation scope must contain between 1 and 99 rows');
  }
  const apartments = Array(apartmentCount).fill('?').join(',');
  const charges = Array(chargeCount).fill('?').join(',');
  return `WITH ordered_charges AS (
    SELECT id, apartment_id, CAST(ROUND(amount * 100, 0) AS INTEGER) AS amount_cents,
      COALESCE(SUM(CAST(ROUND(amount * 100, 0) AS INTEGER)) OVER (
        PARTITION BY apartment_id ORDER BY period ASC, created_at ASC, id ASC
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ), 0) AS charged_before
    FROM finance_charges
    WHERE tenant_id = ? AND apartment_id IN (${apartments})
  ), receipt_totals AS (
    SELECT apartment_id, COALESCE(SUM(CAST(ROUND(amount * 100, 0) AS INTEGER)), 0) AS received_cents
    FROM finance_payments
    WHERE tenant_id = ? AND apartment_id IN (${apartments}) AND payment_type != 'overpayment'
    GROUP BY apartment_id
  ), allocation AS (
    SELECT c.id,c.amount_cents,
      MAX(0,MIN(c.amount_cents,COALESCE(r.received_cents,0)-c.charged_before)) allocated_cents
    FROM ordered_charges c LEFT JOIN receipt_totals r ON r.apartment_id=c.apartment_id
  )
  UPDATE finance_charges SET
    paid_amount=ROUND(COALESCE((SELECT allocated_cents FROM allocation WHERE allocation.id=finance_charges.id),0)/100.0,2),
    status=CASE
      WHEN COALESCE((SELECT allocated_cents FROM allocation WHERE allocation.id=finance_charges.id),0)>=CAST(ROUND(amount*100,0) AS INTEGER) THEN 'paid'
      WHEN status='overdue' THEN 'overdue'
      WHEN COALESCE((SELECT allocated_cents FROM allocation WHERE allocation.id=finance_charges.id),0)>0 THEN 'partial'
      ELSE 'pending'
    END
  WHERE tenant_id=? AND apartment_id IN (${apartments}) AND id IN (${charges})`;
}

function seededAllocationBindings(tenantId: string, apartmentIds: string[], chargeIds: string[]): string[] {
  return [tenantId, ...apartmentIds, tenantId, ...apartmentIds, tenantId, ...apartmentIds, ...chargeIds];
}

async function supportedColumns(db: D1Database, table: string): Promise<Set<string>> {
  try {
    const result = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
    return new Set(result.results.map((column) => column.name));
  } catch {
    return new Set();
  }
}

export async function provisionDemoFinance(context: DemoProvisionContext): Promise<DemoProvisionResult> {
  if (context.tenantSlug !== 'demo') throw new Error('Demo provisioning requires the exact demo slug');

  const tenant = await context.db.prepare(
    'SELECT id FROM tenants WHERE id = ? AND slug = ?',
  ).bind(context.tenantId, context.tenantSlug).first<{ id: string }>();
  if (!tenant) throw new Error('Demo tenant not found');

  const counters: DemoResultCounters = {};
  const now = context.now.toISOString();
  const period = monthAt(context.now);
  const previousPeriod = monthAt(context.now, -1);
  const buildingIds = await Promise.all([
    demoId(context.tenantId, 'building:caravan'),
    demoId(context.tenantId, 'building:mirzo'),
  ]);
  const apartmentKeys = ['caravan:49', 'caravan:17', 'caravan:51', 'mirzo:201', 'mirzo:202', 'mirzo:203'];
  const apartmentIds = await Promise.all(
    apartmentKeys.map((key) => demoId(context.tenantId, `apartment:${key}`)),
  );

  const buildingRows = await context.db.prepare(`
    SELECT id, total_area, residential_area FROM buildings
    WHERE tenant_id = ? AND id IN (?,?)
  `).bind(context.tenantId, ...buildingIds).all<{ id: string; total_area: number; residential_area: number }>();
  if (buildingRows.results.length !== buildingIds.length) throw new Error('Demo presentation buildings are not provisioned');
  const expectedBuildingAreas = new Map([
    [buildingIds[0], DEMO_BUILDING_AREAS.caravan],
    [buildingIds[1], DEMO_BUILDING_AREAS.mirzo],
  ]);
  for (const building of buildingRows.results) {
    const expected = expectedBuildingAreas.get(building.id);
    if (expected == null
      || Number(building.total_area) !== expected
      || Number(building.residential_area) !== expected) {
      throw new Error('Demo canonical building area mismatch');
    }
  }

  const apartmentRows = await context.db.prepare(`
    SELECT id, building_id, total_area, property_type, is_commercial, is_basement, is_parking FROM apartments
    WHERE tenant_id = ? AND id IN (${apartmentIds.map(() => '?').join(',')})
  `).bind(context.tenantId, ...apartmentIds).all<{
    id: string;
    building_id: string;
    total_area: number;
    property_type: string;
    is_commercial: number | null;
    is_basement: number | null;
    is_parking: number | null;
  }>();
  if (apartmentRows.results.length !== apartmentIds.length) throw new Error('Demo presentation apartments are not provisioned');
  const apartments = new Map(apartmentRows.results.map((row) => [row.id, row]));
  // The six demo apartments are representative records, not the entire complexes.
  const buildingAreas = new Map(buildingRows.results.map((building) => [building.id, Number(building.total_area)]));

  const actors = await context.db.prepare(`
    SELECT id, login FROM users
    WHERE tenant_id = ? AND login IN ('demo-director','demo-manager','demo-executor')
  `).bind(context.tenantId).all<{ id: string; login: string }>();
  const actorIds = new Map(actors.results.map((actor) => [actor.login, actor.id]));
  const directorId = actorIds.get('demo-director');
  const managerId = actorIds.get('demo-manager');
  const executorId = actorIds.get('demo-executor');
  if (!directorId || !managerId || !executorId) throw new Error('Demo finance actors are not provisioned');

  const staffSpecs = [
    { title: 'Управляющий объектом', units: 1, salary: 8_500_000, vacation: 24 },
    { title: 'Инженер', units: 1, salary: 7_200_000, vacation: 24 },
    { title: 'Сантехник', units: 1, salary: 5_600_000, vacation: 21 },
    { title: 'Электрик', units: 1, salary: 5_900_000, vacation: 21 },
  ];
  const itemSpecs = [
    { key: 'staff', name: 'Фонд оплаты труда', category: 'payroll', monthly: 0, kind: 'expense', section: 'production', unit: 'staff_computed', linked: 1, legal: null, building: null },
    { key: 'cleaning', name: 'Уборка общих зон', category: 'maintenance', monthly: 4_730_000, kind: 'expense', section: 'production', unit: 'per_sqm', linked: 0, legal: 'cleaning_common', building: null },
    { key: 'elevator', name: 'Обслуживание лифтов', category: 'maintenance', monthly: 2_860_000, kind: 'expense', section: 'production', unit: 'flat', linked: 0, legal: 'elevator', building: buildingIds[0] },
    { key: 'security', name: 'Видеонаблюдение', category: 'security', monthly: 3_415_000, kind: 'expense', section: 'production', unit: 'per_apt', linked: 0, legal: 'security', building: buildingIds[1] },
    { key: 'electricity', name: 'Освещение общих зон', category: 'utilities', monthly: 2_275_000, kind: 'expense', section: 'production', unit: 'per_meter', linked: 0, legal: 'electricity_common', building: null },
    { key: 'seasonal', name: 'Сезонная подготовка', category: 'maintenance', monthly: 1_365_000, kind: 'expense', section: 'periodic', unit: 'flat', linked: 0, legal: 'seasonal', building: buildingIds[0] },
    { key: 'landscape', name: 'Уход за территорией', category: 'maintenance', monthly: 1_785_000, kind: 'expense', section: 'production', unit: 'per_sqm', linked: 0, legal: 'landscape', building: buildingIds[1] },
    { key: 'supplies', name: 'Хозяйственные материалы', category: 'materials', monthly: 935_000, kind: 'expense', section: 'production', unit: 'flat', linked: 0, legal: 'supplies', building: null },
    { key: 'commercial', name: 'Доход: commercial', category: 'commercial', monthly: 4_850_000, kind: 'income', section: 'production', unit: 'flat', linked: 0, legal: null, building: buildingIds[0] },
    { key: 'parking', name: 'Доход: parking', category: 'parking', monthly: 2_675_000, kind: 'income', section: 'production', unit: 'flat', linked: 0, legal: null, building: buildingIds[1] },
  ] as const;
  const complex = computeComplexEstimate({
    model: 'TARIFF_CALCULATED',
    object: { profit_rate: 0.1, payroll_tax_rate: 0.24, periodic_enabled: true },
    buildings: buildingIds.map((buildingId) => ({
      building_id: buildingId,
      residential_area: buildingAreas.get(buildingId) || 0,
    })),
    staff: staffSpecs.map((staff) => ({
      title: staff.title, units: staff.units, salary: staff.salary, vacation_days: staff.vacation,
    })),
    expenses: itemSpecs.filter((item) => item.kind === 'expense').map((item) => ({
      name: item.name,
      monthly: item.monthly,
      section: item.section,
      unit: item.unit,
      linked_to_staff: item.linked === 1,
      legal_code: item.legal || undefined,
      building_id: item.building || undefined,
    })),
    incomes: itemSpecs.filter((item) => item.kind === 'income').map((item) => ({
      type: item.key === 'parking' ? 'parking' as const : 'commercial' as const,
      monthly: item.monthly,
      building_id: item.building || undefined,
    })),
  });
  const totalResidentialArea = complex.buildings.reduce((sum, building) => sum + building.residential_area, 0);
  const nonStaffExpenseMonthly = itemSpecs
    .filter((item) => item.kind === 'expense' && !item.linked)
    .reduce((sum, item) => sum + item.monthly, 0);
  const linkedStaffExpenseMonthly = complex.total_expenses - nonStaffExpenseMonthly;
  const weighted = (field: 'base_per_m2' | 'with_profit_per_m2' | 'telecom_comp_per_m2' | 'tariff_resident') => (
    totalResidentialArea > 0
      ? complex.buildings.reduce((sum, building) => sum + building[field] * building.residential_area, 0) / totalResidentialArea
      : 0
  );

  const estimateId = await demoId(context.tenantId, 'finance:estimate:complex');
  counters.estimates = await upsertEntities(context, 'finance_estimates', [estimateId], [
    upsertStatement(context, 'finance_estimates', [
      'id', 'building_id', 'period', 'title', 'total_amount', 'commercial_rate_per_sqm',
      'uk_profit_percent', 'enterprise_profit_percent',
      'show_profit_to_residents', 'show_debtor_status_to_residents', 'status', 'created_by',
      'created_at', 'tenant_id', 'effective_date', 'model', 'commercial_income',
      'basement_income', 'parking_income', 'telecom_income', 'residential_area',
      'payroll_tax_rate', 'fot_gross', 'payroll_tax', 'fot_total', 'self_cost_resident',
      'base_per_m2', 'with_profit_per_m2', 'telecom_comp_per_m2', 'tariff_resident',
      'jami_tushum_year', 'umumiy_year', 'deficit_year',
      'periodic_enabled', 'scope_level', 'branch_code', 'allocation_base',
    ], [
      estimateId, buildingIds[0], period, `Демонстрационная смета ${period}`, complex.umumiy_year,
      weighted('tariff_resident'), 10, 10, 1, 1, 'active', directorId, now, context.tenantId,
      dateAt(context.now, -15), 'TARIFF_CALCULATED', 4_850_000, 0, 2_675_000, 0, totalResidentialArea, 0.24,
      complex.fot_gross, complex.payroll_tax, complex.fot_total,
      complex.buildings.reduce((sum, building) => sum + building.self_cost_resident, 0),
      weighted('base_per_m2'), weighted('with_profit_per_m2'), weighted('telecom_comp_per_m2'),
      weighted('tariff_resident'), complex.jami_tushum_year, complex.umumiy_year, complex.deficit_year,
      1, 'complex', 'YS', 'area',
    ], ['title']),
  ]);

  const estimateBuildingIds = await Promise.all(
    buildingIds.map((_, index) => demoId(context.tenantId, `finance:estimate-building:${index}`)),
  );
  counters.estimateBuildings = await upsertEntities(
    context,
    'finance_estimate_buildings',
    estimateBuildingIds,
    estimateBuildingIds.map((id, index) => upsertStatement(context, 'finance_estimate_buildings', [
      'id', 'estimate_id', 'building_id', 'residential_area', 'sort_order', 'tenant_id',
    ], [id, estimateId, buildingIds[index], buildingAreas.get(buildingIds[index]) || 0, index, context.tenantId], [])),
  );

  const staffIds = await Promise.all(staffSpecs.map((_, index) => demoId(context.tenantId, `finance:staff:${index}`)));
  counters.estimateStaff = await upsertEntities(
    context,
    'finance_estimate_staff',
    staffIds,
    staffSpecs.map((staff, index) => upsertStatement(context, 'finance_estimate_staff', [
      'id', 'estimate_id', 'title', 'units', 'salary', 'monthly', 'sort_order',
      'tenant_id', 'created_at', 'vacation_days',
    ], [
      staffIds[index], estimateId, staff.title, staff.units, staff.salary,
      staff.units * staff.salary, index, context.tenantId, now, staff.vacation,
    ], ['title'])),
  );

  const itemIds = await Promise.all(itemSpecs.map((item) => demoId(context.tenantId, `finance:item:${item.key}`)));
  counters.estimateItems = await upsertEntities(
    context,
    'finance_estimate_items',
    itemIds,
    itemSpecs.map((item, index) => upsertStatement(context, 'finance_estimate_items', [
      'id', 'estimate_id', 'name', 'category', 'amount', 'description', 'sort_order',
      'tenant_id', 'monthly_amount', 'kind', 'section', 'unit', 'linked_to_staff',
      'legal_code', 'building_id',
    ], [
      itemIds[index], estimateId, item.name, item.category,
      (item.linked ? linkedStaffExpenseMonthly : item.monthly) * 12,
      `${item.name}. Демонстрационная статья.`, index, context.tenantId,
      item.linked ? linkedStaffExpenseMonthly : item.monthly,
      item.kind, item.section, item.unit, item.linked, item.legal, item.building,
    ], ['name', 'category', 'description', 'legal_code'])),
  );

  const chargeDueDays = [-10, -5, 10, -60, -3, -2];
  const chargeIds = await Promise.all(apartmentIds.map((_, index) => demoId(context.tenantId, `finance:charge:${index}`)));
  const chargeAmounts = apartmentIds.map((apartmentId) => {
    const apartment = apartments.get(apartmentId)!;
    const rate = complex.buildings.find((building) => building.building_id === apartment.building_id)?.tariff_effective ?? 0;
    return Math.round(Number(apartment.total_area) * rate * 100) / 100;
  });
  const existingChargeIds = await existingIds(context.db, 'finance_charges', chargeIds, context.tenantId);
  const chargeStatements = apartmentIds.map((apartmentId, index) => {
      const apartment = apartments.get(apartmentId)!;
      const billingKind = classifyApartmentForBilling(apartment);
      if (billingKind !== 'residential') throw new Error('Demo presentation apartment must be residential');
      const rate = complex.buildings.find((building) => building.building_id === apartment.building_id)?.tariff_effective ?? 0;
      const amount = chargeAmounts[index];
      const firstShare = Math.round(amount * 60) / 100;
      const breakdown = JSON.stringify([
        { name: 'Содержание общего имущества', amount: firstShare },
        { name: 'Техническое обслуживание', amount: amount - firstShare },
      ]);
      return upsertStatement(context, 'finance_charges', [
        'id', 'apartment_id', 'estimate_id', 'period', 'amount', 'amount_breakdown',
        'property_type', 'area_sqm', 'rate_per_sqm', 'status', 'due_date',
        'paid_amount', 'created_at', 'tenant_id',
      ], [
        chargeIds[index], apartmentId, estimateId, period, amount, breakdown,
        'non_commercial', Number(apartment.total_area), rate, 'pending', dateAt(context.now, chargeDueDays[index]),
       0, timestampAt(context.now, -20 + index), context.tenantId,
      ], ['amount', 'amount_breakdown', 'property_type', 'area_sqm', 'rate_per_sqm', 'due_date']);
    });
  counters.charges = {
    created: chargeIds.length - existingChargeIds.size,
    updated: existingChargeIds.size,
  };

  const paymentSpecs = [
    { chargeIndex: 0, amount: chargeAmounts[0] + 20, type: 'cash', days: -9 },
    { chargeIndex: 1, amount: Math.round(chargeAmounts[1] * 55) / 100, type: 'card', days: -4 },
    { chargeIndex: 4, amount: chargeAmounts[4], type: 'transfer', days: -2 },
    { chargeIndex: 5, amount: Math.round(chargeAmounts[5] * 35) / 100, type: 'online', days: -1 },
  ] as const;
  const paymentIds = await Promise.all(paymentSpecs.map((_, index) => demoId(context.tenantId, `finance:payment:${index}`)));
  const existingPaymentIds = await existingIds(context.db, 'finance_payments', paymentIds, context.tenantId);
  const paymentStatements = paymentSpecs.map((payment, index) => upsertStatement(context, 'finance_payments', [
      'id', 'charge_id', 'apartment_id', 'amount', 'payment_date', 'payment_type',
      'receipt_number', 'description', 'received_by', 'tenant_id',
    ], [
      paymentIds[index], chargeIds[payment.chargeIndex], apartmentIds[payment.chargeIndex],
      payment.amount, timestampAt(context.now, payment.days), payment.type,
      `DEMO-${paymentIds[index].slice(0, 8).toUpperCase()}`, 'Демонстрационная оплата',
      managerId, context.tenantId,
    ], []));
  counters.payments = {
    created: paymentIds.length - existingPaymentIds.size,
    updated: existingPaymentIds.size,
  };

  const newChargeIds = chargeIds.filter((id) => !existingChargeIds.has(id));
  const newPaymentChargeIds = paymentSpecs.flatMap((payment, index) => (
    existingPaymentIds.has(paymentIds[index]) ? [] : [chargeIds[payment.chargeIndex]]
  ));
  const allocationChargeIds = Array.from(new Set([...newChargeIds, ...newPaymentChargeIds]));
  const allocationApartmentIds = apartmentIds.filter((_, index) => allocationChargeIds.includes(chargeIds[index]));
  const financeCreationStatements = [...chargeStatements, ...paymentStatements];
  if (allocationChargeIds.length > 0) {
    financeCreationStatements.push(
      context.db.prepare(seededAllocationSql(allocationApartmentIds.length, allocationChargeIds.length))
        .bind(...seededAllocationBindings(context.tenantId, allocationApartmentIds, allocationChargeIds)),
    );
    if (newChargeIds.includes(chargeIds[3])) {
      financeCreationStatements.push(context.db.prepare(`
        UPDATE finance_charges SET status='overdue'
        WHERE id=? AND tenant_id=? AND paid_amount < amount
      `).bind(chargeIds[3], context.tenantId));
    }
  }
  if (financeCreationStatements.length > BATCH_SIZE) throw new Error('Demo finance creation batch exceeds 100 statements');
  await context.db.batch(financeCreationStatements);

  const accountIds = await Promise.all(apartmentIds.map((_, index) => demoId(context.tenantId, `finance:account:${index}`)));
  counters.personalAccounts = await upsertEntities(
    context,
    'personal_accounts',
    accountIds,
    apartmentIds.map((apartmentId, index) => upsertStatement(context, 'personal_accounts', [
      'id', 'apartment_id', 'account_number', 'balance', 'last_payment_date',
      'last_payment_amount', 'created_at', 'tenant_id',
    ], [
      accountIds[index], apartmentId, `DEMO-${accountIds[index].slice(0, 12).toUpperCase()}`,
      0, null, null, now, context.tenantId,
    ], [])),
  );
  for (let index = 0; index < apartmentIds.length; index++) {
    await syncPersonalAccounts({ DB: context.db } as Env, context.tenantId, { apartmentId: apartmentIds[index] });
    await context.db.prepare(`
      UPDATE apartments SET personal_account_id=? WHERE id=? AND tenant_id=?
    `).bind(accountIds[index], apartmentIds[index], context.tenantId).run();
  }

  const existingSettings = await context.db.prepare(
    'SELECT tenant_id FROM finance_penalty_settings WHERE tenant_id = ?',
  ).bind(context.tenantId).first<{ tenant_id: string }>();
  await context.db.prepare(`
    INSERT INTO finance_penalty_settings
      (tenant_id,enabled,daily_rate,grace_days,max_multiplier,updated_by,updated_at)
    VALUES (?,1,0.001,30,1,?,?)
    ON CONFLICT(tenant_id) DO NOTHING
  `).bind(context.tenantId, directorId, now).run();
  counters.penaltySettings = existingSettings ? { created: 0, updated: 1 } : { created: 1, updated: 0 };

  const penaltyId = await demoId(context.tenantId, 'finance:penalty:overdue');
  counters.penalties = await upsertEntities(context, 'finance_penalties', [penaltyId], [
    upsertStatement(context, 'finance_penalties', [
      'id', 'charge_id', 'apartment_id', 'tenant_id', 'principal_amount', 'penalty_rate',
      'days_overdue', 'penalty_amount', 'status', 'paid_amount', 'calculated_at',
    ], [
      penaltyId, chargeIds[3], apartmentIds[3], context.tenantId, chargeAmounts[3], 0.001,
      30, Math.round(chargeAmounts[3] * 0.001 * 30 * 100) / 100, 'accrued', 0, now,
    ], []),
  ]);

  const incomeCategorySpecs = [
    { key: 'parking', name: 'Парковка' },
    { key: 'advertising', name: 'Реклама в подъездах' },
  ];
  const incomeCategoryIds = await Promise.all(
    incomeCategorySpecs.map((category) => demoId(context.tenantId, `finance:income-category:${category.key}`)),
  );
  counters.incomeCategories = await upsertEntities(
    context,
    'finance_income_categories',
    incomeCategoryIds,
    incomeCategorySpecs.map((category, index) => upsertStatement(context, 'finance_income_categories', [
      'id', 'name', 'is_default', 'is_active', 'tenant_id',
    ], [incomeCategoryIds[index], category.name, 0, 1, context.tenantId], ['name'])),
  );

  const incomeSpecs = [
    { amount: 5_400_000, description: 'Аренда парковочных мест', source: 'parking' },
    { amount: 2_750_000, description: 'Размещение рекламы', source: 'advertising' },
  ];
  const incomeIds = await Promise.all(incomeSpecs.map((_, index) => demoId(context.tenantId, `finance:income:${index}`)));
  counters.income = await upsertEntities(
    context,
    'finance_income',
    incomeIds,
    incomeSpecs.map((income, index) => upsertStatement(context, 'finance_income', [
      'id', 'category_id', 'amount', 'period', 'description', 'source_type',
      'source_id', 'created_by', 'created_at', 'tenant_id',
    ], [
      incomeIds[index], incomeCategoryIds[index], income.amount, period, income.description,
       income.source, estimateId, directorId, timestampAt(context.now, -6 + index), context.tenantId,
    ], [])),
  );

  const expenseSpecs = [
    { item: 1, amount: 4_850_000, description: 'Уборка и расходные материалы', building: buildingIds[0], days: -7 },
    { item: 2, amount: 2_760_000, description: 'Плановое обслуживание лифта', building: buildingIds[1], days: -3 },
  ];
  const expenseIds = await Promise.all(expenseSpecs.map((_, index) => demoId(context.tenantId, `finance:expense:${index}`)));
  counters.expenses = await upsertEntities(
    context,
    'finance_expenses',
    expenseIds,
    expenseSpecs.map((expense, index) => upsertStatement(context, 'finance_expenses', [
      'id', 'tenant_id', 'building_id', 'estimate_id', 'estimate_item_id',
      'estimate_item_name', 'amount', 'expense_date', 'description', 'document_url',
      'request_id', 'created_by', 'created_at',
    ], [
      expenseIds[index], context.tenantId, expense.building, estimateId, itemIds[expense.item],
      itemSpecs[expense.item].name, expense.amount, dateAt(context.now, expense.days),
       expense.description, null, null, managerId, timestampAt(context.now, expense.days),
    ], [])),
  );

  const materialSpecs = [
    { key: 'lamp', name: 'LED лампа 12W', unit: 'шт', quantity: 24, price: 48_000, minimum: 10, building: buildingIds[0] },
    { key: 'valve', name: 'Шаровой кран 20 мм', unit: 'шт', quantity: 8, price: 165_000, minimum: 5, building: buildingIds[1] },
  ];
  const materialIds = await Promise.all(materialSpecs.map((material) => demoId(context.tenantId, `finance:material:${material.key}`)));
  counters.materials = await upsertEntities(
    context,
    'finance_materials',
    materialIds,
    materialSpecs.map((material, index) => upsertStatement(context, 'finance_materials', [
      'id', 'name', 'unit', 'quantity', 'price_per_unit', 'min_quantity', 'building_id', 'tenant_id',
    ], [
      materialIds[index], material.name, material.unit, material.quantity, material.price,
       material.minimum, material.building, context.tenantId,
    ], ['name', 'unit', 'price_per_unit', 'min_quantity', 'building_id'])),
  );

  const completedRequestId = await demoId(context.tenantId, 'request:completed');
  const request = await context.db.prepare(
    'SELECT id FROM requests WHERE id = ? AND tenant_id = ?',
  ).bind(completedRequestId, context.tenantId).first<{ id: string }>();
  const usageIds = await Promise.all(materialIds.map((_, index) => demoId(context.tenantId, `finance:material-usage:${index}`)));
  counters.materialUsage = await upsertEntities(
    context,
    'finance_material_usage',
    usageIds,
    materialIds.map((materialId, index) => upsertStatement(context, 'finance_material_usage', [
      'id', 'material_id', 'quantity', 'request_id', 'estimate_item_id', 'used_by',
      'description', 'used_at', 'tenant_id',
    ], [
      usageIds[index], materialId, index === 0 ? 4 : 1, request?.id || null,
      itemIds[index === 0 ? 4 : 2], executorId, 'Демонстрационное списание',
       timestampAt(context.now, -2 + index), context.tenantId,
    ], [])),
  );

  const accessId = await demoId(context.tenantId, 'finance:access:manager');
  counters.financeAccess = await upsertEntities(context, 'finance_access', [accessId], [
    upsertStatement(context, 'finance_access', [
      'id', 'user_id', 'access_level', 'granted_by', 'granted_at', 'tenant_id',
    ], [accessId, managerId, 'full', directorId, now, context.tenantId], []),
  ]);

  const claimColumns = await supportedColumns(context.db, 'finance_claims');
  const requiredClaimColumns = [
    'id', 'apartment_id', 'claim_type', 'total_debt', 'period_from', 'period_to',
    'deadline_days', 'generated_by', 'generated_at', 'tenant_id',
  ];
  if (requiredClaimColumns.every((column) => claimColumns.has(column))) {
    const claimSpecs = [
      { key: 'reconciliation', apartment: 1, type: 'reconciliation', debt: chargeAmounts[1] - paymentSpecs[1].amount, deadline: 14 },
      { key: 'pretension', apartment: 3, type: 'pretension', debt: chargeAmounts[3], deadline: 14 },
    ];
    const claimIds = await Promise.all(claimSpecs.map((claim) => demoId(context.tenantId, `finance:claim:${claim.key}`)));
    counters.claims = await upsertEntities(
      context,
      'finance_claims',
      claimIds,
      claimSpecs.map((claim, index) => upsertStatement(context, 'finance_claims', requiredClaimColumns, [
        claimIds[index], apartmentIds[claim.apartment], claim.type, claim.debt,
       previousPeriod, period, claim.deadline, directorId, now, context.tenantId,
      ], [])),
    );
  } else {
    counters.claims = { created: 0, updated: 0 };
  }

  return { phase: 'finance', counters };
}

export const demoFinanceSeeder: DemoDomainSeeder = {
  phase: 'finance',
  seed: provisionDemoFinance,
};
