import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetApiSession } from '../client';
import { financeApi } from '../finance';

describe('financeApi.createPayment', () => {
  beforeEach(() => {
    resetApiSession();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('sends the idempotency key as a header and never in the JSON body', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ payment: { id: 'payment-1' } }),
    } as Response);
    const payment = { apartment_id: 'apartment-1', amount: 125_000, payment_type: 'cash' };

    await financeApi.createPayment(payment, 'payment-attempt-123');

    const [, options] = fetchMock.mock.calls[0];
    expect(options?.headers).toEqual(expect.objectContaining({ 'Idempotency-Key': 'payment-attempt-123' }));
    expect(JSON.parse(options?.body as string)).toEqual(payment);
    expect(options?.body).not.toContain('payment-attempt-123');
  });
});
