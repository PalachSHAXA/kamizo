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
      launchShowDuration: 1500,
      backgroundColor: '#F97316',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
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
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
