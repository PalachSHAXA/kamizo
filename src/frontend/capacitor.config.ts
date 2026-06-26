import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'uz.kamizo.app',
  appName: 'Kamizo',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#FFFFFF',
    allowMixedContent: false,
    overScrollMode: 'never',
  },
  ios: {
    // Background color shows during the brief window between native
    // splash dismissal and the JS bundle painting the body bg. Match
    // index.css :root --app-bg so the user never sees a flash of
    // pure white before our beige.
    backgroundColor: '#F4F0E8',
    // The default iOS WebView content inset behavior pushes the page
    // down by the status bar height. Our React shell already accounts
    // for safe-area-inset-top via env() in its own padding rules
    // (BottomBar + HomePage hero), so we override iOS's default to
    // "never" — keeps the resident dashboard hero and director
    // dashboard tiles flush to the top edge under the status bar
    // and lets index.css drive the actual top padding through
    // env(safe-area-inset-top). Without this, every layout that
    // padded itself would gain ~44px of double padding on iOS only.
    contentInset: 'never',
    scrollEnabled: true,
  },
  plugins: {
    SplashScreen: {
      // Bug 7 (2026-06-18) — branded native splash. Cream #F4F0E8 bg
      // (matches app-icon flattened bg + index.css --app-bg) with the
      // K mark centered. launchAutoHide:false → JS controls dismissal.
      //
      // v118.13 (2026-06-20) — NativeSplashOverlay (in webview) is the
      // primary splash UX: time-based light/dark theme + animated
      // skyline / wordmark / loader. It calls SplashScreen.hide() in
      // its mount effect, immediately replacing the native splash with
      // its themed overlay. The native splash is now intentionally
      // brief + brand-neutral cream so the seam between native and
      // overlay is invisible regardless of which theme the overlay
      // picks. launchShowDuration lowered from 2000 → 600 ms as a
      // safety FLOOR (only matters if the JS hide call never fires —
      // shouldn't happen, but guarantees no >0.6s native splash). JS
      // hide typically fires <300 ms after webview boots.
      launchShowDuration: 600,
      launchAutoHide: false,
      backgroundColor: '#F4F0E8',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: false,
      useDialog: false,
    },
    // Boot-time floor for the native status bar. applyTheme() in
    // src/stores/themeStore.ts immediately overrides style +
    // backgroundColor based on the persisted user theme as soon as
    // the JS bundle boots. Keep this block matched to LIGHT theme so
    // dark-mode users see at most a single frame of light bar before
    // the override paints. overlaysWebView=false means the webview
    // does NOT extend under the bar — the bar has its own bg, set by
    // backgroundColor (Android) and by Style (iOS, indirectly).
    //
    // Style naming reminder (Capacitor enum is COUNTER-INTUITIVE):
    //   "LIGHT" = DARK icons on light bg  (this block)
    //   "DARK"  = LIGHT icons on dark bg
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#F4F0E8',
      overlaysWebView: false,
    },
    // v118.12 — `native` mode: iOS WKWebView resizes itself when the
    // keyboard appears so the document's 100vh / 100% / 100dvh chain
    // reflects the keyboard-shrunken viewport. Layouts using
    // `flex flex-col h-full` with the composer as the last
    // flex-shrink-0 child (ChatView, ResidentChatView) then put the
    // composer flush above the keyboard with zero JS offset math —
    // single source of truth, no double-shrink stack-up like the
    // previous `resize: 'body'` + visualViewport-offset combo, which
    // wasn't even taking effect because @capacitor/keyboard wasn't
    // installed at all and the JS was layering on top of WKWebView's
    // default layout-viewport shrink. Plugin now installed
    // (@capacitor/keyboard 8.x).
    Keyboard: {
      resize: 'native',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
