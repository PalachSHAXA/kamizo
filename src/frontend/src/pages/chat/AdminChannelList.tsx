import { memo, useMemo, useState } from 'react';
import { Loader2, MessageSquare, Search, MapPin, Building2, Home } from 'lucide-react';
import { useLanguageStore } from '../../stores/languageStore';
import { EmptyState } from '../../components/common';
import { formatName } from '../../utils/formatName';
import { plural } from '../../utils/plural';
import {
  type ChatChannel,
  type FilterTab,
  getAvatarColor,
  getBranchColor,
  getInitials,
  getLastMessagePreview,
  formatRelativeTime,
} from './chatUtils';

// Sprint 13: extracted from ChatPage.tsx. The admin/manager sidebar
// that lists private_support channels with branch + building filter
// tabs, a search input, and a read/unread filter. ChatPage stays
// responsible for selectedChannelId state; this component reads it
// and emits an onSelectChannel callback.

// ─── Location badges ────────────────────────────────────────────────────
// Three colored pills rendered under each channel name showing branch /
// building / apartment. Memoised because the channel rows below render
// many of these and most rows don't change when a sibling changes.
const LocationBadges = memo(function LocationBadges({
  channel,
  language,
  branchIndex,
}: {
  channel: ChatChannel;
  language: string;
  branchIndex: number;
}) {
  const color = getBranchColor(branchIndex);
  return (
    <div className="flex items-center gap-1 flex-wrap mt-1">
      {channel.resident_branch_name && (
        <span
          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-[6px] text-xs font-semibold ${color.inactive}`}
          title={channel.resident_branch_name}
        >
          <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
          <span className="truncate max-w-[80px]">{channel.resident_branch_name}</span>
        </span>
      )}
      {channel.resident_building_name && (
        <span
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-[6px] text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"
          title={channel.resident_building_name}
        >
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
});

interface AdminChannelListProps {
  channels: ChatChannel[];
  onSelectChannel: (channelId: string) => void;
  selectedChannelId: string | null;
  isLoading: boolean;
}

export function AdminChannelList({
  channels,
  onSelectChannel,
  selectedChannelId,
  isLoading,
}: AdminChannelListProps) {
  const { language } = useLanguageStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [selectedBranchTab, setSelectedBranchTab] = useState<string | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null);

  // Only private_support channels — staff don't get a general channel
  // list, they only see resident → support threads.
  const supportChannels = useMemo(
    () => channels.filter((ch) => ch.type === 'private_support'),
    [channels],
  );

  const totalUnread = useMemo(
    () => supportChannels.reduce((sum, ch) => sum + (ch.unread_count || 0), 0),
    [supportChannels],
  );

  const branchNames = useMemo(
    () => [...new Set(supportChannels.map((ch) => ch.resident_branch_name).filter((n): n is string => !!n))].sort(),
    [supportChannels],
  );

  const branchIndexMap = useMemo(() => {
    const map: Record<string, number> = {};
    branchNames.forEach((name, i) => {
      map[name] = i;
    });
    return map;
  }, [branchNames]);

  const buildingNames = useMemo(() => {
    const source = selectedBranchTab
      ? supportChannels.filter((ch) => ch.resident_branch_name === selectedBranchTab)
      : supportChannels;
    return [
      ...new Set(source.map((ch) => ch.resident_building_name).filter((n): n is string => !!n)),
    ].sort();
  }, [supportChannels, selectedBranchTab]);

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

  const filteredChannels = useMemo(
    () =>
      supportChannels
        .filter((ch) => {
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
        })
        .sort(sortChannels),
    [supportChannels, searchQuery, activeFilter, selectedBranchTab, selectedBuilding],
  );

  const unreadCount = useMemo(
    () => supportChannels.filter((ch) => ch.unread_count && ch.unread_count > 0).length,
    [supportChannels],
  );

  const branchUnread = useMemo(() => {
    const map: Record<string, number> = {};
    supportChannels.forEach((ch) => {
      if (ch.resident_branch_name) {
        map[ch.resident_branch_name] = (map[ch.resident_branch_name] || 0) + (ch.unread_count || 0);
      }
    });
    return map;
  }, [supportChannels]);

  const branchCount = useMemo(() => {
    const map: Record<string, number> = {};
    supportChannels.forEach((ch) => {
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
            <button
              onClick={() => handleBranchChange(null)}
              className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-[10px] text-xs font-semibold transition-all ${
                !selectedBranchTab
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {language === 'ru' ? 'Все' : 'Barchasi'}
              <span
                className={`text-xs font-bold ${!selectedBranchTab ? 'text-white/80' : 'text-gray-400'}`}
              >
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
                    <span
                      className={`w-4 h-4 rounded-full text-xs font-bold flex items-center justify-center ${
                        isActive ? 'bg-white/30 text-white' : 'bg-red-500 text-white'
                      }`}
                    >
                      {bUnread > 9 ? '9+' : bUnread}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Building filter (only if a branch is selected and it has > 1 building) */}
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
            { one: 'dialog', other: 'dialog' },
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
            title={language === 'ru' ? 'Нет сообщений' : "Xabarlar yo'q"}
            description={
              activeFilter === 'unread'
                ? language === 'ru'
                  ? 'Нет новых сообщений'
                  : "Yangi xabarlar yo'q"
                : language === 'ru'
                ? 'Нет обращений'
                : "Murojatlar yo'q"
            }
          />
        ) : (
          filteredChannels.map((channel) => {
            const isSelected = selectedChannelId === channel.id;
            const hasUnread = Number(channel.unread_count) > 0;
            const preview = getLastMessagePreview(channel, language);
            const hasMessages = !!channel.last_message_at;
            const branchIdx = channel.resident_branch_name
              ? branchIndexMap[channel.resident_branch_name] ?? 0
              : 0;

            return (
              <button
                key={channel.id}
                onClick={() => onSelectChannel(channel.id)}
                className={`w-full px-4 py-3.5 flex items-start gap-3 text-left transition-all ${
                  isSelected
                    ? 'bg-orange-50 border-r-2 border-orange-500'
                    : hasUnread
                    ? 'bg-orange-50/30 hover:bg-orange-50/50'
                    : 'hover:bg-gray-50'
                }`}
              >
                {/* Avatar — rounded-full, 44 on md+ / 40 on mobile to read
                    as a "contact" avatar instead of a tile. */}
                <div className="relative flex-shrink-0">
                  <div
                    className={`w-10 h-10 md:w-11 md:h-11 rounded-full bg-gradient-to-br ${getAvatarColor(
                      channel.name,
                    )} flex items-center justify-center text-white font-semibold text-sm shadow-sm`}
                  >
                    {getInitials(channel.name)}
                  </div>
                  {hasUnread && (
                    <div className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-orange-500 rounded-full flex items-center justify-center shadow-sm ring-2 ring-white">
                      <span className="text-[10px] text-white font-bold px-1">
                        {channel.unread_count! > 99 ? '99+' : channel.unread_count}
                      </span>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[14px] truncate ${
                        hasUnread ? 'font-bold text-gray-900' : 'font-semibold text-gray-800'
                      }`}
                      title={channel.name}
                    >
                      {formatName(channel.name)}
                    </span>
                    {channel.last_message_at && (
                      <span
                        className={`text-[11px] flex-shrink-0 ${
                          hasUnread ? 'text-orange-600 font-semibold' : 'text-gray-400'
                        }`}
                      >
                        {formatRelativeTime(channel.last_message_at, language)}
                      </span>
                    )}
                  </div>

                  {/* Last message preview — 2 lines max, gives the manager
                      enough context to know whether the thread needs a
                      reply without opening it. */}
                  {hasMessages && (
                    <p
                      className={`text-[12.5px] mt-1 leading-snug ${
                        hasUnread ? 'text-gray-700 font-medium' : 'text-gray-500'
                      }`}
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {preview}
                    </p>
                  )}

                  {(channel.resident_branch_name ||
                    channel.resident_building_name ||
                    channel.resident_apartment) && (
                    <LocationBadges channel={channel} language={language} branchIndex={branchIdx} />
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
