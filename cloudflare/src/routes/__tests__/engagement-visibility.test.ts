import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error Worker tsconfig intentionally omits Node types.
import { execFileSync } from 'node:child_process';
// @ts-expect-error Worker tsconfig intentionally omits Node types.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
// @ts-expect-error Worker tsconfig intentionally omits Node types.
import { tmpdir } from 'node:os';
// @ts-expect-error Worker tsconfig intentionally omits Node types.
import { join } from 'node:path';

type Handler = (request: Request, env: any, params: Record<string, string>) => Promise<Response>;

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  user: { id: 'manager-demo', login: 'demo-manager', name: 'Demo Manager', role: 'manager' } as any,
}));

vi.mock('../../router', () => ({
  route: (method: string, path: string, handler: Handler) => mocks.handlers.set(`${method} ${path}`, handler),
}));
vi.mock('../../middleware/auth', () => ({ getUser: vi.fn(async () => mocks.user) }));
vi.mock('../../middleware/tenant', () => ({
  getTenantId: vi.fn(() => 'tenant-demo'),
  requireFeature: vi.fn(async () => ({ allowed: true })),
}));
vi.mock('../../cache', () => ({ invalidateOnChange: vi.fn(async () => undefined) }));
vi.mock('../../utils/logger', () => ({
  createRequestLogger: vi.fn(() => ({ warn: vi.fn(), error: vi.fn() })),
}));
vi.mock('../../index', () => ({ isExecutorRole: (role: string) => role === 'executor' }));

import { provisionDemoEngagement } from '../../lib/demo/engagement';
import { registerTrainingRoutes } from '../training';
import { registerNotesRoutes } from '../misc/notes';
import { registerExecutorRoutes } from '../users/executors';

const schema = readFileSync(new URL('../../lib/demo/__tests__/fixtures/demo-production-schema.sql', import.meta.url), 'utf8');

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
        const result = sqliteJson(dbPath, `${bindSql(sql, params)}; SELECT changes() changes;`);
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

function request(path: string): Request {
  return new Request(`https://demo.kamizo.uz${path}`);
}

function handler(method: string, path: string): Handler {
  const registered = mocks.handlers.get(`${method} ${path}`);
  if (!registered) throw new Error(`Missing route ${method} ${path}`);
  return registered;
}

describe('seeded engagement route visibility', () => {
  let directory: string;
  let dbPath: string;
  let db: D1Database;

  beforeEach(async () => {
    mocks.handlers.clear();
    mocks.user = { id: 'manager-demo', login: 'demo-manager', name: 'Demo Manager', role: 'manager' };
    registerTrainingRoutes();
    registerExecutorRoutes();
    registerNotesRoutes();
    directory = mkdtempSync(join(tmpdir(), 'kamizo-engagement-routes-'));
    dbPath = join(directory, 'fixture.db');
    run(dbPath, schema + `
      INSERT INTO tenants (id,name,slug,url,features) VALUES
        ('tenant-demo','Demo','demo','https://demo.kamizo.uz','["trainings","colleagues","notepad"]');
      INSERT INTO users (id,login,password_hash,name,role,specialization,tenant_id) VALUES
        ('director-demo','demo-director','hash','Demo Director','director',NULL,'tenant-demo'),
        ('manager-demo','demo-manager','hash','Demo Manager','manager',NULL,'tenant-demo'),
        ('resident-demo','98765432','hash','Demo Resident','resident',NULL,'tenant-demo'),
        ('executor-demo','demo-executor','hash','Demo Plumber','executor','plumber','tenant-demo'),
        ('electrician-demo','demo-electrician','hash','Demo Electrician','executor','electrician','tenant-demo'),
        ('head-demo','demo-dept-head','hash','Demo Head','department_head','plumber','tenant-demo');
    `);
    db = createDb(dbPath);
    await provisionDemoEngagement({
      db, tenantId: 'tenant-demo', tenantSlug: 'demo',
      now: new Date('2026-08-18T12:00:00.000Z'), createPasswordHash: async () => 'unused',
    });
  });

  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it('projects seeded live-schema training rows into the current page contract', async () => {
    const response = await handler('GET', '/api/training/proposals')(
      request('/api/training/proposals'), { DB: db }, {},
    );
    const body = await response.json() as any;

    expect(response.status).toBe(200);
    expect(body.proposals).toHaveLength(3);
    expect(body.proposals.map((proposal: any) => proposal.topic)).toEqual(expect.arrayContaining([
      'Коммуникация с жильцами без конфликтов',
      'Безопасная работа с электрооборудованием',
      'Плановое обслуживание инженерных систем',
    ]));
    const completed = body.proposals.find((proposal: any) => proposal.status === 'completed');
    expect(completed).toMatchObject({ partner_name: 'Kamizo Service Academy', format: 'offline' });
    expect(completed.votes).toHaveLength(2);
    expect(completed.registrations).toHaveLength(2);
    expect(completed.feedback).toHaveLength(2);
  });

  it('returns stable defaults without querying the absent training settings table', async () => {
    const response = await handler('GET', '/api/training/settings')(
      request('/api/training/settings'), { DB: db }, {},
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ settings: {
      vote_threshold: 5,
      allow_anonymous_proposals: true,
      allow_anonymous_votes: true,
      allow_anonymous_feedback: true,
      notify_all_on_new_proposal: false,
      auto_close_after_days: 30,
    } });
  });

  it('uses persisted employee ratings for the visible executor leaderboard', async () => {
    const response = await handler('GET', '/api/executors')(
      request('/api/executors?all=true'), { DB: db }, {},
    );
    const body = await response.json() as any;

    expect(response.status).toBe(200);
    expect(body.executors.map((executor: any) => ({ name: executor.name, rating: executor.rating }))).toEqual([
      { name: 'Demo Electrician', rating: 4.5 },
      { name: 'Demo Plumber', rating: 4.7 },
    ]);
  });

  it('keeps seeded notes private to the authenticated user', async () => {
    const managerResponse = await handler('GET', '/api/notes')(request('/api/notes'), { DB: db }, {});
    expect((await managerResponse.json() as any).notes).toHaveLength(3);

    mocks.user = { id: 'resident-demo', login: '98765432', name: 'Demo Resident', role: 'resident' };
    const residentResponse = await handler('GET', '/api/notes')(request('/api/notes'), { DB: db }, {});
    expect(await residentResponse.json()).toEqual({ notes: [] });
  });
});
