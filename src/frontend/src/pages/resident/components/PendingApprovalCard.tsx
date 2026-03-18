import { CheckCircle, User, Clock } from 'lucide-react';
import { useLanguageStore } from '../../../stores/languageStore';
import type { PendingApprovalCardProps } from './types';

export function PendingApprovalCard({ request, onApprove }: PendingApprovalCardProps) {
  const { language } = useLanguageStore();
  const formatDuration = (seconds?: number) => {
    if (!seconds) return language === 'ru' ? 'Не указано' : 'Ko\'rsatilmagan';
    const mins = Math.floor(seconds / 60);
    return `${mins} ${language === 'ru' ? 'мин' : 'daq'}`;
  };

  return (
    <div className="glass-card p-4 md:p-5 border-2 border-purple-300 bg-purple-50/30">
      {/* Header with icon */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 md:w-12 md:h-12 bg-purple-500 rounded-xl flex items-center justify-center flex-shrink-0">
          <CheckCircle className="w-5 h-5 md:w-6 md:h-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">#{request.number}</span>
          </div>
          <h3 className="font-semibold text-base md:text-lg truncate">{request.title}</h3>
        </div>
      </div>

      {/* Description */}
      <p className="text-gray-600 text-sm line-clamp-2 mb-3">{request.description}</p>

      {/* Info cards - stacked on mobile */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mb-4">
        <div className="bg-white/60 rounded-lg p-3 md:p-4">
          <div className="text-xs text-gray-500 mb-0.5">{language === 'ru' ? 'Исполнитель' : 'Ijrochi'}</div>
          <div className="font-medium text-sm flex items-center gap-1">
            <User className="w-3.5 h-3.5 text-gray-400" />
            <span className="truncate">{request.executorName}</span>
          </div>
        </div>
        <div className="bg-white/60 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-0.5">{language === 'ru' ? 'Время работы' : 'Ish vaqti'}</div>
          <div className="font-medium text-sm flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-gray-400" />
            {formatDuration(request.workDuration)}
          </div>
        </div>
      </div>

      {/* Large touch-friendly button */}
      <button
        onClick={onApprove}
        className="w-full py-4 px-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform touch-manipulation shadow-lg"
        style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }}
      >
        <CheckCircle className="w-5 h-5" />
        {language === 'ru' ? 'Подтвердить выполнение' : 'Bajarilganini tasdiqlash'}
      </button>
    </div>
  );
}
