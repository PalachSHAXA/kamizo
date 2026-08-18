import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetSessionScopedState } from '../sessionReset';
import { useTenantStore, type TenantConfig } from '../tenantStore';

function deferredJsonResponse<T>(data: T) {
  let resolveJson!: (value: T) => void;
  const json = new Promise<T>((resolve) => { resolveJson = resolve; });
  return {
    response: Promise.resolve({ ok: true, status: 200, json: () => json } as Response),
    resolveJson: () => resolveJson(data),
  };
}

describe('tenant config session isolation', () => {
  beforeEach(() => {
    localStorage.clear();
    useTenantStore.setState(useTenantStore.getInitialState(), true);
    vi.restoreAllMocks();
  });

  it('does not apply or retry a delayed config from the previous session', async () => {
    const tenantA: TenantConfig = {
      tenant: {
        id: 'tenant-a', name: 'Tenant A', slug: 'tenant-a', color: '#000000',
        color_secondary: '#ffffff', plan: 'base', logo: null, is_demo: false,
      },
      features: ['requests'],
    };
    const delayed = deferredJsonResponse(tenantA);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(delayed.response);

    const requestA = useTenantStore.getState().fetchConfig();
    await resetSessionScopedState();
    delayed.resolveJson();
    await requestA;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useTenantStore.getState().config).toBeNull();
    expect(useTenantStore.getState().isConfigFetched).toBe(false);
    expect(useTenantStore.getState().error).toBeNull();
  });
});
