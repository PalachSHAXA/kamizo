import {
  Check, Pause, PlayCircle
} from 'lucide-react';
import { formatAddress } from '../../../utils/formatAddress';
import type { Request } from '../../../types';

interface ActiveWorkTimerProps {
  inProgressRequests: Request[];
  activeTimers: Record<string, number>;
  onPauseWork: (id: string) => void;
  onResumeWork: (id: string) => void;
  onComplete: (id: string) => void;
  formatTime: (seconds: number) => string;
  language: 'ru' | 'uz';
}

export function ActiveWorkTimer({
  inProgressRequests,
  activeTimers,
  onPauseWork,
  onResumeWork,
  onComplete,
  formatTime,
  language,
}: ActiveWorkTimerProps) {
  if (inProgressRequests.length === 0) return null;

  return (
    <div className={`glass-card p-4 md:p-6 xl:p-8 border-2 ${inProgressRequests[0]?.isPaused ? 'border-gray-400 bg-gray-50/50' : 'border-amber-400 bg-amber-50/50'}`}>
      <div className="flex items-center gap-2 mb-3 md:mb-4">
        <div className={`w-3 h-3 rounded-full ${inProgressRequests[0]?.isPaused ? 'bg-gray-500' : 'bg-amber-500 animate-pulse'}`} />
        <span className={`font-medium ${inProgressRequests[0]?.isPaused ? 'text-gray-700' : 'text-amber-700'}`}>
          {inProgressRequests[0]?.isPaused
            ? (language === 'ru' ? '\u0420\u0430\u0431\u043e\u0442\u0430 \u043f\u0440\u0438\u043e\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d\u0430' : 'Ish to\'xtatildi')
            : (language === 'ru' ? '\u0410\u043a\u0442\u0438\u0432\u043d\u0430\u044f \u0440\u0430\u0431\u043e\u0442\u0430' : 'Faol ish')}
        </span>
      </div>
      {inProgressRequests.map(req => (
        <div key={req.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-base md:text-lg truncate">#{req.number} - {req.title}</div>
            <div className="text-sm md:text-base text-gray-600 truncate">{formatAddress(req.address, req.apartment)}</div>
          </div>
          <div className="flex items-center justify-between md:justify-end gap-3 md:gap-4">
            <div className="text-center">
              <div className={`text-3xl md:text-4xl font-mono font-bold ${req.isPaused ? 'text-gray-500' : 'text-amber-600'}`}>
                {formatTime(activeTimers[req.id] || 0)}
              </div>
              <div className="text-xs md:text-sm text-gray-500">
                {req.isPaused
                  ? (language === 'ru' ? '\u041f\u0430\u0443\u0437\u0430' : 'Pauza')
                  : (language === 'ru' ? '\u0412\u0440\u0435\u043c\u044f \u0440\u0430\u0431\u043e\u0442\u044b' : 'Ish vaqti')}
              </div>
            </div>
            <div className="flex gap-2">
              {req.isPaused ? (
                <button
                  onClick={() => onResumeWork(req.id)}
                  className="min-h-[44px] py-3 px-4 md:px-5 rounded-xl font-semibold text-white flex items-center gap-2 active:scale-95 transition-transform touch-manipulation"
                  style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}
                >
                  <PlayCircle className="w-5 h-5" />
                  <span className="hidden md:inline">{language === 'ru' ? '\u041f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c' : 'Davom etish'}</span>
                </button>
              ) : (
                <button
                  onClick={() => onPauseWork(req.id)}
                  className="min-h-[44px] py-3 px-4 md:px-5 rounded-xl font-semibold text-gray-700 bg-white border-2 border-gray-300 flex items-center gap-2 active:scale-95 transition-transform touch-manipulation"
                >
                  <Pause className="w-5 h-5" />
                  <span className="hidden md:inline">{language === 'ru' ? '\u041f\u0430\u0443\u0437\u0430' : 'Pauza'}</span>
                </button>
              )}
              <button
                onClick={() => onComplete(req.id)}
                className="min-h-[44px] py-3 px-4 md:px-5 rounded-xl font-semibold text-white flex items-center gap-2 active:scale-95 transition-transform touch-manipulation"
                style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
              >
                <Check className="w-5 h-5" />
                <span className="hidden md:inline">{language === 'ru' ? '\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044c' : 'Tugatish'}</span>
                <span className="md:hidden">{language === 'ru' ? '\u0413\u043e\u0442\u043e\u0432\u043e' : 'Tayyor'}</span>
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
