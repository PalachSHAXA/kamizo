import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SessionChangedError,
  apiRequest,
  cachedGet,
  resetApiSession,
} from '../client';
import { authApi } from '../auth';

function deferredResponse<T>(data: T) {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((next) => { resolve = next; });
  return {
    promise,
    resolve: () => resolve({
      ok: true,
      status: 200,
      json: async () => data,
    } as Response),
  };
}

function deferredJson<T>(data: T) {
  let resolve!: (value: T) => void;
  const json = new Promise<T>((next) => { resolve = next; });
  return {
    response: {
      ok: true,
      status: 200,
      json: () => json,
    } as Response,
    resolve: () => resolve(data),
  };
}

describe('API session isolation', () => {
  beforeEach(() => {
    resetApiSession();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('does not share or cache a delayed GET from the previous session', async () => {
    const sessionA = deferredResponse({ tenant: 'A' });
    const sessionB = deferredResponse({ tenant: 'B' });
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockReturnValueOnce(sessionA.promise)
      .mockReturnValueOnce(sessionB.promise);

    const requestA = cachedGet<{ tenant: string }>('/api/shared');
    resetApiSession();
    const requestB = cachedGet<{ tenant: string }>('/api/shared');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    sessionA.resolve();
    await expect(requestA).rejects.toBeInstanceOf(SessionChangedError);
    sessionB.resolve();
    await expect(requestB).resolves.toEqual({ tenant: 'B' });

    await expect(cachedGet('/api/shared')).resolves.toEqual({ tenant: 'B' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('aborts active requests and reports a non-user-facing session change', async () => {
    let requestSignal: AbortSignal | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      requestSignal = init?.signal ?? undefined;
      return new Promise((_resolve, reject) => {
        requestSignal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    const request = apiRequest('/api/slow');
    resetApiSession();

    expect(requestSignal?.aborted).toBe(true);
    await expect(request).rejects.toBeInstanceOf(SessionChangedError);
  });

  it('rejects a reset that happens while response JSON is parsing', async () => {
    const delayed = deferredJson({ tenant: 'A' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(delayed.response);

    const request = apiRequest('/api/deferred-json');
    await Promise.resolve();
    resetApiSession();
    delayed.resolve();

    await expect(request).rejects.toBeInstanceOf(SessionChangedError);
  });

  it('lets the browser set the multipart boundary for FormData', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    } as Response);
    const body = new FormData();
    body.append('file', new Blob(['a']), 'a.txt');

    await apiRequest('/api/upload', { method: 'POST', body });

    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers['Content-Type']).toBeUndefined();
  });

  it('returns login credentials without installing the new token', async () => {
    localStorage.setItem('auth_token', 'current-session-token');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        token: 'new-session-token',
        user: { id: 'user-b', name: 'Tenant B User' },
      }),
    } as Response);

    await expect(authApi.login('user-b', 'password')).resolves.toMatchObject({
      kind: 'success',
      token: 'new-session-token',
    });
    expect(localStorage.getItem('auth_token')).toBe('current-session-token');
  });

  it('preserves demo capability on a password login response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        token: 'demo-session-token',
        demoSession: true,
        user: { id: 'resident-1', name: 'Demo Resident', login: '98765432', role: 'resident', phone: '' },
      }),
    } as Response);

    await expect(authApi.login('resident', 'kamizo')).resolves.toMatchObject({
      kind: 'success',
      user: { demoSession: true },
      token: 'demo-session-token',
    });
  });
});
