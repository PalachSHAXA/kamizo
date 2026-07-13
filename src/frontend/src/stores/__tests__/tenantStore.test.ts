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
    keys: () => Object.keys(store),
  }
})()
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

// Sprint 87 — большинство тестов ставят isConfigFetched=true перед
// проверкой hasFeature: без этого race guard возвращает false.
// Отдельные тесты для race guard / apex / offline — в конце.

describe('tenantStore', () => {
  beforeEach(() => {
    useTenantStore.setState({
      config: null,
      fetchedAt: 0,
      isLoading: false,
      isConfigFetched: false,
      isStale: false,
      error: null,
    })
    localStorageMock.clear()
  })

  it('hasFeature returns true on apex context when tenant is null', () => {
    useTenantStore.setState({
      config: { tenant: null, features: [], context: 'apex' },
      isConfigFetched: true,
    })
    // apex → главный сайт → все фичи доступны
    expect(useTenantStore.getState().hasFeature('requests')).toBe(true)
    expect(useTenantStore.getState().hasFeature('trainings')).toBe(true)
    expect(useTenantStore.getState().hasFeature('anything')).toBe(true)
  })

  it('hasFeature returns false on unresolved context when tenant is null', () => {
    useTenantStore.setState({
      config: { tenant: null, features: [], context: 'unresolved' },
      isConfigFetched: true,
    })
    // native pre-login / чужой домен / ошибка — фичей нет
    expect(useTenantStore.getState().hasFeature('requests')).toBe(false)
    expect(useTenantStore.getState().hasFeature('marketplace')).toBe(false)
  })

  it('hasFeature returns false before config is fetched (race guard)', () => {
    // Даже если config уже установлен, но isConfigFetched=false —
    // должен вернуть false. Это защита от race при старте.
    useTenantStore.setState({
      config: { tenant: null, features: [], context: 'apex' },
      isConfigFetched: false,
    })
    expect(useTenantStore.getState().hasFeature('requests')).toBe(false)
    expect(useTenantStore.getState().hasFeature('anything')).toBe(false)
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
        context: 'tenant',
      },
      isConfigFetched: true,
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
        context: 'tenant',
      },
      isConfigFetched: true,
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
        context: 'tenant',
      },
      isConfigFetched: true,
    })

    const config = useTenantStore.getState().config
    expect(config?.tenant?.plan).toBe('basic')
  })

  it('clear() resets all state', () => {
    useTenantStore.setState({
      config: {
        tenant: {
          id: 't', name: 'x', slug: 'x', color: '#000', color_secondary: '#000',
          plan: 'basic', logo: null, is_demo: false,
        },
        features: ['requests'],
        context: 'tenant',
      },
      fetchedAt: Date.now(),
      isConfigFetched: true,
      isStale: false,
      error: null,
    })
    useTenantStore.getState().clear()
    const s = useTenantStore.getState()
    expect(s.config).toBeNull()
    expect(s.fetchedAt).toBe(0)
    expect(s.isConfigFetched).toBe(false)
    expect(s.isStale).toBe(false)
    expect(s.error).toBeNull()
    // После clear() hasFeature возвращает false (race guard)
    expect(s.hasFeature('requests')).toBe(false)
  })
})
