import { describe, expect, it } from 'vitest';
import { generateLoginApprovalCode, hashLoginApprovalCode } from '../login-approval';

describe('Telegram login approval code', () => {
  it('generates a six-digit code including leading-zero range', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateLoginApprovalCode()).toMatch(/^\d{6}$/);
    }
  });

  it('hashes deterministically without storing the code itself', async () => {
    const first = await hashLoginApprovalCode('request-1', '123456', 'secret');
    const second = await hashLoginApprovalCode('request-1', '123456', 'secret');
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toContain('123456');
  });

  it('binds the hash to request id and server secret', async () => {
    const base = await hashLoginApprovalCode('request-1', '123456', 'secret');
    expect(await hashLoginApprovalCode('request-2', '123456', 'secret')).not.toBe(base);
    expect(await hashLoginApprovalCode('request-1', '123456', 'other-secret')).not.toBe(base);
  });
});
