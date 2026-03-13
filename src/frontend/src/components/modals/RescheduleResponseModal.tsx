import { useState } from 'react';
import { RefreshCw, X, CheckCircle } from 'lucide-react';
import { RESCHEDULE_REASON_LABELS } from '../../types';
import type { RescheduleRequest } from '../../types';

interface RescheduleResponseModalProps {
  reschedule: RescheduleRequest;
  onClose: () => void;
  onAccept: () => void;
  onReject: (note?: string) => void;
  language: 'ru' | 'uz';
}

export default function RescheduleResponseModal({
  reschedule,
  onClose,
  onAccept,
  onReject,
  language,
}: RescheduleResponseModalProps) {
  const [rejectNote, setRejectNote] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);

  return (
    <div className="modal-backdrop">
      <div className="glass-card p-6 w-full max-w-md mx-4 rounded-none sm:rounded-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-amber-600 flex items-center gap-2">
            <RefreshCw className="w-5 h-5" />
            {language === 'ru' ? 'Запрос на перенос' : 'Ko\'chirish so\'rovi'}
          </h2>
          <button onClick={onClose} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-white/30 rounded-lg touch-manipulation">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="text-sm text-gray-600 mb-1">
              {language === 'ru' ? 'Заявка' : 'Ariza'} #{reschedule.requestNumber}
            </div>
            <div className="font-medium text-gray-800">
              {reschedule.initiatorName} {language === 'ru' ? 'предлагает перенести на:' : 'taklif qiladi:'}
            </div>
            <div className="text-xl font-bold text-amber-600 mt-2">
              {reschedule.proposedDate} {language === 'ru' ? 'в' : 'soat'} {reschedule.proposedTime}
            </div>
            <div className="text-sm text-gray-600 mt-2">
              <strong>{language === 'ru' ? 'Причина:' : 'Sabab:'}</strong>{' '}
              {language === 'ru'
                ? RESCHEDULE_REASON_LABELS[reschedule.reason].label
                : RESCHEDULE_REASON_LABELS[reschedule.reason].labelUz}
              {reschedule.reasonText && ` - ${reschedule.reasonText}`}
            </div>
          </div>

          {reschedule.currentDate && (
            <div className="text-sm text-gray-600 text-center">
              {language === 'ru' ? 'Текущее время:' : 'Hozirgi vaqt:'} {reschedule.currentDate} {reschedule.currentTime}
            </div>
          )}

          {showRejectForm ? (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                {language === 'ru' ? 'Причина отказа (необязательно)' : 'Rad etish sababi (ixtiyoriy)'}
              </label>
              <textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                className="input-field min-h-[80px]"
                placeholder={language === 'ru' ? 'Укажите причину...' : 'Sababni yozing...'}
              />
              <div className="flex gap-3">
                <button onClick={() => setShowRejectForm(false)} className="btn-secondary flex-1 min-h-[44px] touch-manipulation">
                  {language === 'ru' ? 'Назад' : 'Orqaga'}
                </button>
                <button
                  onClick={() => onReject(rejectNote || undefined)}
                  className="flex-1 min-h-[44px] py-2.5 px-4 rounded-xl font-medium bg-red-500 text-white hover:bg-red-600 transition-colors touch-manipulation"
                >
                  {language === 'ru' ? 'Отклонить' : 'Rad etish'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={() => setShowRejectForm(true)}
                className="flex-1 min-h-[44px] py-3 px-4 rounded-xl font-medium bg-red-100 text-red-600 hover:bg-red-200 transition-colors touch-manipulation"
              >
                {language === 'ru' ? 'Отклонить' : 'Rad etish'}
              </button>
              <button
                onClick={onAccept}
                className="flex-1 min-h-[44px] py-3 px-4 rounded-xl font-medium bg-green-500 text-white hover:bg-green-600 transition-colors flex items-center justify-center gap-2 touch-manipulation"
              >
                <CheckCircle className="w-4 h-4" />
                {language === 'ru' ? 'Принять' : 'Qabul qilish'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
