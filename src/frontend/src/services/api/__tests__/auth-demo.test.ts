import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authApi } from '../auth';
import { resetApiSession } from '../client';
import type { DemoRole } from '../../../types/auth';
import type { UserRole } from '../../../types/common';

describe('demo auth API', () => {
  beforeEach(() => {
    resetApiSession();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('loads demo roles with a no-store GET', async () => {
    const response = {
      roles: [{
        roleKey: 'director', role: 'director', specialization: null, primary: true, order: 10,
      }],
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => response,
    } as Response);

    await expect(authApi.getDemoRoles()).resolves.toEqual(response.roles);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.kamizo.uz/api/auth/demo-roles',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('posts only the selected role key to demo login', async () => {
    const response = {
      user: { id: 'user-1', name: 'Демо Директор', login: 'demo-director', role: 'director', phone: '' },
      token: 'demo-jwt',
      demoSession: true,
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => response,
    } as Response);

    await expect(authApi.demoLogin('director')).resolves.toEqual({
      user: expect.objectContaining({ id: 'user-1', role: 'director' }),
      token: 'demo-jwt',
      demoSession: true,
    });
    const [, options] = fetchMock.mock.calls[0];
    expect(options).toEqual(expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ roleKey: 'director' }),
    }));
  });

  it('accepts a courier descriptor and logs it into executor behavior', async () => {
    const roles: DemoRole[] = [{
      roleKey: 'courier', role: 'executor' as const,
      specialization: 'courier' as const, primary: false, order: 110,
    }];
    const routedRole: UserRole = roles[0].role;
    expect(routedRole).toBe('executor');
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ roles }) } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ user: { id: 'courier-1', name: 'Демо Курьер', login: 'demo-courier', role: 'executor', specialization: 'courier', phone: '' }, token: 'courier-jwt', demoSession: true }),
      } as Response);

    await expect(authApi.getDemoRoles()).resolves.toEqual(roles);
    await expect(authApi.demoLogin('courier')).resolves.toEqual({
      user: expect.objectContaining({ role: 'executor', specialization: 'courier' }),
      token: 'courier-jwt',
      demoSession: true,
    });
  });
});
