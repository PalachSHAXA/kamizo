import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (request: Request, env: any, params: Record<string, string>) => Promise<Response>;

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  error: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../../../router', () => ({
  route: (method: string, path: string, handler: Handler) => mocks.handlers.set(`${method} ${path}`, handler),
}));
vi.mock('../../../middleware/auth', () => ({
  getUser: vi.fn(async () => ({
    id: 'resident-1',
    name: 'Resident',
    role: 'resident',
    building_id: 'building-1',
    tenant_id: 'tenant-1',
  })),
}));
vi.mock('../../../middleware/tenant', () => ({
  getTenantId: vi.fn(() => 'tenant-1'),
  requireFeature: vi.fn(async () => ({ allowed: true })),
}));
vi.mock('../../../utils/crypto', () => ({
  verifyJWT: vi.fn(async () => ({ userId: 'resident-1', tenantId: 'tenant-1' })),
}));
vi.mock('../../../utils/logger', () => ({
  createRequestLogger: vi.fn(() => ({ error: mocks.error, warn: mocks.warn, info: vi.fn() })),
}));

import { registerChatReadRoutes } from '../chat-read';
import { registerWebSocketRoutes } from '../websocket';

function createDb() {
  const runs: string[] = [];
  return {
    runs,
    prepare(sql: string) {
      const statement = {
        bind() { return statement; },
        async first() {
          if (sql.includes('FROM chat_channels')) {
            return {
              id: 'channel-1',
              tenant_id: 'tenant-1',
              type: 'private_support',
              resident_id: 'resident-1',
              building_id: 'building-1',
            };
          }
          if (sql.includes('FROM users')) {
            return {
              id: 'resident-1',
              login: 'resident',
              phone: '+998000000000',
              name: 'Resident',
              role: 'resident',
              building_id: 'building-1',
            };
          }
          return null;
        },
        async run() { runs.push(sql); return { success: true }; },
      };
      return statement;
    },
  };
}

beforeEach(() => {
  mocks.handlers.clear();
  mocks.error.mockReset();
  mocks.warn.mockReset();
  registerChatReadRoutes();
  registerWebSocketRoutes();
});

describe('optional CONNECTION_MANAGER binding', () => {
  it('keeps chat read mutations successful and warns when the binding is absent', async () => {
    const db = createDb();
    const env = { DB: db, JWT_SECRET: 'secret' };
    const handler = mocks.handlers.get('POST /api/chat/channels/:id/read');
    if (!handler) throw new Error('Missing chat read route');

    const response = await handler(
      new Request('https://api.kamizo.uz/api/chat/channels/channel-1/read', { method: 'POST' }),
      env,
      { id: 'channel-1' },
    );
    const repeatedResponse = await handler(
      new Request('https://api.kamizo.uz/api/chat/channels/channel-1/read', { method: 'POST' }),
      env,
      { id: 'channel-1' },
    );

    expect(response.status).toBe(200);
    expect(repeatedResponse.status).toBe(200);
    expect(db.runs).toHaveLength(4);
    expect(mocks.error).not.toHaveBeenCalled();
    expect(mocks.warn).toHaveBeenCalledOnce();
    expect(mocks.warn).toHaveBeenCalledWith(
      'Realtime operation skipped: CONNECTION_MANAGER unavailable',
      { operation: 'chat_read' },
    );
  });

  it('preserves chat read broadcasting when the binding is present', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    const get = vi.fn(() => ({ fetch }));
    const idFromName = vi.fn(() => ({ id: 'global' }));
    const handler = mocks.handlers.get('POST /api/chat/channels/:id/read');
    if (!handler) throw new Error('Missing chat read route');

    const response = await handler(
      new Request('https://api.kamizo.uz/api/chat/channels/channel-1/read', { method: 'POST' }),
      {
        DB: createDb(),
        JWT_SECRET: 'secret',
        CONNECTION_MANAGER: { idFromName, get },
      },
      { id: 'channel-1' },
    );

    expect(response.status).toBe(200);
    expect(idFromName).toHaveBeenCalledWith('global');
    expect(get).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
    expect(mocks.warn).not.toHaveBeenCalled();
  });

  it('returns 503 from the websocket endpoint when the binding is absent', async () => {
    const handler = mocks.handlers.get('GET /api/ws');
    if (!handler) throw new Error('Missing websocket route');

    const response = await handler(
      new Request('https://api.kamizo.uz/api/ws?token=valid', {
        headers: { Upgrade: 'websocket' },
      }),
      { DB: createDb(), JWT_SECRET: 'secret' },
      {},
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: 'Realtime service unavailable' });
    expect(mocks.warn).toHaveBeenCalledWith(
      'Realtime operation skipped: CONNECTION_MANAGER unavailable',
      { operation: 'websocket_connect' },
    );
  });

  it('forwards websocket requests when the binding is present', async () => {
    const forwarded = new Response('forwarded', { status: 200 });
    const fetch = vi.fn(async () => forwarded);
    const handler = mocks.handlers.get('GET /api/ws');
    if (!handler) throw new Error('Missing websocket route');

    const response = await handler(
      new Request('https://api.kamizo.uz/api/ws?token=valid', {
        headers: { Upgrade: 'websocket' },
      }),
      {
        DB: createDb(),
        JWT_SECRET: 'secret',
        CONNECTION_MANAGER: {
          idFromName: vi.fn(() => ({ id: 'global' })),
          get: vi.fn(() => ({ fetch })),
        },
      },
      {},
    );

    expect(response).toBe(forwarded);
    expect(fetch).toHaveBeenCalledOnce();
  });
});
