// Auth API

import { apiRequest, transformUser, markLoggedIn } from './client';

// ── 2FA-on-login response shapes ─────────────────────────────────────
// When the backend's TWO_FA_ENABLED flag is OFF, /api/auth/login still
// returns the legacy { user, token } envelope and nothing else changes.
// When ON, an untrusted device gets back a pending payload instead and
// must follow up with /api/auth/2fa/verify before receiving the JWT.
export interface TwoFactorPending {
  twoFactorRequired: true;
  pendingToken: string;
  phoneMasked: string;
  expiresInSec: number;
  resendCooldownSec: number;
  /** Only set when the server is running the dev mock and DEV mode is on. */
  dev_code?: string;
}

export type LoginResult =
  | { kind: 'authenticated'; user: ReturnType<typeof transformUser>; token: string }
  | { kind: 'two_factor'; pending: TwoFactorPending };

const TRUSTED_DEVICE_KEY = 'auth_trusted_device_token';

const readDeviceToken = (): string | undefined => {
  try { return localStorage.getItem(TRUSTED_DEVICE_KEY) || undefined; }
  catch { return undefined; }
};

const writeDeviceToken = (token: string | undefined) => {
  try {
    if (token) localStorage.setItem(TRUSTED_DEVICE_KEY, token);
  } catch { /* private mode etc. */ }
};

export const authApi = {
  login: async (login: string, password: string, lang: 'ru' | 'uz' = 'ru'): Promise<LoginResult> => {
    // The optional fields (deviceToken, lang) are silently ignored by
    // the legacy backend, so this is safe to send unconditionally.
    const deviceToken = readDeviceToken();
    const data = await apiRequest<
      { user: Record<string, unknown>; token: string } | TwoFactorPending
    >('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ login, password, lang, ...(deviceToken ? { deviceToken } : {}) }),
    });

    // 2FA branch: server held the JWT, needs a code first.
    if ((data as TwoFactorPending).twoFactorRequired) {
      return { kind: 'two_factor', pending: data as TwoFactorPending };
    }

    const ok = data as { user: Record<string, unknown>; token: string };
    localStorage.setItem('auth_token', ok.token);
    markLoggedIn(); // 10s grace period before 401s can force logout
    return { kind: 'authenticated', user: transformUser(ok.user), token: ok.token };
  },

  verify2FA: async (pendingToken: string, code: string, rememberDevice: boolean) => {
    const data = await apiRequest<{
      user: Record<string, unknown>;
      token: string;
      deviceToken?: string;
    }>('/api/auth/2fa/verify', {
      method: 'POST',
      body: JSON.stringify({ pendingToken, code, rememberDevice }),
    });
    localStorage.setItem('auth_token', data.token);
    markLoggedIn();
    if (data.deviceToken) writeDeviceToken(data.deviceToken);
    return { user: transformUser(data.user), token: data.token };
  },

  resend2FA: async (pendingToken: string, lang: 'ru' | 'uz' = 'ru') =>
    apiRequest<{
      ok: true;
      expiresInSec: number;
      resendCooldownSec: number;
      dev_code?: string;
    }>('/api/auth/2fa/resend', {
      method: 'POST',
      body: JSON.stringify({ pendingToken, lang }),
    }),

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
