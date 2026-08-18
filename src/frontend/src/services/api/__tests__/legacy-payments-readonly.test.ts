import { describe, expect, it } from 'vitest';
import { paymentsApi } from '../payments';

describe('legacy payments API compatibility', () => {
  it('does not expose the retired legacy mutation', () => {
    expect(paymentsApi).not.toHaveProperty('createPayment');
  });
});
