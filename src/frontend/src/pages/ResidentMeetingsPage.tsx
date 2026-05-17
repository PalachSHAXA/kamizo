import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Vote, Calendar, CalendarDays, FileText, Users, Building2, CheckCircle, X,
  ChevronRight, Loader2, Clock, Trophy,
  MessageSquare, AlertTriangle, RefreshCw,
} from 'lucide-react';
import { EmptyState } from '../components/common';
import { plural, pluralWithCount } from '../utils/plural';
import { useAuthStore } from '../stores/authStore';
import { useMeetingStore } from '../stores/meetingStore';
import type { ReconsiderationRequest } from '../stores/meetingReconsiderationStore';
import { useLanguageStore } from '../stores/languageStore';
import { useToastStore } from '../stores/toastStore';
import { MEETING_STATUS_LABELS, DECISION_THRESHOLD_LABELS } from '../types';
import type { Meeting, VoteChoice } from '../types';
import { QRSignatureModal } from '../components/QRSignatureModal';
import { MeetingVotingModal } from './meetings/MeetingVotingModal';

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
  const [reconsiderationRequests, setReconsiderationRequests] = useState<ReconsiderationRequest[]>([]);
  const [allowRevote, setAllowRevote] = useState(false); // Allow changing vote when responding to reconsideration request
  const [newRequestAlert, setNewRequestAlert] = useState<ReconsiderationRequest | null>(null); // For showing new request popup

  // Track known request IDs to detect new ones
  const knownRequestIds = useRef<Set<string>>(new Set());

  // Get selected meeting from store (reactive to changes)
  const selectedMeeting = selectedMeetingId ? meetings.find(m => m.id === selectedMeetingId) || null : null;

  // ✅ OPTIMIZED: Fetch meetings once on mount (empty deps)
  useEffect(() => {
    fetchMeetings();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
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
        } catch { /* audio may not be available */ }
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
  const handleRespondToRequest = async (request: ReconsiderationRequest) => {
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

      {/* Header — Sprint 36: brand-orange avatar + title + subtitle,
          matching the Announcements/Chat pattern. */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#E8621A] to-[#F59E0B] flex items-center justify-center shadow-sm">
          <Vote className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg md:text-xl xl:text-2xl font-bold text-gray-900">
            {language === 'ru' ? 'Собрания' : "Yig'ilishlar"}
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {votableMeetings.length > 0
              ? `${votableMeetings.length} ${plural(
                  language === 'ru' ? 'ru' : 'uz',
                  votableMeetings.length,
                  { one: 'ждёт вашего голоса', few: 'ждут вашего голоса', many: 'ждут вашего голоса' },
                  { one: 'ovozingizni kutmoqda', other: 'ovozingizni kutmoqda' },
                )}`
              : language === 'ru' ? 'Активных голосований нет' : 'Faol ovoz berishlar yo\'q'}
          </p>
        </div>
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

