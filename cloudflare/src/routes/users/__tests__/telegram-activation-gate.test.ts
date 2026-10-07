// Tests for the migration-092 activation gate wired into /api/auth/login.
//
// All six acceptance scenarios from the Этап 2 brief:
//   1. switch OFF  → login goes through as before (no activation branch)
//   2. switch ON  + resident, flag set, no binding → requiresTelegramActivation
//   3. demo tenant with switch ON → no activation (demo excluded)
//   4. user.skip_telegram_activation = 1 → no activation
//   5. staff role (not resident/tenant/commercial_owner) → no activation
//   6. createFirstLoginActivation throws → fail-open (normal login completes)
//
// Harness mirrors demo-normal-login.test.ts: mocks the router, rate-limit,
// crypto, logger and feeds the handler a fake DB that returns a deterministic
// user + tenant row. We then check the response shape and side effects.

import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (request: Request, env: any, params: Record<string, string>) => Promise<Response>;

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  tenantId: 'tenant-1' as string | null,
  tenantSlug: 'choko' as string,
  login: 'resident-1',
  password: 'valid-password',

  // User knobs
  role: 'resident',
  skipTelegramActivation: 0,
  telegramActivationRequired: 1,
  telegramActivatedAt: null as string | null,

  // Tenant knobs
  requireTelegramActivation: 0,
  isDemo: 0,

  // Activation stub behaviour
  activationThrows: false,

  // telegram_users live binding (C1)
  liveTelegramLink: false,

  // Capture UPDATE users ... telegram_activated_at
  activatedAtSetFor: null as string | null,
}));

vi.mock('../../../router', () => ({
  route: (method: string, path: string, handler: Handler) => mocks.handlers.set(`${method} ${path}`, handler),
}));
vi.mock('../../../middleware/tenant', () => ({
  getTenantId: vi.fn(() => mocks.tenantId),
  setTenantForRequest: vi.fn(),
  getTenantSlug: vi.fn(() => null),
  isControlRequest: vi.fn(() => false),
}));
vi.mock('../../../middleware/rateLimit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 4, resetAt: Date.now() + 60_000 })),
  getClientIdentifier: vi.fn(() => 'ip:test'),
}));
vi.mock('../../../middleware/cors', () => ({ getCurrentCorsOrigin: vi.fn(() => 'https://choko.kamizo.uz') }));
vi.mock('../../../middleware/auth', () => ({ getUser: vi.fn(async () => null) }));
vi.mock('../../../validation/validate', () => ({
  validateBody: vi.fn(async () => ({ data: { login: mocks.login, password: mocks.password }, errors: null })),
}));
vi.mock('../../../validation/schemas', () => ({ loginSchema: {} }));
vi.mock('../../../utils/crypto', () => ({
  verifyPasswordTolerant: vi.fn(async () => true),
  hashPassword: vi.fn(async () => 'rehash'),
  createJWT: vi.fn(async () => 'ordinary-jwt'),
}));
vi.mock('../../../utils/logger', () => ({
  createRequestLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() })),
}));
vi.mock('../../../index', () => ({
  isExecutorRole: (role: string) => role === 'executor',
  isSuperAdmin: (user: any) => user?.role === 'super_admin',
}));

// login-approval helpers — return null so we fall through to plain JWT branch.
vi.mock('../../telegram/login-approval', () => ({
  createLoginApproval: vi.fn(async () => null),
  createEmailLoginApproval: vi.fn(async () => null),
}));

// Spy-able activation stub — must live inside vi.hoisted so vi.mock
// factory can access it before module code runs.
const activationStub = vi.hoisted(() => ({
  fn: null as any,
}));
activationStub.fn = vi.fn(async () => {
  if (mocks.activationThrows) throw new Error('bot timeout');
  return {
    requestId: 'req-1',
    tenantId: mocks.tenantId!,
    browserSecret: 'secret-xyz',
    telegramUrl: 'https://t.me/kamizobot?start=TOKEN',
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    challenge: '42',
  };
});
vi.mock('../../telegram/activation', () => ({
  createFirstLoginActivation: (...args: any[]) => activationStub.fn(...args),
}));
const createFirstLoginActivation = activationStub.fn;

import { registerAuthRoutes } from '../auth';

function fakeDb() {
  return {
    prepare(sql: string) {
      let binds: unknown[] = [];
      const stmt = {
        bind(...values: unknown[]) { binds = values; return stmt; },
        async first() {
          if (sql.includes('FROM users')) {
            return {
              id: 'user-1',
              login: mocks.login,
              phone: '+998901234567',
              email: null,
              email_2fa_enabled: 0,
              name: 'Test User',
              role: mocks.role,
              specialization: null,
              password_hash: '50000:salt:hash',
              tenant_id: binds[1] ?? mocks.tenantId,
              auth_revoked_at: null,
              telegram_activation_required: mocks.telegramActivationRequired,
              telegram_activated_at: mocks.telegramActivatedAt,
              skip_telegram_activation: mocks.skipTelegramActivation,
              is_active: 1,
            };
          }
          if (sql.includes('FROM tenants') && sql.includes('require_telegram_activation')) {
            // gate's own tenant read
            return { require_telegram_activation: mocks.requireTelegramActivation, is_demo: mocks.isDemo };
          }
          if (sql.includes('FROM tenants')) {
            return { id: mocks.tenantId, slug: mocks.tenantSlug, is_active: 1, features: '[]' };
          }
          if (sql.includes('FROM telegram_users')) {
            return mocks.liveTelegramLink ? { 1: 1 } : null;
          }
          return null;
        },
        async all() { return { results: [] }; },
        async run() {
          // Capture C1 side-effect: UPDATE users ... telegram_activated_at = COALESCE(...)
          if (sql.includes('UPDATE users') && sql.includes('telegram_activated_at = COALESCE')) {
            mocks.activatedAtSetFor = String(binds[0] ?? '');
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
      return stmt;
    },
    async batch() { return []; },
  };
}

function makeRequest(body: Record<string, unknown> = {}): Request {
  return new Request('https://api.kamizo.uz/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'test' },
    body: JSON.stringify({ login: mocks.login, password: mocks.password, ...body }),
  });
}

async function callLogin(): Promise<{ status: number; body: any }> {
  const handler = mocks.handlers.get('POST /api/auth/login')!;
  const res = await handler(makeRequest(), { DB: fakeDb(), JWT_SECRET: 'secret', TELEGRAM_BOT_USERNAME: 'kamizobot' }, {});
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

beforeEach(() => {
  mocks.handlers.clear();
  mocks.tenantId = 'tenant-1';
  mocks.tenantSlug = 'choko';
  mocks.role = 'resident';
  mocks.skipTelegramActivation = 0;
  mocks.telegramActivationRequired = 1;
  mocks.telegramActivatedAt = null;
  mocks.requireTelegramActivation = 0;
  mocks.isDemo = 0;
  mocks.activationThrows = false;
  mocks.liveTelegramLink = false;
  mocks.activatedAtSetFor = null;
  createFirstLoginActivation.mockClear();
  registerAuthRoutes();
});

describe('telegram activation gate (migration 092)', () => {
  it('1) switch OFF: login completes normally, activation NOT called', async () => {
    mocks.requireTelegramActivation = 0;
    const { status, body } = await callLogin();
    expect(status).toBe(200);
    expect(body.requiresTelegramActivation).toBeUndefined();
    expect(body.token).toBe('ordinary-jwt');
    expect(createFirstLoginActivation).not.toHaveBeenCalled();
  });

  it('2) switch ON + resident, flag set, no binding: requiresTelegramActivation', async () => {
    mocks.requireTelegramActivation = 1;
    const { status, body } = await callLogin();
    expect(status).toBe(200);
    expect(body.requiresTelegramActivation).toBe(true);
    expect(body.requestId).toBe('req-1');
    expect(body.telegramUrl).toContain('t.me/kamizobot');
    expect(body.browserSecret).toBe('secret-xyz');
    expect(body.token).toBeUndefined();
    expect(createFirstLoginActivation).toHaveBeenCalledTimes(1);
  });

  it('3) demo tenant: activation NOT triggered even with switch ON', async () => {
    mocks.requireTelegramActivation = 1;
    mocks.isDemo = 1;
    const { status, body } = await callLogin();
    expect(status).toBe(200);
    expect(body.requiresTelegramActivation).toBeUndefined();
    expect(body.token).toBe('ordinary-jwt');
    expect(createFirstLoginActivation).not.toHaveBeenCalled();
  });

  it('4) user with skip_telegram_activation=1: activation NOT triggered', async () => {
    mocks.requireTelegramActivation = 1;
    mocks.skipTelegramActivation = 1;
    const { status, body } = await callLogin();
    expect(status).toBe(200);
    expect(body.requiresTelegramActivation).toBeUndefined();
    expect(body.token).toBe('ordinary-jwt');
    expect(createFirstLoginActivation).not.toHaveBeenCalled();
  });

  it('5) staff role (director, executor, manager): activation NOT triggered', async () => {
    mocks.requireTelegramActivation = 1;
    for (const role of ['director', 'executor', 'manager', 'department_head', 'admin']) {
      createFirstLoginActivation.mockClear();
      mocks.role = role;
      const { status, body } = await callLogin();
      expect(status, `role=${role}`).toBe(200);
      expect(body.requiresTelegramActivation, `role=${role}`).toBeUndefined();
      expect(body.token, `role=${role}`).toBe('ordinary-jwt');
      expect(createFirstLoginActivation, `role=${role}`).not.toHaveBeenCalled();
    }
  });

  it('6) createFirstLoginActivation throws: login FAIL-OPEN (returns JWT)', async () => {
    mocks.requireTelegramActivation = 1;
    mocks.activationThrows = true;
    const { status, body } = await callLogin();
    expect(status).toBe(200);
    expect(body.requiresTelegramActivation).toBeUndefined();
    expect(body.token).toBe('ordinary-jwt');
    expect(createFirstLoginActivation).toHaveBeenCalledTimes(1);
  });

  it('also: telegram_activated_at already set → activation NOT triggered', async () => {
    mocks.requireTelegramActivation = 1;
    mocks.telegramActivatedAt = '2026-01-01T00:00:00Z';
    const { status, body } = await callLogin();
    expect(status).toBe(200);
    expect(body.requiresTelegramActivation).toBeUndefined();
    expect(createFirstLoginActivation).not.toHaveBeenCalled();
  });

  it('also: telegram_activation_required=0 → activation NOT triggered', async () => {
    mocks.requireTelegramActivation = 1;
    mocks.telegramActivationRequired = 0;
    const { status, body } = await callLogin();
    expect(status).toBe(200);
    expect(body.requiresTelegramActivation).toBeUndefined();
    expect(createFirstLoginActivation).not.toHaveBeenCalled();
  });

  // ─────────── C1 live-bind catch ───────────
  it('C1: live telegram_users link + empty telegram_activated_at → treat as activated, NO requires', async () => {
    mocks.requireTelegramActivation = 1;
    mocks.liveTelegramLink = true;              // simulates legacy /start <token> binding
    const { status, body } = await callLogin();
    expect(status).toBe(200);
    expect(body.requiresTelegramActivation).toBeUndefined();
    expect(body.token).toBe('ordinary-jwt');
    expect(createFirstLoginActivation).not.toHaveBeenCalled();
    // telegram_activated_at UPDATE was issued for the right user
    expect(mocks.activatedAtSetFor).toBe('user-1');
  });

  it('C1: revoked telegram_users link (revoked_at NOT NULL) → activation REQUIRED', async () => {
    mocks.requireTelegramActivation = 1;
    mocks.liveTelegramLink = false;             // fakeDb returns null → treated as no binding
    const { status, body } = await callLogin();
    expect(status).toBe(200);
    expect(body.requiresTelegramActivation).toBe(true);
    expect(mocks.activatedAtSetFor).toBeNull();
    expect(createFirstLoginActivation).toHaveBeenCalledTimes(1);
  });

  // ─────────── C2 payload shape ───────────
  it('C2: activation payload contains account.phone (NOT account.login)', async () => {
    mocks.requireTelegramActivation = 1;
    mocks.liveTelegramLink = false;
    const { body } = await callLogin();
    expect(body.account).toBeDefined();
    expect(body.account.phone).toBe('+998901234567');
    expect(body.account.login).toBeUndefined();
  });
});
