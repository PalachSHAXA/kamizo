import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetApiSession } from '../client';
import { teamApi, usersApi } from '../users';

describe('usersApi.resetUserPassword', () => {
  beforeEach(() => {
    resetApiSession();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('returns the generated temporary password from the staff reset endpoint', async () => {
    const response = {
      success: true,
      message: 'Temporary password set for Nodir Rahimov',
      temporaryPassword: 'Temp-9482',
      user: { id: 'staff-7', login: 'n.rahimov', name: 'Nodir Rahimov', role: 'manager' as const },
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => response,
    } as Response);

    await expect(usersApi.resetUserPassword('staff-7')).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/users\/staff-7\/reset-password$/),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('models the team total and nullable list fields', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        directors: [],
        admins: [],
        managers: [{
          id: 'staff-7', login: 'n.rahimov', name: 'Nodir Rahimov', phone: null,
          role: 'manager', specialization: null, is_active: 1,
          created_at: '2026-08-01T00:00:00.000Z', completed_count: 0, active_count: 0, avg_rating: 0,
        }],
        departmentHeads: [],
        executors: [],
        total: 1,
      }),
    } as Response);

    const result = await teamApi.getAll();
    expect(result.total).toBe(1);
    expect(result.managers[0].phone).toBeNull();
    expect(result.managers[0].specialization).toBeNull();
  });

  it('models nullable detail fields returned by the team endpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        user: {
          id: 'staff-7', login: 'n.rahimov', name: 'Nodir Rahimov', phone: null,
          role: 'manager', specialization: null, status: null, created_at: '2026-08-01T00:00:00.000Z',
        },
      }),
    } as Response);

    const result = await teamApi.getById('staff-7');
    expect(result.user.phone).toBeNull();
    expect(result.user.specialization).toBeNull();
    expect(result.user.status).toBeNull();
  });
});
