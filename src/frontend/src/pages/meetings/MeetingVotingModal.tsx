// Per-meeting voting flow — Claude Design §03-golosovanie handoff
// (design/handoff/voting-handoff.md). Full-screen overlay:
//   • sticky topbar (back + Голосование + info)
//   • dark amber-stone hero with Идёт chip + meeting #, title, 3 stats
//     (Кворум / Осталось / Бюджет) + quorum bar
//   • agenda list — amber index badge, title + desc + threshold pill,
//     attachments strip, 3-button vote row, live result bar,
//     objection textarea reveal on Against (≥ 20 chars) + optional
//     counter-proposal, optional comment textarea on For/Abstain
//   • info banner about электронный ключ
//   • sticky bottom summary card with Подписать и отправить все голоса
//   • post-vote success screen with ballot summary
//
// Branches:
//   - schedule_poll_open → date poll (one-vote lock + leading badge)
//   - voting_open → the handoff
//   - voting_closed / results_published / protocol_* → read-only results
//
// Wiring is preserved:
//   - voteOnAgendaItem(...) via the `onVote` prop
//   - voteForSchedule(...) via `onScheduleVote`
//   - QRSignatureModal for the e-signature step (the prototype's OTP
//     card was explicitly retracted by the user — see chat1)

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle,
  Clock, FileText, Info, Key, Loader2, Lock, MessageSquare,
  Minus, RefreshCw, Trophy, X,
} from 'lucide-react';
import { useToastStore } from '../../stores/toastStore';
import { useModalPresence } from '../../stores/modalStore';
import { DECISION_THRESHOLD_LABELS, MEETING_STATUS_LABELS } from '../../types';
import type { Meeting, VoteChoice } from '../../types';
import { QRSignatureModal } from '../../components/QRSignatureModal';

// ── shared visual tokens (literal so a rename in global CSS doesn't
//    silently destroy this surface) ─────────────────────────────────
const APP_BG = '#F4F0E8';
const SURFACE = '#FFFFFF';
const SURFACE_SUNKEN = '#F5F5F4';
const TEXT_PRIMARY = '#1C1917';
const TEXT_SECONDARY = '#57534E';
const TEXT_MUTED = '#A8A29E';
const BORDER = '#E7E5E4';
const HAIRLINE = 'rgba(28,25,23,0.06)';
const STONE_50 = '#FAFAF9';
const STONE_100 = '#F5F5F4';
const STONE_150 = '#ECECEA';
const STONE_200 = '#E7E5E4';
const STONE_300 = '#D6D3D1';
const STONE_400 = '#A8A29E';
const AMBER_50 = '#FEF3C7';
const AMBER_100 = '#FDE68A';
const AMBER_600 = '#D97706';
const AMBER_700 = '#B45309';
const SUCCESS = '#15803D';
const SUCCESS_BG = '#DCFCE7';
const SUCCESS_500 = '#16A34A';
const DANGER = '#B91C1C';
const DANGER_BG = '#FEE2E2';
const DANGER_500 = '#DC2626';
const SHADOW_1 = '0 1px 2px rgba(28,25,23,0.04)';
const SHADOW_HERO = '0 14px 36px -10px rgba(68,64,60,0.5)';
const SHADOW_AMBER = '0 10px 28px -8px rgba(217,119,6,0.45)';
const RADIUS_LG = 18;
const RADIUS_HERO = 22;

// Tighter Cyrillic plural for "пункт" labels used in the bottom bar.
const pluralPunkt = (n: number, lang: 'ru' | 'uz'): string => {
  if (lang === 'uz') return 'ta band';
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'пункт';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'пункта';
  return 'пунктов';
};
const pluralVopros = (n: number, lang: 'ru' | 'uz'): string => {
  if (lang === 'uz') return 'savol';
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'вопрос';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'вопроса';
  return 'вопросов';
};

// Try to surface a budget figure for the hero. Looks across
// `budget_approval` items (then the rest) for the largest number, then
// renders it as "{N}М сум" (millions, no decimals). Returns null when
// no parseable figure is found so the hero collapses to a 2-stat grid.
const parseBudgetMillions = (meeting: Meeting): { value: string; sub: string } | null => {
  const items = [
    ...meeting.agendaItems.filter(i => i.type === 'budget_approval'),
    ...meeting.agendaItems.filter(i => i.type !== 'budget_approval'),
  ];
  for (const item of items) {
    const text = `${item.title} ${item.description}`;
    // strip spaces between digit groups so "184 000 000" parses
    const compact = text.replace(/(\d)[\s ](?=\d)/g, '$1');
    const m = compact.match(/(\d[\d.,]{4,})\s*(сум|so'm|som|UZS)/i);
    if (!m) continue;
    const raw = Number(m[1].replace(/[.,]/g, ''));
    if (!Number.isFinite(raw) || raw < 1_000_000) continue;
    const millions = raw / 1_000_000;
    const value = millions >= 100 ? millions.toFixed(0) : millions.toFixed(1).replace(/\.0$/, '');
    return { value: `${value}М`, sub: 'сум' };
  }
  return null;
};

// Relative time-to-deadline for the hero's "Осталось" stat.
const formatTimeLeft = (deadline: string | undefined, lang: 'ru' | 'uz') => {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return { value: lang === 'ru' ? 'Закрыто' : 'Yopildi', sub: '' };
  const mins = Math.floor(ms / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  const subDate = new Date(deadline).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'uz-UZ', {
    day: '2-digit', month: '2-digit',
  });
  if (days >= 1) return { value: `${days} ${lang === 'ru' ? 'дн' : 'kun'}`, sub: `${lang === 'ru' ? 'до' : ''} ${subDate}` };
  if (hrs >= 1) return { value: `${hrs} ${lang === 'ru' ? 'ч' : 'soat'}`, sub: lang === 'ru' ? 'сегодня' : 'bugun' };
  return { value: `${mins} ${lang === 'ru' ? 'мин' : 'daq'}`, sub: lang === 'ru' ? 'сегодня' : 'bugun' };
};

interface VotingModalProps {
  meeting: Meeting;
  language: string;
  user: {
    id: string; name: string; login?: string; address?: string;
    apartment?: string; phone?: string; contractNumber?: string;
  };
  allowRevote?: boolean;
  onClose: () => void;
  getVote: (agendaItemId: string) => { choice: VoteChoice } | undefined;
  onVote: (agendaItemId: string, choice: VoteChoice, verified: boolean, comment?: string, counterProposal?: string) => void;
  getScheduleVote: () => Promise<string | null>;
  onScheduleVote: (optionId: string) => Promise<{ success: boolean; error?: string }>;
  calculateResult: (agendaItemId: string) => {
    votesFor: number; votesAgainst: number; votesAbstain: number;
    totalVotes: number; percentFor: number;
    isApproved: boolean; thresholdMet: boolean;
  };
  calculateQuorum: () => { participated: number; total: number; percent: number; quorumReached: boolean };
}

export function MeetingVotingModal({
  meeting, language, user, allowRevote = false, onClose,
  getVote, onVote, getScheduleVote, onScheduleVote,
  calculateResult, calculateQuorum,
}: VotingModalProps) {
  const lang: 'ru' | 'uz' = language === 'ru' ? 'ru' : 'uz';
  const addToast = useToastStore(s => s.addToast);

  // Hide the global BottomBar while this overlay is up. Restored on unmount.
  useModalPresence(true);

  const [pendingVotes, setPendingVotes] = useState<Record<string, VoteChoice>>({});
  const [pendingComments, setPendingComments] = useState<Record<string, string>>({});
  const [pendingCounterProposals, setPendingCounterProposals] = useState<Record<string, string>>({});
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedScheduleOption, setSelectedScheduleOption] = useState<string | null>(null);
  const [scheduleVoteLoading, setScheduleVoteLoading] = useState(false);
  const [scheduleVoteSuccess, setScheduleVoteSuccess] = useState(false);
  const [previousVote, setPreviousVote] = useState<string | null>(null);
  const [votesSubmitted, setVotesSubmitted] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const pendingVotesInitialized = useRef(false);

  // Load any prior schedule vote on mount.
  useEffect(() => {
    getScheduleVote().then(vote => {
      setSelectedScheduleOption(vote);
      setPreviousVote(vote);
    });
  }, [getScheduleVote]);

  // In revote mode, prefill pendingVotes with the existing submitted choices
  // so the buttons land selected and the user can change them.
  useEffect(() => {
    if (allowRevote && !pendingVotesInitialized.current) {
      const existing: Record<string, VoteChoice> = {};
      meeting.agendaItems.forEach(item => {
        const v = getVote(item.id);
        if (v?.choice) existing[item.id] = v.choice;
      });
      if (Object.keys(existing).length > 0) {
        setPendingVotes(existing);
        pendingVotesInitialized.current = true;
      }
    }
    if (!allowRevote) pendingVotesInitialized.current = false;
  }, [allowRevote, meeting.agendaItems, getVote]);

  const quorum = calculateQuorum();
  const isVotingOpen = meeting.status === 'voting_open';
  const isSchedulePoll = meeting.status === 'schedule_poll_open';
  const showResults = ['voting_closed', 'results_published', 'protocol_generated', 'protocol_approved'].includes(meeting.status);
  const hasVotedOnAll = allowRevote ? false : meeting.agendaItems.every(item => getVote(item.id) !== undefined);

  // ── handlers ─────────────────────────────────────────────────────
  // `not_voted` is used by the agenda card as a deselect sentinel
  // (tap the same button to clear). We map that to removing the key so
  // the bottom-bar counts/submit logic only sees real choices.
  const handleVoteClick = (agendaItemId: string, choice: VoteChoice) => {
    setPendingVotes(prev => {
      if (choice === 'not_voted') {
        const { [agendaItemId]: _removed, ...rest } = prev;
        void _removed;
        return rest;
      }
      return { ...prev, [agendaItemId]: choice };
    });
  };

  const allItemsVoted = meeting.agendaItems.every(item =>
    pendingVotes[item.id] || getVote(item.id)
  );
  const votedItemsCount = meeting.agendaItems.filter(item =>
    pendingVotes[item.id] || getVote(item.id)
  ).length;

  const handleConfirmAllVotes = () => {
    if (Object.keys(pendingVotes).length === 0) return;
    // Per-item validation: against requires ≥ 20-char objection.
    for (const [itemId, choice] of Object.entries(pendingVotes)) {
      if (choice === 'against' && (pendingComments[itemId] || '').trim().length < 20) {
        addToast('error', lang === 'ru'
          ? 'Заполните возражение для всех голосов «Против» (мин. 20 символов).'
          : 'Barcha «Qarshi» ovozlar uchun e\'tirozni to\'ldiring (kamida 20 belgi).');
        return;
      }
    }
    setShowSignatureModal(true);
  };

  const handleSignatureVerified = async () => {
    setShowSignatureModal(false);
    setIsSubmitting(true);
    try {
      for (const [agendaItemId, choice] of Object.entries(pendingVotes)) {
        const comment = pendingComments[agendaItemId]?.trim() || undefined;
        const counterProposal = pendingCounterProposals[agendaItemId]?.trim() || undefined;
        await onVote(agendaItemId, choice, true, comment, counterProposal);
      }
      setPendingVotes({});
      setPendingComments({});
      setPendingCounterProposals({});
      setVotesSubmitted(true);
    } catch (error: unknown) {
      console.error('Failed to submit votes:', error);
      const errorMessage = (error instanceof Error ? error.message : null)
        || (lang === 'ru'
          ? 'Ошибка при голосовании. Проверьте что указана площадь квартиры.'
          : 'Ovoz berishda xatolik. Kvartira maydonini tekshiring.');
      addToast('error', errorMessage);
      setVotesSubmitted(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleScheduleVote = async (optionId: string) => {
    if (previousVote) return;
    if (optionId === selectedScheduleOption) return;
    setScheduleVoteLoading(true);
    setScheduleVoteSuccess(false);
    try {
      const result = await onScheduleVote(optionId);
      if (result && !result.success) {
        const errorMsg = result.error || (lang === 'ru'
          ? 'Ошибка при голосовании. Проверьте что указана площадь квартиры.'
          : 'Ovoz berishda xatolik. Kvartira maydonini tekshiring.');
        addToast('error', errorMsg);
        setSelectedScheduleOption('');
        if (errorMsg.includes('не найдено')) {
          onClose();
          window.location.reload();
        }
      } else {
        setSelectedScheduleOption(optionId);
        setScheduleVoteSuccess(true);
        setTimeout(() => {
          setPreviousVote(optionId);
          setScheduleVoteSuccess(false);
        }, 2000);
      }
    } catch (error: unknown) {
      console.error('Failed to vote:', error);
      const errorMessage = (error instanceof Error ? error.message : null) || (lang === 'ru'
        ? 'Ошибка при голосовании. Проверьте что указана площадь квартиры.'
        : 'Ovoz berishda xatolik. Kvartira maydonini tekshiring.');
      addToast('error', errorMessage);
      setSelectedScheduleOption('');
      if (errorMessage.includes('не найдено')) {
        onClose();
        window.location.reload();
      }
    } finally {
      setScheduleVoteLoading(false);
    }
  };

  // Schedule poll helpers (unchanged)
  const totalScheduleVotes = meeting.scheduleOptions.reduce((sum, opt) => sum + (opt.voteCount ?? opt.votes?.length ?? 0), 0);
  const maxVotes = Math.max(0, ...meeting.scheduleOptions.map(opt => opt.voteCount ?? opt.votes?.length ?? 0));
  const leadingOptions = meeting.scheduleOptions.filter(opt =>
    (opt.voteCount ?? opt.votes?.length ?? 0) === maxVotes && maxVotes > 0
  );

  // Memoised hero data
  const heroTitle = meeting.agendaItems[0]?.title || `${lang === 'ru' ? 'Собрание' : 'Yig\'ilish'} #${meeting.number}`;
  const heroBudget = useMemo(() => parseBudgetMillions(meeting), [meeting]);
  const heroDeadline = useMemo(() => {
    const src = isSchedulePoll ? meeting.schedulePollEndsAt : meeting.votingClosedAt;
    return formatTimeLeft(src, lang);
  }, [meeting.votingClosedAt, meeting.schedulePollEndsAt, isSchedulePoll, lang]);

  const heroChip = (() => {
    switch (meeting.status) {
      case 'voting_open':       return { label: lang === 'ru' ? 'Идёт' : 'Davom etmoqda', dot: '#FB923C', fg: '#FB923C', bg: 'rgba(251,191,36,0.22)' };
      case 'schedule_poll_open':return { label: lang === 'ru' ? 'Опрос даты' : 'Sana so\'rovi', dot: '#FB923C', fg: '#FB923C', bg: 'rgba(251,191,36,0.22)' };
      case 'voting_closed':
      case 'results_published': return { label: lang === 'ru' ? 'Подсчёт' : 'Sanash', dot: '#FCD34D', fg: '#FCD34D', bg: 'rgba(252,211,77,0.20)' };
      case 'protocol_approved':
      case 'protocol_generated':return { label: lang === 'ru' ? 'Завершено' : 'Tugadi', dot: 'rgba(255,255,255,0.55)', fg: 'rgba(255,255,255,0.85)', bg: 'rgba(255,255,255,0.10)' };
      default:                  return { label: MEETING_STATUS_LABELS[meeting.status]?.label || '', dot: '#FB923C', fg: '#FB923C', bg: 'rgba(251,191,36,0.22)' };
    }
  })();

  // Post-vote success view replaces the entire body once submission succeeds.
  if (votesSubmitted) {
    return (
      <div style={pageStyle()}>
        <TopBar title={lang === 'ru' ? 'Голос принят' : 'Ovoz qabul qilindi'} onBack={onClose} />
        <BallotReceipt
          meeting={meeting}
          lang={lang}
          // Use the last submission's data we cached locally: pendingVotes was cleared,
          // so derive choices from the store (getVote).
          getChoice={(id) => getVote(id)?.choice ?? null}
          user={user}
          onClose={onClose}
          deadline={meeting.votingClosedAt}
        />
      </div>
    );
  }

  return (
    <div style={pageStyle()}>
      <TopBar
        title={lang === 'ru' ? 'Голосование' : 'Ovoz berish'}
        subtitle={`#${meeting.number}`}
        onBack={onClose}
        onInfo={() => setHelpOpen(true)}
      />

      <div style={{ paddingBottom: isVotingOpen && Object.keys(pendingVotes).length > 0 ? 200 : 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}>
        {/* Revote banner */}
        {allowRevote && (
          <div style={{
            margin: '14px 16px 0', padding: 12, borderRadius: 14,
            background: '#FFF7ED', border: '1px solid #FFEDD5',
            display: 'flex', gap: 10,
          }}>
            <RefreshCw size={18} style={{ color: '#EA580C', flex: '0 0 auto', marginTop: 1 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 650, color: '#9A3412' }}>
                {lang === 'ru' ? 'Изменение голоса' : 'Ovozni o\'zgartirish'}
              </div>
              <div style={{ fontSize: 12, color: '#C2410C', marginTop: 2, lineHeight: 1.4 }}>
                {lang === 'ru'
                  ? 'Выберите новый вариант голоса и подтвердите изменение.'
                  : 'Yangi ovoz variantini tanlang va o\'zgartirishni tasdiqlang.'}
              </div>
            </div>
          </div>
        )}

        {/* Hero — only when there's something to show beyond date poll */}
        {!isSchedulePoll && (
          <VoteHero
            chip={heroChip}
            meetingNumber={meeting.number}
            title={heroTitle}
            quorumPercent={Number.isFinite(quorum.percent) ? quorum.percent : 0}
            quorumParticipated={quorum.participated}
            quorumTotal={quorum.total}
            quorumThreshold={meeting.votingSettings?.quorumPercent || 50}
            deadline={heroDeadline}
            budget={heroBudget}
            lang={lang}
          />
        )}

        {/* Schedule-poll branch */}
        {isSchedulePoll && (
          <SchedulePoll
            meeting={meeting}
            lang={lang}
            selectedOption={selectedScheduleOption}
            previousVote={previousVote}
            loading={scheduleVoteLoading}
            success={scheduleVoteSuccess}
            onVote={handleScheduleVote}
            leadingOptions={leadingOptions}
            totalVotes={totalScheduleVotes}
          />
        )}

        {/* Agenda — voting or read-only results */}
        {(isVotingOpen || showResults) && (
          <div style={{ padding: '0 16px', marginTop: 22 }}>
            <div style={sectionTitleStyle}>
              {lang === 'ru' ? 'Повестка' : 'Kun tartibi'} · {meeting.agendaItems.length} {pluralVopros(meeting.agendaItems.length, lang)}
            </div>

            {meeting.agendaItems.map((item, idx) => {
              const existingVote = getVote(item.id);
              const pendingChoice = pendingVotes[item.id];
              const currentChoice = pendingChoice || existingVote?.choice;
              const result = calculateResult(item.id);
              return (
                <AgendaCard
                  key={item.id}
                  idx={idx}
                  item={item}
                  currentChoice={currentChoice}
                  isVotingOpen={isVotingOpen && !hasVotedOnAll}
                  showResults={showResults || (isVotingOpen && meeting.votingSettings?.showIntermediateResults)}
                  result={result}
                  lang={lang}
                  comment={pendingComments[item.id] || ''}
                  counterProposal={pendingCounterProposals[item.id] || ''}
                  isSubmitting={isSubmitting}
                  isSubmitted={!!existingVote && (!pendingChoice || pendingChoice === existingVote.choice)}
                  onVote={(choice) => handleVoteClick(item.id, choice)}
                  onComment={(t) => setPendingComments(prev => ({ ...prev, [item.id]: t }))}
                  onCounterProposal={(t) => setPendingCounterProposals(prev => ({ ...prev, [item.id]: t }))}
                />
              );
            })}
          </div>
        )}

        {/* Voting open: e-key legal note */}
        {isVotingOpen && (
          <div style={{ padding: '8px 16px 0', marginTop: 8 }}>
            <div style={{
              padding: 12, borderRadius: 12,
              background: STONE_100, border: `1px solid ${BORDER}`,
              display: 'flex', gap: 10, alignItems: 'flex-start',
            }}>
              <Lock size={16} style={{ color: TEXT_MUTED, flex: '0 0 auto', marginTop: 1 }} />
              <div style={{ fontSize: 12, color: TEXT_SECONDARY, lineHeight: 1.4 }}>
                {lang === 'ru'
                  ? 'Голос подтверждается электронным ключом и юридически приравнивается к подписи на собрании собственников.'
                  : 'Ovoz elektron kalit bilan tasdiqlanadi va mulkdorlar yig\'ilishidagi imzoga huquqiy jihatdan tenglashtiriladi.'}
              </div>
            </div>
          </div>
        )}

        {/* Voting open, already voted: thanks */}
        {isVotingOpen && hasVotedOnAll && !votesSubmitted && (
          <div style={{ padding: '8px 16px 0', marginTop: 12 }}>
            <div style={{
              padding: 14, borderRadius: 16,
              background: SUCCESS_BG, border: '1px solid #BBF7D0',
              display: 'flex', gap: 10, alignItems: 'center',
            }}>
              <CheckCircle size={20} style={{ color: SUCCESS_500, flex: '0 0 auto' }} />
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 650, color: '#166534' }}>
                  {lang === 'ru' ? 'Спасибо за участие!' : 'Ishtirok uchun rahmat!'}
                </div>
                <div style={{ fontSize: 12, color: SUCCESS, marginTop: 1 }}>
                  {lang === 'ru' ? 'Все ваши голоса учтены.' : 'Barcha ovozlaringiz hisobga olindi.'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sticky bottom summary card (voting open + pending votes) */}
      {isVotingOpen && Object.keys(pendingVotes).length > 0 && (
        <BottomSummary
          pendingVotes={pendingVotes}
          totalItems={meeting.agendaItems.length}
          votedItemsCount={votedItemsCount}
          allItemsVoted={allItemsVoted}
          isSubmitting={isSubmitting}
          onConfirm={handleConfirmAllVotes}
          lang={lang}
        />
      )}

      {/* Info sheet ("Как считают голоса") */}
      {helpOpen && <HelpSheet onClose={() => setHelpOpen(false)} lang={lang} threshold={meeting.votingSettings?.quorumPercent || 50} />}

      {/* QR signature step (existing component) */}
      <QRSignatureModal
        isOpen={showSignatureModal}
        onClose={() => setShowSignatureModal(false)}
        onVerified={handleSignatureVerified}
        user={user}
        language={language}
        title={lang === 'ru' ? 'Подтверждение голосов' : 'Ovozlarni tasdiqlash'}
        description={lang === 'ru'
          ? `Подтвердите, что все ${Object.keys(pendingVotes).length} голос(ов) поданы вами лично. Нажмите «Подтвердить» для подписи электронным ключом.`
          : `Barcha ${Object.keys(pendingVotes).length} ta ovoz sizning tomoningizdan berilganligini tasdiqlang. Elektron kalit bilan imzolash uchun «Tasdiqlash» tugmasini bosing.`}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Layout chrome
// ─────────────────────────────────────────────────────────────────────────

const pageStyle = (): React.CSSProperties => ({
  position: 'fixed', inset: 0, zIndex: 110,
  background: APP_BG, color: TEXT_PRIMARY,
  overflowY: 'auto', WebkitOverflowScrolling: 'touch',
  letterSpacing: '-0.01em',
});

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 12.5, fontWeight: 600, letterSpacing: '0.04em',
  color: TEXT_MUTED, textTransform: 'uppercase',
  padding: '0 4px 10px',
};

function TopBar({ title, subtitle, onBack, onInfo }: { title: string; subtitle?: string; onBack: () => void; onInfo?: () => void }) {
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 5,
      padding: 'calc(env(safe-area-inset-top, 0px) + 14px) 16px 12px',
      background: 'rgba(245,245,244,0.85)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      borderBottom: `1px solid ${HAIRLINE}`,
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <button onClick={onBack} aria-label="Назад" style={topbarIconBtn}>
        <ArrowLeft size={18} />
      </button>
      <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 650, letterSpacing: '-0.01em', color: TEXT_PRIMARY }}>{title}</div>
        {subtitle && (
          <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>{subtitle}</div>
        )}
      </div>
      {onInfo ? (
        <button onClick={onInfo} aria-label="Как считают голоса" style={topbarIconBtn}>
          <Info size={18} />
        </button>
      ) : <div style={{ width: 36 }} />}
    </div>
  );
}

const topbarIconBtn: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 999,
  background: SURFACE, border: `1px solid ${BORDER}`,
  display: 'grid', placeItems: 'center', cursor: 'pointer',
  color: TEXT_SECONDARY,
};

// ─────────────────────────────────────────────────────────────────────────
// Vote hero
// ─────────────────────────────────────────────────────────────────────────

function VoteHero({
  chip, meetingNumber, title, quorumPercent, quorumParticipated, quorumTotal,
  quorumThreshold, deadline, budget, lang,
}: {
  chip: { label: string; dot: string; fg: string; bg: string };
  meetingNumber: number;
  title: string;
  quorumPercent: number;
  quorumParticipated: number;
  quorumTotal: number;
  quorumThreshold: number;
  deadline: { value: string; sub: string } | null;
  budget: { value: string; sub: string } | null;
  lang: 'ru' | 'uz';
}) {
  const fillPct = Math.max(0, Math.min(100, quorumPercent));
  const stats: Array<{ label: string; value: string; sub: string }> = [
    {
      label: lang === 'ru' ? 'Кворум' : 'Kvorum',
      value: `${fillPct.toFixed(0)}%`,
      sub: `${quorumParticipated} ${lang === 'ru' ? 'из' : '/'} ${quorumTotal}`,
    },
  ];
  if (deadline) stats.push({ label: lang === 'ru' ? 'Осталось' : 'Qoldi', value: deadline.value, sub: deadline.sub });
  if (budget) stats.push({ label: lang === 'ru' ? 'Бюджет' : 'Byudjet', value: budget.value, sub: budget.sub });

  return (
    <div style={{
      margin: '14px 16px 0', padding: 18, borderRadius: RADIUS_HERO,
      position: 'relative', overflow: 'hidden', color: '#fff',
      background: 'linear-gradient(155deg, #92400E 0%, #44403C 100%)',
      boxShadow: SHADOW_HERO,
    }}>
      <div style={{ position: 'absolute', right: -40, top: -40, width: 160, height: 160, borderRadius: 999, background: 'rgba(251,191,36,0.18)' }} />
      <div style={{ position: 'absolute', right: 60, bottom: -60, width: 120, height: 120, borderRadius: 999, background: 'rgba(251,191,36,0.10)' }} />

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 9px', borderRadius: 999,
          background: chip.bg, color: chip.fg,
          fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: chip.dot }} />
          {chip.label}
        </span>
        <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.7)', fontVariantNumeric: 'tabular-nums' }}>
          {lang === 'ru' ? 'Голосование' : 'Ovoz berish'} №{meetingNumber}
        </span>
      </div>

      <div style={{
        position: 'relative', fontSize: 19, fontWeight: 650, lineHeight: 1.25,
        letterSpacing: '-0.02em',
      }}>
        {title}
      </div>

      <div style={{
        position: 'relative', marginTop: 14,
        display: 'grid',
        gridTemplateColumns: `repeat(${stats.length}, 1fr)`,
        gap: 10,
      }}>
        {stats.map((s, i) => (
          <div key={s.label} style={{
            padding: '10px 0',
            borderRight: i < stats.length - 1 ? '1px solid rgba(255,255,255,0.12)' : 'none',
          }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {s.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
              {s.value}
            </div>
            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.6)', marginTop: 1 }}>
              {s.sub}
            </div>
          </div>
        ))}
      </div>

      <div style={{ position: 'relative', marginTop: 14 }}>
        <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.18)' }}>
          <div style={{ width: `${fillPct}%`, height: '100%', borderRadius: 999, background: '#FB923C' }} />
        </div>
        <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
          {lang === 'ru'
            ? `Для принятия решения нужно ≥ ${quorumThreshold}% голосов от собственников`
            : `Qaror qabul qilish uchun mulkdorlarning ≥ ${quorumThreshold}% ovozi kerak`}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Agenda card
// ─────────────────────────────────────────────────────────────────────────

function AgendaCard({
  idx, item, currentChoice, isVotingOpen, showResults, result,
  lang, comment, counterProposal, isSubmitting, isSubmitted,
  onVote, onComment, onCounterProposal,
}: {
  idx: number;
  item: Meeting['agendaItems'][number];
  currentChoice: VoteChoice | undefined;
  isVotingOpen: boolean;
  showResults: boolean;
  result: {
    votesFor: number; votesAgainst: number; votesAbstain: number;
    totalVotes: number; percentFor: number; isApproved: boolean; thresholdMet: boolean;
  };
  lang: 'ru' | 'uz';
  comment: string;
  counterProposal: string;
  isSubmitting: boolean;
  isSubmitted: boolean;
  onVote: (choice: VoteChoice) => void;
  onComment: (t: string) => void;
  onCounterProposal: (t: string) => void;
}) {
  const attachments = Array.isArray(item.attachments) ? item.attachments : [];

  // Live counts shown on the buttons include the user's pending choice
  // (the prototype's UX trick — bar moves the moment you tap).
  const baseFor = result.votesFor;
  const baseAgainst = result.votesAgainst;
  const baseAbstain = result.votesAbstain;
  const liveFor = baseFor + (currentChoice === 'for' && !isSubmitted ? 1 : 0);
  const liveAgainst = baseAgainst + (currentChoice === 'against' && !isSubmitted ? 1 : 0);
  const liveAbstain = baseAbstain + (currentChoice === 'abstain' && !isSubmitted ? 1 : 0);
  const liveTotal = liveFor + liveAgainst + liveAbstain;

  return (
    <div style={{
      background: SURFACE, border: `1px solid ${BORDER}`,
      borderRadius: RADIUS_LG, padding: 16, marginBottom: 10,
      boxShadow: SHADOW_1,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
        <div style={{
          width: 26, height: 26, borderRadius: 8,
          background: AMBER_50, color: AMBER_700,
          display: 'grid', placeItems: 'center',
          fontSize: 13, fontWeight: 700, flex: '0 0 auto',
        }}>
          {idx + 1}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 650, letterSpacing: '-0.01em', lineHeight: 1.3, color: TEXT_PRIMARY }}>
            {item.title}
          </div>
          {item.description && (
            <div style={{ fontSize: 12.5, color: TEXT_SECONDARY, marginTop: 4, lineHeight: 1.4 }}>
              {item.description}
            </div>
          )}
          <div style={{ marginTop: 6 }}>
            <span style={{
              display: 'inline-block',
              fontSize: 10.5, fontWeight: 600, letterSpacing: '0.02em',
              padding: '2px 8px', borderRadius: 999,
              background: STONE_150, color: TEXT_SECONDARY,
            }}>
              {lang === 'ru'
                ? DECISION_THRESHOLD_LABELS[item.threshold]?.label
                : DECISION_THRESHOLD_LABELS[item.threshold]?.labelUz}
            </span>
          </div>
        </div>
      </div>

      {/* Attachments strip */}
      {attachments.length > 0 && (
        <div style={{
          marginBottom: 12,
          display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2,
          WebkitOverflowScrolling: 'touch',
        }}>
          {attachments.map((att, i) => {
            const isImg = att.type?.startsWith('image/');
            return isImg ? (
              <a key={i} href={att.url} target="_blank" rel="noopener noreferrer"
                title={att.name}
                onClick={(e) => e.stopPropagation()}
                style={{ flex: '0 0 auto', width: 80, height: 80, borderRadius: 12, overflow: 'hidden', border: `1px solid ${BORDER}`, background: STONE_100 }}>
                <img src={att.url} alt={att.name} loading="lazy" decoding="async"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </a>
            ) : (
              <a key={i} href={att.url} download={att.name} target="_blank" rel="noopener noreferrer"
                title={att.name}
                onClick={(e) => e.stopPropagation()}
                style={{
                  flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px', borderRadius: 12,
                  background: SURFACE, border: `1px solid ${BORDER}`,
                  maxWidth: 180, textDecoration: 'none', color: TEXT_PRIMARY,
                }}>
                <FileText size={14} style={{ color: TEXT_MUTED, flex: '0 0 auto' }} />
                <span style={{ fontSize: 12, color: TEXT_SECONDARY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{att.name}</span>
              </a>
            );
          })}
        </div>
      )}

      {/* Vote button row */}
      {isVotingOpen && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 6 }}>
          <VoteBtn kind="for" label={lang === 'ru' ? 'За' : 'Ha'}
            count={liveFor} total={liveTotal}
            selected={currentChoice === 'for'} disabled={isSubmitting}
            onClick={() => onVote(currentChoice === 'for' ? ('not_voted' as VoteChoice) : 'for')} />
          <VoteBtn kind="against" label={lang === 'ru' ? 'Против' : 'Yo\'q'}
            count={liveAgainst} total={liveTotal}
            selected={currentChoice === 'against'} disabled={isSubmitting}
            onClick={() => onVote(currentChoice === 'against' ? ('not_voted' as VoteChoice) : 'against')} />
          <VoteBtn kind="abstain" label={lang === 'ru' ? 'Воздерж.' : 'Betaraf'}
            count={liveAbstain} total={liveTotal}
            selected={currentChoice === 'abstain'} disabled={isSubmitting}
            onClick={() => onVote(currentChoice === 'abstain' ? ('not_voted' as VoteChoice) : 'abstain')} />
        </div>
      )}

      {/* Live result bar */}
      {(showResults || isVotingOpen) && (
        <div style={{
          marginTop: 12, height: 4, borderRadius: 999,
          background: STONE_150, display: 'flex', overflow: 'hidden',
        }}>
          {liveTotal > 0 ? (
            <>
              <div style={{ width: `${(liveFor / liveTotal) * 100}%`, background: SUCCESS_500 }} />
              <div style={{ width: `${(liveAgainst / liveTotal) * 100}%`, background: DANGER_500 }} />
              <div style={{ width: `${(liveAbstain / liveTotal) * 100}%`, background: STONE_400 }} />
            </>
          ) : null}
        </div>
      )}

      {/* Read-only outcome chip */}
      {showResults && item.isApproved !== undefined && (
        <div style={{ marginTop: 10 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 999,
            background: item.isApproved ? SUCCESS_BG : DANGER_BG,
            color: item.isApproved ? SUCCESS : DANGER,
            fontSize: 12, fontWeight: 650,
          }}>
            {item.isApproved
              ? (lang === 'ru' ? 'Принято' : 'Qabul qilindi')
              : (lang === 'ru' ? 'Не принято' : 'Rad etildi')}
          </span>
        </div>
      )}

      {/* Objection (Against) */}
      {isVotingOpen && currentChoice === 'against' && (
        <div style={{
          marginTop: 12, padding: 12,
          background: '#FEF2F2', borderRadius: 12,
          border: '1px solid #FECACA',
        }}>
          <div style={{
            fontSize: 12, fontWeight: 600, color: '#991B1B',
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
          }}>
            <AlertTriangle size={13} />
            {lang === 'ru' ? 'Обоснуйте возражение' : 'E\'tirozni asoslang'}
          </div>
          <textarea
            value={comment}
            onChange={(e) => onComment(e.target.value)}
            placeholder={lang === 'ru'
              ? 'Например: смета завышена по сравнению с похожими проектами в районе...'
              : 'Masalan: smeta tumanidagi shunga oʻxshash loyihalarga nisbatan oshirib yuborilgan...'}
            maxLength={1000}
            style={{
              width: '100%', minHeight: 64, padding: '10px 12px',
              background: '#fff', border: '1px solid #FECACA', borderRadius: 10,
              fontFamily: 'inherit', fontSize: 13, color: TEXT_PRIMARY,
              resize: 'none', outline: 'none', lineHeight: 1.4, boxSizing: 'border-box',
            }}
          />
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginTop: 4, fontSize: 11, color: '#7F1D1D',
          }}>
            <span>
              {comment.length > 0 && comment.length < 20
                ? (lang === 'ru' ? `Ещё ${20 - comment.length} симв.` : `Yana ${20 - comment.length} belgi`)
                : (lang === 'ru' ? 'Возражение прикрепляется к протоколу собрания.' : 'E\'tiroz yig\'ilish bayonnomasiga biriktiriladi.')}
            </span>
            <span style={{ color: '#A8A29E' }}>{comment.length}/1000</span>
          </div>

          {/* Optional counter-proposal */}
          <div style={{ marginTop: 10 }}>
            <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: AMBER_700, marginBottom: 4 }}>
              {lang === 'ru' ? 'Альтернативное предложение (необязательно)' : 'Muqobil taklif (ixtiyoriy)'}
            </label>
            <textarea
              value={counterProposal}
              onChange={(e) => onCounterProposal(e.target.value)}
              placeholder={lang === 'ru' ? 'Предложите свой вариант решения...' : 'O\'z yechim variantingizni taklif qiling...'}
              maxLength={1000}
              style={{
                width: '100%', minHeight: 44, padding: '8px 12px',
                background: '#fff', border: `1px solid ${AMBER_100}`, borderRadius: 10,
                fontFamily: 'inherit', fontSize: 13, color: TEXT_PRIMARY,
                resize: 'none', outline: 'none', lineHeight: 1.4, boxSizing: 'border-box',
              }}
            />
            <div style={{ marginTop: 2, textAlign: 'right', fontSize: 11, color: '#A8A29E' }}>
              {counterProposal.length}/1000
            </div>
          </div>
        </div>
      )}

      {/* Optional comment on For / Abstain */}
      {isVotingOpen && currentChoice && currentChoice !== 'against' && (
        <div style={{ marginTop: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: TEXT_MUTED, marginBottom: 4 }}>
            <MessageSquare size={12} />
            {lang === 'ru' ? 'Обоснование (будет в протоколе)' : 'Asoslash (bayonnomada bo\'ladi)'}
          </label>
          <textarea
            value={comment}
            onChange={(e) => onComment(e.target.value)}
            placeholder={lang === 'ru' ? 'Почему вы так проголосовали? (необязательно)' : 'Nima uchun shunday ovoz berdingiz? (ixtiyoriy)'}
            maxLength={500}
            style={{
              width: '100%', minHeight: 44, padding: '8px 12px',
              background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10,
              fontFamily: 'inherit', fontSize: 13, color: TEXT_PRIMARY,
              resize: 'none', outline: 'none', lineHeight: 1.4, boxSizing: 'border-box',
            }}
          />
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginTop: 2, fontSize: 11, color: TEXT_MUTED,
          }}>
            <span>{lang === 'ru' ? 'Будет виден в протоколе собрания' : 'Yig\'ilish bayonnomasida ko\'rinadi'}</span>
            <span>{comment.length}/500</span>
          </div>
        </div>
      )}
    </div>
  );
}

function VoteBtn({
  kind, label, count, total, selected, disabled, onClick,
}: {
  kind: 'for' | 'against' | 'abstain';
  label: string; count: number; total: number;
  selected: boolean; disabled: boolean; onClick: () => void;
}) {
  const colors = {
    for:     { fg: SUCCESS, bg: SUCCESS_BG, sel: SUCCESS_500 },
    against: { fg: DANGER,  bg: DANGER_BG,  sel: DANGER_500 },
    abstain: { fg: '#57534E', bg: '#F5F5F4', sel: '#78716C' },
  }[kind];
  const Glyph = kind === 'for' ? Check : kind === 'against' ? X : Minus;
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <button onClick={onClick} disabled={disabled} style={{
      cursor: disabled ? 'default' : 'pointer', border: 'none',
      padding: '10px 8px', borderRadius: 12,
      background: selected ? colors.sel : colors.bg,
      color: selected ? '#fff' : colors.fg,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      position: 'relative',
      boxShadow: selected ? `0 4px 12px ${colors.sel}40` : 'none',
      transition: 'all 0.15s', opacity: disabled ? 0.7 : 1,
      font: 'inherit',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Glyph size={14} strokeWidth={2.6} />
        <span style={{ fontSize: 12.5, fontWeight: 650 }}>{label}</span>
      </div>
      <div style={{ fontSize: 10.5, opacity: 0.85, fontVariantNumeric: 'tabular-nums' }}>
        {count} · {pct}%
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Bottom summary card
// ─────────────────────────────────────────────────────────────────────────

function BottomSummary({
  pendingVotes, totalItems, votedItemsCount, allItemsVoted, isSubmitting,
  onConfirm, lang,
}: {
  pendingVotes: Record<string, VoteChoice>;
  totalItems: number; votedItemsCount: number; allItemsVoted: boolean;
  isSubmitting: boolean; onConfirm: () => void; lang: 'ru' | 'uz';
}) {
  const counts = { for: 0, against: 0, abstain: 0 };
  Object.values(pendingVotes).forEach(v => {
    if (v === 'for' || v === 'against' || v === 'abstain') counts[v]++;
  });
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30,
      padding: `12px 16px calc(env(safe-area-inset-bottom, 0px) + 18px)`,
      background: 'linear-gradient(180deg, rgba(244,240,232,0) 0%, rgba(244,240,232,0.95) 25%, #F4F0E8 100%)',
      backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
    }}>
      <div style={{
        background: SURFACE, border: `1px solid ${BORDER}`,
        borderRadius: 20, padding: 14,
        boxShadow: '0 8px 24px rgba(28,25,23,0.10)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: TEXT_SECONDARY }}>
            {lang === 'ru' ? 'Заполнено' : 'To\'ldirildi'}{' '}
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: TEXT_PRIMARY }}>
              {votedItemsCount}/{totalItems}
            </span>{' '}
            {pluralPunkt(totalItems, lang)}
          </div>
          <div style={{ display: 'flex', gap: 10, fontSize: 11.5, fontWeight: 600 }}>
            <span style={{ color: SUCCESS }}>{lang === 'ru' ? 'За' : 'Ha'} {counts.for}</span>
            <span style={{ color: DANGER }}>{lang === 'ru' ? 'Против' : 'Yo\'q'} {counts.against}</span>
            <span style={{ color: TEXT_MUTED }}>{lang === 'ru' ? 'Воздерж.' : 'Betaraf'} {counts.abstain}</span>
          </div>
        </div>
        <button
          onClick={onConfirm}
          disabled={!allItemsVoted || isSubmitting}
          style={{
            width: '100%', padding: '14px 16px', borderRadius: 14, border: 'none',
            cursor: (allItemsVoted && !isSubmitting) ? 'pointer' : 'default',
            background: allItemsVoted ? AMBER_600 : STONE_200,
            color: allItemsVoted ? '#fff' : TEXT_MUTED,
            fontSize: 15, fontWeight: 650, letterSpacing: '-0.01em',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: allItemsVoted ? SHADOW_AMBER : 'none',
            font: 'inherit',
          }}>
          {isSubmitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              {lang === 'ru' ? 'Отправка...' : 'Yuborilmoqda...'}
            </>
          ) : allItemsVoted ? (
            <>
              <Key size={16} />
              {lang === 'ru' ? 'Подписать и отправить все голоса' : 'Imzolash va barcha ovozlarni yuborish'}
              <ArrowRight size={16} strokeWidth={2.4} />
            </>
          ) : (
            <>
              {lang === 'ru'
                ? `Заполните все ${totalItems} ${pluralPunkt(totalItems, lang)}`
                : `Barcha ${totalItems} ta bandni to'ldiring`}
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Schedule poll (date poll) — visually aligned to new tokens
// ─────────────────────────────────────────────────────────────────────────

function SchedulePoll({
  meeting, lang, selectedOption, previousVote, loading, success,
  onVote, leadingOptions, totalVotes,
}: {
  meeting: Meeting; lang: 'ru' | 'uz';
  selectedOption: string | null;
  previousVote: string | null;
  loading: boolean; success: boolean;
  onVote: (id: string) => void;
  leadingOptions: Meeting['scheduleOptions'];
  totalVotes: number;
}) {
  const formatShort = (s: string) => new Date(s).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'uz-UZ', {
    weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
  return (
    <div style={{ padding: '0 16px', marginTop: 22 }}>
      <div style={sectionTitleStyle}>
        {lang === 'ru' ? 'Голосование за дату' : 'Sana uchun ovoz berish'} · {totalVotes} {lang === 'ru' ? 'голосов' : 'ovoz'}
      </div>

      {meeting.schedulePollEndsAt && (
        <div style={{ marginBottom: 8, fontSize: 12, color: TEXT_SECONDARY, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Clock size={13} />
          {lang === 'ru' ? 'Опрос до' : 'So\'rovnoma'} {new Date(meeting.schedulePollEndsAt).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'uz-UZ', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })}
        </div>
      )}

      {!previousVote && !selectedOption && (
        <div style={{
          padding: 12, borderRadius: 12, marginBottom: 10,
          background: '#FFF7ED', border: '1px solid #FFEDD5',
          display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: '#9A3412',
        }}>
          <ArrowRight size={14} />
          {lang === 'ru' ? 'Выберите удобную дату — голос засчитывается сразу.' : 'Qulay sanani tanlang — ovoz darhol qabul qilinadi.'}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {meeting.scheduleOptions.map((option, index) => {
          const isSelected = selectedOption === option.id;
          const optionVoteCount = option.voteCount ?? option.votes?.length ?? 0;
          const isLeading = leadingOptions.some(lo => lo.id === option.id);
          const votePercent = totalVotes > 0 ? (optionVoteCount / totalVotes) * 100 : 0;
          const alreadyVoted = !!previousVote;
          return (
            <button
              key={option.id}
              onClick={() => !alreadyVoted && !loading && onVote(option.id)}
              disabled={alreadyVoted || loading}
              style={{
                position: 'relative', overflow: 'hidden', textAlign: 'left',
                padding: 14, borderRadius: 14, font: 'inherit',
                background: isSelected ? SUCCESS_BG : SURFACE,
                border: `1.5px solid ${isSelected ? SUCCESS_500 : BORDER}`,
                color: TEXT_PRIMARY, cursor: (alreadyVoted || loading) ? 'default' : 'pointer',
                boxShadow: SHADOW_1, width: '100%',
              }}>
              {totalVotes > 0 && (
                <div style={{
                  position: 'absolute', inset: 0,
                  background: isSelected ? 'rgba(22,163,74,0.10)' : 'rgba(217,119,6,0.08)',
                  width: `${votePercent}%`, transition: 'width 0.5s ease',
                }} />
              )}
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 999,
                    background: isSelected ? SUCCESS_500 : STONE_100,
                    color: isSelected ? '#fff' : TEXT_SECONDARY,
                    display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700,
                    flex: '0 0 auto',
                  }}>
                    {isSelected ? <CheckCircle size={16} /> : index + 1}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 650 }}>{formatShort(option.dateTime)}</div>
                    {isLeading && !isSelected && optionVoteCount > 0 && (
                      <div style={{ fontSize: 11, color: AMBER_700, display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <Trophy size={11} />
                        {lang === 'ru' ? 'Лидирует' : 'Yetakchi'}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', flex: '0 0 auto' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: isSelected ? '#15803D' : TEXT_PRIMARY }}>{optionVoteCount}</div>
                  {totalVotes > 0 && <div style={{ fontSize: 11, color: TEXT_MUTED }}>{votePercent.toFixed(0)}%</div>}
                </div>
                {loading && isSelected && (
                  <Loader2 size={18} className="animate-spin" style={{ color: SUCCESS_500 }} />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {previousVote && (
        <div style={{
          marginTop: 12, padding: 12, borderRadius: 14,
          background: SUCCESS_BG, border: '1px solid #BBF7D0',
          display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <CheckCircle size={18} style={{ color: SUCCESS_500, flex: '0 0 auto', marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 650, color: '#166534' }}>
              {lang === 'ru' ? 'Вы уже проголосовали!' : 'Siz allaqachon ovoz berdingiz!'}
            </div>
            <div style={{ fontSize: 12, color: SUCCESS, marginTop: 1 }}>
              {lang === 'ru'
                ? 'Ваш голос учтён. Ожидайте подтверждения даты администратором.'
                : 'Ovozingiz hisobga olindi. Administrator sanani tasdiqlaguncha kuting.'}
            </div>
          </div>
        </div>
      )}

      {success && !previousVote && (
        <div style={{
          marginTop: 12, padding: 12, borderRadius: 14,
          background: '#BBF7D0', border: '1px solid #86EFAC',
          display: 'flex', gap: 10, alignItems: 'center',
        }}>
          <CheckCircle size={18} style={{ color: SUCCESS_500 }} />
          <div style={{ fontSize: 13.5, fontWeight: 650, color: '#14532D' }}>
            {lang === 'ru' ? 'Голос принят!' : 'Ovoz qabul qilindi!'}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Post-vote success — ballot summary
// ─────────────────────────────────────────────────────────────────────────

function BallotReceipt({
  meeting, lang, user, getChoice, deadline, onClose,
}: {
  meeting: Meeting; lang: 'ru' | 'uz';
  user: { id: string };
  getChoice: (id: string) => VoteChoice | null;
  deadline?: string;
  onClose: () => void;
}) {
  const ballotNumber = `${meeting.number.toString().padStart(4, '0')}-${user.id.slice(-4).toUpperCase()}`;
  const deadlineLabel = deadline
    ? new Date(deadline).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'uz-UZ', { day: '2-digit', month: 'long' })
    : null;
  return (
    <div style={{ padding: '40px 24px', textAlign: 'center' }}>
      <div style={{
        width: 88, height: 88, borderRadius: 999,
        background: SUCCESS_BG, color: SUCCESS,
        display: 'grid', placeItems: 'center', margin: '0 auto 18px',
      }}>
        <Check size={44} strokeWidth={2.6} />
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: TEXT_PRIMARY }}>
        {lang === 'ru' ? 'Спасибо, ваш голос учтён' : 'Rahmat, ovozingiz hisobga olindi'}
      </div>
      <div style={{ fontSize: 14, color: TEXT_SECONDARY, marginTop: 10, lineHeight: 1.45 }}>
        {lang === 'ru' ? 'Бюллетень №' : 'Byulleten №'}
        <b style={{ color: TEXT_PRIMARY }}>{ballotNumber}</b>{' '}
        {lang === 'ru'
          ? `подписан и добавлен в протокол.${deadlineLabel ? ` Итоги — после закрытия ${deadlineLabel}.` : ''}`
          : `imzolandi va bayonnomaga qo'shildi.${deadlineLabel ? ` Yakuni — ${deadlineLabel} dan keyin.` : ''}`}
      </div>

      <div style={{
        marginTop: 22, padding: 16, borderRadius: 16,
        background: SURFACE, border: `1px solid ${BORDER}`,
        textAlign: 'left', boxShadow: SHADOW_1,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 600, color: TEXT_MUTED,
          textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8,
        }}>
          {lang === 'ru' ? 'Ваш бюллетень' : 'Sizning byulletenningiz'}
        </div>
        {meeting.agendaItems.map((a, i) => {
          const choice = getChoice(a.id);
          return (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '8px 0',
              borderBottom: i < meeting.agendaItems.length - 1 ? `1px solid ${HAIRLINE}` : 'none',
            }}>
              <div style={{
                width: 26, height: 26, borderRadius: 8,
                background: AMBER_50, color: AMBER_700,
                display: 'grid', placeItems: 'center',
                fontSize: 13, fontWeight: 700, flex: '0 0 auto',
              }}>
                {i + 1}
              </div>
              <div style={{ flex: 1, fontSize: 13, color: TEXT_SECONDARY }}>{a.title}</div>
              <div style={{
                fontSize: 11, fontWeight: 700,
                padding: '3px 8px', borderRadius: 999,
                background: choice === 'for' ? SUCCESS_BG
                  : choice === 'against' ? DANGER_BG
                  : STONE_150,
                color: choice === 'for' ? SUCCESS
                  : choice === 'against' ? DANGER
                  : TEXT_SECONDARY,
              }}>
                {choice === 'for' ? (lang === 'ru' ? 'За' : 'Ha')
                  : choice === 'against' ? (lang === 'ru' ? 'Против' : 'Yo\'q')
                  : (lang === 'ru' ? 'Воздерж.' : 'Betaraf')}
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={onClose} style={{
        marginTop: 20, padding: '14px 28px', borderRadius: 14, border: 'none',
        background: AMBER_600, color: '#fff', fontSize: 15, fontWeight: 650,
        boxShadow: SHADOW_AMBER, cursor: 'pointer', font: 'inherit',
      }}>
        {lang === 'ru' ? 'На главную' : 'Bosh sahifaga'}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Info sheet "Как считают голоса"
// ─────────────────────────────────────────────────────────────────────────

function HelpSheet({ onClose, lang, threshold }: { onClose: () => void; lang: 'ru' | 'uz'; threshold: number }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 120,
      background: 'rgba(28,25,23,0.55)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', background: SURFACE,
        borderTopLeftRadius: 26, borderTopRightRadius: 26,
        padding: '14px 22px calc(env(safe-area-inset-bottom, 0px) + 24px)',
        boxShadow: '0 -12px 36px rgba(28,25,23,0.18)',
      }}>
        <div style={{ width: 38, height: 5, background: STONE_300, borderRadius: 999, margin: '0 auto 14px' }} />
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', textAlign: 'center', color: TEXT_PRIMARY }}>
          {lang === 'ru' ? 'Как считают голоса' : 'Ovozlar qanday hisoblanadi'}
        </div>
        <div style={{ fontSize: 13.5, color: TEXT_SECONDARY, marginTop: 10, lineHeight: 1.45 }}>
          {lang === 'ru'
            ? `Голос засчитывается пропорционально площади квартиры (м²). Для принятия решения нужно ≥ ${threshold}% голосов от площади дома. Возражение по голосу «Против» обязательно сохраняется в протоколе собрания.`
            : `Ovoz kvartira maydoniga (m²) mutanosib hisoblanadi. Qaror qabul qilish uchun uy maydonidan ≥ ${threshold}% ovoz kerak. «Qarshi» ovoz uchun e'tiroz yig'ilish bayonnomasiga albatta saqlanadi.`}
        </div>
        <button onClick={onClose} style={{
          width: '100%', marginTop: 18, padding: '13px 16px',
          borderRadius: 14, border: 'none', background: STONE_100,
          color: TEXT_PRIMARY, fontSize: 14, fontWeight: 650, cursor: 'pointer',
          font: 'inherit',
        }}>
          {lang === 'ru' ? 'Понятно' : 'Tushunarli'}
        </button>
      </div>
    </div>
  );
}
