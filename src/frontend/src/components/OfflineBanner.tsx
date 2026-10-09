import { useState } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { useOnline } from '../hooks/useOnline';

/**
 * Thin banner pinned at the top of the viewport (above safe-area notch)
 * when navigator reports offline. Rendered globally from App.tsx. When
 * network returns the banner auto-dismisses on the next 'online' event.
 *
 * Design intent: don't hide the underlying content (residents can still
 * see cached data) — just make it unmistakably clear the problem is on
 * their side, not the app. "Повторить" forces a soft reload of the current
 * page in case navigator.onLine is a lagging signal.
 */
export function OfflineBanner() {
  const online = useOnline();
  const [dismissed, setDismissed] = useState(false);

  if (online || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-0 right-0 top-0 z-[10300] pointer-events-auto"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="mx-3 mt-2 mb-0 rounded-2xl shadow-lg flex items-center gap-3 px-4 py-3" style={{ background: '#FEF3C7', border: '1px solid #FCD34D' }}>
        <div className="w-8 h-8 rounded-full grid place-items-center shrink-0" style={{ background: '#F59E0B', color: '#fff' }}>
          <WifiOff className="w-4 h-4" strokeWidth={2.4} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold" style={{ color: '#78350F' }}>Нет интернета</div>
          <div className="text-xs" style={{ color: '#92400E' }}>Проверьте Wi-Fi или мобильные данные</div>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="shrink-0 flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full active:scale-95"
          style={{ background: '#FBBF24', color: '#78350F' }}
        >
          <RefreshCw className="w-3 h-3" strokeWidth={2.5} />
          Повторить
        </button>
      </div>
    </div>
  );
}
