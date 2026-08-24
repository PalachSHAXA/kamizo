import { HardHat, Loader2 } from 'lucide-react';
import { SPECIALIZATION_LABELS } from '../../../types';
import type { ExecutorSpecialization } from '../../../types';

interface ExecutorHeaderProps {
  userName?: string;
  specialization?: string;
  executorStatus?: string;
  language: 'ru' | 'uz';
  onToggleShift?: () => void;
  shiftUpdating?: boolean;
}

export function ExecutorHeader({
  userName,
  specialization,
  executorStatus,
  language,
  onToggleShift,
  shiftUpdating = false,
}: ExecutorHeaderProps) {
  const onShift = executorStatus !== 'offline';
  const busy = executorStatus === 'busy';
  const t = (ru: string, uz: string) => (language === 'ru' ? ru : uz);
  const label = !onShift
    ? t('\u041d\u0435 \u043d\u0430 \u0441\u043c\u0435\u043d\u0435', 'Smenada emas')
    : busy ? t('\u0417\u0430\u043d\u044f\u0442', 'Band') : t('\u041d\u0430 \u0441\u043c\u0435\u043d\u0435', 'Smenada');

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#E8621A] to-[#F59E0B] flex items-center justify-center shadow-sm shrink-0">
          <HardHat className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 truncate">
            {userName?.split(' ')[0]}
          </h1>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {SPECIALIZATION_LABELS[specialization as ExecutorSpecialization] || t('\u0418\u0441\u043f\u043e\u043b\u043d\u0438\u0442\u0435\u043b\u044c', 'Ijrochi')}
          </p>
        </div>
      </div>
      <div className="flex-shrink-0">
        {/* Tap to go on/off shift. Off shift = won't receive/take new requests. */}
        <button
          type="button"
          onClick={onToggleShift}
          disabled={!onToggleShift || shiftUpdating}
          aria-pressed={onShift}
          title={onShift ? t('\u041d\u0430\u0436\u043c\u0438\u0442\u0435, \u0447\u0442\u043e\u0431\u044b \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044c \u0441\u043c\u0435\u043d\u0443', 'Smenani tugatish') : t('\u041d\u0430\u0436\u043c\u0438\u0442\u0435, \u0447\u0442\u043e\u0431\u044b \u0432\u044b\u0439\u0442\u0438 \u043d\u0430 \u0441\u043c\u0435\u043d\u0443', 'Smenaga chiqish')}
          className={`min-h-[40px] px-3 py-2 rounded-xl text-sm font-semibold flex items-center gap-1.5 transition-colors touch-manipulation active:scale-95 disabled:opacity-60 ${
            onShift
              ? (busy ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-green-100 text-green-700 hover:bg-green-200')
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {shiftUpdating ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <span className={`w-2 h-2 rounded-full ${onShift ? (busy ? 'bg-amber-500 animate-pulse' : 'bg-green-500') : 'bg-gray-400'}`} />
          )}
          {label}
        </button>
      </div>
    </div>
  );
}
