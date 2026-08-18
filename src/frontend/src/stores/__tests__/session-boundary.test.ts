import { beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '../authStore';
import { registerSessionStore, resetRegisteredSessionStores } from '../sessionRegistry';
import { resetSessionScopedState } from '../sessionReset';
import { useTenantStore, type TenantConfig } from '../tenantStore';

const tenantConfig: TenantConfig = {
  tenant: {
    id: 'tenant-a',
    name: 'Tenant A',
    slug: 'tenant-a',
    color: '#000000',
    color_secondary: '#ffffff',
    plan: 'base',
    logo: null,
    is_demo: false,
  },
  features: ['requests'],
};

describe('synchronous session boundary', () => {
  beforeEach(() => {
    localStorage.clear();
    useTenantStore.setState(useTenantStore.getInitialState(), true);
    useAuthStore.setState({ user: null, token: null, error: null });
  });

  it('resets registered domain state before returning', () => {
    useTenantStore.setState({ config: tenantConfig, isConfigFetched: true });

    const result = resetSessionScopedState();

    expect(result).toBeUndefined();
    expect(useTenantStore.getState().config).toBeNull();
  });

  it('logout resets domain state and persisted storage synchronously', () => {
    useTenantStore.setState({ config: tenantConfig, isConfigFetched: true });
    useAuthStore.setState({
      user: { id: 'user-a', name: 'User A', login: 'a', role: 'resident', phone: '+998900000000' },
      token: 'token-a',
    });
    localStorage.setItem('auth_token', 'token-a');
    localStorage.setItem('tenant-config-tenant-a', 'persisted-a');

    useAuthStore.getState().logout();

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().token).toBeNull();
    expect(useTenantStore.getState().config).toBeNull();
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('tenant-config-tenant-a')).toBeNull();
  });

  it('continues resetting stores when one registered store throws', () => {
    let healthyState = 'tenant-data';
    registerSessionStore({
      getInitialState: () => 'initial',
      setState: () => { throw new Error('broken store'); },
    });
    registerSessionStore({
      getInitialState: () => 'initial',
      setState: (state) => { healthyState = state; },
    });

    expect(() => resetRegisteredSessionStores()).not.toThrow();
    expect(healthyState).toBe('initial');
  });
});
