const sessionStoreResets = new Map<object, () => void>();

export function registerSessionStore<T>(store: {
  getInitialState: () => T;
  setState: (state: T, replace: true) => void;
}): void {
  sessionStoreResets.set(store, () => store.setState(store.getInitialState(), true));
}

export function resetRegisteredSessionStores(): void {
  for (const resetStore of sessionStoreResets.values()) {
    try {
      resetStore();
    } catch {
      // A broken store must not leave other tenant-scoped stores populated.
    }
  }
}
