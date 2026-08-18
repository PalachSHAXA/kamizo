import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiRequest, resetApiSession } from '../../services/api/client';
import { useAuthStore } from '../authStore';

describe('401 session expiry boundary', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    resetApiSession();
    useAuthStore.setState({
      user: { id: 'user-a', name: 'User A', login: 'a', role: 'resident', phone: '+998900000000' },
      token: 'token-a',
      error: null,
    });
    localStorage.setItem('auth_token', 'token-a');
    localStorage.setItem('uk-auth-storage', JSON.stringify({ state: { token: 'token-a' } }));
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('clears in-memory auth synchronously and preserves Session expired semantics', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    } as Response));

    await expect(apiRequest('/api/protected/one')).rejects.toBeInstanceOf(ApiError);
    await expect(apiRequest('/api/protected/two')).rejects.toBeInstanceOf(ApiError);
    const expired = apiRequest('/api/protected/three');

    await expect(expired).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Session expired',
      status: 401,
    });
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().token).toBeNull();
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('uk-auth-storage')).toBeNull();
  });
});
