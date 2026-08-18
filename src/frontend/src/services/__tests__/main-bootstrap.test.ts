import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createRoot, render } = vi.hoisted(() => ({
  render: vi.fn(),
  createRoot: vi.fn(),
}));
createRoot.mockReturnValue({ render });

vi.mock('react-dom/client', () => ({ createRoot }));
vi.mock('@capacitor/core', async (importOriginal) => ({
  ...await importOriginal<typeof import('@capacitor/core')>(),
  Capacitor: { isNativePlatform: () => false },
}));
vi.mock('@capacitor/keyboard', () => ({ Keyboard: { setAccessoryBarVisible: vi.fn() } }));
vi.mock('../../App.tsx', () => ({ default: () => null }));

const exchangeResponse = {
  user: {
    id: 'impersonated-user',
    login: 'admin',
    phone: '+998',
    name: 'Admin',
    role: 'admin',
    tenant_id: 'tenant-1',
  },
  token: 'impersonated-token',
  tenantName: 'Tenant B',
  originUrl: 'https://app.kamizo.uz/admin',
};

describe('impersonation exchange bootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
    createRoot.mockClear();
    render.mockClear();
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '<div id="root"></div>';
    window.history.replaceState({}, '', '/');
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({ matches: false })),
    });
  });

  it('cleans the code from history before posting the exchange', async () => {
    window.history.replaceState({}, '', '/dashboard?keep=1&impersonation_code=opaque-code');
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(window.location.pathname + window.location.search).toBe('/dashboard?keep=1');
      expect(init).toMatchObject({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'opaque-code' }),
      });
      return new Response(JSON.stringify(exchangeResponse), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const reload = vi.fn();
    const { bootstrap } = await import('../../main');
    await bootstrap(reload);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.kamizo.uz/api/auth/impersonation-exchange',
      expect.any(Object),
    );
  });

  it('installs the exchanged session and reloads without mounting App', async () => {
    window.history.replaceState({}, '', '/?impersonation_code=opaque-code');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(exchangeResponse), { status: 200 })));

    const reload = vi.fn();
    const { bootstrap } = await import('../../main');
    await bootstrap(reload);

    expect(localStorage.getItem('auth_token')).toBe('impersonated-token');
    expect(JSON.parse(localStorage.getItem('uk-auth-storage')!)).toMatchObject({
      state: { user: { id: 'impersonated-user', tenantId: 'tenant-1' }, token: 'impersonated-token' },
      version: 4,
    });
    expect(JSON.parse(localStorage.getItem('kamizo_impersonation')!)).toEqual({
      origin_url: 'https://app.kamizo.uz/admin',
      tenant_name: 'Tenant B',
    });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(createRoot).not.toHaveBeenCalled();
  });

  it('clears replacement state and mounts the normal login path when exchange fails', async () => {
    localStorage.setItem('auth_token', 'stale-token');
    localStorage.setItem('uk-auth-storage', '{"state":{"token":"stale-token"}}');
    localStorage.setItem('kamizo_impersonation', '{"tenant_name":"stale"}');
    window.history.replaceState({}, '', '/?impersonation_code=expired-code');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"expired"}', { status: 400 })));

    const reload = vi.fn();
    const { bootstrap } = await import('../../main');
    await bootstrap(reload);

    expect(window.location.search).toBe('');
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('uk-auth-storage')).toBeNull();
    expect(localStorage.getItem('kamizo_impersonation')).toBeNull();
    expect(reload).not.toHaveBeenCalled();
    expect(createRoot).toHaveBeenCalledTimes(1);
  });

  it('clears a partially written replacement session when storage fails', async () => {
    window.history.replaceState({}, '', '/?impersonation_code=opaque-code');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(exchangeResponse), { status: 200 })));
    const originalSetItem = Storage.prototype.setItem;
    let writes = 0;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      writes++;
      if (writes === 2) throw new Error('Storage unavailable');
      return originalSetItem.call(this, key, value);
    });

    const { bootstrap } = await import('../../main');
    await bootstrap(vi.fn());

    expect(localStorage.getItem('uk-auth-storage')).toBeNull();
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('kamizo_impersonation')).toBeNull();
    expect(createRoot).toHaveBeenCalledTimes(1);
    setItem.mockRestore();
  });

  it('does not replay a code after the cleaned success turn', async () => {
    window.history.replaceState({}, '', '/?impersonation_code=one-time-code');
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(exchangeResponse), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { bootstrap } = await import('../../main');
    await bootstrap(vi.fn());
    await bootstrap(vi.fn());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe('');
    expect(createRoot).toHaveBeenCalledTimes(1);
  });
});
