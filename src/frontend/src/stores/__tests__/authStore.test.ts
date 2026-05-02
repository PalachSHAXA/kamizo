import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAuthStore } from '../authStore'
import type { User } from '../../types'

// Mock the API modules
vi.mock('../../services/api', () => ({
  authApi: {
    login: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
    registerBulk: vi.fn(),
  },
  usersApi: {
    updateMe: vi.fn(),
    changePassword: vi.fn(),
    adminChangePassword: vi.fn(),
    markContractSigned: vi.fn(),
    getMe: vi.fn(),
  },
}))

// Mock localStorage
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
    const { authApi } = await import('../../services/api')
    const mockUser = {
      id: 'user-1',
      name: 'Test User',
      login: 'testuser',
      role: 'resident',
      phone: '+998901234567',
    }
    const mockToken = 'jwt-test-token-123'

    vi.mocked(authApi.login).mockResolvedValueOnce({
      user: mockUser,
      token: mockToken,
    })

    const result = await useAuthStore.getState().login('testuser', 'password123')

    expect(result).toBe(true)
    const state = useAuthStore.getState()
    expect(state.user).toEqual(mockUser)
    expect(state.token).toBe(mockToken)
    expect(state.isLoading).toBe(false)
    expect(state.error).toBeNull()
    expect(localStorageMock.getItem('auth_token')).toBe(mockToken)
  })

  it('login returns false and sets error on failure', async () => {
    const { authApi } = await import('../../services/api')

    vi.mocked(authApi.login).mockRejectedValueOnce(new Error('Неверный логин или пароль'))

    const result = await useAuthStore.getState().login('baduser', 'badpassword')

    expect(result).toBe(false)
    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.token).toBeNull()
    expect(state.error).toBe('Неверный логин или пароль')
    expect(state.isLoading).toBe(false)
  })

  it('logout clears user and token', async () => {
    const { authApi } = await import('../../services/api')

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
