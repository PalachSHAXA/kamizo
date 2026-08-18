const LOCAL_SESSION_KEYS = [
  'auth_token',
  'uk-auth-storage',
  'user_id',
  'kamizo_impersonation',
  'uk-notification-storage',
  'uk-chat-storage',
  'uk-meeting-storage',
  'training-storage',
  'uk-settings-storage',
  'uk-data-storage',
  'kamizo:vehicle-recent-searches',
  'kamizo_rental_favs',
] as const;

const BROWSER_SESSION_KEYS = [
  'shown_popup_ids',
  'marketplace_order_statuses',
  'reconsideration_request_ids',
  'open_rating_for_request',
  'open_delivery_rating_for_order',
] as const;

const LOCAL_SESSION_PREFIXES = ['tenant-config-', 'read_announcements_'] as const;

interface ClearSessionStorageOptions {
  preserveAuthToken?: boolean;
}

export function clearSessionStorage(options: ClearSessionStorageOptions = {}): void {
  try {
    const storage = globalThis.localStorage;
    const retainedToken = options.preserveAuthToken
      ? storage.getItem('auth_token')
      : null;

    for (const key of LOCAL_SESSION_KEYS) storage.removeItem(key);
    storage.removeItem('tenant-config');
    for (const key of Object.keys(storage)) {
      if (LOCAL_SESSION_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        storage.removeItem(key);
      }
    }

    if (retainedToken) storage.setItem('auth_token', retainedToken);
  } catch {
    // localStorage can be unavailable in private/restricted contexts.
  }

  try {
    const storage = globalThis.sessionStorage;
    for (const key of BROWSER_SESSION_KEYS) storage.removeItem(key);
  } catch {
    // sessionStorage availability is independent from localStorage.
  }
}
