import {
  Clock, MapPin, Phone, User,
  Play, Check, X, Star,
  CalendarDays, AlertCircle,
  RefreshCw, Hand, XCircle
} from 'lucide-react';
import { useLanguageStore } from '../../../stores/languageStore';
import { formatAddress } from '../../../utils/formatAddress';
import { SPECIALIZATION_LABELS } from '../../../types';
import type { Request } from '../../../types';

interface RequestDetailsModalProps {
  request: Request;
  timerSeconds?: number;
  onClose: () => void;
  onTakeRequest: () => void;
  onAccept: () => void;
  onStartWork: () => void;
  onComplete: () => void;
  onDecline: () => void;
  onReschedule: () => void;
  formatTime: (s: number) => string;
}

// Request Details Modal
export function RequestDetailsModal({
  request,
  timerSeconds,
  onClose,
  onTakeRequest,
  onAccept,
  onStartWork,
  onComplete,
  onDecline,
  onReschedule,
  formatTime
}: RequestDetailsModalProps) {
  const { language } = useLanguageStore();
  // Can decline/release if assigned, accepted, or in_progress (for illness, etc.)
  const canDecline = ['assigned', 'accepted', 'in_progress'].includes(request.status);
  // Can reschedule if assigned, accepted, or in_progress
  const canReschedule = ['assigned', 'accepted', 'in_progress'].includes(request.status);
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'urgent': return { label: language === 'ru' ? '\u0421\u0440\u043e\u0447\u043d\u043e' : 'Shoshilinch', color: 'text-red-600 bg-red-50' };
      case 'high': return { label: language === 'ru' ? '\u0412\u044b\u0441\u043e\u043a\u0438\u0439' : 'Yuqori', color: 'text-orange-600 bg-orange-50' };
      case 'medium': return { label: language === 'ru' ? '\u0421\u0440\u0435\u0434\u043d\u0438\u0439' : 'O\'rta', color: 'text-amber-600 bg-amber-50' };
      default: return { label: language === 'ru' ? '\u041d\u0438\u0437\u043a\u0438\u0439' : 'Past', color: 'text-gray-600 bg-gray-50' };
    }
  };

  const priority = getPriorityLabel(request.priority);

  // TODO: migrate to <Modal> component
  return (
    <div className="modal-backdrop">
      <div className="modal-content p-6 w-full max-w-lg mx-4 max-h-[90dvh] overflow-y-auto rounded-t-[20px] sm:rounded-2xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="text-sm text-gray-500">{language === 'ru' ? '\u0417\u0430\u044f\u0432\u043a\u0430' : 'Ariza'} #{request.number}</div>
            <h2 className="text-xl font-bold">{request.title}</h2>
          </div>
          <button onClick={onClose} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-white/30 rounded-lg touch-manipulation" aria-label="\u0417\u0430\u043a\u0440\u044b\u0442\u044c">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Active Timer Display */}
        {request.status === 'in_progress' && timerSeconds !== undefined && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-amber-500 rounded-full animate-pulse" />
                <span className="font-medium text-amber-700">{language === 'ru' ? '\u0420\u0430\u0431\u043e\u0442\u0430 \u0432 \u043f\u0440\u043e\u0446\u0435\u0441\u0441\u0435' : 'Ish jarayonda'}</span>
              </div>
              <div className="text-3xl font-mono font-bold text-amber-600">
                {formatTime(timerSeconds)}
              </div>
            </div>
          </div>
        )}

        {/* Rejection Info - show if work was rejected */}
        {request.status === 'in_progress' && request.rejectionReason && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
            <div className="flex items-center gap-2 text-red-700 font-medium mb-2">
              <AlertCircle className="w-5 h-5" />
              <span>{language === 'ru' ? '\u0420\u0430\u0431\u043e\u0442\u0430 \u043e\u0442\u043a\u043b\u043e\u043d\u0435\u043d\u0430 - \u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044f \u0434\u043e\u0440\u0430\u0431\u043e\u0442\u043a\u0430' : 'Ish rad etildi - qayta ishlash kerak'}</span>
              {request.rejectionCount && request.rejectionCount > 1 && (
                <span className="text-xs bg-red-100 px-2 py-0.5 rounded">
                  {request.rejectionCount}-{language === 'ru' ? '\u0439 \u0440\u0430\u0437' : 'marta'}
                </span>
              )}
            </div>
            <p className="text-red-600 mb-3">
              <span className="font-medium">{language === 'ru' ? '\u041f\u0440\u0438\u0447\u0438\u043d\u0430 \u043e\u0442\u043a\u043b\u043e\u043d\u0435\u043d\u0438\u044f:' : 'Rad etish sababi:'}</span> {request.rejectionReason}
            </p>
            <p className="text-sm text-red-600/80">
              {language === 'ru'
                ? '\u041f\u043e\u0436\u0430\u043b\u0443\u0439\u0441\u0442\u0430, \u0443\u0441\u0442\u0440\u0430\u043d\u0438\u0442\u0435 \u043f\u0440\u043e\u0431\u043b\u0435\u043c\u0443 \u0438 \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u0435 \u0440\u0430\u0431\u043e\u0442\u0443 \u0441\u043d\u043e\u0432\u0430. \u041f\u043e\u0441\u043b\u0435 \u0432\u044b\u043f\u043e\u043b\u043d\u0435\u043d\u0438\u044f \u043d\u0430\u0436\u043c\u0438\u0442\u0435 "\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044c \u0440\u0430\u0431\u043e\u0442\u0443".'
                : 'Iltimos, muammoni bartaraf eting va ishni qaytadan tugating. Bajarilgandan so\'ng "Ishni tugatish" tugmasini bosing.'}
            </p>
          </div>
        )}

        <div className="space-y-4">
          {/* Priority & Category */}
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${priority.color}`}>
              {priority.label}
            </span>
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-700">
              {SPECIALIZATION_LABELS[request.category]}
            </span>
          </div>

          {/* Description */}
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-1">{language === 'ru' ? '\u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435' : 'Tavsif'}</h3>
            <p className="text-gray-900">{request.description}</p>
          </div>

          {/* Scheduled Date/Time */}
          {request.scheduledDate && (
            <div className="bg-primary-50 border border-primary-200 rounded-xl p-4">
              <h3 className="font-medium text-primary-800 flex items-center gap-2 mb-2">
                <CalendarDays className="w-4 h-4" />
                {language === 'ru' ? '\u0416\u0435\u043b\u0430\u0435\u043c\u043e\u0435 \u0432\u0440\u0435\u043c\u044f \u0432\u044b\u043f\u043e\u043b\u043d\u0435\u043d\u0438\u044f' : 'Bajarish uchun kerakli vaqt'}
              </h3>
              <div className="flex items-center gap-4 text-primary-700">
                <span>{new Date(request.scheduledDate).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                {request.scheduledTime && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {request.scheduledTime}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Resident Info */}
          <div className="bg-white/30 rounded-xl p-4 space-y-3">
            <h3 className="font-medium">{language === 'ru' ? '\u0418\u043d\u0444\u043e\u0440\u043c\u0430\u0446\u0438\u044f \u043e \u0436\u0438\u0442\u0435\u043b\u0435' : 'Yashovchi haqida'}</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-gray-400" />
                <span>{request.residentName}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-gray-400" />
                <a href={`tel:${request.residentPhone}`} className="text-primary-600 hover:underline">
                  {request.residentPhone}
                </a>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-gray-400" />
                <span>{formatAddress(request.address, request.apartment)}</span>
              </div>
              {request.accessInfo && (
                <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="text-xs text-amber-700 font-medium mb-1">{language === 'ru' ? '\u0414\u043e\u0441\u0442\u0443\u043f \u0432 \u043a\u0432\u0430\u0440\u0442\u0438\u0440\u0443:' : 'Kvartiraga kirish:'}</div>
                  <div className="text-sm text-amber-900">{request.accessInfo}</div>
                </div>
              )}
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-white/30 rounded-xl p-4 space-y-3">
            <h3 className="font-medium">{language === 'ru' ? '\u0418\u0441\u0442\u043e\u0440\u0438\u044f' : 'Tarix'}</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">{language === 'ru' ? '\u0421\u043e\u0437\u0434\u0430\u043d\u0430' : 'Yaratildi'}</span>
                <span>{formatDate(request.createdAt)}</span>
              </div>
              {request.assignedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">{language === 'ru' ? '\u041d\u0430\u0437\u043d\u0430\u0447\u0435\u043d\u0430' : 'Tayinlandi'}</span>
                  <span>{formatDate(request.assignedAt)}</span>
                </div>
              )}
              {request.acceptedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">{language === 'ru' ? '\u041f\u0440\u0438\u043d\u044f\u0442\u0430' : 'Qabul qilindi'}</span>
                  <span>{formatDate(request.acceptedAt)}</span>
                </div>
              )}
              {request.startedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">{language === 'ru' ? '\u0420\u0430\u0431\u043e\u0442\u0430 \u043d\u0430\u0447\u0430\u0442\u0430' : 'Ish boshlandi'}</span>
                  <span>{formatDate(request.startedAt)}</span>
                </div>
              )}
              {request.completedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">{language === 'ru' ? '\u0420\u0430\u0431\u043e\u0442\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0430' : 'Ish tugallandi'}</span>
                  <span>{formatDate(request.completedAt)}</span>
                </div>
              )}
              {request.approvedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">{language === 'ru' ? '\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0430' : 'Tasdiqlandi'}</span>
                  <span>{formatDate(request.approvedAt)}</span>
                </div>
              )}
              {request.workDuration && (
                <div className="flex items-center justify-between border-t pt-2 mt-2">
                  <span className="text-gray-500">{language === 'ru' ? '\u0412\u0440\u0435\u043c\u044f \u0440\u0430\u0431\u043e\u0442\u044b' : 'Ish vaqti'}</span>
                  <span className="font-medium">{Math.round(request.workDuration / 60)} {language === 'ru' ? '\u043c\u0438\u043d' : 'daq'}</span>
                </div>
              )}
            </div>
          </div>

          {/* Rating if completed */}
          {request.status === 'completed' && request.rating && (
            <div className="bg-white/30 rounded-xl p-4">
              <h3 className="font-medium mb-2">{language === 'ru' ? '\u041e\u0446\u0435\u043d\u043a\u0430' : 'Baho'}</h3>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map(star => (
                  <Star
                    key={star}
                    className={`w-6 h-6 ${star <= request.rating! ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}`}
                  />
                ))}
                <span className="ml-2 text-lg font-semibold">{request.rating}/5</span>
              </div>
              {request.feedback && (
                <p className="mt-2 text-gray-600 italic">"{request.feedback}"</p>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 mt-6">
          <div className="flex gap-3">
            <a
              href={`tel:${request.residentPhone}`}
              className="btn-secondary flex-1 min-h-[44px] flex items-center justify-center gap-2 touch-manipulation"
            >
              <Phone className="w-4 h-4" />
              {language === 'ru' ? '\u041f\u043e\u0437\u0432\u043e\u043d\u0438\u0442\u044c' : 'Qo\'ng\'iroq qilish'}
            </a>
            {request.status === 'new' && (
              <button
                onClick={onTakeRequest}
                className="btn-primary flex-1 min-h-[44px] flex items-center justify-center gap-2 touch-manipulation"
                style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }}
              >
                <Hand className="w-4 h-4" />
                {language === 'ru' ? '\u0412\u0437\u044f\u0442\u044c \u0437\u0430\u044f\u0432\u043a\u0443' : 'Arizani olish'}
              </button>
            )}
            {request.status === 'assigned' && (
              <button onClick={onAccept} className="btn-primary flex-1 min-h-[44px] flex items-center justify-center gap-2 touch-manipulation">
                <Check className="w-4 h-4" />
                {language === 'ru' ? '\u041f\u0440\u0438\u043d\u044f\u0442\u044c \u0437\u0430\u044f\u0432\u043a\u0443' : 'Arizani qabul qilish'}
              </button>
            )}
            {request.status === 'accepted' && (
              <button onClick={onStartWork} className="btn-primary flex-1 min-h-[44px] flex items-center justify-center gap-2 touch-manipulation">
                <Play className="w-4 h-4" />
                {language === 'ru' ? '\u041d\u0430\u0447\u0430\u0442\u044c \u0440\u0430\u0431\u043e\u0442\u0443' : 'Ishni boshlash'}
              </button>
            )}
            {request.status === 'in_progress' && (
              <button
                onClick={onComplete}
                className="btn-primary flex-1 min-h-[44px] flex items-center justify-center gap-2 touch-manipulation"
                style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
              >
                <Check className="w-4 h-4" />
                {language === 'ru' ? '\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044c' : 'Tugatish'}
              </button>
            )}
          </div>
          {canReschedule && (
            <button
              onClick={onReschedule}
              className="w-full min-h-[44px] py-3 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-xl font-medium flex items-center justify-center gap-2 transition-all touch-manipulation"
            >
              <RefreshCw className="w-4 h-4" />
              {language === 'ru' ? '\u041f\u0435\u0440\u0435\u043d\u0435\u0441\u0442\u0438 \u043d\u0430 \u0434\u0440\u0443\u0433\u043e\u0435 \u0432\u0440\u0435\u043c\u044f' : 'Boshqa vaqtga o\'tkazish'}
            </button>
          )}
          {canDecline && (
            <button
              onClick={onDecline}
              className="w-full min-h-[44px] py-2 px-4 rounded-xl font-medium text-red-600 border border-red-300 hover:bg-red-50 transition-colors flex items-center justify-center gap-2 touch-manipulation"
            >
              <XCircle className="w-4 h-4" />
              {request.status === 'in_progress'
                ? (language === 'ru' ? '\u041e\u0441\u0432\u043e\u0431\u043e\u0434\u0438\u0442\u044c \u0437\u0430\u044f\u0432\u043a\u0443' : 'Arizani bo\'shatish')
                : (language === 'ru' ? '\u041e\u0442\u043a\u0430\u0437\u0430\u0442\u044c\u0441\u044f \u043e\u0442 \u0437\u0430\u044f\u0432\u043a\u0438' : 'Arizadan voz kechish')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
