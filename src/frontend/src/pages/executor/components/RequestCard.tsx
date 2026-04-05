import {
  Clock, CheckCircle, MapPin, Phone, User,
  Play, Check, Star, Timer,
  CalendarDays, XCircle, AlertCircle,
  Pause, PlayCircle, RefreshCw, Hand, FileText
} from 'lucide-react';
import { useLanguageStore } from '../../../stores/languageStore';
import { formatAddress } from '../../../utils/formatAddress';
import { SPECIALIZATION_LABELS, STATUS_LABELS } from '../../../types';
import type { Request, RequestStatus } from '../../../types';

interface RequestCardProps {
  request: Request;
  timerSeconds?: number;
  hasActiveWork?: boolean;
  onView: () => void;
  onTakeRequest: () => void;
  onAccept: () => void;
  onStartWork: () => void;
  onPauseWork: () => void;
  onResumeWork: () => void;
  onComplete: () => void;
  onDecline: () => void;
  onReschedule: () => void;
  formatTime: (s: number) => string;
}

// Request Card Component - Mobile optimized
export function RequestCard({
  request,
  timerSeconds,
  hasActiveWork,
  onView,
  onTakeRequest,
  onAccept,
  onStartWork,
  onPauseWork,
  onResumeWork,
  onComplete,
  onDecline,
  onReschedule,
  formatTime
}: RequestCardProps) {
  const { language } = useLanguageStore();
  // Can decline/release if assigned, accepted, or in_progress (for illness, etc.)
  const canDecline = ['assigned', 'accepted', 'in_progress'].includes(request.status);
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-amber-500';
      default: return 'bg-gray-400';
    }
  };

  const getStatusBadge = (status: RequestStatus) => {
    const baseClass = "px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-xs font-medium";
    switch (status) {
      case 'new': return <span className={`${baseClass} bg-purple-100 text-purple-700`}>{language === 'ru' ? 'Новая' : 'Yangi'}</span>;
      case 'assigned': return <span className={`${baseClass} bg-blue-100 text-blue-700`}>{language === 'ru' ? 'Назначена' : 'Tayinlangan'}</span>;
      case 'accepted': return <span className={`${baseClass} bg-cyan-100 text-cyan-700`}>{language === 'ru' ? 'Принята' : 'Qabul qilingan'}</span>;
      case 'in_progress': return <span className={`${baseClass} bg-amber-100 text-amber-700`}>{language === 'ru' ? 'В работе' : 'Ishda'}</span>;
      case 'pending_approval': return <span className={`${baseClass} bg-purple-100 text-purple-700`}>{language === 'ru' ? 'Ожидает' : 'Kutilmoqda'}</span>;
      case 'completed': return <span className={`${baseClass} bg-green-100 text-green-700`}>{language === 'ru' ? 'Выполнена' : 'Bajarilgan'}</span>;
      default: return <span className={baseClass}>{STATUS_LABELS[status]}</span>;
    }
  };

  return (
    <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6 cursor-pointer hover:bg-white/40 active:bg-white/60 active:scale-[0.99] transition-all touch-manipulation" onClick={onView}>
      {/* Header with priority indicator */}
      <div className="flex items-start gap-3">
        <div className={`w-2 h-full min-h-[20px] rounded-full ${getPriorityColor(request.priority)} flex-shrink-0`} />
        <div className="flex-1 min-w-0">
          {/* Title and status */}
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="text-xs text-gray-400">#{request.number}</span>
            {getStatusBadge(request.status)}
            {request.status === 'in_progress' && timerSeconds !== undefined && (
              <span className={`flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg font-mono text-xs ${request.isPaused ? 'bg-gray-100 text-gray-600' : 'bg-amber-100 text-amber-700'}`}>
                {request.isPaused ? <Pause className="w-3 h-3" /> : <Timer className="w-3 h-3" />}
                {formatTime(timerSeconds)}
              </span>
            )}
          </div>
          <h3 className="font-semibold text-base md:text-lg leading-tight truncate">{request.title}</h3>
          <p className="text-gray-600 text-sm line-clamp-2 mt-1">{request.description}</p>

          {/* Trash type and volume badges */}
          {request.category === 'trash' && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {request.title.includes(': ') && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-100 text-primary-700 rounded-full text-xs font-medium">
                  {request.title.split(': ').slice(1).join(': ')}
                </span>
              )}
              {request.description?.includes('\u041e\u0431\u044a\u0451\u043c: ') && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                  {request.description.split('\u041e\u0431\u044a\u0451\u043c: ')[1].split('\n')[0]}
                </span>
              )}
            </div>
          )}

          {/* Contact info - compact on mobile */}
          <div className="flex flex-wrap items-center gap-2 mt-3 text-xs md:text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <User className="w-3.5 h-3.5" />
              <span className="truncate max-w-[100px]">{request.residentName}</span>
            </span>
            <a
              href={`tel:${request.residentPhone}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-primary-600 active:text-primary-800"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>{language === 'ru' ? '\u041f\u043e\u0437\u0432\u043e\u043d\u0438\u0442\u044c' : 'Qo\'ng\'iroq qilish'}</span>
            </a>
          </div>

          {/* Address and date */}
          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-500">
            <span className="flex items-center gap-1 truncate">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{formatAddress(request.address, request.apartment)}</span>
            </span>
            {request.createdAt && (() => {
              const d = new Date(request.createdAt.endsWith('Z') ? request.createdAt : request.createdAt + 'Z');
              const locale = language === 'ru' ? 'ru-RU' : 'uz-UZ';
              return (
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })}{' '}
                  {d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                </span>
              );
            })()}
          </div>

          {/* Scheduled date if exists */}
          {request.scheduledDate && (
            <div className="mt-2 inline-flex items-center gap-2 px-2 py-1 bg-primary-50 text-primary-700 rounded-lg text-xs">
              <CalendarDays className="w-3.5 h-3.5" />
              <span>{new Date(request.scheduledDate).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', { day: 'numeric', month: 'short' })}</span>
              {request.scheduledTime && <span>{request.scheduledTime}</span>}
            </div>
          )}

          {/* Priority info - show for assigned/accepted/in_progress requests */}
          {['assigned', 'accepted', 'in_progress'].includes(request.status) && (
            <div className="mt-3 p-2 bg-gray-50 rounded-lg">
              <div className="text-xs text-gray-500">
                <span className="text-gray-400">{language === 'ru' ? '\u041f\u0440\u0438\u043e\u0440\u0438\u0442\u0435\u0442: ' : 'Ustuvorlik: '}</span>
                <span className={`font-medium ${
                  request.priority === 'urgent' ? 'text-red-600' :
                  request.priority === 'high' ? 'text-orange-600' :
                  request.priority === 'medium' ? 'text-amber-600' : 'text-gray-600'
                }`}>
                  {request.priority === 'urgent' ? (language === 'ru' ? '\u0421\u0440\u043e\u0447\u043d\u044b\u0439' : 'Shoshilinch') :
                   request.priority === 'high' ? (language === 'ru' ? '\u0412\u044b\u0441\u043e\u043a\u0438\u0439' : 'Yuqori') :
                   request.priority === 'medium' ? (language === 'ru' ? '\u0421\u0440\u0435\u0434\u043d\u0438\u0439' : 'O\'rta') : (language === 'ru' ? '\u041d\u0438\u0437\u043a\u0438\u0439' : 'Past')}
                </span>
              </div>
            </div>
          )}

          {/* Reschedule button - prominent, similar to residents view */}
          {['assigned', 'accepted', 'in_progress'].includes(request.status) && (
            <button
              onClick={(e) => { e.stopPropagation(); onReschedule(); }}
              className="mt-3 w-full min-h-[44px] py-2.5 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-xl font-medium flex items-center justify-center gap-2 transition-all active:scale-[0.98] touch-manipulation"
            >
              <RefreshCw className="w-4 h-4" />
              {language === 'ru' ? '\u041f\u0435\u0440\u0435\u043d\u0435\u0441\u0442\u0438 \u043d\u0430 \u0434\u0440\u0443\u0433\u043e\u0435 \u0432\u0440\u0435\u043c\u044f' : 'Boshqa vaqtga o\'tkazish'}
            </button>
          )}

          {/* Rating if completed */}
          {request.status === 'completed' && request.rating && (
            <div className="flex items-center gap-1 mt-2">
              {[1, 2, 3, 4, 5].map(star => (
                <Star
                  key={star}
                  className={`w-4 h-4 ${star <= request.rating! ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}`}
                />
              ))}
            </div>
          )}

          {/* Pending approval notice */}
          {request.status === 'pending_approval' && (
            <div className="mt-2 text-xs text-purple-600 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {language === 'ru' ? '\u041e\u0436\u0438\u0434\u0430\u043d\u0438\u0435 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u044f' : 'Tasdiq kutilmoqda'}
            </div>
          )}

          {/* Rejection info */}
          {request.status === 'in_progress' && request.rejectionReason && (
            <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-1 text-red-700 font-medium text-xs">
                <AlertCircle className="w-3.5 h-3.5" />
                {language === 'ru' ? '\u0422\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044f \u0434\u043e\u0440\u0430\u0431\u043e\u0442\u043a\u0430' : 'Qayta ishlash kerak'}
              </div>
              <p className="text-xs text-red-600 mt-1 line-clamp-2">{request.rejectionReason}</p>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons - full width on mobile */}
      <div className="flex gap-2 mt-4 pt-3 border-t border-gray-200/50" onClick={(e) => e.stopPropagation()}>
        {canDecline && (
          <button
            onClick={onDecline}
            className="min-h-[44px] py-3 px-4 text-red-600 bg-red-50 hover:bg-red-100 active:bg-red-200 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-colors touch-manipulation"
          >
            <XCircle className="w-4 h-4" />
            <span className="hidden md:inline">{request.status === 'in_progress'
              ? (language === 'ru' ? '\u041e\u0441\u0432\u043e\u0431\u043e\u0434\u0438\u0442\u044c' : 'Bo\'shatish')
              : (language === 'ru' ? '\u041e\u0442\u043a\u0430\u0437\u0430\u0442\u044c\u0441\u044f' : 'Rad etish')}</span>
          </button>
        )}
        {request.status === 'new' && (
          <button
            onClick={onTakeRequest}
            className="flex-1 min-h-[44px] py-3 px-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform touch-manipulation"
            style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }}
          >
            <Hand className="w-5 h-5" />
            {language === 'ru' ? '\u0412\u0437\u044f\u0442\u044c \u0437\u0430\u044f\u0432\u043a\u0443' : 'Arizani olish'}
          </button>
        )}
        {request.status === 'assigned' && (
          <button
            onClick={onAccept}
            className="flex-1 min-h-[44px] py-3 px-4 rounded-xl font-semibold bg-white border-2 border-gray-200 text-gray-700 flex items-center justify-center gap-2 active:scale-[0.98] active:bg-gray-50 transition-all touch-manipulation"
          >
            <Check className="w-5 h-5" />
            {language === 'ru' ? '\u041f\u0440\u0438\u043d\u044f\u0442\u044c' : 'Qabul qilish'}
          </button>
        )}
        {request.status === 'accepted' && (
          hasActiveWork ? (
            <div className="flex-1 py-3 px-4 rounded-xl font-medium bg-gray-100 text-gray-500 flex items-center justify-center gap-2 text-sm">
              <AlertCircle className="w-4 h-4" />
              {language === 'ru' ? '\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u0435 \u0442\u0435\u043a\u0443\u0449\u0443\u044e \u0440\u0430\u0431\u043e\u0442\u0443' : 'Avval joriy ishni tugatish'}
            </div>
          ) : (
            <button
              onClick={onStartWork}
              className="flex-1 min-h-[44px] py-3 px-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform touch-manipulation"
              style={{ background: 'linear-gradient(135deg, #FFE500, #FFC700)', color: '#000' }}
            >
              <Play className="w-5 h-5" />
              {language === 'ru' ? '\u041d\u0430\u0447\u0430\u0442\u044c \u0440\u0430\u0431\u043e\u0442\u0443' : 'Ishni boshlash'}
            </button>
          )
        )}
        {request.status === 'in_progress' && (
          <div className="flex-1 flex gap-2">
            {request.isPaused ? (
              <button
                onClick={onResumeWork}
                className="flex-1 min-h-[44px] py-3 px-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform touch-manipulation"
                style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}
              >
                <PlayCircle className="w-5 h-5" />
                {language === 'ru' ? '\u041f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c' : 'Davom etish'}
              </button>
            ) : (
              <button
                onClick={onPauseWork}
                className="min-h-[44px] py-3 px-4 rounded-xl font-semibold text-gray-700 bg-white border-2 border-gray-300 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform touch-manipulation"
              >
                <Pause className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={onComplete}
              className="flex-1 min-h-[44px] py-3 px-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform touch-manipulation"
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
            >
              <Check className="w-5 h-5" />
              {language === 'ru' ? '\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044c' : 'Tugatish'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
