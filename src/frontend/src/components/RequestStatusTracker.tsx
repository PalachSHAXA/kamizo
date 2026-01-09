import { CheckCircle, Clock, Wrench, User, Star, XCircle, Phone, MessageCircle, RefreshCw } from 'lucide-react';
import type { Request, RequestStatus } from '../types';
import { SERVICE_CATEGORIES, SPECIALIZATION_LABELS } from '../types';

// Helper to get category info
function getCategoryInfo(category: string) {
  const cat = SERVICE_CATEGORIES.find(c => c.id === category);
  return {
    icon: cat?.icon || '🔧',
    name: cat?.name || SPECIALIZATION_LABELS[category as keyof typeof SPECIALIZATION_LABELS] || category,
    nameUz: cat?.name || category
  };
}

interface RequestStatusTrackerProps {
  request: Request;
  executorName?: string;
  language: 'ru' | 'uz';
  onCancel?: () => void;
  showActions?: boolean;
  hasRescheduleRequest?: boolean;
  rescheduleInfo?: {
    proposedDate: string;
    proposedTime: string;
    initiator: 'resident' | 'executor';
  };
  hasConfirmedReschedule?: boolean;
  confirmedRescheduleInfo?: {
    proposedDate: string;
    proposedTime: string;
  };
}

// Этапы заявки
const STAGES = [
  {
    id: 'created',
    statuses: ['new'],
    labelRu: 'Создана',
    labelUz: 'Yaratildi',
    descRu: 'Заявка создана и ожидает назначения',
    descUz: 'Ariza yaratildi va tayinlanishni kutmoqda',
    icon: CheckCircle
  },
  {
    id: 'assigned',
    statuses: ['assigned', 'accepted'],
    labelRu: 'Назначена',
    labelUz: 'Tayinlandi',
    descRu: 'Исполнитель назначен',
    descUz: 'Ijrochi tayinlandi',
    icon: User
  },
  {
    id: 'in_progress',
    statuses: ['in_progress'],
    labelRu: 'Выполняется',
    labelUz: 'Bajarilmoqda',
    descRu: 'Мастер работает над заявкой',
    descUz: 'Usta ariza ustida ishlayapti',
    icon: Wrench
  },
  {
    id: 'done',
    statuses: ['pending_approval', 'completed'],
    labelRu: 'Выполнено',
    labelUz: 'Bajarildi',
    descRu: 'Работа завершена',
    descUz: 'Ish tugallandi',
    icon: Star
  },
];

function getStageIndex(status: RequestStatus): number {
  if (status === 'cancelled') return -1;
  for (let i = 0; i < STAGES.length; i++) {
    if (STAGES[i].statuses.includes(status)) {
      return i;
    }
  }
  return 0;
}

function getStatusMessage(request: Request, language: 'ru' | 'uz'): { title: string; subtitle: string } {
  const now = new Date();

  switch (request.status) {
    case 'new':
      return {
        title: language === 'ru' ? 'Заявка создана' : 'Ariza yaratildi',
        subtitle: language === 'ru'
          ? 'Ожидаем назначения исполнителя'
          : 'Ijrochi tayinlanishini kutmoqdamiz'
      };
    case 'assigned':
      return {
        title: language === 'ru' ? 'Исполнитель назначен' : 'Ijrochi tayinlandi',
        subtitle: language === 'ru'
          ? 'Ожидаем подтверждения от мастера'
          : 'Ustadan tasdiqni kutmoqdamiz'
      };
    case 'accepted':
      if (request.scheduledDate && request.scheduledTime) {
        const scheduled = new Date(request.scheduledDate);
        const [hours] = request.scheduledTime.split(':').map(Number);
        scheduled.setHours(hours, 0, 0, 0);

        const diffMs = scheduled.getTime() - now.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);

        if (diffMs > 0 && diffMins < 60) {
          return {
            title: language === 'ru' ? `Мастер приедет через ~${diffMins} мин` : `Usta ~${diffMins} daqiqada keladi`,
            subtitle: language === 'ru' ? 'Скоро будет у вас' : 'Tez orada sizda bo\'ladi'
          };
        } else if (diffMs > 0 && diffHours < 24) {
          return {
            title: language === 'ru' ? `Мастер приедет через ~${diffHours} ч` : `Usta ~${diffHours} soatda keladi`,
            subtitle: language === 'ru'
              ? `Запланировано на ${scheduled.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
              : `${scheduled.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })} ga rejalashtirilgan`
          };
        }
      }
      return {
        title: language === 'ru' ? 'Заявка принята' : 'Ariza qabul qilindi',
        subtitle: language === 'ru'
          ? 'Мастер скоро свяжется с вами'
          : 'Usta tez orada siz bilan bog\'lanadi'
      };
    case 'in_progress':
      return {
        title: language === 'ru' ? 'Работа выполняется' : 'Ish bajarilmoqda',
        subtitle: language === 'ru'
          ? 'Мастер работает над вашей заявкой'
          : 'Usta arizangiz ustida ishlayapti'
      };
    case 'pending_approval':
      return {
        title: language === 'ru' ? 'Работа завершена' : 'Ish tugallandi',
        subtitle: language === 'ru'
          ? 'Пожалуйста, подтвердите выполнение'
          : 'Iltimos, bajarilganini tasdiqlang'
      };
    case 'completed':
      return {
        title: language === 'ru' ? 'Заявка выполнена' : 'Ariza bajarildi',
        subtitle: language === 'ru' ? 'Спасибо за оценку!' : 'Baholashingiz uchun rahmat!'
      };
    case 'cancelled':
      return {
        title: language === 'ru' ? 'Заявка отменена' : 'Ariza bekor qilindi',
        subtitle: request.cancellationReason || (language === 'ru' ? 'Причина не указана' : 'Sabab ko\'rsatilmagan')
      };
    default:
      return { title: '', subtitle: '' };
  }
}

export function RequestStatusTracker({
  request,
  executorName,
  language,
  onCancel,
  showActions = true,
  hasRescheduleRequest = false,
  rescheduleInfo,
  hasConfirmedReschedule = false,
  confirmedRescheduleInfo,
}: RequestStatusTrackerProps) {
  const currentStageIndex = getStageIndex(request.status);
  const isCancelled = request.status === 'cancelled';
  const statusMessage = getStatusMessage(request, language);

  // Получаем информацию о категории
  const categoryInfo = getCategoryInfo(request.category);

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
      {/* Заголовок с иконкой услуги */}
      <div className="p-4 bg-gradient-to-r from-primary-500 to-orange-400">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-xl">
            {categoryInfo.icon}
          </div>
          <div className="flex-1">
            <div className="font-bold text-gray-900">
              {language === 'ru' ? categoryInfo.name : categoryInfo.nameUz}
            </div>
            <div className="text-sm text-gray-700 opacity-80">
              #{request.id.slice(-6).toUpperCase()}
            </div>
          </div>
        </div>
      </div>

      {/* Основное сообщение о статусе */}
      <div className="p-6 text-center border-b">
        <h2 className="text-xl font-bold text-gray-900 mb-1">
          {statusMessage.title}
        </h2>
        <p className="text-gray-500 text-sm">
          {statusMessage.subtitle}
        </p>
      </div>

      {/* Визуальный прогресс */}
      <div className="p-6">
        <div className="flex items-center justify-between relative">
          {/* Линия прогресса */}
          <div className="absolute top-5 left-0 right-0 h-1 bg-gray-200 rounded-full" />
          <div
            className="absolute top-5 left-0 h-1 bg-primary-500 rounded-full transition-all duration-500"
            style={{
              width: isCancelled ? '0%' : `${Math.min((currentStageIndex / (STAGES.length - 1)) * 100, 100)}%`
            }}
          />

          {/* Этапы */}
          {STAGES.map((stage, index) => {
            const isCompleted = !isCancelled && currentStageIndex >= index;
            const isCurrent = !isCancelled && currentStageIndex === index;
            const StageIcon = stage.icon;

            return (
              <div key={stage.id} className="relative z-10 flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                    isCancelled
                      ? 'bg-gray-200 text-gray-400'
                      : isCompleted
                        ? isCurrent
                          ? 'bg-primary-500 text-gray-900 ring-4 ring-primary-200 animate-pulse'
                          : 'bg-primary-500 text-gray-900'
                        : 'bg-gray-200 text-gray-400'
                  }`}
                >
                  <StageIcon className="w-5 h-5" />
                </div>
                <span className={`text-xs mt-2 font-medium text-center max-w-[70px] ${
                  isCompleted && !isCancelled ? 'text-gray-900' : 'text-gray-400'
                }`}>
                  {language === 'ru' ? stage.labelRu : stage.labelUz}
                </span>
              </div>
            );
          })}
        </div>

        {/* Отмена */}
        {isCancelled && (
          <div className="mt-6 p-4 bg-red-50 rounded-xl flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
              <XCircle className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <div className="font-medium text-red-700">
                {language === 'ru' ? 'Заявка отменена' : 'Ariza bekor qilindi'}
              </div>
              {request.cancellationReason && (
                <div className="text-sm text-red-600">{request.cancellationReason}</div>
              )}
            </div>
          </div>
        )}

        {/* Индикатор переноса - ожидание */}
        {hasRescheduleRequest && rescheduleInfo && !isCancelled && (
          <div className="mt-6 p-4 bg-amber-50 border-2 border-amber-400 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-500 rounded-full flex items-center justify-center animate-pulse">
                <RefreshCw className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-amber-800">
                  {language === 'ru' ? 'Запрошен перенос' : 'Ko\'chirish so\'raldi'}
                </div>
                <div className="text-sm text-amber-700">
                  {language === 'ru' ? 'Предложено: ' : 'Taklif: '}
                  <span className="font-medium">
                    {rescheduleInfo.proposedDate} {language === 'ru' ? 'в' : ''} {rescheduleInfo.proposedTime}
                  </span>
                </div>
                <div className="text-xs text-amber-600 mt-1">
                  {rescheduleInfo.initiator === 'resident'
                    ? (language === 'ru' ? 'Ожидается ответ исполнителя' : 'Ijrochi javobini kutmoqda')
                    : (language === 'ru' ? 'Ожидается ваш ответ' : 'Sizning javobingiz kutilmoqda')
                  }
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Индикатор переноса - подтверждён */}
        {hasConfirmedReschedule && confirmedRescheduleInfo && !isCancelled && !hasRescheduleRequest && (
          <div className="mt-6 p-4 bg-green-50 border-2 border-green-400 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-green-800">
                  {language === 'ru' ? 'Перенос подтверждён' : 'Ko\'chirish tasdiqlandi'}
                </div>
                <div className="text-sm text-green-700">
                  {language === 'ru' ? 'Новое время: ' : 'Yangi vaqt: '}
                  <span className="font-medium">
                    {confirmedRescheduleInfo.proposedDate} {language === 'ru' ? 'в' : ''} {confirmedRescheduleInfo.proposedTime}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Информация об исполнителе - компактный вариант */}
      {executorName && !isCancelled && currentStageIndex >= 1 && (
        <div className="px-6 pb-4">
          <div className="p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-blue-500 rounded-full flex items-center justify-center shadow-sm flex-shrink-0">
                <User className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900 truncate">{executorName}</div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">
                    {language === 'ru' ? 'Ваш мастер' : 'Sizning ustangiz'}
                  </span>
                  {request.executorRating && (
                    <div className="flex items-center gap-0.5 bg-yellow-100 px-1.5 py-0.5 rounded-full">
                      <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                      <span className="text-xs font-medium text-yellow-700">{request.executorRating.toFixed(1)}</span>
                    </div>
                  )}
                </div>
              </div>
              {/* Компактные кнопки действий */}
              {request.executorPhone && (
                <div className="flex gap-2 flex-shrink-0">
                  <a
                    href={`tel:${request.executorPhone}`}
                    className="w-10 h-10 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center transition-colors shadow-sm"
                    title={language === 'ru' ? 'Позвонить' : 'Qo\'ng\'iroq qilish'}
                  >
                    <Phone className="w-4 h-4" />
                  </a>
                  <a
                    href={`sms:${request.executorPhone}`}
                    className="w-10 h-10 bg-blue-500 hover:bg-blue-600 text-white rounded-full flex items-center justify-center transition-colors shadow-sm"
                    title={language === 'ru' ? 'Написать' : 'Yozish'}
                  >
                    <MessageCircle className="w-4 h-4" />
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Время */}
      {request.scheduledDate && request.scheduledTime && !isCancelled && (
        <div className="px-6 pb-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Clock className="w-4 h-4" />
            <span>
              {language === 'ru' ? 'Запланировано: ' : 'Rejalashtirilgan: '}
              {new Date(request.scheduledDate).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', {
                day: 'numeric',
                month: 'short'
              })}, {request.scheduledTime}
            </span>
          </div>
        </div>
      )}

      {/* Действия */}
      {showActions && !isCancelled && request.status !== 'completed' && (
        <div className="p-4 border-t flex gap-3">
          {onCancel && ['new', 'assigned', 'accepted'].includes(request.status) && (
            <button
              onClick={onCancel}
              className="flex-1 py-3 border-2 border-gray-200 hover:border-gray-300 rounded-xl text-gray-600 font-medium transition-colors"
            >
              {language === 'ru' ? 'Отменить заявку' : 'Arizani bekor qilish'}
            </button>
          )}
          {request.status === 'pending_approval' && (
            <button
              className="flex-1 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold transition-colors"
            >
              {language === 'ru' ? 'Подтвердить выполнение' : 'Bajarilganini tasdiqlash'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Компактная версия для списка с иконками этапов как в Яндекс.Еда
export function RequestStatusTrackerCompact({
  request,
  executorName,
  language,
  onClick,
  hasRescheduleRequest = false,
  rescheduleInfo,
  hasConfirmedReschedule = false,
  confirmedRescheduleInfo,
}: {
  request: Request;
  executorName?: string;
  language: 'ru' | 'uz';
  onClick?: () => void;
  hasRescheduleRequest?: boolean;
  rescheduleInfo?: {
    proposedDate: string;
    proposedTime: string;
    initiator: 'resident' | 'executor';
  };
  hasConfirmedReschedule?: boolean;
  confirmedRescheduleInfo?: {
    proposedDate: string;
    proposedTime: string;
  };
}) {
  const currentStageIndex = getStageIndex(request.status);
  const isCancelled = request.status === 'cancelled';
  const statusMessage = getStatusMessage(request, language);
  const categoryInfo = getCategoryInfo(request.category);

  return (
    <button
      onClick={onClick}
      className="w-full bg-white rounded-2xl shadow-sm overflow-hidden text-left hover:shadow-md transition-shadow active:scale-[0.99]"
    >
      {/* Header с градиентом */}
      <div className="p-4 bg-gradient-to-r from-primary-500/10 to-orange-400/10">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 bg-primary-500 rounded-xl flex items-center justify-center text-xl flex-shrink-0 shadow-sm">
            {categoryInfo.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-gray-900 truncate">
                {language === 'ru' ? categoryInfo.name : categoryInfo.nameUz}
              </span>
              <span className="text-xs text-gray-400 bg-white/50 px-2 py-0.5 rounded-full">
                #{request.id.slice(-6).toUpperCase()}
              </span>
            </div>
            <div className="text-sm text-gray-700 mt-1 font-semibold">
              {statusMessage.title}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {statusMessage.subtitle}
            </div>
          </div>
        </div>
      </div>

      {/* Этапы с иконками как в Яндекс.Еда */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
        <div className="flex items-center justify-between relative">
          {/* Линия прогресса */}
          <div className="absolute top-4 left-5 right-5 h-0.5 bg-gray-200" />
          <div
            className="absolute top-4 left-5 h-0.5 bg-primary-500 transition-all duration-500"
            style={{
              width: isCancelled ? '0%' : `calc(${Math.min((currentStageIndex / (STAGES.length - 1)) * 100, 100)}% - 40px)`
            }}
          />

          {/* Иконки этапов */}
          {STAGES.map((stage, index) => {
            const isCompleted = !isCancelled && currentStageIndex >= index;
            const isCurrent = !isCancelled && currentStageIndex === index;
            const StageIcon = stage.icon;

            return (
              <div key={stage.id} className="relative z-10 flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                    isCancelled
                      ? 'bg-gray-200 text-gray-400'
                      : isCompleted
                        ? isCurrent
                          ? 'bg-primary-500 text-gray-900 ring-2 ring-primary-200 shadow-md'
                          : 'bg-primary-500 text-gray-900'
                        : 'bg-white border-2 border-gray-200 text-gray-400'
                  }`}
                >
                  <StageIcon className="w-4 h-4" />
                </div>
              </div>
            );
          })}
        </div>

        {/* Исполнитель с рейтингом и телефоном */}
        {executorName && currentStageIndex >= 1 && !isCancelled && (
          <div className="mt-3 p-2 bg-white rounded-xl border border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <User className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <div className="font-medium text-sm text-gray-900">{executorName}</div>
                  {request.executorRating && (
                    <div className="flex items-center gap-1">
                      <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                      <span className="text-xs text-gray-500">{request.executorRating.toFixed(1)}</span>
                    </div>
                  )}
                </div>
              </div>
              {request.executorPhone && (
                <a
                  href={`tel:${request.executorPhone}`}
                  onClick={(e) => e.stopPropagation()}
                  className="w-9 h-9 bg-green-100 hover:bg-green-200 rounded-full flex items-center justify-center transition-colors"
                >
                  <Phone className="w-4 h-4 text-green-600" />
                </a>
              )}
            </div>
          </div>
        )}

        {/* Индикатор переноса - компактный - ожидание */}
        {hasRescheduleRequest && rescheduleInfo && !isCancelled && (
          <div className="mt-3 p-2 bg-amber-50 border border-amber-300 rounded-xl">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-amber-600 animate-spin" style={{ animationDuration: '3s' }} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-amber-800">
                  {language === 'ru' ? 'Перенос на:' : 'Ko\'chirish:'} {rescheduleInfo.proposedDate} {rescheduleInfo.proposedTime}
                </div>
                <div className="text-[10px] text-amber-600">
                  {rescheduleInfo.initiator === 'resident'
                    ? (language === 'ru' ? 'Ожидает подтверждения' : 'Tasdiqlash kutilmoqda')
                    : (language === 'ru' ? 'Требуется ваш ответ' : 'Javobingiz kerak')
                  }
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Индикатор переноса - компактный - подтверждён */}
        {hasConfirmedReschedule && confirmedRescheduleInfo && !isCancelled && !hasRescheduleRequest && (
          <div className="mt-3 p-2 bg-green-50 border border-green-300 rounded-xl">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-green-800">
                  {language === 'ru' ? 'Перенос подтверждён:' : 'Ko\'chirish tasdiqlandi:'} {confirmedRescheduleInfo.proposedDate} {confirmedRescheduleInfo.proposedTime}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </button>
  );
}
