import { useState, useMemo, useEffect } from 'react';
import {
  Plus, Users, Calendar, AlertCircle,
  FileText, Building2, User,
  ThumbsUp, ThumbsDown, Minus, Eye,
  Play, Square, BarChart3, Shield, X, Check, CalendarCheck, Download, Trash2,
  MessageSquare, Send, Phone, Paperclip, Loader2, CalendarDays, Video, MapPin, Link2
} from 'lucide-react';
import { EmptyState, Modal } from '../components/common';
import { PageSkeleton } from '../components/PageSkeleton';
import { useAuthStore } from '../stores/authStore';
import { useMeetingStore } from '../stores/meetingStore';
import { useLanguageStore } from '../stores/languageStore';
import { useCRMStore } from '../stores/crmStore';
import { generateProtocolDocx } from '../utils/protocolGenerator';
import { uploadApi, branchesApi, buildingsApi } from '../services/api';
import { useToastStore } from '../stores/toastStore';
import type {
  Meeting, MeetingStatus, MeetingFormat, AgendaItem, AgendaItemType,
  MeetingOrganizerType, DecisionThreshold
} from '../types';
import { AGENDA_ITEM_TYPES, MEETING_STATUS_LABELS, DECISION_THRESHOLD_LABELS } from '../types';

export function MeetingsPage() {
  const { user } = useAuthStore();
  const { t, language } = useLanguageStore();
  const addToast = useToastStore(s => s.addToast);
  const { buildings, fetchBuildings } = useCRMStore();
  const {
    meetings,
    loading: isLoadingMeetings,
    fetchMeetings,
    createMeeting,
    approveMeeting,
    rejectMeeting,
    confirmSchedule,
    openVoting,
    closeVoting,
    publishResults,
    generateProtocol,
    approveProtocol,
    deleteMeeting,
    calculateAgendaItemResult,
    calculateMeetingQuorum,
  } = useMeetingStore();

  // Fetch meetings and buildings on component mount
  useEffect(() => {
    fetchMeetings();
    fetchBuildings();
  }, [fetchMeetings, fetchBuildings]);

  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'completed' | 'pending'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  // Filter meetings by tab
  const filteredMeetings = useMemo(() => {
    switch (activeTab) {
      case 'active':
        return meetings.filter(m =>
          ['schedule_poll_open', 'schedule_confirmed', 'voting_open'].includes(m.status)
        );
      case 'completed':
        return meetings.filter(m =>
          ['voting_closed', 'results_published', 'protocol_generated', 'protocol_approved'].includes(m.status)
        );
      case 'pending':
        return meetings.filter(m =>
          ['draft', 'pending_moderation'].includes(m.status)
        );
      default:
        return meetings;
    }
  }, [meetings, activeTab]);

  const getStatusColor = (status: MeetingStatus): string => {
    return MEETING_STATUS_LABELS[status]?.color || 'gray';
  };

  const getStatusLabel = (status: MeetingStatus): string => {
    const labels = MEETING_STATUS_LABELS[status];
    return language === 'ru' ? labels?.label : labels?.labelUz;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleViewDetails = (meeting: Meeting) => {
    setSelectedMeeting(meeting);
    setShowDetailsModal(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm(language === 'ru' ? 'Удалить собрание? Это действие необратимо.' : 'Yig\'ilishni o\'chirmoqchimisiz? Bu amalni bekor qilib bo\'lmaydi.')) {
      await deleteMeeting(id);
    }
  };

  const tabs = [
    { id: 'all' as const, label: language === 'ru' ? 'Все' : 'Barchasi', count: meetings.length },
    { id: 'active' as const, label: language === 'ru' ? 'Активные' : 'Faol', count: meetings.filter(m => ['schedule_poll_open', 'schedule_confirmed', 'voting_open'].includes(m.status)).length },
    { id: 'pending' as const, label: language === 'ru' ? 'Ожидают' : 'Kutmoqda', count: meetings.filter(m => ['draft', 'pending_moderation'].includes(m.status)).length },
    { id: 'completed' as const, label: language === 'ru' ? 'Завершены' : 'Tugallangan', count: meetings.filter(m => ['voting_closed', 'results_published', 'protocol_generated', 'protocol_approved'].includes(m.status)).length },
  ];

  return (
    <div className="space-y-6 pb-24 md:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('meetings.title')}</h1>
          <p className="text-gray-500">{t('meetings.subtitle')}</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          {t('meetings.create')}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-primary-400 text-gray-900'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full bg-gray-900/10 text-xs">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Meetings List */}
      <div className="space-y-4">
        {isLoadingMeetings && meetings.length === 0 ? (
          <PageSkeleton variant="list" />
        ) : filteredMeetings.length === 0 ? (
          <EmptyState
            icon={<CalendarDays className="w-12 h-12" />}
            title={language === 'ru' ? 'Нет собраний' : 'Yig\'ilishlar yo\'q'}
            description={language === 'ru' ? 'Создайте первое собрание' : 'Birinchi yig\'ilishni yarating'}
          />
        ) : (
          filteredMeetings.map((meeting) => (
            <MeetingCard
              key={meeting.id}
              meeting={meeting}
              language={language}
              getStatusColor={getStatusColor}
              getStatusLabel={getStatusLabel}
              formatDate={formatDate}
              onViewDetails={() => handleViewDetails(meeting)}
              onApprove={() => approveMeeting(meeting.id)}
              onReject={(reason) => rejectMeeting(meeting.id, reason)}
              onConfirmSchedule={() => confirmSchedule(meeting.id)}
              onOpenVoting={() => openVoting(meeting.id)}
              onCloseVoting={() => closeVoting(meeting.id)}
              onPublishResults={() => publishResults(meeting.id)}
              onGenerateProtocol={() => generateProtocol(meeting.id)}
              onApproveProtocol={() => approveProtocol(meeting.id)}
              onDelete={() => handleDelete(meeting.id)}
              calculateQuorum={() => calculateMeetingQuorum(meeting.id)}
              user={user}
            />
          ))
        )}
      </div>

      {/* Create Meeting Modal */}
      {showCreateModal && (
        <CreateMeetingWizard
          onClose={() => setShowCreateModal(false)}
          onCreate={async (data) => {
            try {
              await createMeeting(data);
              await fetchMeetings(); // Refresh the list
              setShowCreateModal(false);
            } catch (err) {
              console.error('Failed to create meeting:', err);
            }
          }}
          language={language}
          user={user}
          buildings={buildings.map(b => ({ id: b.id, name: b.name, address: b.address }))}
        />
      )}

      {/* Meeting Details Modal */}
      {showDetailsModal && selectedMeeting && (
        <MeetingDetailsModal
          meeting={selectedMeeting}
          onClose={() => {
            setShowDetailsModal(false);
            setSelectedMeeting(null);
          }}
          language={language}
          calculateResult={calculateAgendaItemResult}
          calculateQuorum={() => calculateMeetingQuorum(selectedMeeting.id)}
        />
      )}
    </div>
  );
}

// Meeting Card Component
function MeetingCard({
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
}: {
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
}) {
  const quorum = calculateQuorum();

  const statusColor = getStatusColor(meeting.status);
  const colorClasses: Record<string, string> = {
    gray: 'bg-gray-100 text-gray-700',
    yellow: 'bg-yellow-100 text-orange-700',
    blue: 'bg-blue-100 text-blue-700',
    indigo: 'bg-indigo-100 text-indigo-700',
    green: 'bg-green-100 text-green-700',
    orange: 'bg-orange-100 text-orange-700',
    purple: 'bg-purple-100 text-purple-700',
    teal: 'bg-teal-100 text-teal-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    red: 'bg-red-100 text-red-700',
  };

  return (
    <div className="glass-card p-5 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <span className={`px-3 py-1 rounded-lg text-sm font-medium ${colorClasses[statusColor] || colorClasses.gray}`}>
              {getStatusLabel(meeting.status)}
            </span>
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
              {meeting.agendaItems.length} {language === 'ru' ? 'вопросов в повестке' : 'savol kun tartibida'}
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

// Create Meeting Wizard
function CreateMeetingWizard({
  onClose,
  onCreate,
  language,
  user,
  buildings,
}: {
  onClose: () => void;
  onCreate: (data: {
    buildingId: string;
    buildingAddress: string;
    organizerType: MeetingOrganizerType;
    organizerId: string;
    organizerName: string;
    format: MeetingFormat;
    agendaItems: Omit<AgendaItem, 'id' | 'votesFor' | 'votesAgainst' | 'votesAbstain' | 'order'>[];
    location?: string;
    description?: string;
    meetingTime?: string;
  }) => void;
  language: string;
  user: { id: string; name: string; role: string; buildingId?: string } | null;
  buildings: { id: string; name: string; address: string }[];
}) {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCustomItemForm, setShowCustomItemForm] = useState(false);
  const [newCustomItem, setNewCustomItem] = useState<{
    title: string;
    description: string;
    threshold: DecisionThreshold;
    attachments: { name: string; url: string; type: string; size: number }[];
  }>({ title: '', description: '', threshold: 'simple_majority', attachments: [] });
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  // Cascading: branches → buildings
  const [branchesList, setBranchesList] = useState<{ id: string; code: string; name: string }[]>([]);
  const [buildingsForBranch, setBuildingsForBranch] = useState<{ id: string; name: string; address: string; branch_code: string }[]>([]);
  const [selectedBranchCode, setSelectedBranchCode] = useState('');
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [loadingBuildings, setLoadingBuildings] = useState(false);

  const [formData, setFormData] = useState({
    buildingId: '',
    buildingAddress: '',
    organizerType: 'management' as MeetingOrganizerType,
    format: 'online' as MeetingFormat,
    agendaItems: [] as AgendaItemType[],
    customItems: [] as { title: string; description: string; threshold: DecisionThreshold; attachments: { name: string; url: string; type: string; size: number }[] }[],
    location: '',
    onlinePlatform: '' as string,
    onlineLink: '',
    description: '', // Повестка дня
    meetingTime: '19:00',
  });

  const ONLINE_PLATFORMS = [
    { value: 'zoom', label: 'Zoom' },
    { value: 'telegram', label: 'Telegram' },
    { value: 'google_meet', label: 'Google Meet' },
    { value: 'skype', label: 'Skype' },
    { value: 'other', label: language === 'ru' ? 'Другое' : 'Boshqa' },
  ];

  // Load branches on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await branchesApi.getAll();
        if (!cancelled && resp.branches) {
          setBranchesList(resp.branches);
          if (resp.branches.length > 0) {
            setSelectedBranchCode(resp.branches[0].code);
          }
        }
      } catch (e) {
        console.error('Failed to load branches:', e);
      } finally {
        if (!cancelled) setLoadingBranches(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Load buildings when branch changes
  useEffect(() => {
    if (!selectedBranchCode) return;
    let cancelled = false;
    setLoadingBuildings(true);
    (async () => {
      try {
        const resp = await buildingsApi.getAll();
        if (!cancelled && resp.buildings) {
          const filtered = resp.buildings.filter((b: any) => b.branch_code === selectedBranchCode);
          setBuildingsForBranch(filtered);
          // Reset building selection
          setFormData(prev => ({ ...prev, buildingId: '', buildingAddress: '' }));
        }
      } catch (e) {
        console.error('Failed to load buildings:', e);
      } finally {
        if (!cancelled) setLoadingBuildings(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedBranchCode]);

  const handleBranchChange = (code: string) => {
    setSelectedBranchCode(code);
    setFormData(prev => ({ ...prev, buildingId: '', buildingAddress: '' }));
  };

  const handleBuildingChange = (buildingId: string) => {
    const building = buildingsForBranch.find(b => b.id === buildingId);
    setFormData({
      ...formData,
      buildingId,
      buildingAddress: building?.address || '',
    });
  };

  const handleAddAgendaItem = (type: AgendaItemType) => {
    if (formData.agendaItems.includes(type)) {
      setFormData({ ...formData, agendaItems: formData.agendaItems.filter(t => t !== type) });
    } else {
      setFormData({ ...formData, agendaItems: [...formData.agendaItems, type] });
    }
  };

  const handleCreate = async () => {
    // If no specific building selected, use first building in branch (собрание для всего комплекса)
    const effectiveBuildingId = formData.buildingId || (buildingsForBranch.length > 0 ? buildingsForBranch[0].id : '');
    const effectiveBuildingAddress = formData.buildingAddress || (buildingsForBranch.length > 0 ? buildingsForBranch[0].address : '');
    if (!user || !selectedBranchCode || isSubmitting) return;

    setIsSubmitting(true);

    const agendaItems = [
      ...formData.agendaItems.map(type => ({
        type,
        title: language === 'ru' ? AGENDA_ITEM_TYPES[type].label : AGENDA_ITEM_TYPES[type].labelUz,
        description: language === 'ru' ? AGENDA_ITEM_TYPES[type].description : AGENDA_ITEM_TYPES[type].descriptionUz,
        threshold: AGENDA_ITEM_TYPES[type].defaultThreshold,
        materials: [],
      })),
      ...formData.customItems.map(item => ({
        type: 'other' as AgendaItemType,
        title: item.title,
        description: item.description,
        threshold: item.threshold,
        materials: [],
        attachments: item.attachments,
      })),
    ];

    // Build location string with online info
    let locationStr = formData.location || '';
    if ((formData.format === 'online' || formData.format === 'hybrid') && formData.onlinePlatform) {
      const platform = ONLINE_PLATFORMS.find(p => p.value === formData.onlinePlatform)?.label || formData.onlinePlatform;
      const onlineInfo = formData.onlineLink ? `${platform}: ${formData.onlineLink}` : platform;
      locationStr = locationStr ? `${locationStr} | ${onlineInfo}` : onlineInfo;
    }

    try {
      await onCreate({
        buildingId: effectiveBuildingId,
        buildingAddress: effectiveBuildingAddress,
        organizerType: formData.organizerType,
        organizerId: user.id,
        organizerName: user.name,
        format: formData.format,
        agendaItems,
        location: locationStr || undefined,
        description: formData.description || undefined,
        meetingTime: formData.meetingTime || '19:00',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const steps = [
    { num: 1, label: language === 'ru' ? 'Основное' : 'Asosiy' },
    { num: 2, label: language === 'ru' ? 'Вопросы' : 'Masalalar' },
    { num: 3, label: language === 'ru' ? 'Подтверждение' : 'Tasdiqlash' },
  ];

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={language === 'ru' ? 'Назначить собрание' : 'Yig\'ilish tayinlash'}
      size="2xl"
    >
        <p className="text-sm text-gray-500 -mt-2 mb-4">
          {language === 'ru' ? `Шаг ${step} из 3` : `Bosqich ${step} dan 3`}
        </p>

        {/* Progress */}
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            {steps.map((s, i) => (
              <div key={s.num} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step >= s.num ? 'bg-primary-400 text-gray-900' : 'bg-gray-200 text-gray-500'
                }`}>
                  {s.num}
                </div>
                <span className={`ml-2 text-sm ${step >= s.num ? 'text-gray-900' : 'text-gray-500'}`}>
                  {s.label}
                </span>
                {i < steps.length - 1 && (
                  <div className={`w-16 h-1 mx-4 rounded ${step > s.num ? 'bg-primary-400' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {step === 1 && (
            <>
              {/* Cascading: Комплекс → Дом */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {language === 'ru' ? 'Комплекс' : 'Kompleks'} <span className="text-red-500">*</span>
                </label>
                {loadingBranches ? (
                  <div className="flex items-center gap-2 p-3 text-sm text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {language === 'ru' ? 'Загрузка...' : 'Yuklanmoqda...'}
                  </div>
                ) : branchesList.length === 0 ? (
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-sm text-yellow-800">
                    {language === 'ru'
                      ? 'Нет доступных комплексов. Сначала добавьте комплекс в системе.'
                      : 'Mavjud komplekslar yo\'q. Avval tizimda kompleks qo\'shing.'}
                  </div>
                ) : (
                  <select
                    value={selectedBranchCode}
                    onChange={(e) => handleBranchChange(e.target.value)}
                    className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-400 focus:border-primary-400"
                  >
                    {branchesList.map((branch) => (
                      <option key={branch.id} value={branch.code}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {selectedBranchCode && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {language === 'ru' ? 'Дом' : 'Uy'}
                    <span className="text-gray-400 font-normal ml-1 text-xs">
                      ({language === 'ru' ? 'если не выбран — собрание для всего комплекса' : 'tanlanmasa — butun kompleks uchun'})
                    </span>
                  </label>
                  {loadingBuildings ? (
                    <div className="flex items-center gap-2 p-3 text-sm text-gray-500">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {language === 'ru' ? 'Загрузка домов...' : 'Uylar yuklanmoqda...'}
                    </div>
                  ) : buildingsForBranch.length === 0 ? (
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-500">
                      {language === 'ru' ? 'В этом комплексе нет домов' : 'Bu kompleksda uylar yo\'q'}
                    </div>
                  ) : (
                    <select
                      value={formData.buildingId}
                      onChange={(e) => handleBuildingChange(e.target.value)}
                      className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-400 focus:border-primary-400"
                    >
                      <option value="">
                        {language === 'ru' ? '— Весь комплекс —' : '— Butun kompleks —'}
                      </option>
                      {buildingsForBranch.map((building) => (
                        <option key={building.id} value={building.id}>
                          {building.name} — {building.address}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Organizer Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  {language === 'ru' ? 'Организатор' : 'Tashkilotchi'}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setFormData({ ...formData, organizerType: 'management' })}
                    className={`p-4 rounded-xl border-2 transition-colors ${
                      formData.organizerType === 'management'
                        ? 'border-primary-400 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Building2 className="w-6 h-6 mb-2 mx-auto text-gray-600" />
                    <div className="text-sm font-medium">
                      {language === 'ru' ? 'Управляющая компания' : 'Boshqaruv kompaniyasi'}
                    </div>
                  </button>
                  <button
                    onClick={() => setFormData({ ...formData, organizerType: 'resident' })}
                    className={`p-4 rounded-xl border-2 transition-colors ${
                      formData.organizerType === 'resident'
                        ? 'border-primary-400 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <User className="w-6 h-6 mb-2 mx-auto text-gray-600" />
                    <div className="text-sm font-medium">
                      {language === 'ru' ? 'Житель (инициатива)' : 'Aholi (tashabbusi)'}
                    </div>
                  </button>
                </div>
              </div>

              {/* Format */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  {language === 'ru' ? 'Формат проведения' : 'O\'tkazish formati'}
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {(['online', 'offline', 'hybrid'] as MeetingFormat[]).map((format) => (
                    <button
                      key={format}
                      onClick={() => setFormData({ ...formData, format })}
                      className={`p-3 rounded-xl border-2 transition-colors ${
                        formData.format === format
                          ? 'border-primary-400 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="text-sm font-medium">
                        {format === 'online'
                          ? (language === 'ru' ? 'Онлайн' : 'Onlayn')
                          : format === 'offline'
                          ? (language === 'ru' ? 'Очное' : 'Yuzma-yuz')
                          : (language === 'ru' ? 'Смешанное' : 'Aralash')}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Online fields: Platform + Link (for online/hybrid) */}
              {(formData.format === 'online' || formData.format === 'hybrid') && (
                <div className="space-y-3 p-4 rounded-xl bg-blue-50 border border-blue-100">
                  <div className="flex items-center gap-2 mb-1">
                    <Video className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-700">
                      {language === 'ru' ? 'Онлайн-подключение' : 'Onlayn ulanish'}
                    </span>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">
                      {language === 'ru' ? 'Платформа' : 'Platforma'}
                    </label>
                    <select
                      value={formData.onlinePlatform}
                      onChange={(e) => setFormData({ ...formData, onlinePlatform: e.target.value })}
                      className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-400 focus:border-primary-400"
                    >
                      <option value="">{language === 'ru' ? 'Выберите платформу' : 'Platformani tanlang'}</option>
                      {ONLINE_PLATFORMS.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">
                      <div className="flex items-center gap-1">
                        <Link2 className="w-3 h-3" />
                        {language === 'ru' ? 'Ссылка на конференцию' : 'Konferensiya havolasi'}
                      </div>
                    </label>
                    <input
                      type="url"
                      value={formData.onlineLink}
                      onChange={(e) => setFormData({ ...formData, onlineLink: e.target.value })}
                      className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-400 focus:border-primary-400"
                      placeholder="https://zoom.us/j/..."
                    />
                  </div>
                </div>
              )}

              {/* Location (for offline/hybrid) */}
              {(formData.format === 'offline' || formData.format === 'hybrid') && (
                <div className="space-y-2 p-4 rounded-xl bg-green-50 border border-green-100">
                  <div className="flex items-center gap-2 mb-1">
                    <MapPin className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium text-green-700">
                      {language === 'ru' ? 'Очное присутствие' : 'Yuzma-yuz ishtirok'}
                    </span>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">
                      {language === 'ru' ? 'Место проведения' : 'O\'tkazish joyi'}
                    </label>
                    <input
                      type="text"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-400 focus:border-primary-400"
                      placeholder={language === 'ru' ? 'Офис УК, 2 этаж' : 'UK ofisi, 2-qavat'}
                    />
                  </div>
                </div>
              )}

              {/* Meeting Time */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {language === 'ru' ? 'Время проведения' : 'O\'tkazish vaqti'}
                </label>
                <input
                  type="time"
                  value={formData.meetingTime}
                  onChange={(e) => setFormData({ ...formData, meetingTime: e.target.value })}
                  className="glass-input"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {language === 'ru'
                    ? 'Время для всех вариантов дат в голосовании'
                    : 'Ovoz berishdagi barcha sanalar uchun vaqt'}
                </p>
              </div>

              {/* Повестка дня (mandatory) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {language === 'ru' ? 'Повестка дня' : 'Kun tartibi'} <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-gray-400 mb-2">
                  {language === 'ru' ? 'Опишите основные вопросы для обсуждения' : 'Muhokama uchun asosiy masalalarni tavsiflang'}
                </p>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="glass-input min-h-[80px] resize-none"
                  placeholder={language === 'ru'
                    ? 'Например: Утверждение сметы расходов на 2026 год, выбор подрядчика для ремонта крыши...'
                    : 'Masalan: 2026 yil uchun xarajatlar smetasini tasdiqlash, tom ta\'mirlash uchun pudratchi tanlash...'}
                  rows={3}
                />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  {language === 'ru' ? 'Выберите вопросы повестки' : 'Kun tartibi savollarini tanlang'}
                </label>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {(Object.keys(AGENDA_ITEM_TYPES) as AgendaItemType[]).map((type) => {
                    const item = AGENDA_ITEM_TYPES[type];
                    const isSelected = formData.agendaItems.includes(type);

                    return (
                      <button
                        key={type}
                        onClick={() => handleAddAgendaItem(type)}
                        className={`w-full p-4 rounded-xl border-2 text-left transition-colors ${
                          isSelected
                            ? 'border-primary-400 bg-primary-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-medium">
                              {language === 'ru' ? item.label : item.labelUz}
                            </div>
                            <div className="text-sm text-gray-500 mt-1">
                              {language === 'ru' ? item.description : item.descriptionUz}
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                                {language === 'ru'
                                  ? DECISION_THRESHOLD_LABELS[item.defaultThreshold].label
                                  : DECISION_THRESHOLD_LABELS[item.defaultThreshold].labelUz}
                              </span>
                              {item.requiresMaterials && (
                                <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-600">
                                  {language === 'ru' ? 'Нужны материалы' : 'Materiallar kerak'}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                            isSelected ? 'border-primary-400 bg-primary-400' : 'border-gray-300'
                          }`}>
                            {isSelected && <Check className="w-4 h-4 text-gray-900" />}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Items Section */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-gray-700">
                    {language === 'ru' ? 'Свои вопросы' : 'O\'z savollaringiz'}
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowCustomItemForm(true)}
                    className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    {language === 'ru' ? 'Добавить вопрос' : 'Savol qo\'shish'}
                  </button>
                </div>

                {/* Custom Items List */}
                {formData.customItems.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {formData.customItems.map((item, index) => (
                      <div key={index} className="p-3 rounded-xl border-2 border-primary-400 bg-primary-50">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="font-medium">{item.title}</div>
                            {item.description && (
                              <div className="text-sm text-gray-500 mt-1">{item.description}</div>
                            )}
                            <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 mt-2 inline-block">
                              {language === 'ru'
                                ? DECISION_THRESHOLD_LABELS[item.threshold].label
                                : DECISION_THRESHOLD_LABELS[item.threshold].labelUz}
                            </span>
                            {item.attachments && item.attachments.length > 0 && (
                              <div className="flex flex-wrap gap-2 mt-2">
                                {item.attachments.map((att, ai) => (
                                  <div key={ai} className="flex items-center gap-1">
                                    {att.type.startsWith('image/') ? (
                                      <img src={att.url} alt={att.name} className="w-12 h-12 object-cover rounded border border-gray-200" />
                                    ) : (
                                      <div className="flex items-center gap-1 px-2 py-1 bg-white rounded border border-gray-200 text-xs text-gray-600">
                                        <FileText className="w-3 h-3" />
                                        <span className="max-w-[80px] truncate">{att.name}</span>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => setFormData({
                              ...formData,
                              customItems: formData.customItems.filter((_, i) => i !== index)
                            })}
                            className="p-1 text-red-500 hover:bg-red-50 rounded"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Custom Item Form */}
                {showCustomItemForm && (
                  <div className="p-4 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 space-y-3">
                    <input
                      type="text"
                      value={newCustomItem.title}
                      onChange={(e) => setNewCustomItem({ ...newCustomItem, title: e.target.value })}
                      className="glass-input"
                      placeholder={language === 'ru' ? 'Название вопроса *' : 'Savol nomi *'}
                    />
                    <textarea
                      value={newCustomItem.description}
                      onChange={(e) => setNewCustomItem({ ...newCustomItem, description: e.target.value })}
                      className="glass-input min-h-[60px] resize-none"
                      placeholder={language === 'ru' ? 'Описание (необязательно)' : 'Tavsif (ixtiyoriy)'}
                      rows={2}
                    />
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        {language === 'ru' ? 'Порог принятия' : 'Qabul qilish chegarasi'}
                      </label>
                      <select
                        value={newCustomItem.threshold}
                        onChange={(e) => setNewCustomItem({ ...newCustomItem, threshold: e.target.value as DecisionThreshold })}
                        className="glass-input text-sm"
                      >
                        {(Object.keys(DECISION_THRESHOLD_LABELS) as DecisionThreshold[]).map((t) => (
                          <option key={t} value={t}>
                            {language === 'ru' ? DECISION_THRESHOLD_LABELS[t].label : DECISION_THRESHOLD_LABELS[t].labelUz}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Attachments */}
                    <div>
                      <label className="block text-xs text-gray-500 mb-2">
                        {language === 'ru' ? 'Прикреплённые файлы' : 'Ilova qilingan fayllar'}
                      </label>
                      {/* Attached file previews */}
                      {newCustomItem.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {newCustomItem.attachments.map((att, ai) => (
                            <div key={ai} className="relative group">
                              {att.type.startsWith('image/') ? (
                                <div className="relative">
                                  <img src={att.url} alt={att.name} className="w-16 h-16 object-cover rounded border border-gray-200" />
                                  <button
                                    type="button"
                                    onClick={() => setNewCustomItem({
                                      ...newCustomItem,
                                      attachments: newCustomItem.attachments.filter((_, i) => i !== ai)
                                    })}
                                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 pl-2 pr-1 py-1 bg-white rounded-lg border border-gray-200 text-xs text-gray-700">
                                  <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                  <span className="max-w-[100px] truncate">{att.name}</span>
                                  <button
                                    type="button"
                                    onClick={() => setNewCustomItem({
                                      ...newCustomItem,
                                      attachments: newCustomItem.attachments.filter((_, i) => i !== ai)
                                    })}
                                    className="ml-1 text-red-400 hover:text-red-600 flex-shrink-0"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {/* File input button */}
                      <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-300 bg-white text-sm text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors ${uploadingAttachment ? 'opacity-50 pointer-events-none' : ''}`}>
                        {uploadingAttachment ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Paperclip className="w-4 h-4" />
                        )}
                        {language === 'ru' ? 'Прикрепить файл' : 'Fayl biriktirish'}
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*,.pdf,.doc,.docx,.xlsx"
                          disabled={uploadingAttachment}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setUploadingAttachment(true);
                            try {
                              const uploaded = await uploadApi.uploadFile(file);
                              setNewCustomItem(prev => ({
                                ...prev,
                                attachments: [...prev.attachments, uploaded]
                              }));
                            } catch {
                              // fallback: use base64 data URL
                              const reader = new FileReader();
                              reader.onload = (ev) => {
                                const dataUrl = ev.target?.result as string;
                                setNewCustomItem(prev => ({
                                  ...prev,
                                  attachments: [...prev.attachments, {
                                    name: file.name,
                                    url: dataUrl,
                                    type: file.type,
                                    size: file.size,
                                  }]
                                }));
                              };
                              reader.readAsDataURL(file);
                            } finally {
                              setUploadingAttachment(false);
                              e.target.value = '';
                            }
                          }}
                        />
                      </label>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (newCustomItem.title.trim()) {
                            setFormData({
                              ...formData,
                              customItems: [...formData.customItems, { ...newCustomItem }]
                            });
                            setNewCustomItem({ title: '', description: '', threshold: 'simple_majority', attachments: [] });
                            setShowCustomItemForm(false);
                          }
                        }}
                        disabled={!newCustomItem.title.trim() || uploadingAttachment}
                        className="flex-1 py-2 px-4 bg-primary-400 hover:bg-primary-500 text-gray-900 rounded-lg font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {language === 'ru' ? 'Добавить' : 'Qo\'shish'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowCustomItemForm(false);
                          setNewCustomItem({ title: '', description: '', threshold: 'simple_majority', attachments: [] });
                        }}
                        className="py-2 px-4 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium text-sm"
                      >
                        {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {formData.agendaItems.length === 0 && formData.customItems.length === 0 && (
                <p className="text-sm text-red-500">
                  {language === 'ru' ? 'Выберите хотя бы один вопрос или добавьте свой' : 'Kamida bitta savol tanlang yoki o\'zingiznikini qo\'shing'}
                </p>
              )}
            </>
          )}

          {step === 3 && (
            <>
              {/* Summary */}
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-gray-50">
                  <h3 className="font-medium mb-3">
                    {language === 'ru' ? 'Сводка' : 'Xulosa'}
                  </h3>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">{language === 'ru' ? 'Комплекс:' : 'Kompleks:'}</span>
                      <span className="font-medium">
                        {branchesList.find(b => b.code === selectedBranchCode)?.name || '—'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">{language === 'ru' ? 'Дом:' : 'Uy:'}</span>
                      <span className="font-medium">
                        {formData.buildingId
                          ? (buildingsForBranch.find(b => b.id === formData.buildingId)?.name || formData.buildingAddress)
                          : (language === 'ru' ? 'Весь комплекс' : 'Butun kompleks')}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">{language === 'ru' ? 'Формат:' : 'Format:'}</span>
                      <span className="font-medium">
                        {formData.format === 'online'
                          ? (language === 'ru' ? 'Онлайн' : 'Onlayn')
                          : formData.format === 'offline'
                          ? (language === 'ru' ? 'Очное' : 'Yuzma-yuz')
                          : (language === 'ru' ? 'Смешанное' : 'Aralash')}
                      </span>
                    </div>
                    {(formData.format === 'online' || formData.format === 'hybrid') && formData.onlinePlatform && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">{language === 'ru' ? 'Платформа:' : 'Platforma:'}</span>
                        <span className="font-medium">
                          {ONLINE_PLATFORMS.find(p => p.value === formData.onlinePlatform)?.label}
                        </span>
                      </div>
                    )}
                    {(formData.format === 'offline' || formData.format === 'hybrid') && formData.location && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">{language === 'ru' ? 'Место:' : 'Joy:'}</span>
                        <span className="font-medium">{formData.location}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-500">{language === 'ru' ? 'Организатор:' : 'Tashkilotchi:'}</span>
                      <span className="font-medium">
                        {formData.organizerType === 'management'
                          ? (language === 'ru' ? 'УК' : 'UK')
                          : (language === 'ru' ? 'Житель' : 'Aholi')}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">{language === 'ru' ? 'Вопросов:' : 'Savollar:'}</span>
                      <span className="font-medium">{formData.agendaItems.length + formData.customItems.length}</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-blue-50 border border-blue-200">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-700">
                      {language === 'ru'
                        ? 'После публикации жильцам будет отправлено уведомление. Они смогут проголосовать за удобную дату проведения собрания.'
                        : 'Nashrdan so\'ng aholiga bildirishnoma yuboriladi. Ular yig\'ilish uchun qulay sanani tanlashlari mumkin bo\'ladi.'}
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-yellow-50 border border-yellow-200">
                  <h4 className="font-medium mb-2">
                    {language === 'ru' ? 'Повестка дня:' : 'Kun tartibi:'}
                  </h4>
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    {formData.agendaItems.map((type) => (
                      <li key={type}>
                        {language === 'ru'
                          ? AGENDA_ITEM_TYPES[type].label
                          : AGENDA_ITEM_TYPES[type].labelUz}
                      </li>
                    ))}
                    {formData.customItems.map((item, index) => (
                      <li key={`custom-${index}`} className="text-blue-700">
                        {item.title}
                        <span className="text-xs text-gray-500 ml-1">
                          ({language === 'ru' ? 'свой вопрос' : 'o\'z savoli'})
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Повестка дня preview */}
                {formData.description && (
                  <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
                    <h4 className="font-medium mb-2">
                      {language === 'ru' ? 'Повестка дня:' : 'Kun tartibi:'}
                    </h4>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{formData.description}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 flex gap-3">
          {step > 1 && (
            <button
              onClick={() => setStep(step - 1)}
              disabled={isSubmitting}
              className="flex-1 py-3 rounded-xl font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              {language === 'ru' ? 'Назад' : 'Orqaga'}
            </button>
          )}
          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={(step === 1 && (!selectedBranchCode || !formData.description.trim())) || (step === 2 && formData.agendaItems.length === 0 && formData.customItems.length === 0)}
              className="flex-1 py-3 rounded-xl font-medium bg-primary-400 text-gray-900 hover:bg-primary-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {language === 'ru' ? 'Далее' : 'Keyingi'}
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={isSubmitting || !selectedBranchCode}
              className="flex-1 py-3 rounded-xl font-medium bg-primary-400 text-gray-900 hover:bg-primary-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting
                ? (language === 'ru' ? 'Создание...' : 'Yaratilmoqda...')
                : (language === 'ru' ? 'Опубликовать' : 'Nashr qilish')}
            </button>
          )}
        </div>
    </Modal>
  );
}

// Meeting Details Modal
function MeetingDetailsModal({
  meeting,
  onClose,
  language,
  calculateResult,
  calculateQuorum,
}: {
  meeting: Meeting;
  onClose: () => void;
  language: string;
  calculateResult: (meetingId: string, agendaItemId: string) => {
    votesFor: number;
    votesAgainst: number;
    votesAbstain: number;
    totalVotes: number;
    percentFor: number;
    isApproved: boolean;
    thresholdMet: boolean;
  };
  calculateQuorum: () => { participated: number; total: number; percent: number; quorumReached: boolean };
}) {
  const quorum = calculateQuorum();
  const [downloadingProtocol, setDownloadingProtocol] = useState(false);
  const [activeTab, setActiveTab] = useState<'agenda' | 'against'>('agenda');
  const [selectedAgendaItem, setSelectedAgendaItem] = useState<string | null>(null);
  const [againstVotes, setAgainstVotes] = useState<any[]>([]);
  const [loadingAgainstVotes, setLoadingAgainstVotes] = useState(false);
  const [sendingRequest, setSendingRequest] = useState<string | null>(null);
  const [showSendModal, setShowSendModal] = useState<{ voterId: string; voterName: string } | null>(null);
  const [requestReason, setRequestReason] = useState('');
  const [requestMessage, setRequestMessage] = useState('');
  const [reconsiderationStats, setReconsiderationStats] = useState<any>(null);

  const { fetchAgainstVotes, sendReconsiderationRequest, fetchReconsiderationStats } = useMeetingStore();

  // Load against votes when tab or agenda item changes
  useEffect(() => {
    if (activeTab === 'against' && selectedAgendaItem) {
      setLoadingAgainstVotes(true);
      fetchAgainstVotes(meeting.id, selectedAgendaItem).then(votes => {
        setAgainstVotes(votes);
        setLoadingAgainstVotes(false);
      });
    }
  }, [activeTab, selectedAgendaItem, meeting.id, fetchAgainstVotes]);

  // Load stats when on against tab
  useEffect(() => {
    if (activeTab === 'against') {
      fetchReconsiderationStats(meeting.id).then(stats => {
        setReconsiderationStats(stats);
      });
    }
  }, [activeTab, meeting.id, fetchReconsiderationStats]);

  // Auto-select first agenda item when switching to against tab
  useEffect(() => {
    if (activeTab === 'against' && !selectedAgendaItem && meeting.agendaItems.length > 0) {
      setSelectedAgendaItem(meeting.agendaItems[0].id);
    }
  }, [activeTab, selectedAgendaItem, meeting.agendaItems]);

  const handleSendReconsiderationRequest = async () => {
    if (!showSendModal || !selectedAgendaItem || !requestReason) return;

    setSendingRequest(showSendModal.voterId);
    const result = await sendReconsiderationRequest(meeting.id, {
      agendaItemId: selectedAgendaItem,
      residentId: showSendModal.voterId,
      reason: requestReason,
      messageToResident: requestMessage || undefined,
    });

    if (result.success) {
      // Refresh the against votes list
      const votes = await fetchAgainstVotes(meeting.id, selectedAgendaItem);
      setAgainstVotes(votes);
      setShowSendModal(null);
      setRequestReason('');
      setRequestMessage('');
    } else {
      addToast('error', result.error || (language === 'ru' ? 'Ошибка при отправке запроса' : 'So\'rovni yuborishda xatolik'));
    }
    setSendingRequest(null);
  };

  const reasonOptions = [
    { value: 'discussed_personally', label: language === 'ru' ? 'Обсудили лично' : 'Shaxsan muhokama qildik' },
    { value: 'new_information', label: language === 'ru' ? 'Появилась новая информация' : 'Yangi ma\'lumot paydo bo\'ldi' },
    { value: 'clarification_needed', label: language === 'ru' ? 'Требуется уточнение' : 'Aniqlik kiritish kerak' },
    { value: 'other', label: language === 'ru' ? 'Другое' : 'Boshqa' },
  ];

  // Download protocol as DOCX file (official format)
  const handleDownloadProtocol = async () => {
    setDownloadingProtocol(true);
    try {
      // Fetch protocol data from backend
      const response = await fetch(`/api/meetings/${meeting.id}/protocol/data`);

      if (!response.ok) {
        throw new Error('Failed to fetch protocol data');
      }

      const data = await response.json();

      // Generate DOCX using the protocol generator
      await generateProtocolDocx({
        meeting: {
          ...data.meeting,
          buildingAddress: meeting.buildingAddress || data.meeting.building_address,
        },
        agendaItems: data.agendaItems,
        voteRecords: data.voteRecords,
        votesByItem: data.votesByItem,
        protocolHash: data.protocolHash,
      });
    } catch (error) {
      console.error('Failed to download protocol:', error);
      addToast('error', language === 'ru' ? 'Ошибка при скачивании протокола' : 'Bayonnomani yuklashda xato');
    } finally {
      setDownloadingProtocol(false);
    }
  };

  // TODO: migrate to <Modal> component
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[200] p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[90dvh] overflow-y-auto">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-base sm:text-lg md:text-xl font-bold">
              {language === 'ru' ? `Собрание #${meeting.number}` : `Yig'ilish #${meeting.number}`}
            </h2>
            <p className="text-sm text-gray-500">{meeting.buildingAddress}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Download protocol button - show for completed meetings */}
            {['protocol_generated', 'protocol_approved'].includes(meeting.status) && (
              <button
                onClick={handleDownloadProtocol}
                disabled={downloadingProtocol}
                className="flex items-center gap-2 px-4 py-2 bg-teal-500 text-white rounded-xl hover:bg-teal-600 transition-colors disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {downloadingProtocol
                  ? (language === 'ru' ? 'Загрузка...' : 'Yuklanmoqda...')
                  : (language === 'ru' ? 'Скачать протокол' : 'Bayonnomani yuklab olish')}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              aria-label="Закрыть"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Status & Quorum */}
          <div className="flex items-center gap-4 flex-wrap">
            <span className={`px-3 py-1 rounded-lg text-sm font-medium ${
              MEETING_STATUS_LABELS[meeting.status]?.color === 'green' ? 'bg-green-100 text-green-700' :
              MEETING_STATUS_LABELS[meeting.status]?.color === 'blue' ? 'bg-blue-100 text-blue-700' :
              MEETING_STATUS_LABELS[meeting.status]?.color === 'yellow' ? 'bg-yellow-100 text-orange-700' :
              'bg-gray-100 text-gray-700'
            }`}>
              {language === 'ru'
                ? MEETING_STATUS_LABELS[meeting.status]?.label
                : MEETING_STATUS_LABELS[meeting.status]?.labelUz}
            </span>

            {meeting.status !== 'draft' && meeting.status !== 'pending_moderation' && (
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-400" />
                <span className="text-sm">
                  {quorum.participated}/{quorum.total} ({quorum.percent.toFixed(1)}%)
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  quorum.quorumReached ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {quorum.quorumReached
                    ? (language === 'ru' ? 'Кворум' : 'Kvorum')
                    : (language === 'ru' ? 'Нет кворума' : 'Kvorum yo\'q')}
                </span>
              </div>
            )}
          </div>

          {/* Confirmed Date */}
          {meeting.confirmedDateTime && (
            <div className="flex items-center gap-2 text-gray-600">
              <Calendar className="w-5 h-5" />
              <span>
                {new Date(meeting.confirmedDateTime).toLocaleDateString(
                  language === 'ru' ? 'ru-RU' : 'uz-UZ',
                  { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }
                )}
              </span>
            </div>
          )}

          {/* Tabs - show against votes tab only during voting_open */}
          {meeting.status === 'voting_open' && (
            <div className="flex gap-2 border-b border-gray-200">
              <button
                onClick={() => setActiveTab('agenda')}
                className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                  activeTab === 'agenda'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {language === 'ru' ? 'Повестка дня' : 'Kun tartibi'}
              </button>
              <button
                onClick={() => setActiveTab('against')}
                className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors flex items-center gap-2 ${
                  activeTab === 'against'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <ThumbsDown className="w-4 h-4" />
                {language === 'ru' ? 'Голоса против' : 'Qarshi ovozlar'}
              </button>
            </div>
          )}

          {/* Against Votes Tab Content */}
          {activeTab === 'against' && meeting.status === 'voting_open' && (
            <div className="space-y-4">
              {/* Stats summary */}
              {reconsiderationStats && reconsiderationStats.total > 0 && (
                <div className="p-3 bg-blue-50 rounded-xl">
                  <div className="text-sm font-medium text-blue-800 mb-2">
                    {language === 'ru' ? 'Статистика запросов на пересмотр' : 'Qayta ko\'rib chiqish so\'rovlari statistikasi'}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-blue-600">{language === 'ru' ? 'Отправлено:' : 'Yuborildi:'}</span> {reconsiderationStats.total}
                    </div>
                    <div>
                      <span className="text-green-600">{language === 'ru' ? 'Изменили:' : 'O\'zgartirildi:'}</span> {reconsiderationStats.voteChanged}
                    </div>
                    <div>
                      <span className="text-gray-600">{language === 'ru' ? 'Конверсия:' : 'Konversiya:'}</span> {reconsiderationStats.conversionRate}%
                    </div>
                  </div>
                </div>
              )}

              {/* Agenda item selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {language === 'ru' ? 'Выберите вопрос:' : 'Savolni tanlang:'}
                </label>
                <select
                  value={selectedAgendaItem || ''}
                  onChange={(e) => setSelectedAgendaItem(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  {meeting.agendaItems.map((item, index) => (
                    <option key={item.id} value={item.id}>
                      {index + 1}. {item.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Against votes list */}
              {loadingAgainstVotes ? (
                <div className="text-center py-8 text-gray-500">
                  {language === 'ru' ? 'Загрузка...' : 'Yuklanmoqda...'}
                </div>
              ) : againstVotes.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {language === 'ru' ? 'Нет голосов против по этому вопросу' : 'Bu savol bo\'yicha qarshi ovozlar yo\'q'}
                </div>
              ) : (
                <div className="space-y-3">
                  {againstVotes.map((vote) => (
                    <div key={vote.voteId} className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="font-medium">{vote.voterName}</div>
                          <div className="text-sm text-gray-500 flex items-center gap-4">
                            <span>{language === 'ru' ? 'Кв.' : 'Kv.'} {vote.apartmentNumber}</span>
                            <span>{vote.voteWeight} {language === 'ru' ? 'кв.м' : 'kv.m'}</span>
                            {vote.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {vote.phone}
                              </span>
                            )}
                          </div>
                          {vote.comment && (
                            <div className="mt-2 p-2 bg-white rounded-lg text-sm text-gray-600">
                              <MessageSquare className="w-3 h-3 inline mr-1" />
                              {vote.comment}
                            </div>
                          )}
                          {vote.requestCount > 0 && (
                            <div className="mt-2 text-xs text-orange-600">
                              {language === 'ru'
                                ? `Отправлено запросов: ${vote.requestCount}/2`
                                : `Yuborilgan so'rovlar: ${vote.requestCount}/2`}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => setShowSendModal({ voterId: vote.voterId, voterName: vote.voterName })}
                          disabled={!vote.canSendRequest || sendingRequest === vote.voterId}
                          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                            vote.canSendRequest
                              ? 'bg-primary-500 text-white hover:bg-primary-600'
                              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          <Send className="w-4 h-4" />
                          {language === 'ru' ? 'Запросить' : 'So\'rash'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Agenda Items with Results - show when not on against tab or when voting not open */}
          {(activeTab === 'agenda' || meeting.status !== 'voting_open') && (
          <div>
            <h3 className="font-medium mb-3">
              {language === 'ru' ? 'Повестка дня' : 'Kun tartibi'}
            </h3>
            <div className="space-y-4">
              {meeting.agendaItems.map((item, index) => {
                const result = calculateResult(meeting.id, item.id);

                return (
                  <div key={item.id} className="p-4 rounded-xl bg-gray-50 border border-gray-200">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="font-medium">
                          {index + 1}. {item.title}
                        </div>
                        <p className="text-sm text-gray-500 mt-1">{item.description}</p>

                        {/* Agenda item attachments */}
                        {(item as any).attachments && (item as any).attachments.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {(item as any).attachments.map((att: { name: string; url: string; type: string; size: number }, ai: number) => (
                              <div key={ai}>
                                {att.type.startsWith('image/') ? (
                                  <a href={att.url} target="_blank" rel="noopener noreferrer">
                                    <img src={att.url} alt={att.name} className="w-16 h-16 object-cover rounded border border-gray-200 hover:opacity-80 transition-opacity" />
                                  </a>
                                ) : (
                                  <a
                                    href={att.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 px-2 py-1 bg-white rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                                  >
                                    <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                    <span className="max-w-[120px] truncate">{att.name}</span>
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Voting results */}
                        {['voting_open', 'voting_closed', 'results_published', 'protocol_generated', 'protocol_approved'].includes(meeting.status) && (
                          <div className="mt-3 pt-3 border-t border-gray-200">
                            <div className="grid grid-cols-3 gap-2 text-sm">
                              <div className="flex items-center gap-1">
                                <ThumbsUp className="w-4 h-4 text-green-500" />
                                <span>{result.votesFor} ({result.percentFor.toFixed(0)}%)</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <ThumbsDown className="w-4 h-4 text-red-500" />
                                <span>{result.votesAgainst}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Minus className="w-4 h-4 text-gray-400" />
                                <span>{result.votesAbstain}</span>
                              </div>
                            </div>

                            {/* Progress bar */}
                            <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${result.thresholdMet ? 'bg-green-500' : 'bg-red-500'}`}
                                style={{ width: `${result.percentFor}%` }}
                              />
                            </div>

                            {/* Threshold line */}
                            <div className="flex items-center justify-between mt-1 text-xs text-gray-500">
                              <span>0%</span>
                              <span>
                                {language === 'ru' ? 'Порог:' : 'Chegara:'} {DECISION_THRESHOLD_LABELS[item.threshold].percent}%
                              </span>
                              <span>100%</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Result badge */}
                      {item.isApproved !== undefined && (
                        <span className={`px-2 py-1 rounded-lg text-xs font-medium ${
                          item.isApproved ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {item.isApproved
                            ? (language === 'ru' ? 'Принято' : 'Qabul')
                            : (language === 'ru' ? 'Не принято' : 'Rad')}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          )}
        </div>

        {/* Send Reconsideration Request Modal */}
        {/* TODO: migrate to <Modal> component */}
        {showSendModal && (
          <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[200] p-0 sm:p-4">
            <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md p-6">
              <h3 className="text-base sm:text-lg font-bold mb-4">
                {language === 'ru' ? 'Запрос на пересмотр голоса' : 'Ovozni qayta ko\'rib chiqish so\'rovi'}
              </h3>

              <div className="mb-4 p-3 bg-gray-50 rounded-xl">
                <div className="text-sm text-gray-500">
                  {language === 'ru' ? 'Получатель:' : 'Qabul qiluvchi:'}
                </div>
                <div className="font-medium">{showSendModal.voterName}</div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {language === 'ru' ? 'Причина запроса:' : 'So\'rov sababi:'}
                </label>
                <select
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">
                    {language === 'ru' ? 'Выберите причину...' : 'Sababni tanlang...'}
                  </option>
                  {reasonOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {language === 'ru' ? 'Сообщение (необязательно):' : 'Xabar (ixtiyoriy):'}
                </label>
                <textarea
                  value={requestMessage}
                  onChange={(e) => setRequestMessage(e.target.value)}
                  placeholder={language === 'ru' ? 'Личное сообщение жителю...' : 'Aholiga shaxsiy xabar...'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                  rows={3}
                  maxLength={500}
                />
                <div className="text-xs text-gray-400 text-right mt-1">
                  {requestMessage.length}/500
                </div>
              </div>

              <div className="p-3 bg-yellow-50 rounded-xl mb-4 text-sm text-yellow-800">
                <AlertCircle className="w-4 h-4 inline mr-1" />
                {language === 'ru'
                  ? 'Это только просьба. Житель сам решает, менять голос или нет.'
                  : 'Bu faqat iltimos. Aholi ovozni o\'zgartirish yoki o\'zgartirmaslikni o\'zi hal qiladi.'}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowSendModal(null);
                    setRequestReason('');
                    setRequestMessage('');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
                </button>
                <button
                  onClick={handleSendReconsiderationRequest}
                  disabled={!requestReason || !!sendingRequest}
                  className="flex-1 px-4 py-2 bg-primary-500 text-white rounded-xl hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  {sendingRequest
                    ? (language === 'ru' ? 'Отправка...' : 'Yuborilmoqda...')
                    : (language === 'ru' ? 'Отправить' : 'Yuborish')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
