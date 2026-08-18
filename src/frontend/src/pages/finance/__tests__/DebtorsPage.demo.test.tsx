import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchDebtors: vi.fn(),
  fetchBuildings: vi.fn(),
  generateReconciliation: vi.fn(),
  generatePretension: vi.fn(),
}));

vi.mock('../../../stores/financeStore', () => ({
  useFinanceStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    debtors: [{
      apartment_id: 'apt-1', apartment_number: '12', building_id: 'building-1',
      building_name: 'Orzu', owner_name: 'Ali Karimov', owner_phone: '+998901234567',
      total_debt: 500000, months_overdue: 3, last_payment_date: null,
    }],
    debtorsLoading: false,
    fetchDebtors: mocks.fetchDebtors,
    generateReconciliation: mocks.generateReconciliation,
    generatePretension: mocks.generatePretension,
    setFilters: vi.fn(),
  }),
}));

vi.mock('../../../stores/buildingStore', () => ({
  useBuildingStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    buildings: [{ id: 'building-1', name: 'Orzu' }],
    fetchBuildings: mocks.fetchBuildings,
  }),
}));

import DebtorsPage from '../DebtorsPage';
import { useAuthStore } from '../../../stores/authStore';
import { useLanguageStore } from '../../../stores/languageStore';

const director = {
  id: 'director-1', login: 'director', phone: '+998900000000', name: 'Director', role: 'director' as const,
};

describe('DebtorsPage demo capability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchDebtors.mockResolvedValue(undefined);
    mocks.fetchBuildings.mockResolvedValue(undefined);
    useLanguageStore.setState({ language: 'ru' });
  });

  it('shows debt data but hides claim and reconciliation mutations in demo', async () => {
    useAuthStore.setState({ user: { ...director, demoSession: true } });
    render(<DebtorsPage />);

    expect((await screen.findAllByText('Ali Karimov')).length).toBeGreaterThan(0);
    expect(screen.getByRole('status')).toHaveTextContent('Демо-режим: финансовые данные доступны только для просмотра');
    expect(screen.queryByRole('button', { name: 'Сверка' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Претензия' })).not.toBeInTheDocument();
  });

  it('keeps ordinary-session claim controls', async () => {
    useAuthStore.setState({ user: director });
    render(<DebtorsPage />);
    expect((await screen.findAllByRole('button', { name: 'Сверка' })).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Претензия' }).length).toBeGreaterThan(0);
  });
});
