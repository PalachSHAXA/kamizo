import { describe, expect, it, vi } from 'vitest';

type Handler = (request: Request, env: any, params: Record<string, string>) => Promise<Response>;
const handlers = new Map<string, Handler>();

vi.mock('../../../router', () => ({
  route: (method: string, path: string, handler: Handler) => handlers.set(`${method} ${path}`, handler),
}));
vi.mock('../../../middleware/auth', () => ({ getUser: vi.fn(async () => ({ id: 'super-1', role: 'super_admin' })) }));
vi.mock('../../../cache', () => ({ getCacheStats: vi.fn(() => ({})) }));
vi.mock('../../../utils/helpers', () => ({
  json: (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  error: (message: string, status = 400) => new Response(JSON.stringify({ error: message }), { status, headers: { 'Content-Type': 'application/json' } }),
  bilingualError: (message: string, _uz: string, status = 400) => new Response(JSON.stringify({ error: message }), { status }),
  generateId: vi.fn(() => 'generated-id'),
}));
vi.mock('../../../utils/crypto', () => ({ hashPassword: vi.fn(async () => 'hash') }));
vi.mock('../../../index', () => ({ isSuperAdmin: (user: any) => user?.role === 'super_admin' }));

import { registerSeedRoutes } from '../seed';
import { hashPassword } from '../../../utils/crypto';

describe('legacy demo seed route', () => {
  it('retires the generic credential seed in every environment', async () => {
    registerSeedRoutes();
    const route = handlers.get('POST /api/seed');
    if (!route) throw new Error('Generic seed route not registered');
    const prepare = vi.fn(() => { throw new Error('generic seed attempted a database write'); });

    const response = await route(
      new Request('https://api.kamizo.uz/api/seed', { method: 'POST' }),
      { ENVIRONMENT: 'development', DB: { prepare } },
      {},
    );

    expect(response.status).toBe(410);
    expect(prepare).not.toHaveBeenCalled();
    expect(hashPassword).not.toHaveBeenCalled();
  });

  it('returns 410 with the replacement endpoint without touching the database', async () => {
    registerSeedRoutes();
    const route = handlers.get('POST /api/seed-kamizo-demo');
    if (!route) throw new Error('Legacy route not registered');
    const prepare = vi.fn(() => { throw new Error('legacy seed attempted a database write'); });

    const response = await route(
      new Request('https://api.kamizo.uz/api/seed-kamizo-demo', { method: 'POST' }),
      { DB: { prepare } },
      {},
    );
    const body = await response.json() as any;

    expect(response.status).toBe(410);
    expect(body.error).toContain('/api/super-admin/demo/provision');
    expect(prepare).not.toHaveBeenCalled();
  });
});
