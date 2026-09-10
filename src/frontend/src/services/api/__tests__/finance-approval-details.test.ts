// PR-10 (feat/smeta-approval-ui): тест API-метода postApprovalDetails.
// Wire-check — правильный URL, метод, body. Backend протестирован
// отдельно в cloudflare/src/routes/__tests__ (PR-8).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetApiSession } from '../client';
import { estimateV2Api } from '../finance-v2';

describe('estimateV2Api.postApprovalDetails', () => {
  beforeEach(() => {
    resetApiSession();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('POST на правильный path с сериализованным body', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({ success: true }),
    } as Response);

    const details = {
      approval_protocol_number: '№12',
      approval_signed_at: '2026-09-30',
      approval_vote_result: '85% за, 10% против, 5% воздержались',
      approval_notes: 'Тариф утверждён с условием ежеквартального отчёта',
    };
    await expect(estimateV2Api.postApprovalDetails('est-42', details)).resolves.toEqual({ success: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/finance\/estimates\/est-42\/approval-details$/);
    expect(init).toMatchObject({ method: 'POST' });
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent).toEqual(details);
  });

  it('пустые/null-поля передаются как есть — backend разберётся', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({ success: true }),
    } as Response);

    await estimateV2Api.postApprovalDetails('est-1', {
      approval_protocol_number: null,
      approval_signed_at: null,
    });
    const [, init] = fetchMock.mock.calls[0];
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent).toEqual({ approval_protocol_number: null, approval_signed_at: null });
  });
});
