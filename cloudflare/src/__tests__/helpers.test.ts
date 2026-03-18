import { describe, it, expect, vi } from 'vitest'

// Mock the cors module since helpers.ts imports getCurrentCorsOrigin
vi.mock('../middleware/cors', () => ({
  getCurrentCorsOrigin: () => 'https://app.kamizo.uz',
}))

import {
  generateId,
  getPaginationParams,
  createPaginatedResponse,
  isManagement,
  isAdminLevel,
} from '../utils/helpers'

describe('generateId', () => {
  it('returns a string', () => {
    const id = generateId()
    expect(typeof id).toBe('string')
  })

  it('returns a UUID format (36 chars with hyphens)', () => {
    const id = generateId()
    // UUID v4 format: 8-4-4-4-12
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()))
    expect(ids.size).toBe(100)
  })
})

describe('getPaginationParams', () => {
  it('returns defaults (page 1, limit 50)', () => {
    const url = new URL('https://test.com/api/items')
    const params = getPaginationParams(url)
    expect(params.page).toBe(1)
    expect(params.limit).toBe(50)
  })

  it('parses page and limit from query params', () => {
    const url = new URL('https://test.com/api/items?page=3&limit=25')
    const params = getPaginationParams(url)
    expect(params.page).toBe(3)
    expect(params.limit).toBe(25)
  })

  it('respects max limit of 500', () => {
    const url = new URL('https://test.com/api/items?limit=9999')
    const params = getPaginationParams(url)
    expect(params.limit).toBe(500)
  })

  it('handles negative limit by clamping to 1', () => {
    const url = new URL('https://test.com/api/items?page=2&limit=-5')
    const params = getPaginationParams(url)
    expect(params.page).toBe(2)
    expect(params.limit).toBe(1)
  })

  it('handles NaN page as NaN (parseInt behavior)', () => {
    const url = new URL('https://test.com/api/items?page=abc')
    const params = getPaginationParams(url)
    // parseInt('abc') = NaN, Math.max(1, NaN) = NaN in JS
    expect(params.page).toBeNaN()
  })

  it('clamps page to minimum 1', () => {
    const url = new URL('https://test.com/api/items?page=0')
    const params = getPaginationParams(url)
    expect(params.page).toBe(1)
  })
})

describe('createPaginatedResponse', () => {
  it('returns correct pagination metadata', () => {
    const data = [{ id: 1 }, { id: 2 }]
    const result = createPaginatedResponse(data, 100, { page: 2, limit: 10 })

    expect(result.data).toEqual(data)
    expect(result.pagination.page).toBe(2)
    expect(result.pagination.limit).toBe(10)
    expect(result.pagination.total).toBe(100)
    expect(result.pagination.totalPages).toBe(10)
    expect(result.pagination.hasNext).toBe(true)
    expect(result.pagination.hasPrev).toBe(true)
  })

  it('hasNext is false on last page', () => {
    const result = createPaginatedResponse([], 20, { page: 2, limit: 10 })
    expect(result.pagination.hasNext).toBe(false)
  })

  it('hasPrev is false on first page', () => {
    const result = createPaginatedResponse([], 20, { page: 1, limit: 10 })
    expect(result.pagination.hasPrev).toBe(false)
  })
})

describe('isManagement', () => {
  it('returns true for admin, director, manager', () => {
    expect(isManagement({ role: 'admin' })).toBe(true)
    expect(isManagement({ role: 'director' })).toBe(true)
    expect(isManagement({ role: 'manager' })).toBe(true)
  })

  it('returns false for non-management roles', () => {
    expect(isManagement({ role: 'resident' })).toBe(false)
    expect(isManagement({ role: 'executor' })).toBe(false)
  })

  it('returns false for null/undefined', () => {
    expect(isManagement(null)).toBe(false)
    expect(isManagement(undefined)).toBe(false)
  })
})

describe('isAdminLevel', () => {
  it('returns true for admin and director only', () => {
    expect(isAdminLevel({ role: 'admin' })).toBe(true)
    expect(isAdminLevel({ role: 'director' })).toBe(true)
  })

  it('returns false for manager and below', () => {
    expect(isAdminLevel({ role: 'manager' })).toBe(false)
    expect(isAdminLevel({ role: 'resident' })).toBe(false)
  })
})
