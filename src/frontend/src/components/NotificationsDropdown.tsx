/* NotificationsDropdown — bell-anchored popover. Shows top 3 most
   recent unread-first FeedItems (real data — request/meeting
   notifications + announcements). Footer link → full /notifications.
   Backdrop tap → onClose.

   Uses var(--*) tokens throughout (theme-aware via html.dark cascade).
*/
import { useEffect, useMemo } from 'react';
import { useNotificationStore } from '../stores/notificationStore';
import { useAnnouncementStore } from '../stores/dataStore';
import { useAuthStore } from '../stores/authStore';
import { buildFeed, formatFeedTime } from '../utils/notificationFeed';

interface Props {
  open: boolean;
  onClose: () => void;
  onSeeAll: () => void;
  /** Distance from top of viewport to anchor the popover's top edge.
   *  Default 96 matches the kamizo-home.jsx mockup (popover drops from
   *  beneath the hero bell). */
  anchorTopOffset?: number;
}

export function NotificationsDropdown({ open, onClose, onSeeAll, anchorTopOffset = 96 }: Props) {
  const { user } = useAuthStore();
  const notifications = useNotificationStore(s => s.notifications);
  const markNotificationsSeen = useNotificationStore(s => s.markNotificationsSeen);
  const getAnnouncementsForResidents = useAnnouncementStore(s => s.getAnnouncementsForResidents);

  const userId = user?.id || '';
  const userLogin = user?.login || '';

  // v118.73 — opening the dropdown counts as "seeing" the queue → the
  // bell badge clears next render (lastSeenAt now > every existing
  // notification.createdAt). New notifications arriving AFTER this
  // moment will re-light the badge.
  useEffect(() => {
    if (open && userId) markNotificationsSeen(userId);
  }, [open, userId, markNotificationsSeen]);
  const userBuilding = user?.buildingId || '';
  const userEntrance = user?.entrance || '';
  const userFloor = user?.floor || '';
  const userBranch = user?.branch || '';
  const userApartment = user?.apartment || '';

  const items = useMemo(() => {
    const announcements = userLogin
      ? getAnnouncementsForResidents(userLogin, userBuilding, userEntrance, userFloor, userBranch, userApartment)
      : [];
    const feed = buildFeed(notifications, announcements, userId);
    // Sort unread-first within the top 3, preserving newest within each group
    const unread = feed.filter(i => i.unread);
    const read = feed.filter(i => !i.unread);
    return [...unread, ...read].slice(0, 3);
  }, [notifications, getAnnouncementsForResidents, userId, userLogin, userBuilding, userEntrance, userFloor, userBranch, userApartment]);

  const totalUnread = useMemo(() => {
    const announcements = userLogin
      ? getAnnouncementsForResidents(userLogin, userBuilding, userEntrance, userFloor, userBranch, userApartment)
      : [];
    return buildFeed(notifications, announcements, userId).filter(i => i.unread).length;
  }, [notifications, getAnnouncementsForResidents, userId, userLogin, userBuilding, userEntrance, userFloor, userBranch, userApartment]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop click-catcher */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'transparent' }}
        aria-hidden
      />
      {/* Popover */}
      <div
        style={{
          position: 'fixed', top: anchorTopOffset, right: 14, zIndex: 71,
          width: 312, maxWidth: 'calc(100% - 28px)',
          background: 'var(--surface)', color: 'var(--text-primary)',
          borderRadius: 'var(--radius-xl, 28px)',
          border: '1px solid var(--border-c)',
          boxShadow: '0 20px 50px -12px rgba(28,25,23,0.4)',
          overflow: 'hidden',
          transformOrigin: 'top right',
          animation: 'kzPop 180ms ease-out',
        }}
        role="dialog"
        aria-label="Уведомления"
      >
        {/* arrow */}
        <div style={{ position: 'absolute', top: -7, right: 22, width: 14, height: 14, background: 'var(--surface)', borderLeft: '1px solid var(--border-c)', borderTop: '1px solid var(--border-c)', transform: 'rotate(45deg)' }} aria-hidden />
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px' }}>
          <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em' }}>Уведомления</div>
          {totalUnread > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand-dark)', background: 'var(--brand-tint)', padding: '3px 8px', borderRadius: 999 }}>
              {totalUnread} {pluralRu(totalUnread, 'новое', 'новых', 'новых')}
            </span>
          )}
        </div>

        {/* rows */}
        {items.length === 0 ? (
          <div style={{ padding: '24px 16px 26px', textAlign: 'center', borderTop: '1px solid var(--hairline)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Нет новых уведомлений</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Здесь появятся события по дому</div>
          </div>
        ) : (
          <div>
            {items.map(n => {
              const Icon = n.Icon;
              return (
                <div
                  key={n.id}
                  style={{
                    display: 'flex', gap: 11, padding: '11px 16px',
                    borderTop: '1px solid var(--hairline)',
                    background: n.unread ? 'var(--surface-2)' : 'transparent',
                    position: 'relative',
                  }}
                >
                  <div style={{ width: 36, height: 36, borderRadius: 11, background: n.bg, color: n.fg, display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
                    <Icon size={17} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{n.body}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{formatFeedTime(n.createdAt)}</div>
                  </div>
                  {n.unread && <span style={{ position: 'absolute', top: 14, right: 16, width: 7, height: 7, borderRadius: 999, background: 'var(--brand)' }} />}
                </div>
              );
            })}
          </div>
        )}

        {/* footer */}
        <button
          onClick={onSeeAll}
          style={{
            width: '100%', padding: '13px', border: 'none', borderTop: '1px solid var(--border-c)',
            background: 'transparent', color: 'var(--brand-dark)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
          }}
        >Показать все →</button>
      </div>
    </>
  );
}

function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
