// Resident "Собрания" list — Claude Design §05-sobraniya handoff
// (design/handoff/meetings-handoff.md). Sticky in-page header
// (Собрания собственников eyebrow + Голосование title), legal-weight
// note explaining the m² weighting + ≥50% quorum, meeting cards with
// status pill (Идёт / Опрос даты / Предстоит / Завершено), title +
// date + agenda count, quorum bar (with 50% threshold marker) or
// closed-results 3-cell grid, CTA footer row with brand button for
// voting_open.
//
// Reconsideration banner + new-request popup + 30 s polling are
// preserved exactly as they were today — only the visual layer
// changes. Card tap opens the existing MeetingVotingModal (handoff §03,
// already shipped). No new endpoints.

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, Calendar, Check, CheckCircle, ChevronRight, Clock,
  Loader2, MessageSquare, RefreshCw, Shield, Vote, X,
} from 'lucide-react';
import { plural } from '../utils/plural';
import { useAuthStore } from '../stores/authStore';
import { useMeetingStore } from '../stores/meetingStore';
import type { ReconsiderationRequest } from '../stores/meetingReconsiderationStore';
import { useLanguageStore } from '../stores/languageStore';
import type { Meeting, MeetingStatus, VoteChoice } from '../types';
import { MeetingVotingModal } from './meetings/MeetingVotingModal';

// ── visual tokens — each reads through `var(--themed-…, <light-hex>)`
//    so light mode is byte-identical (fallback wins when the var is
//    undefined) and html.dark in index.css fills the vars with the
//    warm-dark equivalents. ─────────────────────────────────────────
const APP_BG = 'var(--themed-app-bg, #F4F0E8)';
const SURFACE = 'var(--themed-surface, #FFFFFF)';
const SURFACE_2 = 'var(--themed-surface-2, #FAF6EE)';
const SURFACE_SUNKEN = 'var(--themed-surface-sunken, #EDE7DB)';
const TEXT_PRIMARY = 'var(--themed-text-primary, #1C1917)';
const TEXT_SECONDARY = 'var(--themed-text-secondary, #6F6A62)';
const TEXT_MUTED = 'var(--themed-text-muted, #A8A29E)';
const BORDER_C = 'var(--themed-border-c, rgba(28,25,23,0.08))';
const HAIRLINE = 'var(--themed-hairline, rgba(28,25,23,0.06))';
const BRAND = '#F97316';
const BRAND_DARK = '#EA580C';
const BRAND_TINT = 'var(--themed-brand-tint, #FFF3EA)';
const BRAND_200 = 'var(--themed-brand-200, #FED7AA)';
const STATUS_ACTIVE = '#15A06E';
const STATUS_ACTIVE_BG = 'var(--themed-status-active-bg, rgba(21,160,110,0.12))';
const STATUS_INFO = '#3B82F6';
const STATUS_INFO_BG = 'var(--themed-status-info-bg, rgba(59,130,246,0.10))';
const STATUS_PENDING = '#B45309';
const STATUS_PENDING_BG = 'var(--themed-status-pending-bg, rgba(180,83,9,0.12))';
const STATUS_EXPIRED = '#6B7280';
const STATUS_EXPIRED_BG = 'var(--themed-status-expired-bg, rgba(107,114,128,0.12))';
const STATUS_CRITICAL = '#E2483D';
const SHADOW_SM = 'var(--themed-shadow-sm, 0 1px 2px rgba(28,25,23,0.04))';
const SHADOW_BRAND = '0 8px 22px rgba(249,115,22,0.26)';
const RADIUS_LG = 16;
const RADIUS_MD = 12;
const RADIUS_SM = 10;

// Closed-family statuses share the "Завершено" pill + result-grid layout.
const CLOSED_STATUSES: MeetingStatus[] = [
  'voting_closed', 'results_published', 'protocol_generated', 'protocol_approved',
];

const formatRuShortDate = (iso: string | undefined, lang: 'ru' | 'uz', withTime = false): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'uz-UZ', {
    day: 'numeric', month: 'long', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
};

// "осталось 2 дн" / "12 ч" / "30 мин" — null when no deadline / already past.
const formatTimeLeft = (iso: string | undefined, lang: 'ru' | 'uz'): { label: string; expired: boolean } | null => {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms)) return null;
  if (ms <= 0) return { label: lang === 'ru' ? 'Завершено' : 'Tugadi', expired: true };
  const mins = Math.floor(ms / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days >= 1) return { label: lang === 'ru' ? `осталось ${days} ${plural('ru', days, { one: 'день', few: 'дня', many: 'дней' })}` : `${days} kun qoldi`, expired: false };
  if (hrs >= 1)  return { label: lang === 'ru' ? `осталось ${hrs} ч` : `${hrs} soat qoldi`, expired: false };
  return { label: lang === 'ru' ? `осталось ${mins} мин` : `${mins} daq qoldi`, expired: false };
};

export function ResidentMeetingsPage() {
  // v118.77 — navigate for the back arrow added when /meetings became
  // standalone-fullscreen for residents (top-level Route in App.tsx,
  // no Layout chrome).
  const navigate = useNavigate();
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
  const lang: 'ru' | 'uz' = language === 'ru' ? 'ru' : 'uz';

  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [showVotingModal, setShowVotingModal] = useState(false);
  const [reconsiderationRequests, setReconsiderationRequests] = useState<ReconsiderationRequest[]>([]);
  const [allowRevote, setAllowRevote] = useState(false);
  const [newRequestAlert, setNewRequestAlert] = useState<ReconsiderationRequest | null>(null);

  const knownRequestIds = useRef<Set<string>>(new Set());

  const selectedMeeting = selectedMeetingId ? meetings.find(m => m.id === selectedMeetingId) || null : null;

  // Initial fetch (once)
  useEffect(() => {
    fetchMeetings();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  const loadReconsiderationRequests = useCallback(async (isInitial = false) => {
    const requests = await fetchMyReconsiderationRequests();
    if (!isInitial && requests.length > 0) {
      const newRequests = requests.filter(r =>
        (r.status === 'pending' || r.status === 'viewed') &&
        !knownRequestIds.current.has(r.id)
      );
      if (newRequests.length > 0) {
        setNewRequestAlert(newRequests[0]);
        try {
          const audio = new Audio('/notification.mp3');
          audio.volume = 0.5;
          audio.play().catch(() => {});
        } catch { /* audio not available */ }
      }
    }
    requests.forEach(r => knownRequestIds.current.add(r.id));
    setReconsiderationRequests(requests);
  }, [fetchMyReconsiderationRequests]);

  useEffect(() => { loadReconsiderationRequests(true); }, [loadReconsiderationRequests]);

  // 30 s polling for new reconsideration requests
  useEffect(() => {
    const interval = setInterval(() => { loadReconsiderationRequests(false); }, 30000);
    return () => clearInterval(interval);
  }, [loadReconsiderationRequests]);

  const handleIgnoreRequest = async (requestId: string) => {
    await ignoreReconsiderationRequest(requestId);
    await loadReconsiderationRequests(false);
    if (newRequestAlert?.id === requestId) setNewRequestAlert(null);
  };

  const handleRespondToRequest = async (request: ReconsiderationRequest) => {
    await markReconsiderationRequestViewed(request.id);
    setAllowRevote(true);
    setSelectedMeetingId(request.meetingId);
    setShowVotingModal(true);
    if (newRequestAlert?.id === request.id) setNewRequestAlert(null);
    await fetchMeetings();
    await loadReconsiderationRequests(false);
  };

  useEffect(() => {
    if (selectedMeetingId && user?.id) getUserVotesForMeeting(selectedMeetingId, user.id);
  }, [selectedMeetingId, user?.id, getUserVotesForMeeting]);

  // Filter by building (residents only see their own building's meetings)
  const activeMeetings = useMemo(() =>
    meetings
      .filter(m =>
        ['schedule_poll_open', 'schedule_confirmed', 'voting_open', 'voting_closed', 'results_published', 'protocol_generated', 'protocol_approved'].includes(m.status) &&
        (!user?.buildingId || m.buildingId === user.buildingId)
      )
      // Pin active voting first, then poll/confirmed, then closed; within group, newer first
      .sort((a, b) => {
        const order = (s: MeetingStatus) => s === 'voting_open' ? 0
          : s === 'schedule_poll_open' ? 1
          : s === 'schedule_confirmed' ? 2
          : 3;
        const oa = order(a.status); const ob = order(b.status);
        if (oa !== ob) return oa - ob;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }),
    [meetings, user?.buildingId]
  );

  const handleOpenMeeting = (meeting: Meeting) => {
    setSelectedMeetingId(meeting.id);
    setShowVotingModal(true);
  };

  // Quorum threshold for the legal note — use the most-active meeting's
  // configured threshold, fall back to 50 %.
  const quorumThreshold = activeMeetings[0]?.votingSettings?.quorumPercent ?? 50;

  // ── render ──────────────────────────────────────────────────────
  return (
    // v118.79 — kz-screen opts into the global iOS-like page-enter slide+fade.
    // v118.98 — was minHeight:100% with the page itself scrolling under a
    // position:sticky header (the header would drift on iOS rubber-band).
    // Restructured to the v229 (Home) / v232 (Garage) pattern: flex
    // column, header is flex:0 0 auto (truly fixed, no sticky), content
    // lives in a dedicated inner scroller (flex:1 1 auto + minHeight:0
    // + overflowY:auto + overscrollBehavior:none + WebkitOverflowScrolling:
    // touch). The body/document no longer scrolls — only the inner
    // container does — so the header is immune to any rubber-band drift.
    <div className="kz-screen" style={{
      height: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      background: APP_BG, color: TEXT_PRIMARY,
      overflow: 'hidden',
      letterSpacing: '-0.01em',
    }}>
      {/* New-request popup (existing alert) — fixed overlay, renders
          above the flex column regardless of its source position. */}
      {newRequestAlert && (
        <NewRequestPopup
          alert={newRequestAlert}
          lang={lang}
          onOpen={() => handleRespondToRequest(newRequestAlert)}
          onDismiss={() => setNewRequestAlert(null)}
        />
      )}

      {/* Fixed header (flex:0 0 auto — never moves) */}
      <div style={{
        flex: '0 0 auto',
        padding: 'calc(env(safe-area-inset-top, 0px) + 14px) 16px 14px',
        background: 'var(--themed-strip-bg, rgba(244,240,232,0.92))',
        backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
        borderBottom: `1px solid ${HAIRLINE}`,
      }}>
        {/* v118.77 — back arrow + heading inline row. Back on the left,
            explicit navigate('/') (NOT history.back so the user always
            lands on Home, regardless of how they reached /meetings).
            Heading text stays exactly the same; only the leading
            back-button is new. */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <button
            onClick={() => navigate('/')}
            aria-label={lang === 'ru' ? 'Назад' : 'Orqaga'}
            style={{
              width: 40, height: 40, borderRadius: 12, flex: '0 0 auto',
              background: SURFACE,
              border: `1px solid ${HAIRLINE}`,
              color: TEXT_PRIMARY,
              display: 'grid', placeItems: 'center', cursor: 'pointer',
              padding: 0, marginTop: 2,
            }}
          >
            <ArrowLeft size={20} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 11.5, fontWeight: 700, letterSpacing: '0.04em',
              color: TEXT_SECONDARY, textTransform: 'uppercase',
            }}>
              {lang === 'ru' ? 'Собрания собственников' : 'Mulkdorlar yig\'ilishi'}
            </div>
            <div style={{
              fontSize: 24, fontWeight: 800, letterSpacing: '-0.025em',
              marginTop: 2, color: TEXT_PRIMARY,
            }}>
              {lang === 'ru' ? 'Голосование' : 'Ovoz berish'}
            </div>
          </div>
        </div>
      </div>

      {/* v118.98 — inner scroller (flex:1 1 auto). Owns ALL scroll on
          this page. overscroll-behavior:none + min-height:0 prevent the
          iOS top-rubber-band that used to translate the document and
          drag the sticky header with it. */}
      <div className="meetings-scroll" style={{
        flex: '1 1 auto',
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        overscrollBehavior: 'contain',
        WebkitOverflowScrolling: 'touch',
        paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
      }}>
      {/* Legal-weight note */}
      <LegalWeightNote
        totalArea={user?.totalArea}
        threshold={quorumThreshold}
        lang={lang}
      />

      {/* Reconsideration requests (existing) */}
      {reconsiderationRequests.length > 0 && (
        <div style={{ padding: '14px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {reconsiderationRequests.map(request => (
            <ReconsiderationBanner
              key={request.id}
              request={request}
              lang={lang}
              onRespond={() => handleRespondToRequest(request)}
              onIgnore={() => handleIgnoreRequest(request.id)}
            />
          ))}
        </div>
      )}

      {/* Meetings list / empty state */}
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {activeMeetings.length === 0 ? (
          <EmptyState lang={lang} />
        ) : (
          activeMeetings.map(meeting => (
            <MeetingCard
              key={meeting.id}
              meeting={meeting}
              user={user}
              lang={lang}
              onOpen={() => handleOpenMeeting(meeting)}
              calculateMeetingQuorum={calculateMeetingQuorum}
              calculateAgendaItemResult={calculateAgendaItemResult}
            />
          ))
        )}
      </div>

      </div>{/* /meetings-scroll inner scroller */}

      {/* Voting modal (existing) */}
      {showVotingModal && selectedMeeting && user && (
        <MeetingVotingModal
          meeting={selectedMeeting}
          language={language}
          user={user}
          allowRevote={allowRevote}
          onClose={() => {
            setShowVotingModal(false);
            setSelectedMeetingId(null);
            setAllowRevote(false);
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

      {/* Loading sheet (meeting not yet hydrated) — preserved */}
      {showVotingModal && !selectedMeeting && selectedMeetingId && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 120,
          background: 'rgba(28,25,23,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: SURFACE, borderRadius: RADIUS_LG, padding: 24,
            maxWidth: 320, width: 'calc(100% - 32px)', textAlign: 'center',
            boxShadow: '0 20px 48px rgba(28,25,23,0.18)',
          }}>
            <Loader2 size={28} className="animate-spin" style={{ color: BRAND, margin: '0 auto 10px' }} />
            <div style={{ fontSize: 14, color: TEXT_SECONDARY }}>
              {lang === 'ru' ? 'Загрузка собрания...' : 'Yig\'ilish yuklanmoqda...'}
            </div>
            <button
              onClick={() => { setShowVotingModal(false); setSelectedMeetingId(null); }}
              style={{
                marginTop: 14, padding: '8px 16px', borderRadius: RADIUS_SM,
                background: 'transparent', border: 'none', color: TEXT_SECONDARY,
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>
              {lang === 'ru' ? 'Отмена' : 'Bekor qilish'}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Legal note
// ─────────────────────────────────────────────────────────────────────────

function LegalWeightNote({ totalArea, threshold, lang }: { totalArea?: number; threshold: number; lang: 'ru' | 'uz' }) {
  return (
    <div style={{
      margin: '10px 16px 0',
      padding: '12px 14px',
      background: SURFACE_2, border: `1px solid ${BORDER_C}`,
      borderRadius: RADIUS_MD,
      display: 'flex', gap: 10, alignItems: 'flex-start',
    }}>
      <Shield size={17} style={{ color: TEXT_SECONDARY, flex: '0 0 auto', marginTop: 1 }} />
      <div style={{ fontSize: 12, color: TEXT_SECONDARY, lineHeight: 1.45 }}>
        {lang === 'ru' ? (
          <>
            Вес вашего голоса равен площади квартиры (
            <b style={{ color: TEXT_PRIMARY }}>
              {Number.isFinite(totalArea) && totalArea! > 0 ? `${totalArea} м²` : 'не указана'}
            </b>
            ). Решение принимается при кворуме <b style={{ color: TEXT_PRIMARY }}>≥{threshold}%</b> площади дома.
          </>
        ) : (
          <>
            Ovozingiz og'irligi kvartira maydoniga (
            <b style={{ color: TEXT_PRIMARY }}>
              {Number.isFinite(totalArea) && totalArea! > 0 ? `${totalArea} m²` : 'ko\'rsatilmagan'}
            </b>
            ) teng. Qaror uy maydonining <b style={{ color: TEXT_PRIMARY }}>≥{threshold}%</b> kvorum bilan qabul qilinadi.
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Meeting card
// ─────────────────────────────────────────────────────────────────────────

interface CardProps {
  meeting: Meeting;
  user: { id: string; totalArea?: number } | null;
  lang: 'ru' | 'uz';
  onOpen: () => void;
  calculateMeetingQuorum: (id: string) => { participated: number; total: number; percent: number; quorumReached: boolean };
  calculateAgendaItemResult: (mId: string, aId: string) => { votesFor: number; votesAgainst: number; votesAbstain: number; totalVotes: number; percentFor: number; isApproved: boolean; thresholdMet: boolean };
}

function MeetingCard({ meeting, user, lang, onOpen, calculateMeetingQuorum, calculateAgendaItemResult }: CardProps) {
  const isClosed = CLOSED_STATUSES.includes(meeting.status);
  const isVotingOpen = meeting.status === 'voting_open';
  const isSchedulePoll = meeting.status === 'schedule_poll_open';
  const isScheduleConfirmed = meeting.status === 'schedule_confirmed';

  const hasVoted = !!(user?.id && meeting.participatedVoters?.includes(user.id));
  const allowRevote = meeting.votingSettings?.allowRevote ?? false;

  const quorum = calculateMeetingQuorum(meeting.id);
  const safePercent = Number.isFinite(quorum.percent) ? quorum.percent : 0;
  const quorumPct = Math.max(0, Math.min(safePercent, 100));
  const threshold = meeting.votingSettings?.quorumPercent ?? 50;

  // Status pill
  const status = (() => {
    if (isVotingOpen)      return { label: lang === 'ru' ? 'Идёт голосование' : 'Ovoz berish davom etmoqda', fg: BRAND_DARK, bg: BRAND_TINT, live: true };
    if (isSchedulePoll)    return { label: lang === 'ru' ? 'Опрос даты' : 'Sana so\'rovi', fg: STATUS_INFO, bg: STATUS_INFO_BG, live: false };
    if (isScheduleConfirmed) return { label: lang === 'ru' ? 'Предстоит' : 'Bo\'lib o\'tadi', fg: STATUS_PENDING, bg: STATUS_PENDING_BG, live: false };
    return { label: lang === 'ru' ? 'Завершено' : 'Tugadi', fg: STATUS_EXPIRED, bg: STATUS_EXPIRED_BG, live: false };
  })();

  // Header date label
  const dateLabel = (() => {
    if (isVotingOpen) {
      const d = formatRuShortDate(meeting.votingClosedAt, lang);
      return d ? (lang === 'ru' ? `до ${d}` : `${d} gacha`) : (lang === 'ru' ? 'без срока' : 'muddatsiz');
    }
    if (isSchedulePoll) {
      const d = formatRuShortDate(meeting.schedulePollEndsAt, lang);
      return d ? (lang === 'ru' ? `опрос до ${d}` : `${d} gacha so'rov`) : (lang === 'ru' ? 'опрос идёт' : 'so\'rov davom etmoqda');
    }
    if (isScheduleConfirmed) {
      const d = formatRuShortDate(meeting.confirmedDateTime, lang, true);
      return d ?? (lang === 'ru' ? 'дата не назначена' : 'sana belgilanmagan');
    }
    // closed
    const d = formatRuShortDate(meeting.votingClosedAt || meeting.protocolGeneratedAt || meeting.createdAt, lang);
    return d ?? '';
  })();

  // Aggregated result for closed cards
  const closedResult = useMemo(() => {
    if (!isClosed) return null;
    const items = meeting.agendaItems;
    if (items.length === 0) return { forPct: 0, againstPct: 0, abstainPct: 0 };
    let sumFor = 0, sumAgainst = 0, sumAbstain = 0, count = 0;
    items.forEach(item => {
      const r = calculateAgendaItemResult(meeting.id, item.id);
      const total = r.votesFor + r.votesAgainst + r.votesAbstain;
      if (total <= 0) return;
      sumFor += (r.votesFor / total) * 100;
      sumAgainst += (r.votesAgainst / total) * 100;
      sumAbstain += (r.votesAbstain / total) * 100;
      count++;
    });
    if (count === 0) return { forPct: 0, againstPct: 0, abstainPct: 0 };
    return {
      forPct: Math.round(sumFor / count),
      againstPct: Math.round(sumAgainst / count),
      abstainPct: Math.round(sumAbstain / count),
    };
  }, [isClosed, meeting, calculateAgendaItemResult]);

  // CTA footer left text
  const ctaLeft = (() => {
    if (isVotingOpen) {
      if (hasVoted) return { icon: <Check size={13} strokeWidth={2.6} style={{ color: STATUS_ACTIVE }} />, text: lang === 'ru' ? 'Вы проголосовали' : 'Siz ovoz berdingiz' };
      const tl = formatTimeLeft(meeting.votingClosedAt, lang);
      if (tl) return { icon: <Clock size={13} />, text: tl.label };
      return { icon: <Clock size={13} />, text: lang === 'ru' ? 'голосование идёт' : 'davom etmoqda' };
    }
    if (isClosed) {
      const protocolReady = !!(meeting.protocolApprovedAt || meeting.protocolGeneratedAt);
      return {
        icon: null,
        text: protocolReady
          ? (lang === 'ru' ? 'Протокол готов' : 'Bayonnoma tayyor')
          : (lang === 'ru' ? 'Итоги опубликованы' : 'Natijalar e\'lon qilindi'),
      };
    }
    // schedule_*
    const area = user?.totalArea;
    return {
      icon: null,
      text: Number.isFinite(area) && (area as number) > 0
        ? (lang === 'ru' ? `Ваш вес: ${area} м²` : `Ovoz og'irligi: ${area} m²`)
        : (lang === 'ru' ? 'Вес голоса не указан' : 'Ovoz og\'irligi ko\'rsatilmagan'),
    };
  })();

  // CTA footer right pill / link. v118.124 — single-source-of-truth
  // state machine; previously this only handled the (hasVoted &&
  // allowRevote) revote case and fell through to "Голосовать" even
  // when the user had already voted on a no-revote meeting,
  // contradicting the "✓ Вы проголосовали" footer on the same card.
  const ctaRight = (() => {
    if (isVotingOpen) {
      if (hasVoted) {
        return allowRevote
          ? { label: lang === 'ru' ? 'Изменить голос' : 'Ovozni o\'zgartirish', solid: true }
          // Voted + no revote allowed → not a CTA, just an "open card to
          // view your vote / current tally" link. Outlined pill, not solid.
          : { label: lang === 'ru' ? 'Посмотреть' : 'Ko\'rish', solid: false };
      }
      return { label: lang === 'ru' ? 'Голосовать' : 'Ovoz berish', solid: true };
    }
    if (isClosed) return { label: lang === 'ru' ? 'Результаты' : 'Natijalar', solid: false };
    return { label: lang === 'ru' ? 'Подробнее' : 'Batafsil', solid: false };
  })();

  const agendaCount = meeting.agendaItems.length;
  const agendaWord = lang === 'ru'
    ? plural('ru', agendaCount, { one: 'пункт', few: 'пункта', many: 'пунктов' })
    : 'band';

  return (
    <button
      onClick={onOpen}
      style={{
        position: 'relative', width: '100%', textAlign: 'left',
        cursor: 'pointer', font: 'inherit', color: 'inherit',
        background: SURFACE, borderRadius: RADIUS_LG,
        border: isVotingOpen ? `1.5px solid ${BRAND_200}` : `1px solid ${BORDER_C}`,
        boxShadow: SHADOW_SM, padding: 16, overflow: 'hidden',
      }}>
      {/* Status row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 11, fontWeight: 700, color: status.fg, background: status.bg,
          padding: '4px 10px', borderRadius: 999, letterSpacing: '0.02em',
        }}>
          {status.live && (
            <span style={{
              width: 6, height: 6, borderRadius: 999, background: status.fg,
              animation: 'pulse 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            }} />
          )}
          {status.label}
        </span>
        <span style={{
          fontSize: 12, color: TEXT_MUTED,
          fontVariantNumeric: 'tabular-nums',
        }}>
          №{meeting.number}
        </span>
      </div>

      {/* Title */}
      <div style={{
        fontSize: 16.5, fontWeight: 750, letterSpacing: '-0.02em',
        lineHeight: 1.3, marginTop: 12, color: TEXT_PRIMARY,
      }}>
        {meeting.agendaItems[0]?.title || `${lang === 'ru' ? 'Собрание' : 'Yig\'ilish'} #${meeting.number}`}
      </div>

      {/* Date + agenda count */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginTop: 6, fontSize: 12.5, color: TEXT_SECONDARY,
      }}>
        <Calendar size={14} style={{ flex: '0 0 auto' }} />
        <span style={{ whiteSpace: 'nowrap' }}>{dateLabel}</span>
        <span style={{ color: TEXT_MUTED }}>·</span>
        <span>{agendaCount} {agendaWord} {lang === 'ru' ? 'повестки' : 'kun tartibi'}</span>
      </div>

      {/* Body — quorum or closed-results grid */}
      {isClosed ? (
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          {([
            { l: lang === 'ru' ? 'За' : 'Ha', v: closedResult?.forPct ?? 0, c: STATUS_ACTIVE },
            { l: lang === 'ru' ? 'Против' : 'Yo\'q', v: closedResult?.againstPct ?? 0, c: STATUS_CRITICAL },
            { l: lang === 'ru' ? 'Возд.' : 'Betaraf', v: closedResult?.abstainPct ?? 0, c: TEXT_MUTED },
          ] as const).map((x) => (
            <div key={x.l} style={{
              flex: 1, textAlign: 'center',
              padding: '8px 4px', borderRadius: RADIUS_SM,
              background: SURFACE_SUNKEN,
            }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: x.c, fontVariantNumeric: 'tabular-nums' }}>{x.v}%</div>
              <div style={{ fontSize: 10.5, color: TEXT_SECONDARY, marginTop: 1 }}>{x.l}</div>
            </div>
          ))}
        </div>
      ) : quorum.total === 0 ? (
        // v118.124 — was "Голосование ещё не началось", which contradicted
        // the "Идёт голосование" status pill above (and the "✓ Вы
        // проголосовали" footer) when status=voting_open but the quorum
        // calculator hasn't picked up any votes yet (race / new meeting /
        // user voted but their area=0). The honest label depends on the
        // actual meeting state — voting_open → "пока нет голосов",
        // schedule_* → "голосование ещё не началось".
        <div style={{
          marginTop: 12, fontSize: 12, color: TEXT_MUTED,
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          <Clock size={13} />
          {isVotingOpen
            ? (lang === 'ru' ? 'Пока никто не проголосовал' : 'Hali hech kim ovoz bermagan')
            : (lang === 'ru' ? 'Голосование ещё не началось' : 'Ovoz berish hali boshlanmagan')}
        </div>
      ) : (
        <QuorumBar pct={quorumPct} threshold={threshold} lang={lang} />
      )}

      {/* CTA footer */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginTop: 14, gap: 12,
      }}>
        <div style={{
          fontSize: 11.5, color: TEXT_SECONDARY,
          display: 'inline-flex', alignItems: 'center', gap: 5,
          minWidth: 0, flex: 1, whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {ctaLeft.icon}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{ctaLeft.text}</span>
        </div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 13, fontWeight: 700, flex: '0 0 auto',
          color: ctaRight.solid ? '#fff' : BRAND_DARK,
          background: ctaRight.solid ? BRAND : 'transparent',
          padding: ctaRight.solid ? '8px 14px' : '0',
          borderRadius: 999,
          boxShadow: ctaRight.solid ? SHADOW_BRAND : 'none',
        }}>
          {ctaRight.label}
          <ChevronRight size={14} strokeWidth={2.4} />
        </span>
      </div>
    </button>
  );
}

function QuorumBar({ pct, threshold, lang }: { pct: number; threshold: number; lang: 'ru' | 'uz' }) {
  const reached = pct >= threshold;
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        marginBottom: 6,
      }}>
        <span style={{ fontSize: 12, fontWeight: 650, color: TEXT_SECONDARY, whiteSpace: 'nowrap' }}>
          {lang === 'ru' ? 'Кворум · ' : 'Kvorum · '}
          <span style={{
            fontVariantNumeric: 'tabular-nums',
            color: reached ? STATUS_ACTIVE : TEXT_PRIMARY, fontWeight: 800,
          }}>
            {pct.toFixed(0)}%
          </span>{' '}
          {lang === 'ru' ? 'площади' : 'maydon'}
        </span>
        {reached ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 11, fontWeight: 700,
            color: STATUS_ACTIVE, background: STATUS_ACTIVE_BG,
            padding: '3px 8px', borderRadius: 999,
          }}>
            <Check size={11} strokeWidth={3} />
            {lang === 'ru' ? 'Собран' : 'Yig\'ildi'}
          </span>
        ) : (
          <span style={{ fontSize: 11, color: TEXT_MUTED }}>
            {lang === 'ru' ? `нужно ${threshold}%` : `${threshold}% kerak`}
          </span>
        )}
      </div>
      <div style={{
        position: 'relative', height: 8, borderRadius: 999,
        background: SURFACE_SUNKEN, overflow: 'hidden',
      }}>
        <div style={{
          width: `${Math.min(pct, 100)}%`, height: '100%', borderRadius: 999,
          background: reached ? STATUS_ACTIVE : BRAND,
          transition: 'width 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)',
        }} />
        <div style={{
          position: 'absolute', top: -2, bottom: -2,
          left: `${threshold}%`, width: 2,
          background: TEXT_MUTED, opacity: 0.5,
        }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Reconsideration banner (existing data, restyled)
// ─────────────────────────────────────────────────────────────────────────

function ReconsiderationBanner({
  request, lang, onRespond, onIgnore,
}: {
  request: ReconsiderationRequest;
  lang: 'ru' | 'uz';
  onRespond: () => void;
  onIgnore: () => void;
}) {
  return (
    <div style={{
      padding: 14, borderRadius: RADIUS_LG,
      background: SURFACE, border: `1px solid ${BRAND_200}`,
      boxShadow: SHADOW_SM,
      display: 'flex', gap: 12,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 12, flex: '0 0 auto',
        background: BRAND_TINT, color: BRAND_DARK,
        display: 'grid', placeItems: 'center',
      }}>
        <AlertTriangle size={20} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: TEXT_PRIMARY }}>
          {lang === 'ru' ? 'Просьба пересмотреть голос' : 'Ovozni qayta ko\'rib chiqish so\'rovi'}
        </div>
        <div style={{ fontSize: 12.5, color: TEXT_SECONDARY, marginTop: 2 }}>
          {request.agendaItemTitle}
        </div>
        {request.messageToResident && (
          <div style={{
            marginTop: 8, padding: '8px 10px',
            background: SURFACE_2, borderRadius: RADIUS_SM,
            fontSize: 12.5, color: TEXT_PRIMARY,
            display: 'flex', gap: 6, alignItems: 'flex-start',
          }}>
            <MessageSquare size={13} style={{ color: BRAND_DARK, flex: '0 0 auto', marginTop: 2 }} />
            <span>{request.messageToResident}</span>
          </div>
        )}
        <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 6 }}>
          {lang === 'ru' ? 'Это только просьба. Вы сами решаете.' : 'Bu faqat iltimos. O\'zingiz hal qilasiz.'}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button onClick={(e) => { e.stopPropagation(); onRespond(); }} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 999, border: 'none',
            background: BRAND, color: '#fff', boxShadow: SHADOW_BRAND,
            fontSize: 13, fontWeight: 700, cursor: 'pointer', font: 'inherit',
          }}>
            <RefreshCw size={14} />
            {lang === 'ru' ? 'Пересмотреть' : 'Qayta ko\'rish'}
          </button>
          <button onClick={(e) => { e.stopPropagation(); onIgnore(); }} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 999,
            background: 'transparent', color: TEXT_SECONDARY,
            border: `1px solid ${BORDER_C}`,
            fontSize: 13, fontWeight: 600, cursor: 'pointer', font: 'inherit',
          }}>
            <X size={14} />
            {lang === 'ru' ? 'Оставить' : 'Qoldirish'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// New-request popup (existing alert, restyled)
// ─────────────────────────────────────────────────────────────────────────

function NewRequestPopup({
  alert, lang, onOpen, onDismiss,
}: {
  alert: ReconsiderationRequest;
  lang: 'ru' | 'uz';
  onOpen: () => void;
  onDismiss: () => void;
}) {
  return (
    <div style={{
      position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
      left: 12, right: 12, zIndex: 150,
      animation: 'slideInFromTop 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
    }}>
      <div style={{
        padding: 14, borderRadius: RADIUS_LG,
        background: SURFACE, border: `1px solid ${BRAND_200}`,
        boxShadow: '0 18px 36px rgba(28,25,23,0.18)',
        display: 'flex', gap: 12, alignItems: 'flex-start',
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12, flex: '0 0 auto',
          background: BRAND_TINT, color: BRAND_DARK,
          display: 'grid', placeItems: 'center',
        }}>
          <AlertTriangle size={20} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT_PRIMARY }}>
            {lang === 'ru' ? 'Запрос на пересмотр' : 'Qayta ko\'rib chiqish so\'rovi'}
          </div>
          <div style={{
            fontSize: 12.5, color: TEXT_SECONDARY, marginTop: 2,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {alert.agendaItemTitle}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={onOpen} style={{
              flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '9px 14px', borderRadius: 999, border: 'none',
              background: BRAND, color: '#fff', boxShadow: SHADOW_BRAND,
              fontSize: 13, fontWeight: 700, cursor: 'pointer', font: 'inherit',
            }}>
              <RefreshCw size={14} />
              {lang === 'ru' ? 'Открыть' : 'Ochish'}
            </button>
            <button onClick={onDismiss} aria-label={lang === 'ru' ? 'Закрыть' : 'Yopish'} style={{
              width: 38, height: 38, borderRadius: 999,
              background: 'transparent', color: TEXT_MUTED,
              border: `1px solid ${BORDER_C}`, cursor: 'pointer',
              display: 'grid', placeItems: 'center',
            }}>
              <X size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────

function EmptyState({ lang }: { lang: 'ru' | 'uz' }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px' }}>
      <div style={{
        width: 72, height: 72, borderRadius: 999,
        background: SURFACE_SUNKEN, color: TEXT_MUTED,
        display: 'grid', placeItems: 'center', margin: '0 auto 16px',
      }}>
        <Vote size={32} />
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: TEXT_PRIMARY }}>
        {lang === 'ru' ? 'Нет активных собраний' : 'Faol yig\'ilishlar yo\'q'}
      </div>
      <div style={{ fontSize: 13.5, color: TEXT_SECONDARY, marginTop: 6, lineHeight: 1.45 }}>
        {lang === 'ru'
          ? 'Здесь появятся новые голосования и протоколы вашего дома.'
          : 'Bu yerda uyingizning yangi ovoz berishlari va bayonnomalari paydo bo\'ladi.'}
      </div>
    </div>
  );
}
