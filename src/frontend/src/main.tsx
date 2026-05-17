import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

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
const rootEl = document.getElementById('root')!
rootEl.classList.add('app-booting')
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
requestAnimationFrame(() => {
  requestAnimationFrame(() => rootEl.classList.add('app-mounted'))
})
