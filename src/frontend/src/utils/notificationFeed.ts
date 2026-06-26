/* notificationFeed.ts — unified UI feed for the bell dropdown +
   /notifications page. Merges three real data sources (request/meeting
   notifications from useNotificationStore + announcements from
   useAnnouncementStore) into a single FeedItem[] ordered newest-first.
   Pure helpers — no React, no store dispatch. Consumers pass arrays in.

   Why a separate file: dropdown and page need exactly the same
   kind→icon/color/cta logic. Centralising avoids drift if one is
   updated without the other.

   Field-mapping notes:
     • Notification.type union in src/types/request.ts is strict (request_*).
       Server actually emits meeting types too (`meeting`, `meeting_voted`,
       `meeting_cancelled`, `meeting_rejected`) — the store's mapper
       casts them through, so at runtime n.type is a wider string. We
       narrow via classifyNotificationKind() instead of trusting the TS
       union.
     • Announcements have `viewedBy[]` (per-user view tracking) instead
       of a single `read` boolean — we synthesise `unread = !viewedBy.includes(userId)`.
     • Finance: no data source exists yet. The 'finance' kind exists in
       the filter UI but no item will currently classify into it. When
       finance notifications arrive on the server (e.g. type:'invoice_issued'),
       add a case in classifyNotificationKind() — that's the only edit
       needed for the filter to start populating.
*/
import type { ComponentType } from 'react';
import {
  Check, FileText, Wrench, Users, Megaphone, Bell, Star,
  Zap, CreditCard, XCircle, Clock,
} from 'lucide-react';
import type { Notification } from '../types';
import type { Announcement } from '../types';

/** UI kind used for filters + icon/color mapping. Maps to the design's
 *  filter chips: Все / Заявки / Собрания / Объявления / Оплата. */
export type FeedKind = 'request' | 'vote' | 'announcement' | 'finance' | 'guest' | 'other';

export interface FeedItem {
  /** Stable id — notification.id or `ann-${announcement.id}` for announcements. */
  id: string;
  kind: FeedKind;
  title: string;
  body: string;
  /** ISO timestamp; used for grouping (Сегодня / Вчера / Ранее). */
  createdAt: string;
  unread: boolean;
  /** Icon component (lucide-react) chosen by kind+subtype. */
  Icon: ComponentType<{ size?: number; className?: string }>;
  /** CSS var() string for the icon tile background. */
  bg: string;
  /** CSS var() string for the icon glyph color. */
  fg: string;
  /** Optional inline CTA pill — derived from notification.type. */
  cta?: { label: string; action: FeedAction };
  /** Source — drives "click row → navigate" behaviour. */
  source: 'notification' | 'announcement';
  /** Raw underlying object — used by markAsRead helpers. */
  raw: Notification | Announcement;
}

export type FeedAction =
  | { kind: 'rate-request'; requestId: string }
  | { kind: 'open-meetings' }
  | { kind: 'navigate'; path: string };

/** Maps a raw notification.type (wider than the TS union) to one of
 *  the 6 UI kinds used by filters + icon picking. */
function classifyNotificationKind(rawType: string): FeedKind {
  if (rawType.startsWith('request_')) return 'request';
  if (rawType.startsWith('meeting')) return 'vote';
  if (rawType.startsWith('guest_')) return 'guest';
  // FUTURE: finance notifications will come through with rawType like
  //   'invoice_issued' / 'payment_received'. Add the case here when the
  //   server starts emitting them — the 'Оплата' filter chip will then
  //   light up automatically.
  // if (rawType.startsWith('invoice_') || rawType === 'payment_received') return 'finance';
  return 'other';
}

interface IconChoice { Icon: FeedItem['Icon']; bg: string; fg: string }

/** Picks icon + colour tokens for a notification given its kind + subtype. */
function iconForNotification(rawType: string, kind: FeedKind): IconChoice {
  // Request lifecycle — pick by exact subtype so the icon tells the
  // resident which event (completed/rejected/cancelled etc.).
  if (kind === 'request') {
    switch (rawType) {
      case 'request_completed':
      case 'request_approved':
        return { Icon: Check, bg: 'var(--status-active-bg)', fg: 'var(--status-active)' };
      case 'request_rejected':
      case 'request_cancelled':
      case 'request_declined':
        return { Icon: XCircle, bg: 'var(--status-critical-bg)', fg: 'var(--status-critical)' };
      case 'request_started':
        return { Icon: Wrench, bg: 'var(--brand-tint)', fg: 'var(--brand-dark)' };
      case 'request_accepted':
      case 'request_assigned':
        return { Icon: FileText, bg: 'var(--brand-tint)', fg: 'var(--brand-dark)' };
      default: // request_created
        return { Icon: FileText, bg: 'var(--brand-tint)', fg: 'var(--brand-dark)' };
    }
  }
  if (kind === 'vote') {
    if (rawType === 'meeting_cancelled' || rawType === 'meeting_rejected') {
      return { Icon: XCircle, bg: 'var(--status-critical-bg)', fg: 'var(--status-critical)' };
    }
    return { Icon: Users, bg: 'var(--brand-tint)', fg: 'var(--brand-dark)' };
  }
  if (kind === 'guest') {
    return { Icon: Check, bg: 'var(--status-active-bg)', fg: 'var(--status-active)' };
  }
  if (kind === 'finance') {
    return { Icon: CreditCard, bg: 'var(--surface-sunken)', fg: 'var(--text-secondary)' };
  }
  // 'other' / fallthrough
  return { Icon: Bell, bg: 'var(--surface-sunken)', fg: 'var(--text-secondary)' };
}

/** Derives an inline CTA pill for a notification based on subtype.
 *  Only the two kinds the design specifies get a pill — others rely on
 *  whole-row click → notification route (handled by consumer). */
function ctaForNotification(n: Notification): FeedItem['cta'] {
  const rawType = String(n.type);
  if (rawType === 'request_completed' && n.requestId) {
    return { label: 'Оценить', action: { kind: 'rate-request', requestId: n.requestId } };
  }
  if (rawType === 'meeting') {
    return { label: 'Голосовать', action: { kind: 'open-meetings' } };
  }
  return undefined;
}

/** Turns a Notification row into a FeedItem. */
function feedFromNotification(n: Notification): FeedItem {
  const rawType = String(n.type);
  const kind = classifyNotificationKind(rawType);
  const { Icon, bg, fg } = iconForNotification(rawType, kind);
  return {
    id: n.id,
    kind,
    title: n.title || '',
    body: n.message || '',
    createdAt: n.createdAt,
    unread: !n.read,
    Icon,
    bg, fg,
    cta: ctaForNotification(n),
    source: 'notification',
    raw: n,
  };
}

/** Synthesises a FeedItem for an announcement. */
function feedFromAnnouncement(a: Announcement, userId: string): FeedItem {
  return {
    id: `ann-${a.id}`,
    kind: 'announcement',
    title: a.title || '',
    body: a.content || '',
    createdAt: a.createdAt,
    unread: !a.viewedBy?.includes(userId),
    Icon: a.priority === 'urgent' ? Zap : Megaphone,
    bg: a.priority === 'urgent' ? 'var(--status-critical-bg)' : 'var(--brand-tint)',
    fg: a.priority === 'urgent' ? 'var(--status-critical)' : 'var(--brand-dark)',
    cta: undefined,
    source: 'announcement',
    raw: a,
  };
}

/** Merges all sources newest-first. Limit caps result length. */
export function buildFeed(
  notifications: Notification[],
  announcements: Announcement[],
  userId: string,
  limit?: number,
): FeedItem[] {
  const all: FeedItem[] = [
    ...notifications.filter(n => n.userId === userId).map(feedFromNotification),
    ...announcements.map(a => feedFromAnnouncement(a, userId)),
  ];
  all.sort((x, y) => (y.createdAt || '').localeCompare(x.createdAt || ''));
  return typeof limit === 'number' ? all.slice(0, limit) : all;
}

/** Filter chip → keep predicate. 'all' keeps everything. */
export function filterFeed(items: FeedItem[], chip: 'all' | FeedKind): FeedItem[] {
  if (chip === 'all') return items;
  return items.filter(i => i.kind === chip);
}

export type TimeGroup = 'Сегодня' | 'Вчера' | 'Ранее';

/** Buckets by local-TZ day relative to today's midnight. */
export function bucketByTime(items: FeedItem[]): { label: TimeGroup; items: FeedItem[] }[] {
  // Date construction inside this helper is intentional — Notification
  // grouping is purely a UI concern derived from the current wall clock.
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  const buckets: Record<TimeGroup, FeedItem[]> = { 'Сегодня': [], 'Вчера': [], 'Ранее': [] };
  for (const it of items) {
    const t = it.createdAt ? new Date(it.createdAt).getTime() : 0;
    if (t >= startOfToday) buckets['Сегодня'].push(it);
    else if (t >= startOfYesterday) buckets['Вчера'].push(it);
    else buckets['Ранее'].push(it);
  }
  return (['Сегодня', 'Вчера', 'Ранее'] as TimeGroup[])
    .map(label => ({ label, items: buckets[label] }))
    .filter(g => g.items.length > 0);
}

/** Human-readable timestamp. "10:42" for today, "вчера, 16:20" for yesterday,
 *  "24 мая" for earlier. Used in row footer + dropdown row. */
export function formatFeedTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  const t = d.getTime();
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (t >= startOfToday) return hhmm;
  if (t >= startOfYesterday) return `вчера, ${hhmm}`;
  const months = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}
// Re-export Clock so consumers can use it without re-importing lucide
export { Clock, Star };
