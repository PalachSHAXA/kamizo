/* NotificationsPage — standalone full-screen `/notifications`.
   Ported 1:1 from screens/12-uvedomleniya.html (FOUNDATION §12),
   wired to real merged data via notificationFeed.

   Standalone like ResidentVehiclesPage (v205) + ResidentAnnouncementsPage
   (v209): rendered top-level in App.tsx, no Layout chrome (no global
   BottomBar, no MobileHeader). Own back-arrow → navigate('/').
*/
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useNotificationStore } from '../stores/notificationStore';
import { useAnnouncementStore } from '../stores/dataStore';
import { useAuthStore } from '../stores/authStore';
import { buildFeed, filterFeed, bucketByTime, formatFeedTime, type FeedKind } from '../utils/notificationFeed';

type ChipId = 'all' | FeedKind;

const CHIPS: { id: ChipId; label: string }[] = [
  { id: 'all',          label: 'Все' },
  { id: 'request',      label: 'Заявки' },
  { id: 'vote',         label: 'Собрания' },
  { id: 'announcement', label: 'Объявления' },
  // 'Оплата' shows even though no current data emits 'finance' kind. When
  // finance notifications start flowing, classifyNotificationKind in
  // notificationFeed.ts gets one more case and this chip starts filling.
  { id: 'finance',      label: 'Оплата' },
];

const EMPTY_LABEL: Record<ChipId, string> = {
  all: 'Пока нет уведомлений',
  request: 'Нет уведомлений по заявкам',
  vote: 'Нет уведомлений о собраниях',
  announcement: 'Нет объявлений',
  finance: 'Здесь появятся уведомления об оплате',
  guest: 'Нет уведомлений о гостях',
  other: 'Ничего нет',
};

export function NotificationsPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const notifications = useNotificationStore(s => s.notifications);
  const markAllNotificationsAsRead = useNotificationStore(s => s.markAllNotificationsAsRead);
  const getAnnouncementsForResidents = useAnnouncementStore(s => s.getAnnouncementsForResidents);
  const markAnnouncementAsViewed = useAnnouncementStore(s => s.markAnnouncementAsViewed);
  const markNotificationAsRead = useNotificationStore(s => s.markNotificationAsRead);
  const markNotificationsSeen = useNotificationStore(s => s.markNotificationsSeen);

  const userId = user?.id || '';
  const userLogin = user?.login || '';
  const userBuilding = user?.buildingId || '';
  const userEntrance = user?.entrance || '';
  const userFloor = user?.floor || '';
  const userBranch = user?.branch || '';
  const userApartment = user?.apartment || '';

  const [chip, setChip] = useState<ChipId>('all');

  // v118.73 — landing on /notifications counts as "seeing" the queue →
  // bell badge clears. Same lastSeenAt tracker as the dropdown.
  useEffect(() => {
    if (userId) markNotificationsSeen(userId);
  }, [userId, markNotificationsSeen]);

  const announcements = useMemo(
    () => userLogin ? getAnnouncementsForResidents(userLogin, userBuilding, userEntrance, userFloor, userBranch, userApartment) : [],
    [getAnnouncementsForResidents, userLogin, userBuilding, userEntrance, userFloor, userBranch, userApartment]
  );

  const allItems = useMemo(
    () => buildFeed(notifications, announcements, userId),
    [notifications, announcements, userId]
  );

  const totalUnread = useMemo(() => allItems.filter(i => i.unread).length, [allItems]);

  const visibleGroups = useMemo(
    () => bucketByTime(filterFeed(allItems, chip)),
    [allItems, chip]
  );

  const markAll = () => {
    if (!userId) return;
    markAllNotificationsAsRead(userId);
    // Also mark the announcements in the current feed viewed — the unread
    // count counts both notification rows and unviewed announcements.
    for (const a of announcements) {
      if (!a.viewedBy?.includes(userId)) markAnnouncementAsViewed(a.id, userId);
    }
  };

  const onRowClick = (id: string, source: 'notification' | 'announcement') => {
    if (source === 'notification') {
      const real = id.startsWith('ann-') ? null : id;
      if (real) markNotificationAsRead(real);
    } else {
      const annId = id.replace(/^ann-/, '');
      if (userId) markAnnouncementAsViewed(annId, userId);
    }
  };

  return (
    // v118.73 — was a single document-flow div with `minHeight: 100vh` and
    // `position: sticky` header. On iOS WebView the body scroll context
    // is unreliable when this page is mounted at top level (multiple
    // ancestors may set overflow:hidden — Sheet modal does this on
    // open/close cycles). Result: BUG 2 — page wouldn't scroll.
    //
    // FIX: page becomes a fixed-position flex column overlay covering the
    // viewport. Header is a non-shrinking flex child; body is a
    // flex:1 + overflowY:auto child with its own scroll context, fully
    // independent of document.body or ancestor overflow rules.
    <div
      className="kz-screen"
      style={{
        position: 'fixed', inset: 0,
        display: 'flex', flexDirection: 'column',
        background: 'var(--app-bg)',
        color: 'var(--text-primary)',
        letterSpacing: '-0.01em',
      }}
    >
      {/* Fixed-top header (not sticky — it's a flex child) */}
      <div
        style={{
          flex: '0 0 auto',
          padding: 'calc(env(safe-area-inset-top, 0px) + 14px) 16px 12px',
          background: 'var(--themed-strip-bg, rgba(244,240,232,0.92))',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          borderBottom: '1px solid var(--border-c)',
          zIndex: 5,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => navigate('/')}
            aria-label="Назад"
            style={{
              width: 40, height: 40, borderRadius: 12, flex: '0 0 auto',
              background: 'var(--surface)', border: '1px solid var(--border-c)',
              color: 'var(--text-primary)',
              display: 'grid', placeItems: 'center', cursor: 'pointer',
              padding: 0,
            }}
          >
            <ArrowLeft size={19} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>Уведомления</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 1 }}>
              {totalUnread} {pluralRu(totalUnread, 'непрочитанное', 'непрочитанных', 'непрочитанных')}
            </div>
          </div>
          <button
            onClick={markAll}
            disabled={totalUnread === 0}
            style={{
              fontSize: 12.5, fontWeight: 700,
              color: totalUnread === 0 ? 'var(--text-muted)' : 'var(--brand-dark)',
              background: 'transparent', border: 'none',
              cursor: totalUnread === 0 ? 'default' : 'pointer',
              padding: '8px 4px',
            }}
          >Прочитать всё</button>
        </div>

        {/* Filter chips */}
        <div
          style={{
            display: 'flex', gap: 8, marginTop: 12, overflowX: 'auto',
            scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
          }}
        >
          {CHIPS.map(f => {
            const isActive = chip === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setChip(f.id)}
                style={{
                  flex: '0 0 auto',
                  padding: '7px 14px', borderRadius: 999,
                  fontSize: 13, fontWeight: 650,
                  background: isActive ? 'var(--ink, #1C1917)' : 'var(--surface)',
                  color: isActive ? 'var(--text-on-dark)' : 'var(--text-secondary)',
                  border: '1px solid',
                  borderColor: isActive ? 'var(--ink, #1C1917)' : 'var(--border-c)',
                  cursor: 'pointer', letterSpacing: '-0.01em',
                  whiteSpace: 'nowrap',
                }}
              >{f.label}</button>
            );
          })}
        </div>
      </div>

      {/* Scrollable body — its own scroll context, immune to ancestor
          overflow:hidden. WebkitOverflowScrolling for iOS momentum. */}
      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          // v118.111 — added overscrollBehavior:contain + minHeight:0
          // for the iOS-safe combo (see ScrollArea.tsx). Missing
          // contain risked the dead-edge-at-bottom stick.
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          padding: '14px 16px calc(24px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {visibleGroups.length === 0 ? (
          <div
            style={{
              marginTop: 40, padding: '36px 16px',
              background: 'var(--surface)', borderRadius: 'var(--radius-lg, 20px)',
              border: '1px solid var(--border-c)',
              textAlign: 'center', color: 'var(--text-secondary)',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
              {EMPTY_LABEL[chip]}
            </div>
            <div style={{ fontSize: 12 }}>Когда что-то произойдёт — увидите здесь.</div>
          </div>
        ) : visibleGroups.map(g => (
          <div key={g.label} style={{ marginBottom: 18 }}>
            <div
              style={{
                fontSize: 11.5, fontWeight: 800, letterSpacing: '0.06em',
                color: 'var(--text-secondary)', textTransform: 'uppercase',
                padding: '0 4px 8px',
              }}
            >{g.label}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {g.items.map(n => {
                const Icon = n.Icon;
                return (
                  <div
                    key={n.id}
                    onClick={() => onRowClick(n.id, n.source)}
                    style={{
                      position: 'relative',
                      background: 'var(--surface)', borderRadius: 'var(--radius-lg, 20px)',
                      border: '1px solid var(--border-c)',
                      boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(28,25,23,0.04))',
                      padding: 14, display: 'flex', gap: 12,
                      cursor: 'pointer',
                    }}
                  >
                    {n.unread && (
                      <span style={{ position: 'absolute', top: 16, right: 14, width: 8, height: 8, borderRadius: 999, background: 'var(--brand)' }} aria-label="Непрочитано" />
                    )}
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: n.bg, color: n.fg, display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
                      <Icon size={19} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: '-0.01em' }}>{n.title}</div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>{n.body}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                        <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{formatFeedTime(n.createdAt)}</span>
                        {n.cta && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (n.cta!.action.kind === 'open-meetings') navigate('/meetings');
                              else if (n.cta!.action.kind === 'rate-request') navigate('/requests');
                              else if (n.cta!.action.kind === 'navigate') navigate(n.cta!.action.path);
                            }}
                            style={{
                              fontSize: 12.5, fontWeight: 700, color: 'var(--brand-dark)',
                              background: 'var(--brand-tint)', border: 'none', borderRadius: 999,
                              padding: '5px 12px', cursor: 'pointer',
                            }}
                          >{n.cta.label}</button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
