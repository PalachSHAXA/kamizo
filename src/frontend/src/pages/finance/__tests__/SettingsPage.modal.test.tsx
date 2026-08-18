import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchFinanceAccess: vi.fn(),
  grantAccess: vi.fn(),
  revokeAccess: vi.fn(),
  getAll: vi.fn(),
}));

vi.mock('../../../stores/financeStore', () => ({
  useFinanceStore: () => ({
    financeAccess: [],
    accessLoading: false,
    fetchFinanceAccess: mocks.fetchFinanceAccess,
    grantAccess: mocks.grantAccess,
    revokeAccess: mocks.revokeAccess,
  }),
}));

vi.mock('../../../services/api', () => ({
  teamApi: { getAll: mocks.getAll },
}));

vi.mock('../estimate-v2/PenaltySettingsCard', () => ({
  PenaltySettingsCard: () => null,
}));

import { useAuthStore } from '../../../stores/authStore';
import { useLanguageStore } from '../../../stores/languageStore';
import SettingsPage from '../SettingsPage';

describe('Finance Settings common modal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchFinanceAccess.mockResolvedValue(undefined);
    mocks.getAll.mockResolvedValue({ managers: [], departmentHeads: [], executors: [] });
    useAuthStore.setState({ user: { id: 'admin-1', login: 'admin', phone: '+998900000000', name: 'Admin', role: 'admin' } });
    useLanguageStore.setState({ language: 'ru' });
  });

  it('opens the access form and restores focus after Escape', async () => {
    render(<SettingsPage />);
    const trigger = screen.getByRole('button', { name: 'Дать доступ' });
    trigger.focus();
    fireEvent.click(trigger);

    expect(screen.getByRole('dialog', { name: 'Дать доступ' })).toBeInTheDocument();
    await waitFor(() => expect(mocks.getAll).toHaveBeenCalledOnce());
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Дать доступ' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('keeps access-management controls touch-safe', async () => {
    render(<SettingsPage />);
    const trigger = screen.getByRole('button', { name: 'Дать доступ' });
    expect(trigger).toHaveClass('min-h-[44px]');
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Дать доступ' });
    await waitFor(() => expect(mocks.getAll).toHaveBeenCalledOnce());
    expect(dialog.getElementsByTagName('select')[0]).toHaveClass('min-h-[44px]');
    expect(screen.getByRole('button', { name: 'Предоставить доступ' })).toHaveClass('min-h-[44px]');
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio.closest('label')).toHaveClass('min-h-[44px]');
    }
  });
});
