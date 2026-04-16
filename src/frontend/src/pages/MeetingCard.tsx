import {
  Users, Calendar, FileText, Building2, User,
  Eye, Play, Square, BarChart3, Shield, X, Check, CalendarCheck, Download, Trash2,
} from 'lucide-react';
import type { Meeting, MeetingStatus } from '../types';
import { MEETING_STATUS_LABELS } from '../types';
import { plural } from '../utils/plural';
import { StatusBadge } from '../components/common';
import type { StatusTone } from '../theme';

// Map meeting status colors (from MEETING_STATUS_LABELS.color strings) to
// design-system StatusTone so we use a single palette instead of 10
// per-color className combos.
const meetingToneFromColor = (color: string): StatusTone => {
  switch (color) {
    case 'green':
    case 'emerald':
    case 'teal':
      return 'active';
    case 'yellow':
    case 'orange':
    case 'indigo':
      return 'pending';
    case 'blue':
    case 'purple':
      return 'info';
    case 'red':
      return 'critical';
    default:
      return 'expired';
  }
};

export interface MeetingCardProps {
  meeting: Meeting;
  language: string;
  getStatusColor: (status: MeetingStatus) => string;
  getStatusLabel: (status: MeetingStatus) => string;
  formatDate: (date: string) => string;
  onViewDetails: () => void;
  onApprove: () => void;
  onReject: (reason: string) => void;
  onConfirmSchedule: () => void;
  onOpenVoting: () => void;
  onCloseVoting: () => void;
  onPublishResults: () => void;
  onGenerateProtocol: () => void;
  onApproveProtocol: () => void;
  onDelete: () => void;
  calculateQuorum: () => { participated: number; total: number; percent: number; quorumReached: boolean };
  user: { id: string; role: string } | null;
}

export function MeetingCard({
  meeting,
  language,
  getStatusColor,
  getStatusLabel,
  formatDate,
  onViewDetails,
  onApprove,
  onReject,
  onConfirmSchedule,
  onOpenVoting,
  onCloseVoting,
  onPublishResults,
  onGenerateProtocol,
  onApproveProtocol,
  onDelete,
  calculateQuorum,
  user,
}: MeetingCardProps) {
  const quorum = calculateQuorum();

  const statusTone = meetingToneFromColor(getStatusColor(meeting.status));

  return (
    <div className="glass-card p-5 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <StatusBadge status={statusTone} size="md">
              {getStatusLabel(meeting.status)}
            </StatusBadge>
            <span className="text-sm text-gray-500">
              #{meeting.number}
            </span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
              meeting.format === 'online' ? 'bg-blue-50 text-blue-600' :
              meeting.format === 'offline' ? 'bg-green-50 text-green-600' :
              'bg-purple-50 text-purple-600'
            }`}>
              {meeting.format === 'online' ? (language === 'ru' ? 'Онлайн' : 'Onlayn') :
               meeting.format === 'offline' ? (language === 'ru' ? 'Очное' : 'Yuzma-yuz') :
               (language === 'ru' ? 'Смешанное' : 'Aralash')}
            </span>
          </div>

          {/* Building & Date */}
          <div className="flex items-center gap-4 text-sm text-gray-600 mb-2 overflow-hidden">
            <span className="flex items-center gap-1 truncate min-w-0">
              <Building2 className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{meeting.buildingAddress}</span>
            </span>
            {meeting.confirmedDateTime && (
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {formatDate(meeting.confirmedDateTime)}
              </span>
            )}
          </div>

          {/* Organizer */}
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-3 min-w-0">
            <User className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{meeting.organizerName}</span>
            <span className="text-gray-400">
              ({meeting.organizerType === 'resident'
                ? (language === 'ru' ? 'Житель' : 'Aholi')
                : (language === 'ru' ? 'УК' : 'UK')})
            </span>
          </div>

          {/* Agenda Summary */}
          <div className="flex items-center gap-2 text-sm">
            <FileText className="w-4 h-4 text-gray-400" />
            <span className="text-gray-600">
              {meeting.agendaItems.length}{' '}
              {plural(
                language === 'ru' ? 'ru' : 'uz',
                meeting.agendaItems.length,
                { one: 'вопрос в повестке', few: 'вопроса в повестке', many: 'вопросов в повестке' },
                { one: 'savol kun tartibida', other: 'savol kun tartibida' }
              )}
            </span>
          </div>

          {/* Schedule Poll Stats - show votes for each date option */}
          {meeting.status === 'schedule_poll_open' && meeting.scheduleOptions && meeting.scheduleOptions.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-500" />
                {language === 'ru' ? 'Голосование за дату:' : 'Sana uchun ovoz berish:'}
              </div>
              <div className="space-y-1">
                {meeting.scheduleOptions.map((option) => {
                  const totalVotes = meeting.scheduleOptions.reduce((sum, opt) => sum + ((opt as any).voteCount ?? opt.votes?.length ?? 0), 0);
                  const voteCount = (option as any).voteCount ?? option.votes?.length ?? 0;
                  const percent = totalVotes > 0 ? (voteCount / totalVotes * 100) : 0;
                  const isLeading = voteCount > 0 && voteCount === Math.max(...meeting.scheduleOptions.map(o => (o as any).voteCount ?? o.votes?.length ?? 0));

                  return (
                    <div key={option.id} className="flex items-center gap-2 text-sm">
                      <div className={`flex-1 flex items-center gap-2 ${isLeading ? 'font-medium text-blue-700' : 'text-gray-600'}`}>
                        <span>{formatDate(option.dateTime)}</span>
                        {isLeading && voteCount > 0 && (
                          <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                            {language === 'ru' ? 'Лидер' : 'Yetakchi'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-12 text-right">{voteCount} ({percent.toFixed(0)}%)</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="text-xs text-gray-400 mt-2">
                {language === 'ru' ? 'Всего голосов: ' : 'Jami ovozlar: '}
                {meeting.scheduleOptions.reduce((sum, opt) => sum + ((opt as any).voteCount ?? opt.votes?.length ?? 0), 0)}
              </div>
            </div>
          )}

          {/* Participation stats for active/completed meetings */}
          {['voting_open', 'voting_closed', 'results_published', 'protocol_generated', 'protocol_approved'].includes(meeting.status) && (
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-400" />
                <span className="text-sm">
                  {quorum.participated}/{quorum.total} ({quorum.percent.toFixed(1)}%)
                </span>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                quorum.quorumReached
                  ? 'bg-green-100 text-green-700'
                  : 'bg-red-100 text-red-700'
              }`}>
                {quorum.quorumReached
                  ? (language === 'ru' ? 'Кворум есть' : 'Kvorum bor')
                  : (language === 'ru' ? 'Нет кворума' : 'Kvorum yo\'q')}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <button
            onClick={onViewDetails}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            title={language === 'ru' ? 'Подробнее' : 'Batafsil'}
            aria-label={language === 'ru' ? 'Подробнее' : 'Batafsil'}
          >
            <Eye className="w-5 h-5" />
          </button>

          {/* Status-specific actions */}
          {meeting.status === 'pending_moderation' && (user?.role === 'admin' || user?.role === 'manager' || user?.role === 'director') && (
            <>
              <button
                onClick={onApprove}
                className="p-2 text-green-500 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors"
                title={language === 'ru' ? 'Одобрить' : 'Tasdiqlash'}
              >
                <Check className="w-5 h-5" />
              </button>
              <button
                onClick={() => onReject(language === 'ru' ? 'Отклонено модератором' : 'Moderator tomonidan rad etildi')}
                className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                title={language === 'ru' ? 'Отклонить' : 'Rad etish'}
              >
                <X className="w-5 h-5" />
              </button>
            </>
          )}

          {/* Delete button - for admin/manager/director (all meetings including completed) */}
          {(user?.role === 'admin' || user?.role === 'manager' || user?.role === 'director') && (
            <button
              onClick={onDelete}
              className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title={language === 'ru' ? 'Удалить' : 'O\'chirish'}
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}

        </div>
      </div>

      {/* Admin Action Buttons - Full width at bottom */}
      {(user?.role === 'admin' || user?.role === 'manager' || user?.role === 'director') && (
        <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-2">
          {meeting.status === 'schedule_poll_open' && (
            <button
              onClick={onConfirmSchedule}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors text-sm font-medium"
            >
              <CalendarCheck className="w-4 h-4" />
              {language === 'ru' ? 'Подтвердить дату' : 'Sanani tasdiqlash'}
            </button>
          )}

          {meeting.status === 'schedule_confirmed' && (
            <button
              onClick={onOpenVoting}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors text-sm font-medium"
            >
              <Play className="w-4 h-4" />
              {language === 'ru' ? 'Открыть голосование' : 'Ovoz berishni ochish'}
            </button>
          )}

          {meeting.status === 'voting_open' && (
            <button
              onClick={onCloseVoting}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors text-sm font-medium"
            >
              <Square className="w-4 h-4" />
              {language === 'ru' ? 'Закрыть голосование' : 'Ovoz berishni yopish'}
            </button>
          )}

          {meeting.status === 'voting_closed' && (
            <button
              onClick={onPublishResults}
              className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors text-sm font-medium"
            >
              <BarChart3 className="w-4 h-4" />
              {language === 'ru' ? 'Опубликовать итоги' : 'Natijalarni e\'lon qilish'}
            </button>
          )}

          {meeting.status === 'results_published' && (
            <button
              onClick={onGenerateProtocol}
              className="flex items-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-lg transition-colors text-sm font-medium"
            >
              <FileText className="w-4 h-4" />
              {language === 'ru' ? 'Сформировать протокол' : 'Bayonnoma yaratish'}
            </button>
          )}

          {meeting.status === 'protocol_generated' && (
            <button
              onClick={onApproveProtocol}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors text-sm font-medium"
            >
              <Shield className="w-4 h-4" />
              {language === 'ru' ? 'Подписать протокол' : 'Bayonnomani imzolash'}
            </button>
          )}

          {meeting.status === 'protocol_approved' && (
            <button
              onClick={onViewDetails}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              {language === 'ru' ? 'Скачать протокол' : 'Bayonnomani yuklab olish'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
