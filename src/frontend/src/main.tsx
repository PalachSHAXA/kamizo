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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
