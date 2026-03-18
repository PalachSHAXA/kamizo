import { CalendarDays, ChevronRight, Check, X } from 'lucide-react';
import { useLanguageStore } from '../../../stores/languageStore';
import { RESCHEDULE_REASON_LABELS, RESCHEDULE_STATUS_LABELS } from '../../../types';
import type { RescheduleRequestCardProps, RescheduleHistoryCardProps } from './types';

// Reschedule Request Card - shows pending reschedule request
export function RescheduleRequestCard({
  reschedule,
  onClick
}: RescheduleRequestCardProps) {
  const { language } = useLanguageStore();
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <button
      onClick={onClick}
      className="w-full p-3 min-h-[44px] bg-white/60 rounded-lg sm:rounded-xl text-left hover:bg-white/80 active:bg-white transition-colors touch-manipulation"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-mono text-gray-500">#{reschedule.requestNumber}</span>
            <span className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-xs font-medium ${
              reschedule.initiator === 'resident'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-purple-100 text-purple-700'
            }`}>
              {reschedule.initiator === 'resident' ? (language === 'ru' ? 'От жителя' : 'Yashovchidan') : (language === 'ru' ? 'От исполнителя' : 'Ijrochidan')}
            </span>
          </div>

          <div className="text-sm text-gray-600 mb-2">
            <span className="font-medium text-gray-800">{reschedule.initiatorName}</span>
            {' \u2192 '}
            <span className="font-medium text-gray-800">{reschedule.recipientName}</span>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <CalendarDays className="w-4 h-4 text-amber-600" />
            <span className="font-medium text-amber-700">
              {reschedule.proposedDate} {language === 'ru' ? 'в' : 'da'} {reschedule.proposedTime}
            </span>
          </div>

          <div className="text-xs text-gray-500 mt-2">
            {language === 'ru' ? 'Причина' : 'Sabab'}: {RESCHEDULE_REASON_LABELS[reschedule.reason].label}
            {reschedule.reasonText && ` - ${reschedule.reasonText}`}
          </div>

          <div className="text-xs text-gray-400 mt-1">
            {language === 'ru' ? 'Создан' : 'Yaratilgan'}: {formatDate(reschedule.createdAt)}
          </div>
        </div>

        <ChevronRight className="w-5 h-5 text-amber-500 flex-shrink-0" />
      </div>
    </button>
  );
}

// Reschedule History Card - shows reschedule history (accepted/rejected)
export function RescheduleHistoryCard({
  reschedule
}: RescheduleHistoryCardProps) {
  const { language } = useLanguageStore();
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const statusInfo = RESCHEDULE_STATUS_LABELS[reschedule.status];

  return (
    <div className="p-3 bg-white/40 rounded-xl border border-gray-100">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-mono text-gray-500">#{reschedule.requestNumber}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium bg-${statusInfo.color}-100 text-${statusInfo.color}-700`}>
              {statusInfo.label}
            </span>
            <span className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-xs font-medium ${
              reschedule.initiator === 'resident'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-purple-100 text-purple-700'
            }`}>
              {reschedule.initiator === 'resident' ? (language === 'ru' ? 'От жителя' : 'Yashovchidan') : (language === 'ru' ? 'От исполнителя' : 'Ijrochidan')}
            </span>
          </div>

          <div className="text-sm text-gray-600 mb-1">
            <span className="font-medium">{reschedule.initiatorName}</span>
            {' \u2192 '}
            <span className="font-medium">{reschedule.recipientName}</span>
          </div>

          {reschedule.status === 'accepted' && (
            <div className="flex items-center gap-2 text-sm text-green-700 mb-1">
              <Check className="w-4 h-4" />
              <span>{language === 'ru' ? 'Перенесено на' : 'Ko\'chirilgan'} {reschedule.proposedDate} {language === 'ru' ? 'в' : 'da'} {reschedule.proposedTime}</span>
            </div>
          )}

          {reschedule.status === 'rejected' && (
            <div className="text-sm text-red-700 mb-1">
              <X className="w-4 h-4 inline mr-1" />
              {language === 'ru' ? 'Отклонено' : 'Rad etilgan'}
              {reschedule.responseNote && `: ${reschedule.responseNote}`}
            </div>
          )}

          {reschedule.respondedAt && (
            <div className="text-xs text-gray-400">
              {language === 'ru' ? 'Ответ' : 'Javob'}: {formatDate(reschedule.respondedAt)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
