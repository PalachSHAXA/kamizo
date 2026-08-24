import { useState, useEffect, useMemo } from 'react';
import {
  X, Clock, MapPin, Phone, User, Calendar,
  Pause, Play, XCircle, UserPlus, AlertCircle,
  Star, FileText, Building2, Camera, Timer, CalendarDays,
} from 'lucide-react';
import { AlertTriangle } from 'lucide-react';
import { useLanguageStore } from '../../../stores/languageStore';
import { useRequestStore } from '../../../stores/requestStore';
import { getRequestSla, slaStageLabel, formatElapsed } from '../../../utils/requestSla';
import { formatAddress } from '../../../utils/formatAddress';
import { formatName } from '../../../utils/formatName';
import { SPECIALIZATION_LABELS, STATUS_LABELS, STATUS_LABELS_UZ } from '../../../types';
import type { Request } from '../../../types';
import { StatusBadge } from '../../../components/common';
import { ImageLightbox } from '../../../components/common/ImageLightbox';
import type { StatusTone } from '../../../theme';

interface ManagementRequestModalProps {
  request: Request;
  onClose: () => void;
  onAssignClick: () => void;
  onCancel: (reason: string) => void | Promise<void>;
}

/**
 * Read-only + light action detail view for management roles
 * (manager, admin, director, dispatcher, department_head).
 *
 * Shows the full request info, resident contact (with tel:),
 * status timeline, pause reason if any, and provides two actions:
 *   - Assign / Reassign executor → opens existing AssignExecutorModal
 *   - Cancel request → requires typed reason
 *
 * Status mutations beyond assign/cancel (accept/start/complete/approve)
 * belong to executor and resident flows and are intentionally not here.
 */
export function ManagementRequestModal({
  request,
  onClose,
  onAssignClick,
  onCancel,
}: ManagementRequestModalProps) {
  const { language } = useLanguageStore();
  const t = (ru: string, uz: string) => (language === 'ru' ? ru : uz);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  // Live clock so the "в работе" duration ticks up while the modal is open.
  const [nowTs, setNowTs] = useState(() => Date.now());
  const isRunning = request.status === 'in_progress' && !request.isPaused;
  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isRunning]);

  const allRequests = useRequestStore((s) => s.requests);

  // Work duration: started → completed (or "now" while in progress), minus paused time.
  const durationSeconds = (() => {
    if (!request.startedAt) return null;
    const start = new Date(request.startedAt).getTime();
    const end = request.completedAt
      ? new Date(request.completedAt).getTime()
      : (request.status === 'in_progress' ? nowTs : null);
    if (end == null || Number.isNaN(start)) return null;
    const paused = (request.totalPausedTime || 0) * 1000;
    return Math.max(0, Math.floor((end - start - paused) / 1000));
  })();

  const formatDuration = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h} ${t('ч', 'soat')} ${m} ${t('мин', 'daq')}`;
    if (m > 0) return `${m} ${t('мин', 'daq')} ${s} ${t('сек', 'son')}`;
    return `${s} ${t('сек', 'son')}`;
  };

  // The assigned executor's other jobs for today — a quick "расписание на день".
  const executorSchedule = useMemo(() => {
    if (!request.executorId) return [] as Request[];
    const today = new Date().toISOString().split('T')[0];
    return allRequests
      .filter((r) =>
        r.executorId === request.executorId &&
        (r.scheduledDate === today ||
          (r.startedAt && r.startedAt.split('T')[0] === today) ||
          ['assigned', 'accepted', 'in_progress'].includes(r.status)))
      .sort((a, b) => (a.scheduledTime || '~').localeCompare(b.scheduledTime || '~'));
  }, [allRequests, request.executorId]);

  const statusLabel = (s: Request['status']) => (language === 'ru' ? STATUS_LABELS[s] : STATUS_LABELS_UZ[s]);

  const sla = getRequestSla(request, nowTs);

  const formatDate = (s?: string) => {
    if (!s) return '—';
    return new Date(s).toLocaleString(language === 'ru' ? 'ru-RU' : 'uz-UZ', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const priorityTone: StatusTone =
    request.priority === 'urgent' ? 'critical'
    : request.priority === 'high' ? 'pending'
    : request.priority === 'medium' ? 'info'
    : 'expired';

  const priorityLabel =
    request.priority === 'urgent' ? t('Срочно', 'Shoshilinch')
    : request.priority === 'high' ? t('Высокий', 'Yuqori')
    : request.priority === 'medium' ? t('Средний', "O'rta")
    : t('Низкий', 'Past');

  const canAssign = ['new', 'assigned'].includes(request.status);
  const canReassign = request.status === 'assigned' || request.status === 'accepted';
  const canCancel = !['completed', 'cancelled'].includes(request.status);

  const handleCancelSubmit = async () => {
    const reason = cancelReason.trim();
    if (reason.length < 3) return;
    setCancelling(true);
    try {
      await onCancel(reason);
      onClose();
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="modal-backdrop items-end sm:items-center" onClick={onClose}>
      <div
        className="modal-content w-full max-w-lg sm:mx-4 max-h-[92dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-gray-200/60 sticky top-0 bg-white z-10">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-gray-500">{t('Заявка', 'Ariza')} #{request.number}</div>
            <h2 className="text-lg sm:text-xl font-bold mt-0.5 break-words" title={request.title}>
              {request.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label={t('Закрыть', 'Yopish')}
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 rounded-lg transition-colors touch-manipulation flex-shrink-0 ml-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Overdue / SLA banner */}
          {sla.overdue && sla.stage && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm font-semibold">
                {t('Просрочено', "Muddati o'tgan")}: {slaStageLabel(sla.stage, language)} · {formatElapsed(sla.elapsedMin, language)}
              </span>
            </div>
          )}

          {/* Priority + Category chips */}
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={priorityTone} size="sm">
              {priorityLabel}
            </StatusBadge>
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
              {SPECIALIZATION_LABELS[request.category]}
            </span>
            {request.isPaused && (
              <StatusBadge status="expired" size="sm" className="gap-1">
                <Pause className="w-3 h-3" />
                {t('На паузе', 'Pauzada')}
              </StatusBadge>
            )}
          </div>

          {/* Description */}
          {request.description && (
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                {t('Описание', 'Tavsif')}
              </div>
              <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">
                {request.description}
              </p>
            </div>
          )}

          {/* Scheduled */}
          {request.scheduledDate && (
            <div className="bg-primary-50 border border-primary-200 rounded-xl p-3">
              <div className="text-xs font-semibold text-primary-800 mb-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                {t('Запланировано', 'Rejalashtirilgan')}
              </div>
              <div className="text-sm text-primary-700">
                {new Date(request.scheduledDate).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', {
                  weekday: 'long', day: 'numeric', month: 'long',
                })}
                {request.scheduledTime && <> · {request.scheduledTime}</>}
              </div>
            </div>
          )}

          {/* Resident */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2.5">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              {t('Житель', 'Yashovchi')}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="font-medium" title={request.residentName}>
                {formatName(request.residentName)}
              </span>
            </div>
            {request.residentPhone && (
              <a
                href={`tel:${request.residentPhone}`}
                className="flex items-center gap-2 text-sm text-primary-600 hover:underline touch-manipulation"
                aria-label={t(`Позвонить ${request.residentPhone}`, `Qo'ng'iroq ${request.residentPhone}`)}
              >
                <Phone className="w-4 h-4 flex-shrink-0" />
                {request.residentPhone}
              </a>
            )}
            <div className="flex items-start gap-2 text-sm text-gray-600">
              <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <span className="break-words">
                {formatAddress(request.address, request.apartment)}
              </span>
            </div>
            {request.accessInfo && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
                <span className="font-medium">{t('Доступ в квартиру: ', 'Kirish: ')}</span>
                {request.accessInfo}
              </div>
            )}
          </div>

          {/* Executor */}
          {request.executorName && (
            <div className="bg-gray-50 rounded-xl p-4 space-y-2.5">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {t('Исполнитель', 'Ijrochi')}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <User className="w-4 h-4 text-gray-400" />
                <span className="font-medium">{formatName(request.executorName)}</span>
              </div>
              {/* Work duration — live while in progress, final once completed */}
              {durationSeconds != null && (
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-gray-500">
                    <Timer className="w-4 h-4 text-gray-400" />
                    {request.status === 'in_progress'
                      ? t('Длится', 'Davom etmoqda')
                      : t('Длительность работы', 'Ish davomiyligi')}
                  </span>
                  <span className={`font-semibold ${request.status === 'in_progress' ? 'text-amber-600' : 'text-gray-900'}`}>
                    {formatDuration(durationSeconds)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Optional photo report attached by the executor at "Завершить" */}
          {request.completionPhotos && request.completionPhotos.length > 0 && (
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5" />
                {t('Фотоотчёт о работе', 'Ish bo\'yicha foto-hisobot')} ({request.completionPhotos.length})
              </div>
              <div className="grid grid-cols-3 gap-2">
                {request.completionPhotos.map((src, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setLightbox(src)}
                    className="aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-200 active:opacity-80 p-0 cursor-pointer"
                  >
                    <img src={src} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Executor's schedule for today */}
          {request.executorName && executorSchedule.length > 0 && (
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5" />
                {t('Расписание исполнителя на сегодня', 'Ijrochining bugungi jadvali')} ({executorSchedule.length})
              </div>
              <div className="space-y-1.5">
                {executorSchedule.map((r) => (
                  <div
                    key={r.id}
                    className={`flex items-center justify-between gap-2 text-sm rounded-lg px-2.5 py-2 ${r.id === request.id ? 'bg-primary-50 border border-primary-200' : 'bg-white border border-gray-200'}`}
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="text-xs text-gray-400 tabular-nums flex-shrink-0">
                        {r.scheduledTime || '—'}
                      </span>
                      <span className="truncate" title={r.title}>#{r.number} · {r.title}</span>
                    </div>
                    <span className="text-xs text-gray-500 flex-shrink-0">{statusLabel(r.status)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pause reason */}
          {request.isPaused && request.pauseReason && (
            <div className="bg-gray-100 border border-gray-200 rounded-xl p-3">
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Pause className="w-3.5 h-3.5" />
                {t('Причина паузы', 'Pauza sababi')}
              </div>
              <div className="text-sm text-gray-800">{request.pauseReason}</div>
            </div>
          )}

          {/* Timeline */}
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              {t('История', 'Tarix')}
            </div>
            <div className="space-y-1.5 text-sm">
              <TimelineRow icon={<FileText className="w-3.5 h-3.5" />} label={t('Создана', 'Yaratildi')} value={formatDate(request.createdAt)} />
              {request.assignedAt && (
                <TimelineRow icon={<UserPlus className="w-3.5 h-3.5" />} label={t('Назначена', 'Tayinlandi')} value={formatDate(request.assignedAt)} />
              )}
              {request.acceptedAt && (
                <TimelineRow icon={<Clock className="w-3.5 h-3.5" />} label={t('Принята', 'Qabul qilindi')} value={formatDate(request.acceptedAt)} />
              )}
              {request.startedAt && (
                <TimelineRow icon={<Play className="w-3.5 h-3.5" />} label={t('Работа начата', 'Ish boshlandi')} value={formatDate(request.startedAt)} />
              )}
              {request.completedAt && (
                <TimelineRow icon={<Clock className="w-3.5 h-3.5" />} label={t('Работа завершена', 'Ish tugatildi')} value={formatDate(request.completedAt)} />
              )}
              {request.approvedAt && (
                <TimelineRow icon={<Star className="w-3.5 h-3.5" />} label={t('Подтверждена', 'Tasdiqlandi')} value={formatDate(request.approvedAt)} />
              )}
              {request.cancelledAt && (
                <TimelineRow icon={<XCircle className="w-3.5 h-3.5" />} label={t('Отменена', 'Bekor qilindi')} value={formatDate(request.cancelledAt)} />
              )}
            </div>
          </div>

          {/* Rating */}
          {request.status === 'completed' && request.rating && (
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                {t('Оценка жителя', 'Baho')}
              </div>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} className={`w-5 h-5 ${n <= (request.rating || 0) ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}`} />
                ))}
                <span className="font-semibold ml-1">{request.rating}/5</span>
              </div>
              {request.feedback && (
                <p className="text-sm text-gray-700 italic mt-2">«{request.feedback}»</p>
              )}
            </div>
          )}

          {/* Building */}
          {request.buildingId && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Building2 className="w-3.5 h-3.5" />
              <span className="break-all">ID: {request.buildingId.slice(0, 8)}…</span>
            </div>
          )}
        </div>

        {/* Actions (sticky on mobile) */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200/60 p-4 flex flex-col sm:flex-row gap-2">
          {(canAssign || canReassign) && (
            <button
              onClick={() => { onAssignClick(); onClose(); }}
              className="btn-primary flex-1 min-h-[44px] flex items-center justify-center gap-2 touch-manipulation"
            >
              <UserPlus className="w-4 h-4" />
              {canReassign ? t('Переназначить', 'Qayta tayinlash') : t('Назначить', 'Tayinlash')}
            </button>
          )}
          {canCancel && !cancelOpen && (
            <button
              onClick={() => setCancelOpen(true)}
              className="btn-secondary flex-1 min-h-[44px] flex items-center justify-center gap-2 text-red-600 hover:bg-red-50 touch-manipulation"
            >
              <XCircle className="w-4 h-4" />
              {t('Отменить заявку', 'Arizani bekor qilish')}
            </button>
          )}
        </div>

        {/* Cancel reason form */}
        {cancelOpen && (
          <div className="border-t border-gray-200/60 p-4 bg-red-50/50">
            <div className="flex items-start gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm font-medium text-red-700">
                {t('Причина отмены (обязательно)', 'Bekor qilish sababi (majburiy)')}
              </div>
            </div>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              maxLength={300}
              placeholder={t('Например: дубликат, неверно классифицировано, жилец отказался…', 'Masalan: dublikat, noto\'g\'ri tasniflash, yashovchi rad etdi…')}
              className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:border-red-400 focus:ring-2 focus:ring-red-200 focus:outline-none resize-none"
              aria-label={t('Причина отмены', 'Bekor qilish sababi')}
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => { setCancelOpen(false); setCancelReason(''); }}
                className="btn-secondary flex-1 min-h-[44px] touch-manipulation"
                disabled={cancelling}
              >
                {t('Назад', 'Ortga')}
              </button>
              <button
                onClick={handleCancelSubmit}
                disabled={cancelReason.trim().length < 3 || cancelling}
                className="flex-1 min-h-[44px] bg-red-500 hover:bg-red-600 active:bg-red-700 disabled:bg-gray-300 text-white font-medium rounded-lg transition-colors touch-manipulation"
              >
                {cancelling ? t('Отмена…', 'Bekor qilinmoqda…') : t('Отменить заявку', 'Arizani bekor qilish')}
              </button>
            </div>
          </div>
        )}
        {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
      </div>
    </div>
  );
}

function TimelineRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2 text-gray-500">
        {icon}
        {label}
      </span>
      <span className="text-gray-900 text-xs sm:text-sm">{value}</span>
    </div>
  );
}
