import { Clock } from 'lucide-react';
import { RequestStatusTrackerCompact } from '../../../components/RequestStatusTracker';
import { HomeHighlights } from './HomeHighlights';
import {
  AutoWidget, EventsWidget, NewsWidget, PrivilegesWidget,
  ComingSoonPill,
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
  activeRequests,
  switchTab,
  setSelectedRequest,
}: HomeTabProps) {
  // All hero state (onboarding card, active meeting card, finance widget,
  // marketplace teaser, services 2x2 grid) was moved into HomeHighlights /
  // dedicated widgets and stripped from here. HomeTab is now a thin
  // composition of widgets — much easier to maintain.

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

      {/* Inline onboarding block + standalone active-meeting hero removed:
          both are surfaced in the HomeHighlights swipeable carousel above.
          Showing them again as full-width cards under the carousel was a
          dub — same alert in two visual treatments. The carousel handles
          priority order ('Завершите регистрацию' / 'Голосование открыто'),
          tap → /profile or /meetings respectively. */}

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

      {/* Two big 'УЖЕ СКОРО' cards (Payment + Meters) collapsed into a
          single thin pill — same honest message that integration isn't
          ready, but 50px instead of 340px so the home tab stops feeling
          like a parade of placeholders. */}
      <ComingSoonPill />

      {/* ===== AutoWidget — primary car + quick "Найти" + parking info.
          Hidden when the resident has no registered vehicles (the carousel
          card 'Найти авто' covers that empty state). ===== */}
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

      {/* ===== EventsWidget — mini-calendar of upcoming building events
          (meetings + urgent announcements within 14 days). Replaces the
          'Лучшие мастера' widget: knowing 'когда следующее собрание /
          плановое отключение воды' is a more daily concern than
          browsing master ratings. Hidden when nothing's coming up. ===== */}
      <EventsWidget />

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
