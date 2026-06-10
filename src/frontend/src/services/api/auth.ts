// Auth API

import { apiRequest, transformUser, markLoggedIn } from './client';

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
  | { kind: 'success'; user: Record<string, unknown>; token: string }
  | { kind: 'picker'; tenants: TenantPickEntry[] };

interface LoginSuccessResponse {
  user: Record<string, unknown>;
  token: string;
}

interface LoginPickerResponse {
  needs_tenant_pick: true;
  tenants: TenantPickEntry[];
}

type LoginResponse = LoginSuccessResponse | LoginPickerResponse;

function isPickerResponse(r: LoginResponse): r is LoginPickerResponse {
  return (r as LoginPickerResponse).needs_tenant_pick === true;
}

export const authApi = {
  /**
   * Log in with login + password. Pass `tenantSlug` on the re-submit
   * after the user picks a workspace from the picker.
   *
   * The token is persisted (localStorage + markLoggedIn) ONLY on the
   * success branch. The picker branch just hands the tenant list back
   * to the caller — no session state is touched, so cancelling the
   * picker leaves the app exactly as it was before submit.
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

    localStorage.setItem('auth_token', data.token);
    markLoggedIn(); // 10s grace period before 401s can force logout
    return {
      kind: 'success',
      user: transformUser(data.user),
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
    return apiRequest<{ user: Record<string, unknown> }>('/api/auth/register', {
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
