// Finance API module

import { apiRequest, cachedGet, CACHE_TTL } from './client';

function buildQuery(filters?: Record<string, string | number | undefined>): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  for (const [key, val] of Object.entries(filters)) {
    if (val !== undefined && val !== '') params.append(key, String(val));
  }
  const q = params.toString();
  return q ? '?' + q : '';
}

export const financeApi = {
  // ── Estimates ────────────────────────────────
  getEstimates: (filters?: { building_id?: string; period?: string; status?: string }) =>
    apiRequest<{ estimates: Record<string, unknown>[] }>(`/api/finance/estimates${buildQuery(filters)}`),

  getEstimate: (id: string) =>
    apiRequest<{ estimate: Record<string, unknown> }>(`/api/finance/estimates/${id}`),

  createEstimate: (data: {
    building_id: string; period: string; title?: string;
    items: { name: string; category?: string; amount: number; description?: string }[];
    uk_profit_percent?: number; non_commercial_coefficient?: number; show_profit_to_residents?: number;
  }) => apiRequest<{ estimate: Record<string, unknown> }>('/api/finance/estimates', {
    method: 'POST', body: JSON.stringify(data),
  }),

  updateEstimate: (id: string, data: Record<string, unknown>) =>
    apiRequest<{ success: boolean }>(`/api/finance/estimates/${id}`, {
      method: 'PUT', body: JSON.stringify(data),
    }),

  activateEstimate: (id: string) =>
    apiRequest<{ success: boolean }>(`/api/finance/estimates/${id}/activate`, { method: 'POST' }),

  // ── Charges ──────────────────────────────────
  generateCharges: (estimateId: string) =>
    apiRequest<{ success: boolean; generated: number; total_apartments: number }>(
      '/api/finance/charges/generate', { method: 'POST', body: JSON.stringify({ estimate_id: estimateId }) }
    ),

  getCharges: (filters?: { apartment_id?: string; period?: string; status?: string; building_id?: string; page?: number; limit?: number }) =>
    apiRequest<{ data: Record<string, unknown>[]; pagination: Record<string, unknown> }>(`/api/finance/charges${buildQuery(filters)}`),

  getChargesSummary: (buildingId: string, period?: string) =>
    cachedGet<{ summary: Record<string, unknown> }>(
      `/api/finance/charges/summary?building_id=${buildingId}${period ? '&period=' + period : ''}`,
      CACHE_TTL.SHORT
    ),

  // ── Payments ─────────────────────────────────
  createPayment: (data: {
    apartment_id: string; amount: number; payment_type?: string; receipt_number?: string; description?: string;
  }) => apiRequest<{ payment: Record<string, unknown> }>('/api/finance/payments', {
    method: 'POST', body: JSON.stringify(data),
  }),

  getPayments: (filters?: { apartment_id?: string; period?: string; payment_type?: string; page?: number; limit?: number }) =>
    apiRequest<{ data: Record<string, unknown>[]; pagination: Record<string, unknown> }>(`/api/finance/payments${buildQuery(filters)}`),

  // ── Debtors ──────────────────────────────────
  getDebtors: (filters?: { building_id?: string; min_debt?: number; min_months_overdue?: number }) =>
    apiRequest<{ debtors: Record<string, unknown>[] }>(`/api/finance/debtors${buildQuery(filters)}`),

  // ── Income ───────────────────────────────────
  getIncome: (filters?: { period?: string; category_id?: string }) =>
    apiRequest<{ income: Record<string, unknown>[] }>(`/api/finance/income${buildQuery(filters)}`),

  createIncome: (data: {
    category_id?: string; amount: number; period?: string; description?: string; source_type?: string;
  }) => apiRequest<{ income: Record<string, unknown> }>('/api/finance/income', {
    method: 'POST', body: JSON.stringify(data),
  }),

  getIncomeCategories: () =>
    cachedGet<{ categories: Record<string, unknown>[] }>('/api/finance/income/categories', CACHE_TTL.MEDIUM),

  createIncomeCategory: (name: string) =>
    apiRequest<{ category: Record<string, unknown> }>('/api/finance/income/categories', {
      method: 'POST', body: JSON.stringify({ name }),
    }),

  // ── Materials ────────────────────────────────
  getMaterials: (buildingId?: string) =>
    apiRequest<{ materials: Record<string, unknown>[] }>(`/api/finance/materials${buildingId ? '?building_id=' + buildingId : ''}`),

  createMaterial: (data: {
    id?: string; name: string; unit?: string; quantity?: number; price_per_unit?: number; min_quantity?: number; building_id?: string;
  }) => apiRequest<{ material: Record<string, unknown> }>('/api/finance/materials', {
    method: 'POST', body: JSON.stringify(data),
  }),

  useMaterial: (id: string, data: { quantity: number; request_id?: string; description?: string }) =>
    apiRequest<{ usage: Record<string, unknown>; new_quantity: number }>(`/api/finance/materials/${id}/usage`, {
      method: 'POST', body: JSON.stringify(data),
    }),

  // ── Claims ───────────────────────────────────
  generateReconciliation: (data: { apartment_id: string; period_from: string; period_to: string }) =>
    apiRequest<Record<string, unknown>>('/api/finance/claims/reconciliation', {
      method: 'POST', body: JSON.stringify(data),
    }),

  generatePretension: (apartmentId: string) =>
    apiRequest<Record<string, unknown>>('/api/finance/claims/pretension', {
      method: 'POST', body: JSON.stringify({ apartment_id: apartmentId }),
    }),

  // ── Access ───────────────────────────────────
  getFinanceAccess: () =>
    apiRequest<{ access: Record<string, unknown>[] }>('/api/finance/access'),

  grantFinanceAccess: (userId: string, level: string) =>
    apiRequest<{ access: Record<string, unknown> }>('/api/finance/access', {
      method: 'POST', body: JSON.stringify({ user_id: userId, access_level: level }),
    }),

  revokeFinanceAccess: (id: string) =>
    apiRequest<{ success: boolean }>(`/api/finance/access/${id}`, { method: 'DELETE' }),

  // ── Apartment Balance ────────────────────────
  getApartmentBalance: (apartmentId: string) =>
    cachedGet<{ balance: Record<string, unknown>; charges_by_month: Record<string, unknown>[] }>(
      `/api/finance/apartments/${apartmentId}/balance`,
      CACHE_TTL.SHORT
    ),

  // ── Building charge status (for residents) ───
  getBuildingChargeStatus: (buildingId: string, period: string) =>
    apiRequest<{ statuses: { apartment_number: string; status: string }[] }>(
      `/api/finance/charges/building-status?building_id=${buildingId}&period=${period}`
    ),
};
