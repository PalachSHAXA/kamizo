import { useState, useEffect, useMemo } from 'react';
import {
  Vote, Calendar, FileText, Users, Building2, CheckCircle, X,
  ThumbsUp, ThumbsDown, Minus, ChevronRight, Loader2, Clock, Trophy, ArrowRight, Key, User,
  MessageSquare, AlertTriangle, RefreshCw
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useMeetingStore } from '../stores/meetingStore';
import { useLanguageStore } from '../stores/languageStore';
import { MEETING_STATUS_LABELS, DECISION_THRESHOLD_LABELS } from '../types';
import type { Meeting, VoteChoice } from '../types';
import { QRSignatureModal } from '../components/QRSignatureModal';

export function ResidentMeetingsPage() {
  const { user } = useAuthStore();
  const {
    meetings,
    fetchMeetings,
    voteForSchedule,
    getScheduleVoteByUser,
    voteOnAgendaItem,
    getVoteByUser,
    getUserVotesForMeeting,
    calculateAgendaItemResult,
    calculateMeetingQuorum,
    fetchMyReconsiderationRequests,
    markReconsiderationRequestViewed,
    ignoreReconsiderationRequest,
  } = useMeetingStore();
  const { language } = useLanguageStore();

  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [showVotingModal, setShowVotingModal] = useState(false);
  const [reconsiderationRequests, setReconsiderationRequests] = useState<any[]>([]);

  // Get selected meeting from store (reactive to changes)
  const selectedMeeting = selectedMeetingId ? meetings.find(m => m.id === selectedMeetingId) || null : null;

  // ✅ OPTIMIZED: Fetch meetings once on mount (empty deps)
  useEffect(() => {
    fetchMeetings();
  }, []); // Empty array - runs only once

  // Fetch reconsideration requests
  useEffect(() => {
    const loadRequests = async () => {
      const requests = await fetchMyReconsiderationRequests();
      setReconsiderationRequests(requests);
    };
    loadRequests();
  }, [fetchMyReconsiderationRequests]);

  // Handle ignoring a reconsideration request
  const handleIgnoreRequest = async (requestId: string) => {
    await ignoreReconsiderationRequest(requestId);
    // Refresh the requests list
    const requests = await fetchMyReconsiderationRequests();
    setReconsiderationRequests(requests);
  };

  // Handle viewing and opening vote modal for a request
  const handleRespondToRequest = async (request: any) => {
    await markReconsiderationRequestViewed(request.id);
    setSelectedMeetingId(request.meetingId);
    setShowVotingModal(true);
    // Refresh requests
    const requests = await fetchMyReconsiderationRequests();
    setReconsiderationRequests(requests);
  };

  // Load user's votes when opening voting modal
  useEffect(() => {
    if (selectedMeetingId && user?.id) {
      getUserVotesForMeeting(selectedMeetingId, user.id);
    }
  }, [selectedMeetingId, user?.id, getUserVotesForMeeting]);

  // ✅ OPTIMIZED: Memoized filtering (no re-computation on every render)
  // ✅ FIX: Filter meetings by user's building - residents should only see meetings for their building
  const activeMeetings = useMemo(() =>
    meetings.filter(m =>
      ['schedule_poll_open', 'voting_open', 'results_published', 'protocol_approved'].includes(m.status) &&
      // Filter by building: only show meetings for user's building
      (!user?.buildingId || m.buildingId === user.buildingId)
    ),
    [meetings, user?.buildingId]
  );

  const votableMeetings = useMemo(() =>
    activeMeetings.filter(m =>
      ['schedule_poll_open', 'voting_open'].includes(m.status)
    ),
    [activeMeetings]
  );

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusStyles = (status: Meeting['status']) => {
    switch (status) {
      case 'schedule_poll_open':
        return { bg: 'bg-blue-50 border-blue-300', badge: 'bg-blue-100 text-blue-700' };
      case 'voting_open':
        return { bg: 'bg-green-50 border-green-300', badge: 'bg-green-100 text-green-700' };
      case 'results_published':
        return { bg: 'bg-purple-50 border-purple-300', badge: 'bg-purple-100 text-purple-700' };
      case 'protocol_approved':
        return { bg: 'bg-emerald-50 border-emerald-300', badge: 'bg-emerald-100 text-emerald-700' };
      default:
        return { bg: 'bg-gray-50 border-gray-300', badge: 'bg-gray-100 text-gray-700' };
    }
  };

  const handleOpenMeeting = (meeting: Meeting) => {
    setSelectedMeetingId(meeting.id);
    setShowVotingModal(true);
  };

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-3">
          <Vote className="w-7 h-7 text-primary-500" />
          {language === 'ru' ? 'Собрания' : 'Yig\'ilishlar'}
        </h1>

        {votableMeetings.length > 0 && (
          <span className="px-3 py-1 rounded-full bg-green-100 text-green-700 text-sm font-medium">
            {votableMeetings.length} {language === 'ru' ? 'активных' : 'faol'}
          </span>
        )}
      </div>

      {/* Reconsideration Requests Banner */}
      {reconsiderationRequests.length > 0 && (
        <div className="space-y-3">
          {reconsiderationRequests.map((request) => (
            <div
              key={request.id}
              className="glass-card p-4 border-2 border-orange-300 bg-orange-50"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 bg-orange-100 rounded-xl">
                  <AlertTriangle className="w-5 h-5 text-orange-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-orange-800 mb-1">
                    {language === 'ru' ? 'Просьба пересмотреть голос' : 'Ovozni qayta ko\'rib chiqish so\'rovi'}
                  </div>
                  <div className="text-sm text-orange-700 mb-2">
                    {language === 'ru' ? 'Вопрос:' : 'Savol:'} {request.agendaItemTitle}
                  </div>
                  {request.messageToResident && (
                    <div className="p-2 bg-white rounded-lg text-sm text-gray-700 mb-2">
                      <MessageSquare className="w-3 h-3 inline mr-1 text-orange-500" />
                      {request.messageToResident}
                    </div>
                  )}
                  <div className="text-xs text-orange-600 mb-3">
                    {language === 'ru'
                      ? 'Это только просьба. Вы сами решаете, менять голос или нет.'
                      : 'Bu faqat iltimos. Ovozni o\'zgartirish yoki o\'zgartirmaslikni o\'zingiz hal qilasiz.'}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRespondToRequest(request);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" />
                      {language === 'ru' ? 'Изменить голос' : 'Ovozni o\'zgartirish'}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleIgnoreRequest(request.id);
                      }}
                      className="flex items-center gap-2 px-4 py-2 border border-orange-300 text-orange-700 rounded-xl text-sm font-medium hover:bg-orange-100 transition-colors"
                    >
                      <X className="w-4 h-4" />
                      {language === 'ru' ? 'Оставить как есть' : 'Shundayligicha qoldirish'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Meetings List */}
      {activeMeetings.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <Vote className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">
            {language === 'ru' ? 'Нет активных собраний' : 'Faol yig\'ilishlar yo\'q'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {activeMeetings.map((meeting) => {
            const styles = getStatusStyles(meeting.status);
            const statusLabel = MEETING_STATUS_LABELS[meeting.status];
            const quorum = calculateMeetingQuorum(meeting.id);
            // Check if user has already voted (is in participatedVoters)
            const hasVoted = user?.id && meeting.participatedVoters?.includes(user.id);
            // Note: scheduleVote will be loaded async in the modal
            const scheduleVote: string | null = null;

            return (
              <div
                key={meeting.id}
                className={`glass-card p-4 border-2 ${styles.bg} cursor-pointer hover:shadow-md transition-all`}
                onClick={() => handleOpenMeeting(meeting)}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${styles.badge}`}>
                        {language === 'ru' ? statusLabel?.label : statusLabel?.labelUz}
                      </span>
                      <span className="text-xs text-gray-500">#{meeting.number}</span>
                      {/* Show "Voted" badge if user has voted */}
                      {hasVoted && meeting.status === 'voting_open' && (
                        <span className="px-2 py-0.5 rounded-lg text-xs font-medium bg-green-100 text-green-700 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          {language === 'ru' ? 'Вы проголосовали' : 'Ovoz berdingiz'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Building2 className="w-4 h-4" />
                      <span className="truncate">{meeting.buildingAddress}</span>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>

                {/* Agenda Summary */}
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                  <FileText className="w-4 h-4" />
                  <span>
                    {meeting.agendaItems.length} {language === 'ru' ? 'вопросов' : 'savol'}
                  </span>
                </div>

                {/* Schedule Poll Info */}
                {meeting.status === 'schedule_poll_open' && (
                  <div className="bg-white/60 rounded-lg p-3 mb-3">
                    <div className="text-sm font-medium mb-2">
                      {language === 'ru' ? 'Голосование за дату' : 'Sana uchun ovoz berish'}
                    </div>
                    <div className="flex items-center gap-2">
                      {scheduleVote ? (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle className="w-4 h-4" />
                          {language === 'ru' ? 'Вы уже проголосовали' : 'Siz ovoz berdingiz'}
                        </span>
                      ) : (
                        <span className="text-xs text-blue-600">
                          {language === 'ru' ? 'Выберите удобную дату' : 'Qulay sanani tanlang'}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Confirmed Date */}
                {meeting.confirmedDateTime && meeting.status !== 'schedule_poll_open' && (
                  <div className="flex items-center gap-2 text-sm bg-white/60 rounded-lg p-3 mb-3">
                    <Calendar className="w-4 h-4 text-green-500" />
                    <span className="font-medium">{formatDate(meeting.confirmedDateTime)}</span>
                  </div>
                )}

                {/* Thank you message if already voted */}
                {hasVoted && meeting.status === 'voting_open' && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      <div>
                        <p className="text-sm font-medium text-green-800">
                          {language === 'ru' ? 'Спасибо за участие!' : 'Ishtirok uchun rahmat!'}
                        </p>
                        <p className="text-xs text-green-600">
                          {language === 'ru' ? 'Ваш голос учтён' : 'Ovozingiz hisobga olindi'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Voting Call to Action - show only if not voted yet */}
                {meeting.status === 'voting_open' && !hasVoted && (
                  <div
                    className="w-full py-3 px-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform touch-manipulation"
                    style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                  >
                    <Vote className="w-5 h-5" />
                    {language === 'ru' ? 'Проголосовать' : 'Ovoz berish'}
                  </div>
                )}

                {/* View Details button if already voted */}
                {meeting.status === 'voting_open' && hasVoted && (
                  <div className="w-full py-3 px-4 rounded-xl font-medium bg-gray-100 text-gray-700 flex items-center justify-center gap-2">
                    <ChevronRight className="w-5 h-5" />
                    {language === 'ru' ? 'Посмотреть детали' : 'Tafsilotlarni ko\'rish'}
                  </div>
                )}

                {/* Quorum Info */}
                {['voting_open', 'results_published', 'protocol_approved'].includes(meeting.status) && (
                  <div className="flex items-center justify-between text-sm mt-3 pt-3 border-t border-gray-200/50">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-gray-400" />
                      <span>{quorum.participated}/{quorum.total} ({quorum.percent.toFixed(0)}%)</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      quorum.quorumReached ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {quorum.quorumReached
                        ? (language === 'ru' ? 'Кворум есть' : 'Kvorum bor')
                        : (language === 'ru' ? 'Нет кворума' : 'Kvorum yo\'q')}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Voting Modal */}
      {showVotingModal && selectedMeeting && user && (
        <MeetingVotingModal
          meeting={selectedMeeting}
          language={language}
          user={user}
          onClose={() => {
            setShowVotingModal(false);
            setSelectedMeetingId(null);
          }}
          getVote={(agendaItemId) => {
            const vote = getVoteByUser(selectedMeeting.id, agendaItemId, user.id);
            if (vote && vote.choice !== 'schedule') {
              return { choice: vote.choice as VoteChoice };
            }
            return undefined;
          }}
          onVote={(agendaItemId, choice, verified, comment) =>
            voteOnAgendaItem(selectedMeeting.id, agendaItemId, user.id, user.name, choice, {
              method: 'e_signature',
              otpVerified: verified,
            }, comment)
          }
          getScheduleVote={() => getScheduleVoteByUser(selectedMeeting.id)}
          onScheduleVote={(optionId) => voteForSchedule(selectedMeeting.id, optionId)}
          calculateResult={(agendaItemId) => calculateAgendaItemResult(selectedMeeting.id, agendaItemId)}
          calculateQuorum={() => calculateMeetingQuorum(selectedMeeting.id)}
        />
      )}
    </div>
  );
}

// Meeting Voting Modal Component
function MeetingVotingModal({
  meeting,
  language,
  user,
  onClose,
  getVote,
  onVote,
  getScheduleVote,
  onScheduleVote,
  calculateResult,
  calculateQuorum,
}: {
  meeting: Meeting;
  language: string;
  user: { id: string; name: string; login?: string; address?: string; apartment?: string; phone?: string; contractNumber?: string };
  onClose: () => void;
  getVote: (agendaItemId: string) => { choice: VoteChoice } | undefined;
  onVote: (agendaItemId: string, choice: VoteChoice, verified: boolean, comment?: string) => void;
  getScheduleVote: () => Promise<string | null>;
  onScheduleVote: (optionId: string) => Promise<{ success: boolean; error?: string }>;
  calculateResult: (agendaItemId: string) => {
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
  // Track pending votes for all agenda items (before submission)
  const [pendingVotes, setPendingVotes] = useState<Record<string, VoteChoice>>({});
  // Track comments for each agenda item vote
  const [pendingComments, setPendingComments] = useState<Record<string, string>>({});
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedScheduleOption, setSelectedScheduleOption] = useState<string | null>(null);
  const [scheduleVoteLoading, setScheduleVoteLoading] = useState(false);
  const [scheduleVoteSuccess, setScheduleVoteSuccess] = useState(false);
  const [previousVote, setPreviousVote] = useState<string | null>(null);
  const [votesSubmitted, setVotesSubmitted] = useState(false);

  // Load schedule vote on mount
  useEffect(() => {
    getScheduleVote().then(vote => {
      setSelectedScheduleOption(vote);
      setPreviousVote(vote);
    });
  }, [getScheduleVote]);

  // Check if user has already voted on all items
  const hasVotedOnAll = meeting.agendaItems.every(item => getVote(item.id) !== undefined);

  const quorum = calculateQuorum();
  const isVotingOpen = meeting.status === 'voting_open';
  const isSchedulePoll = meeting.status === 'schedule_poll_open';
  const showResults = ['voting_closed', 'results_published', 'protocol_generated', 'protocol_approved'].includes(meeting.status);

  // Handle selecting a vote for an agenda item (just stores locally, doesn't submit)
  const handleVoteClick = (agendaItemId: string, choice: VoteChoice) => {
    setPendingVotes(prev => ({
      ...prev,
      [agendaItemId]: choice
    }));
  };

  // Check if all agenda items have a vote (either pending or already submitted)
  const allItemsVoted = meeting.agendaItems.every(item =>
    pendingVotes[item.id] || getVote(item.id)
  );

  // Count how many items have votes
  const votedItemsCount = meeting.agendaItems.filter(item =>
    pendingVotes[item.id] || getVote(item.id)
  ).length;

  // Handle confirmation click - opens signature modal
  const handleConfirmAllVotes = () => {
    if (Object.keys(pendingVotes).length === 0) return;
    setShowSignatureModal(true);
  };

  // After signature verified, submit all pending votes with comments
  const handleSignatureVerified = async () => {
    setShowSignatureModal(false);
    setIsSubmitting(true);

    try {
      // Submit all pending votes with their comments
      for (const [agendaItemId, choice] of Object.entries(pendingVotes)) {
        const comment = pendingComments[agendaItemId]?.trim() || undefined;
        await onVote(agendaItemId, choice, true, comment);
      }
      setPendingVotes({});
      setPendingComments({});
      setVotesSubmitted(true);
    } catch (error: any) {
      console.error('Failed to submit votes:', error);
      const errorMessage = error?.message || 'Ошибка при голосовании. Проверьте что указана площадь квартиры.';
      alert(errorMessage);
      setVotesSubmitted(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleScheduleVote = async (optionId: string) => {
    // Don't allow if already voted (one vote only, no re-voting)
    if (previousVote) return;

    // Don't do anything if clicking the same option
    if (optionId === selectedScheduleOption) return;

    setScheduleVoteLoading(true);
    setScheduleVoteSuccess(false);

    try {
      const result = await onScheduleVote(optionId);

      if (result && !result.success) {
        // Show error message if vote failed
        const errorMsg = result.error || 'Ошибка при голосовании. Проверьте что указана площадь квартиры.';
        alert(errorMsg);
        setSelectedScheduleOption('');

        // If meeting not found, close modal and refresh
        if (errorMsg.includes('не найдено')) {
          onClose();
          window.location.reload();
        }
      } else {
        // Vote successful
        setSelectedScheduleOption(optionId);
        setScheduleVoteSuccess(true);

        // After successful vote, set previousVote to lock further voting
        // Use setTimeout to show the success message briefly first
        setTimeout(() => {
          setPreviousVote(optionId);
          setScheduleVoteSuccess(false);
        }, 2000);
      }
    } catch (error: any) {
      console.error('Failed to vote:', error);
      const errorMessage = error?.message || 'Ошибка при голосовании. Проверьте что указана площадь квартиры.';
      alert(errorMessage);
      setSelectedScheduleOption('');

      // If meeting not found, close modal and refresh
      if (errorMessage.includes('не найдено')) {
        onClose();
        window.location.reload();
      }
    } finally {
      setScheduleVoteLoading(false);
    }
  };

  // Calculate total votes and find leading option (use voteCount for proper counting)
  const totalScheduleVotes = meeting.scheduleOptions.reduce((sum, opt) => sum + ((opt as any).voteCount ?? opt.votes?.length ?? 0), 0);
  const maxVotes = Math.max(...meeting.scheduleOptions.map(opt => (opt as any).voteCount ?? opt.votes?.length ?? 0));
  const leadingOptions = meeting.scheduleOptions.filter(opt => ((opt as any).voteCount ?? opt.votes?.length ?? 0) === maxVotes && maxVotes > 0);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatShortDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center">
      <div className="max-h-[85vh] md:max-h-[90vh] w-full md:max-w-lg md:mx-4 bg-white rounded-t-2xl md:rounded-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 md:slide-in-from-bottom-0 duration-200">
        {/* Header - more compact */}
        <div className="flex items-center justify-between p-3 border-b border-gray-100 bg-white sticky top-0 z-10">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold truncate">
                {language === 'ru' ? `Собрание #${meeting.number}` : `Yig'ilish #${meeting.number}`}
              </h2>
              <span className={`px-2 py-0.5 rounded-lg text-xs font-medium flex-shrink-0 ${
                MEETING_STATUS_LABELS[meeting.status]?.color === 'green' ? 'bg-green-100 text-green-700' :
                MEETING_STATUS_LABELS[meeting.status]?.color === 'blue' ? 'bg-blue-100 text-blue-700' :
                'bg-gray-100 text-gray-700'
              }`}>
                {language === 'ru' ? MEETING_STATUS_LABELS[meeting.status]?.label : MEETING_STATUS_LABELS[meeting.status]?.labelUz}
              </span>
            </div>
            <p className="text-xs text-gray-500 truncate">{meeting.buildingAddress}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 active:bg-gray-200 rounded-xl transition-colors touch-manipulation ml-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* Quorum Info - compact */}
          <div className="flex items-center justify-between bg-gray-50 rounded-xl p-2.5">
            <div className="flex items-center gap-2 text-sm">
              <User className="w-4 h-4 text-gray-400" />
              <span className="text-gray-600">{language === 'ru' ? 'Участие:' : 'Ishtirok:'}</span>
              <span className="font-medium">{quorum.participated}/{quorum.total}</span>
              <span className="text-gray-400">({quorum.percent.toFixed(0)}%)</span>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              quorum.quorumReached ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
            }`}>
              {quorum.quorumReached
                ? (language === 'ru' ? 'Кворум есть' : 'Kvorum bor')
                : (language === 'ru' ? 'Нет кворума' : 'Kvorum yo\'q')
              }
            </span>
          </div>

          {/* Schedule Poll */}
          {isSchedulePoll && (
            <div className="space-y-4">
              {/* Header with deadline */}
              <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-4 text-white">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    {language === 'ru' ? 'Голосование за дату' : 'Sana uchun ovoz berish'}
                  </h3>
                  {totalScheduleVotes > 0 && (
                    <span className="bg-white/20 px-3 py-1 rounded-full text-sm">
                      {totalScheduleVotes} {language === 'ru' ? 'голосов' : 'ovoz'}
                    </span>
                  )}
                </div>
                {meeting.schedulePollEndsAt && (
                  <div className="flex items-center gap-2 text-blue-100 text-sm">
                    <Clock className="w-4 h-4" />
                    {language === 'ru' ? 'Завершится: ' : 'Tugaydi: '}
                    {new Date(meeting.schedulePollEndsAt).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', {
                      day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit'
                    })}
                  </div>
                )}
              </div>

              {/* Instructions - only if not voted yet */}
              {!previousVote && !selectedScheduleOption && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-sm text-amber-700 flex items-center gap-2">
                    <ArrowRight className="w-4 h-4 flex-shrink-0" />
                    {language === 'ru'
                      ? 'Нажмите на удобную для вас дату, чтобы проголосовать'
                      : 'Qulay sanani bosing ovoz berish uchun'}
                  </p>
                </div>
              )}

              {/* Already voted indicator */}
              {previousVote && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                      <CheckCircle className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium text-green-700">
                        {language === 'ru' ? 'Вы уже проголосовали!' : 'Siz allaqachon ovoz berdingiz!'}
                      </p>
                      <p className="text-sm text-green-600">
                        {language === 'ru'
                          ? 'Ваш голос учтён. Ожидайте подтверждения даты администратором.'
                          : 'Ovozingiz hisobga olindi. Administrator sanani tasdiqlaguncha kuting.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Vote options */}
              <div className="space-y-3">
                {meeting.scheduleOptions.map((option, index) => {
                  const isSelected = selectedScheduleOption === option.id;
                  const isLeading = leadingOptions.some(lo => lo.id === option.id);
                  const optionVoteCount = (option as any).voteCount ?? option.votes?.length ?? 0;
                  const votePercent = totalScheduleVotes > 0 ? (optionVoteCount / totalScheduleVotes) * 100 : 0;

                  // Disable voting if already voted (previousVote exists)
                  const alreadyVoted = !!previousVote;

                  return (
                    <div
                      key={option.id}
                      onClick={() => !alreadyVoted && !scheduleVoteLoading && handleScheduleVote(option.id)}
                      className={`w-full p-4 rounded-xl border-2 text-left transition-all relative overflow-hidden ${
                        isSelected
                          ? 'border-green-500 bg-green-50 shadow-md'
                          : alreadyVoted
                            ? 'border-gray-200 bg-gray-50 cursor-default'
                            : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 bg-white cursor-pointer'
                      } ${scheduleVoteLoading ? 'opacity-70 pointer-events-none' : ''}`}
                    >
                      {/* Progress bar background */}
                      {totalScheduleVotes > 0 && (
                        <div
                          className={`absolute inset-0 transition-all ${
                            isSelected ? 'bg-green-100' : 'bg-blue-50'
                          }`}
                          style={{ width: `${votePercent}%` }}
                        />
                      )}

                      <div className="relative flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {/* Option number or checkmark */}
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                            isSelected
                              ? 'bg-green-500 text-white'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {isSelected ? <CheckCircle className="w-5 h-5" /> : index + 1}
                          </div>

                          <div>
                            <div className="font-medium text-gray-900">
                              {formatShortDate(option.dateTime)}
                            </div>
                            {isLeading && !isSelected && option.votes.length > 0 && (
                              <div className="flex items-center gap-1 text-xs text-amber-600 mt-0.5">
                                <Trophy className="w-3 h-3" />
                                {language === 'ru' ? 'Лидирует' : 'Yetakchi'}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {/* Vote count with percentage */}
                          <div className="text-right">
                            <div className={`font-semibold ${isSelected ? 'text-green-700' : 'text-gray-700'}`}>
                              {optionVoteCount}
                            </div>
                            {totalScheduleVotes > 0 && (
                              <div className="text-xs text-gray-500">
                                {votePercent.toFixed(0)}%
                              </div>
                            )}
                          </div>

                          {/* Loading indicator */}
                          {scheduleVoteLoading && isSelected && (
                            <Loader2 className="w-5 h-5 text-green-500 animate-spin" />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Success message - only show on first vote, then previousVote gets set and the "already voted" indicator is shown instead */}
              {scheduleVoteSuccess && !previousVote && (
                <div className="bg-green-100 border border-green-300 rounded-xl p-4 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                      <CheckCircle className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <div className="font-semibold text-green-800">
                        {language === 'ru' ? 'Голос принят!' : 'Ovoz qabul qilindi!'}
                      </div>
                      <p className="text-sm text-green-600">
                        {language === 'ru'
                          ? 'Ваш выбор зарегистрирован. После завершения опроса будет выбрана дата с максимальным числом голосов.'
                          : 'Tanlovingiz ro\'yxatga olindi. So\'rovnoma tugagandan so\'ng eng ko\'p ovoz olgan sana tanlanadi.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Current vote status - only shown briefly after first voting, then previousVote gets set */}
              {selectedScheduleOption && !scheduleVoteSuccess && !previousVote && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-medium text-blue-800">
                        {language === 'ru' ? 'Ваш голос учтён' : 'Ovozingiz hisobga olindi'}
                      </div>
                      <p className="text-sm text-blue-600 mt-1">
                        {language === 'ru'
                          ? 'После завершения опроса будет выбрана дата с максимальным числом голосов.'
                          : 'So\'rovnoma tugagach, eng ko\'p ovoz olgan sana tanlanadi.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Meeting Timeline */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
            <h3 className="font-medium mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              {language === 'ru' ? 'Этапы собрания' : 'Yig\'ilish bosqichlari'}
            </h3>
            <div className="space-y-3">
              {[
                { status: 'schedule_poll_open', label: language === 'ru' ? 'Опрос по дате' : 'Sana so\'rovi', labelUz: 'Sana so\'rovi' },
                { status: 'schedule_confirmed', label: language === 'ru' ? 'Дата подтверждена' : 'Sana tasdiqlandi', labelUz: 'Sana tasdiqlandi' },
                { status: 'voting_open', label: language === 'ru' ? 'Голосование' : 'Ovoz berish', labelUz: 'Ovoz berish' },
                { status: 'voting_closed', label: language === 'ru' ? 'Подсчёт голосов' : 'Ovozlar sanash', labelUz: 'Ovozlar sanash' },
                { status: 'results_published', label: language === 'ru' ? 'Результаты' : 'Natijalar', labelUz: 'Natijalar' },
                { status: 'protocol_approved', label: language === 'ru' ? 'Протокол' : 'Bayonnoma', labelUz: 'Bayonnoma' },
              ].map((step, index) => {
                const statusOrder = ['schedule_poll_open', 'schedule_confirmed', 'voting_open', 'voting_closed', 'results_published', 'protocol_approved'];
                const currentIndex = statusOrder.indexOf(meeting.status);
                const stepIndex = statusOrder.indexOf(step.status);
                const isCompleted = stepIndex < currentIndex;
                const isCurrent = step.status === meeting.status;

                return (
                  <div key={step.status} className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      isCompleted ? 'bg-green-500 text-white' :
                      isCurrent ? 'bg-blue-500 text-white' :
                      'bg-gray-200 text-gray-500'
                    }`}>
                      {isCompleted ? <CheckCircle className="w-4 h-4" /> : index + 1}
                    </div>
                    <span className={`text-sm ${
                      isCompleted ? 'text-green-700' :
                      isCurrent ? 'text-blue-700 font-medium' :
                      'text-gray-400'
                    }`}>
                      {step.label}
                    </span>
                    {isCurrent && (
                      <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                        {language === 'ru' ? 'Сейчас' : 'Hozir'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Confirmed Date */}
          {meeting.confirmedDateTime && !isSchedulePoll && (
            <div className="flex items-center gap-2 text-sm bg-gray-50 rounded-lg p-3">
              <Calendar className="w-4 h-4 text-gray-500" />
              <span>{formatDate(meeting.confirmedDateTime)}</span>
            </div>
          )}

          {/* Voting Instructions */}
          {isVotingOpen && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <Key className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-700">
                  {language === 'ru'
                    ? 'Для подтверждения голоса используется ваш уникальный электронный ключ. Это защищает от подделки голосов.'
                    : 'Ovozni tasdiqlash uchun sizning noyob elektron kalitingiz ishlatiladi. Bu ovozlarni soxtalashtirish oldini oladi.'}
                </div>
              </div>
            </div>
          )}

          {/* Agenda Items */}
          {(isVotingOpen || showResults) && (
            <div className="space-y-4">
              <h3 className="font-medium">
                {language === 'ru' ? 'Повестка дня' : 'Kun tartibi'}
              </h3>

              {meeting.agendaItems.map((item, index) => {
                const existingVote = getVote(item.id);
                const result = calculateResult(item.id);

                return (
                  <div key={item.id} className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                    <div className="mb-3">
                      <div className="font-medium text-base">
                        {index + 1}. {item.title}
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-600">
                          {language === 'ru'
                            ? DECISION_THRESHOLD_LABELS[item.threshold]?.label
                            : DECISION_THRESHOLD_LABELS[item.threshold]?.labelUz}
                        </span>
                      </div>
                    </div>

                    {/* Voting Buttons */}
                    {isVotingOpen && !hasVotedOnAll && (
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        {/* Get current selection: pendingVotes first, then existingVote */}
                        {(() => {
                          const currentChoice = pendingVotes[item.id] || existingVote?.choice;
                          return (
                            <>
                              <button
                                onClick={() => handleVoteClick(item.id, 'for')}
                                disabled={isSubmitting}
                                className={`py-3 px-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all ${
                                  currentChoice === 'for'
                                    ? 'bg-green-500 text-white ring-2 ring-green-300'
                                    : 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 active:bg-green-200'
                                }`}
                              >
                                <ThumbsUp className="w-4 h-4" />
                                {language === 'ru' ? 'За' : 'Ha'}
                              </button>
                              <button
                                onClick={() => handleVoteClick(item.id, 'against')}
                                disabled={isSubmitting}
                                className={`py-3 px-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all ${
                                  currentChoice === 'against'
                                    ? 'bg-red-500 text-white ring-2 ring-red-300'
                                    : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 active:bg-red-200'
                                }`}
                              >
                                <ThumbsDown className="w-4 h-4" />
                                {language === 'ru' ? 'Против' : 'Yo\'q'}
                              </button>
                              <button
                                onClick={() => handleVoteClick(item.id, 'abstain')}
                                disabled={isSubmitting}
                                className={`py-3 px-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all ${
                                  currentChoice === 'abstain'
                                    ? 'bg-gray-500 text-white ring-2 ring-gray-300'
                                    : 'bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 active:bg-gray-200'
                                }`}
                              >
                                <Minus className="w-4 h-4" />
                                {language === 'ru' ? 'Воздерж.' : 'Betaraf'}
                              </button>
                            </>
                          );
                        })()}
                      </div>
                    )}

                    {/* Comment input - show when vote is selected but not yet submitted */}
                    {isVotingOpen && !hasVotedOnAll && pendingVotes[item.id] && (
                      <div className="mb-3">
                        <label className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                          <MessageSquare className="w-3 h-3" />
                          {language === 'ru' ? 'Обоснование (будет в протоколе)' : 'Asoslash (bayonnomada bo\'ladi)'}
                        </label>
                        <textarea
                          value={pendingComments[item.id] || ''}
                          onChange={(e) => setPendingComments(prev => ({ ...prev, [item.id]: e.target.value }))}
                          placeholder={language === 'ru' ? 'Почему вы так проголосовали? (необязательно)' : 'Nima uchun shunday ovoz berdingiz? (ixtiyoriy)'}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
                          rows={2}
                          maxLength={500}
                        />
                        <div className="flex justify-between items-center mt-1">
                          <span className="text-[10px] text-gray-400">
                            {language === 'ru' ? 'Будет виден в протоколе собрания' : 'Yig\'ilish bayonnomasida ko\'rinadi'}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {(pendingComments[item.id] || '').length}/500
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Your Vote Indicator - show for submitted votes or pending selection */}
                    {(() => {
                      const currentChoice = existingVote?.choice || pendingVotes[item.id];
                      const isSubmitted = !!existingVote;
                      if (!currentChoice) return null;
                      return (
                        <div className={`text-sm font-medium flex items-center gap-2 mb-2 ${
                          currentChoice === 'for' ? 'text-green-600' :
                          currentChoice === 'against' ? 'text-red-600' : 'text-gray-600'
                        }`}>
                          {isSubmitted ? (
                            <CheckCircle className="w-4 h-4" />
                          ) : (
                            <span className="w-4 h-4 rounded-full border-2 border-current" />
                          )}
                          {isSubmitted
                            ? (language === 'ru' ? 'Ваш голос: ' : 'Sizning ovozingiz: ')
                            : (language === 'ru' ? 'Выбрано: ' : 'Tanlangan: ')
                          }
                          {currentChoice === 'for' ? (language === 'ru' ? 'За' : 'Ha') :
                           currentChoice === 'against' ? (language === 'ru' ? 'Против' : 'Yo\'q') :
                           (language === 'ru' ? 'Воздержался' : 'Betaraf')}
                          {!isSubmitted && (
                            <span className="text-xs text-gray-400 ml-1">
                              ({language === 'ru' ? 'не подтверждено' : 'tasdiqlanmagan'})
                            </span>
                          )}
                        </div>
                      );
                    })()}

                    {/* Results */}
                    {(showResults || (isVotingOpen && meeting.votingSettings?.showIntermediateResults)) && (
                      <div className="pt-3 border-t border-gray-200">
                        <div className="grid grid-cols-3 gap-2 text-sm mb-2">
                          <div className="flex items-center gap-1 text-green-600">
                            <ThumbsUp className="w-4 h-4" />
                            <span>{result.votesFor} ({result.percentFor.toFixed(0)}%)</span>
                          </div>
                          <div className="flex items-center gap-1 text-red-600">
                            <ThumbsDown className="w-4 h-4" />
                            <span>{result.votesAgainst}</span>
                          </div>
                          <div className="flex items-center gap-1 text-gray-600">
                            <Minus className="w-4 h-4" />
                            <span>{result.votesAbstain}</span>
                          </div>
                        </div>

                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${result.thresholdMet ? 'bg-green-500' : 'bg-red-500'}`}
                            style={{ width: `${result.percentFor}%` }}
                          />
                        </div>

                        {showResults && item.isApproved !== undefined && (
                          <div className={`mt-2 px-3 py-1 rounded-lg text-sm font-medium inline-flex items-center gap-1 ${
                            item.isApproved ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {item.isApproved
                              ? (language === 'ru' ? 'Принято' : 'Qabul qilindi')
                              : (language === 'ru' ? 'Не принято' : 'Rad etildi')}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-gray-100 bg-white safe-area-bottom space-y-2">
          {/* Show confirm button when voting is open and there are pending votes */}
          {isVotingOpen && !hasVotedOnAll && Object.keys(pendingVotes).length > 0 && (
            <div className="space-y-2">
              {/* Progress indicator */}
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">
                    {language === 'ru' ? 'Отвечено:' : 'Javob berildi:'}
                  </span>
                </div>
                <span className="font-medium">
                  {votedItemsCount}/{meeting.agendaItems.length}
                  <span className="text-gray-400 ml-1">
                    ({Math.round((votedItemsCount / meeting.agendaItems.length) * 100)}%)
                  </span>
                </span>
                {!quorum.quorumReached && (
                  <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                    {language === 'ru' ? 'Нет кворума' : 'Kvorum yo\'q'}
                  </span>
                )}
              </div>

              {/* Confirm button */}
              <button
                onClick={handleConfirmAllVotes}
                disabled={isSubmitting || Object.keys(pendingVotes).length === 0}
                className="w-full py-3 px-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform touch-manipulation disabled:opacity-50"
                style={{ background: allItemsVoted ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #3b82f6, #1d4ed8)' }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {language === 'ru' ? 'Отправка...' : 'Yuborilmoqda...'}
                  </>
                ) : (
                  <>
                    <Key className="w-5 h-5" />
                    {allItemsVoted
                      ? (language === 'ru' ? 'Подписать и отправить все голоса' : 'Imzolash va barcha ovozlarni yuborish')
                      : (language === 'ru' ? `Подтвердить ${Object.keys(pendingVotes).length} голос(ов)` : `${Object.keys(pendingVotes).length} ta ovozni tasdiqlash`)
                    }
                  </>
                )}
              </button>
            </div>
          )}

          {/* Show success message after voting */}
          {(votesSubmitted || hasVotedOnAll) && isVotingOpen && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <div>
                  <p className="text-sm font-medium text-green-800">
                    {language === 'ru' ? 'Спасибо за участие!' : 'Ishtirok uchun rahmat!'}
                  </p>
                  <p className="text-xs text-green-600">
                    {language === 'ru' ? 'Все ваши голоса учтены' : 'Barcha ovozlaringiz hisobga olindi'}
                  </p>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={onClose}
            className="w-full py-3 px-4 rounded-xl font-medium bg-gray-100 hover:bg-gray-200 active:bg-gray-300 transition-colors touch-manipulation"
          >
            {language === 'ru' ? 'Закрыть' : 'Yopish'}
          </button>
        </div>
      </div>

      {/* QR Signature Verification Modal */}
      <QRSignatureModal
        isOpen={showSignatureModal}
        onClose={() => setShowSignatureModal(false)}
        onVerified={handleSignatureVerified}
        user={user}
        language={language}
        title={language === 'ru' ? 'Подтверждение голосов' : 'Ovozlarni tasdiqlash'}
        description={language === 'ru'
          ? `Подтвердите, что все ${Object.keys(pendingVotes).length} голос(ов) поданы вами лично. Нажмите "Подтвердить" для подписи электронным ключом.`
          : `Barcha ${Object.keys(pendingVotes).length} ta ovoz sizning tomoningizdan berilganligini tasdiqlang. Elektron kalit bilan imzolash uchun "Tasdiqlash" tugmasini bosing.`
        }
      />
    </div>
  );
}
