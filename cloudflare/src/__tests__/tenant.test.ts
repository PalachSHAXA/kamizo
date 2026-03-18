import { describe, it, expect } from 'vitest'
import { getTenantSlug } from '../middleware/tenant'

describe('getTenantSlug', () => {
  it('extracts slug from kamizo.uz subdomain', () => {
    expect(getTenantSlug('demo.kamizo.uz')).toBe('demo')
    expect(getTenantSlug('my-uk.kamizo.uz')).toBe('my-uk')
  })

  it('returns null for main domain', () => {
    expect(getTenantSlug('kamizo.uz')).toBeNull()
    expect(getTenantSlug('localhost')).toBeNull()
  })

  it('skips well-known subdomains', () => {
    expect(getTenantSlug('app.kamizo.uz')).toBeNull()
    expect(getTenantSlug('www.kamizo.uz')).toBeNull()
    expect(getTenantSlug('api.kamizo.uz')).toBeNull()
  })

  it('extracts slug from workers.dev subdomain', () => {
    expect(getTenantSlug('demo.kamizo.shaxzod.workers.dev')).toBe('demo')
  })

  it('returns null for unrelated domains', () => {
    expect(getTenantSlug('example.com')).toBeNull()
    expect(getTenantSlug('google.com')).toBeNull()
  })

  it('handles numeric slugs', () => {
    expect(getTenantSlug('123.kamizo.uz')).toBe('123')
  })

  it('handles slug with hyphens', () => {
    expect(getTenantSlug('my-building-complex.kamizo.uz')).toBe('my-building-complex')
  })
})
