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

// Surface colors — kept in sync with --app-bg in index.css :root and
// html.dark. If you change either there, change here too: the OS status
// bar is painted from these literals, not from a CSS var (the bar's bg
// is set by meta + native plugin, both of which need a resolved hex).
const SURFACE_LIGHT = '#F4F0E8';
const SURFACE_DARK = '#1A1612';

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

// ── Native status-bar bridge ──────────────────────────────────────────
// @capacitor/status-bar is a thin wrapper around iOS UIStatusBar and the
// Android system window flags. We import it lazily inside applyTheme so
// the PWA bundle never pays for it (the dynamic import is dropped from
// the web chunk graph after tree-shaking when the runtime never enters
// the Capacitor branch).
//
// Style naming is COUNTER-INTUITIVE and the cause of every status-bar
// regression we have ever shipped — document it loudly:
//   • Style.Dark  = LIGHT icons (for use ON a DARK background)
//   • Style.Light = DARK icons (for use ON a LIGHT background)
//   • Style.Default = follow system (do NOT use — bypasses our toggle)
// Reason: the enum names describe the CONTEXT (dark UI vs. light UI),
// not the icon color. Apple's docs use the same convention.
//
// setBackgroundColor is Android-only (the iOS API has no equivalent;
// the iOS bar background is whatever the webview paints behind it, or
// the boot-time backgroundColor from capacitor.config.ts plus the
// runtime Style. We rely on the webview's --app-bg for iOS native.
async function applyNativeStatusBar(theme: Theme): Promise<void> {
  // Guard 1: not running under Capacitor → silent no-op (web build).
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (!cap?.isNativePlatform?.()) return;

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    if (theme === 'dark') {
      await StatusBar.setStyle({ style: Style.Dark });   // LIGHT icons on dark bg
      await StatusBar.setBackgroundColor({ color: SURFACE_DARK });
    } else {
      await StatusBar.setStyle({ style: Style.Light });  // DARK icons on light bg
      await StatusBar.setBackgroundColor({ color: SURFACE_LIGHT });
    }
  } catch {
    // Plugin not installed in this build, or native side rejected.
    // The web/PWA path still themes via meta tags, so we degrade
    // gracefully rather than throwing into the React tree.
  }
}

/** Bootstrap helper — called by ThemeProvider on mount and whenever
 *  the store flips. Three surfaces to keep in sync:
 *    1. html.dark class — drives Tailwind + every CSS variable swap
 *    2. <meta name="theme-color"> — Android Chrome system bar + iOS
 *       Safari PWA status bar background
 *    3. <meta name="apple-mobile-web-app-status-bar-style"> — iOS PWA
 *       only; flipped from "default" (light icons) to "black-translucent"
 *       (light icons on top of whatever the webview paints, so our dark
 *       --app-bg shows continuously to the notch)
 *    4. Capacitor StatusBar plugin — native iOS + Android shells
 */
export function applyTheme(theme: Theme): void {
  const html = document.documentElement;
  if (theme === 'dark') html.classList.add('dark');
  else html.classList.remove('dark');

  // Cross-platform status-bar tint (Android Chrome + iOS Safari PWA).
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  themeColorMeta?.setAttribute('content', theme === 'dark' ? SURFACE_DARK : SURFACE_LIGHT);

  // iOS PWA standalone — the system reads this at LAUNCH, but a few
  // tab-mode contexts honour live changes, and our pre-paint script in
  // index.html mirrors this for next-launch correctness. The Home hero
  // already starts below env(safe-area-inset-top), so "black-translucent"
  // (webview extends to y=0) does not hide content — it lets the dark
  // surface paint continuously up to the notch.
  const iosStatusBarMeta = document.querySelector(
    'meta[name="apple-mobile-web-app-status-bar-style"]'
  );
  iosStatusBarMeta?.setAttribute(
    'content',
    theme === 'dark' ? 'black-translucent' : 'default'
  );

  // Native Capacitor shell — fire-and-forget; never blocks React.
  void applyNativeStatusBar(theme);
}
