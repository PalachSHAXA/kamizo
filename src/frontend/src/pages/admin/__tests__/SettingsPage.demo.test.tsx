import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ updateSettings: vi.fn(), apiRequest: vi.fn() }));

vi.mock('../../../stores/dataStore', () => ({
  useSettingsStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    settings: {
      companyName: 'Kamizo Demo', companyInn: '123', companyAddress: 'Tashkent', companyPhone: '+99890',
      routingMode: 'hybrid', workingHoursStart: '08:00', workingHoursEnd: '20:00', autoAssign: true,
      notifyOnNew: true, notifyOnComplete: true, notifyOnRating: true,
      smsNotifications: false, emailNotifications: true, pushNotifications: true,
    },
    updateSettings: mocks.updateSettings,
  }),
}));

vi.mock('../../../services/api', () => ({
  apiRequest: mocks.apiRequest,
  usersApi: { updateMe: vi.fn(), changePassword: vi.fn() },
}));

vi.mock('../../../services/pushNotifications', () => ({
  pushNotifications: {
    isSupported: () => true,
    getPermission: () => 'granted',
    isSubscribed: () => true,
    getSubscription: () => ({ endpoint: 'https://push.example/subscription' }),
    subscribe: vi.fn(),
  },
}));

import { SettingsPage } from '../SettingsPage';
import { useAuthStore } from '../../../stores/authStore';
import { useLanguageStore } from '../../../stores/languageStore';
import { useTenantStore } from '../../../stores/tenantStore';

const admin = {
  id: 'admin-1', login: 'admin', phone: '+998900000000', name: 'Admin', role: 'admin' as const,
};

function renderSettings() {
  return render(
    <MemoryRouter
      initialEntries={['/settings']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <SettingsPage />
    </MemoryRouter>,
  );
}

describe('SettingsPage demo capability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLanguageStore.setState({ language: 'ru' });
    useTenantStore.setState({
      config: {
        tenant: {
          id: 'tenant-demo', name: 'Kamizo Demo', slug: 'demo', color: '#f97316', color_secondary: '#fff',
          plan: 'pro', logo: null, is_demo: true,
          contract: { filename: 'contract.pdf', uploaded_at: '2026-08-01', uploaded_by_name: 'Director' },
        },
        features: ['marketplace', 'chat'], context: 'tenant',
      },
    });
  });

  it('disables representative settings controls without changing their local values in demo', () => {
    useAuthStore.setState({ user: { ...admin, demoSession: true } });
    renderSettings();

    expect(screen.getByRole('status')).toHaveTextContent('Демо-режим: чувствительные настройки доступны только для просмотра');
    expect(screen.getByRole('textbox', { name: 'Имя пользователя' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Сохранить профиль' })).toBeDisabled();

    expect(screen.queryByLabelText('Текущий пароль')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Новый пароль')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Подтвердите пароль')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Общие' }));
    const companyName = screen.getByRole('textbox', { name: 'Название компании' });
    const routingMode = screen.getByRole('combobox', { name: 'Режим маршрутизации' });
    expect(companyName).toBeDisabled();
    expect(routingMode).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Автоматически назначать заявки' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Сохранить изменения' })).toBeDisabled();
    expect(screen.queryByText('Опасная зона')).not.toBeInTheDocument();
    expect(companyName).toHaveValue('Kamizo Demo');
    expect(routingMode).toHaveValue('hybrid');

    fireEvent.click(screen.getByRole('tab', { name: 'Модули' }));
    expect(screen.getByRole('switch', { name: /Маркетплейс/ })).toBeDisabled();

    fireEvent.click(screen.getByRole('tab', { name: 'Уведомления' }));
    const pushToggle = screen.getByRole('switch', { name: 'Push-уведомления' });
    expect(pushToggle).toBeDisabled();
    expect(pushToggle).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(pushToggle);
    expect(pushToggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('button', { name: 'Отправить тест' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сохранить изменения' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Обновить статус' })).toBeEnabled();

    fireEvent.click(screen.getByRole('tab', { name: 'Договор' }));
    expect(screen.getByText('contract.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Скачать' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Заменить файл' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Файл договора')).not.toBeInTheDocument();
  });

  it('leaves ordinary settings mutations available', () => {
    useAuthStore.setState({ user: admin });
    renderSettings();

    expect(screen.getByRole('button', { name: 'Сохранить профиль' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сохранить профиль' })).toBeEnabled();
    expect(screen.getByLabelText('Текущий пароль')).toBeEnabled();
    fireEvent.click(screen.getByRole('tab', { name: 'Общие' }));
    expect(screen.getByRole('textbox', { name: 'Название компании' })).toBeEnabled();
    expect(screen.getByRole('combobox', { name: 'Режим маршрутизации' })).toBeEnabled();
    fireEvent.click(screen.getByRole('tab', { name: 'Уведомления' }));
    expect(screen.getByRole('switch', { name: 'Push-уведомления' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Отправить тест' })).toBeEnabled();
    fireEvent.click(screen.getByRole('tab', { name: 'Договор' }));
    expect(screen.getByRole('button', { name: 'Заменить файл' })).toBeInTheDocument();
  });

  it('opens and closes the reset confirmation through the common modal', () => {
    useAuthStore.setState({ user: admin });
    renderSettings();

    fireEvent.click(screen.getByRole('tab', { name: 'Общие' }));
    const trigger = screen.getByRole('button', { name: 'Сбросить' });
    trigger.focus();
    fireEvent.click(trigger);

    expect(screen.getByRole('dialog', { name: 'Подтвердите действие' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Подтвердите действие' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('exposes tabs with roving focus and arrow-key navigation', () => {
    useAuthStore.setState({ user: admin });
    renderSettings();

    const tablist = screen.getByRole('tablist', { name: 'Разделы настроек' });
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]).toHaveAttribute('tabindex', '0');
    expect(tabs[1]).toHaveAttribute('tabindex', '-1');

    tabs[0].focus();
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
    expect(tabs[1]).toHaveFocus();
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(tabs[1], { key: 'ArrowLeft' });
    expect(tabs[0]).toHaveFocus();
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
  });
});
