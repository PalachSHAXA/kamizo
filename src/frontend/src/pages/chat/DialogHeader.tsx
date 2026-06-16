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

import { ArrowLeft, MoreVertical, Search, Check, UserCheck } from 'lucide-react';
import { type ChatChannel, getAvatarColor, getInitials } from './chatUtils';
import { InfoDropdown } from './InfoDropdown';

// v120 commit 2 — admin actions metadata. Map staff role → display
// label for the "Назначен: <Name> · <Role>" line under the title.
const ROLE_LABEL_RU: Record<string, string> = {
  director: 'Директор',
  admin: 'Админ',
  manager: 'Менеджер',
  department_head: 'Глава отдела',
  dispatcher: 'Диспетчер',
  executor: 'Исполнитель',
  advertiser: 'Рекламодатель',
  security: 'Охрана',
};
const ROLE_LABEL_UZ: Record<string, string> = {
  director: 'Direktor',
  admin: 'Admin',
  manager: 'Menejer',
  department_head: "Bo'lim boshlig'i",
  dispatcher: 'Dispetcher',
  executor: 'Ijrochi',
  advertiser: 'Reklamaberuvchi',
  security: "Qo'riqchi",
};

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
  onCloseInfo: () => void;
  getTitle: () => string;
  getSubtitle: () => string;
  // v120 commit 2 — wire the admin actions. Both undefined on the
  // resident path (ResidentChatView doesn't render this header), so
  // InfoDropdown's row gets `disabled` and the assigned-to line in
  // the header collapses to a non-tappable text row.
  onAssignClick?: () => void;
  onResolveClick?: () => void;
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
  onCloseInfo,
  getTitle,
  getSubtitle,
  onAssignClick,
  onResolveClick,
}: DialogHeaderProps) {
  // commit 3: InfoDropdown is rendered as a popover anchored to the
  // info button — staff side only. Residents don't see an info button.
  void messagesCount; // unused after commit 3 swap; kept in props for stable ABI
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
            <div className="flex items-center gap-1.5 min-w-0">
              <h3 className="text-[16px] font-bold text-gray-900 truncate leading-tight">
                {getTitle()}
              </h3>
              {/* v120 commit 2 — Решено pill. Shown to BOTH staff and
                  residents (chat-spec §1.4 makes the resolved state
                  visible to the resident — "your case was closed" is
                  legitimate context). Pill stays in flex-shrink-0 so
                  the title truncates around it on narrow viewports. */}
              {channel?.resolved_at && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10.5px] font-bold uppercase tracking-wide flex-shrink-0"
                  aria-label={language === 'ru' ? 'Обращение решено' : 'Murojaat hal qilingan'}
                  title={
                    channel.resolved_by_name
                      ? `${language === 'ru' ? 'Решил' : 'Yopdi'}: ${channel.resolved_by_name}`
                      : undefined
                  }
                >
                  <Check className="w-2.5 h-2.5" />
                  {language === 'ru' ? 'Решено' : 'Hal qilingan'}
                </span>
              )}
            </div>
            {resolvedSubtitle && (
              <p className={`text-[12px] truncate leading-tight mt-0.5 ${subtitleTone}`}>
                {resolvedSubtitle}
              </p>
            )}
            {/* v120 commit 2 — Assigned-to row. Renders for staff only
                (channel.assigned_to is server-side nulled for residents).
                Tappable when an onAssignClick handler is wired so the
                operator can reassign without going through the info
                menu. */}
            {isStaff && channel?.assigned_to_name && (
              <button
                type="button"
                onClick={onAssignClick}
                disabled={!onAssignClick}
                className="mt-0.5 inline-flex items-center gap-1 max-w-full text-left text-[12px] text-gray-500 truncate leading-tight hover:text-gray-700 touch-manipulation disabled:cursor-default"
                aria-label={language === 'ru' ? 'Переназначить сотрудника' : 'Xodimni qayta tayinlash'}
              >
                <UserCheck className="w-3 h-3 flex-shrink-0 text-orange-500" />
                <span className="truncate">
                  {language === 'ru' ? 'Назначен' : 'Tayinlangan'}: {channel.assigned_to_name}
                  {channel.assigned_to_role && (
                    <> · {(language === 'ru' ? ROLE_LABEL_RU : ROLE_LABEL_UZ)[channel.assigned_to_role] || channel.assigned_to_role}</>
                  )}
                </span>
              </button>
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
            // Phase 2 / commit 3: replaces the v2-pre inline info
            // dropdown with the full InfoDropdown overlay component
            // (resident profile + tap-to-call phone + linked requests +
            // action row). Renders as a popover anchored to the header
            // — the absolute-positioned backdrop closes it on outside
            // click. Channel fields are read defensively so missing
            // backend data degrades to a smaller card instead of
            // erroring.
            <InfoDropdown
              channel={channel}
              language={language}
              onAssignClick={onAssignClick}
              onResolveClick={onResolveClick}
              onClose={onCloseInfo}
            />
          )}
        </div>
      </div>
    </div>
  );
}
