import { RefreshCw, ChevronRight } from 'lucide-react';
import type { RescheduleRequest } from '../../../types';

interface RescheduleAlertProps {
  pendingReschedules: RescheduleRequest[];
  onRespond: (reschedule: RescheduleRequest) => void;
  language: 'ru' | 'uz';
}

export function RescheduleAlert({
  pendingReschedules,
  onRespond,
  language,
}: RescheduleAlertProps) {
  if (pendingReschedules.length === 0) return null;

  return (
    <div className="glass-card p-4 border-2 border-amber-400 bg-amber-50/50 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-amber-500 rounded-full flex items-center justify-center flex-shrink-0">
          <RefreshCw className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-amber-800">
            {language === 'ru' ? '\u0417\u0430\u043f\u0440\u043e\u0441 \u043d\u0430 \u043f\u0435\u0440\u0435\u043d\u043e\u0441 \u0432\u0440\u0435\u043c\u0435\u043d\u0438' : 'Vaqtni o\'zgartirish so\'rovi'}
          </div>
          <div className="text-sm text-amber-600">
            {language === 'ru' ? '\u0416\u0438\u0442\u0435\u043b\u044c \u043f\u0440\u0435\u0434\u043b\u0430\u0433\u0430\u0435\u0442 \u043f\u0435\u0440\u0435\u043d\u0435\u0441\u0442\u0438 \u0437\u0430\u044f\u0432\u043a\u0443' : 'Yashovchi arizani ko\'chirishni taklif qiladi'}
          </div>
        </div>
      </div>
      {pendingReschedules.map((reschedule) => (
        <button
          key={reschedule.id}
          onClick={() => onRespond(reschedule)}
          className="w-full p-3 min-h-[44px] bg-white/60 rounded-xl text-left flex items-center justify-between active:bg-white/80 transition-colors touch-manipulation"
        >
          <div>
            <div className="font-medium text-gray-800">
              {language === 'ru' ? '\u0417\u0430\u044f\u0432\u043a\u0430' : 'Ariza'} #{reschedule.requestNumber}
            </div>
            <div className="text-sm text-gray-600">
              {language === 'ru' ? '\u041f\u0440\u0435\u0434\u043b\u043e\u0436\u0435\u043d\u043e:' : 'Taklif:'} {reschedule.proposedDate} {reschedule.proposedTime}
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-amber-500" />
        </button>
      ))}
    </div>
  );
}
