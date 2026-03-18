import { describe, it, expect, beforeEach, vi } from 'vitest'
import { usePaymentsStore } from '../paymentsStore'

// Mock API
vi.mock('../../services/api', () => ({
  paymentsApi: {
    getPayments: vi.fn(),
    createPayment: vi.fn(),
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
  createPayment: ReturnType<typeof vi.fn>
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

  it('createPayment calls API and returns true on success', async () => {
    mockedApi.createPayment.mockResolvedValueOnce({ payment: { id: '1' } })
    mockedApi.getPayments.mockResolvedValueOnce({ payments: [], pagination: null })

    const result = await usePaymentsStore.getState().createPayment({
      apartment_id: 'apt-1',
      amount: 500,
      payment_type: 'cash',
    })

    expect(result).toBe(true)
    expect(mockedApi.createPayment).toHaveBeenCalledOnce()
  })

  it('createPayment returns false on failure', async () => {
    mockedApi.createPayment.mockRejectedValueOnce(new Error('Payment failed'))

    const result = await usePaymentsStore.getState().createPayment({
      apartment_id: 'apt-1',
      amount: 500,
      payment_type: 'cash',
    })

    expect(result).toBe(false)
  })
})
