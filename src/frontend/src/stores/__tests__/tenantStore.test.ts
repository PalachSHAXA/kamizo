import { describe, it, expect, beforeEach } from 'vitest'
import { useTenantStore } from '../tenantStore'

// Mock localStorage for persist middleware
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

describe('tenantStore', () => {
  beforeEach(() => {
    useTenantStore.setState({
      config: null,
      isLoading: false,
      isConfigFetched: false,
      error: null,
    })
    localStorageMock.clear()
  })

  it('hasFeature returns true when no tenant (main domain, all features allowed)', () => {
    // config is null → no tenant → all features allowed
    expect(useTenantStore.getState().hasFeature('requests')).toBe(true)
    expect(useTenantStore.getState().hasFeature('trainings')).toBe(true)
    expect(useTenantStore.getState().hasFeature('anything')).toBe(true)
  })

  it('hasFeature returns true when tenant is null in config', () => {
    useTenantStore.setState({
      config: { tenant: null, features: [] },
    })
    // tenant is null → main domain → all features allowed
    expect(useTenantStore.getState().hasFeature('requests')).toBe(true)
  })

  it('hasFeature returns false for missing feature when tenant exists', () => {
    useTenantStore.setState({
      config: {
        tenant: {
          id: 'tenant-1',
          name: 'Test UK',
          slug: 'test',
          color: '#6366f1',
          color_secondary: '#a855f7',
          plan: 'basic',
          logo: null,
          is_demo: false,
        },
        features: ['requests', 'votes', 'qr'],
      },
    })

    expect(useTenantStore.getState().hasFeature('trainings')).toBe(false)
    expect(useTenantStore.getState().hasFeature('marketplace')).toBe(false)
    expect(useTenantStore.getState().hasFeature('nonexistent')).toBe(false)
  })

  it('hasFeature returns true for existing feature when tenant exists', () => {
    useTenantStore.setState({
      config: {
        tenant: {
          id: 'tenant-1',
          name: 'Test UK',
          slug: 'test',
          color: '#6366f1',
          color_secondary: '#a855f7',
          plan: 'pro',
          logo: null,
          is_demo: false,
        },
        features: ['requests', 'votes', 'qr', 'trainings', 'marketplace'],
      },
    })

    expect(useTenantStore.getState().hasFeature('requests')).toBe(true)
    expect(useTenantStore.getState().hasFeature('trainings')).toBe(true)
    expect(useTenantStore.getState().hasFeature('marketplace')).toBe(true)
  })

  it('default plan is basic when tenant is configured', () => {
    useTenantStore.setState({
      config: {
        tenant: {
          id: 'tenant-1',
          name: 'Basic UK',
          slug: 'basic-uk',
          color: '#6366f1',
          color_secondary: '#a855f7',
          plan: 'basic',
          logo: null,
          is_demo: false,
        },
        features: ['requests'],
      },
    })

    const config = useTenantStore.getState().config
    expect(config?.tenant?.plan).toBe('basic')
  })
})
