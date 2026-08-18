import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
  executor: {
    id: 'executor-3',
    name: 'Aziz Karimov',
    phone: '+998901112233',
    login: 'a.karimov',
    password: 'legacy-secret',
    specialization: 'plumber',
    status: 'available',
    rating: 4.8,
    completedCount: 12,
    activeRequests: 1,
    totalEarnings: 0,
    avgCompletionTime: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
  },
  fetchExecutors: vi.fn(),
  addExecutor: vi.fn(),
  updateExecutor: vi.fn(),
  deleteExecutor: vi.fn(),
}));

vi.mock('../../../stores/dataStore', () => ({
  useExecutorStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    executors: [testState.executor],
    isLoadingExecutors: false,
    fetchExecutors: testState.fetchExecutors,
    addExecutor: testState.addExecutor,
    updateExecutor: testState.updateExecutor,
    deleteExecutor: testState.deleteExecutor,
  }),
}));

vi.mock('../../../services/api', () => ({
  executorsApi: {
    getById: vi.fn().mockResolvedValue({
      executor: { ...testState.executor, created_at: testState.executor.createdAt },
    }),
  },
}));

import { ExecutorsPage } from '../ExecutorsPage';
import { useLanguageStore } from '../../../stores/languageStore';
import { useAuthStore } from '../../../stores/authStore';

const userForRole = (role: 'manager' | 'department_head' | 'dispatcher') => ({
  id: `${role}-1`,
  name: 'Test User',
  phone: '+998900000000',
  login: role,
  role,
  specialization: role === 'department_head' ? 'plumber' as const : undefined,
});

describe('ExecutorsPage password hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLanguageStore.setState({ language: 'ru' });
    useAuthStore.setState({ user: userForRole('manager') });
  });

  it('hides the add action from dispatchers but keeps refresh accessible', () => {
    useAuthStore.setState({ user: userForRole('dispatcher') });

    render(<ExecutorsPage />);

    expect(screen.queryByRole('button', { name: 'Добавить исполнителя' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Обновить список исполнителей' })).toBeInTheDocument();
  });

  it('keeps department heads able to add within their department', () => {
    useAuthStore.setState({ user: userForRole('department_head') });

    render(<ExecutorsPage />);

    expect(screen.getByRole('button', { name: 'Добавить исполнителя' })).toBeInTheDocument();
    expect(screen.getByText('Отдел: Сантехник')).toBeInTheDocument();
  });

  it('never reveals or copies a stored executor password', async () => {
    render(<ExecutorsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Подробнее' }));

    expect((await screen.findAllByText('Aziz Karimov')).length).toBeGreaterThan(1);
    expect(screen.queryByText('legacy-secret')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /показать пароль/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /копировать пароль/i })).not.toBeInTheDocument();
  });

  it('does not offer a fake local password edit', async () => {
    render(<ExecutorsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Подробнее' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Редактировать' }));

    expect(screen.queryByText('Новый пароль')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Оставьте пустым, чтобы не менять')).not.toBeInTheDocument();
  });

  it('keeps demo executors visible but hides add, edit, and delete mutations', async () => {
    useAuthStore.setState({ user: { ...userForRole('manager'), demoSession: true } });

    render(<ExecutorsPage />);

    expect(screen.getByRole('status')).toHaveTextContent('Демо-режим: изменения недоступны');
    expect(screen.getByText('Aziz Karimov')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Добавить исполнителя' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Подробнее' }));
    expect(await screen.findByText('Добавлен: 01.08.2026')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Редактировать' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Удалить' })).not.toBeInTheDocument();
  });

  it('renders details as a dialog and restores focus to its trigger on Escape', async () => {
    render(<ExecutorsPage />);
    const trigger = screen.getByRole('button', { name: 'Подробнее' });
    trigger.focus();
    fireEvent.click(trigger);

    expect(await screen.findByRole('dialog', { name: 'Aziz Karimov' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Aziz Karimov' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('moves a successful add into the one-time credentials dialog and returns focus to Add', async () => {
    testState.addExecutor.mockResolvedValueOnce(undefined);
    render(<ExecutorsPage />);
    const trigger = screen.getByRole('button', { name: 'Добавить исполнителя' });
    trigger.focus();
    fireEvent.click(trigger);

    const addDialog = await screen.findByRole('dialog', { name: 'Добавить сотрудника' });
    fireEvent.change(screen.getByPlaceholderText('Фамилия Имя Отчество'), { target: { value: 'Alisher Testov' } });
    fireEvent.change(screen.getByPlaceholderText('+998 90 123 45 67'), { target: { value: '+998901234567' } });
    fireEvent.change(screen.getByPlaceholderText('login'), { target: { value: 'alisher.test' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'one-time-secret' } });
    fireEvent.click(within(addDialog).getByRole('button', { name: 'Добавить' }));

    const credentials = await screen.findByRole('dialog', { name: 'Исполнитель создан!' });
    expect(credentials).toHaveTextContent('alisher.test');
    expect(credentials).toHaveTextContent('one-time-secret');
    expect(testState.addExecutor).toHaveBeenCalledWith(expect.objectContaining({
      login: 'alisher.test',
      password: 'one-time-secret',
    }));

    fireEvent.click(within(credentials).getByRole('button', { name: 'Готово' }));
    await waitFor(() => expect(credentials).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('uses a nested confirmation for deletion and Escape closes only the confirmation', async () => {
    testState.deleteExecutor.mockResolvedValueOnce(undefined);
    render(<ExecutorsPage />);
    const detailsTrigger = screen.getByRole('button', { name: 'Подробнее' });
    detailsTrigger.focus();
    fireEvent.click(detailsTrigger);
    const details = await screen.findByRole('dialog', { name: 'Aziz Karimov' });
    const deleteButton = within(details).getByRole('button', { name: 'Удалить' });
    deleteButton.focus();
    fireEvent.click(deleteButton);

    expect(screen.getByRole('dialog', { name: 'Удалить исполнителя?' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Удалить исполнителя?' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Aziz Karimov' })).toBeInTheDocument();
    expect(deleteButton).toHaveFocus();

    fireEvent.click(deleteButton);
    fireEvent.click(screen.getByRole('button', { name: 'Удалить исполнителя' }));
    await waitFor(() => expect(testState.deleteExecutor).toHaveBeenCalledWith('executor-3'));
    expect(screen.queryByRole('dialog', { name: 'Aziz Karimov' })).not.toBeInTheDocument();
    expect(detailsTrigger).toHaveFocus();
  });
});
