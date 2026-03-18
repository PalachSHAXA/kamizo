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
  it('returns user identifier when user provided', async () => {
    const { getClientIdentifier } = await import('../middleware/rateLimit')

    const req = new Request('https://test.kamizo.uz/api/test')
    const result = getClientIdentifier(req, { id: 'user-abc' } as any)

    expect(result).toBe('user:user-abc')
  })

  it('returns IP identifier when no user', async () => {
    const { getClientIdentifier } = await import('../middleware/rateLimit')

    const req = new Request('https://test.kamizo.uz/api/test', {
      headers: { 'CF-Connecting-IP': '192.168.1.1' },
    })
    const result = getClientIdentifier(req, null)

    expect(result).toBe('ip:192.168.1.1')
  })
})
