import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error Worker tsconfig intentionally omits Node types.
import { execFileSync } from 'node:child_process';
// @ts-expect-error Worker tsconfig intentionally omits Node types.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
// @ts-expect-error Worker tsconfig intentionally omits Node types.
import { tmpdir } from 'node:os';
// @ts-expect-error Worker tsconfig intentionally omits Node types.
import { join } from 'node:path';

import { demoEngagementSeeder, provisionDemoEngagement } from '../engagement';
import { demoId } from '../ids';

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

function rows(dbPath: string, sql: string): any[] {
  const output = execFileSync('sqlite3', ['-json', dbPath, sql], { encoding: 'utf8' }).trim();
  return output ? JSON.parse(output) : [];
}

function run(dbPath: string, sql: string): void {
  execFileSync('sqlite3', [dbPath], { input: sql });
}

function createDb(dbPath: string): D1Database {
  const prepare = (sql: string) => {
    let params: unknown[] = [];
    const statement = {
      bind(...values: unknown[]) { params = values; return statement; },
      async first() { return rows(dbPath, bindSql(sql, params))[0] ?? null; },
      async all() { return { results: rows(dbPath, bindSql(sql, params)), success: true, meta: {} }; },
      async run() {
        const result = rows(dbPath, `${bindSql(sql, params)}; SELECT changes() changes;`);
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

const countSql = `
  SELECT 'trainingPartners' entity,COUNT(*) count FROM training_partners WHERE tenant_id='tenant-demo'
  UNION ALL SELECT 'trainingProposals',COUNT(*) FROM training_proposals WHERE tenant_id='tenant-demo'
  UNION ALL SELECT 'trainingVotes',COUNT(*) FROM training_votes WHERE tenant_id='tenant-demo'
  UNION ALL SELECT 'trainingRegistrations',COUNT(*) FROM training_registrations WHERE tenant_id='tenant-demo'
  UNION ALL SELECT 'trainingFeedback',COUNT(*) FROM training_feedback WHERE tenant_id='tenant-demo'
  UNION ALL SELECT 'employeeRatings',COUNT(*) FROM employee_ratings WHERE tenant_id='tenant-demo'
  UNION ALL SELECT 'notes',COUNT(*) FROM notes WHERE tenant_id='tenant-demo'
`;

describe('provisionDemoEngagement SQLite integration', () => {
  let directory: string;
  let dbPath: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'kamizo-demo-engagement-'));
    dbPath = join(directory, 'fixture.db');
    run(dbPath, schema + `
      INSERT INTO tenants (id,name,slug,url) VALUES
        ('tenant-demo','Demo','demo','https://demo.kamizo.uz'),
        ('tenant-other','Other','other','https://other.kamizo.uz');
      INSERT INTO users (id,login,password_hash,name,role,specialization,tenant_id) VALUES
        ('director-demo','demo-director','director-hash','Demo Director','director',NULL,'tenant-demo'),
        ('manager-demo','demo-manager','manager-hash','Demo Manager','manager',NULL,'tenant-demo'),
        ('resident-demo','98765432','resident-hash','Demo Resident','resident',NULL,'tenant-demo'),
        ('executor-demo','demo-executor','executor-hash','Demo Plumber','executor','plumber','tenant-demo'),
        ('electrician-demo','demo-electrician','electrician-hash','Demo Electrician','executor','electrician','tenant-demo'),
        ('head-demo','demo-dept-head','head-hash','Demo Head','department_head','plumber','tenant-demo'),
        ('other-executor','other-executor','other-hash','Other Executor','executor','plumber','tenant-other');
      INSERT INTO employee_ratings (id,executor_id,rating,comment,rated_by,tenant_id)
      VALUES ('other-rating','other-executor',2,'Other private comment','other-executor','tenant-other');
      INSERT INTO notes (id,user_id,title,content,tenant_id)
      VALUES ('other-note','other-executor','Other note','Other private content','tenant-other');
    `);
  });

  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it('seeds coherent relative engagement data and remains stable on an unchanged rerun', async () => {
    const context = {
      db: createDb(dbPath), tenantId: 'tenant-demo', tenantSlug: 'demo' as const,
      now: new Date('2026-08-18T12:00:00.000Z'), createPasswordHash: async () => 'unused',
    };

    const first = await provisionDemoEngagement(context);
    const afterFirst = rows(dbPath, countSql);
    const second = await demoEngagementSeeder.seed(context);

    expect(first.phase).toBe('engagement');
    expect(demoEngagementSeeder.phase).toBe('engagement');
    expect(first.counters).toMatchObject({
      trainingPartners: { created: 2 }, trainingProposals: { created: 3 },
      trainingVotes: { created: 4 }, trainingRegistrations: { created: 4 },
      trainingFeedback: { created: 2 }, employeeRatings: { created: 5 }, notes: { created: 9 },
    });
    expect(Object.values(second.counters).every((counter) => counter.created === 0)).toBe(true);
    expect(rows(dbPath, countSql)).toEqual(afterFirst);
    expect(rows(dbPath, `SELECT status,start_date,end_date FROM training_proposals WHERE tenant_id='tenant-demo' ORDER BY start_date`)).toEqual([
      { status: 'completed', start_date: '2026-07-29T12:00:00.000Z', end_date: '2026-07-29T14:00:00.000Z' },
      { status: 'scheduled', start_date: '2026-08-25T12:00:00.000Z', end_date: '2026-08-25T14:00:00.000Z' },
      { status: 'pending', start_date: '2026-09-01T12:00:00.000Z', end_date: '2026-09-01T14:00:00.000Z' },
    ]);
    expect(rows(dbPath, `SELECT user_id,COUNT(*) count FROM notes WHERE tenant_id='tenant-demo' GROUP BY user_id ORDER BY user_id`)).toEqual([
      { user_id: 'director-demo', count: 3 }, { user_id: 'executor-demo', count: 3 }, { user_id: 'manager-demo', count: 3 },
    ]);
  });

  it('repairs missing deterministic rows without resetting lifecycle, passwords, privacy, or other tenants', async () => {
    const context = {
      db: createDb(dbPath), tenantId: 'tenant-demo', tenantSlug: 'demo' as const,
      now: new Date('2026-08-18T12:00:00.000Z'), createPasswordHash: async () => 'unused',
    };
    await provisionDemoEngagement(context);
    const [proposalId, voteId, ratingId, noteId] = await Promise.all([
      demoId('tenant-demo', 'training:proposal:scheduled'),
      demoId('tenant-demo', 'training:vote:scheduled:resident'),
      demoId('tenant-demo', 'employee-rating:executor:resident'),
      demoId('tenant-demo', 'note:manager:1'),
    ]);
    const otherRatingsBefore = rows(dbPath, `SELECT * FROM employee_ratings WHERE tenant_id='tenant-other'`);
    const otherNotesBefore = rows(dbPath, `SELECT * FROM notes WHERE tenant_id='tenant-other'`);
    run(dbPath, `
      UPDATE training_proposals SET status='cancelled',location='User changed location' WHERE id=${quote(proposalId)};
      UPDATE employee_ratings SET rating=3,comment='User changed rating' WHERE id=${quote(ratingId)};
      UPDATE notes SET title='User title',content='User content' WHERE id=${quote(noteId)};
      DELETE FROM training_votes WHERE id=${quote(voteId)};
    `);

    const rerun = await provisionDemoEngagement(context);

    expect(rerun.counters.trainingVotes.created).toBe(1);
    expect(rows(dbPath, `SELECT status,location FROM training_proposals WHERE id=${quote(proposalId)}`)).toEqual([
      { status: 'cancelled', location: 'User changed location' },
    ]);
    expect(rows(dbPath, `SELECT rating,comment FROM employee_ratings WHERE id=${quote(ratingId)}`)).toEqual([
      { rating: 3, comment: 'User changed rating' },
    ]);
    expect(rows(dbPath, `SELECT title,content FROM notes WHERE id=${quote(noteId)}`)).toEqual([
      { title: 'User title', content: 'User content' },
    ]);
    expect(rows(dbPath, `SELECT login,password_hash FROM users WHERE tenant_id='tenant-demo' ORDER BY login`)).toEqual([
      { login: '98765432', password_hash: 'resident-hash' },
      { login: 'demo-dept-head', password_hash: 'head-hash' },
      { login: 'demo-director', password_hash: 'director-hash' },
      { login: 'demo-electrician', password_hash: 'electrician-hash' },
      { login: 'demo-executor', password_hash: 'executor-hash' },
      { login: 'demo-manager', password_hash: 'manager-hash' },
    ]);
    expect(rows(dbPath, `SELECT * FROM employee_ratings WHERE tenant_id='tenant-other'`)).toEqual(otherRatingsBefore);
    expect(rows(dbPath, `SELECT * FROM notes WHERE tenant_id='tenant-other'`)).toEqual(otherNotesBefore);
  });
});
