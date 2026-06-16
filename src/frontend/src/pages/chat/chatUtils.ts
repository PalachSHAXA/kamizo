// Shared types and pure helpers used by ChatPage and its split-out
// child components (AdminChannelList, MessageBubble, ChatComposer).
// Extracted in Sprint 13 to break the ChatPage god-file without
// duplicating utilities across the new component files.

import type { ChatChannelType, UserRole } from '../../types';

export interface ChatMessage {
  id: string;
  channel_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: UserRole;
  content: string;
  created_at: string;
  read_by?: string[];
  // Sprint 11 privacy fix: aggregated flag — true once any management
  // user has opened the message. Used by the resident's double-tick so
  // the API never has to ship individual colleague IDs.
  management_read?: boolean;
  status?: 'sending' | 'sent' | 'failed';
}

export interface ChatChannel {
  id: string;
  type: ChatChannelType;
  name: string;
  description?: string;
  building_id?: string;
  resident_id?: string;
  message_count?: number;
  last_message?: string;
  last_message_at?: string;
  last_sender_id?: string;
  unread_count?: number;
  created_at: string;
  resident_apartment?: string;
  resident_building_name?: string;
  resident_branch_name?: string;
  // v120 (commit 2 of the admin-chat-actions sprint). Backend migration
  // 050 added these columns to chat_channels; both the list and the
  // single-channel endpoints now return them. All optional + nullable —
  // residents see the assigned_* / resolved_by_* fields nulled
  // server-side, but resolved_at is still visible to them (chat-spec
  // §1.4 — "your case was closed" is OK for residents to know).
  assigned_to?: string | null;
  assigned_to_name?: string | null;
  assigned_to_role?: string | null;
  resolved_at?: string | null;
  resolved_by?: string | null;
  resolved_by_name?: string | null;
  updated_at?: string | null;
}

export type FilterTab = 'all' | 'unread';

// Branch tab colors cycled by branchIndexMap so the same UK branch
// always renders with the same color across the page.
export const BRANCH_COLORS = [
  { active: 'bg-blue-500 text-white',    inactive: 'bg-blue-50 text-blue-700 border border-blue-200',       dot: 'bg-blue-500' },
  { active: 'bg-purple-500 text-white',  inactive: 'bg-purple-50 text-purple-700 border border-purple-200', dot: 'bg-purple-500' },
  { active: 'bg-teal-500 text-white',    inactive: 'bg-teal-50 text-teal-700 border border-teal-200',       dot: 'bg-teal-500' },
  { active: 'bg-rose-500 text-white',    inactive: 'bg-rose-50 text-rose-700 border border-rose-200',       dot: 'bg-rose-500' },
  { active: 'bg-amber-500 text-white',   inactive: 'bg-amber-50 text-amber-700 border border-amber-200',    dot: 'bg-amber-500' },
  { active: 'bg-indigo-500 text-white',  inactive: 'bg-indigo-50 text-indigo-700 border border-indigo-200', dot: 'bg-indigo-500' },
];

export function getBranchColor(index: number) {
  return BRANCH_COLORS[index % BRANCH_COLORS.length];
}

export function getInitials(name: string): string {
  if (!name || /^\d/.test(name)) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name[0].toUpperCase();
}

export function getAvatarColor(name: string): string {
  const colors = [
    'from-orange-400 to-orange-500',
    'from-blue-400 to-blue-500',
    'from-emerald-400 to-emerald-500',
    'from-purple-400 to-purple-500',
    'from-pink-400 to-pink-500',
    'from-cyan-400 to-cyan-500',
    'from-amber-400 to-amber-500',
    'from-indigo-400 to-indigo-500',
    'from-rose-400 to-rose-500',
    'from-teal-400 to-teal-500',
  ];
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export function formatRelativeTime(dateStr: string, lang: string): string {
  const diff = Date.now() - new Date(dateStr.endsWith?.('Z') ? dateStr : dateStr + 'Z').getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return lang === 'ru' ? 'сейчас' : 'hozir';
  if (mins < 60) return `${mins} ${lang === 'ru' ? 'мин' : 'min'}`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ${lang === 'ru' ? 'ч' : 'soat'}`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} ${lang === 'ru' ? 'д' : 'kun'}`;
  const d = new Date(dateStr.endsWith?.('Z') ? dateStr : dateStr + 'Z');
  return d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'uz-UZ', { day: 'numeric', month: 'short' });
}

export function formatMessageTime(dateStr: string, lang: string): string {
  const d = new Date(dateStr.endsWith?.('Z') ? dateStr : dateStr + 'Z');
  return d.toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'uz-UZ', { hour: '2-digit', minute: '2-digit' });
}

export function formatDateSeparator(dateStr: string, lang: string): string {
  const d = new Date(dateStr.endsWith?.('Z') ? dateStr : dateStr + 'Z');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.floor((today.getTime() - msgDate.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return lang === 'ru' ? 'Сегодня' : 'Bugun';
  if (diffDays === 1) return lang === 'ru' ? 'Вчера' : 'Kecha';
  return d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'uz-UZ', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Markdown-image embed used by the chat composer to attach a photo:
 *   ![filename](data:image/png;base64,...)  or  ![file](https://…)
 * Photos can sit alone or next to free text in the same message — strip
 * the embed and fall back to "📷 Фото" only when nothing readable
 * remains, so a channel list never shows the raw base64 string. */
const INLINE_IMG_RE = /!\[[^\]]*\]\((?:data:image\/[a-zA-Z+]+;base64,[A-Za-z0-9+/=]+|https?:\/\/[^\s)]+)\)/g;

function summarizeContent(raw: string, lang: string): string {
  const hasImage = /!\[[^\]]*\]\((?:data:image\/|https?:\/\/)/.test(raw);
  const stripped = raw.replace(INLINE_IMG_RE, '').trim();
  if (stripped) return hasImage ? `📷 ${stripped}` : stripped;
  if (hasImage) return lang === 'ru' ? '📷 Фото' : '📷 Rasm';
  return raw;
}

/** Last-message preview that ignores stale numeric counts and empty
 *  strings, and collapses inline-image markdown to a "📷 Фото" label so
 *  the channel list never bleeds base64. */
export function getLastMessagePreview(channel: ChatChannel, lang: string): string {
  if (
    channel.last_message_at &&
    channel.last_message &&
    typeof channel.last_message === 'string' &&
    channel.last_message.trim().length > 0
  ) {
    return summarizeContent(channel.last_message, lang);
  }
  return lang === 'ru' ? 'Нет сообщений' : "Xabar yo'q";
}
