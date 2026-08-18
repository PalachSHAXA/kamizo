import { beforeEach, describe, expect, it } from 'vitest';

import { clearSessionStorage } from '../sessionStorage';

describe('clearSessionStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('removes tenant data while preserving language and theme', () => {
    localStorage.setItem('language-storage', 'uz');
    localStorage.setItem('kamizo:theme', 'dark');
    localStorage.setItem('uk-notification-storage', 'notifications');
    localStorage.setItem('uk-chat-storage', 'chat');
    localStorage.setItem('uk-meeting-storage', 'meetings');
    localStorage.setItem('training-storage', 'training');
    localStorage.setItem('uk-settings-storage', 'settings');
    localStorage.setItem('uk-data-storage', 'legacy');
    localStorage.setItem('tenant-config', 'old-config');
    localStorage.setItem('tenant-config-anon', 'anon-config');
    localStorage.setItem('tenant-config-tenant-a', 'tenant-config');
    sessionStorage.setItem('shown_popup_ids', '["popup-a"]');
    sessionStorage.setItem('marketplace_order_statuses', '{}');
    sessionStorage.setItem('reconsideration_request_ids', '["request-a"]');
    sessionStorage.setItem('open_rating_for_request', 'request-a');
    sessionStorage.setItem('open_delivery_rating_for_order', 'order-a');
    sessionStorage.setItem('unrelated-session-key', 'preserve-me');
    localStorage.setItem('kamizo:vehicle-recent-searches', '["01A001AA"]');
    localStorage.setItem('kamizo_rental_favs', '["rental-a"]');

    clearSessionStorage();

    expect(localStorage.getItem('language-storage')).toBe('uz');
    expect(localStorage.getItem('kamizo:theme')).toBe('dark');
    expect(localStorage.getItem('uk-notification-storage')).toBeNull();
    expect(localStorage.getItem('uk-chat-storage')).toBeNull();
    expect(localStorage.getItem('uk-meeting-storage')).toBeNull();
    expect(localStorage.getItem('training-storage')).toBeNull();
    expect(localStorage.getItem('uk-settings-storage')).toBeNull();
    expect(localStorage.getItem('uk-data-storage')).toBeNull();
    expect(localStorage.getItem('tenant-config')).toBeNull();
    expect(localStorage.getItem('tenant-config-anon')).toBeNull();
    expect(localStorage.getItem('tenant-config-tenant-a')).toBeNull();
    expect(sessionStorage.getItem('shown_popup_ids')).toBeNull();
    expect(sessionStorage.getItem('marketplace_order_statuses')).toBeNull();
    expect(sessionStorage.getItem('reconsideration_request_ids')).toBeNull();
    expect(sessionStorage.getItem('open_rating_for_request')).toBeNull();
    expect(sessionStorage.getItem('open_delivery_rating_for_order')).toBeNull();
    expect(sessionStorage.getItem('unrelated-session-key')).toBe('preserve-me');
    expect(localStorage.getItem('kamizo:vehicle-recent-searches')).toBeNull();
    expect(localStorage.getItem('kamizo_rental_favs')).toBeNull();
  });

  it('preserves an explicitly retained auth token', () => {
    localStorage.setItem('auth_token', 'new-session-token');
    localStorage.setItem('uk-auth-storage', 'old-auth-state');

    clearSessionStorage({ preserveAuthToken: true });

    expect(localStorage.getItem('auth_token')).toBe('new-session-token');
    expect(localStorage.getItem('uk-auth-storage')).toBeNull();
  });
});
