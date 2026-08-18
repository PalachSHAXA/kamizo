import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../stores/buildingStore', () => ({
  useBuildingStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    buildings: [{ id: 'building-1', name: 'Orzu' }],
    fetchBuildingById: vi.fn(),
  }),
}));

vi.mock('../../../services/api/finance', () => ({
  financeApi: {
    getCharges: vi.fn().mockResolvedValue({
      data: [{ id: 'charge-1', period: '2026-08', amount: 500000, paid_amount: 0, status: 'overdue' }],
    }),
    getPayments: vi.fn().mockResolvedValue({ data: [] }),
  },
}));

import { ResidentFinancePage } from '../ResidentFinancePage';
import { useAuthStore } from '../../../stores/authStore';
import { useLanguageStore } from '../../../stores/languageStore';

const resident = {
  id: 'resident-1', login: 'resident', phone: '+998900000000', name: 'Resident', role: 'resident' as const,
  buildingId: 'building-1', apartment: '12',
};

describe('ResidentFinancePage demo capability', () => {
  beforeEach(() => useLanguageStore.setState({ language: 'ru' }));

  it('keeps charges visible but hides reconciliation and payment mutations in demo', async () => {
    useAuthStore.setState({ user: { ...resident, demoSession: true } });
    render(<ResidentFinancePage />);

    expect((await screen.findAllByText('500 000')).length).toBeGreaterThan(0);
    expect(screen.getByRole('status')).toHaveTextContent('Демо-режим: финансовые данные доступны только для просмотра');
    expect(screen.queryByRole('button', { name: /Акт сверки/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Оплатить/ })).not.toBeInTheDocument();
  });
});
