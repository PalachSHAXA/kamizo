import { describe, it, expect, beforeEach, vi } from 'vitest'
import { usePaymentsStore } from '../paymentsStore'

// Mock API
vi.mock('../../services/api', () => ({
  paymentsApi: {
    getPayments: vi.fn(),
    getBalance: vi.fn(),
  },
}))

// Mock toast store
vi.mock('../toastStore', () => ({
  useToastStore: {
    getState: () => ({
      addToast: vi.fn(),
    }),
  },
}))

import { paymentsApi } from '../../services/api'

const mockedApi = paymentsApi as {
  getPayments: ReturnType<typeof vi.fn>
  getBalance: ReturnType<typeof vi.fn>
}

describe('paymentsStore', () => {
  beforeEach(() => {
    // Reset store state
    usePaymentsStore.setState({
      payments: [],
      isLoading: false,
      error: null,
      filters: {},
      pagination: null,
      balance: null,
      isLoadingBalance: false,
    })
    vi.clearAllMocks()
  })

  it('has correct initial state', () => {
    const state = usePaymentsStore.getState()
    expect(state.payments).toEqual([])
    expect(state.isLoading).toBe(false)
    expect(state.error).toBeNull()
    expect(state.filters).toEqual({})
    expect(state.pagination).toBeNull()
    expect(state).not.toHaveProperty('createPayment')
  })

  it('fetchPayments loads payments from API', async () => {
    const mockPayments = [
      { id: '1', amount: 100, status: 'paid' },
      { id: '2', amount: 200, status: 'pending' },
    ]
    mockedApi.getPayments.mockResolvedValueOnce({
      payments: mockPayments,
      pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
    })

    await usePaymentsStore.getState().fetchPayments()

    const state = usePaymentsStore.getState()
    expect(state.payments).toEqual(mockPayments)
    expect(state.isLoading).toBe(false)
    expect(state.error).toBeNull()
    expect(mockedApi.getPayments).toHaveBeenCalledOnce()
  })

  it('fetchPayments sets error on failure', async () => {
    mockedApi.getPayments.mockRejectedValueOnce(new Error('Network error'))

    await usePaymentsStore.getState().fetchPayments()

    const state = usePaymentsStore.getState()
    expect(state.payments).toEqual([])
    expect(state.error).toBe('Network error')
    expect(state.isLoading).toBe(false)
  })

})
