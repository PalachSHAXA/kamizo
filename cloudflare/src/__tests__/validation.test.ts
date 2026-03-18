import { describe, it, expect } from 'vitest'
import { validateBody } from '../validation/validate'
import { loginSchema, createRequestSchema, paginationSchema } from '../validation/schemas'

// Helper: create a fake Request with JSON body
function fakeRequest(body: unknown): Request {
  return new Request('https://test.com/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ── loginSchema ──────────────────────────────────────────

describe('loginSchema validation', () => {
  it('accepts valid login + password', async () => {
    const { data, errors } = await validateBody(fakeRequest({ login: 'admin', password: 'secret123' }), loginSchema)
    expect(errors).toBeNull()
    expect(data).toEqual({ login: 'admin', password: 'secret123' })
  })

  it('rejects missing login', async () => {
    const { errors } = await validateBody(fakeRequest({ password: 'secret123' }), loginSchema)
    expect(errors).toContain('Login is required')
  })

  it('rejects missing password', async () => {
    const { errors } = await validateBody(fakeRequest({ login: 'admin' }), loginSchema)
    expect(errors).toContain('Password is required')
  })

  it('rejects empty login string', async () => {
    const { errors } = await validateBody(fakeRequest({ login: '', password: 'secret123' }), loginSchema)
    expect(errors).toContain('Login is required')
  })

  it('rejects non-string login', async () => {
    const { errors } = await validateBody(fakeRequest({ login: 123, password: 'secret123' }), loginSchema)
    expect(errors).toContain('Login must be a string')
  })
})

// ── createRequestSchema ──────────────────────────────────

describe('createRequestSchema validation', () => {
  it('accepts valid request with required fields', async () => {
    const body = { category_id: 'cat-1', title: 'Fix pipe' }
    const { errors } = await validateBody(fakeRequest(body), createRequestSchema)
    expect(errors).toBeNull()
  })

  it('accepts request with all optional fields', async () => {
    const body = {
      category_id: 'cat-1',
      title: 'Fix pipe',
      description: 'Leaking pipe in bathroom',
      priority: 'high',
      resident_id: 'user-1',
      access_info: 'Door code 1234',
    }
    const { errors } = await validateBody(fakeRequest(body), createRequestSchema)
    expect(errors).toBeNull()
  })

  it('rejects missing category_id', async () => {
    const { errors } = await validateBody(fakeRequest({ title: 'Fix pipe' }), createRequestSchema)
    expect(errors).toContain('Category is required')
  })

  it('rejects missing title', async () => {
    const { errors } = await validateBody(fakeRequest({ category_id: 'cat-1' }), createRequestSchema)
    expect(errors).toContain('Title is required')
  })

  it('rejects invalid priority value', async () => {
    const body = { category_id: 'cat-1', title: 'Fix pipe', priority: 'critical' }
    const { errors } = await validateBody(fakeRequest(body), createRequestSchema)
    expect(errors).toContain('must be one of: low, medium, high, urgent')
  })
})

// ── paginationSchema ─────────────────────────────────────

describe('paginationSchema validation', () => {
  it('accepts empty body (all optional)', async () => {
    const { errors } = await validateBody(fakeRequest({}), paginationSchema)
    expect(errors).toBeNull()
  })

  it('rejects limit over 100', async () => {
    const { errors } = await validateBody(fakeRequest({ limit: 500 }), paginationSchema)
    expect(errors).toContain('must be at most 100')
  })

  it('rejects non-number page', async () => {
    const { errors } = await validateBody(fakeRequest({ page: 'abc' }), paginationSchema)
    expect(errors).toContain('must be a number')
  })
})

// ── Edge cases ───────────────────────────────────────────

describe('validateBody edge cases', () => {
  it('rejects invalid JSON', async () => {
    const req = new Request('https://test.com/api', {
      method: 'POST',
      body: 'not json',
    })
    const { errors } = await validateBody(req, loginSchema)
    expect(errors).toBe('Invalid JSON body')
  })

  it('rejects array body', async () => {
    const req = new Request('https://test.com/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([1, 2, 3]),
    })
    const { errors } = await validateBody(req, loginSchema)
    expect(errors).toBe('Request body must be a JSON object')
  })
})
