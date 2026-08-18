import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../stores/buildingStore', () => ({
  useBuildingStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    buildings: [{ id: 'building-1', name: 'Orzu', totalArea: 1000 }],
    fetchBuildings: vi.fn(),
  }),
}));

vi.mock('../../../services/api', () => ({
  estimateV2Api: {},
  branchesApi: { getAll: vi.fn(() => new Promise(() => {})) },
}));

import { EstimateV2WizardPage } from '../estimate-v2/EstimateV2WizardPage';
import { useAuthStore } from '../../../stores/authStore';
import { useLanguageStore } from '../../../stores/languageStore';

const director = {
  id: 'director-1', login: 'director', phone: '+998900000000', name: 'Director', role: 'director' as const,
};

describe('EstimateV2WizardPage demo capability', () => {
  beforeEach(() => useLanguageStore.setState({ language: 'ru' }));

  it('keeps the estimate preview visible but removes direct create/save navigation in demo', () => {
    useAuthStore.setState({ user: { ...director, demoSession: true } });
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><EstimateV2WizardPage /></MemoryRouter>);

    expect(screen.getByRole('heading', { name: 'Новая смета' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Демо-режим: финансовые данные доступны только для просмотра');
    expect(screen.queryByRole('button', { name: 'Далее →' })).not.toBeInTheDocument();
  });

  it('keeps direct create navigation for ordinary sessions', () => {
    useAuthStore.setState({ user: director });
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><EstimateV2WizardPage /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Далее →' })).toBeInTheDocument();
  });
});
