import { useState, useMemo, useEffect } from 'react';
import { Plus, CalendarDays } from 'lucide-react';
import { EmptyState } from '../components/common';
import { PageSkeleton } from '../components/PageSkeleton';
import { useAuthStore } from '../stores/authStore';
import { useMeetingStore } from '../stores/meetingStore';
import { useLanguageStore } from '../stores/languageStore';
import { useCRMStore } from '../stores/crmStore';
import type { Meeting, MeetingStatus } from '../types';
import { MEETING_STATUS_LABELS } from '../types';
import { MeetingCard } from './MeetingCard';
import { CreateMeetingWizard } from './MeetingCreateModal';
import { MeetingDetailsModal } from './MeetingDetailsModal';

export function MeetingsPage() {
  const { user } = useAuthStore();
  const { t, language } = useLanguageStore();
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
