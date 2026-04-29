import { useNavigate } from 'react-router-dom';
import {
  ChevronRight, Vote, Clock,
  CheckCircle2, Phone, Key, FileText as FileTextIcon, X as CloseIcon,
} from 'lucide-react';
import { useState } from 'react';
import { RequestStatusTrackerCompact } from '../../../components/RequestStatusTracker';
import { HomeHighlights } from './HomeHighlights';
import {
  PaymentWidgetSoon, MetersWidgetSoon, AutoWidget,
  MastersWidget, NewsWidget, PrivilegesWidget,
} from './widgets';
import type { HomeTabProps } from './types';

// Format ETA from request scheduledDate/scheduledTime into a friendly hint.
// Returns null if there is no ETA to show.
function formatEta(req: { scheduledDate?: string; scheduledTime?: string }, language: string): string | null {
  if (!req.scheduledDate && !req.scheduledTime) return null;
  const today = new Date().toISOString().slice(0, 10);
  const isToday = req.scheduledDate === today;
  const isTomorrow = (() => {
    if (!req.scheduledDate) return false;
    const t = new Date(); t.setDate(t.getDate() + 1);
    return req.scheduledDate === t.toISOString().slice(0, 10);
  })();
  const dayLabel = isToday
    ? (language === 'ru' ? 'Сегодня' : 'Bugun')
    : isTomorrow
      ? (language === 'ru' ? 'Завтра' : 'Ertaga')
      : req.scheduledDate ?? '';
  const time = req.scheduledTime ? `, ${req.scheduledTime}` : '';
  return `${dayLabel}${time}`;
}

export function HomeTab({
  language,
  user,
  activeRequests,
  latestAnnouncements,
  activeMeetings,
  financeBalance,
  tenantName,
  switchTab,
  setSelectedRequest,
  setShowAllServices,
  generateReconciliation,
}: HomeTabProps) {
  const navigate = useNavigate();
  // Note: marketplaceEnabled / setShowAllServices used to gate the
  // 'Быстрые действия' grid, but that grid was removed because all
  // services are now in the swipeable HomeHighlights carousel.

  // ===== Onboarding state =====
  // The user's first impression of the product matters: imported residents
  // often log in with just a default password and no phone, which means we
  // can't notify them about anything. We surface a one-tap setup card on the
  // home tab listing what's still missing. The card is dismissible and the
  // dismissal is per-account (localStorage key includes user.id).
  const isRentalUser = user?.role === 'tenant' || user?.role === 'commercial_owner';
  void isRentalUser;
  const pendingTasks: any[] = [];
  const showOnboardingCard = false;
  const dismissOnboarding = () => {};

  const firstActiveMeeting = activeMeetings[0];
  const hasVotingOpen = firstActiveMeeting?.status === 'voting_open';
  const userArea: number | undefined = user?.totalArea;
  const buildingArea: number | undefined = firstActiveMeeting?.totalEligibleShares;
  const voteWeightPercent =
    userArea && buildingArea ? ((userArea / buildingArea) * 100) : null;
  const quorumPercent: number = Math.round((firstActiveMeeting?.participationByShares ?? firstActiveMeeting?.participationPercent ?? 0));
  const quorumTarget: number = firstActiveMeeting?.votingSettings?.quorumPercent ?? 50;
  const quorumReached = !!firstActiveMeeting?.quorumReached;

  return (
    <div className="space-y-3 px-4 md:px-0">

      {/* Greeting and address pill are rendered by the parent
          ResidentDashboard above this component — keeping it here would
          duplicate the welcome. */}

      {/* ===== HIGHLIGHTS — swipeable stories at the top of the feed.
          Shows what needs attention right now: voting, urgent
          announcements, pending approvals, monthly UK rating. Hidden if
          nothing is pending; falls back to an "everything's calm" tile.
          Onboarding stays as a separate inline card below because it has
          a multi-step checklist that doesn't fit the headline format. ===== */}
      <HomeHighlights activeRequests={activeRequests} />

      {/* ===== ONBOARDING — top of feed. Shown until the resident either
          completes all tasks or explicitly dismisses. Dismissal is per-user
          and stored in localStorage so the card doesn't keep popping back
          on every visit. The bell-dropdown in MobileHeader continues to
          surface the same tasks, so dismissing here doesn't lose them. ===== */}
      {showOnboardingCard && (
        <div
          className="rounded-[18px] p-4 relative shadow-[0_2px_10px_rgba(0,0,0,0.06)]"
          style={{ background: 'linear-gradient(135deg, rgba(var(--brand-rgb), 0.10) 0%, rgba(var(--brand-rgb), 0.04) 100%)' }}
        >
          <button
            onClick={dismissOnboarding}
            className="absolute top-3 right-3 w-7 h-7 rounded-full hover:bg-white/60 active:bg-white/90 flex items-center justify-center text-gray-400 transition-colors"
            aria-label={language === 'ru' ? 'Скрыть' : 'Yashirish'}
          >
            <CloseIcon className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 mb-1 pr-8">
            <div className="w-8 h-8 rounded-[10px] bg-white flex items-center justify-center">
              <CheckCircle2 className="w-[18px] h-[18px] text-primary-500" strokeWidth={2.2} />
            </div>
            <div>
              <div className="text-[14px] font-extrabold text-gray-900 leading-tight">
                {language === 'ru' ? 'Завершите регистрацию' : 'Ro\'yxatdan o\'tishni yakunlang'}
              </div>
              <div className="text-[11px] text-gray-500 font-medium">
                {language === 'ru'
                  ? `Осталось ${pendingTasks.length} из ${onboardingTasks.length}`
                  : `Qoldi ${pendingTasks.length} / ${onboardingTasks.length}`}
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-1 bg-white rounded-full overflow-hidden mt-2 mb-3">
            <div
              className="h-full bg-primary-500 transition-all duration-500"
              style={{ width: `${((onboardingTasks.length - pendingTasks.length) / onboardingTasks.length) * 100}%` }}
            />
          </div>

          {/* Pending tasks list */}
          <div className="space-y-2">
            {pendingTasks.map(task => {
              const Icon = task.icon;
              return (
                <button
                  key={task.id}
                  onClick={() => navigate(task.path)}
                  className="w-full flex items-center gap-2.5 bg-white rounded-[12px] p-2.5 text-left active:scale-[0.98] transition-transform touch-manipulation"
                >
                  <div className="w-9 h-9 rounded-[10px] bg-primary-50 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-primary-600" strokeWidth={2.2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-gray-900 truncate">{task.title}</div>
                    <div className="text-[11px] text-gray-400 truncate">{task.sub}</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== HERO: Active meeting / voting card. The killer feature of
          Kamizo (legally valid собрание per RU law) deserves the top of the
          home tab when it's open. We surface vote weight and quorum so the
          resident immediately understands what's at stake. ===== */}
      {firstActiveMeeting && (
        <button
          onClick={() => navigate('/meetings')}
          className="w-full text-left bg-white border-2 border-blue-200 rounded-[18px] p-4 shadow-[0_2px_10px_rgba(0,0,0,0.06)] active:scale-[0.99] transition-transform touch-manipulation relative overflow-hidden"
        >
          {hasVotingOpen && (
            <div className="absolute top-0 right-0 bg-blue-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-bl-lg uppercase tracking-wider">
              {language === 'ru' ? 'Важно' : 'Muhim'}
            </div>
          )}
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-[13px] bg-blue-50 flex items-center justify-center shrink-0">
              <Vote className="w-[22px] h-[22px] text-blue-500" strokeWidth={1.8} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-wider text-blue-500">
                {hasVotingOpen
                  ? (language === 'ru' ? 'Голосование открыто' : 'Ovoz berish ochiq')
                  : (language === 'ru' ? 'Собрание собственников' : 'Yig\'ilish')}
              </div>
              <div className="text-[14px] font-bold text-gray-900 mt-0.5 line-clamp-2">
                {firstActiveMeeting.agendaItems?.[0]?.title
                  ?? (language === 'ru' ? `Собрание #${firstActiveMeeting.number}` : `Yig'ilish #${firstActiveMeeting.number}`)}
              </div>

              {/* Vote weight pill — only shown when voting is open and we know
                  this resident's area share. Per Uzbek law 1 vote = 1 m². */}
              {hasVotingOpen && userArea && (
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                    {language === 'ru' ? 'Ваш голос' : 'Ovozingiz'} · {userArea} {language === 'ru' ? 'м²' : 'm²'}
                  </span>
                  {voteWeightPercent !== null && (
                    <span className="text-[11px] text-gray-400">
                      {voteWeightPercent.toFixed(1)}% {language === 'ru' ? 'площади дома' : 'uy maydoni'}
                    </span>
                  )}
                </div>
              )}

              {/* Quorum + countdown */}
              <div className="flex items-center justify-between mt-2 text-[12px] text-gray-500 font-medium">
                <span>
                  {language === 'ru' ? 'Кворум' : 'Kvorum'} {quorumPercent}% {quorumReached ? '✓' : `· ${language === 'ru' ? 'цель' : 'maqsad'} ${quorumTarget}%`}
                </span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full mt-1.5 overflow-hidden">
                <div
                  className={`h-full ${quorumReached ? 'bg-green-500' : 'bg-blue-500'}`}
                  style={{ width: `${Math.min(quorumPercent, 100)}%` }}
                />
              </div>

              {hasVotingOpen && (
                <div className="mt-3 inline-flex items-center gap-1 text-[13px] font-bold text-blue-600">
                  {language === 'ru' ? 'Проголосовать' : 'Ovoz berish'}
                  <ChevronRight className="w-4 h-4" />
                </div>
              )}
            </div>
          </div>
        </button>
      )}

      {/* ===== Active requests — using existing compact tracker. We only
          add a small ETA hint underneath when the request has a scheduled
          time, to answer "когда придёт мастер" before the resident has to
          tap through. ===== */}
      {activeRequests.length > 0 && (
        <div className="space-y-2.5">
          {activeRequests.slice(0, 2).map((req) => {
            const eta = formatEta(req, language);
            return (
              <div key={req.id} className="space-y-1">
                <RequestStatusTrackerCompact
                  request={req}
                  executorName={req.executorName}
                  language={language as 'ru' | 'uz'}
                  onClick={() => setSelectedRequest(req)}
                />
                {eta && (
                  <div className="flex items-center gap-1.5 px-3 text-[11px] font-semibold text-primary-600">
                    <Clock className="w-3 h-3" strokeWidth={2.2} />
                    {language === 'ru' ? 'Придёт' : 'Keladi'} {eta}
                  </div>
                )}
              </div>
            );
          })}
          {activeRequests.length > 2 && (
            <button
              onClick={() => switchTab('requests')}
              className="w-full text-center py-2 text-sm font-medium text-primary-600 touch-manipulation"
            >
              {language === 'ru' ? `Ещё ${activeRequests.length - 2} заявок` : `Yana ${activeRequests.length - 2} ta ariza`}
            </button>
          )}
        </div>
      )}

      {/* ===== Payment + Meters — full visual structure of the future
          live widgets, but every interactive element is disabled and
          marked 'УЖЕ СКОРО'. Lets the resident see what's coming without
          being misled by fake numbers. Replace with live PaymentWidget
          and MetersWidget once Click/Payme + meter integrations land. ===== */}
      <PaymentWidgetSoon />
      <MetersWidgetSoon />

      {/* ===== AutoWidget — primary car + quick "Найти" + parking info.
          Hidden when the resident has no registered vehicles. ===== */}
      <AutoWidget />

      {/* Quick actions removed — all 7 services are now in the swipeable
          3D CardStack at the top, so a separate 2×2 grid was a duplicate.
          Marketplace teaser also dropped because it's accessible via
          /marketplace from the drawer. */}

      {/* Finance widget intentionally NOT shown here. The previous live
          balance widget contradicted the 'Уже скоро · онлайн-оплата'
          message above — without payment integration the numbers were
          UK manual entries, misleading the resident about real status.
          When Click/Payme integration ships, restore as a real hero. */}

      {/* ===== MastersWidget — top-3 highest-rated executors. Builds
          trust before the resident creates a request. Only renders when
          there are rated executors in the tenant. ===== */}
      <MastersWidget />

      {/* ===== NewsWidget — Telegram-style swipeable stories of
          announcements + active meetings. Replaces the previous static
          announcements list because residents skim faster when news
          comes one-card-at-a-time. ===== */}
      <NewsWidget />

      {/* ===== PrivilegesWidget — promo banner that points to
          /useful-contacts where partner discounts live. Brand-gradient
          banner, end of feed so it doesn't compete with action cards. ===== */}
      <PrivilegesWidget />

      {/* Old announcements list removed — NewsWidget above renders the
          same data as swipeable Telegram-style stories. */}

    </div>
  );
}
