import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the finance API module
vi.mock('../../services/api/finance', () => ({
  financeApi: {
    getEstimates: vi.fn(),
    createEstimate: vi.fn(),
    getPayments: vi.fn(),
    createPayment: vi.fn(),
    getCharges: vi.fn(),
    getDebtors: vi.fn(),
    getIncome: vi.fn(),
    getMaterials: vi.fn(),
    getFinanceAccess: vi.fn(),
    getIncomeCategories: vi.fn(),
  },
}))

// Mock the toast store so side effects don't interfere
vi.mock('../toastStore', () => ({
  useToastStore: {
    getState: () => ({
      addToast: vi.fn(),
    }),
  },
}))

import { useFinanceStore } from '../financeStore'

describe('financeStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useFinanceStore.setState({
      estimates: [],
      currentEstimate: null,
      estimatesLoading: false,
      charges: [],
      chargesPagination: null,
      chargesSummary: null,
      chargesLoading: false,
      payments: [],
      paymentsPagination: null,
      paymentsLoading: false,
      debtors: [],
      debtorsLoading: false,
      income: [],
      incomeCategories: [],
      incomeLoading: false,
      materials: [],
      materialsLoading: false,
      financeAccess: [],
      accessLoading: false,
      filters: { buildingId: '', period: '', status: '' },
    })
  })

  it('has correct initial state', () => {
    const state = useFinanceStore.getState()
    expect(state.estimates).toEqual([])
    expect(state.charges).toEqual([])
    expect(state.payments).toEqual([])
    expect(state.debtors).toEqual([])
    expect(state.estimatesLoading).toBe(false)
    expect(state.chargesLoading).toBe(false)
    expect(state.paymentsLoading).toBe(false)
  })

  it('setFilters updates filters', () => {
    useFinanceStore.getState().setFilters({ buildingId: 'b1', period: '2026-03' })
    const state = useFinanceStore.getState()
    expect(state.filters.buildingId).toBe('b1')
    expect(state.filters.period).toBe('2026-03')
    // status should remain default
    expect(state.filters.status).toBe('')
  })

  it('setFilters merges with existing filters', () => {
    useFinanceStore.getState().setFilters({ buildingId: 'b1' })
    useFinanceStore.getState().setFilters({ period: '2026-04' })
    const state = useFinanceStore.getState()
    expect(state.filters.buildingId).toBe('b1')
    expect(state.filters.period).toBe('2026-04')
  })

  it('setFilters can update status independently', () => {
    useFinanceStore.getState().setFilters({ status: 'active' })
    const state = useFinanceStore.getState()
    expect(state.filters.status).toBe('active')
    expect(state.filters.buildingId).toBe('')
    expect(state.filters.period).toBe('')
  })
})
