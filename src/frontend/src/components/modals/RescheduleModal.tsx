import { useState } from 'react';
import { RefreshCw, X, Send } from 'lucide-react';
import { RESCHEDULE_REASON_LABELS } from '../../types';
import type { Request, RescheduleReason } from '../../types';

interface RescheduleModalProps {
  request: Request;
  onClose: () => void;
  onSubmit: (data: { proposedDate: string; proposedTime: string; reason: RescheduleReason; reasonText?: string }) => void;
  language: 'ru' | 'uz';
  /** Controls which reasons are shown and the notification text */
  role?: 'executor' | 'resident';
}

export default function RescheduleModal({
  request,
  onClose,
  onSubmit,
  language,
  role = 'resident',
}: RescheduleModalProps) {
  const defaultReason: RescheduleReason = role === 'executor' ? 'busy_time' : 'not_at_home';
  const [proposedDate, setProposedDate] = useState('');
  const [proposedTime, setProposedTime] = useState('');
  const [reason, setReason] = useState<RescheduleReason>(defaultReason);
  const [reasonText, setReasonText] = useState('');

  const today = new Date().toISOString().split('T')[0];

  // Executor cannot use 'not_at_home' reason
  const reasons = (Object.keys(RESCHEDULE_REASON_LABELS) as RescheduleReason[]).filter(
    (r) => role !== 'executor' || r !== 'not_at_home'
  );

  const notificationTarget =
    role === 'executor'
      ? language === 'ru'
        ? 'Житель получит уведомление.'
        : ''
      : language === 'ru'
        ? 'Исполнитель получит уведомление.'
        : '';

  const infoText =
    language === 'ru'
      ? `Предложите новое время для заявки #${request.number}. ${notificationTarget}`
      : `#${request.number} ariza uchun yangi vaqt taklif qiling.`;

  return (
    <div className="modal-backdrop">
      <div className="glass-card p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto rounded-none sm:rounded-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-amber-600 flex items-center gap-2">
            <RefreshCw className="w-5 h-5" />
            {language === 'ru' ? 'Перенести заявку' : 'Arizani ko\'chirish'}
          </h2>
          <button onClick={onClose} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-white/30 rounded-lg touch-manipulation" aria-label={language === 'ru' ? 'Закрыть' : 'Yopish'}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-4 p-3 bg-primary-50 border border-primary-200 rounded-lg">
          <p className="text-sm text-primary-800">{infoText}</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {language === 'ru' ? 'Причина переноса' : 'Ko\'chirish sababi'}
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3">
              {reasons.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={`px-3 py-2.5 min-h-[44px] text-sm rounded-xl transition-colors text-left touch-manipulation ${
                    reason === r
                      ? 'bg-amber-500 text-white'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  }`}
                >
                  {language === 'ru' ? RESCHEDULE_REASON_LABELS[r].label : RESCHEDULE_REASON_LABELS[r].labelUz}
                </button>
              ))}
            </div>
          </div>

          {reason === 'other' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {language === 'ru' ? 'Уточните причину' : 'Sababni aniqlashtiring'}
              </label>
              <textarea
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                className="input-field min-h-[80px]"
                placeholder={language === 'ru' ? 'Опишите причину...' : 'Sababni yozing...'}
                aria-label={language === 'ru' ? 'Уточните причину' : 'Sababni aniqlashtiring'}
              />
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {language === 'ru' ? 'Новая дата' : 'Yangi sana'}
              </label>
              <input
                type="date"
                min={today}
                value={proposedDate}
                onChange={(e) => setProposedDate(e.target.value)}
                className="input-field"
                aria-label={language === 'ru' ? 'Новая дата' : 'Yangi sana'}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {language === 'ru' ? 'Время' : 'Vaqt'}
              </label>
              <input
                type="time"
                value={proposedTime}
                onChange={(e) => setProposedTime(e.target.value)}
                className="input-field"
                aria-label={language === 'ru' ? 'Время' : 'Vaqt'}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="btn-secondary flex-1 min-h-[44px] touch-manipulation">
              {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
            </button>
            <button
              onClick={() => proposedDate && proposedTime && onSubmit({ proposedDate, proposedTime, reason, reasonText: reason === 'other' ? reasonText : undefined })}
              className="flex-1 min-h-[44px] py-2.5 px-4 rounded-xl font-medium bg-amber-500 text-white hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 touch-manipulation"
              disabled={!proposedDate || !proposedTime || (reason === 'other' && !reasonText.trim())}
            >
              <Send className="w-4 h-4" />
              {language === 'ru' ? 'Отправить' : 'Yuborish'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
