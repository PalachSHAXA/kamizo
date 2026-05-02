import { User, Calendar, CalendarDays, RefreshCw } from 'lucide-react';
import { useLanguageStore } from '../../../stores/languageStore';
import { RESCHEDULE_REASON_LABELS, RESCHEDULE_STATUS_LABELS } from '../../../types';
import { Modal } from '../../../components/ui/Modal';
import type { RescheduleDetailsModalProps } from './types';

// Modal for viewing reschedule request details
export function RescheduleDetailsModal({
  reschedule,
  onClose
}: RescheduleDetailsModalProps) {
  const { language } = useLanguageStore();
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const statusInfo = RESCHEDULE_STATUS_LABELS[reschedule.status];

  return (
    <Modal
      open={true}
      onClose={onClose}
      size="sm"
      title={
        <span className="flex items-center gap-2">
          <RefreshCw className="w-5 h-5 text-amber-600" />
          {language === 'ru' ? 'Запрос на перенос' : 'Ko\'chirish so\'rovi'}
        </span>
      }
    >
      <div className="p-3 sm:p-4 md:p-5 xl:p-6 space-y-4">
        <div>
          <div className="text-sm text-gray-500 mb-1">{language === 'ru' ? 'Заявка' : 'Ariza'}</div>
          <div className="font-mono text-lg">#{reschedule.requestNumber}</div>
        </div>

        <div>
          <div className="text-sm text-gray-500 mb-1">{language === 'ru' ? 'Статус' : 'Holat'}</div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium bg-${statusInfo.color}-100 text-${statusInfo.color}-700`}>
            {statusInfo.label}
          </span>
        </div>

        <div>
          <div className="text-sm text-gray-500 mb-1">{language === 'ru' ? 'Инициатор' : 'Tashabbuskor'}</div>
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-gray-400" />
            <span className="font-medium">{reschedule.initiatorName}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs ${
              reschedule.initiator === 'resident'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-purple-100 text-purple-700'
            }`}>
              {reschedule.initiator === 'resident' ? (language === 'ru' ? 'Житель' : 'Yashovchi') : (language === 'ru' ? 'Исполнитель' : 'Ijrochi')}
            </span>
          </div>
        </div>

        <div>
          <div className="text-sm text-gray-500 mb-1">{language === 'ru' ? 'Получатель' : 'Qabul qiluvchi'}</div>
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-gray-400" />
            <span className="font-medium">{reschedule.recipientName}</span>
          </div>
        </div>

        {reschedule.currentDate && (
          <div>
            <div className="text-sm text-gray-500 mb-1">{language === 'ru' ? 'Текущее время' : 'Hozirgi vaqt'}</div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span>{reschedule.currentDate} {reschedule.currentTime}</span>
            </div>
          </div>
        )}

        <div>
          <div className="text-sm text-gray-500 mb-1">{language === 'ru' ? 'Предложенное время' : 'Taklif qilingan vaqt'}</div>
          <div className="flex items-center gap-2 text-amber-700 font-medium">
            <CalendarDays className="w-4 h-4" />
            <span>{reschedule.proposedDate} {language === 'ru' ? 'в' : 'da'} {reschedule.proposedTime}</span>
          </div>
        </div>

        <div>
          <div className="text-sm text-gray-500 mb-1">{language === 'ru' ? 'Причина' : 'Sabab'}</div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="font-medium">{RESCHEDULE_REASON_LABELS[reschedule.reason].label}</div>
            {reschedule.reasonText && (
              <div className="text-sm text-gray-600 mt-1">{reschedule.reasonText}</div>
            )}
          </div>
        </div>

        {reschedule.responseNote && (
          <div>
            <div className="text-sm text-gray-500 mb-1">{language === 'ru' ? 'Комментарий при ответе' : 'Javob izohi'}</div>
            <div className="p-3 bg-gray-50 rounded-lg text-sm">
              {reschedule.responseNote}
            </div>
          </div>
        )}

        <div className="text-xs text-gray-400 pt-2 border-t">
          <div>{language === 'ru' ? 'Создан' : 'Yaratilgan'}: {formatDate(reschedule.createdAt)}</div>
          {reschedule.respondedAt && (
            <div>{language === 'ru' ? 'Ответ' : 'Javob'}: {formatDate(reschedule.respondedAt)}</div>
          )}
          <div>{language === 'ru' ? 'Истекает' : 'Muddati tugaydi'}: {formatDate(reschedule.expiresAt)}</div>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-2 tap-target py-2.5 px-4 rounded-lg sm:rounded-xl font-medium bg-gray-100 hover:bg-gray-200 transition-colors touch-manipulation active:scale-[0.98]"
        >
          {language === 'ru' ? 'Закрыть' : 'Yopish'}
        </button>
      </div>
    </Modal>
  );
}
