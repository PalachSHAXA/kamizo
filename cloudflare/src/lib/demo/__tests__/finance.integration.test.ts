import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error Worker tsconfig intentionally omits Node types.
import { execFileSync } from 'node:child_process';
// @ts-expect-error Worker tsconfig intentionally omits Node types.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
// @ts-expect-error Worker tsconfig intentionally omits Node types.
import { tmpdir } from 'node:os';
// @ts-expect-error Worker tsconfig intentionally omits Node types.
import { join } from 'node:path';

import { demoId } from '../ids';
import { computeComplexEstimate } from '../../estimate/compute';

const schema = readFileSync(new URL('./fixtures/demo-production-schema.sql', import.meta.url), 'utf8');

function quote(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function bindSql(sql: string, params: unknown[]): string {
  let index = 0;
  return sql.replace(/\?/g, () => quote(params[index++]));
}

function sqliteJson(dbPath: string, sql: string): any[] {
  const output = execFileSync('sqlite3', ['-json', dbPath, sql], { encoding: 'utf8' }).trim();
  return output ? JSON.parse(output) : [];
}

type FinanceBatchFault = 'before' | 'inside';

function createDb(
  dbPath: string,
  options: { financeBatchFault?: FinanceBatchFault; batchSizes?: number[] } = {},
): D1Database {
  let faultUsed = false;
  const prepare = (sql: string) => {
    let params: unknown[] = [];
    const statement = {
      bind(...values: unknown[]) { params = values; return statement; },
      sqlText() { return bindSql(sql, params); },
      async first() { return sqliteJson(dbPath, bindSql(sql, params))[0] ?? null; },
      async all() { return { results: sqliteJson(dbPath, bindSql(sql, params)), success: true, meta: {} }; },
      async run() {
        const result = sqliteJson(dbPath, `${bindSql(sql, params)}; SELECT changes() AS changes;`);
        return { success: true, meta: { changes: Number(result.at(-1)?.changes ?? 0) } };
      },
    };
    return statement;
  };
  return {
    prepare,
    async batch(statements: any[]) {
      options.batchSizes?.push(statements.length);
      if (statements.length > 100) throw new Error('Demo batch exceeded 100 statements');
      const sql = statements.map((statement) => statement.sqlText());
      const financeCreation = sql.some((item) => /INSERT INTO finance_charges/i.test(item))
        && sql.some((item) => /INSERT INTO finance_payments/i.test(item))
        && sql.some((item) => /UPDATE finance_charges SET/i.test(item));
      if (financeCreation && options.financeBatchFault && !faultUsed) {
        faultUsed = true;
        if (options.financeBatchFault === 'before') throw new Error('Injected failure before finance creation batch');
      }
      const insideIndex = financeCreation && options.financeBatchFault === 'inside' && faultUsed
        ? Math.max(1, sql.findIndex((item) => /INSERT INTO finance_payments/i.test(item)))
        : -1;
      if (insideIndex >= 0) {
        execFileSync('sqlite3', [dbPath], {
          input: `.bail on\nBEGIN;\n${sql.slice(0, insideIndex).join(';\n')};\nROLLBACK;`,
        });
        throw new Error('Injected failure inside finance creation batch');
      }
      execFileSync('sqlite3', [dbPath], {
        input: `.bail on\nBEGIN;\n${sql.join(';\n')};\nCOMMIT;`,
      });
      return statements.map(() => ({ success: true, meta: {} }));
    },
  } as unknown as D1Database;
}

function run(dbPath: string, sql: string): void {
  execFileSync('sqlite3', [dbPath], { input: sql });
}

function rows(dbPath: string, sql: string): any[] {
  return sqliteJson(dbPath, sql);
}

async function loadFinanceModule() {
  const loaded = await import('../finance').catch(() => null);
  expect(loaded, 'finance seeder module must exist').not.toBeNull();
  return loaded!;
}

describe('provisionDemoFinance SQLite integration', () => {
  let directory: string;
  let dbPath: string;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'kamizo-demo-finance-'));
    dbPath = join(directory, 'fixture.db');

    const buildingIds = await Promise.all([
      demoId('tenant-demo', 'building:caravan'),
      demoId('tenant-demo', 'building:mirzo'),
    ]);
    const apartmentKeys = ['caravan:49', 'caravan:17', 'caravan:51', 'mirzo:201', 'mirzo:202', 'mirzo:203'];
    const apartmentIds = await Promise.all(apartmentKeys.map((key) => demoId('tenant-demo', `apartment:${key}`)));
    const requestId = await demoId('tenant-demo', 'request:completed');

    run(dbPath, schema + `
      INSERT INTO tenants (id,name,slug,url) VALUES
        ('tenant-demo','Demo','demo','https://demo.kamizo.uz'),
        ('tenant-other','Other','other','https://other.kamizo.uz');
      INSERT INTO users (id,login,password_hash,name,role,tenant_id) VALUES
        ('director-demo','demo-director','hash','Director','director','tenant-demo'),
        ('manager-demo','demo-manager','hash','Manager','manager','tenant-demo'),
        ('executor-demo','demo-executor','hash','Executor','executor','tenant-demo'),
        ('manager-other','demo-manager','hash','Other Manager','manager','tenant-other');
      INSERT INTO buildings (id,name,address,total_area,residential_area,tenant_id) VALUES
        (${quote(buildingIds[0])},'ЖК Caravan City','ул. Бобура, 24',10840,10840,'tenant-demo'),
        (${quote(buildingIds[1])},'ЖК Mirzo Residence','ул. Мирзо Улугбека, 55',8760,8760,'tenant-demo'),
        ('building-other','Other','Other address',10,10,'tenant-other');
      INSERT INTO apartments (id,building_id,number,total_area,property_type,tenant_id) VALUES
        (${quote(apartmentIds[0])},${quote(buildingIds[0])},'49',49,'non_commercial','tenant-demo'),
        (${quote(apartmentIds[1])},${quote(buildingIds[0])},'17',17,'non_commercial','tenant-demo'),
        (${quote(apartmentIds[2])},${quote(buildingIds[0])},'51',42,'non_commercial','tenant-demo'),
        (${quote(apartmentIds[3])},${quote(buildingIds[1])},'201',72,'non_commercial','tenant-demo'),
        (${quote(apartmentIds[4])},${quote(buildingIds[1])},'202',56,'non_commercial','tenant-demo'),
        (${quote(apartmentIds[5])},${quote(buildingIds[1])},'203',63,'non_commercial','tenant-demo'),
        ('apartment-other-demo',${quote(buildingIds[0])},'99',10,'non_commercial','tenant-demo'),
        ('apartment-other-tenant','building-other','1',10,'non_commercial','tenant-other');
      INSERT INTO requests (id,resident_id,category_id,title,tenant_id)
        VALUES (${quote(requestId)},'resident-demo','category-demo','Completed request','tenant-demo');
      INSERT INTO finance_charges
        (id,apartment_id,period,amount,status,paid_amount,created_at,tenant_id)
        VALUES ('existing-demo-charge','apartment-other-demo','2026-01',11.11,'partial',1.11,'2026-01-01','tenant-demo'),
               ('existing-seeded-apartment-charge',${quote(apartmentIds[0])},'2025-12',25,'overdue',5,'2025-12-01','tenant-demo'),
               ('other-charge','apartment-other-tenant','2026-01',99.99,'pending',0,'2026-01-01','tenant-other');
      INSERT INTO finance_payments (id,apartment_id,amount,payment_type,receipt_number,tenant_id)
        VALUES ('existing-demo-payment','apartment-other-demo',1.11,'cash','EXISTING-DEMO','tenant-demo'),
               ('existing-seeded-apartment-payment',${quote(apartmentIds[0])},5,'cash','EXISTING-SEEDED','tenant-demo'),
               ('other-payment','apartment-other-tenant',10,'cash','OTHER-001','tenant-other');
      INSERT INTO personal_accounts (id,account_number,apartment_id,balance,tenant_id)
        VALUES ('other-account','OTHER-PA','apartment-other-tenant',77.77,'tenant-other');
    `);
  });

  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it('seeds deterministic finance data twice while preserving exact accounting and tenant isolation', async () => {
    const { demoFinanceSeeder, provisionDemoFinance } = await loadFinanceModule();
    const context = {
      db: createDb(dbPath),
      tenantId: 'tenant-demo',
      tenantSlug: 'demo' as const,
      now: new Date('2026-08-16T12:00:00.000Z'),
      createPasswordHash: async () => 'unused',
    };

    expect(demoFinanceSeeder.phase).toBe('finance');
    const first = await provisionDemoFinance(context);
    const countsAfterFirst = rows(dbPath, `
      SELECT 'estimates' entity,COUNT(*) count FROM finance_estimates WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'estimateBuildings',COUNT(*) FROM finance_estimate_buildings WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'estimateStaff',COUNT(*) FROM finance_estimate_staff WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'estimateItems',COUNT(*) FROM finance_estimate_items WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'charges',COUNT(*) FROM finance_charges WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'payments',COUNT(*) FROM finance_payments WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'personalAccounts',COUNT(*) FROM personal_accounts WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'penalties',COUNT(*) FROM finance_penalties WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'income',COUNT(*) FROM finance_income WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'expenses',COUNT(*) FROM finance_expenses WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'materials',COUNT(*) FROM finance_materials WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'materialUsage',COUNT(*) FROM finance_material_usage WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'financeAccess',COUNT(*) FROM finance_access WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'claims',COUNT(*) FROM finance_claims WHERE tenant_id='tenant-demo'
    `);
    const second = await demoFinanceSeeder.seed(context);
    const countsAfterSecond = rows(dbPath, `
      SELECT 'estimates' entity,COUNT(*) count FROM finance_estimates WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'estimateBuildings',COUNT(*) FROM finance_estimate_buildings WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'estimateStaff',COUNT(*) FROM finance_estimate_staff WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'estimateItems',COUNT(*) FROM finance_estimate_items WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'charges',COUNT(*) FROM finance_charges WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'payments',COUNT(*) FROM finance_payments WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'personalAccounts',COUNT(*) FROM personal_accounts WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'penalties',COUNT(*) FROM finance_penalties WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'income',COUNT(*) FROM finance_income WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'expenses',COUNT(*) FROM finance_expenses WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'materials',COUNT(*) FROM finance_materials WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'materialUsage',COUNT(*) FROM finance_material_usage WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'financeAccess',COUNT(*) FROM finance_access WHERE tenant_id='tenant-demo'
      UNION ALL SELECT 'claims',COUNT(*) FROM finance_claims WHERE tenant_id='tenant-demo'
    `);

    expect(first.counters).toMatchObject({
      estimates: { created: 1 }, estimateBuildings: { created: 2 }, estimateStaff: { created: 4 },
      estimateItems: { created: 10 }, charges: { created: 6 }, payments: { created: 4 },
      personalAccounts: { created: 6 }, penaltySettings: { created: 1 }, penalties: { created: 1 },
      incomeCategories: { created: 2 }, income: { created: 2 }, expenses: { created: 2 },
      materials: { created: 2 }, materialUsage: { created: 2 }, financeAccess: { created: 1 },
      claims: { created: 2 },
    });
    expect(Object.values(second.counters).every((counter) => counter.created === 0)).toBe(true);
    expect(countsAfterSecond).toEqual(countsAfterFirst);

    expect(rows(dbPath, `SELECT scope_level,status,total_amount FROM finance_estimates WHERE tenant_id='tenant-demo'`)).toEqual([
      { scope_level: 'complex', status: 'active', total_amount: expect.any(Number) },
    ]);
    expect(rows(dbPath, `SELECT residential_area FROM finance_estimate_buildings WHERE tenant_id='tenant-demo' ORDER BY sort_order`)).toEqual([
      { residential_area: 10840 }, { residential_area: 8760 },
    ]);
    expect(rows(dbPath, `
      SELECT b.total_area,b.residential_area building_residential_area,eb.residential_area estimate_residential_area
      FROM finance_estimate_buildings eb JOIN buildings b ON b.id=eb.building_id AND b.tenant_id=eb.tenant_id
      WHERE eb.tenant_id='tenant-demo' ORDER BY eb.sort_order
    `)).toEqual([
      { total_area: 10840, building_residential_area: 10840, estimate_residential_area: 10840 },
      { total_area: 8760, building_residential_area: 8760, estimate_residential_area: 8760 },
    ]);
    expect(rows(dbPath, `
      SELECT kind,COUNT(*) count,ROUND(SUM(amount),2) total
      FROM finance_estimate_items WHERE tenant_id='tenant-demo' GROUP BY kind ORDER BY kind
    `)).toEqual([
      { kind: 'expense', count: 8, total: expect.any(Number) },
      { kind: 'income', count: 2, total: 90300000 },
    ]);
    expect(rows(dbPath, `
      SELECT COUNT(*) count FROM finance_estimate_items i
      LEFT JOIN buildings b ON b.id=i.building_id AND b.tenant_id=i.tenant_id
      WHERE i.tenant_id='tenant-demo'
        AND (i.kind NOT IN ('expense','income') OR i.section NOT IN ('production','periodic')
          OR i.unit NOT IN ('flat','per_sqm','per_apt','per_meter','staff_computed')
          OR (i.building_id IS NOT NULL AND b.id IS NULL))
    `)[0].count).toBe(0);
    expect(rows(dbPath, `SELECT salary,monthly FROM finance_estimate_staff WHERE tenant_id='tenant-demo' ORDER BY sort_order`)).toEqual([
      { salary: 8500000, monthly: 8500000 },
      { salary: 7200000, monthly: 7200000 },
      { salary: 5600000, monthly: 5600000 },
      { salary: 5900000, monthly: 5900000 },
    ]);

    expect(rows(dbPath, `SELECT status,COUNT(*) count FROM finance_charges WHERE tenant_id='tenant-demo' AND estimate_id IS NOT NULL GROUP BY status ORDER BY status`)).toEqual([
      { status: 'overdue', count: 1 }, { status: 'paid', count: 2 },
      { status: 'partial', count: 2 }, { status: 'pending', count: 1 },
    ]);
    expect(rows(dbPath, `
      WITH ordered AS (
        SELECT id,apartment_id,amount,paid_amount,estimate_id,
          COALESCE(SUM(amount) OVER (
            PARTITION BY apartment_id ORDER BY period,created_at,id
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
          ),0) charged_before
        FROM finance_charges WHERE tenant_id='tenant-demo'
      ), receipts AS (
        SELECT apartment_id,SUM(amount) received FROM finance_payments
        WHERE tenant_id='tenant-demo' AND payment_type!='overpayment' GROUP BY apartment_id
      )
      SELECT o.paid_amount,MAX(0,MIN(o.amount,COALESCE(r.received,0)-o.charged_before)) expected
      FROM ordered o LEFT JOIN receipts r ON r.apartment_id=o.apartment_id
      WHERE o.estimate_id IS NOT NULL
    `).every((row) => Math.round(row.paid_amount * 100) === Math.round(row.expected * 100))).toBe(true);
    expect(rows(dbPath, `SELECT COUNT(*) count,COUNT(DISTINCT receipt_number) receipts FROM finance_payments WHERE tenant_id='tenant-demo' AND charge_id IS NOT NULL`)).toEqual([
      { count: 4, receipts: 4 },
    ]);
    const seededPaymentAmounts = rows(dbPath, `SELECT amount FROM finance_payments WHERE tenant_id='tenant-demo' AND charge_id IS NOT NULL`).map((row) => row.amount);
    expect(Math.min(...seededPaymentAmounts)).toBeGreaterThan(20000);
    expect(Math.max(...seededPaymentAmounts)).toBeLessThan(250000);
    expect(rows(dbPath, `SELECT payment_type FROM finance_payments WHERE tenant_id='tenant-demo' AND charge_id IS NOT NULL ORDER BY payment_type`).map((row) => row.payment_type)).toEqual([
      'card', 'cash', 'online', 'transfer',
    ]);
    expect(rows(dbPath, `SELECT COUNT(*) count FROM finance_payments WHERE tenant_id='tenant-demo' AND payment_type='overpayment'`)[0].count).toBe(0);
    expect(rows(dbPath, `
      SELECT COUNT(*) count FROM finance_charges
      WHERE tenant_id='tenant-demo' AND estimate_id IS NOT NULL
        AND ABS(amount * 100 - ROUND(amount * 100)) > 0.000001
    `)[0].count).toBe(0);

    const breakdowns = rows(dbPath, `SELECT amount,amount_breakdown FROM finance_charges WHERE tenant_id='tenant-demo' AND estimate_id IS NOT NULL`);
    expect(breakdowns.every((row) => {
      const total = JSON.parse(row.amount_breakdown).reduce((sum: number, item: { amount: number }) => sum + Math.round(item.amount * 100), 0);
      return total === Math.round(row.amount * 100);
    })).toBe(true);
    expect(rows(dbPath, `
      SELECT COUNT(*) count FROM personal_accounts pa
      WHERE pa.tenant_id='tenant-demo' AND (
        ROUND(pa.balance * 100) != ROUND(((SELECT COALESCE(SUM(p.amount),0) FROM finance_payments p WHERE p.tenant_id=pa.tenant_id AND p.apartment_id=pa.apartment_id) -
          (SELECT COALESCE(SUM(c.amount),0) FROM finance_charges c WHERE c.tenant_id=pa.tenant_id AND c.apartment_id=pa.apartment_id)) * 100)
        OR pa.last_payment_date IS NOT (SELECT MAX(p.payment_date) FROM finance_payments p WHERE p.tenant_id=pa.tenant_id AND p.apartment_id=pa.apartment_id)
      )
    `)[0].count).toBe(0);
    expect(rows(dbPath, `SELECT COUNT(*) count FROM apartments WHERE tenant_id='tenant-demo' AND id!='apartment-other-demo' AND personal_account_id IS NOT NULL`)[0].count).toBe(6);

    expect(rows(dbPath, `SELECT enabled,daily_rate,grace_days,max_multiplier FROM finance_penalty_settings WHERE tenant_id='tenant-demo'`)).toEqual([
      { enabled: 1, daily_rate: 0.001, grace_days: 30, max_multiplier: 1 },
    ]);
    const penalty = rows(dbPath, `SELECT principal_amount,days_overdue,penalty_amount,status FROM finance_penalties WHERE tenant_id='tenant-demo'`)[0];
    expect(penalty.status).toBe('accrued');
    expect(penalty.days_overdue).toBe(30);
    expect(penalty.penalty_amount).toBe(Math.round(penalty.principal_amount * 0.001 * 30 * 100) / 100);
    expect(rows(dbPath, `SELECT claim_type,COUNT(*) count FROM finance_claims WHERE tenant_id='tenant-demo' GROUP BY claim_type ORDER BY claim_type`)).toEqual([
      { claim_type: 'pretension', count: 1 }, { claim_type: 'reconciliation', count: 1 },
    ]);
    expect(rows(dbPath, `SELECT access_level,user_id,granted_by FROM finance_access WHERE tenant_id='tenant-demo'`)).toEqual([
      { access_level: 'full', user_id: 'manager-demo', granted_by: 'director-demo' },
    ]);
    expect(rows(dbPath, `SELECT COUNT(*) count FROM finance_fact_reports WHERE tenant_id='tenant-demo'`)[0].count).toBe(0);

    expect(rows(dbPath, `SELECT paid_amount,status FROM finance_charges WHERE id='existing-demo-charge'`)).toEqual([{ paid_amount: 1.11, status: 'partial' }]);
    expect(rows(dbPath, `SELECT paid_amount,status FROM finance_charges WHERE id='existing-seeded-apartment-charge'`)).toEqual([{ paid_amount: 5, status: 'overdue' }]);
    expect(rows(dbPath, `SELECT amount,receipt_number FROM finance_payments WHERE id='other-payment'`)).toEqual([{ amount: 10, receipt_number: 'OTHER-001' }]);
    expect(rows(dbPath, `SELECT balance FROM personal_accounts WHERE id='other-account'`)).toEqual([{ balance: 77.77 }]);

    const complex = computeComplexEstimate({
      model: 'TARIFF_CALCULATED',
      object: { profit_rate: 0.1, payroll_tax_rate: 0.24, periodic_enabled: true },
      buildings: [
        { building_id: (await demoId('tenant-demo', 'building:caravan')), residential_area: 10840 },
        { building_id: (await demoId('tenant-demo', 'building:mirzo')), residential_area: 8760 },
      ],
      staff: [
        { title: 'Управляющий объектом', units: 1, salary: 8500000, vacation_days: 24 },
        { title: 'Инженер', units: 1, salary: 7200000, vacation_days: 24 },
        { title: 'Сантехник', units: 1, salary: 5600000, vacation_days: 21 },
        { title: 'Электрик', units: 1, salary: 5900000, vacation_days: 21 },
      ],
      expenses: [
        { name: 'Фонд оплаты труда', monthly: 0, linked_to_staff: true, section: 'production', unit: 'staff_computed' },
        { name: 'Уборка общих зон', monthly: 4730000, section: 'production', unit: 'per_sqm' },
        { name: 'Обслуживание лифтов', monthly: 2860000, section: 'production', unit: 'flat', building_id: await demoId('tenant-demo', 'building:caravan') },
        { name: 'Видеонаблюдение', monthly: 3415000, section: 'production', unit: 'per_apt', building_id: await demoId('tenant-demo', 'building:mirzo') },
        { name: 'Освещение общих зон', monthly: 2275000, section: 'production', unit: 'per_meter' },
        { name: 'Сезонная подготовка', monthly: 1365000, section: 'periodic', unit: 'flat', building_id: await demoId('tenant-demo', 'building:caravan') },
        { name: 'Уход за территорией', monthly: 1785000, section: 'production', unit: 'per_sqm', building_id: await demoId('tenant-demo', 'building:mirzo') },
        { name: 'Хозяйственные материалы', monthly: 935000, section: 'production', unit: 'flat' },
      ],
      incomes: [
        { type: 'commercial', monthly: 4850000, building_id: await demoId('tenant-demo', 'building:caravan') },
        { type: 'parking', monthly: 2675000, building_id: await demoId('tenant-demo', 'building:mirzo') },
      ],
    });
    const buildingTariffs = new Map(complex.buildings.map((building) => [building.building_id, building.tariff_effective]));
    const generatedCharges = rows(dbPath, `
      SELECT c.amount,c.area_sqm,c.rate_per_sqm,c.property_type,a.building_id,a.is_commercial,a.is_basement,a.is_parking
      FROM finance_charges c JOIN apartments a ON a.id=c.apartment_id AND a.tenant_id=c.tenant_id
      WHERE c.tenant_id='tenant-demo' AND c.estimate_id IS NOT NULL
    `);
    expect(generatedCharges).toHaveLength(6);
    for (const charge of generatedCharges) {
      const expectedRate = buildingTariffs.get(charge.building_id)!;
      expect(charge.is_commercial).toBe(0);
      expect(charge.is_basement).toBe(0);
      expect(charge.is_parking).toBe(0);
      expect(charge.property_type).toBe('non_commercial');
      expect(charge.rate_per_sqm).toBeCloseTo(expectedRate, 8);
      expect(charge.amount).toBe(Math.round(charge.area_sqm * expectedRate * 100) / 100);
      expect(charge.rate_per_sqm).toBeGreaterThan(1500);
      expect(charge.rate_per_sqm).toBeLessThan(5000);
      expect(charge.amount).toBeGreaterThan(25000);
      expect(charge.amount).toBeLessThan(250000);
    }
    const weighted = (field: 'base_per_m2' | 'with_profit_per_m2' | 'telecom_comp_per_m2' | 'tariff_resident') => (
      complex.buildings.reduce((sum, building) => sum + building[field] * building.residential_area, 0) / 19600
    );
    const estimate = rows(dbPath, `
      SELECT total_amount,commercial_rate_per_sqm,uk_profit_percent,enterprise_profit_percent,
        commercial_income,basement_income,parking_income,telecom_income,residential_area,
        payroll_tax_rate,fot_gross,payroll_tax,fot_total,self_cost_resident,
        base_per_m2,with_profit_per_m2,telecom_comp_per_m2,tariff_resident,
        jami_tushum_year,umumiy_year,deficit_year,periodic_enabled
      FROM finance_estimates WHERE tenant_id='tenant-demo'
    `)[0];
    expect(estimate).toEqual({
      total_amount: complex.umumiy_year,
      commercial_rate_per_sqm: weighted('tariff_resident'),
      uk_profit_percent: 10,
      enterprise_profit_percent: 10,
      commercial_income: 4850000,
      basement_income: 0,
      parking_income: 2675000,
      telecom_income: 0,
      residential_area: 19600,
      payroll_tax_rate: 0.24,
      fot_gross: complex.fot_gross,
      payroll_tax: complex.payroll_tax,
      fot_total: complex.fot_total,
      self_cost_resident: complex.buildings.reduce((sum, building) => sum + building.self_cost_resident, 0),
      base_per_m2: weighted('base_per_m2'),
      with_profit_per_m2: weighted('with_profit_per_m2'),
      telecom_comp_per_m2: weighted('telecom_comp_per_m2'),
      tariff_resident: weighted('tariff_resident'),
      jami_tushum_year: complex.jami_tushum_year,
      umumiy_year: complex.umumiy_year,
      deficit_year: complex.deficit_year,
      periodic_enabled: 1,
    });
    expect(rows(dbPath, `SELECT ROUND(SUM(amount),6) total FROM finance_estimate_items WHERE tenant_id='tenant-demo' AND kind='expense'`)[0].total)
      .toBeCloseTo(complex.total_expenses * 12, 6);
    expect(estimate.total_amount).toBeGreaterThan(500000000);
    expect(estimate.total_amount).toBeLessThan(900000000);
    expect(Math.abs(estimate.deficit_year) / estimate.total_amount).toBeLessThan(0.02);
    expect(new Set(generatedCharges.map((charge) => charge.amount)).size).toBe(6);
    expect(new Set(generatedCharges.map((charge) => charge.rate_per_sqm)).size).toBe(2);
    expect(rows(dbPath, `SELECT price_per_unit FROM finance_materials WHERE tenant_id='tenant-demo' ORDER BY price_per_unit`)).toEqual([
      { price_per_unit: 48000 }, { price_per_unit: 165000 },
    ]);
    expect(rows(dbPath, `SELECT amount FROM finance_expenses WHERE tenant_id='tenant-demo' ORDER BY amount`)).toEqual([
      { amount: 2760000 }, { amount: 4850000 },
    ]);
  }, 60_000);

  it.each(['before', 'inside'] as const)(
    'atomically recovers finance charge/payment creation after a %s-batch fault',
    async (fault) => {
      const { provisionDemoFinance } = await loadFinanceModule();
      const batchSizes: number[] = [];
      const failingContext = {
        db: createDb(dbPath, { financeBatchFault: fault, batchSizes }),
        tenantId: 'tenant-demo', tenantSlug: 'demo' as const,
        now: new Date('2026-08-16T12:00:00.000Z'), createPasswordHash: async () => 'unused',
      };

      await expect(provisionDemoFinance(failingContext)).rejects.toThrow(/Injected|injected_finance_failure/);
      expect(rows(dbPath, `SELECT COUNT(*) count FROM finance_charges WHERE tenant_id='tenant-demo' AND estimate_id IS NOT NULL`)[0].count).toBe(0);
      expect(rows(dbPath, `SELECT COUNT(*) count FROM finance_payments WHERE tenant_id='tenant-demo' AND charge_id IS NOT NULL`)[0].count).toBe(0);
      expect(rows(dbPath, `SELECT paid_amount,status FROM finance_charges WHERE id='existing-seeded-apartment-charge'`)).toEqual([
        { paid_amount: 5, status: 'overdue' },
      ]);

      const recoveryBatchSizes: number[] = [];
      await provisionDemoFinance({
        ...failingContext,
        db: createDb(dbPath, { batchSizes: recoveryBatchSizes }),
      });

      expect(rows(dbPath, `SELECT COUNT(*) count FROM finance_charges WHERE tenant_id='tenant-demo' AND estimate_id IS NOT NULL`)[0].count).toBe(6);
      expect(rows(dbPath, `SELECT COUNT(*) count FROM finance_payments WHERE tenant_id='tenant-demo' AND charge_id IS NOT NULL`)[0].count).toBe(4);
      expect(rows(dbPath, `SELECT paid_amount,status FROM finance_charges WHERE id='existing-seeded-apartment-charge'`)).toEqual([
        { paid_amount: 5, status: 'overdue' },
      ]);
      expect([...batchSizes, ...recoveryBatchSizes].every((size) => size <= 100)).toBe(true);
    },
    60_000,
  );

  it('preserves finance lifecycle, payments, and material stock on rerun', async () => {
    const { provisionDemoFinance } = await loadFinanceModule();
    const context = {
      db: createDb(dbPath), tenantId: 'tenant-demo', tenantSlug: 'demo' as const,
      now: new Date('2026-08-16T12:00:00.000Z'), createPasswordHash: async () => 'unused',
    };
    await provisionDemoFinance(context);
    const charge = rows(dbPath, `SELECT id FROM finance_charges WHERE tenant_id='tenant-demo' AND estimate_id IS NOT NULL ORDER BY id LIMIT 1`)[0];
    const payment = rows(dbPath, `SELECT id FROM finance_payments WHERE tenant_id='tenant-demo' AND id LIKE '%-%' AND id NOT LIKE 'existing-%' ORDER BY id LIMIT 1`)[0];
    const material = rows(dbPath, `SELECT id FROM finance_materials WHERE tenant_id='tenant-demo' ORDER BY id LIMIT 1`)[0];
    const estimate = rows(dbPath, `SELECT id FROM finance_estimates WHERE tenant_id='tenant-demo'`)[0];
    const penalty = rows(dbPath, `SELECT id FROM finance_penalties WHERE tenant_id='tenant-demo'`)[0];
    const staff = rows(dbPath, `SELECT id FROM finance_estimate_staff WHERE tenant_id='tenant-demo' ORDER BY id LIMIT 1`)[0];
    const item = rows(dbPath, `SELECT id FROM finance_estimate_items WHERE tenant_id='tenant-demo' AND kind='expense' ORDER BY id LIMIT 1`)[0];
    run(dbPath, `
      UPDATE finance_estimates SET status='archived',total_amount=12345,tariff_resident=77
        WHERE id=${quote(estimate.id)} AND tenant_id='tenant-demo';
      UPDATE finance_charges SET status='overdue',paid_amount=12.34,amount=10,rate_per_sqm=10 WHERE id=${quote(charge.id)} AND tenant_id='tenant-demo';
      UPDATE finance_payments SET amount=123.45,description='Accountant corrected receipt'
        WHERE id=${quote(payment.id)} AND tenant_id='tenant-demo';
      UPDATE finance_penalties SET status='waived',paid_amount=7.25,waived_reason='Director decision'
        WHERE id=${quote(penalty.id)} AND tenant_id='tenant-demo';
      UPDATE finance_materials SET quantity=3.5 WHERE id=${quote(material.id)} AND tenant_id='tenant-demo';
      UPDATE finance_estimate_staff SET salary=123,monthly=123,vacation_days=7
        WHERE id=${quote(staff.id)} AND tenant_id='tenant-demo';
      UPDATE finance_estimate_items SET amount=456,monthly_amount=38
        WHERE id=${quote(item.id)} AND tenant_id='tenant-demo';
    `);
    const before = {
      estimate: rows(dbPath, `SELECT status,total_amount,tariff_resident FROM finance_estimates WHERE id=${quote(estimate.id)}`),
      charge: rows(dbPath, `SELECT status,paid_amount FROM finance_charges WHERE id=${quote(charge.id)}`),
      payment: rows(dbPath, `SELECT amount,description FROM finance_payments WHERE id=${quote(payment.id)}`),
      penalty: rows(dbPath, `SELECT status,paid_amount,waived_reason FROM finance_penalties WHERE id=${quote(penalty.id)}`),
      material: rows(dbPath, `SELECT quantity FROM finance_materials WHERE id=${quote(material.id)}`),
      staff: rows(dbPath, `SELECT salary,monthly,vacation_days FROM finance_estimate_staff WHERE id=${quote(staff.id)}`),
      item: rows(dbPath, `SELECT amount,monthly_amount FROM finance_estimate_items WHERE id=${quote(item.id)}`),
    };

    await provisionDemoFinance(context);

    expect(rows(dbPath, `SELECT status,total_amount,tariff_resident FROM finance_estimates WHERE id=${quote(estimate.id)}`)).toEqual(before.estimate);
    expect(rows(dbPath, `SELECT status,paid_amount FROM finance_charges WHERE id=${quote(charge.id)}`)).toEqual(before.charge);
    expect(rows(dbPath, `SELECT amount,rate_per_sqm FROM finance_charges WHERE id=${quote(charge.id)}`)[0]).not.toEqual({ amount: 10, rate_per_sqm: 10 });
    expect(rows(dbPath, `SELECT amount,description FROM finance_payments WHERE id=${quote(payment.id)}`)).toEqual(before.payment);
    expect(rows(dbPath, `SELECT status,paid_amount,waived_reason FROM finance_penalties WHERE id=${quote(penalty.id)}`)).toEqual(before.penalty);
    expect(rows(dbPath, `SELECT quantity FROM finance_materials WHERE id=${quote(material.id)}`)).toEqual(before.material);
    expect(rows(dbPath, `SELECT salary,monthly,vacation_days FROM finance_estimate_staff WHERE id=${quote(staff.id)}`)).toEqual(before.staff);
    expect(rows(dbPath, `SELECT amount,monthly_amount FROM finance_estimate_items WHERE id=${quote(item.id)}`)).toEqual(before.item);
  }, 60_000);

  it('rejects any tenant slug other than demo before writing finance rows', async () => {
    const { provisionDemoFinance } = await loadFinanceModule();
    await expect(provisionDemoFinance({
      db: createDb(dbPath), tenantId: 'tenant-other', tenantSlug: 'other' as 'demo',
      now: new Date('2026-08-16T12:00:00.000Z'), createPasswordHash: async () => 'unused',
    })).rejects.toThrow('exact demo slug');
    expect(rows(dbPath, `SELECT COUNT(*) count FROM finance_estimates`)[0].count).toBe(0);
  });

  it('rejects canonical building-area drift before creating finance rows', async () => {
    const { provisionDemoFinance } = await loadFinanceModule();
    const caravanId = await demoId('tenant-demo', 'building:caravan');
    run(dbPath, `UPDATE buildings SET total_area=108,residential_area=108 WHERE id=${quote(caravanId)} AND tenant_id='tenant-demo'`);

    await expect(provisionDemoFinance({
      db: createDb(dbPath), tenantId: 'tenant-demo', tenantSlug: 'demo',
      now: new Date('2026-08-16T12:00:00.000Z'), createPasswordHash: async () => 'unused',
    })).rejects.toThrow('canonical building area mismatch');
    expect(rows(dbPath, `SELECT COUNT(*) count FROM finance_estimates WHERE tenant_id='tenant-demo'`)[0].count).toBe(0);
  }, 60_000);
});
