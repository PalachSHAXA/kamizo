import { DurableObject } from 'cloudflare:workers';
import productionWorker from '../../../../cloudflare/src/index';
import type { Env } from '../../../../cloudflare/src/types';

const platformFetch = globalThis.fetch.bind(globalThis);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

function assertLocalUrl(url: URL): void {
  if ((url.protocol === 'http:' || url.protocol === 'https:') && !LOCAL_HOSTS.has(url.hostname)) {
    throw new TypeError(`E2E outbound network blocked: ${url.origin}`);
  }
}

function requestSignal(signal?: AbortSignal | null): AbortSignal {
  const timeout = AbortSignal.timeout(5_000);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function isolatedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  let request = new Request(input, init);
  const redirectMode = init.redirect ?? request.redirect;

  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const requestUrl = new URL(request.url);
    assertLocalUrl(requestUrl);
    const response = await platformFetch(request, {
      redirect: 'manual',
      signal: requestSignal(request.signal),
    });
    const location = response.headers.get('location');
    if (!location || !REDIRECT_STATUSES.has(response.status)) return response;

    const target = new URL(location, request.url);
    assertLocalUrl(target);
    if (redirectMode === 'manual') return response;
    if (redirectMode === 'error') throw new TypeError(`Redirect blocked: ${target.href}`);
    if (redirects === 5) throw new TypeError('Too many redirects');

    const switchToGet = response.status === 303
      || ((response.status === 301 || response.status === 302) && request.method === 'POST');
    request = new Request(target, switchToGet ? { method: 'GET', headers: request.headers } : request);
  }

  throw new TypeError('Too many redirects');
}

globalThis.fetch = isolatedFetch as typeof fetch;

interface E2EEnv extends Env {
  CONNECTION_MANAGER: DurableObjectNamespace;
  CONTRACTS_BUCKET: R2Bucket;
  E2E_REDIRECT_ORIGIN?: string;
}

export class E2EConnectionManager extends DurableObject<E2EEnv> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade') === 'websocket') {
      return Response.json({ error: 'WebSocket lifecycle is not modeled by the E2E stub' }, { status: 501 });
    }

    const url = new URL(request.url);
    if (url.pathname === '/reset' && request.method === 'POST') {
      await this.ctx.storage.deleteAll();
      return Response.json({ ok: true });
    }

    if (url.pathname === '/subscribe' && request.method === 'POST') {
      const body = await request.json() as Record<string, unknown>;
      if (![body.tenantId, body.channel, body.userId].every(value => typeof value === 'string' && value.length > 0)) {
        return Response.json({ error: 'tenantId, channel and userId are required' }, { status: 400 });
      }
      const subscriptions = await this.ctx.storage.get<Array<Record<string, string>>>('subscriptions') ?? [];
      const subscription = {
        tenantId: body.tenantId as string,
        channel: body.channel as string,
        userId: body.userId as string,
      };
      if (!subscriptions.some(item => item.tenantId === subscription.tenantId
        && item.channel === subscription.channel && item.userId === subscription.userId)) {
        subscriptions.push(subscription);
        await this.ctx.storage.put('subscriptions', subscriptions);
      }
      return Response.json({ ok: true, subscription });
    }

    if (url.pathname === '/state' && request.method === 'GET') {
      const tenantId = url.searchParams.get('tenantId');
      const subscriptions = await this.ctx.storage.get<Array<Record<string, string>>>('subscriptions') ?? [];
      const events = await this.ctx.storage.get<Array<Record<string, unknown>>>('events') ?? [];
      return Response.json({
        subscriptions: tenantId ? subscriptions.filter(item => item.tenantId === tenantId) : subscriptions,
        events: tenantId ? events.filter(item => item.tenantId === tenantId) : events,
      });
    }

    if (url.pathname === '/broadcast' && request.method === 'POST') {
      let body: Record<string, unknown>;
      try {
        body = await request.json() as Record<string, unknown>;
      } catch {
        return Response.json({ error: 'Invalid JSON' }, { status: 400 });
      }
      const expectedTenant = request.headers.get('x-e2e-tenant-id');
      const tenantId = body.tenantId;
      const channels = body.channels;
      if (typeof tenantId !== 'string' || typeof body.type !== 'string'
        || !body.data || typeof body.data !== 'object'
        || !Array.isArray(channels) || channels.length === 0
        || !channels.every(channel => typeof channel === 'string' && channel.length > 0)) {
        return Response.json({ error: 'Invalid broadcast payload' }, { status: 400 });
      }
      if (expectedTenant && expectedTenant !== tenantId) {
        return Response.json({ error: 'Tenant mismatch' }, { status: 403 });
      }

      const subscriptions = await this.ctx.storage.get<Array<Record<string, string>>>('subscriptions') ?? [];
      const delivered = subscriptions.filter(item => item.tenantId === tenantId && channels.includes(item.channel)).length;
      const events = await this.ctx.storage.get<Array<Record<string, unknown>>>('events') ?? [];
      events.push({
        tenantId,
        type: body.type,
        data: body.data,
        channels,
        delivered,
      });
      await this.ctx.storage.put('events', events.slice(-100));
      return Response.json({ ok: true, delivered });
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  }
}

async function blocked(operation: () => Promise<unknown>): Promise<'blocked' | 'escaped'> {
  try {
    await operation();
    return 'escaped';
  } catch {
    return 'blocked';
  }
}

async function bindingsProbe(env: E2EEnv): Promise<Response> {
  const id = env.CONNECTION_MANAGER.idFromName('e2e-probe');
  const connectionResponse = await env.CONNECTION_MANAGER.get(id).fetch('http://internal/state');

  const key = 'e2e/probe.txt';
  await env.CONTRACTS_BUCKET.put(key, 'binding-ok', {
    httpMetadata: { contentType: 'text/plain' },
  });
  const object = await env.CONTRACTS_BUCKET.get(key);
  const objectText = object ? await object.text() : null;
  await env.CONTRACTS_BUCKET.delete(key);

  return Response.json({
    connectionManager: connectionResponse.ok ? 'ok' : 'failed',
    contractsBucket: objectText === 'binding-ok' ? 'ok' : 'failed',
  });
}

function connectionManagerRequest(request: Request, env: E2EEnv, path: string): Promise<Response> {
  const id = env.CONNECTION_MANAGER.idFromName('global');
  const target = new URL(path, 'http://internal');
  target.search = new URL(request.url).search;
  return env.CONNECTION_MANAGER.get(id).fetch(new Request(target, request));
}

export default {
  async fetch(request: Request, env: E2EEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/__e2e/browser-marker') {
      return Response.json({ source: 'local-e2e-worker' });
    }
    if (url.pathname === '/__e2e/ready') {
      const tenant = await env.DB.prepare("SELECT id FROM tenants WHERE id = 'e2e-tenant'").first();
      return Response.json({ ready: Boolean(tenant) }, { status: tenant ? 200 : 503 });
    }
    if (url.pathname === '/__e2e/redirect-to-production') {
      return new Response(null, {
        status: 302,
        headers: { location: 'https://api.kamizo.uz/api/health' },
      });
    }
    if (url.pathname === '/__e2e/outbound-probe') {
      return Response.json({
        directProduction: await blocked(() => fetch('https://api.kamizo.uz/api/health')),
        redirectedProduction: await blocked(() => fetch(`${env.E2E_REDIRECT_ORIGIN || 'http://127.0.0.1:8790'}/redirect-production`)),
      });
    }
    if (url.pathname === '/__e2e/bindings-probe') return bindingsProbe(env);
    if (url.pathname === '/__e2e/connection-manager/reset') {
      return connectionManagerRequest(request, env, '/reset');
    }
    if (url.pathname === '/__e2e/connection-manager/subscribe') {
      return connectionManagerRequest(request, env, '/subscribe');
    }
    if (url.pathname === '/__e2e/connection-manager/broadcast') {
      return connectionManagerRequest(request, env, '/broadcast');
    }
    if (url.pathname === '/__e2e/connection-manager/state') {
      return connectionManagerRequest(request, env, '/state');
    }
    return productionWorker.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<E2EEnv>;
