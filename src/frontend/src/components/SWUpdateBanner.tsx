import { useState, useEffect } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useLanguageStore } from '../stores/languageStore';
import { useOverlayStore, useCanShowOverlay } from '../stores/overlayStore';

export function SWUpdateBanner() {
  const [requested, setRequested] = useState(false);
  const [closed, setClosed] = useState(false);
  const { language } = useLanguageStore();
  const requestOverlay = useOverlayStore(s => s.requestOverlay);
  const releaseOverlay = useOverlayStore(s => s.releaseOverlay);
  const canShow = useCanShowOverlay('sw_update');

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'SW_UPDATED') {
        // sw_update has the highest priority — if the tour or push prompt is
        // showing, the store preempts them and queues them behind us.
        requestOverlay('sw_update');
        setRequested(true);
      }
    };
    navigator.serviceWorker?.addEventListener('message', handler);
    return () => navigator.serviceWorker?.removeEventListener('message', handler);
  }, [requestOverlay]);

  useEffect(() => {
    return () => {
      if (requested) releaseOverlay('sw_update');
    };
  }, [requested, releaseOverlay]);

  const showBanner = requested && canShow && !closed;
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
          onClick={() => { releaseOverlay('sw_update'); setClosed(true); }}
          className="shrink-0 rounded-lg p-1 text-gray-400 hover:bg-gray-800 hover:text-gray-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
