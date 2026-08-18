import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoginPage, shouldOpenDemoGate } from '../LoginPage';
import { authApi } from '../../services/api/auth';
import { useAuthStore } from '../../stores/authStore';
import { useLanguageStore } from '../../stores/languageStore';
import { useTenantStore } from '../../stores/tenantStore';
import type { DemoRole } from '../../types/auth';

vi.mock('../../services/api/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api/auth')>();
  return {
    ...actual,
    authApi: {
      ...actual.authApi,
      getDemoRoles: vi.fn(),
      demoLogin: vi.fn(),
      login: vi.fn(),
    },
  };
});

vi.mock('../../services/nativePush', () => ({ initializeNativePush: vi.fn() }));

const roles: DemoRole[] = [
  { roleKey: 'director', role: 'director', specialization: null, primary: true, order: 10 },
  { roleKey: 'manager', role: 'manager', specialization: null, primary: true, order: 20 },
  { roleKey: 'resident', role: 'resident', specialization: null, primary: true, order: 30 },
  { roleKey: 'executor', role: 'executor', specialization: 'plumber', primary: true, order: 40 },
  { roleKey: 'security', role: 'security', specialization: 'security', primary: true, order: 50 },
  { roleKey: 'marketplace_manager', role: 'marketplace_manager', specialization: null, primary: true, order: 60 },
  { roleKey: 'admin', role: 'admin', specialization: null, primary: false, order: 70 },
  { roleKey: 'department_head', role: 'department_head', specialization: 'plumber', primary: false, order: 80 },
  { roleKey: 'dispatcher', role: 'dispatcher', specialization: null, primary: false, order: 90 },
  { roleKey: 'electrician', role: 'executor', specialization: 'electrician', primary: false, order: 100 },
  { roleKey: 'courier', role: 'executor', specialization: 'courier', primary: false, order: 110 },
  { roleKey: 'tenant', role: 'tenant', specialization: null, primary: false, order: 120 },
  { roleKey: 'advertiser', role: 'advertiser', specialization: null, primary: false, order: 130 },
];

function setTenant(slug: string) {
  useTenantStore.setState({
    config: {
      tenant: { id: 'tenant-1', name: 'Kamizo Demo', slug, color: '#f97316', color_secondary: '#ea580c', plan: 'pro', logo: null, is_demo: slug === 'demo' },
      features: [],
      context: 'tenant',
    },
  });
}

describe('LoginPage demo roles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    useLanguageStore.setState({ language: 'ru' });
    useAuthStore.setState({ user: null, token: null, isLoading: false, error: null, pickerTenants: null });
    setTenant('demo');
  });

  it('opens the cosmetic gate synchronously only for the exact demo host or local boot marker', () => {
    expect(shouldOpenDemoGate('demo.kamizo.uz', false, null)).toBe(true);
    expect(shouldOpenDemoGate('demo.kamizo.uz.evil.example', false, null)).toBe(false);
    expect(shouldOpenDemoGate('127.0.0.1', true, null)).toBe(true);
    expect(shouldOpenDemoGate('demo.kamizo.uz', false, '1')).toBe(false);
  });

  it('keeps the gate keyboard closed and waits to load roles until unlocked', async () => {
    vi.mocked(authApi.getDemoRoles).mockResolvedValue(roles);
    render(<LoginPage />);

    const gateInput = screen.getByLabelText('Пароль доступа');
    expect(gateInput).not.toHaveAttribute('autofocus');
    expect(authApi.getDemoRoles).not.toHaveBeenCalled();

    fireEvent.change(gateInput, { target: { value: 'Axelion27' } });
    fireEvent.submit(gateInput.closest('form')!);
    await waitFor(() => expect(authApi.getDemoRoles).toHaveBeenCalledTimes(1));
  });

  it('isolates the login page behind a labelled modal gate', () => {
    vi.mocked(authApi.getDemoRoles).mockResolvedValue(roles);
    render(<LoginPage />);

    const dialog = screen.getByRole('dialog', { name: 'Kamizo Demo' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const loginPage = document.querySelector('[data-login-page]');
    expect(loginPage).toHaveAttribute('aria-hidden', 'true');
    expect(loginPage).toHaveAttribute('inert');
    expect(screen.getByRole('heading', { name: 'Kamizo Demo' })).toHaveFocus();
  });

  it('traps keyboard focus and does not let Escape bypass the gate', () => {
    vi.mocked(authApi.getDemoRoles).mockResolvedValue(roles);
    render(<LoginPage />);

    const dialog = screen.getByRole('dialog', { name: 'Kamizo Demo' });
    const input = screen.getByLabelText('Пароль доступа');
    const submit = screen.getByRole('button', { name: 'Войти в демо' });

    submit.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(input).toHaveFocus();

    input.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(submit).toHaveFocus();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Kamizo Demo' })).toBeInTheDocument();
    expect(document.querySelector('[data-login-page]')).toHaveAttribute('inert');
  });

  it('renders loading, all primary roles, and secondary roles in a disclosure', async () => {
    let resolveRoles!: (value: typeof roles) => void;
    vi.mocked(authApi.getDemoRoles).mockReturnValue(new Promise((resolve) => { resolveRoles = resolve; }));
    sessionStorage.setItem('kamizo_demo_gate', '1');
    render(<LoginPage />);

    expect(screen.getByText('Загрузка ролей...')).toBeInTheDocument();
    resolveRoles(roles);
    const grid = await screen.findByRole('group', { name: 'Основные роли' });
    for (const label of ['Директор', 'Управляющий', 'Житель', 'Сантехник', 'Охранник', 'Менеджер магазина']) {
      expect(within(grid).getByRole('button', { name: label })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByText('Другие роли'));
    for (const label of ['Администратор', 'Глава отдела', 'Диспетчер', 'Электрик', 'Курьер', 'Арендатор', 'Рекламодатель']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('shows role loading errors beside the grid and retries', async () => {
    vi.mocked(authApi.getDemoRoles)
      .mockRejectedValueOnce(new Error('Сервис ролей недоступен'))
      .mockResolvedValueOnce(roles);
    sessionStorage.setItem('kamizo_demo_gate', '1');
    render(<LoginPage />);

    expect(await screen.findByText('Сервис ролей недоступен')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    await screen.findByRole('group', { name: 'Основные роли' });
    expect(authApi.getDemoRoles).toHaveBeenCalledTimes(2);
  });

  it('shows an empty state while preserving manual login', async () => {
    vi.mocked(authApi.getDemoRoles).mockResolvedValue([]);
    sessionStorage.setItem('kamizo_demo_gate', '1');
    render(<LoginPage />);

    expect(await screen.findByText('Демо-роли пока недоступны')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Войти вручную'));
    expect(screen.getByLabelText('Логин')).toBeInTheDocument();
    expect(screen.getByLabelText('Пароль')).toBeInTheDocument();
  });

  it('sends a role key on one tap, disables every tile, and shows only the selected spinner', async () => {
    vi.mocked(authApi.getDemoRoles).mockResolvedValue(roles);
    let finish!: (value: 'success') => void;
    const demoLogin = vi.fn().mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    useAuthStore.setState({ demoLogin });
    sessionStorage.setItem('kamizo_demo_gate', '1');
    render(<LoginPage />);

    const director = await screen.findByRole('button', { name: /Директор/ });
    fireEvent.click(director);
    expect(demoLogin).toHaveBeenCalledWith('director');
    for (const button of within(screen.getByRole('group', { name: 'Основные роли' })).getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
    expect(director.querySelector('[data-role-spinner="true"]')).toBeInTheDocument();
    await act(async () => { finish('success'); });
  });

  it('does not show quick roles on other tenants', () => {
    setTenant('other');
    render(<LoginPage />);
    expect(authApi.getDemoRoles).not.toHaveBeenCalled();
    expect(screen.queryByText('Выберите роль')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Логин')).toBeInTheDocument();
  });
});
