import { useState } from 'react';
import { X, Star, CheckCircle, User, Clock, ChevronDown } from 'lucide-react';
import { useLanguageStore } from '../../../stores/languageStore';
import type { ApproveModalProps } from './types';

export function ApproveModal({ request, onClose, onApprove, onReject }: ApproveModalProps) {
  const [rating, setRating] = useState(5);
  const [feedback, setFeedback] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRatingSection, setShowRatingSection] = useState(false);
  const { language } = useLanguageStore();

  const formatDuration = (seconds?: number) => {
    if (!seconds) return language === 'ru' ? 'Не указано' : 'Ko\'rsatilmagan';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) return `${hrs} ${language === 'ru' ? 'ч' : 'soat'} ${mins} ${language === 'ru' ? 'мин' : 'daq'}`;
    return `${mins} ${language === 'ru' ? 'мин' : 'daq'}`;
  };

  if (showReject) {
    return (
      <div className="fixed inset-0 bg-black/50 z-[200] flex items-end md:items-center md:justify-center">
        <div className="w-full md:max-w-md md:mx-4 bg-white rounded-t-[20px] md:rounded-[20px] flex flex-col overflow-hidden max-h-[92dvh] md:max-h-[90dvh]">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="text-[18px] font-bold text-red-600">{language === 'ru' ? 'Отклонить работу' : 'Ishni rad etish'}</h2>
            <button
              onClick={onClose}
              className="w-[36px] h-[36px] bg-gray-100 rounded-full flex items-center justify-center active:bg-gray-200 transition-colors touch-manipulation"
            >
              <X className="w-[18px] h-[18px] text-gray-500" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 pb-4">
            <p className="text-[13px] text-gray-500 mb-3">
              {language === 'ru'
                ? 'Укажите причину, почему работа не выполнена качественно. Исполнитель получит уведомление.'
                : 'Ish sifatsiz bajarilganligining sababini ko\'rsating. Ijrochi xabar oladi.'}
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full px-4 py-3 rounded-[14px] border border-gray-200 bg-gray-50 focus:bg-white focus:border-red-300 min-h-[150px] text-[14px] resize-none outline-none transition-colors"
              placeholder={language === 'ru' ? 'Опишите, что не так...' : 'Nima noto\'g\'ri ekanligini yozing...'}
              required
            />
          </div>
          <div className="px-5 pt-3 pb-5 border-t border-gray-100 bg-white" style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
            <div className="flex gap-2.5">
              <button
                onClick={() => setShowReject(false)}
                className="flex-1 py-3.5 min-h-[48px] rounded-[14px] font-semibold text-[14px] bg-gray-100 active:bg-gray-200 transition-colors touch-manipulation"
              >
                {language === 'ru' ? 'Назад' : 'Orqaga'}
              </button>
              <button
                onClick={() => rejectReason.trim() && onReject(rejectReason)}
                className="flex-1 py-3.5 min-h-[48px] rounded-[14px] font-semibold text-[14px] text-white bg-red-500 active:bg-red-600 disabled:opacity-50 transition-colors touch-manipulation"
                disabled={!rejectReason.trim()}
              >
                {language === 'ru' ? 'Отклонить' : 'Rad etish'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[200] flex items-end md:items-center md:justify-center">
      <div className="w-full md:max-w-md md:mx-4 bg-white rounded-t-[20px] md:rounded-[20px] flex flex-col overflow-hidden max-h-[92dvh] md:max-h-[90dvh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-[18px] font-bold text-gray-900">{language === 'ru' ? 'Принять работу' : 'Ishni qabul qilish'}</h2>
          <button
            onClick={onClose}
            className="w-[36px] h-[36px] bg-gray-100 rounded-full flex items-center justify-center active:bg-gray-200 transition-colors touch-manipulation"
          >
            <X className="w-[18px] h-[18px] text-gray-500" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-4">
          {/* Request Info */}
          <div className="bg-gray-50 rounded-[14px] p-4">
            <div className="text-[11px] text-gray-400 font-medium">{language === 'ru' ? 'Заявка' : 'Ariza'} #{request.number}</div>
            <div className="font-bold text-[15px] text-gray-900 mt-0.5">{request.title}</div>
            <div className="flex flex-wrap gap-2 mt-2.5">
              <span className="flex items-center gap-1.5 text-[12px] text-gray-600 bg-white px-2.5 py-1.5 rounded-[10px]">
                <User className="w-3.5 h-3.5 text-gray-400" />
                {request.executorName}
              </span>
              <span className="flex items-center gap-1.5 text-[12px] text-gray-600 bg-white px-2.5 py-1.5 rounded-[10px]">
                <Clock className="w-3.5 h-3.5 text-gray-400" />
                {formatDuration(request.workDuration)}
              </span>
            </div>
          </div>

          {/* Optional rating — collapsible */}
          <div className="rounded-[14px] border border-gray-100 overflow-hidden">
            <button
              onClick={() => setShowRatingSection(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 touch-manipulation active:bg-gray-100 transition-colors"
            >
              <span className="text-[13px] font-semibold text-gray-600 flex items-center gap-2">
                <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                {language === 'ru' ? 'Оценить исполнителя (необязательно)' : 'Ijrochini baholash (ixtiyoriy)'}
              </span>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${showRatingSection ? '' : '-rotate-90'}`} />
            </button>

            {showRatingSection && (
              <div className="px-4 py-4 space-y-3 bg-white">
                <div className="flex justify-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className="p-1.5 active:scale-90 transition-transform touch-manipulation"
                    >
                      <Star className={`w-9 h-9 ${star <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`} />
                    </button>
                  ))}
                </div>
                <div className="text-center text-[12px] text-gray-500 font-medium">
                  {rating === 5 && (language === 'ru' ? 'Отлично!' : 'A\'lo!')}
                  {rating === 4 && (language === 'ru' ? 'Хорошо' : 'Yaxshi')}
                  {rating === 3 && (language === 'ru' ? 'Нормально' : 'O\'rtacha')}
                  {rating === 2 && (language === 'ru' ? 'Плохо' : 'Yomon')}
                  {rating === 1 && (language === 'ru' ? 'Очень плохо' : 'Juda yomon')}
                </div>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  className="w-full px-4 py-3 rounded-[12px] border border-gray-200 bg-gray-50 focus:bg-white focus:border-primary-300 min-h-[80px] text-[14px] resize-none outline-none transition-colors"
                  placeholder={language === 'ru' ? 'Отзыв о работе...' : 'Ish haqida fikr...'}
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer — primary action first, reject secondary */}
        <div className="px-5 pt-3 pb-5 border-t border-gray-100 bg-white space-y-2" style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
          {/* Primary: accept */}
          <button
            onClick={() => onApprove(rating, feedback || undefined)}
            className="w-full py-4 min-h-[52px] rounded-[16px] font-bold text-[15px] text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform touch-manipulation bg-green-500 shadow-[0_4px_16px_rgba(16,185,129,0.35)]"
          >
            <CheckCircle className="w-5 h-5" />
            {language === 'ru' ? 'Принять работу' : 'Ishni qabul qilish'}
          </button>
          {/* Secondary: reject */}
          <button
            onClick={() => setShowReject(true)}
            className="w-full py-3 min-h-[44px] rounded-[14px] font-semibold text-[13px] text-red-500 bg-transparent active:bg-red-50 transition-colors touch-manipulation flex items-center justify-center gap-1.5"
          >
            <X className="w-4 h-4" />
            {language === 'ru' ? 'Работа выполнена некачественно' : 'Ish sifatsiz bajarilgan'}
          </button>
        </div>
      </div>
    </div>
  );
}
