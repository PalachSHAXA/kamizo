// Auth API

import { apiRequest, transformUser } from './client';
import type { UserApiResponse } from './client';
import type { DemoRole, User } from '../../types/auth';

interface RegisteredUserDto {
  id: string;
  name: string;
  login: string;
  phone?: string;
  specialization?: string;
}

/** A workspace candidate returned by the disambiguation flow. */
export interface TenantPickEntry {
  slug: string;
  name: string;
  logo: string | null;
}

/**
 * Login result discriminated union.
 *
 * The backend (cloudflare/src/routes/users/auth.ts) returns either:
 *   • { user, token }                                — credentials matched
 *     exactly one row → caller logs in.
 *   • { needs_tenant_pick: true, tenants: [...] }    — credentials matched
 *     2+ tenant rows (same phone-login registered in multiple ЖК); the
 *     caller must show a picker and re-submit with `tenantSlug`.
 * Any 4xx/5xx throws via apiRequest.
 */
export type LoginResult =
  | { kind: 'success'; user: unknown; token: string }
  | { kind: 'picker'; tenants: TenantPickEntry[] };

interface LoginSuccessResponse {
  user: UserApiResponse;
  token: string;
  demoSession?: true;
}

interface LoginPickerResponse {
  needs_tenant_pick: true;
  tenants: TenantPickEntry[];
}

type LoginResponse = LoginSuccessResponse | LoginPickerResponse;

interface DemoRolesResponse {
  roles: DemoRole[];
}

interface DemoLoginResult {
  user: User;
  token: string;
  demoSession: true;
}

interface DemoLoginResponse extends LoginSuccessResponse {
  demoSession: true;
}

function isPickerResponse(r: LoginResponse): r is LoginPickerResponse {
  return 'needs_tenant_pick' in r && r.needs_tenant_pick === true;
}

export const authApi = {
  getDemoRoles: async (): Promise<DemoRole[]> => {
    const data = await apiRequest<DemoRolesResponse>('/api/auth/demo-roles', {
      cache: 'no-store',
    });
    return data.roles;
  },

  demoLogin: async (roleKey: string): Promise<DemoLoginResult> => {
    const data = await apiRequest<DemoLoginResponse>('/api/auth/demo-login', {
      method: 'POST',
      body: JSON.stringify({ roleKey }),
    });
    return {
      user: { ...transformUser(data.user), demoSession: data.demoSession },
      token: data.token,
      demoSession: data.demoSession,
    };
  },

  /**
   * Log in with login + password. Pass `tenantSlug` on the re-submit
   * after the user picks a workspace from the picker.
   *
   * This module only returns data. Session installation belongs to the
   * auth store so it can reset the previous tenant atomically first.
   */
  login: async (
    login: string,
    password: string,
    tenantSlug?: string,
  ): Promise<LoginResult> => {
    const body: { login: string; password: string; tenantSlug?: string } = {
      login,
      password,
    };
    if (tenantSlug) body.tenantSlug = tenantSlug;

    const data = await apiRequest<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (isPickerResponse(data)) {
      return { kind: 'picker', tenants: data.tenants ?? [] };
    }

    const user = transformUser(data.user);
    return {
      kind: 'success',
      user: data.demoSession ? { ...user, demoSession: true } : user,
      token: data.token,
    };
  },

  logout: () => {
    localStorage.removeItem('auth_token');
  },

  register: async (userData: {
    login: string;
    password: string;
    name: string;
    role: string;
    phone?: string;
    address?: string;
    apartment?: string;
    specialization?: string;
    building_id?: string;
    entrance?: string;
    floor?: string;
    branch?: string;
    building?: string;
  }) => {
    return apiRequest<{ user: RegisteredUserDto }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  registerBulk: async (users: Array<{
    login: string;
    password: string;
    name: string;
    role: string;
    phone?: string;
    address?: string;
    apartment?: string;
    building_id?: string;
    entrance?: string;
    floor?: string;
  }>) => {
    return apiRequest<{ created: Record<string, unknown>[]; updated: Record<string, unknown>[] }>('/api/auth/register-bulk', {
      method: 'POST',
      body: JSON.stringify({ users }),
    });
  },
};
