import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  estimate: vi.fn(),
  list: vi.fn(),
  downloadPdf: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  residentUkReportsApi: mocks,
}));

vi.mock('../../../stores/languageStore', () => ({
  useLanguageStore: (selector: (state: { language: 'ru' }) => unknown) => selector({ language: 'ru' }),
}));

vi.mock('../../../stores/authStore', () => ({
  useAuthStore: (selector: (state: { user: null }) => unknown) => selector({ user: null }),
}));

vi.mock('../../../stores/buildingStore', () => ({
  useBuildingStore: (selector: (state: { buildings: never[]; fetchBuildingById: () => Promise<void> }) => unknown) => selector({
    buildings: [],
    fetchBuildingById: vi.fn(),
  }),
}));

vi.mock('../../../utils/downloadFile', () => ({ downloadBlob: vi.fn() }));

import { ApiError } from '../../../services/api';
import { ResidentUkReportsPage } from '../ResidentUkReportsPage';

const estimatePayload = {
  estimate: {
    id: 'estimate-1',
    title: 'Смета на 2026 год',
    period: '2026-09',
    effective_date: '2026-09-01',
    model: 'TARIFF_CALCULATED',
    scope_level: 'building',
  },
  building: { id: 'building-1', name: 'Дом 1', address: 'ул. Тестовая, 1', residential_area: 5000 },
  tariff: { per_sqm: 1250, tariff_with_vat: 1400, vat_enabled: false, vat_rate: 12 },
  summary: {
    monthly_expenses: 6250000,
    annual_expenses: 75000000,
    monthly_income_offsets: 300000,
    annual_savings: 3600000,
    fot_monthly: 2400000,
    show_profit: false,
  },
  staff: [{ title: 'Дворник', units: 2, monthly_fund: 1600000 }],
  expenses: [{ name: 'Уборка', section: 'production', monthly: 1600000, annual: 19200000 }],
  incomes: [{ type: 'telecom', monthly: 300000, annual: 3600000 }],
};

describe('ResidentUkReportsPage estimate tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.estimate.mockResolvedValue(estimatePayload);
    mocks.list.mockResolvedValue([]);
  });

  it('loads only the estimate initially and fetches reports after their tab is activated', async () => {
    render(<ResidentUkReportsPage />);

    expect(await screen.findByText('Действующий тариф')).toBeInTheDocument();
    expect(screen.getByText('Начисление за вашу квартиру = площадь квартиры × тариф.')).toBeInTheDocument();
    expect(screen.getByText('Дворник')).toBeInTheDocument();
    expect(mocks.estimate).toHaveBeenCalledTimes(1);
    expect(mocks.list).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('tab', { name: 'Финансовый отчёт' }));

    await waitFor(() => expect(mocks.list).toHaveBeenCalledWith('financial'));
    expect(mocks.estimate).toHaveBeenCalledTimes(1);
  });

  it('renders the estimate empty state for a 404 response', async () => {
    mocks.estimate.mockRejectedValue(new ApiError('Not found', 404, {}));

    render(<ResidentUkReportsPage />);

    expect(await screen.findByText('Действующей сметы пока нет')).toBeInTheDocument();
    expect(screen.queryByText('Не удалось загрузить смету')).not.toBeInTheDocument();
  });
});
