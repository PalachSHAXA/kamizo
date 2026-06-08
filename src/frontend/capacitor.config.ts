import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Reverse-DNS bundle id used by App Store Connect / Google Play Console.
  // Confirm with user before first store submission — changing this later
  // forces a new app entry / new analytics history.
  appId: 'uz.kamizo.app',
  appName: 'Kamizo',
  // Vite output. Built by `npm run build` in this directory, then synced
  // into native projects by `npx cap sync`.
  webDir: 'dist',
  server: {
    // Android served from https:// scheme avoids mixed-content issues
    // when the bundled webview calls api.kamizo.uz over TLS.
    androidScheme: 'https',
    // App loads BUNDLED assets (no `url:` field). That's deliberate:
    // pointing at a remote URL would (a) reject under Apple Guideline 4.2
    // as a "transformed website" and (b) break offline boot. The webview
    // still needs explicit permission to navigate to the API host since
    // Capacitor restricts cross-origin navigation by default.
    allowNavigation: ['api.kamizo.uz', '*.kamizo.uz'],
  },
  ios: {
    // Lets the safe-area utilities (`env(safe-area-inset-*)`) and our
    // existing BottomBar two-layer trick work the same as in the PWA.
    contentInset: 'always',
    backgroundColor: '#FFFFFF',
    // We need to call api.kamizo.uz which is a different domain than the
    // bundled webview origin (capacitor://localhost). Without this flag
    // WKWebView blocks the navigation under App-Bound Domains.
    limitsNavigationsToAppBoundDomains: false,
    scrollEnabled: true,
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
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#FFFFFF',
      overlaysWebView: false,
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
