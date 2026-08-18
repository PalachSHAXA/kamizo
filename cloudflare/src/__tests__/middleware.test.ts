import { describe, it, expect, beforeEach, vi } from 'vitest'

// ============================================================
// requireFeature tests
// ============================================================

// We can't directly import requireFeature because it depends on module-level
// state (featureCache, requestTenantMap). Instead, we test the logic by
// re-importing each time or by mocking the dependencies.

// Mock the cache-local module (imported by tenant.ts)
vi.mock('../middleware/cache-local', () => ({
  getCached: vi.fn(() => null),
  setCache: vi.fn(),
}))

describe('requireFeature', () => {
  // Clear module cache between tests so featureCache resets
  beforeEach(() => {
    vi.resetModules()
  })

  function createMockEnv(tenantData: any) {
    return {
      DB: {
        prepare: (_sql: string) => ({
          bind: (..._args: any[]) => ({
            first: async () => tenantData,
          }),
        }),
      },
    } as any
  }

  function createMockRequest(tenantId: string | null) {
    const req = new Request('https://test.kamizo.uz/api/test')
    return { req, tenantId }
  }

  it('returns allowed when no tenantId (single-tenant mode)', async () => {
    const { requireFeature, setTenantForRequest } = await import('../middleware/tenant')
    const env = createMockEnv(null)
    const req = new Request('https://app.kamizo.uz/api/test')
    // Don't set any tenant → getTenantId returns null

    const result = await requireFeature('trainings', env, req)
    expect(result.allowed).toBe(true)
  })

  it('returns allowed when feature exists in tenant features', async () => {
    const { requireFeature, setTenantForRequest } = await import('../middleware/tenant')
    const env = createMockEnv({
      features: JSON.stringify(['requests', 'trainings', 'votes']),
      plan: 'pro',
    })

    const req = new Request('https://test.kamizo.uz/api/test')
    // Simulate tenant context by setting tenant in the request map
    setTenantForRequest(req, { id: 'tenant-123' })

    const result = await requireFeature('trainings', env, req)
    expect(result.allowed).toBe(true)
  })

  it('returns not allowed when feature is missing from tenant', async () => {
    const { requireFeature, setTenantForRequest } = await import('../middleware/tenant')
    const env = createMockEnv({
      features: JSON.stringify(['requests', 'votes']),
      plan: 'basic',
    })

    const req = new Request('https://test.kamizo.uz/api/test')
    setTenantForRequest(req, { id: 'tenant-456' })

    const result = await requireFeature('marketplace', env, req)
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.error).toContain('marketplace')
    }
  })

  it('returns allowed when tenant not found in DB (graceful fallback — empty features)', async () => {
    const { requireFeature, setTenantForRequest } = await import('../middleware/tenant')
    // DB returns null (tenant not found)
    const env = createMockEnv(null)

    const req = new Request('https://test.kamizo.uz/api/test')
    setTenantForRequest(req, { id: 'nonexistent-tenant' })

    const result = await requireFeature('requests', env, req)
    // When tenant row not found, features = [] → feature not included → not allowed
    expect(result.allowed).toBe(false)
  })
})

describe('getUser impersonation context', () => {
  function createAuthEnv(user: Record<string, unknown>, demoTenant = true) {
    return {
      JWT_SECRET: 'middleware-test-secret',
      DB: {
        prepare: (sql: string) => ({
          bind: (..._args: unknown[]) => ({
            first: async () => {
              if (sql.includes("slug = 'demo'")) return demoTenant ? { id: 'tenant-demo' } : null
              if (sql.includes('SELECT is_active FROM tenants')) return { is_active: 1 }
              return user
            },
          }),
        }),
      },
    } as any
  }

  it('attaches a verified impersonation actor without changing the session user', async () => {
    const { createJWT } = await import('../utils/crypto')
    const { getUser } = await import('../middleware/auth')
    const payload = {
      userId: 'tenant-admin',
      role: 'admin',
      tenantId: 'tenant-1',
      imp: true,
      imp_by: 'super-admin-1',
    } satisfies Parameters<typeof createJWT>[0]
    const token = await createJWT(payload, 'middleware-test-secret', 3600)
    const request = new Request('https://api.kamizo.uz/api/users/me', {
      headers: { Authorization: `Bearer ${token}` },
    })

    const user = await getUser(request, createAuthEnv({
      id: 'tenant-admin',
      login: 'admin',
      phone: '+998',
      name: 'Tenant Admin',
      role: 'admin',
      tenant_id: 'tenant-1',
      is_active: 1,
    }))

    expect(user).toMatchObject({
      id: 'tenant-admin',
      role: 'admin',
      isImpersonated: true,
      impersonatedBy: 'super-admin-1',
    })
  })

  it('leaves an ordinary signed session unchanged', async () => {
    const { createJWT } = await import('../utils/crypto')
    const { getUser } = await import('../middleware/auth')
    const token = await createJWT(
      { userId: 'admin-2', role: 'admin', tenantId: 'tenant-1' },
      'middleware-test-secret',
      3600,
    )
    const request = new Request('https://api.kamizo.uz/api/users/me', {
      headers: { Authorization: `Bearer ${token}` },
    })

    const user = await getUser(request, createAuthEnv({
      id: 'admin-2', login: 'admin2', phone: '+998', name: 'Admin Two', role: 'admin',
      tenant_id: 'tenant-1', is_active: 1,
    }))

    expect(user?.id).toBe('admin-2')
    expect(user?.isImpersonated).toBeUndefined()
    expect(user?.impersonatedBy).toBeUndefined()
  })

  it('maps a signed demo capability only for the exact active demo tenant', async () => {
    const { createJWT } = await import('../utils/crypto')
    const { getUser } = await import('../middleware/auth')
    const { setCache } = await import('../middleware/cache-local')
    vi.mocked(setCache).mockClear()
    const token = await createJWT({
      userId: 'demo-manager', role: 'manager', tenantId: 'tenant-demo', demo_session: true,
    }, 'middleware-test-secret', 1800)
    const request = new Request('https://api.kamizo.uz/api/requests', {
      headers: { Authorization: `Bearer ${token}` },
    })

    const user = await getUser(request, createAuthEnv({
      id: 'demo-manager', login: 'demo-manager', phone: '+998', name: 'Demo Manager', role: 'manager',
      tenant_id: 'tenant-demo', is_active: 1,
    }))

    expect(user?.isDemoSession).toBe(true)
    expect(setCache).not.toHaveBeenCalled()
  })

  it('rejects a signed demo capability outside the exact demo tenant', async () => {
    const { createJWT } = await import('../utils/crypto')
    const { getUser } = await import('../middleware/auth')
    const token = await createJWT({
      userId: 'other-manager', role: 'manager', tenantId: 'tenant-other', demo_session: true,
    }, 'middleware-test-secret', 1800)
    const request = new Request('https://api.kamizo.uz/api/requests', {
      headers: { Authorization: `Bearer ${token}` },
    })

    const user = await getUser(request, createAuthEnv({
      id: 'other-manager', login: 'other-manager', phone: '+998', name: 'Other Manager', role: 'manager',
      tenant_id: 'tenant-other', is_active: 1,
    }, false))

    expect(user).toBeNull()
  })

  it('adds safe impersonation IDs to central request logs without exposing the bearer token', async () => {
    const { createJWT } = await import('../utils/crypto')
    const { getUser } = await import('../middleware/auth')
    const { createRequestLogger } = await import('../utils/logger')
    const token = await createJWT({
      userId: 'tenant-admin-3', role: 'admin', tenantId: 'tenant-1',
      imp: true, imp_by: 'super-admin-3',
    }, 'middleware-test-secret', 3600)
    const request = new Request('https://api.kamizo.uz/api/test', {
      headers: { Authorization: `Bearer ${token}` },
    })
    await getUser(request, createAuthEnv({
      id: 'tenant-admin-3', login: 'admin3', phone: '+998', name: 'Admin Three', role: 'admin',
      tenant_id: 'tenant-1', is_active: 1,
    }))
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    createRequestLogger(request).info('audit-safe')

    const rawEntry = String(logSpy.mock.calls[0][0])
    expect(JSON.parse(rawEntry).data).toEqual({
      actorId: 'super-admin-3',
      impersonatedSessionUserId: 'tenant-admin-3',
      isImpersonated: true,
    })
    expect(rawEntry).not.toContain(token)
    logSpy.mockRestore()
  })
})

// ============================================================
// checkRateLimit tests
// ============================================================

describe('checkRateLimit', () => {
  it('allows request when under limit', async () => {
    const { checkRateLimit } = await import('../middleware/rateLimit')

    const env = {
      RATE_LIMITER: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
      },
    } as any

    const result = await checkRateLimit(env, 'user:test-1', 'GET:/api/requests')

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(59) // 60 max - 1
    expect(env.RATE_LIMITER.put).toHaveBeenCalled()
  })

  it('blocks request when limit exceeded', async () => {
    const { checkRateLimit } = await import('../middleware/rateLimit')
    const futureReset = Date.now() + 30000

    const env = {
      RATE_LIMITER: {
        // KV.get(key, 'json') returns parsed object directly
        get: vi.fn().mockResolvedValue({ count: 60, resetAt: futureReset }),
        put: vi.fn(),
      },
    } as any

    const result = await checkRateLimit(env, 'user:test-2', 'GET:/api/requests')

    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('blocks request on KV error (fail-closed)', async () => {
    const { checkRateLimit } = await import('../middleware/rateLimit')

    const env = {
      RATE_LIMITER: {
        get: vi.fn().mockRejectedValue(new Error('KV unavailable')),
        put: vi.fn(),
      },
    } as any

    const result = await checkRateLimit(env, 'user:test-3', 'default')

    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })
})

// ============================================================
// getClientIdentifier tests
// ============================================================

describe('getClientIdentifier', () => {
  function requestWithRawHeaders(
    headers: Record<string, string>,
    cloudflareWorker = false,
  ): Request {
    const normalizedHeaders = Object.fromEntries(
      Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
    )
    return {
      headers: {
        get: (name: string) => normalizedHeaders[name.toLowerCase()] ?? null,
      },
      ...(cloudflareWorker ? { cf: {} } : {}),
    } as unknown as Request
  }

  it('keeps an ordinary authenticated user in the user bucket', async () => {
    const { getClientIdentifier } = await import('../middleware/rateLimit')

    const req = new Request('https://test.kamizo.uz/api/test', {
      headers: { 'X-Real-IP': '192.0.2.10', 'CF-Connecting-IP': '198.51.100.20' },
    })
    const result = getClientIdentifier(req, { id: 'user-abc' } as any)

    expect(result).toBe('user:user-abc')
  })

  it('uses validated X-Real-IP despite a spoofed CF-Connecting-IP', async () => {
    const { getClientIdentifier } = await import('../middleware/rateLimit')

    const first = new Request('https://test.kamizo.uz/api/test', {
      headers: { 'X-Real-IP': '192.0.2.10', 'CF-Connecting-IP': '198.51.100.1' },
    })
    const second = new Request('https://test.kamizo.uz/api/test', {
      headers: { 'X-Real-IP': '192.0.2.10', 'CF-Connecting-IP': '198.51.100.2' },
    })

    expect(getClientIdentifier(first, null)).toBe('ip:192.0.2.10')
    expect(getClientIdentifier(second, null)).toBe('ip:192.0.2.10')
  })

  it('uses only the first X-Forwarded-For token', async () => {
    const { getClientIdentifier } = await import('../middleware/rateLimit')
    const req = new Request('https://test.kamizo.uz/api/test', {
      headers: { 'X-Forwarded-For': '203.0.113.7, 10.0.0.4' },
    })

    expect(getClientIdentifier(req, null)).toBe('ip:203.0.113.7')
  })

  it.each([
    ['IPv4', '192.168.1.1'],
    ['compressed IPv6', '2001:db8::1'],
    ['IPv4-mapped IPv6', '::ffff:192.0.2.128'],
  ])('accepts a valid %s address', async (_label, ip) => {
    const { getClientIdentifier } = await import('../middleware/rateLimit')
    const req = new Request('https://test.kamizo.uz/api/test', {
      headers: { 'X-Real-IP': ip },
    })

    expect(getClientIdentifier(req, null)).toBe(`ip:${ip}`)
  })

  it.each([
    ['out-of-range IPv4', '256.1.1.1'],
    ['short IPv4', '192.168.1'],
    ['leading-zero IPv4', '192.168.001.1'],
    ['invalid IPv6', '2001:db8:::1'],
    ['multiple X-Real-IP values', '192.0.2.1, 192.0.2.2'],
    ['newline injection', '192.0.2.1\n198.51.100.2'],
  ])('maps %s to the unknown bucket', async (_label, ip) => {
    const { getClientIdentifier } = await import('../middleware/rateLimit')

    expect(getClientIdentifier(requestWithRawHeaders({ 'X-Real-IP': ip }), null))
      .toBe('ip:unknown')
  })

  it('rejects a malformed first XFF token instead of selecting a later address', async () => {
    const { getClientIdentifier } = await import('../middleware/rateLimit')
    const req = requestWithRawHeaders({
      'X-Forwarded-For': 'not-an-ip, 203.0.113.8',
      'CF-Connecting-IP': '203.0.113.9',
    }, true)

    expect(getClientIdentifier(req, null)).toBe('ip:unknown')
  })

  it('uses CF-Connecting-IP only for a request with Worker metadata', async () => {
    const { getClientIdentifier } = await import('../middleware/rateLimit')
    const headers = { 'CF-Connecting-IP': '198.51.100.30' }

    expect(getClientIdentifier(requestWithRawHeaders(headers), null)).toBe('ip:unknown')
    expect(getClientIdentifier(requestWithRawHeaders(headers, true), null))
      .toBe('ip:198.51.100.30')
  })

  it('keeps demo-login on one IP route bucket even when a bearer user is present', async () => {
    const { getRateLimitIdentifier } = await import('../middleware/rateLimit')
    const req = new Request('https://api.kamizo.uz/api/auth/demo-login', {
      method: 'POST', headers: { 'X-Real-IP': '192.0.2.10' },
    })

    expect(getRateLimitIdentifier(
      req,
      { id: 'existing-user' } as any,
      'POST:/api/auth/demo-login',
    )).toBe('ip:192.0.2.10')
    expect(getRateLimitIdentifier(req, { id: 'existing-user' } as any, 'POST:/api/requests'))
      .toBe('user:existing-user')
  })
})
