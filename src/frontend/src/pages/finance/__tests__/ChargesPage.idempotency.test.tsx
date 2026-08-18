import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createPayment: vi.fn(),
  fetchBuildings: vi.fn(),
  fetchCharges: vi.fn(),
  fetchChargesSummary: vi.fn(),
  setFilters: vi.fn(),
  getBuildingChargeStatus: vi.fn(),
  authUser: { current: { id: 'admin-1', role: 'admin', demoSession: false } },
}));

const charges = [
  { id: 'charge-1', apartment_id: 'apartment-1', apartment_number: '101', amount: 125000, paid_amount: 0, status: 'pending', property_type: 'non_commercial' },
  { id: 'charge-2', apartment_id: 'apartment-2', apartment_number: '202', amount: 90000, paid_amount: 0, status: 'pending', property_type: 'commercial' },
];

vi.mock('../../../stores/financeStore', () => ({
  useFinanceStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    charges,
    chargesLoading: false,
    chargesPagination: null,
    chargesSummary: null,
    fetchCharges: mocks.fetchCharges,
    fetchChargesSummary: mocks.fetchChargesSummary,
    createPayment: mocks.createPayment,
    filters: { buildingId: '', period: '', status: '' },
    setFilters: mocks.setFilters,
  }),
}));

vi.mock('../../../stores/buildingStore', () => ({
  useBuildingStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    buildings: [],
    fetchBuildings: mocks.fetchBuildings,
  }),
}));

vi.mock('../../../stores/languageStore', () => ({
  useLanguageStore: (selector?: (state: { language: string }) => unknown) => {
    const state = { language: 'ru' };
    return selector ? selector(state) : state;
  },
}));

vi.mock('../../../stores/authStore', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    user: mocks.authUser.current,
  }),
}));

vi.mock('../../../services/api/finance', () => ({
  financeApi: { getBuildingChargeStatus: mocks.getBuildingChargeStatus },
}));

import ChargesPage from '../ChargesPage';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function openPayment(apartmentNumber: string) {
  fireEvent.click(screen.getByText(apartmentNumber));
  fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '50000' } });
  return screen.getByRole('button', { name: 'Принять оплату' });
}

describe('ChargesPage payment idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createPayment.mockReset();
    mocks.fetchBuildings.mockResolvedValue(undefined);
    mocks.fetchCharges.mockResolvedValue(undefined);
    mocks.fetchChargesSummary.mockResolvedValue(undefined);
    mocks.authUser.current = { id: 'admin-1', role: 'admin', demoSession: false };
    let sequence = 0;
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`),
      getRandomValues: vi.fn((array: Uint8Array) => array.fill(1)),
    });
  });

  it('renders demo financial data read-only without payment opening controls', () => {
    mocks.authUser.current = { id: 'admin-1', role: 'admin', demoSession: true };
    render(<ChargesPage />);

    expect(screen.getByText('Демо-режим: финансовые данные доступны только для просмотра')).toBeInTheDocument();
    expect(screen.getByText('101')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Открыть оплату квартиры/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('101'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps payment opening available for an ordinary administrator', () => {
    render(<ChargesPage />);

    expect(screen.queryByText('Демо-режим: финансовые данные доступны только для просмотра')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Открыть оплату квартиры 101/ }).length).toBeGreaterThan(0);
  });

  it('labels non-commercial homes as residential and commercial premises separately', () => {
    render(<ChargesPage />);

    const residentialRow = screen.getByText('101').closest('tr');
    const commercialRow = screen.getByText('202').closest('tr');
    expect(residentialRow).not.toBeNull();
    expect(commercialRow).not.toBeNull();
    expect(within(residentialRow!).getByText('Жилое')).toBeInTheDocument();
    expect(within(commercialRow!).getByText('Коммерч.')).toBeInTheDocument();
  });

  it('blocks a rapid double click before submitting state renders', async () => {
    const pending = deferred<boolean>();
    mocks.createPayment.mockReturnValueOnce(pending.promise);
    render(<ChargesPage />);
    const submit = openPayment('101');

    act(() => {
      submit.click();
      submit.click();
    });

    expect(mocks.createPayment).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(false));
  });

  it('reuses the same key when a failed payment is retried', async () => {
    mocks.createPayment.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<ChargesPage />);
    const submit = openPayment('101');

    fireEvent.click(submit);
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);
    await waitFor(() => expect(mocks.createPayment).toHaveBeenCalledTimes(2));

    expect(mocks.createPayment.mock.calls[0][1]).toEqual(expect.any(String));
    expect(mocks.createPayment.mock.calls[0][1]).toBe(mocks.createPayment.mock.calls[1][1]);
  });

  it('reuses the same key after a rejected network request and releases the submit guard', async () => {
    mocks.createPayment.mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce(true);
    render(<ChargesPage />);
    const submit = openPayment('101');

    fireEvent.click(submit);
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);
    await waitFor(() => expect(mocks.createPayment).toHaveBeenCalledTimes(2));

    expect(mocks.createPayment.mock.calls[0][1]).toEqual(expect.any(String));
    expect(mocks.createPayment.mock.calls[1][1]).toBe(mocks.createPayment.mock.calls[0][1]);
  });

  it('reuses the same key when a failed whitespace description is retried as empty', async () => {
    mocks.createPayment.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<ChargesPage />);
    const submit = openPayment('101');
    fireEvent.change(screen.getByLabelText('Комментарий'), { target: { value: '   ' } });

    fireEvent.click(submit);
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Комментарий'), { target: { value: '' } });
    fireEvent.click(submit);
    await waitFor(() => expect(mocks.createPayment).toHaveBeenCalledTimes(2));

    expect(mocks.createPayment.mock.calls[0][0].description).toBeUndefined();
    expect(mocks.createPayment.mock.calls[1][1]).toBe(mocks.createPayment.mock.calls[0][1]);
  });

  it.each([
    ['Сумма', '60000'],
    ['Тип оплаты', 'card'],
    ['Комментарий', 'Исправленная оплата'],
  ])('uses a new key when %s changes after a failed attempt', async (label, value) => {
    mocks.createPayment.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<ChargesPage />);
    const submit = openPayment('101');

    fireEvent.click(submit);
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.click(submit);
    await waitFor(() => expect(mocks.createPayment).toHaveBeenCalledTimes(2));

    expect(mocks.createPayment.mock.calls[1][1]).not.toBe(mocks.createPayment.mock.calls[0][1]);
  });

  it('reuses the same key when an edited payload is restored before retry', async () => {
    mocks.createPayment.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<ChargesPage />);
    const submit = openPayment('101');

    fireEvent.click(submit);
    await waitFor(() => expect(submit).toBeEnabled());
    const amount = screen.getByLabelText('Сумма');
    fireEvent.change(amount, { target: { value: '60000' } });
    fireEvent.change(amount, { target: { value: '50000' } });
    fireEvent.click(submit);
    await waitFor(() => expect(mocks.createPayment).toHaveBeenCalledTimes(2));

    expect(mocks.createPayment.mock.calls[1][1]).toBe(mocks.createPayment.mock.calls[0][1]);
  });

  it('uses a new key for the next payment after success', async () => {
    mocks.createPayment.mockResolvedValue(true);
    render(<ChargesPage />);

    fireEvent.click(openPayment('101'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(openPayment('202'));
    await waitFor(() => expect(mocks.createPayment).toHaveBeenCalledTimes(2));

    expect(mocks.createPayment.mock.calls[0][1]).not.toBe(mocks.createPayment.mock.calls[1][1]);
  });

  it('uses a new key after closing one payment target and selecting another', async () => {
    mocks.createPayment.mockResolvedValue(false);
    render(<ChargesPage />);

    const firstSubmit = openPayment('101');
    fireEvent.click(firstSubmit);
    await waitFor(() => expect(firstSubmit).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    fireEvent.click(openPayment('202'));
    await waitFor(() => expect(mocks.createPayment).toHaveBeenCalledTimes(2));

    expect(mocks.createPayment.mock.calls[0][1]).not.toBe(mocks.createPayment.mock.calls[1][1]);
  });

  it('blocks close and reopen so stale completion cannot affect a new target', async () => {
    const pending = deferred<boolean>();
    mocks.createPayment.mockReturnValueOnce(pending.promise);
    render(<ChargesPage />);
    const submit = openPayment('101');

    fireEvent.click(submit);
    expect(screen.queryByRole('button', { name: 'Закрыть' })).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByText('202'));

    expect(screen.getByRole('dialog')).toHaveAccessibleName('Квартира 101');
    await act(async () => pending.resolve(false));
  });

  it('uses secure random bytes for a UUID v4 key when randomUUID is unavailable', async () => {
    const getRandomValues = vi.fn((array: Uint8Array) => {
      array.forEach((_, index) => { array[index] = index; });
      return array;
    });
    vi.stubGlobal('crypto', { getRandomValues });
    mocks.createPayment.mockResolvedValueOnce(false);
    render(<ChargesPage />);

    fireEvent.click(openPayment('101'));
    await waitFor(() => expect(mocks.createPayment).toHaveBeenCalledTimes(1));

    expect(getRandomValues).toHaveBeenCalledTimes(1);
    expect(mocks.createPayment.mock.calls[0][1]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('keeps table row semantics and opens from a real first-cell button', () => {
    render(<ChargesPage />);
    const table = screen.getByRole('table');
    const row = within(table).getByRole('row', { name: /101/ });
    const openButton = within(row).getByRole('button', { name: /101/ });

    expect(row).not.toHaveAttribute('role');
    expect(openButton.tagName).toBe('BUTTON');
    expect(openButton).toHaveAttribute('type', 'button');
    expect(openButton.tabIndex).toBe(0);
    fireEvent.keyDown(openButton, { key: 'Enter' });

    expect(screen.getByRole('dialog')).toHaveAccessibleName('Квартира 101');
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    fireEvent.click(openButton);
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Квартира 101');
  });

  it('associates payment labels and exposes busy loading status', async () => {
    const pending = deferred<boolean>();
    mocks.createPayment.mockReturnValueOnce(pending.promise);
    render(<ChargesPage />);
    const submit = openPayment('101');

    expect(screen.getByLabelText('Сумма')).toHaveAttribute('id', 'payment-amount');
    expect(screen.getByLabelText('Тип оплаты')).toHaveAttribute('id', 'payment-type');
    expect(screen.getByLabelText('Комментарий')).toHaveAttribute('id', 'payment-description');
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-busy', 'false');

    fireEvent.click(submit);

    await waitFor(() => expect(screen.getByRole('dialog')).toHaveAttribute('aria-busy', 'true'));
    expect(screen.getByRole('status')).toHaveTextContent('Обработка...');
    await act(async () => pending.resolve(false));
  });

  it('gives payment amount, type, and submit controls 44px touch targets', () => {
    render(<ChargesPage />);
    const submit = openPayment('101');

    expect(screen.getByLabelText('Сумма')).toHaveClass('h-11');
    expect(screen.getByLabelText('Тип оплаты')).toHaveClass('h-11');
    expect(submit).toHaveClass('h-11');
    expect(submit.tagName).toBe('BUTTON');
  });
});
