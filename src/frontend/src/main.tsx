import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { Keyboard } from '@capacitor/keyboard'
import './index.css'
import App from './App.tsx'

// v118.14 — the early SplashScreen.hide() that used to live here was
// REMOVED. It fired right after JS-bundle parse (before React mounted
// anything), which dismissed the native splash 300 ms BEFORE
// NativeSplashOverlay could paint, leaving an empty/flash gap. The
// overlay (rendered as a top-level child of App.tsx) now owns the
// hide() call inside its own mount effect — native splash stays up
// until the webview overlay has painted, then they cross-fade.
//
// Keyboard.setAccessoryBarVisible(false) still fires here (no-op on
// web/PWA / Android; iOS-only chrome suppression). Doesn't race with
// anything visual — purely a keyboard config call.
if (Capacitor.isNativePlatform()) {
  Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {})
}

function setIOSPwaGap() {
  const gap = Math.max(0, window.screen.height - window.innerHeight);
  const standalone = window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  document.documentElement.style.setProperty(
    '--ios-pwa-gap',
    standalone && gap > 0 ? `${gap}px` : '0px'
  );
}
setIOSPwaGap();
['resize', 'orientationchange', 'pageshow'].forEach(e =>
  window.addEventListener(e, setIOSPwaGap)
);

// Soft entrance for the first paint after the inline splash. React's
// createRoot wipes #root children, so we tag the root with .app-mounted on
// the next frame to trigger the CSS opacity + translateY transition defined
// in index.css. This smooths the seam between the splash and the live UI.
//
// CRITICAL: once the transition is over, drop the `app-booting` class
// entirely. While it was on, #root carried `transform: translateY(0)` AND
// `will-change: opacity, transform` — both of which establish a containing
// block for `position: fixed` descendants (per CSS spec). Modals like
// `.modal-backdrop` (position:fixed; inset:0) then pin to #root instead of
// the viewport, and on tall pages they end up centered in the *document*,
// well below the viewport. Removing the class restores normal fixed
// positioning. The class is a one-shot entrance hook anyway, not a
// permanent state.
const rootEl = document.getElementById('root')!
rootEl.classList.add('app-booting')
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    rootEl.classList.add('app-mounted')
    // The CSS transition is 0.34s; 600ms safely covers it on slow devices
    // and clears the lingering containing-block trigger.
    window.setTimeout(() => {
      rootEl.classList.remove('app-booting', 'app-mounted')
    }, 600)
  })
})
