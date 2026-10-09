import { useEffect, useState } from 'react';

/**
 * Tracks browser online/offline status via navigator.onLine +
 * window 'online'/'offline' events. Returns true when connected.
 *
 * SSR-safe: defaults to `true` when window is undefined. On WebView
 * (iOS / Capacitor) navigator.onLine is reliable; on desktop Chrome
 * it only flips when the OS loses network, not just when a specific
 * host becomes unreachable — so this hook is a soft signal, not a
 * guarantee that API calls will succeed.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  return online;
}
