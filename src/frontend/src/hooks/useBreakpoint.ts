import { useSyncExternalStore } from 'react';

// Mirror of tailwind.config.js `screens` (defaults + our `xs` extension).
// Keep these in sync if you ever bump either.
const BP = {
  xs: 375,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

export type Breakpoint = keyof typeof BP;

function getMatchMedia(query: string): MediaQueryList | null {
  if (typeof window === 'undefined' || !window.matchMedia) return null;
  return window.matchMedia(query);
}

function subscribe(query: string, callback: () => void): () => void {
  const mql = getMatchMedia(query);
  if (!mql) return () => {};
  // addEventListener is the modern API; older Safari fallback to addListener.
  if (mql.addEventListener) {
    mql.addEventListener('change', callback);
    return () => mql.removeEventListener('change', callback);
  }
  mql.addListener(callback);
  return () => mql.removeListener(callback);
}

/**
 * Returns true if the viewport is at least the given Tailwind breakpoint.
 *
 * Usage:
 *   const isDesktop = useBreakpoint('lg');
 *   const isCompact = !useBreakpoint('md');
 *
 * Implementation note: built on useSyncExternalStore for React 18 concurrent-
 * safe behavior. Falls back to `false` during SSR / pre-hydration.
 */
export function useBreakpoint(bp: Breakpoint): boolean {
  const query = `(min-width: ${BP[bp]}px)`;
  return useSyncExternalStore(
    (cb) => subscribe(query, cb),
    () => getMatchMedia(query)?.matches ?? false,
    () => false,
  );
}

/**
 * Convenience flag for "below md" — the typical mobile/tablet-portrait band
 * where bottom-sheets and drawer navigation belong.
 */
export function useIsMobile(): boolean {
  return !useBreakpoint('md');
}
