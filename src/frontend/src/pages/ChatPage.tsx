import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Send, ArrowLeft, Building2, Home,
  Search, Check, CheckCheck,
  Loader2, AlertCircle,
  MessageCircle, MessageSquare,
  ChevronDown,
  MoreVertical,
  ChevronUp,
  X,
  MapPin,
  Smile,
  Paperclip
} from 'lucide-react';
import { EmptyState, MessageContent } from '../components/common';
import { plural } from '../utils/plural';
import { formatName } from '../utils/formatName';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';
import { chatApi } from '../services/api';
import { subscribeToChatMessages } from '../hooks/useWebSocketSync';
import { CHAT_CHANNEL_LABELS, type ChatChannelType, type UserRole } from '../types';

// ─── Types ───────────────────────────────────────────────────────────────
interface ChatChannel {
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
}

interface ChatMessage {
  id: string;
  channel_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: UserRole;
  content: string;
  created_at: string;
  read_by?: string[];
  status?: 'sending' | 'sent' | 'failed';
}

// ─── Role Badge ──────────────────────────────────────────────────────────
const ROLE_CONFIG: Record<string, { label: string; labelUz: string; emoji: string; bg: string; text: string }> = {
  super_admin: { label: 'Супер Админ', labelUz: 'Super Admin', emoji: '🛡️', bg: 'bg-purple-50', text: 'text-purple-700' },
  admin: { label: 'Админ', labelUz: 'Admin', emoji: '🛡️', bg: 'bg-orange-50', text: 'text-orange-700' },
  manager: { label: 'Менеджер', labelUz: 'Menejer', emoji: '👑', bg: 'bg-purple-50', text: 'text-purple-700' },
  executor: { label: 'Исполнитель', labelUz: 'Ijrochi', emoji: '🔧', bg: 'bg-amber-50', text: 'text-amber-700' },
  resident: { label: 'Житель', labelUz: 'Turar joy egasi', emoji: '👤', bg: 'bg-blue-50', text: 'text-blue-700' },
  tenant: { label: 'Арендатор', labelUz: 'Ijarachi', emoji: '👤', bg: 'bg-green-50', text: 'text-green-700' },
  commercial_owner: { label: 'Коммерция', labelUz: 'Tijorat', emoji: '🏢', bg: 'bg-yellow-50', text: 'text-yellow-700' },
  department_head: { label: 'Глава отдела', labelUz: "Bo'lim boshlig'i", emoji: '👑', bg: 'bg-indigo-50', text: 'text-indigo-700' },
  director: { label: 'Директор', labelUz: 'Direktor', emoji: '👑', bg: 'bg-rose-50', text: 'text-rose-700' },
  advertiser: { label: 'Рекламодатель', labelUz: 'Reklamaberuvchi', emoji: '📢', bg: 'bg-pink-50', text: 'text-pink-700' },
  dispatcher: { label: 'Диспетчер', labelUz: 'Dispetcher', emoji: '📞', bg: 'bg-cyan-50', text: 'text-cyan-700' },
  security: { label: 'Охранник', labelUz: "Qo'riqchi", emoji: '🛡️', bg: 'bg-slate-50', text: 'text-slate-700' },
  marketplace_manager: { label: 'Менеджер магазина', labelUz: "Do'kon menejeri", emoji: '🛒', bg: 'bg-emerald-50', text: 'text-emerald-700' },
};

function RoleBadge({ role, language }: { role: UserRole; language: string }) {
  const config = ROLE_CONFIG[role] || ROLE_CONFIG.resident;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[6px] text-xs font-semibold ${config.bg} ${config.text}`}>
      <span>{config.emoji}</span>
      {language === 'ru' ? config.label : config.labelUz}
    </span>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────
function getInitials(name: string): string {
  if (!name || /^\d/.test(name)) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name[0].toUpperCase();
}

function getAvatarColor(name: string): string {
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

function formatRelativeTime(dateStr: string, lang: string): string {
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

function formatTime(dateStr: string, lang: string): string {
  const d = new Date(dateStr.endsWith?.('Z') ? dateStr : dateStr + 'Z');
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return d.toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'uz-UZ', { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays === 1) return lang === 'ru' ? 'Вчера' : 'Kecha';
  if (diffDays < 7) {
    return d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'uz-UZ', { weekday: 'short' });
  }
  return d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'uz-UZ', { day: 'numeric', month: 'short' });
}

function formatMessageTime(dateStr: string, lang: string): string {
  const d = new Date(dateStr.endsWith?.('Z') ? dateStr : dateStr + 'Z');
  return d.toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'uz-UZ', { hour: '2-digit', minute: '2-digit' });
}

function formatDateSeparator(dateStr: string, lang: string): string {
  const d = new Date(dateStr.endsWith?.('Z') ? dateStr : dateStr + 'Z');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.floor((today.getTime() - msgDate.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return lang === 'ru' ? 'Сегодня' : 'Bugun';
  if (diffDays === 1) return lang === 'ru' ? 'Вчера' : 'Kecha';
  return d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'uz-UZ', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Check if a last_message value is a real message text (not a number or empty) */
function getLastMessagePreview(channel: ChatChannel, lang: string): string {
  // Only show last_message if there's actually a last_message_at timestamp
  // This prevents showing stale data or numbers like "0" from message_count
  if (channel.last_message_at && channel.last_message && typeof channel.last_message === 'string' && channel.last_message.trim().length > 0) {
    return channel.last_message;
  }
  return lang === 'ru' ? 'Нет сообщений' : 'Xabar yo\'q';
}

// ─── Filter Tabs ─────────────────────────────────────────────────────────
type FilterTab = 'all' | 'unread';

// ─── Branch tab colors (cycled) ───────────────────────────────────────────
const BRANCH_COLORS = [
  { active: 'bg-blue-500 text-white', inactive: 'bg-blue-50 text-blue-700 border border-blue-200', dot: 'bg-blue-500' },
  { active: 'bg-purple-500 text-white', inactive: 'bg-purple-50 text-purple-700 border border-purple-200', dot: 'bg-purple-500' },
  { active: 'bg-teal-500 text-white', inactive: 'bg-teal-50 text-teal-700 border border-teal-200', dot: 'bg-teal-500' },
  { active: 'bg-rose-500 text-white', inactive: 'bg-rose-50 text-rose-700 border border-rose-200', dot: 'bg-rose-500' },
  { active: 'bg-amber-500 text-white', inactive: 'bg-amber-50 text-amber-700 border border-amber-200', dot: 'bg-amber-500' },
  { active: 'bg-indigo-500 text-white', inactive: 'bg-indigo-50 text-indigo-700 border border-indigo-200', dot: 'bg-indigo-500' },
];

function getBranchColor(index: number) {
  return BRANCH_COLORS[index % BRANCH_COLORS.length];
}

// ─── Location Badges ──────────────────────────────────────────────────────
function LocationBadges({ channel, language, branchIndex }: { channel: ChatChannel; language: string; branchIndex: number }) {
  const color = getBranchColor(branchIndex);
  return (
    <div className="flex items-center gap-1 flex-wrap mt-1">
      {channel.resident_branch_name && (
        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-[6px] text-xs font-semibold ${color.inactive}`}>
          <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
          <span className="truncate max-w-[80px]">{channel.resident_branch_name}</span>
        </span>
      )}
      {channel.resident_building_name && (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-[6px] text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <Building2 className="w-2.5 h-2.5 flex-shrink-0" />
          <span className="truncate max-w-[80px]">{channel.resident_building_name}</span>
        </span>
      )}
      {channel.resident_apartment && (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-[6px] text-xs font-medium bg-gray-100 text-gray-600">
          <Home className="w-2.5 h-2.5 flex-shrink-0" />
          {language === 'ru' ? 'кв.' : 'xon.'} {channel.resident_apartment}
        </span>
      )}
    </div>
  );
}

// ─── Admin Channel Sidebar ──────────────────────────────────────────────
function AdminChannelList({
  channels,
  onSelectChannel,
  selectedChannelId,
  isLoading
}: {
  channels: ChatChannel[];
  onSelectChannel: (channelId: string) => void;
  selectedChannelId: string | null;
  isLoading: boolean;
}) {
  const { language } = useLanguageStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [selectedBranchTab, setSelectedBranchTab] = useState<string | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null);

  // Only private_support channels
  const supportChannels = useMemo(() =>
    channels.filter(ch => ch.type === 'private_support'),
  [channels]);

  const totalUnread = useMemo(() =>
    supportChannels.reduce((sum, ch) => sum + (ch.unread_count || 0), 0),
  [supportChannels]);

  // Unique branch names sorted
  const branchNames = useMemo(() => [...new Set(
    supportChannels.map(ch => ch.resident_branch_name).filter((n): n is string => !!n)
  )].sort(), [supportChannels]);

  // Branch → index map for consistent coloring
  const branchIndexMap = useMemo(() => {
    const map: Record<string, number> = {};
    branchNames.forEach((name, i) => { map[name] = i; });
    return map;
  }, [branchNames]);

  // Buildings within selected branch (or all if no branch selected)
  const buildingNames = useMemo(() => {
    const source = selectedBranchTab
      ? supportChannels.filter(ch => ch.resident_branch_name === selectedBranchTab)
      : supportChannels;
    return [...new Set(
      source.map(ch => ch.resident_building_name).filter((n): n is string => !!n)
    )].sort();
  }, [supportChannels, selectedBranchTab]);

  // Reset building filter when branch changes
  const handleBranchChange = (branch: string | null) => {
    setSelectedBranchTab(branch);
    setSelectedBuilding(null);
  };

  const sortChannels = (a: ChatChannel, b: ChatChannel) => {
    const aUnread = a.unread_count || 0;
    const bUnread = b.unread_count || 0;
    if (bUnread !== aUnread) return bUnread - aUnread;
    const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    return bTime - aTime;
  };

  const filteredChannels = useMemo(() => supportChannels.filter(ch => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        ch.name?.toLowerCase().includes(q) ||
        ch.description?.toLowerCase().includes(q) ||
        ch.last_message?.toLowerCase().includes(q) ||
        ch.resident_apartment?.toLowerCase().includes(q) ||
        ch.resident_building_name?.toLowerCase().includes(q) ||
        ch.resident_branch_name?.toLowerCase().includes(q);
      if (!matchesSearch) return false;
    }
    if (activeFilter === 'unread' && (!ch.unread_count || ch.unread_count === 0)) return false;
    if (selectedBranchTab && ch.resident_branch_name !== selectedBranchTab) return false;
    if (selectedBuilding && ch.resident_building_name !== selectedBuilding) return false;
    return true;
  }).sort(sortChannels), [supportChannels, searchQuery, activeFilter, selectedBranchTab, selectedBuilding]);

  const unreadCount = useMemo(() =>
    supportChannels.filter(ch => ch.unread_count && ch.unread_count > 0).length,
  [supportChannels]);

  // Counts per branch
  const branchUnread = useMemo(() => {
    const map: Record<string, number> = {};
    supportChannels.forEach(ch => {
      if (ch.resident_branch_name) {
        map[ch.resident_branch_name] = (map[ch.resident_branch_name] || 0) + (ch.unread_count || 0);
      }
    });
    return map;
  }, [supportChannels]);

  const branchCount = useMemo(() => {
    const map: Record<string, number> = {};
    supportChannels.forEach(ch => {
      if (ch.resident_branch_name) {
        map[ch.resident_branch_name] = (map[ch.resident_branch_name] || 0) + 1;
      }
    });
    return map;
  }, [supportChannels]);

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-0.5">
          <h2 className="text-lg font-bold text-gray-900" style={{ fontFamily: "'Onest', sans-serif" }}>
            {language === 'ru' ? 'Сообщения' : 'Xabarlar'}
          </h2>
          {totalUnread > 0 && (
            <span className="px-2 py-0.5 bg-orange-500 text-white text-xs font-bold rounded-full">
              {totalUnread > 99 ? '99+' : totalUnread} {language === 'ru' ? 'непрочитанных' : "o'qilmagan"}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 mb-3">
          {language === 'ru' ? 'Обращения жителей' : 'Aholi murojatlari'}
        </p>

        {/* Read/Unread filter */}
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-3 py-1.5 rounded-[10px] text-xs font-semibold transition-all ${
              activeFilter === 'all'
                ? 'bg-orange-500 text-white shadow-sm'
                : 'bg-gray-100 text-gray-500 hover:text-gray-700'
            }`}
          >
            {language === 'ru' ? 'Все' : 'Hammasi'} ({supportChannels.length})
          </button>
          {unreadCount > 0 && (
            <button
              onClick={() => setActiveFilter('unread')}
              className={`px-3 py-1.5 rounded-[10px] text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeFilter === 'unread'
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-orange-200'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${activeFilter === 'unread' ? 'bg-white' : 'bg-red-500'}`} />
              {language === 'ru' ? 'Новые' : 'Yangi'} ({unreadCount})
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={language === 'ru' ? 'Имя, объект, квартира...' : 'Ism, obyekt, xona...'}
            className="w-full pl-8 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-[12px] text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 transition-all"
            aria-label={language === 'ru' ? 'Поиск контактов' : 'Kontaktlarni qidirish'}
          />
        </div>
      </div>

      {/* Branch tabs (only if multiple branches) */}
      {branchNames.length > 1 && (
        <div className="px-4 pb-2">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
            <MapPin className="w-2.5 h-2.5" />
            {language === 'ru' ? 'Филиал' : 'Filial'}
          </p>
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
            {/* All branches tab */}
            <button
              onClick={() => handleBranchChange(null)}
              className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-[10px] text-xs font-semibold transition-all ${
                !selectedBranchTab
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {language === 'ru' ? 'Все' : 'Barchasi'}
              <span className={`text-xs font-bold ${!selectedBranchTab ? 'text-white/80' : 'text-gray-400'}`}>
                {supportChannels.length}
              </span>
            </button>
            {branchNames.map((branch) => {
              const color = getBranchColor(branchIndexMap[branch] ?? 0);
              const isActive = selectedBranchTab === branch;
              const bUnread = branchUnread[branch] || 0;
              return (
                <button
                  key={branch}
                  onClick={() => handleBranchChange(branch)}
                  className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-[10px] text-xs font-semibold transition-all ${
                    isActive ? color.active + ' shadow-sm' : color.inactive + ' hover:opacity-80'
                  }`}
                >
                  <span className="truncate max-w-[90px]">{branch}</span>
                  <span className={`text-xs font-bold ${isActive ? 'text-white/80' : ''}`}>
                    {branchCount[branch] || 0}
                  </span>
                  {bUnread > 0 && (
                    <span className={`w-4 h-4 rounded-full text-xs font-bold flex items-center justify-center ${isActive ? 'bg-white/30 text-white' : 'bg-red-500 text-white'}`}>
                      {bUnread > 9 ? '9+' : bUnread}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Building filter (if branch selected and has multiple buildings) */}
      {selectedBranchTab && buildingNames.length > 1 && (
        <div className="px-4 pb-2">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
            <Building2 className="w-2.5 h-2.5" />
            {language === 'ru' ? 'Объект' : 'Obyekt'}
          </p>
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
            <button
              onClick={() => setSelectedBuilding(null)}
              className={`flex-shrink-0 px-2.5 py-1 rounded-[8px] text-xs font-medium transition-all ${
                !selectedBuilding
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
              }`}
            >
              {language === 'ru' ? 'Все' : 'Barchasi'}
            </button>
            {buildingNames.map((building) => (
              <button
                key={building}
                onClick={() => setSelectedBuilding(building === selectedBuilding ? null : building)}
                className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-[8px] text-xs font-medium transition-all ${
                  selectedBuilding === building
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                }`}
              >
                <Building2 className="w-2.5 h-2.5 flex-shrink-0" />
                <span className="truncate max-w-[80px]">{building}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Section label */}
      <div className="px-4 py-1.5 border-t bg-gray-50/60">
        <span className="text-xs font-medium text-gray-500">
          {filteredChannels.length}{' '}
          {plural(
            language === 'ru' ? 'ru' : 'uz',
            filteredChannels.length,
            { one: 'диалог', few: 'диалога', many: 'диалогов' },
            { one: 'dialog', other: 'dialog' }
          )}
        </span>
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-orange-400" />
          </div>
        ) : filteredChannels.length === 0 ? (
          <EmptyState
            icon={<MessageSquare className="w-12 h-12" />}
            title={language === 'ru' ? 'Нет сообщений' : 'Xabarlar yo\'q'}
            description={activeFilter === 'unread'
              ? (language === 'ru' ? 'Нет новых сообщений' : 'Yangi xabarlar yo\'q')
              : (language === 'ru' ? 'Нет обращений' : 'Murojatlar yo\'q')
            }
          />
        ) : (
          filteredChannels.map((channel) => {
            const isSelected = selectedChannelId === channel.id;
            const hasUnread = Number(channel.unread_count) > 0;
            const preview = getLastMessagePreview(channel, language);
            const hasMessages = !!channel.last_message_at;
            const branchIdx = channel.resident_branch_name ? (branchIndexMap[channel.resident_branch_name] ?? 0) : 0;

            return (
              <button
                key={channel.id}
                onClick={() => onSelectChannel(channel.id)}
                className={`w-full px-4 py-3 flex items-start gap-3 text-left transition-all ${
                  isSelected
                    ? 'bg-orange-50 border-r-2 border-orange-500'
                    : hasUnread
                      ? 'bg-orange-50/40 hover:bg-orange-50/60'
                      : 'hover:bg-gray-50'
                }`}
              >
                {/* Avatar */}
                <div className="relative flex-shrink-0 mt-0.5">
                  <div className={`w-10 h-10 rounded-[13px] bg-gradient-to-br ${getAvatarColor(channel.name)} flex items-center justify-center text-white font-semibold text-sm shadow-sm`}>
                    {getInitials(channel.name)}
                  </div>
                  {hasUnread && (
                    <div className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] bg-orange-500 rounded-full flex items-center justify-center shadow-sm">
                      <span className="text-xs text-white font-bold px-1">
                        {channel.unread_count! > 99 ? '99+' : channel.unread_count}
                      </span>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm truncate ${hasUnread ? 'font-bold text-gray-900' : 'font-medium text-gray-800'}`}>
                      {formatName(channel.name)}
                    </span>
                    {channel.last_message_at && (
                      <span className={`text-xs flex-shrink-0 ${hasUnread ? 'text-orange-500 font-semibold' : 'text-gray-400'}`}>
                        {formatRelativeTime(channel.last_message_at, language)}
                      </span>
                    )}
                  </div>

                  {/* Colored location badges */}
                  {(channel.resident_branch_name || channel.resident_building_name || channel.resident_apartment) && (
                    <LocationBadges channel={channel} language={language} branchIndex={branchIdx} />
                  )}

                  {/* Last message preview */}
                  {hasMessages && (
                    <p className={`text-xs truncate mt-1 ${hasUnread ? 'text-gray-700 font-medium' : 'text-gray-500'}`}>
                      {preview}
                    </p>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Quick Reply Buttons (Admin only) ────────────────────────────────────
function QuickReplies({ onSelect, language }: { onSelect: (text: string) => void; language: string }) {
  const replies = language === 'ru'
    ? [
        'Ваша заявка принята ✅',
        'Мастер уже выехал 🚗',
        'Проблема решена! 🎉',
        'Уточните, пожалуйста 🤔',
        'Спасибо за обращение!',
      ]
    : [
        "Arizangiz qabul qilindi ✅",
        "Usta yo'lga chiqdi 🚗",
        "Muammo hal qilindi! 🎉",
        "Iltimos, aniqlang 🤔",
        "Murojaat uchun rahmat!",
      ];

  return (
    <div className="px-4 py-2.5 border-b bg-orange-50/50 flex gap-2 overflow-x-auto scrollbar-none">
      {replies.map((reply, i) => (
        <button
          key={i}
          onClick={() => onSelect(reply)}
          className="flex-shrink-0 px-3.5 py-2 bg-white border border-orange-200 rounded-[12px] text-xs font-medium text-orange-700 hover:bg-orange-50 hover:border-orange-300 transition-all active:scale-95 shadow-sm"
        >
          {reply}
        </button>
      ))}
    </div>
  );
}

// ─── Chat View ───────────────────────────────────────────────────────────
function ChatView({
  channelId,
  channel,
  onBack,
  hideBackOnDesktop = false,
  onMarkRead,
}: {
  channelId: string;
  channel?: ChatChannel;
  onBack: () => void;
  hideBackOnDesktop?: boolean;
  onMarkRead?: () => void;
}) {
  const { user } = useAuthStore();
  const { language } = useLanguageStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── visualViewport keyboard handling — keep input visible above keyboard ──
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const onResize = () => {
      // Difference between layout viewport and visual viewport = keyboard height
      const offset = window.innerHeight - vv.height;
      setKeyboardOffset(offset > 50 ? offset : 0);
      // Scroll messages to bottom when keyboard opens
      if (offset > 50) {
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      }
    };

    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, []);

  // Search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<number[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Info panel state
  const [showInfo, setShowInfo] = useState(false);

  const QUICK_EMOJIS = ['😊','😂','❤️','👍','👎','🙏','😍','😭','🎉','🔥','✅','⚠️','😮','🤔','💪','👋','🏠','🔧','📋','📞'];

  const insertEmoji = (emoji: string) => {
    setNewMessage(prev => prev + emoji);
    setShowEmojiPicker(false);
  };

  const isStaff = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'super_admin' || user?.role === 'director' || user?.role === 'department_head';
  const isResident = user?.role === 'resident' || user?.role === 'tenant' || user?.role === 'commercial_owner';
  const isPrivateSupport = channel?.type === 'private_support';

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    if (!channelId || channelId === 'undefined') {
      setIsLoading(false);
      return;
    }
    try {
      const response = await chatApi.getMessages(channelId);
      setMessages(response.messages || []);
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    } finally {
      setIsLoading(false);
    }
  }, [channelId]);

  const markAsRead = useCallback(async () => {
    if (!channelId || channelId === 'undefined') return;
    try {
      await chatApi.markRead(channelId);
      onMarkRead?.();
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  }, [channelId, onMarkRead]);

  useEffect(() => {
    setIsLoading(true);
    fetchMessages();
    markAsRead();

    const unsubscribe = subscribeToChatMessages((message: any) => {
      if (message.channel_id === channelId) {
        if (message.type === 'read') {
          setMessages(prev => prev.map(m =>
            m.id === message.message_id
              ? { ...m, read_by: [...(m.read_by || []), message.user_id] }
              : m
          ));
          return;
        }
        setMessages(prev => {
          const exists = prev.some(m => m.id === message.id);
          if (exists) return prev;
          return [...prev, message];
        });
        markAsRead();
      }
    });

    return () => { unsubscribe(); };
  }, [fetchMessages, channelId, markAsRead]);

  // Polling fallback when WebSocket is disabled — fetch new messages every 10s
  useEffect(() => {
    if (!channelId || channelId === 'undefined') return;
    const interval = setInterval(() => {
      fetchMessages();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchMessages, channelId]);

  // Scroll to bottom
  useEffect(() => {
    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
    return () => clearTimeout(timer);
  }, [messages.length]);

  // Search logic
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const q = searchQuery.toLowerCase();
    const indices = messages
      .map((m, i) => m.content.toLowerCase().includes(q) ? i : -1)
      .filter(i => i !== -1);
    setSearchResults(indices);
    setCurrentSearchIndex(0);
  }, [searchQuery, messages]);

  // Scroll to current search match
  useEffect(() => {
    if (searchResults.length > 0) {
      const msgIndex = searchResults[currentSearchIndex];
      const el = document.getElementById(`msg-${msgIndex}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentSearchIndex, searchResults]);

  // Focus search input when opened
  useEffect(() => {
    if (showSearch) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    } else {
      setSearchQuery('');
      setSearchResults([]);
    }
  }, [showSearch]);

  const handleSend = async () => {
    if (!newMessage.trim() || !user || isSending) return;
    const messageToSend = newMessage.trim();
    setNewMessage('');
    setIsSending(true);

    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: ChatMessage = {
      id: tempId,
      channel_id: channelId,
      sender_id: user.id,
      sender_name: user.name || '',
      sender_role: user.role as UserRole,
      content: messageToSend,
      created_at: new Date().toISOString(),
      status: 'sending',
    };

    setMessages(prev => [...prev, optimisticMessage]);

    try {
      const response = await chatApi.sendMessage(channelId, messageToSend);
      if (response.message) {
        setMessages(prev =>
          prev.map(m => m.id === tempId ? { ...response.message, status: 'sent' as const } : m)
        );
      } else {
        setMessages(prev =>
          prev.map(m => m.id === tempId ? { ...m, status: 'sent' as const } : m)
        );
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages(prev =>
        prev.map(m => m.id === tempId ? { ...m, status: 'failed' as const } : m)
      );
    } finally {
      setIsSending(false);
    }
  };

  const retrySend = async (failedMsg: ChatMessage) => {
    setMessages(prev =>
      prev.map(m => m.id === failedMsg.id ? { ...m, status: 'sending' as const } : m)
    );

    try {
      const response = await chatApi.sendMessage(channelId, failedMsg.content);
      if (response.message) {
        setMessages(prev =>
          prev.map(m => m.id === failedMsg.id ? { ...response.message, status: 'sent' as const } : m)
        );
      } else {
        setMessages(prev =>
          prev.map(m => m.id === failedMsg.id ? { ...m, status: 'sent' as const } : m)
        );
      }
    } catch (error) {
      console.error('Retry failed:', error);
      setMessages(prev =>
        prev.map(m => m.id === failedMsg.id ? { ...m, status: 'failed' as const } : m)
      );
    }
  };

  const getTitle = () => {
    if (isPrivateSupport) {
      if (isResident) return language === 'ru' ? 'Чат с УК' : 'UK bilan chat';
      return channel?.name || (language === 'ru' ? 'Чат' : 'Chat');
    }
    if (channel) {
      const labels = CHAT_CHANNEL_LABELS[channel.type];
      return language === 'ru' ? labels.label : labels.labelUz;
    }
    return language === 'ru' ? 'Чат' : 'Chat';
  };

  const getSubtitle = () => {
    if (isPrivateSupport && !isResident) {
      const parts: string[] = [];
      if (channel?.resident_branch_name) parts.push(channel.resident_branch_name);
      if (channel?.resident_building_name) parts.push(channel.resident_building_name);
      if (channel?.resident_apartment) parts.push(`${language === 'ru' ? 'кв.' : 'xon.'} ${channel.resident_apartment}`);
      return parts.join(' · ') || '';
    }
    if (isPrivateSupport && isResident) {
      return language === 'ru' ? 'Администрация онлайн' : 'Administratsiya onlayn';
    }
    return `${messages.length} ${language === 'ru' ? 'сообщений' : 'xabar'}`;
  };

  const getDateKey = (dateStr: string) => {
    const d = new Date(dateStr.endsWith?.('Z') ? dateStr : dateStr + 'Z');
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  };

  return (
    <div
      ref={chatContainerRef}
      className="h-full flex flex-col bg-white"
      style={keyboardOffset > 0 ? { height: `calc(100% - ${keyboardOffset}px)` } : undefined}
    >
      {/* ── Header ── */}
      <div className="bg-white border-b shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={onBack}
            className={`p-2 min-h-[40px] min-w-[40px] flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 rounded-[12px] transition-colors touch-manipulation ${hideBackOnDesktop ? 'md:hidden' : ''}`}
            aria-label="Назад"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>

          <div className={`w-10 h-10 rounded-[13px] flex items-center justify-center flex-shrink-0 ${
            isPrivateSupport
              ? `bg-gradient-to-br ${getAvatarColor(channel?.name || '')} text-white font-semibold text-sm`
              : channel?.type === 'uk_general' ? 'bg-purple-100 text-lg' : 'bg-emerald-100 text-lg'
          }`}>
            {isPrivateSupport
              ? getInitials(isResident ? (language === 'ru' ? 'Администрация' : 'Administratsiya') : (channel?.name || ''))
              : (channel?.type === 'uk_general' ? '🏢' : '🏠')
            }
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-gray-900 truncate">{getTitle()}</h3>
            <p className="text-xs text-gray-500 truncate">{getSubtitle()}</p>
          </div>

          <button
            onClick={() => { setShowSearch(s => !s); setShowInfo(false); }}
            className={`p-2 min-h-[40px] min-w-[40px] flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 rounded-[12px] transition-colors touch-manipulation ${showSearch ? 'bg-gray-100' : ''}`}
          >
            <Search className="w-5 h-5 text-gray-600" />
          </button>
          <div className="relative">
            <button
              onClick={() => { setShowInfo(s => !s); setShowSearch(false); }}
              className={`p-2 min-h-[40px] min-w-[40px] flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 rounded-[12px] transition-colors touch-manipulation ${showInfo ? 'bg-gray-100' : ''}`}
            >
              <MoreVertical className="w-5 h-5 text-gray-600" />
            </button>
            {showInfo && (
              <div className="absolute right-0 top-full mt-1 w-64 bg-white rounded-[14px] shadow-lg border border-gray-100 z-50 p-4">
                <div className="space-y-2.5">
                  <div>
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">{language === 'ru' ? 'Название' : 'Nomi'}</p>
                    <p className="text-sm font-semibold text-gray-900 mt-0.5">{getTitle()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">{language === 'ru' ? 'Тип' : 'Turi'}</p>
                    <p className="text-sm text-gray-700 mt-0.5">{channel?.type ? (CHAT_CHANNEL_LABELS[channel.type] ? (language === 'ru' ? CHAT_CHANNEL_LABELS[channel.type].label : CHAT_CHANNEL_LABELS[channel.type].labelUz) : channel.type) : '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">{language === 'ru' ? 'Сообщений' : 'Xabarlar'}</p>
                    <p className="text-sm text-gray-700 mt-0.5">{messages.length}</p>
                  </div>
                  {getSubtitle() && (
                    <div>
                      <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">{language === 'ru' ? 'Детали' : 'Tafsilotlar'}</p>
                      <p className="text-sm text-gray-700 mt-0.5">{getSubtitle()}</p>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setShowInfo(false)}
                  className="mt-3 w-full py-2 text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-[10px] transition-colors"
                >
                  {language === 'ru' ? 'Закрыть' : 'Yopish'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Search Bar ── */}
      {showSearch && (
        <div className="bg-white border-b px-4 py-2 flex items-center gap-2">
          <div className="flex-1 relative flex items-center">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={language === 'ru' ? 'Поиск по сообщениям...' : 'Xabarlardan qidirish...'}
              className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-[10px] text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 transition-all"
              aria-label={language === 'ru' ? 'Поиск по сообщениям' : 'Xabarlardan qidirish'}
            />
          </div>
          {searchQuery.trim() && (
            <span className="text-xs text-gray-500 whitespace-nowrap min-w-[50px] text-center">
              {searchResults.length > 0
                ? `${currentSearchIndex + 1} ${language === 'ru' ? 'из' : '/'} ${searchResults.length}`
                : `0 ${language === 'ru' ? 'из' : '/'} 0`
              }
            </span>
          )}
          <button
            onClick={() => {
              if (searchResults.length > 0) {
                setCurrentSearchIndex(i => i > 0 ? i - 1 : searchResults.length - 1);
              }
            }}
            disabled={searchResults.length === 0}
            className="p-1.5 min-h-[32px] min-w-[32px] flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 rounded-[8px] transition-colors touch-manipulation disabled:opacity-30"
          >
            <ChevronUp className="w-4 h-4 text-gray-600" />
          </button>
          <button
            onClick={() => {
              if (searchResults.length > 0) {
                setCurrentSearchIndex(i => i < searchResults.length - 1 ? i + 1 : 0);
              }
            }}
            disabled={searchResults.length === 0}
            className="p-1.5 min-h-[32px] min-w-[32px] flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 rounded-[8px] transition-colors touch-manipulation disabled:opacity-30"
          >
            <ChevronDown className="w-4 h-4 text-gray-600" />
          </button>
          <button
            onClick={() => setShowSearch(false)}
            className="p-1.5 min-h-[32px] min-w-[32px] flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 rounded-[8px] transition-colors touch-manipulation"
          >
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      )}

      {/* ── Quick replies (staff in private support) ── */}
      {isStaff && isPrivateSupport && (
        <QuickReplies
          onSelect={(text) => setNewMessage(text)}
          language={language}
        />
      )}

      {/* ── Messages ── */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-4 py-3" style={{ overscrollBehaviorY: 'contain' }}>
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-orange-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center">
            <div className="w-16 h-16 bg-orange-50 rounded-[20px] flex items-center justify-center mb-4">
              <MessageCircle className="w-8 h-8 text-orange-300" />
            </div>
            <p className="text-gray-400 text-sm font-medium">
              {language === 'ru' ? 'Начните диалог' : 'Suhbatni boshlang'}
            </p>
            <p className="text-gray-300 text-xs mt-1">
              {language === 'ru' ? 'Напишите первое сообщение' : 'Birinchi xabar yozing'}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {messages.map((message, index) => {
              const isOwn = message.sender_id === user?.id;
              const prevMsg = index > 0 ? messages[index - 1] : null;
              const showSender = !isOwn && (!prevMsg || prevMsg.sender_id !== message.sender_id);
              const showDateSeparator = !prevMsg || getDateKey(prevMsg.created_at) !== getDateKey(message.created_at);

              const isSearchMatch = searchResults.includes(index);
              const isCurrentMatch = searchResults[currentSearchIndex] === index;

              return (
                <div key={message.id} id={`msg-${index}`}>
                  {showDateSeparator && (
                    <div className="flex items-center justify-center py-3">
                      <span className="px-3 py-1 bg-white/80 backdrop-blur-sm rounded-[10px] text-xs text-gray-400 font-medium shadow-sm">
                        {formatDateSeparator(message.created_at, language)}
                      </span>
                    </div>
                  )}

                  <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ${showSender ? 'mt-3' : 'mt-0.5'}`}>
                    <div className={`max-w-[75%] ${isCurrentMatch ? 'ring-2 ring-orange-400 rounded-[20px]' : isSearchMatch ? 'ring-1 ring-orange-200 rounded-[20px]' : ''}`}>
                      {showSender && (
                        <div className="flex items-center gap-2 mb-1 px-1">
                          <span className="text-xs font-semibold text-gray-700">{message.sender_name}</span>
                          <RoleBadge role={message.sender_role} language={language} />
                        </div>
                      )}

                      {/* Chat bubble contrast:
                          Mine — #E67E22 (dark orange) with white text, 4.6:1 ratio.
                          UK   — #F3F4F6 (light gray) with gray-900 text, clearly
                                 distinct from the white chat background. */}
                      <div className={`px-3.5 py-2.5 ${
                        isOwn
                          ? 'bg-[#E67E22] text-white rounded-[18px] rounded-br-[6px] shadow-sm'
                          : 'bg-[#F3F4F6] text-gray-900 rounded-[18px] rounded-bl-[6px]'
                      } ${message.status === 'sending' ? 'opacity-60' : ''}`}>
                        <MessageContent content={message.content} isOwn={isOwn} language={language === 'ru' ? 'ru' : 'uz'} />
                        <div className={`flex items-center justify-end gap-1 mt-1 ${
                          isOwn ? 'text-white/75' : 'text-gray-500'
                        }`}>
                          <span className="text-xs">{formatMessageTime(message.created_at, language)}</span>
                          {isOwn && message.status === 'sending' && (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          )}
                          {isOwn && message.status !== 'sending' && message.status !== 'failed' && (
                            message.read_by && message.read_by.length > 1
                              ? <CheckCheck className="w-3 h-3" />
                              : <Check className="w-3 h-3" />
                          )}
                        </div>
                      </div>
                      {message.status === 'failed' && (
                        <button onClick={() => retrySend(message)} className="text-red-500 text-xs flex items-center gap-1 mt-1 px-1">
                          <AlertCircle className="w-3 h-3" /> {language === 'ru' ? 'Не отправлено. Повторить?' : 'Yuborilmadi. Qayta yuborishmi?'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ── Input ── */}
      <div className="bg-white border-t flex-shrink-0" style={{ paddingBottom: keyboardOffset > 0 ? '0px' : 'env(safe-area-inset-bottom, 0px)' }}>
        {/* Emoji picker */}
        {showEmojiPicker && (
          <div className="px-3 pt-2 pb-1">
            <div className="flex flex-wrap gap-1 p-2 bg-gray-50 rounded-xl border border-gray-200">
              {QUICK_EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => insertEmoji(emoji)}
                  className="w-9 h-9 flex items-center justify-center text-xl hover:bg-gray-200 rounded-lg transition-colors active:scale-95"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-end gap-2 px-3 py-3">
          <button
            onClick={() => setShowEmojiPicker(p => !p)}
            className={`p-2 rounded-[12px] transition-colors flex-shrink-0 touch-manipulation ${showEmojiPicker ? 'bg-orange-100 text-orange-500' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
            aria-label={language === 'ru' ? 'Эмодзи' : 'Emoji'}
            aria-pressed={showEmojiPicker}
          >
            <Smile className="w-5 h-5" />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-[12px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0 touch-manipulation"
            aria-label={language === 'ru' ? 'Прикрепить файл' : 'Fayl biriktirish'}
          >
            <Paperclip className="w-5 h-5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf,.doc,.docx"
            className="hidden"
            aria-label={language === 'ru' ? 'Прикрепить файл' : 'Fayl biriktirish'}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                setNewMessage(prev => prev + (prev ? ' ' : '') + `[${file.name}]`);
              }
              e.target.value = '';
            }}
          />
          <div className="flex-1 relative">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              onKeyDown={(e) => {
                if (isComposing) return;
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={language === 'ru' ? 'Написать сообщение...' : 'Xabar yozing...'}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-[14px] text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 transition-all"
              disabled={isSending}
              aria-label={language === 'ru' ? 'Написать сообщение' : 'Xabar yozing'}
            />
          </div>

          <button
            onClick={handleSend}
            disabled={!newMessage.trim() || isSending}
            className="p-2.5 bg-gradient-to-br from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:from-gray-300 disabled:to-gray-300 text-white rounded-[14px] transition-all touch-manipulation flex-shrink-0 shadow-sm shadow-orange-200 disabled:shadow-none active:scale-95"
            aria-label={language === 'ru' ? 'Отправить сообщение' : 'Xabar yuborish'}
          >
            {isSending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sound notification ──────────────────────────────────────────────────
function useNotificationSound() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU' + btoa(String.fromCharCode.apply(null, Array(1000).fill(128).map((_, i) => Math.sin(i * 0.1) * 50 + 128))));
    audioRef.current.volume = 0.3;
  }, []);

  const playSound = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  }, []);

  return playSound;
}

// ─── Main Chat Page ──────────────────────────────────────────────────────
export function ChatPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { language } = useLanguageStore();

  // Zero out #main-content padding while chat is open so the container fills the screen
  useEffect(() => {
    const main = document.getElementById('main-content');
    if (!main) return;
    main.classList.add('chat-active');
    main.style.setProperty('padding', '0', 'important');
    return () => {
      main.classList.remove('chat-active');
      main.style.removeProperty('padding');
    };
  }, []);
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const selectedChannelIdRef = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [residentChannel, setResidentChannel] = useState<ChatChannel | null>(null);
  const prevUnreadRef = useRef<number>(0);
  const playSound = useNotificationSound();

  const isResident = user?.role === 'resident' || user?.role === 'tenant' || user?.role === 'commercial_owner';

  const fetchChannels = useCallback(async () => {
    try {
      setError(null);
      if (isResident) {
        const channel = await chatApi.getOrCreateSupportChannel();
        if (channel && channel.id) {
          setResidentChannel(channel);
        } else {
          setError(language === 'ru' ? 'Не удалось создать чат' : 'Chat yaratib bo\'lmadi');
        }
      } else {
        const response = await chatApi.getChannels();
        const newChannels = response.channels || [];
        // Preserve unread_count: 0 for the currently open channel (user is reading it)
        setChannels(prev => {
          const merged = newChannels.map((ch: ChatChannel) => {
            const existing = prev.find(e => e.id === ch.id);
            // If user has this channel open (unread was cleared locally), keep it at 0
            if (existing && existing.unread_count === 0 && (ch.unread_count || 0) > 0 && selectedChannelIdRef.current === ch.id) {
              return { ...ch, unread_count: 0 };
            }
            return ch;
          });
          const totalUnread = merged.reduce((sum: number, ch: ChatChannel) => sum + (ch.unread_count || 0), 0);
          if (totalUnread > prevUnreadRef.current && prevUnreadRef.current > 0) {
            playSound();
          }
          prevUnreadRef.current = totalUnread;
          return merged;
        });
      }
    } catch (err) {
      console.error('Failed to fetch channels:', err);
      setError(language === 'ru' ? 'Ошибка загрузки' : 'Yuklanmadi');
    }
  }, [isResident, playSound, language]);

  useEffect(() => {
    setIsLoading(true);
    fetchChannels().finally(() => setIsLoading(false));
  }, [fetchChannels]);

  useEffect(() => {
    // Poll channels for all roles (staff every 15s, residents every 15s too since WS is off)
    const interval = setInterval(fetchChannels, 15000);
    return () => clearInterval(interval);
  }, [fetchChannels]);

  const selectedChannel = channels.find(ch => ch.id === selectedChannelId);

  const handleSelectChannel = useCallback((id: string) => {
    setSelectedChannelId(id);
    selectedChannelIdRef.current = id;
  }, []);

  const handleMarkRead = useCallback(() => {
    if (!selectedChannelId) return;
    setChannels(prev => prev.map(ch =>
      ch.id === selectedChannelId ? { ...ch, unread_count: 0 } : ch
    ));
  }, [selectedChannelId]);

  // ── Resident View ──
  if (isResident) {
    if (isLoading) {
      return (
        <div className="-mx-4 -mt-4 md:mx-0 md:mt-0 md:max-w-2xl md:mx-auto overflow-hidden">
          <div className="resident-chat-container bg-white md:rounded-[22px] md:shadow-sm md:border overflow-hidden flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin text-orange-400 mx-auto mb-3" />
              <p className="text-sm text-gray-400">{language === 'ru' ? 'Загрузка чата...' : 'Chat yuklanmoqda...'}</p>
            </div>
          </div>
        </div>
      );
    }

    if (residentChannel) {
      return (
        <div className="-mx-4 -mt-4 md:mx-0 md:mt-0 md:max-w-2xl md:mx-auto overflow-hidden">
          <div className="resident-chat-container bg-white md:rounded-[22px] md:shadow-sm md:border overflow-hidden flex flex-col">
            <ChatView
              channelId={residentChannel.id}
              channel={residentChannel}
              onBack={() => navigate('/')}
              hideBackOnDesktop
            />
          </div>
        </div>
      );
    }

    return (
      <div className="-mx-4 -mt-4 md:mx-0 md:mt-0 md:max-w-2xl md:mx-auto">
        <div className="resident-chat-container bg-white md:rounded-[22px] md:shadow-sm md:border overflow-hidden flex flex-col items-center justify-center gap-4 p-6">
          <div className="w-16 h-16 bg-red-50 rounded-[20px] flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-400" />
          </div>
          <p className="text-gray-500 text-center text-sm">{error || (language === 'ru' ? 'Ошибка загрузки чата' : 'Chat yuklanmadi')}</p>
          <button
            onClick={() => {
              setIsLoading(true);
              setError(null);
              fetchChannels().finally(() => setIsLoading(false));
            }}
            className="px-5 py-2.5 bg-gradient-to-br from-orange-500 to-orange-600 text-white text-sm font-medium rounded-[14px] hover:from-orange-600 hover:to-orange-700 transition-all shadow-sm"
          >
            {language === 'ru' ? 'Повторить' : 'Qayta urinish'}
          </button>
        </div>
      </div>
    );
  }

  // ── Admin/Manager View ──
  return (
    <div className="-mx-4 -mt-4 md:mx-0 md:mt-0 bg-white md:rounded-[22px] md:shadow-sm md:border overflow-hidden" style={{ height: 'calc(100dvh - var(--mobile-header-h, 68px))', maxHeight: 'calc(100dvh - 68px)' }}>
      <div className="h-full flex">
        <div className={`${
          selectedChannelId ? 'hidden md:flex md:flex-col' : 'flex flex-col'
        } w-full md:w-[280px] lg:w-[340px] border-r`}>
          <AdminChannelList
            channels={channels}
            onSelectChannel={handleSelectChannel}
            selectedChannelId={selectedChannelId}
            isLoading={isLoading}
          />
        </div>

        <div className={`${
          selectedChannelId ? 'flex flex-col' : 'hidden md:flex md:flex-col'
        } flex-1`}>
          {selectedChannelId ? (
            <ChatView
              channelId={selectedChannelId}
              channel={selectedChannel}
              onBack={() => { setSelectedChannelId(null); selectedChannelIdRef.current = null; }}
              onMarkRead={handleMarkRead}
            />
          ) : (
            <div className="h-full flex items-center justify-center bg-white">
              <div className="text-center">
                <div className="w-20 h-20 mx-auto mb-4 bg-orange-50 rounded-[24px] flex items-center justify-center">
                  <MessageCircle className="w-10 h-10 text-orange-300" />
                </div>
                <p className="text-gray-500 font-medium">
                  {language === 'ru' ? 'Выберите чат' : 'Chatni tanlang'}
                </p>
                <p className="text-gray-400 text-sm mt-1">
                  {language === 'ru' ? 'Выберите диалог из списка слева' : 'Chap tarafdagi ro\'yxatdan dialog tanlang'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
