// Phase 2 / commit 2 — extracted from ChatView.tsx. The sticky header
// at the top of the open conversation: back arrow, avatar (with online
// dot for resident-side view), name, subtitle, search-toggle button,
// info-menu button + dropdown.
//
// This is largely a structural extraction — the markup is the same as
// the v105 inline version. The two behavioural deltas added per the
// v2 design (docs/design-bundle-admin-chat/v2/kamizo-admin-dialog.jsx):
//
//   1. Admin-side now shows the "на связи · отвечаем до 15 мин"
//      status line in the subtitle position when there's no other
//      subtitle (house/apt). Mirrors the v2 design's resident-context
//      header. Resident-side already had this status copy.
//   2. The info button (MoreVertical) is preserved for backwards
//      compatibility with the existing inline info dropdown — commit 3
//      will replace it with the v2 design's full InfoDropdown overlay
//      (resident profile + linked requests + assign/close actions).
//      For now the dropdown content is unchanged from v105.
//
// All other behaviour (showSearch toggle, showInfo dropdown, getTitle/
// getSubtitle resolution, isPrivateSupport branching) is preserved
// verbatim.

import { ArrowLeft, MoreVertical, Search } from 'lucide-react';
import { CHAT_CHANNEL_LABELS } from '../../types';
import { type ChatChannel, getAvatarColor, getInitials } from './chatUtils';

export interface DialogHeaderProps {
  channel?: ChatChannel;
  language: 'ru' | 'uz';
  isResident: boolean;
  isPrivateSupport: boolean;
  isStaff: boolean;
  messagesCount: number;
  hideBackOnDesktop: boolean;
  showSearch: boolean;
  showInfo: boolean;
  onBack: () => void;
  onToggleSearch: () => void;
  onToggleInfo: () => void;
  getTitle: () => string;
  getSubtitle: () => string;
}

export function DialogHeader({
  channel,
  language,
  isResident,
  isPrivateSupport,
  isStaff,
  messagesCount,
  hideBackOnDesktop,
  showSearch,
  showInfo,
  onBack,
  onToggleSearch,
  onToggleInfo,
  getTitle,
  getSubtitle,
}: DialogHeaderProps) {
  // Admin-side subtitle: prefer the house/apt context from getSubtitle();
  // when it's empty (channel has no resident context), fall back to the
  // same "на связи" copy the resident side shows — matches v2 design's
  // resident-context header on the operator surface too.
  const resolvedSubtitle = (() => {
    if (isPrivateSupport && isResident) {
      return language === 'ru' ? 'на связи' : 'aloqada';
    }
    const sub = getSubtitle();
    if (sub) return sub;
    if (isStaff && isPrivateSupport) {
      return language === 'ru'
        ? 'на связи · отвечаем до 15 мин'
        : 'aloqada · 15 daq ichida javob beramiz';
    }
    return '';
  })();

  const subtitleTone =
    isPrivateSupport && isResident
      ? 'text-[#10B981] font-medium'
      : 'text-gray-500';

  return (
    <div
      className="bg-white border-b border-gray-100 flex-shrink-0"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <button
          onClick={onBack}
          className={`w-10 h-10 flex items-center justify-center bg-gray-50 hover:bg-gray-100 active:bg-gray-200 rounded-[12px] transition-colors touch-manipulation ${
            hideBackOnDesktop ? 'md:hidden' : ''
          }`}
          aria-label={language === 'ru' ? 'Назад' : 'Orqaga'}
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>

        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative flex-shrink-0">
            {/* Avatar. Resident's УК avatar is forced to the brand gradient
                so it doesn't get a random color from the hashed name.
                Admin/manager view gets a name-hashed avatar so each
                resident has their own consistent color. Group channels
                fall back to emoji tiles. */}
            <div
              className={`w-11 h-11 rounded-full flex items-center justify-center text-white font-semibold text-[13px] shadow-sm ${
                isPrivateSupport && isResident
                  ? 'bg-gradient-to-br from-[#E8621A] to-[#F59E0B]'
                  : isPrivateSupport
                  ? `bg-gradient-to-br ${getAvatarColor(channel?.name || '')}`
                  : channel?.type === 'uk_general'
                  ? 'bg-gradient-to-br from-purple-400 to-purple-600 text-xl'
                  : 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-xl'
              }`}
            >
              {isPrivateSupport
                ? isResident
                  ? 'УК'
                  : getInitials(channel?.name || '')
                : channel?.type === 'uk_general'
                ? '🏢'
                : '🏠'}
            </div>
            {/* Online indicator — green dot on the avatar when УК is online.
                Residents always see it (assume УК online); admin doesn't. */}
            {isPrivateSupport && isResident && (
              <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#10B981] border-2 border-white" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[16px] font-bold text-gray-900 truncate leading-tight">
              {getTitle()}
            </h3>
            {resolvedSubtitle && (
              <p className={`text-[12px] truncate leading-tight mt-0.5 ${subtitleTone}`}>
                {resolvedSubtitle}
              </p>
            )}
          </div>
        </div>

        <button
          onClick={onToggleSearch}
          className={`w-10 h-10 flex items-center justify-center rounded-[12px] transition-colors touch-manipulation ${
            showSearch
              ? 'bg-orange-100 text-orange-600'
              : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
          }`}
          aria-label={language === 'ru' ? 'Поиск' : 'Qidiruv'}
        >
          <Search className="w-5 h-5" />
        </button>
        <div className="relative">
          <button
            onClick={onToggleInfo}
            className={`w-10 h-10 flex items-center justify-center rounded-[12px] transition-colors touch-manipulation ${
              showInfo
                ? 'bg-orange-100 text-orange-600'
                : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
            }`}
            aria-label={language === 'ru' ? 'Меню' : 'Menyu'}
          >
            <MoreVertical className="w-5 h-5" />
          </button>
          {showInfo && (
            // The existing inline info dropdown stays in commit 2 (we
            // ship a structural extract of the header WITHOUT changing
            // its dropdown content). Commit 3 will swap this for the v2
            // design's full InfoDropdown overlay component.
            //
            // Sprint 1 caveat preserved: w-64 (256px) overflows on
            // iPhone SE 320px; capped via min(16rem,85vw).
            <div className="absolute right-0 top-full mt-1 w-[min(16rem,85vw)] bg-white rounded-[14px] shadow-lg border border-gray-100 z-50 p-4">
              <div className="space-y-2.5">
                <div>
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                    {language === 'ru' ? 'Название' : 'Nomi'}
                  </p>
                  <p className="text-sm font-semibold text-gray-900 mt-0.5">{getTitle()}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                    {language === 'ru' ? 'Тип' : 'Turi'}
                  </p>
                  <p className="text-sm text-gray-700 mt-0.5">
                    {channel?.type
                      ? CHAT_CHANNEL_LABELS[channel.type]
                        ? language === 'ru'
                          ? CHAT_CHANNEL_LABELS[channel.type].label
                          : CHAT_CHANNEL_LABELS[channel.type].labelUz
                        : channel.type
                      : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                    {language === 'ru' ? 'Сообщений' : 'Xabarlar'}
                  </p>
                  <p className="text-sm text-gray-700 mt-0.5">{messagesCount}</p>
                </div>
                {getSubtitle() && (
                  <div>
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                      {language === 'ru' ? 'Детали' : 'Tafsilotlar'}
                    </p>
                    <p className="text-sm text-gray-700 mt-0.5">{getSubtitle()}</p>
                  </div>
                )}
              </div>
              <button
                onClick={onToggleInfo}
                className="mt-3 w-full py-2 text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-[10px] transition-colors"
              >
                {language === 'ru' ? 'Закрыть' : 'Yopish'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
