import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  resetUserPassword: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  apiRequest: vi.fn(),
  teamApi: {
    getAll: apiMocks.getAll,
    getById: apiMocks.getById,
    create: apiMocks.create,
    update: vi.fn(),
    delete: vi.fn(),
  },
  usersApi: {
    resetUserPassword: apiMocks.resetUserPassword,
  },
}));

import { TeamPage } from '../TeamPage';
import { useAuthStore } from '../../../stores/authStore';
import { useLanguageStore } from '../../../stores/languageStore';
import { useToastStore } from '../../../stores/toastStore';
import { useModalStore } from '../../../stores/modalStore';
import type { UserRole } from '../../../types';

const staff = {
  id: 'staff-7',
  login: 'n.rahimov',
  name: 'Nodir Rahimov',
  phone: '+998901234567',
  role: 'manager',
  created_at: '2026-08-01T00:00:00.000Z',
};

function user(id: string, role: UserRole) {
  return {
    id,
    role,
    login: `${role}.${id}`,
    name: `${role} ${id}`,
    phone: '+998900000000',
  };
}

function teamData(target = staff) {
  const data = {
    directors: [] as typeof staff[],
    admins: [] as typeof staff[],
    managers: [] as typeof staff[],
    departmentHeads: [] as typeof staff[],
    executors: [] as typeof staff[],
    total: 1,
  };
  if (target.role === 'director') data.directors.push(target);
  else if (target.role === 'admin') data.admins.push(target);
  else if (target.role === 'manager') data.managers.push(target);
  else if (target.role === 'department_head') data.departmentHeads.push(target);
  else data.executors.push(target);
  return data;
}

function setCaller(id: string, role: UserRole) {
  useAuthStore.setState({ user: user(id, role) });
}

async function openMember(name = staff.name) {
  fireEvent.click(await screen.findByText(name));
  await waitFor(() => expect(screen.getByRole('dialog', { name })).toBeInTheDocument());
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

describe('TeamPage password reset flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLanguageStore.setState({ language: 'ru' });
    useToastStore.setState({ toasts: [] });
    useModalStore.setState({ count: 0 });
    setCaller('admin-1', 'admin');
    apiMocks.getAll.mockResolvedValue(teamData());
    apiMocks.getById.mockResolvedValue({ user: staff });
    apiMocks.create.mockResolvedValue({ user: { ...staff, id: 'staff-created' } });
    apiMocks.resetUserPassword.mockResolvedValue({
      temporaryPassword: 'Temp-9482',
      user: staff,
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('has no mass reset and shows generated credentials once after an individual reset', async () => {
    render(<TeamPage />);

    expect(await screen.findByText('Nodir Rahimov')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /массовый сброс/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Nodir Rahimov'));
    fireEvent.click(await screen.findByRole('button', { name: 'Сбросить пароль' }));

    await waitFor(() => expect(apiMocks.resetUserPassword).toHaveBeenCalledWith('staff-7'));
    expect(await screen.findByRole('heading', { name: 'Пароль сброшен!' })).toBeInTheDocument();
    expect(await screen.findByText('Temp-9482')).toBeInTheDocument();
    const credentialsDialog = screen.getByRole('dialog', { name: 'Пароль сброшен!' });
    expect(within(credentialsDialog).getByText('n.rahimov')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Готово' }));
    expect(screen.queryByRole('heading', { name: 'Пароль сброшен!' })).not.toBeInTheDocument();
    expect(screen.queryByText('Temp-9482')).not.toBeInTheDocument();
  });

  it('renders demo personnel read-only and hides denied staff, password, and delete actions', async () => {
    useAuthStore.setState({ user: { ...user('admin-1', 'admin'), demoSession: true } });
    render(<TeamPage />);

    expect(await screen.findByText('Демо-режим: персонал доступен только для просмотра')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Добавить сотрудника' })).not.toBeInTheDocument();
    expect(screen.queryByTitle('Импорт персонала')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Удалить сотрудника' })).not.toBeInTheDocument();

    await openMember();
    expect(screen.queryByRole('button', { name: 'Сбросить пароль' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Редактировать' })).not.toBeInTheDocument();
  });

  it('keeps member details inert behind reset credentials and restores focus to reset', async () => {
    render(<TeamPage />);
    await openMember();
    const memberDialog = screen.getByRole('dialog', { name: staff.name });
    const reset = screen.getByRole('button', { name: 'Сбросить пароль' });

    fireEvent.click(reset);

    const credentialsDialog = await screen.findByRole('dialog', { name: 'Пароль сброшен!' });
    expect(credentialsDialog).toBeInTheDocument();
    expect(memberDialog.parentElement).toHaveAttribute('inert');
    fireEvent.click(within(credentialsDialog).getByRole('button', { name: 'Готово' }));

    await waitFor(() => expect(credentialsDialog).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Сбросить пароль' })).toHaveFocus();
  });

  it.each([
    ['admin peer', 'admin-1', 'admin', 'admin-2', 'admin', false],
    ['admin lower', 'admin-1', 'admin', 'manager-2', 'manager', true],
    ['admin self', 'admin-1', 'admin', 'admin-1', 'admin', true],
    ['director peer', 'director-1', 'director', 'director-2', 'director', false],
    ['director lower', 'director-1', 'director', 'manager-2', 'manager', true],
    ['manager peer', 'manager-1', 'manager', 'manager-2', 'manager', false],
    ['manager lower', 'manager-1', 'manager', 'executor-2', 'executor', false],
    ['super admin lower', 'super-1', 'super_admin', 'executor-2', 'executor', false],
  ] as const)('%s reset visibility follows the backend contract', async (_label, callerId, callerRole, targetId, targetRole, visible) => {
    const target = { ...staff, ...user(targetId, targetRole), role: targetRole };
    setCaller(callerId, callerRole);
    apiMocks.getAll.mockResolvedValue(teamData(target));
    apiMocks.getById.mockResolvedValue({ user: target });

    render(<TeamPage />);
    await openMember(target.name);

    const reset = screen.queryByRole('button', { name: 'Сбросить пароль' });
    if (visible) expect(reset).toBeInTheDocument();
    else expect(reset).not.toBeInTheDocument();
  });

  it('does not call reset when confirmation is cancelled', async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    render(<TeamPage />);
    await openMember();

    fireEvent.click(screen.getByRole('button', { name: 'Сбросить пароль' }));

    expect(apiMocks.resetUserPassword).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: staff.name })).toBeInTheDocument();
  });

  it('keeps details open and reports an API reset failure', async () => {
    apiMocks.resetUserPassword.mockRejectedValueOnce(new Error('Reset denied'));
    render(<TeamPage />);
    await openMember();

    fireEvent.click(screen.getByRole('button', { name: 'Сбросить пароль' }));

    await waitFor(() => expect(useToastStore.getState().toasts).toEqual([
      expect.objectContaining({ type: 'error', message: 'Ошибка сброса пароля: Reset denied' }),
    ]));
    expect(screen.getByRole('dialog', { name: staff.name })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сбросить пароль' })).toBeEnabled();
  });

  it('submits only one reset while the first request is pending', async () => {
    const pending = deferred<{ temporaryPassword: string; user: typeof staff }>();
    apiMocks.resetUserPassword.mockReturnValueOnce(pending.promise);
    render(<TeamPage />);
    await openMember();
    const reset = screen.getByRole('button', { name: 'Сбросить пароль' });

    act(() => {
      reset.click();
      reset.click();
    });

    expect(apiMocks.resetUserPassword).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({ temporaryPassword: 'Temp-9482', user: staff }));
  });

  it('uses create copy and clears submitted credentials when closed', async () => {
    render(<TeamPage />);
    await screen.findByText(staff.name);
    fireEvent.click(screen.getByRole('button', { name: 'Добавить сотрудника' }));
    const modal = screen.getByRole('heading', { name: 'Добавить сотрудника' }).closest('.modal-content');
    if (!modal) throw new Error('Add staff modal not found');
    fireEvent.change(within(modal as HTMLElement).getByPlaceholderText('Фамилия Имя Отчество'), { target: { value: 'Olga Petrova' } });
    fireEvent.change(within(modal as HTMLElement).getByPlaceholderText('ivanov.ii'), { target: { value: 'o.petrova' } });
    fireEvent.change(within(modal as HTMLElement).getAllByRole('combobox')[1], { target: { value: 'plumber' } });
    fireEvent.click(within(modal as HTMLElement).getByRole('button', { name: 'Добавить' }));

    expect(await screen.findByRole('heading', { name: 'Сотрудник создан!' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Готово' }));
    expect(screen.queryByRole('heading', { name: 'Сотрудник создан!' })).not.toBeInTheDocument();
    expect(screen.queryByText('o.petrova')).not.toBeInTheDocument();
  });

  it('exposes labelled 44px toolbar actions and registers the add dialog presence', async () => {
    render(<TeamPage />);
    await screen.findByText(staff.name);

    for (const name of ['Обновить', 'Экспорт персонала', 'Импорт персонала', 'Добавить сотрудника']) {
      expect(screen.getByRole('button', { name })).toHaveClass('min-w-[44px]', 'min-h-[44px]');
      expect(screen.getByRole('button', { name })).toHaveAttribute('title');
    }

    fireEvent.click(screen.getByRole('button', { name: 'Добавить сотрудника' }));

    expect(await screen.findByRole('dialog', { name: 'Добавить сотрудника' })).toBeInTheDocument();
    await waitFor(() => expect(useModalStore.getState().count).toBe(1));
  });

  const nullableStaff = {
    ...staff,
    id: 'staff-nullable',
    name: 'Nullable Profile',
    phone: null,
    specialization: null,
    status: null,
  };

  it('renders a team member with nullable profile fields', async () => {
    apiMocks.getAll.mockResolvedValue({ ...teamData(), managers: [nullableStaff] });
    apiMocks.getById.mockResolvedValue({ user: nullableStaff });
    render(<TeamPage />);

    fireEvent.click(await screen.findByText('Nullable Profile'));
    expect(await screen.findByText('Не указан')).toBeInTheDocument();
  });

  it('searches a team member with a null phone without crashing', async () => {
    apiMocks.getAll.mockResolvedValue({ ...teamData(), managers: [nullableStaff] });
    render(<TeamPage />);
    await screen.findByText('Nullable Profile');

    fireEvent.change(screen.getByPlaceholderText('Поиск...'), { target: { value: 'no-match' } });
    expect(screen.queryByText('Nullable Profile')).not.toBeInTheDocument();
  });

  it('uses the backend total for the team summary', async () => {
    apiMocks.getAll.mockResolvedValue({ ...teamData(), total: 7 });
    render(<TeamPage />);

    expect(await screen.findByText('7 сотрудников')).toBeInTheDocument();
  });
});
