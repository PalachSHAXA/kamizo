import { useState, useEffect } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useLanguageStore } from '../stores/languageStore';
import { useOverlayStore, useCanShowOverlay } from '../stores/overlayStore';

// Per-version dismiss key. Value = the SW version string the user closed
// the banner for. New SW_VERSION → key doesn't match → banner shows once.
// Only one key ever exists (new versions overwrite it), so no cleanup
// pass is needed. Safari private mode: try/catch treats storage as
// unavailable and skips the check (banner still shows, no harm).
const DISMISSED_VERSION_KEY = 'kamizo_sw_dismissed_v';
const readDismissedVersion = (): string | null => {
  try { return localStorage.getItem(DISMISSED_VERSION_KEY); } catch { return null; }
};
const writeDismissedVersion = (v: string): void => {
  try { localStorage.setItem(DISMISSED_VERSION_KEY, v); } catch { /* private mode */ }
};

export function SWUpdateBanner() {
  // Capacitor native (iOS / Android) ships bundled dist/ assets — no
  // sw.js served over HTTP, no meaningful "new version" concept until
  // the user re-installs from the store. Banner is dead code there.
  // Computed BEFORE hooks so the value is stable across renders, and
  // consumed inside the effect + render-time null return AFTER all
  // hooks have unconditionally run (rules-of-hooks compliance).
  const isNative = Capacitor.isNativePlatform();

  const [requested, setRequested] = useState(false);
  const [closed, setClosed] = useState(false);
  // Version string from the incoming SW_UPDATED message. Needed so the
  // × handler can persist the RIGHT version to the dismiss key (not the
  // last-received one, in case multiple messages arrived in quick
  // succession while the user was reading the banner).
  const [pendingVersion, setPendingVersion] = useState<string | null>(null);
  const { language } = useLanguageStore();
  const requestOverlay = useOverlayStore(s => s.requestOverlay);
  const releaseOverlay = useOverlayStore(s => s.releaseOverlay);
  const canShow = useCanShowOverlay('sw_update');

  useEffect(() => {
    // Skip listener attach on native — no HTTP-served sw.js there.
    if (isNative) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type !== 'SW_UPDATED') return;
      const incomingVersion: string | undefined = event.data.version;
      // Per-version dedup: if the user already dismissed the banner for
      // this exact version on this device, skip. New version → dismissed
      // key won't match → banner shows once.
      if (incomingVersion && readDismissedVersion() === incomingVersion) return;
      setPendingVersion(incomingVersion ?? null);
      // sw_update has the highest priority — if the tour or push prompt is
      // showing, the store preempts them and queues them behind us.
      requestOverlay('sw_update');
      setRequested(true);
    };
    navigator.serviceWorker?.addEventListener('message', handler);
    return () => navigator.serviceWorker?.removeEventListener('message', handler);
  }, [requestOverlay, isNative]);

  useEffect(() => {
    return () => {
      if (requested) releaseOverlay('sw_update');
    };
  }, [requested, releaseOverlay]);

  // isNative folded in here so the render-time null return covers the
  // native case AFTER all hooks have run above — no rules-of-hooks issue.
  const showBanner = !isNative && requested && canShow && !closed;
  if (!showBanner) return null;

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="fixed top-4 left-4 right-4 z-[150] animate-slide-up sm:left-auto sm:right-4 sm:w-80">
      <div className="flex items-center gap-3 rounded-xl bg-gray-900 p-3 shadow-2xl">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-500/20">
          <RefreshCw className="h-5 w-5 text-primary-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white">
            {language === 'uz' ? 'Yangi versiya mavjud' : 'Доступна новая версия'}
          </p>
          <button
            onClick={handleRefresh}
            className="text-xs font-medium text-primary-400 hover:text-primary-300"
          >
            {language === 'uz' ? 'Yangilash' : 'Обновить'}
          </button>
        </div>
        <button
          onClick={() => {
            // Persist dismissal per-version so this exact SW build won't
            // re-pop the banner on the next mount / remount / message.
            if (pendingVersion) writeDismissedVersion(pendingVersion);
            releaseOverlay('sw_update');
            setClosed(true);
          }}
          className="shrink-0 rounded-lg p-1 text-gray-400 hover:bg-gray-800 hover:text-gray-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
