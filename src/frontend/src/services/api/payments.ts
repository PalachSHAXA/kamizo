// Payments API

import { apiRequest, cachedGet, CACHE_TTL } from './client';

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
    return apiRequest<{ payments: any[]; pagination?: any }>(`/api/payments${query ? '?' + query : ''}`);
  },

  createPayment: async (data: {
    apartment_id: string;
    amount: number;
    payment_type: string;
    period?: string;
    description?: string;
  }) => {
    return apiRequest<{ payment: any }>('/api/payments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getBalance: async (apartmentId: string) => {
    return cachedGet<{ apartment_id: string; total_charged: number; total_paid: number; balance: number }>(
      `/api/apartments/${apartmentId}/balance`,
      CACHE_TTL.SHORT
    );
  },
};
