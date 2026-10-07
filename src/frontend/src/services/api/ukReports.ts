import { apiRequest, API_URL, getToken } from './client';

export type UkReportType = 'financial' | 'completed_works';

export interface UkReport {
  id: string;
  report_type: UkReportType;
  title: string;
  period_label: string;
  description: string | null;
  building_id: string | null;
  published_at: string;
  file_name: string | null;
  file_size?: number;
  is_active?: number;
}

export interface CompletedWorkItem {
  id: string;
  number: string | null;
  title: string;
  priority: string | null;
  completed_at: string;
}

export interface CompletedRequestItem extends CompletedWorkItem {
  category_id: string | null;
}

export interface CompletedWorkOrderItem extends CompletedWorkItem {
  type: string | null;
}

export interface WorksPreviewPayload {
  building: { id: string; name: string; address: string | null };
  period_from: string;
  date_to: string;
  generated_at: string;
  summary: {
    requests_received: number;
    requests_completed: number;
    requests_cancelled: number;
    work_orders_completed: number;
  };
  completed_requests: CompletedRequestItem[];
  completed_work_orders: CompletedWorkOrderItem[];
}

export interface ResidentUkEstimate {
  estimate: {
    id: string;
    title: string;
    period: string;
    effective_date: string;
    model: 'TARIFF_CALCULATED' | 'TARIFF_MANUAL' | 'TARIFF_FLAT';
    scope_level: 'building' | 'complex';
  };
  building: {
    id: string;
    name: string;
    address: string | null;
    residential_area: number;
  };
  tariff: {
    per_sqm: number;
    tariff_with_vat: number;
    vat_enabled: boolean;
    vat_rate: number;
  };
  summary: {
    monthly_expenses: number;
    annual_expenses: number;
    monthly_income_offsets: number;
    annual_savings: number;
    fot_monthly: number;
    show_profit: boolean;
    profit_percent?: number;
  };
  staff: Array<{ title: string; units: number; monthly_fund: number }>;
  expenses: Array<{ name: string; section: string; monthly: number; annual: number }>;
  incomes: Array<{ type: string; monthly: number; annual: number }>;
}

interface UkReportsResponse {
  reports: UkReport[];
}

function reportsFrom(response: UkReportsResponse | UkReport[]): UkReport[] {
  return Array.isArray(response) ? response : response.reports || [];
}

async function fetchReportPdf(report: UkReport): Promise<Blob> {
  const url = `${API_URL}/api/uk-reports/${report.id}/file`;
  const token = getToken();
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) throw new Error('PDF download failed');
  return response.blob();
}

export const residentUkReportsApi = {
  estimate: () => apiRequest<ResidentUkEstimate>('/api/resident/uk-estimate'),
  list: async (type: UkReportType) => reportsFrom(await apiRequest<UkReportsResponse | UkReport[]>(
    `/api/resident/uk-reports?type=${type}`,
  )),
  downloadPdf: fetchReportPdf,
};

export const adminUkReportsApi = {
  list: async (type: UkReportType) => reportsFrom(await apiRequest<UkReportsResponse | UkReport[]>(
    `/api/admin/uk-reports?type=${type}`,
  )).filter(report => report.is_active !== 0),
  publish: (formData: FormData) => apiRequest<UkReport>('/api/admin/uk-reports', {
    method: 'POST',
    body: formData,
  }),
  worksPreview: (params: { building_id: string; date_from: string; date_to: string }) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest<WorksPreviewPayload>(`/api/admin/uk-reports/works-preview?${query}`);
  },
  archive: (id: string) => apiRequest<{ success: boolean }>(`/api/admin/uk-reports/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active: false }),
  }),
  downloadPdf: fetchReportPdf,
};
