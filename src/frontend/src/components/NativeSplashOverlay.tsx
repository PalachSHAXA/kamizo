// Time-based webview splash overlay. Imported from the claude.ai/design
// "Kamizo Splash" project — original was a single HTML file with both
// light + dark variants toggled via a manual theme button. For in-app
// use we:
//   • Pick the theme automatically by clock time, not by OS dark/light:
//     07:00–18:59 → light, 19:00–06:59 → dark. Override available via
//     URLSearchParams `?splashTheme=light|dark` (PWA testing) or
//     localStorage `kamizo_force_splash_theme` (native dev tools).
//   • Cover the full viewport including safe-area band on every iPhone
//     (SE → 17 Pro Max) and Android via 100vw + 100dvh + safe-area
//     padding on the loader.
//   • Call SplashScreen.hide() immediately on mount so the native
//     splash dismisses and this overlay takes over — the user sees a
//     single seamless splash, not two.
//   • Self-unmount ~2.6 s after mount with a 400 ms fade — total
//     splash time matches the source animation timing budget.
//
// v118.15 — three follow-up fixes from real-device feedback:
//   (1) Native StatusBar bleed: themeStore.applyNativeStatusBar paints
//       an opaque native status-bar background in the app's persisted
//       theme color (dark = #1A1612 brown). The WebView splash can't
//       cover that bar because `overlaysWebView: false`. Fix: while
//       this overlay is mounted we flip StatusBar to overlay:true
//       (transparent, WebView extends under it) and pick its icon
//       style from THE SPLASH theme. On unmount we re-apply the app
//       theme so the rest of the app uses its own status bar config.
//   (2) BottomBar flash through: BottomBar is portaled to document.
//       body (outside #root), so its body-level z-index:1000 beats any
//       z-index inside #root (which carries `app-booting` →
//       transform:translateY → new stacking context). Fix: portal this
//       overlay to document.body too — same stacking-context layer as
//       BottomBar, z-index 9999 wins cleanly.
//   (3) Wrong-time theme: defensive Intl.DateTimeFormat in the clock
//       fallback so getHours() isn't trusted to be local. Plus a one-
//       line console.log on theme pick so dev can verify in Safari Web
//       Inspector which branch fired (URL / localStorage / clock + raw
//       hour value).

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import './NativeSplashOverlay.css';

type Theme = 'light' | 'dark';

// Stash debug info so it survives production minification (vite.config
// drops all `console.*` calls in production builds — see vite.config.ts
// `esbuild.drop: ['console', 'debugger']`). The user can inspect this
// in Safari Web Inspector via:
//   window.__kamizoSplashDebug
//   localStorage.getItem('kamizo_splash_debug')
// PLUS — v118.16 — a visible on-screen strip is rendered inside the
// splash too, so the user doesn't need Web Inspector to see what was
// picked. Strip is small + top-left + only shown while the splash is
// up; remove after we confirm the time-zone path is correct.
interface PickInfo {
  theme: Theme;
  source: 'url' | 'localStorage' | 'clock';
  forced?: Theme;
  hour?: number;
  timezone?: string;
  intlSucceeded?: boolean;
  rawUTCHour?: number;
  rawLocalHour?: number;
}

function stashDebug(payload: Record<string, unknown>): void {
  try {
    (window as unknown as { __kamizoSplashDebug?: unknown }).__kamizoSplashDebug = payload;
  } catch { /* sandbox */ }
  try {
    localStorage.setItem('kamizo_splash_debug', JSON.stringify(payload));
  } catch { /* private mode */ }
}

function pickTheme(): PickInfo {
  // v118.30 — ONE-TIME auto-clear of any stale
  // `kamizo_force_splash_theme` left over from earlier dev testing.
  // The user reported: at 19:56 Tashkent (after the 19:00 cut-off)
  // the splash kept showing LIGHT, because localStorage had been
  // set to 'light' during a previous build's testing flow and
  // never cleared. We can't see it from here, so we wipe it once
  // per binary install, gated by a flag the wipe itself sets
  // (`kamizo_splash_overrides_purged_v170`) so subsequent launches
  // honour any NEW localStorage override the user might want to
  // set legitimately. URL `?splashTheme=light|dark` still wins
  // for THIS launch even after the purge (URL check comes later).
  try {
    if (!localStorage.getItem('kamizo_splash_overrides_purged_v170')) {
      try { localStorage.removeItem('kamizo_force_splash_theme'); } catch { /* private mode */ }
      try { localStorage.setItem('kamizo_splash_overrides_purged_v170', '1'); } catch { /* private mode */ }
    }
  } catch { /* private mode */ }

  // 0) URL `?splashTheme=auto` — explicit reset. Clears any stale
  //    localStorage override left from earlier dev testing and falls
  //    through to the clock-based pick. Visit this URL once on the
  //    web or in Safari address bar after a Cmd+R to clean up.
  try {
    const params0 = new URLSearchParams(window.location.search);
    if (params0.get('splashTheme') === 'auto') {
      try { localStorage.removeItem('kamizo_force_splash_theme'); } catch { /* private mode */ }
    }
  } catch { /* private mode */ }

  // 1) URL override — only meaningful in PWA / web preview, but harmless
  //    in native too (Capacitor preserves the launch URL).
  try {
    const params = new URLSearchParams(window.location.search);
    const forced = params.get('splashTheme');
    if (forced === 'light' || forced === 'dark') {
      const info: PickInfo = { source: 'url', forced, theme: forced };
      stashDebug(info as unknown as Record<string, unknown>);
      return info;
    }
  } catch { /* private mode / unusual sandbox */ }

  // 2) localStorage override — set this manually for testing without
  //    waiting for 7 pm. STILL ACTIVE across launches until cleared
  //    (tap the visible strip on the splash, or visit ?splashTheme=auto,
  //    or call localStorage.removeItem('kamizo_force_splash_theme')).
  try {
    const ls = localStorage.getItem('kamizo_force_splash_theme');
    if (ls === 'light' || ls === 'dark') {
      const info: PickInfo = { source: 'localStorage', forced: ls, theme: ls };
      stashDebug({
        ...(info as unknown as Record<string, unknown>),
        clearWith: "localStorage.removeItem('kamizo_force_splash_theme')",
      });
      return info;
    }
  } catch { /* private mode */ }

  // 3) Clock fallback — defensive: Intl.DateTimeFormat with the device's
  //    own resolved timezone. `new Date().getHours()` is SUPPOSED to be
  //    local time but on some sandboxed WebView contexts it can fall
  //    back to UTC. Intl computes the local hour explicitly via the
  //    timezone database, so it's correct regardless.
  let hour: number;
  let tz = 'unknown';
  let intlSucceeded = false;
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false,
    });
    const parsed = parseInt(fmt.format(new Date()), 10);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 23) {
      hour = parsed;
      intlSucceeded = true;
    } else {
      hour = new Date().getHours();
    }
  } catch {
    hour = new Date().getHours();
  }
  const theme: Theme = hour >= 7 && hour < 19 ? 'light' : 'dark';
  const info: PickInfo = {
    source: 'clock',
    hour,
    timezone: tz,
    intlSucceeded,
    rawUTCHour: new Date().getUTCHours(),
    rawLocalHour: new Date().getHours(),
    theme,
  };
  stashDebug({
    ...(info as unknown as Record<string, unknown>),
    rule: '07-18 → light, 19-06 → dark',
  });
  return info;
}

// v118.127 — procedural SVG skyline removed; the redesign uses only the
// real Tashkent photo silhouette (.ks-realsky). buildSkyline /
// .ks-skyline / .ks-bldg / .ks-winbase / .ks-ground / .ks-lite are
// gone from JSX and CSS alike.

function scatterStars(host: HTMLDivElement): void {
  for (let i = 0; i < 16; i++) {
    const s = document.createElement('div');
    s.className = 'ks-star';
    s.style.left = `${8 + Math.random() * 84}%`;
    s.style.top = `${6 + Math.random() * 30}%`;
    const sz = (2 + Math.random() * 2).toFixed(1);
    s.style.width = `${sz}px`;
    s.style.height = `${sz}px`;
    s.style.animationDelay = `${Math.random() * 3.6}s`;
    host.appendChild(s);
  }
}

function buildWordmark(host: HTMLDivElement): void {
  // Render "Kamizo" letter-by-letter with the staggered delays from
  // the redesign (1.05 s + 0.07 s per letter), then an orange brand
  // dot that pops in after the last letter at 1.5 s.
  'Kamizo'.split('').forEach((ch, i) => {
    const s = document.createElement('span');
    s.textContent = ch;
    s.style.animationDelay = `${(1.05 + i * 0.07).toFixed(2)}s`;
    host.appendChild(s);
  });
  const dot = document.createElement('i');
  dot.className = 'ks-wm-dot';
  host.appendChild(dot);
}

// Take over the native StatusBar so themeStore's earlier
// applyNativeStatusBar (dark = brown bg) doesn't bleed through the top
// of the splash. Sets overlay:true (transparent — WebView extends
// under), then style by splash theme (Light style = dark icons, Dark
// style = light icons). On unmount we re-import @capacitor/status-bar
// and re-apply the app's persisted theme so the rest of the app picks
// up its own bar config. No-op on web; PWA browsers ignore these.
async function takeOverStatusBarForSplash(theme: Theme): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
    // Light splash → DARK icons (Style.Light), dark splash → LIGHT
    // icons (Style.Dark). Capacitor's enum name describes the icon
    // tint, not the background.
    await StatusBar.setStyle({
      style: theme === 'light' ? Style.Light : Style.Dark,
    }).catch(() => {});
  } catch { /* plugin not available — give up silently */ }
}

async function restoreAppStatusBar(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { applyTheme } = await import('../stores/themeStore');
    const { useThemeStore } = await import('../stores/themeStore');
    // Re-apply the persisted app theme — this restores style +
    // backgroundColor + overlay state to the app's normal config.
    applyTheme(useThemeStore.getState().theme);
  } catch { /* themeStore unavailable — leave splash bar settings in place */ }
}

// How long the overlay stays visible before fading out. The source
// animation cascade finishes around 2.4 s (ring 0.35 → wordmark 1.5
// → tagline 1.5–2.2 → loader 1.7); we add a small buffer then fade.
const OVERLAY_LIFETIME_MS = 2600;
const FADE_OUT_MS = 400;

export function NativeSplashOverlay() {
  const [pickInfo] = useState<PickInfo>(pickTheme);
  const theme = pickInfo.theme;
  const [fading, setFading] = useState(false);
  const [removed, setRemoved] = useState(false);

  const wordmarkRef = useRef<HTMLDivElement>(null);
  const starfieldRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // v118.15 (Bug 1) — make the native iOS status bar honour the
    // SPLASH theme, not the app's persisted theme. Restored on unmount.
    void takeOverStatusBarForSplash(theme);

    // Procedural decorations: wordmark letters + dot, stars (dark only).
    // The skyline (real photo PNG) renders directly from JSX; no SVG
    // injection step anymore.
    if (wordmarkRef.current) {
      wordmarkRef.current.innerHTML = '';
      buildWordmark(wordmarkRef.current);
    }
    if (starfieldRef.current) {
      starfieldRef.current.innerHTML = '';
      scatterStars(starfieldRef.current);
    }

    // Hide the native iOS / Android splash now that the webview has
    // rendered our overlay. requestAnimationFrame stagger so the
    // overlay paints at least one frame before the native splash
    // starts fading.
    if (Capacitor.isNativePlatform()) {
      requestAnimationFrame(() => {
        SplashScreen.hide({ fadeOutDuration: 100 }).catch(() => {});
      });
    }

    const fadeTimer = window.setTimeout(() => setFading(true), OVERLAY_LIFETIME_MS);
    const removeTimer = window.setTimeout(
      () => setRemoved(true),
      OVERLAY_LIFETIME_MS + FADE_OUT_MS
    );
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(removeTimer);
      // Restore the app's persisted-theme status bar config.
      void restoreAppStatusBar();
    };
  }, [theme]);

  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setPlaying(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (removed) return null;

  // v118.34 — CLEAN REBUILD of theme application. Previous architecture
  // had THREE competing mechanisms layered on top of each other:
  //   (a) CSS-variable approach — `.kamizo-splash--dark { --ks-sky: ... }`
  //       + `.kamizo-splash--dark { background: var(--ks-sky); }`
  //   (b) Per-child theme class selectors — `.kamizo-splash--dark .ks-sun
  //       { display:none }`, `.kamizo-splash--light .ks-starfield
  //       { display:none }`, `.kamizo-splash--dark .ks-realsky { opacity }`,
  //       `.kamizo-splash--dark .ks-kmark-img { filter }`
  //   (c) v118.33 inline-style band-aid for the sky bg
  //
  // Any cascade inconsistency (ancestor html.dark, app-wide theme rules,
  // CSS-variable scope override from any layer) broke approach (a) and
  // approach (b) silently — the visuals fell back to the cream default
  // while pickInfo.theme stayed 'dark', producing the "dark decision,
  // light visuals" bug across v170-v173.
  //
  // The clean architecture below collapses all three into ONE mechanism:
  // a single `tokens` object computed from `theme`, applied via inline
  // CSS variables on the splash root. Child elements still use
  // `var(--ks-*)` and inherit from the root's inline-set variables.
  // INLINE STYLES BEAT EVERY external selector — no cascade conflict
  // is possible. Sun/starfield are now CONDITIONALLY RENDERED instead
  // of class-toggled. Skyline opacity + K-mark filter are inline.
  // No more `.kamizo-splash--${theme}` class on the root (only `.play`
  // for animation gating). All per-child theme class selectors in the
  // .css are deleted alongside this rewrite.
  // v118.127 — token shape simplified after the wordmark-only redesign:
  //   - kmark / kmarkFilter / ringBg / ringBd dropped (no K-icon, no ring)
  //   - bldg / winbase / ground dropped (no procedural SVG buildings)
  //   - brandDot added (the orange dot rendered after "Kamizo")
  //   - realskyWidth / realskyLeft per theme so the silhouette frames
  //     the same landmarks as the design (light: 196%/44%, dark: 345%/5%)
  type ThemeTokens = {
    sky: string;
    glow: string;
    ink: string;
    ink2: string;
    muted: string;
    trackBg: string;
    brandDot: string;
    realskyOpacity: number;
    realskyWidth: string;
    realskyLeft: string;
  };
  const LIGHT_TOKENS: ThemeTokens = {
    sky: 'linear-gradient(172deg, #FFF7EC 0%, #FFE8C7 54%, #FBD49C 100%)',
    glow: 'radial-gradient(120% 52% at 50% 112%, rgba(251,146,60,0.42) 0%, transparent 60%), radial-gradient(55% 40% at 84% 15%, rgba(255,236,178,0.7) 0%, transparent 62%)',
    ink: '#2A2018',
    ink2: 'rgba(42,32,24,0.62)',
    muted: 'rgba(42,32,24,0.45)',
    trackBg: 'rgba(42,32,24,0.12)',
    brandDot: '#EA580C',
    realskyOpacity: 0.92,
    realskyWidth: '196%',
    realskyLeft: '44%',
  };
  const DARK_TOKENS: ThemeTokens = {
    sky: 'linear-gradient(168deg, #4A3B30 0%, #34291F 52%, #241B14 100%)',
    glow: 'radial-gradient(80% 55% at 86% 6%, rgba(251,146,60,0.45) 0%, transparent 55%), radial-gradient(70% 50% at 4% 96%, rgba(217,119,6,0.18) 0%, transparent 60%)',
    ink: '#F4F0E8',
    ink2: 'rgba(244,240,232,0.66)',
    muted: 'rgba(244,240,232,0.5)',
    trackBg: 'rgba(244,240,232,0.14)',
    brandDot: '#FB923C',
    realskyOpacity: 0.7,
    realskyWidth: '345%',
    realskyLeft: '5%',
  };
  const tokens = theme === 'dark' ? DARK_TOKENS : LIGHT_TOKENS;
  const isLight = theme === 'light';

  // className intentionally NO LONGER carries the theme variant.
  // .kamizo-splash for structure, .kamizo-splash--play for animation.
  // No `.kamizo-splash--light` / `--dark` — theme is driven entirely
  // by the inline CSS variables below.
  const cls = ['kamizo-splash', playing ? 'kamizo-splash--play' : '']
    .filter(Boolean)
    .join(' ');

  // CSS variable values are unknown to React's CSSProperties type —
  // build the style object with a small cast at the boundary.
  const rootStyle = {
    background: tokens.sky,
    '--ks-sky': tokens.sky,
    '--ks-glow': tokens.glow,
    '--ks-ink': tokens.ink,
    '--ks-ink2': tokens.ink2,
    '--ks-muted': tokens.muted,
    '--ks-track-bg': tokens.trackBg,
    '--ks-brand-dot': tokens.brandDot,
  } as React.CSSProperties;

  const tree = (
    <div
      ref={rootRef}
      className={cls}
      data-ks-fading={fading ? 'true' : 'false'}
      data-ks-theme={theme}
      style={rootStyle}
      aria-hidden="true"
    >
      <div className="ks-glow" />
      {/* v118.34 — sun (light only) + starfield (dark only) are now
          CONDITIONALLY RENDERED instead of class-toggled. One render
          path, no theme-class selectors competing with conditional CSS. */}
      {isLight && <div className="ks-sun" />}
      {!isLight && <div className="ks-starfield" ref={starfieldRef} />}

      {/* Real Tashkent skyline PNG — width / left offset / opacity all
          inline from tokens so the framing matches the design per theme
          (light: 196% wide centered at 44%, dark: 345% wide anchored at 5%). */}
      <img
        className="ks-realsky"
        src={isLight ? '/screens/skyline-light.png' : '/screens/skyline-dark.png'}
        style={{
          opacity: tokens.realskyOpacity,
          width: tokens.realskyWidth,
          left: tokens.realskyLeft,
        }}
        alt=""
        aria-hidden="true"
        draggable={false}
      />

      {/* v118.127 — center is now wordmark + tagline only. The standalone
          K-mark icon and its ring frame are gone; the wordmark carries the
          brand identity via its trailing orange dot (.ks-wm-dot). */}
      <div className="ks-center">
        <div className="ks-wordmark" ref={wordmarkRef} />
        <div className="ks-tagline">Ваш дом — в телефоне</div>
      </div>

      <div className="ks-loader">
        <div className="ks-track"><i /></div>
        <div className="ks-loadtxt">Загрузка</div>
      </div>

      {/* v118.35 — debug strip + [CLEAR] button removed for store
          submission. The clock + URL + localStorage path in
          pickTheme stays; users with stale localStorage from beta
          testing get auto-purged by the v170 one-time flag. */}
    </div>
  );

  // v118.15 (Bug 2) — portal to document.body so the overlay sits in
  // the SAME stacking context as the BottomBar (which is also
  // createPortal'd to body). z-index 9999 from the CSS then wins
  // against BottomBar's z-index:1000. Mounting inside #root used to
  // lose that stacking war because #root has a `transform` from
  // app-booting → new stacking context → its z-index 9999 only
  // competes with siblings inside #root, not with body-level portals.
  if (typeof document === 'undefined') return tree;
  return createPortal(tree, document.body);
}
