// Payments store — Zustand module for payments management

import { create } from 'zustand';
import { registerSessionStore } from './sessionRegistry';
import { paymentsApi } from '../services/api';
import type { PaymentDto, PaymentPaginationDto } from '../services/api/payments';

interface PaymentFilters {
  apartment_id?: string;
  period?: string;
  status?: string;
}

interface PaymentsState {
  payments: PaymentDto[];
  isLoading: boolean;
  error: string | null;
  filters: PaymentFilters;
  pagination: PaymentPaginationDto | null;
  balance: { apartment_id: string; total_charged: number; total_paid: number; balance: number } | null;
  isLoadingBalance: boolean;

  setFilters: (filters: PaymentFilters) => void;
  fetchPayments: (page?: number) => Promise<void>;
  fetchBalance: (apartmentId: string) => Promise<void>;
}

export const usePaymentsStore = create<PaymentsState>()((set, get) => ({
  payments: [],
  isLoading: false,
  error: null,
  filters: {},
  pagination: null,
  balance: null,
  isLoadingBalance: false,

  setFilters: (filters) => set({ filters }),

  fetchPayments: async (page = 1) => {
    set({ isLoading: true, error: null });
    try {
      const { filters } = get();
      const result = await paymentsApi.getPayments({ ...filters, page, limit: 50 });
      set({
        payments: result.payments || [],
        pagination: result.pagination || null,
        isLoading: false,
      });
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : 'Failed to load payments', isLoading: false });
    }
  },

  fetchBalance: async (apartmentId) => {
    set({ isLoadingBalance: true });
    try {
      const result = await paymentsApi.getBalance(apartmentId);
      set({ balance: result, isLoadingBalance: false });
    } catch {
      set({ balance: null, isLoadingBalance: false });
    }
  },
}));

registerSessionStore(usePaymentsStore);
