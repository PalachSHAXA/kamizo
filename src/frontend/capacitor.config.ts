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
