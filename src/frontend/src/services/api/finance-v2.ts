// Frontend client for /api/finance/estimates/v2 family — sprint 2 backend.
// Работает с новой моделью сметы (TARIFF_CALCULATED / MANUAL / FLAT),
// штатом и разделением статей на expense/income.

import { apiRequest, invalidateCache } from './client';

// ── Types (зеркалят cloudflare/src/lib/estimate/compute.ts) ────────────

export type EstimateModelV2 = 'TARIFF_CALCULATED' | 'TARIFF_MANUAL' | 'TARIFF_FLAT';

export interface StaffPositionV2 {
  title: string;
  units: number;   // может быть дробным (0.5)
  salary: number;  // ежемес. оклад
}

export type ExpenseSection = 'production' | 'periodic';
export type ItemUnit = 'flat' | 'per_sqm' | 'per_apt' | 'per_meter' | 'staff_computed';

export interface ExpenseLineV2 {
  name: string;
  monthly: number;
  section?: ExpenseSection;
  unit?: ItemUnit;
  linked_to_staff?: boolean;
  legal_code?: string;
}

export type IncomeType = 'commercial' | 'basement' | 'parking' | 'telecom' | 'other';

export interface IncomeStreamV2 {
  type: IncomeType;
  monthly: number;
}

export interface EstimateResultV2 {
  model: EstimateModelV2;
  staff_lines: Array<{ title: string; units: number; salary: number; monthly: number }>;
  fot_gross: number;
  payroll_tax: number;
  fot_total: number;
  total_expenses: number;
  income_breakdown: { commercial: number; basement: number; parking: number; telecom: number; other: number };
  before_profit_offset: number;
  self_cost_resident: number;
  base_per_m2: number;
  with_profit_per_m2: number;
  telecom_comp_per_m2: number;
  tariff_resident: number;
  tariff_effective: number;
  jami_tushum_year: number;
  umumiy_year: number;
  deficit_year: number;
}

export interface EstimateWarning {
  code: 'BELOW_MIN_TARIFF' | 'MISSING_MANDATORY_SERVICE' | 'REQUIRES_ASSEMBLY_DECISION' | 'RISK_UNNECESSARY';
  severity: 'error' | 'warning' | 'info';
  message_ru: string;
  message_uz: string;
  meta?: Record<string, unknown>;
}

// ── Client ───────────────────────────────────────────────────────────

function invalidateEstimates() {
  invalidateCache('/api/finance/estimates');
}

export const estimateV2Api = {
  create: (body: {
    building_id: string;
    period: string;                 // YYYY-MM
    title?: string;
    model: EstimateModelV2;
    uk_profit_percent?: number;     // 7 → 7% (не 0.07)
    payroll_tax_rate?: number;      // 0.24 или 0.25
    residential_area?: number;
    commercial_income?: number;
    basement_income?: number;
    parking_income?: number;
    telecom_income?: number;
    tariff_approved?: number;
    effective_date?: string;
  }) => {
    invalidateEstimates();
    return apiRequest<{ id: string; model: EstimateModelV2; status: string }>(
      '/api/finance/estimates/v2',
      { method: 'POST', body: JSON.stringify(body) }
    );
  },

  putStaff: (estimateId: string, staff: StaffPositionV2[]) => {
    invalidateEstimates();
    return apiRequest<{ ok: boolean; count: number }>(
      `/api/finance/estimates/${estimateId}/staff`,
      { method: 'PUT', body: JSON.stringify({ staff }) }
    );
  },

  putExpenses: (estimateId: string, items: ExpenseLineV2[]) => {
    invalidateEstimates();
    return apiRequest<{ ok: boolean; count: number }>(
      `/api/finance/estimates/${estimateId}/expenses`,
      { method: 'PUT', body: JSON.stringify({ items }) }
    );
  },

  putIncomes: (estimateId: string, items: IncomeStreamV2[]) => {
    invalidateEstimates();
    return apiRequest<{ ok: boolean; count: number; totals: Record<IncomeType, number> }>(
      `/api/finance/estimates/${estimateId}/incomes`,
      { method: 'PUT', body: JSON.stringify({ items }) }
    );
  },

  compute: (estimateId: string) =>
    apiRequest<{ input: unknown; result: EstimateResultV2 }>(
      `/api/finance/estimates/${estimateId}/compute`
    ),

  validate: (estimateId: string) =>
    apiRequest<{ warnings: EstimateWarning[] }>(
      `/api/finance/estimates/${estimateId}/validate`
    ),

  getFull: (estimateId: string) =>
    apiRequest<{
      estimate: Record<string, unknown>;
      input: unknown;
      result: EstimateResultV2;
      warnings: EstimateWarning[];
      building: { floors?: number; has_elevator?: boolean; has_pumps?: boolean };
    }>(`/api/finance/estimates/${estimateId}/full`),
};

// ── Resident-facing endpoints ────────────────────────────────────────

export interface MyChargeRow {
  id: string;
  apartment_id: string;
  period: string;
  amount: number;
  paid_amount: number;
  amount_breakdown: string | null;   // JSON string
  status: string;
  due_date: string | null;
  created_at: string;
}

export interface MyBalance {
  total_charged: number;
  total_paid: number;
  total_penalties?: number; // Sprint 7
  debt: number;      // должен УК (charged + penalties − paid > 0)
  overpaid: number;  // УК должна вернуть
  net: number;
}

export interface PenaltyRow {
  id: string;
  charge_id: string;
  apartment_id: string;
  principal_amount: number;
  penalty_rate: number;
  days_overdue: number;
  penalty_amount: number;
  status: 'accrued' | 'paid' | 'waived' | 'cancelled';
  calculated_at: string;
}

export interface MyApartmentRow {
  id: string;
  number: string;
  total_area: number;
  building_id: string;
}

export const residentFinanceApi = {
  /** Одним вызовом — все квартиры юзера + начисления + пени + правильный баланс. */
  getMy: () =>
    apiRequest<{
      apartments: MyApartmentRow[];
      charges: MyChargeRow[];
      penalties?: PenaltyRow[];  // Sprint 7
      balance: MyBalance;
    }>('/api/finance/my-charges'),
};

// ── Sprint 7: пени за просрочку ──────────────────────────────────────

export interface PenaltySettings {
  enabled: boolean;
  daily_rate: number;      // 0.001 = 0.1% в день
  grace_days: number;      // сколько дней после due_date до начала капанья
  max_multiplier: number;  // потолок = principal × N
}

export const penaltyApi = {
  getSettings: () => apiRequest<PenaltySettings>('/api/finance/penalty-settings'),

  updateSettings: (body: PenaltySettings) => {
    invalidateCache('/api/finance/penalty-settings');
    return apiRequest<{ ok: boolean } & PenaltySettings>(
      '/api/finance/penalty-settings',
      { method: 'PUT', body: JSON.stringify(body) }
    );
  },

  listByApartment: (apartmentId: string) =>
    apiRequest<{ penalties: (PenaltyRow & { charge_period?: string })[] }>(
      `/api/finance/apartments/${apartmentId}/penalties`
    ),

  waive: (id: string, reason?: string) => {
    invalidateCache('/api/finance');
    return apiRequest<{ ok: boolean }>(
      `/api/finance/penalties/${id}/waive`,
      { method: 'POST', body: JSON.stringify({ reason }) }
    );
  },
};

// ── Sprint 6: Fact-reports (ст.29 ЗРУ-581) ──────────────────────────

export interface FactReportRow {
  name: string;
  legal_code?: string | null;
  prior_debt: number;
  accrued: number;
  paid: number;
  arrears: number;
}

export interface FactReportPayload {
  building: { id: string; name: string; address?: string };
  period_from: string;   // YYYY-MM
  period_to: string;     // YYYY-MM
  rows: FactReportRow[];
  totals: { prior_debt: number; accrued: number; paid: number; arrears: number };
  uk_income_plan: number;
  uk_income_fact: number;
  charges_count?: number;
  payments_count?: number;
  id?: string;
  generated_by?: string;
  generated_at?: string;
}

export const factReportApi = {
  preview: (params: { building_id: string; period_from: string; period_to: string }) => {
    const qs = new URLSearchParams(params).toString();
    return apiRequest<FactReportPayload>(`/api/finance/fact-reports/preview?${qs}`);
  },

  save: (body: { building_id: string; period_from: string; period_to: string }) => {
    invalidateCache('/api/finance/fact-reports');
    return apiRequest<FactReportPayload>(
      '/api/finance/fact-reports',
      { method: 'POST', body: JSON.stringify(body) }
    );
  },

  list: (buildingId?: string) => {
    const qs = buildingId ? `?building_id=${encodeURIComponent(buildingId)}` : '';
    return apiRequest<{ reports: Array<{
      id: string;
      building_id: string;
      period_from: string;
      period_to: string;
      uk_income_plan: number;
      uk_income_fact: number;
      generated_by: string;
      generated_at: string;
    }> }>(`/api/finance/fact-reports${qs}`);
  },

  get: (id: string) => apiRequest<FactReportPayload>(`/api/finance/fact-reports/${id}`),
};
