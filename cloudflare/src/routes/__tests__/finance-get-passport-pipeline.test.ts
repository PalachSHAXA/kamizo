// Fix PR-6 pipeline regression test.
//
// До этого fix'а GET /api/finance/estimates/:id возвращал только
// building_name из buildings, а frontend передавал огрызок в PDF-генератор
// (id/name/address/totalArea) — из-за чего renderBuildingPassportHtml
// никогда не рендерил секцию, даже когда паспорт-поля были заполнены в
// БД (миграция 084).
//
// Регресс: если кто-то опять уронит `building_parking_area` etc. из
// SELECT, тест поймает.

import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (request: Request, env: any, params: Record<string, string>) => Promise<Response>;

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  user: { id: 'admin-1', role: 'admin' } as any,
  tenantId: 'tenant-1' as string | null,
}));

vi.mock('../../router', () => ({
  route: (method: string, path: string, handler: Handler) => mocks.handlers.set(`${method} ${path}`, handler),
}));
vi.mock('../../middleware/auth', () => ({ getUser: vi.fn(async () => mocks.user) }));
vi.mock('../../middleware/tenant', () => ({
  getTenantId: vi.fn(() => mocks.tenantId),
  requireFeature: vi.fn(async () => ({ allowed: true })),
}));

import { registerFinanceRoutes } from '../finance';

function makeDb(estimateRow: Record<string, unknown>) {
  const calls: { sql: string; params: unknown[]; method: string }[] = [];
  const prepare = (sql: string) => {
    let params: unknown[] = [];
    const exec = async (method: string) => {
      calls.push({ sql, params, method });
      if (sql.startsWith('SELECT e.*')) return estimateRow;
      if (sql.startsWith('SELECT items.*')) return { results: [] };
      if (sql.startsWith('SELECT * FROM revenue_sources')) return { results: [] };
      if (sql.startsWith('SELECT title, units, salary')) return { results: [] };
      if (sql.startsWith('SELECT number, confirmed_date_time')) return null;
      if (method === 'all') return { results: [] };
      return null;
    };
    return {
      bind: (...args: unknown[]) => { params = args; return { first: () => exec('first'), all: () => exec('all'), run: () => exec('run') }; },
      first: () => exec('first'),
      all: () => exec('all'),
      run: () => exec('run'),
    };
  };
  return { db: { prepare }, calls };
}

beforeEach(() => {
  mocks.handlers.clear();
  registerFinanceRoutes();
});

describe('GET /api/finance/estimates/:id — passport pipeline', () => {
  it('SELECT содержит все паспорт-поля (не только name)', async () => {
    const est = { id: 'est-1', tenant_id: 'tenant-1', building_id: 'b-1' };
    const { db, calls } = makeDb(est);
    const handler = mocks.handlers.get('GET /api/finance/estimates/:id')!;
    await handler(
      new Request('http://localhost/api/finance/estimates/est-1'),
      { DB: db },
      { id: 'est-1' }
    );
    const selectCall = calls.find((c) => c.sql.startsWith('SELECT e.*'))!;
    expect(selectCall).toBeDefined();
    // Регрессионный список — все паспорт-поля должны быть в SELECT.
    for (const field of [
      'b.name                 as building_name',
      'b.address              as building_address',
      'b.floors               as building_floors',
      'b.apartments_count     as building_apartments_count',
      'b.entrances_count      as building_entrances_count',
      'b.year_built           as building_year_built',
      'b.total_area           as building_total_area',
      'b.living_area          as building_living_area',
      'b.heating_type         as building_heating_type',
      'b.has_elevator         as building_has_elevator',
      'b.parking_area         as building_parking_area',
      'b.basement_area        as building_basement_area',
      'b.technical_rooms_area as building_technical_rooms_area',
    ]) {
      expect(selectCall.sql).toContain(field);
    }
  });

  it('response включает building_* поля из строки БД (positive)', async () => {
    const est = {
      id: 'est-1', tenant_id: 'tenant-1', building_id: 'b-1',
      building_name: '93/3',
      building_parking_area: 800,
      building_basement_area: 600,
      building_technical_rooms_area: 250,
      building_year_built: 2015,
    };
    const { db } = makeDb(est);
    const handler = mocks.handlers.get('GET /api/finance/estimates/:id')!;
    const res = await handler(
      new Request('http://localhost/api/finance/estimates/est-1'),
      { DB: db },
      { id: 'est-1' }
    );
    const body = await res.json() as any;
    expect(body.estimate.building_parking_area).toBe(800);
    expect(body.estimate.building_basement_area).toBe(600);
    expect(body.estimate.building_technical_rooms_area).toBe(250);
    expect(body.estimate.building_year_built).toBe(2015);
    expect(body.estimate.building_name).toBe('93/3');
  });

  it('baseline (все passport-поля NULL) → building_* приходят как null (не отсутствуют)', async () => {
    const est = {
      id: 'est-baseline', tenant_id: 'tenant-1', building_id: '',
      building_name: null,
      building_parking_area: null,
      building_basement_area: null,
      building_technical_rooms_area: null,
    };
    const { db } = makeDb(est);
    const handler = mocks.handlers.get('GET /api/finance/estimates/:id')!;
    const res = await handler(
      new Request('http://localhost/api/finance/estimates/est-baseline'),
      { DB: db },
      { id: 'est-baseline' }
    );
    const body = await res.json() as any;
    // NULL приходят как null — helper hasExtendedPassportData вернёт false
    // → секция не рендерится → baseline PDF SHA инвариантен.
    expect(body.estimate.building_parking_area).toBeNull();
    expect(body.estimate.building_basement_area).toBeNull();
    expect(body.estimate.building_technical_rooms_area).toBeNull();
  });
});
