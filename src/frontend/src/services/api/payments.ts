// Payments API

import { apiRequest, cachedGet, CACHE_TTL } from './client';

export interface PaymentDto {
  id: string;
  apartment_id: string;
  apartment_number?: string;
  amount: number;
  payment_type: string;
  period?: string;
  status?: string;
  description?: string;
  created_at: string;
}

export interface PaymentPaginationDto {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export const paymentsApi = {
  getPayments: async (filters?: {
    apartment_id?: string;
    period?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) => {
    const params = new URLSearchParams();
    if (filters?.apartment_id) params.append('apartment_id', filters.apartment_id);
    if (filters?.period) params.append('period', filters.period);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.page) params.append('page', String(filters.page));
    if (filters?.limit) params.append('limit', String(filters.limit));
    const query = params.toString();
    return apiRequest<{ payments: PaymentDto[]; pagination?: PaymentPaginationDto }>(`/api/payments${query ? '?' + query : ''}`);
  },

  getBalance: async (apartmentId: string) => {
    return cachedGet<{ apartment_id: string; total_charged: number; total_paid: number; balance: number }>(
      `/api/apartments/${apartmentId}/balance`,
      CACHE_TTL.SHORT
    );
  },
};
