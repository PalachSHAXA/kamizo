import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error Worker tsconfig intentionally omits Node types.
import { execFileSync } from 'node:child_process';
// @ts-expect-error Worker tsconfig intentionally omits Node types.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
// @ts-expect-error Worker tsconfig intentionally omits Node types.
import { tmpdir } from 'node:os';
// @ts-expect-error Worker tsconfig intentionally omits Node types.
import { join } from 'node:path';

import { provisionDemoPhases } from '../provision';

declare global {
  interface ImportMeta {
    readonly url: string;
  }
}

const productionSchema = readFileSync(new URL('./fixtures/demo-production-schema.sql', import.meta.url), 'utf8');

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

function createDb(dbPath: string): D1Database {
  const prepare = (sql: string) => {
    let params: unknown[] = [];
    const statement = {
      bind(...values: unknown[]) { params = values; return statement; },
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
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    },
  } as unknown as D1Database;
}

function run(dbPath: string, sql: string): void {
  execFileSync('sqlite3', [dbPath], { input: sql });
}

function rows(dbPath: string, sql: string): any[] {
  return sqliteJson(dbPath, sql);
}

const allTables = [
  'users', 'buildings', 'entrances', 'apartments', 'categories', 'requests', 'meetings',
  'meeting_agenda_items', 'meeting_eligible_voters', 'meeting_participated_voters',
  'meeting_vote_records', 'meeting_protocols', 'announcements', 'chat_channels', 'chat_messages',
  'marketplace_categories', 'marketplace_products', 'marketplace_orders', 'marketplace_order_items',
  'marketplace_order_history', 'marketplace_favorites', 'marketplace_reviews', 'ad_categories', 'ads',
  'rental_apartments', 'rental_records', 'rental_listings', 'rental_listing_photos', 'vehicles',
  'guest_access_codes', 'guest_access_logs', 'finance_estimates', 'finance_estimate_buildings',
  'finance_estimate_staff', 'finance_estimate_items', 'finance_charges', 'finance_payments',
  'personal_accounts', 'finance_penalty_settings', 'finance_penalties', 'finance_income_categories',
  'finance_income', 'finance_expenses', 'finance_materials', 'finance_material_usage',
  'finance_access', 'finance_claims', 'training_partners', 'training_proposals', 'training_votes',
  'training_registrations', 'training_feedback', 'training_notifications', 'employee_ratings', 'notes',
] as const;

function tenantCounts(dbPath: string): Record<string, number> {
  return Object.fromEntries(allTables.map((table) => [
    table,
    Number(rows(dbPath, `SELECT COUNT(*) count FROM ${table} WHERE tenant_id='tenant-demo'`)[0]?.count ?? 0),
  ]));
}

describe('provisionDemoPhases combined SQLite integration', () => {
  let directory: string;
  let dbPath: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'kamizo-demo-all-'));
    dbPath = join(directory, 'fixture.db');
    run(dbPath, productionSchema + `
      INSERT INTO tenants (id,name,slug,url,plan,features,is_active,is_demo)
      VALUES ('tenant-demo','Kamizo Demo','demo','https://demo.kamizo.uz','enterprise','["requests"]',1,0),
             ('tenant-other','Other','other','https://other.kamizo.uz','basic','["requests"]',1,0);
      INSERT INTO users (id,login,password_hash,name,role,is_active,tenant_id,apartment,total_area)
      VALUES ('director-existing','demo-director','director-original-hash','Existing Director','director',1,'tenant-demo',NULL,NULL),
             ('admin-existing','demo-director-admin','admin-original-hash','Existing Admin','admin',1,'tenant-demo',NULL,NULL),
             ('resident-primary','98765432','resident-original-hash','Primary Resident','resident',1,'tenant-demo','49',49),
             ('resident-secondary','98765417','secondary-original-hash','Second Resident','resident',1,'tenant-demo','17',17),
             ('other-manager','demo-manager','other-original-hash','Other Manager','manager',1,'tenant-other',NULL,NULL);
    `);
  });

  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it('provisions all phases twice with stable exact counts and valid cross-domain accounting', async () => {
    const context = {
      db: createDb(dbPath), tenantId: 'tenant-demo', tenantSlug: 'demo' as const,
      now: new Date('2026-08-16T12:00:00.000Z'), createPasswordHash: async () => 'new-inaccessible-hash',
    };

    const first = await provisionDemoPhases(context, ['core', 'commerce', 'finance', 'engagement']);
    const countsAfterFirst = tenantCounts(dbPath);
    const second = await provisionDemoPhases(context, ['core', 'commerce', 'finance', 'engagement']);

    expect(first.results.map((result) => result.phase)).toEqual(['core', 'commerce', 'finance', 'engagement']);
    expect(Object.values(second.counters).every((counter) => counter.created === 0)).toBe(true);
    expect(tenantCounts(dbPath)).toEqual(countsAfterFirst);
    expect(countsAfterFirst).toMatchObject({
      users: 15, buildings: 2, requests: 7, meetings: 2, meeting_vote_records: 6,
      marketplace_products: 8, marketplace_orders: 6, marketplace_order_history: 22, rental_listings: 5,
      rental_listing_photos: 15, guest_access_codes: 5, finance_estimates: 1,
      finance_estimate_items: 10, finance_charges: 6, finance_payments: 4,
      personal_accounts: 6, finance_claims: 2,
      training_partners: 2, training_proposals: 3, training_votes: 4,
      training_registrations: 4, training_feedback: 2, employee_ratings: 5, notes: 9,
    });
    expect(rows(dbPath, `SELECT login,password_hash FROM users WHERE id IN ('director-existing','admin-existing','resident-primary') ORDER BY login`)).toEqual([
      { login: '98765432', password_hash: 'resident-original-hash' },
      { login: 'demo-director', password_hash: 'director-original-hash' },
      { login: 'demo-director-admin', password_hash: 'admin-original-hash' },
    ]);
    expect(rows(dbPath, `SELECT role,specialization FROM users WHERE tenant_id='tenant-demo' AND login='demo-courier'`)).toEqual([
      { role: 'executor', specialization: 'courier' },
    ]);
    expect(rows(dbPath, `
      SELECT COUNT(*) count FROM buildings b
      JOIN finance_estimate_buildings eb ON eb.building_id=b.id AND eb.tenant_id=b.tenant_id
      WHERE b.tenant_id='tenant-demo'
        AND (b.total_area!=b.residential_area OR b.total_area!=eb.residential_area)
    `)[0].count).toBe(0);
    expect(rows(dbPath, `
      SELECT COUNT(*) count FROM meetings m
      JOIN buildings b ON b.id=m.building_id AND b.tenant_id=m.tenant_id
      WHERE m.tenant_id='tenant-demo' AND (
        m.total_area!=b.total_area OR m.voted_area>m.total_area
        OR m.total_eligible_count<m.participated_count
        OR ABS(m.participation_percent-ROUND(m.voted_area*100.0/m.total_area,2))>0.001
        OR m.quorum_reached!=(CASE WHEN m.voted_area*100.0/m.total_area>=m.quorum_percent THEN 1 ELSE 0 END)
      )
    `)[0].count).toBe(0);
    expect(rows(dbPath, `
      SELECT COUNT(*) count FROM meeting_agenda_items a
      JOIN meetings m ON m.id=a.meeting_id AND m.tenant_id=a.tenant_id
      WHERE a.tenant_id='tenant-demo'
        AND a.votes_for_area+a.votes_against_area+a.votes_abstain_area!=m.voted_area
    `)[0].count).toBe(0);
    expect(rows(dbPath, `
      SELECT COUNT(*) count FROM meetings m
      WHERE m.tenant_id='tenant-demo' AND (
        (SELECT COUNT(*) FROM meeting_eligible_voters e WHERE e.meeting_id=m.id AND e.tenant_id=m.tenant_id)>=m.total_eligible_count
        OR (SELECT COALESCE(MAX(sample_area),0) FROM (
          SELECT SUM(v.vote_weight) sample_area FROM meeting_vote_records v
          WHERE v.meeting_id=m.id AND v.tenant_id=m.tenant_id GROUP BY v.agenda_item_id
        ))>=m.voted_area
      )
    `)[0].count).toBe(0);
    expect(rows(dbPath, `
      SELECT COUNT(*) count FROM apartments a
      JOIN finance_charges c ON c.apartment_id=a.id AND c.tenant_id=a.tenant_id AND c.estimate_id IS NOT NULL
      WHERE a.tenant_id='tenant-demo' AND (
        a.is_commercial!=0 OR a.is_basement!=0 OR a.is_parking!=0
        OR a.property_type!='non_commercial' OR c.property_type!='non_commercial'
      )
    `)[0].count).toBe(0);
    expect(rows(dbPath, `
      SELECT COUNT(*) count FROM marketplace_orders o
      JOIN users u ON u.id=o.executor_id AND u.tenant_id=o.tenant_id
      WHERE o.tenant_id='tenant-demo' AND (u.role!='executor' OR u.specialization!='courier')
    `)[0].count).toBe(0);
    expect(rows(dbPath, `
      SELECT COUNT(*) count FROM finance_charges c
      WHERE c.tenant_id='tenant-demo' AND ROUND(c.paid_amount * 100) != MIN(
        ROUND(c.amount * 100),
        ROUND(COALESCE((SELECT SUM(p.amount) FROM finance_payments p
          WHERE p.tenant_id=c.tenant_id AND p.apartment_id=c.apartment_id),0) * 100)
      )
    `)[0].count).toBe(0);
    expect(rows(dbPath, `
      SELECT COUNT(*) count FROM finance_material_usage mu
      LEFT JOIN finance_materials m ON m.id=mu.material_id AND m.tenant_id=mu.tenant_id
      LEFT JOIN requests r ON r.id=mu.request_id AND r.tenant_id=mu.tenant_id
      WHERE mu.tenant_id='tenant-demo' AND (m.id IS NULL OR r.id IS NULL)
    `)[0].count).toBe(0);
  }, 60_000);
});
