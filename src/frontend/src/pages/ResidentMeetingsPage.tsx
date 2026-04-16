import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Vote, Calendar, CalendarDays, FileText, Users, Building2, CheckCircle, X,
  ThumbsUp, ThumbsDown, Minus, ChevronRight, Loader2, Clock, Trophy, ArrowRight, Key, User,
  MessageSquare, AlertTriangle, RefreshCw
} from 'lucide-react';
import { EmptyState } from '../components/common';
import { plural, pluralWithCount } from '../utils/plural';
import { useAuthStore } from '../stores/authStore';
import { useMeetingStore } from '../stores/meetingStore';
import { useLanguageStore } from '../stores/languageStore';
import { useToastStore } from '../stores/toastStore';
import { MEETING_STATUS_LABELS, DECISION_THRESHOLD_LABELS } from '../types';
import type { Meeting, VoteChoice } from '../types';
import { QRSignatureModal } from '../components/QRSignatureModal';

export function ResidentMeetingsPage() {
  const { user } = useAuthStore();
  const addToast = useToastStore(s => s.addToast);
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
  const [allowRevote, setAllowRevote] = useState(false); // Allow changing vote when responding to reconsideration request
  const [newRequestAlert, setNewRequestAlert] = useState<any | null>(null); // For showing new request popup

  // Track known request IDs to detect new ones
  const knownRequestIds = useRef<Set<string>>(new Set());

  // Get selected meeting from store (reactive to changes)
  const selectedMeeting = selectedMeetingId ? meetings.find(m => m.id === selectedMeetingId) || null : null;

  // ✅ OPTIMIZED: Fetch meetings once on mount (empty deps)
  useEffect(() => {
    fetchMeetings();
  }, []); // Empty array - runs only once

  // Load reconsideration requests with new request detection
  const loadReconsiderationRequests = useCallback(async (isInitial = false) => {
    const requests = await fetchMyReconsiderationRequests();

    // Detect new requests (only after initial load)
    if (!isInitial && requests.length > 0) {
      const newRequests = requests.filter(r =>
        (r.status === 'pending' || r.status === 'viewed') &&
        !knownRequestIds.current.has(r.id)
      );

      if (newRequests.length > 0) {
        // Show alert for the first new request
        setNewRequestAlert(newRequests[0]);

        // Play notification sound if available
        try {
          const audio = new Audio('/notification.mp3');
          audio.volume = 0.5;
          audio.play().catch(() => {}); // Ignore if autoplay blocked
        } catch {}
      }
    }

    // Update known IDs
    requests.forEach(r => knownRequestIds.current.add(r.id));

    setReconsiderationRequests(requests);
  }, [fetchMyReconsiderationRequests]);

  // Initial fetch of reconsideration requests
  useEffect(() => {
    loadReconsiderationRequests(true);
  }, [loadReconsiderationRequests]);

  // Poll for new reconsideration requests every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadReconsiderationRequests(false);
    }, 30000);

    return () => clearInterval(interval);
  }, [loadReconsiderationRequests]);

  // Handle ignoring a reconsideration request
  const handleIgnoreRequest = async (requestId: string) => {
    await ignoreReconsiderationRequest(requestId);
    // Refresh the requests list
    await loadReconsiderationRequests(false);
    // Close alert if this was the alerted request
    if (newRequestAlert?.id === requestId) {
      setNewRequestAlert(null);
    }
  };

  // Handle viewing and opening vote modal for a request
  const handleRespondToRequest = async (request: any) => {
    // Mark as viewed
    await markReconsiderationRequestViewed(request.id);

    // Enable revote mode - allows changing existing votes
    setAllowRevote(true);

    // Show modal immediately (loading state will show if meeting not yet loaded)
    setSelectedMeetingId(request.meetingId);
    setShowVotingModal(true);

    // Close alert if responding from alert
    if (newRequestAlert?.id === request.id) {
      setNewRequestAlert(null);
    }

    // Refresh meetings to ensure the meeting is loaded
    await fetchMeetings();

    // Refresh requests
    await loadReconsiderationRequests(false);
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


  const handleOpenMeeting = (meeting: Meeting) => {
    setSelectedMeetingId(meeting.id);
    setShowVotingModal(true);
  };

  const getStatusIcon = (status: Meeting['status']) => {
    switch (status) {
      case 'schedule_poll_open': return <Calendar className="w-5 h-5" />;
      case 'voting_open': return <Vote className="w-5 h-5" />;
      case 'results_published': return <Trophy className="w-5 h-5" />;
      case 'protocol_approved': return <CheckCircle className="w-5 h-5" />;
      default: return <Clock className="w-5 h-5" />;
    }
  };

  const getStatusGradient = (status: Meeting['status']) => {
    switch (status) {
      case 'schedule_poll_open': return 'from-blue-500 to-indigo-600';
      case 'voting_open': return 'from-emerald-500 to-teal-600';
      case 'results_published': return 'from-violet-500 to-purple-600';
      case 'protocol_approved': return 'from-emerald-600 to-green-700';
      default: return 'from-gray-500 to-gray-600';
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 pb-24 md:pb-0">
      {/* New Request Popup Alert */}
      {newRequestAlert && (
        <div className="fixed top-4 right-4 left-4 md:left-auto md:w-96 z-[150] animate-in slide-in-from-top-2 duration-300">
          <div className="rounded-2xl p-4 border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 shadow-xl shadow-amber-100/50">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0 shadow-lg shadow-amber-200/50">
                <AlertTriangle className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-gray-900 mb-0.5">
                  {language === 'ru' ? 'Запрос на пересмотр' : 'Qayta ko\'rib chiqish so\'rovi'}
                </div>
                <div className="text-sm text-gray-600 mb-2 line-clamp-2">
                  {newRequestAlert.agendaItemTitle}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleRespondToRequest(newRequestAlert)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl text-sm font-semibold shadow-sm active:scale-[0.98] transition-transform"
                  >
                    <RefreshCw className="w-4 h-4" />
                    {language === 'ru' ? 'Открыть' : 'Ochish'}
                  </button>
                  <button
                    onClick={() => setNewRequestAlert(null)}
                    className="p-2.5 text-gray-400 hover:text-gray-600 rounded-xl transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
          {language === 'ru' ? 'Собрания' : 'Yig\'ilishlar'}
        </h1>
        {votableMeetings.length > 0 && (
          <p className="text-sm text-gray-500 mt-1">
            {votableMeetings.length}{' '}
            {plural(
              language === 'ru' ? 'ru' : 'uz',
              votableMeetings.length,
              { one: 'ждёт вашего голоса', few: 'ждут вашего голоса', many: 'ждут вашего голоса' },
              { one: 'ovozingizni kutmoqda', other: 'ovozingizni kutmoqda' }
            )}
          </p>
        )}
      </div>

      {/* Reconsideration Requests Banner */}
      {reconsiderationRequests.length > 0 && (
        <div className="space-y-3">
          {reconsiderationRequests.map((request) => (
            <div
              key={request.id}
              className="rounded-2xl p-4 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 mb-1">
                    {language === 'ru' ? 'Просьба пересмотреть голос' : 'Ovozni qayta ko\'rib chiqish so\'rovi'}
                  </div>
                  <div className="text-sm text-gray-600 mb-2">
                    {request.agendaItemTitle}
                  </div>
                  {request.messageToResident && (
                    <div className="p-2.5 bg-white/80 rounded-xl text-sm text-gray-700 mb-2 border border-amber-100">
                      <MessageSquare className="w-3.5 h-3.5 inline mr-1.5 text-amber-500" />
                      {request.messageToResident}
                    </div>
                  )}
                  <div className="text-xs text-gray-500 mb-3">
                    {language === 'ru'
                      ? 'Это только просьба. Вы сами решаете.'
                      : 'Bu faqat iltimos. O\'zingiz hal qilasiz.'}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRespondToRequest(request);
                      }}
                      className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl text-sm font-semibold shadow-sm active:scale-[0.98] transition-transform"
                    >
                      <RefreshCw className="w-4 h-4" />
                      {language === 'ru' ? 'Пересмотреть' : 'Qayta ko\'rish'}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleIgnoreRequest(request.id);
                      }}
                      className="flex items-center gap-2 px-4 py-2.5 bg-white text-gray-600 rounded-xl text-sm font-medium border border-gray-200 active:scale-[0.98] transition-transform"
                    >
                      <X className="w-4 h-4" />
                      {language === 'ru' ? 'Оставить' : 'Qoldirish'}
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
        <EmptyState
          icon={<CalendarDays className="w-12 h-12" />}
          title={language === 'ru' ? 'Нет собраний' : 'Yig\'ilishlar yo\'q'}
          description={language === 'ru' ? 'Здесь будут ваши собрания и голосования' : 'Bu yerda yig\'ilishlar va ovoz berishlar bo\'ladi'}
        />
      ) : (
        <div className="space-y-4">
          {activeMeetings.map((meeting) => {
            const statusLabel = MEETING_STATUS_LABELS[meeting.status];
            const quorum = calculateMeetingQuorum(meeting.id);
            // Guard against NaN when total=0: percent may be NaN/Infinity
            const safePercent = Number.isFinite(quorum.percent) ? quorum.percent : 0;
            const hasVoted = user?.id && meeting.participatedVoters?.includes(user.id);
            const scheduleVote: string | null = null;
            const quorumPercent = Math.max(0, Math.min(safePercent, 100));

            return (
              <div
                key={meeting.id}
                className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 active:scale-[0.99] transition-all touch-manipulation"
                onClick={() => handleOpenMeeting(meeting)}
              >
                {/* Gradient status header */}
                <div className={`bg-gradient-to-r ${getStatusGradient(meeting.status)} px-4 py-3 flex items-center justify-between`}>
                  <div className="flex items-center gap-2.5 text-white">
                    {getStatusIcon(meeting.status)}
                    <span className="font-semibold text-sm">
                      {language === 'ru' ? statusLabel?.label : statusLabel?.labelUz}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-white/70 text-xs font-medium">#{meeting.number}</span>
                    {hasVoted && meeting.status === 'voting_open' && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-white/20 text-white backdrop-blur-sm flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        {language === 'ru' ? 'Голос принят' : 'Ovoz qabul qilindi'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-4">
                  {/* Building address */}
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                    <Building2 className="w-4 h-4 text-gray-400" />
                    <span className="truncate">{meeting.buildingAddress}</span>
                  </div>

                  {/* Agenda items count + confirmed date */}
                  <div className="flex items-center gap-4 mb-3">
                    <div className="flex items-center gap-1.5 text-sm text-gray-500">
                      <FileText className="w-4 h-4" />
                      <span>
                        {pluralWithCount(
                          language === 'ru' ? 'ru' : 'uz',
                          meeting.agendaItems.length,
                          { one: 'вопрос', few: 'вопроса', many: 'вопросов' },
                          { one: 'savol', other: 'savol' }
                        )}
                      </span>
                    </div>
                    {meeting.confirmedDateTime && meeting.status !== 'schedule_poll_open' && (
                      <div className="flex items-center gap-1.5 text-sm text-gray-500">
                        <Calendar className="w-4 h-4" />
                        <span>{formatDate(meeting.confirmedDateTime)}</span>
                      </div>
                    )}
                  </div>

                  {/* Schedule Poll Info */}
                  {meeting.status === 'schedule_poll_open' && (
                    <div className="rounded-xl bg-primary-50 p-3 mb-3 border border-primary-100">
                      <div className="text-sm font-medium text-primary-800 mb-1">
                        {language === 'ru' ? 'Выберите удобную дату' : 'Qulay sanani tanlang'}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-primary-600">
                        {scheduleVote ? (
                          <>
                            <CheckCircle className="w-3.5 h-3.5" />
                            {language === 'ru' ? 'Вы уже проголосовали' : 'Siz ovoz berdingiz'}
                          </>
                        ) : (
                          <>
                            <Clock className="w-3.5 h-3.5" />
                            {language === 'ru' ? 'Ожидает вашего выбора' : 'Tanlovingiz kutilmoqda'}
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Quorum progress bar — hidden when total=0 to avoid "0/0 (0%)" and 100%-filled false bar */}
                  {['voting_open', 'results_published', 'protocol_approved'].includes(meeting.status) && (
                    <div className="mb-3">
                      {quorum.total === 0 ? (
                        <div className="flex items-center gap-1.5 text-xs text-gray-400">
                          <Users className="w-3.5 h-3.5" />
                          {language === 'ru' ? 'Голосование ещё не началось' : 'Ovoz berish boshlanmagan'}
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="text-gray-500 flex items-center gap-1">
                              <Users className="w-3.5 h-3.5" />
                              {language === 'ru' ? 'Кворум' : 'Kvorum'}
                            </span>
                            <span className={`font-semibold ${quorum.quorumReached ? 'text-emerald-600' : 'text-amber-600'}`}>
                              {quorum.participated}/{quorum.total} ({quorum.percent.toFixed(0)}%)
                            </span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-700 ${
                                quorum.quorumReached
                                  ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                                  : 'bg-gradient-to-r from-amber-400 to-orange-400'
                              }`}
                              style={{ width: `${quorumPercent}%` }}
                            />
                          </div>
                          {quorum.quorumReached && (
                            <div className="flex items-center gap-1 mt-1">
                              <CheckCircle className="w-3 h-3 text-emerald-500" />
                              <span className="text-xs text-emerald-600 font-medium">
                                {language === 'ru' ? 'Кворум достигнут' : 'Kvorum yig\'ildi'}
                              </span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Thank you message if already voted */}
                  {hasVoted && meeting.status === 'voting_open' && (
                    <div className="rounded-xl bg-emerald-50 p-3 mb-3 flex items-center gap-3 border border-emerald-100">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                        <CheckCircle className="w-4.5 h-4.5 text-emerald-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-emerald-800">
                          {language === 'ru' ? 'Спасибо за участие!' : 'Ishtirok uchun rahmat!'}
                        </p>
                        <p className="text-xs text-emerald-600">
                          {language === 'ru' ? 'Ваш голос учтён' : 'Ovozingiz hisobga olindi'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* CTA Button */}
                  {meeting.status === 'voting_open' && !hasVoted ? (
                    <button
                      className="w-full py-3 px-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform touch-manipulation bg-gradient-to-r from-emerald-500 to-teal-600 shadow-md shadow-emerald-200/50"
                    >
                      <Vote className="w-5 h-5" />
                      {language === 'ru' ? 'Проголосовать' : 'Ovoz berish'}
                    </button>
                  ) : (
                    <button className="w-full py-3 px-4 rounded-xl font-medium text-gray-600 bg-gray-50 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform touch-manipulation border border-gray-100">
                      {language === 'ru' ? 'Подробнее' : 'Batafsil'}
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
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
          allowRevote={allowRevote}
          onClose={() => {
            setShowVotingModal(false);
            setSelectedMeetingId(null);
            setAllowRevote(false); // Reset revote mode on close
          }}
          getVote={(agendaItemId) => {
            const vote = getVoteByUser(selectedMeeting.id, agendaItemId, user.id);
            if (vote && vote.choice !== 'schedule') {
              return { choice: vote.choice as VoteChoice };
            }
            return undefined;
          }}
          onVote={(agendaItemId, choice, verified, comment, counterProposal) =>
            voteOnAgendaItem(selectedMeeting.id, agendaItemId, user.id, user.name, choice, {
              method: 'e_signature',
              otpVerified: verified,
            }, comment, counterProposal)
          }
          getScheduleVote={() => getScheduleVoteByUser(selectedMeeting.id)}
          onScheduleVote={(optionId) => voteForSchedule(selectedMeeting.id, optionId)}
          calculateResult={(agendaItemId) => calculateAgendaItemResult(selectedMeeting.id, agendaItemId)}
          calculateQuorum={() => calculateMeetingQuorum(selectedMeeting.id)}
        />
      )}

      {/* Loading Modal when meeting not found yet */}
      {showVotingModal && !selectedMeeting && selectedMeetingId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110]">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-primary-500" />
            <p className="text-gray-600">
              {language === 'ru' ? 'Загрузка собрания...' : 'Yig\'ilish yuklanmoqda...'}
            </p>
            <button
              onClick={() => {
                setShowVotingModal(false);
                setSelectedMeetingId(null);
              }}
              className="mt-4 px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Meeting Voting Modal Component
function MeetingVotingModal({
  meeting,
  language,
  user,
  allowRevote = false,
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
  allowRevote?: boolean; // Allow changing vote (for reconsideration requests)
  onClose: () => void;
  getVote: (agendaItemId: string) => { choice: VoteChoice } | undefined;
  onVote: (agendaItemId: string, choice: VoteChoice, verified: boolean, comment?: string, counterProposal?: string) => void;
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
  // Track counter-proposals for "against" votes
  const [pendingCounterProposals, setPendingCounterProposals] = useState<Record<string, string>>({});
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedScheduleOption, setSelectedScheduleOption] = useState<string | null>(null);
  const [scheduleVoteLoading, setScheduleVoteLoading] = useState(false);
  const [scheduleVoteSuccess, setScheduleVoteSuccess] = useState(false);
  const [previousVote, setPreviousVote] = useState<string | null>(null);
  const [votesSubmitted, setVotesSubmitted] = useState(false);
  const pendingVotesInitialized = useRef(false);

  // Load schedule vote on mount
  useEffect(() => {
    getScheduleVote().then(vote => {
      setSelectedScheduleOption(vote);
      setPreviousVote(vote);
    });
  }, [getScheduleVote]);

  // Initialize pendingVotes with existing votes when in revote mode (only once)
  useEffect(() => {
    if (allowRevote && !pendingVotesInitialized.current) {
      const existingVotes: Record<string, VoteChoice> = {};
      meeting.agendaItems.forEach(item => {
        const vote = getVote(item.id);
        if (vote && vote.choice) {
          existingVotes[item.id] = vote.choice;
        }
      });
      if (Object.keys(existingVotes).length > 0) {
        setPendingVotes(existingVotes);
        pendingVotesInitialized.current = true;
      }
    }
    if (!allowRevote) {
      pendingVotesInitialized.current = false;
    }
  }, [allowRevote, meeting.agendaItems, getVote]);

  // Check if user has already voted on all items
  // When allowRevote is true, treat as if not voted to allow changing votes
  const hasVotedOnAll = allowRevote ? false : meeting.agendaItems.every(item => getVote(item.id) !== undefined);

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
      // Submit all pending votes with their comments and counter-proposals
      for (const [agendaItemId, choice] of Object.entries(pendingVotes)) {
        const comment = pendingComments[agendaItemId]?.trim() || undefined;
        const counterProposal = pendingCounterProposals[agendaItemId]?.trim() || undefined;
        await onVote(agendaItemId, choice, true, comment, counterProposal);
      }
      setPendingVotes({});
      setPendingComments({});
      setPendingCounterProposals({});
      setVotesSubmitted(true);
    } catch (error: any) {
      console.error('Failed to submit votes:', error);
      const errorMessage = error?.message || 'Ошибка при голосовании. Проверьте что указана площадь квартиры.';
      addToast('error', errorMessage);
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
        addToast('error', errorMsg);
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
      addToast('error', errorMessage);
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
    <div className="fixed inset-0 bg-black/50 z-[110] flex items-end md:items-center justify-center">
      <div className="max-h-[85dvh] md:max-h-[90dvh] w-full md:max-w-lg md:mx-4 bg-white rounded-t-2xl md:rounded-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 md:slide-in-from-bottom-0 duration-200">
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
            aria-label="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* Revote Banner - shown when changing vote after reconsideration request */}
          {allowRevote && (
            <div className="bg-primary-50 border border-primary-200 rounded-xl p-3">
              <div className="flex items-start gap-2">
                <RefreshCw className="w-5 h-5 text-primary-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-primary-800">
                    {language === 'ru' ? 'Изменение голоса' : 'Ovozni o\'zgartirish'}
                  </p>
                  <p className="text-xs text-primary-600">
                    {language === 'ru'
                      ? 'Выберите новый вариант голоса и подтвердите изменение'
                      : 'Yangi ovoz variantini tanlang va o\'zgartirishni tasdiqlang'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Quorum Indicator */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-amber-600" />
                <span className="text-sm font-medium text-amber-800">
                  {language === 'ru' ? 'Кворум' : 'Kvorum'}: {quorum.percent.toFixed(0)}%
                </span>
                <span className="text-xs text-amber-600">
                  ({quorum.participated}/{quorum.total})
                </span>
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                quorum.quorumReached ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {quorum.quorumReached
                  ? (language === 'ru' ? 'Достигнут' : 'Yetildi')
                  : (language === 'ru' ? 'Не достигнут' : 'Yetilmadi')
                }
              </span>
            </div>
          </div>

          {/* Schedule Poll */}
          {isSchedulePoll && (
            <div className="space-y-4">
              {/* Header with deadline */}
              <div className="bg-gradient-to-r from-primary-500 to-primary-600 rounded-xl p-4 text-white">
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
                  <div className="flex items-center gap-2 text-primary-100 text-sm">
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
                            : 'border-gray-200 hover:border-primary-300 hover:bg-primary-50/50 bg-white cursor-pointer'
                      } ${scheduleVoteLoading ? 'opacity-70 pointer-events-none' : ''}`}
                    >
                      {/* Progress bar background */}
                      {totalScheduleVotes > 0 && (
                        <div
                          className={`absolute inset-0 transition-all ${
                            isSelected ? 'bg-green-100' : 'bg-primary-50'
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
                <div className="bg-primary-50 border border-primary-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-primary-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-medium text-primary-800">
                        {language === 'ru' ? 'Ваш голос учтён' : 'Ovozingiz hisobga olindi'}
                      </div>
                      <p className="text-sm text-primary-600 mt-1">
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
                      isCurrent ? 'bg-primary-500 text-white' :
                      'bg-gray-200 text-gray-500'
                    }`}>
                      {isCompleted ? <CheckCircle className="w-4 h-4" /> : index + 1}
                    </div>
                    <span className={`text-sm ${
                      isCompleted ? 'text-green-700' :
                      isCurrent ? 'text-primary-700 font-medium' :
                      'text-gray-400'
                    }`}>
                      {step.label}
                    </span>
                    {isCurrent && (
                      <span className="text-xs px-2 py-0.5 bg-primary-100 text-primary-700 rounded-full">
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
            <div className="bg-primary-50 border border-primary-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <Key className="w-5 h-5 text-primary-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-primary-700">
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

                    {/* Attachment Previews */}
                    {(() => {
                      const attachments: Array<{ name: string; url: string; type: string; size?: number }> =
                        Array.isArray((item as any).attachments)
                          ? (item as any).attachments
                          : [];
                      if (attachments.length === 0) return null;
                      return (
                        <div className="mb-3">
                          <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-2">
                            <FileText className="w-3.5 h-3.5" />
                            {language === 'ru' ? 'Материалы' : 'Materiallar'} ({attachments.length})
                          </div>
                          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                            {attachments.map((att, attIdx) => {
                              const isImage = att.type?.startsWith('image/');
                              if (isImage) {
                                return (
                                  <a
                                    key={attIdx}
                                    href={att.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden border border-gray-200 bg-gray-100 hover:opacity-90 transition-opacity"
                                    title={att.name}
                                  >
                                    <img
                                      src={att.url}
                                      alt={att.name}
                                      className="w-full h-full object-cover"
                                    />
                                  </a>
                                );
                              }
                              return (
                                <a
                                  key={attIdx}
                                  href={att.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  download={att.name}
                                  className="flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors max-w-[160px]"
                                  title={att.name}
                                >
                                  <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                  <span className="text-xs text-gray-700 truncate">{att.name}</span>
                                </a>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

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

                    {/* "Against" objection / counter-proposal form */}
                    {isVotingOpen && !hasVotedOnAll && (pendingVotes[item.id] === 'against' || (existingVote?.choice === 'against' && !pendingVotes[item.id])) && (
                      <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 space-y-2">
                        <div className="flex items-center gap-2 text-red-700 font-semibold text-sm">
                          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                          {language === 'ru' ? 'Вы голосуете ПРОТИВ' : 'Siz QARSHI ovoz berayapsiz'}
                        </div>
                        <div>
                          <label className="block text-xs text-red-600 font-medium mb-1">
                            {language === 'ru' ? 'Ваше возражение (обязательно)' : 'Sizning e\'tirozingiz (majburiy)'}
                          </label>
                          <textarea
                            value={pendingComments[item.id] || ''}
                            onChange={(e) => setPendingComments(prev => ({ ...prev, [item.id]: e.target.value }))}
                            placeholder={language === 'ru' ? 'Укажите причину возражения (минимум 20 символов)' : 'E\'tiroz sababini ko\'rsating (kamida 20 belgi)'}
                            className="w-full px-3 py-2 text-sm border border-red-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-red-200 resize-none"
                            rows={3}
                            maxLength={1000}
                          />
                          <div className="flex justify-between items-center mt-0.5">
                            {(pendingComments[item.id] || '').length > 0 && (pendingComments[item.id] || '').length < 20 && (
                              <span className="text-xs text-red-500">
                                {language === 'ru'
                                  ? `Ещё ${20 - (pendingComments[item.id] || '').length} символов`
                                  : `Yana ${20 - (pendingComments[item.id] || '').length} belgi`}
                              </span>
                            )}
                            <span className="text-xs text-gray-400 ml-auto">
                              {(pendingComments[item.id] || '').length}/1000
                            </span>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-amber-700 font-medium mb-1">
                            {language === 'ru' ? 'Альтернативное предложение (необязательно)' : 'Muqobil taklif (ixtiyoriy)'}
                          </label>
                          <textarea
                            value={pendingCounterProposals[item.id] || ''}
                            onChange={(e) => setPendingCounterProposals(prev => ({ ...prev, [item.id]: e.target.value }))}
                            placeholder={language === 'ru' ? 'Предложите свой вариант решения...' : 'O\'z yechim variantingizni taklif qiling...'}
                            className="w-full px-3 py-2 text-sm border border-amber-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-amber-200 resize-none"
                            rows={2}
                            maxLength={1000}
                          />
                          <div className="text-right mt-0.5">
                            <span className="text-xs text-gray-400">
                              {(pendingCounterProposals[item.id] || '').length}/1000
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Comment input - show when vote is selected but not yet submitted (non-against votes only) */}
                    {isVotingOpen && !hasVotedOnAll && pendingVotes[item.id] && pendingVotes[item.id] !== 'against' && (
                      <div className="mb-3">
                        <label className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                          <MessageSquare className="w-3 h-3" />
                          {language === 'ru' ? 'Обоснование (будет в протоколе)' : 'Asoslash (bayonnomada bo\'ladi)'}
                        </label>
                        <textarea
                          value={pendingComments[item.id] || ''}
                          onChange={(e) => setPendingComments(prev => ({ ...prev, [item.id]: e.target.value }))}
                          placeholder={language === 'ru' ? 'Почему вы так проголосовали? (необязательно)' : 'Nima uchun shunday ovoz berdingiz? (ixtiyoriy)'}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary-200 resize-none"
                          rows={2}
                          maxLength={500}
                        />
                        <div className="flex justify-between items-center mt-1">
                          <span className="text-xs text-gray-400">
                            {language === 'ru' ? 'Будет виден в протоколе собрания' : 'Yig\'ilish bayonnomasida ko\'rinadi'}
                          </span>
                          <span className="text-xs text-gray-400">
                            {(pendingComments[item.id] || '').length}/500
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Your Vote Indicator - show for submitted votes or pending selection */}
                    {(() => {
                      const currentChoice = pendingVotes[item.id] || existingVote?.choice;
                      const isSubmitted = !!existingVote && (!pendingVotes[item.id] || pendingVotes[item.id] === existingVote?.choice);
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
