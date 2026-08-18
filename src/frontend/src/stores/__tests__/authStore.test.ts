import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAuthStore } from '../authStore'
import type { User } from '../../types'

const { resetSessionScopedState, markLoggedIn, registerSessionExpiredHandler, apiRequest, authInstallOrder } = vi.hoisted(() => {
  const authInstallOrder: string[] = []
  return {
    authInstallOrder,
    resetSessionScopedState: vi.fn(() => {
      authInstallOrder.push('reset')
      globalThis.localStorage.removeItem('auth_token')
    }),
    markLoggedIn: vi.fn(() => { authInstallOrder.push('markLoggedIn') }),
    registerSessionExpiredHandler: vi.fn(),
    apiRequest: vi.fn().mockResolvedValue({ tenant: null, features: [] }),
  }
})

// Mock the API modules
vi.mock('../../services/api/auth', () => ({
  authApi: {
    login: vi.fn(), demoLogin: vi.fn(), logout: vi.fn(), register: vi.fn(), registerBulk: vi.fn(),
  },
}))
vi.mock('../../services/api/users', () => ({
  usersApi: {
    updateMe: vi.fn(),
    changePassword: vi.fn(),
    adminChangePassword: vi.fn(),
    markContractSigned: vi.fn(),
    getMe: vi.fn(),
  },
}))

vi.mock('../sessionReset', () => ({ resetSessionScopedState }))
vi.mock('../../services/api/client', () => ({
  apiRequest,
  markLoggedIn,
  registerSessionExpiredHandler,
  SessionChangedError: class SessionChangedError extends Error {},
}))

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      if (key === 'auth_token') authInstallOrder.push('auth_token')
      store[key] = value
    },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

describe('authStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useAuthStore.setState({
      user: null,
      token: null,
      isLoading: false,
      error: null,
      additionalUsers: {},
    })
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  it('initial state has no user and no token', () => {
    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.token).toBeNull()
    expect(state.isLoading).toBe(false)
    expect(state.error).toBeNull()
  })

  it('login sets user and token', async () => {
    const { authApi } = await import('../../services/api/auth')
    const mockUser: User = {
      id: 'user-1',
      name: 'Test User',
      login: 'testuser',
      role: 'resident',
      phone: '+998901234567',
    }
    const mockToken = 'jwt-test-token-123'
    localStorageMock.setItem('auth_token', 'old-session-token')
    authInstallOrder.length = 0

    vi.mocked(authApi.login).mockResolvedValueOnce({
      kind: 'success',
      user: mockUser,
      token: mockToken,
    })

    const result = await useAuthStore.getState().login('testuser', 'password123')

    expect(result).toBe('success')
    const state = useAuthStore.getState()
    expect(state.user).toEqual(mockUser)
    expect(state.token).toBe(mockToken)
    expect(state.isLoading).toBe(false)
    expect(state.error).toBeNull()
    expect(localStorageMock.getItem('auth_token')).toBe(mockToken)
    expect(resetSessionScopedState).toHaveBeenCalledTimes(1)
    expect(markLoggedIn).toHaveBeenCalledTimes(1)
    expect(authInstallOrder).toEqual(['reset', 'auth_token', 'markLoggedIn'])
  })

  it('demo login installs the session in the same atomic order as manual login', async () => {
    const { authApi } = await import('../../services/api/auth')
    const mockUser: User = {
      id: 'demo-user', name: 'Демо Директор', login: 'demo-director',
      role: 'director', phone: '',
    }
    vi.mocked(authApi.demoLogin).mockResolvedValueOnce({ user: mockUser, token: 'demo-token', demoSession: true })
    authInstallOrder.length = 0

    const result = await useAuthStore.getState().demoLogin('director')

    expect(result).toBe('success')
    expect(useAuthStore.getState().user).toEqual(mockUser)
    expect(useAuthStore.getState().token).toBe('demo-token')
    expect(authInstallOrder).toEqual(['reset', 'auth_token', 'markLoggedIn'])
  })

  it('does not start a quick login while manual login is in flight', async () => {
    const { authApi } = await import('../../services/api/auth')
    let finishManual!: (value: { kind: 'success'; user: User; token: string }) => void
    vi.mocked(authApi.login).mockReturnValueOnce(new Promise((resolve) => { finishManual = resolve }))

    const manualAttempt = useAuthStore.getState().login('resident', 'secret')
    const quickOutcome = await useAuthStore.getState().demoLogin('director')

    expect(quickOutcome).toBe('error')
    expect(authApi.demoLogin).not.toHaveBeenCalled()
    finishManual({
      kind: 'success',
      user: { id: 'resident-1', name: 'Resident', login: 'resident', role: 'resident', phone: '' },
      token: 'resident-token',
    })
    await manualAttempt
  })

  it('does not start manual login while quick login is in flight', async () => {
    const { authApi } = await import('../../services/api/auth')
    let finishQuick!: (value: { user: User; token: string; demoSession: true }) => void
    vi.mocked(authApi.demoLogin).mockReturnValueOnce(new Promise((resolve) => { finishQuick = resolve }))

    const quickAttempt = useAuthStore.getState().demoLogin('director')
    const manualOutcome = await useAuthStore.getState().login('resident', 'secret')

    expect(manualOutcome).toBe('error')
    expect(authApi.login).not.toHaveBeenCalled()
    finishQuick({
      user: { id: 'demo-user', name: 'Director', login: 'demo-director', role: 'director', phone: '' },
      token: 'demo-token',
      demoSession: true,
    })
    await quickAttempt
  })

  it('login returns error and preserves the active session on failure', async () => {
    const { authApi } = await import('../../services/api/auth')
    const currentUser = { id: 'user-a', name: 'Current User', login: 'current', role: 'resident', phone: '+998900000000' } as User
    useAuthStore.setState({ user: currentUser, token: 'current-token' })
    localStorageMock.setItem('auth_token', 'current-token')

    vi.mocked(authApi.login).mockRejectedValueOnce(new Error('Неверный логин или пароль'))

    const result = await useAuthStore.getState().login('baduser', 'badpassword')

    expect(result).toBe('error')
    const state = useAuthStore.getState()
    expect(state.user).toEqual(currentUser)
    expect(state.token).toBe('current-token')
    expect(localStorageMock.getItem('auth_token')).toBe('current-token')
    expect(state.error).toBe('Неверный логин или пароль')
    expect(state.isLoading).toBe(false)
    expect(resetSessionScopedState).not.toHaveBeenCalled()
  })

  it('does not reset the current session when login needs tenant selection', async () => {
    const { authApi } = await import('../../services/api/auth')
    const currentUser = { id: 'user-a', name: 'Current User', login: 'current', role: 'resident', phone: '+998900000000' } as User
    useAuthStore.setState({ user: currentUser, token: 'current-token' })
    localStorageMock.setItem('auth_token', 'current-token')
    vi.mocked(authApi.login).mockResolvedValueOnce({
      kind: 'picker',
      tenants: [{ slug: 'tenant-a', name: 'Tenant A', logo: null }],
    })

    const result = await useAuthStore.getState().login('testuser', 'password123')

    expect(result).toBe('picker')
    expect(useAuthStore.getState().user).toEqual(currentUser)
    expect(useAuthStore.getState().token).toBe('current-token')
    expect(localStorageMock.getItem('auth_token')).toBe('current-token')
    expect(resetSessionScopedState).not.toHaveBeenCalled()
  })

  it('logout clears user and token', async () => {
    const { authApi } = await import('../../services/api/auth')

    // Set up logged-in state
    useAuthStore.setState({
      user: { id: 'user-1', name: 'Test', login: 'test', role: 'resident', phone: '+998900000000' } as User,
      token: 'some-token',
    })

    useAuthStore.getState().logout()

    expect(authApi.logout).toHaveBeenCalled()
    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.token).toBeNull()
    expect(state.error).toBeNull()
    expect(resetSessionScopedState).toHaveBeenCalledTimes(1)
  })

  it('isAuthenticated: token exists means authenticated', () => {
    // No token → not authenticated
    expect(useAuthStore.getState().token).toBeNull()

    // With token → authenticated
    useAuthStore.setState({ token: 'valid-token', user: { id: '1', name: 'Test', login: 'test', role: 'resident', phone: '+998900000000' } as User })
    const state = useAuthStore.getState()
    expect(state.token).toBeTruthy()
    expect(state.user).not.toBeNull()
  })
})
