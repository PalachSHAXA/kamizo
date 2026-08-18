import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock('../../../services/api/finance-v2', () => ({
  penaltyApi: {
    getSettings: mocks.getSettings,
    updateSettings: mocks.updateSettings,
  },
}));

import { useAuthStore } from '../../../stores/authStore';
import { useLanguageStore } from '../../../stores/languageStore';
import { PenaltySettingsCard } from '../estimate-v2/PenaltySettingsCard';

describe('PenaltySettingsCard touch targets', () => {
  beforeEach(() => {
    mocks.getSettings.mockResolvedValue({ enabled: true, daily_rate: 0.001, grace_days: 30, max_multiplier: 1 });
    useAuthStore.setState({ user: { id: 'admin-1', login: 'admin', phone: '+998900000000', name: 'Admin', role: 'admin' } });
    useLanguageStore.setState({ language: 'ru' });
  });

  it('uses 44px targets for the toggle, fields, and save action', async () => {
    render(<PenaltySettingsCard />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Сохранить' })).toBeInTheDocument());

    expect(screen.getByRole('checkbox').closest('label')).toHaveClass('min-h-[44px]');
    for (const field of screen.getAllByRole('spinbutton')) expect(field).toHaveClass('min-h-[44px]');
    expect(screen.getByRole('button', { name: 'Сохранить' })).toHaveClass('min-h-[44px]');
  });
});
