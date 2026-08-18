import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MobileHeader } from '../MobileHeader';
import { useAuthStore } from '../../../stores/authStore';
import { useLanguageStore } from '../../../stores/languageStore';

describe('MobileHeader drawer state', () => {
  beforeEach(() => {
    useLanguageStore.setState({ language: 'ru' });
    useAuthStore.setState({
      user: { id: 'manager-1', login: 'manager', phone: '+998900000000', name: 'Manager', role: 'manager' },
      token: 'token',
      isLoading: false,
      error: null,
      pickerTenants: null,
    });
  });

  it('exposes the real drawer state and control relationship', () => {
    const { rerender } = render(
      <MemoryRouter>
        <MobileHeader onMenuClick={vi.fn()} unreadCount={0} isMenuOpen={false} />
      </MemoryRouter>,
    );

    const menu = screen.getByRole('button', { name: 'Открыть меню' });
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    expect(menu).toHaveAttribute('aria-controls', 'app-sidebar');

    rerender(
      <MemoryRouter>
        <MobileHeader onMenuClick={vi.fn()} unreadCount={0} isMenuOpen />
      </MemoryRouter>,
    );
    expect(menu).toHaveAttribute('aria-expanded', 'true');
  });
});
