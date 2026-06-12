// Theme store — light / dark, persisted in localStorage.
//
// `html.dark` is the canonical signal: ThemeProvider (mounted from App)
// sets/unsets it whenever the store flips, the pre-paint inline script
// in index.html sets it before React boots so we never flash light
// first on a dark-mode device, and Tailwind's `darkMode: 'class'`
// resolves utility classes against the same root.
//
// Persistence key: 'kamizo:theme' (read by index.html pre-paint script
// too — keep the string in sync there).

import { create } from 'zustand';

const STORAGE_KEY = 'kamizo:theme';
type Theme = 'light' | 'dark';

function readPersisted(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

interface ThemeState {
  theme: Theme;
  setTheme: (next: Theme) => void;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>()((set, get) => ({
  theme: readPersisted(),
  setTheme: (next: Theme) => {
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* private mode */ }
    set({ theme: next });
  },
  toggle: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
}));

/** Bootstrap helper — called by ThemeProvider on mount and whenever
 *  the store flips. Applies the class to <html>, updates the Capacitor
 *  / PWA theme-color meta so the system status bar tracks the page. */
export function applyTheme(theme: Theme): void {
  const html = document.documentElement;
  if (theme === 'dark') html.classList.add('dark');
  else html.classList.remove('dark');

  // Status-bar / PWA chrome colour. Matches --app-bg in each mode so
  // there is no seam between the OS strip and the page content.
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', theme === 'dark' ? '#1A1612' : '#F4F0E8');
}
