import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ preview: vi.fn(), save: vi.fn() }));

vi.mock('../../../services/api/finance-v2', () => ({ factReportApi: api }));

import { FactReportPage } from '../estimate-v2/FactReportPage';
import { useAuthStore } from '../../../stores/authStore';
import { useLanguageStore } from '../../../stores/languageStore';
import { useBuildingStore } from '../../../stores/buildingStore';

const director = {
  id: 'director-1', login: 'director', phone: '+998900000000', name: 'Director', role: 'director' as const,
};
const report = {
  building: { name: 'Orzu', address: 'Tashkent' }, period_from: '2026-01', period_to: '2026-08',
  rows: [], totals: { prior_debt: 0, accrued: 0, paid: 0, arrears: 0 },
  uk_income_plan: 0, uk_income_fact: 0, charges_count: 0, payments_count: 0,
};

describe('FactReportPage demo capability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.preview.mockResolvedValue(report);
    useLanguageStore.setState({ language: 'ru' });
    useBuildingStore.setState({
      buildings: [{ id: 'building-1', name: 'Orzu', address: 'Tashkent' }] as never,
      fetchBuildings: vi.fn(),
    });
  });

  it('allows report preview and print but hides snapshot save in demo', async () => {
    useAuthStore.setState({ user: { ...director, demoSession: true } });
    render(<FactReportPage />);
    expect(screen.getByRole('status')).toHaveTextContent('Демо-режим: финансовые данные доступны только для просмотра');

    fireEvent.click(screen.getByRole('button', { name: 'Построить' }));
    expect(await screen.findByRole('button', { name: 'Печать / PDF' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Сохранить снепшот' })).not.toBeInTheDocument();
  });
});
