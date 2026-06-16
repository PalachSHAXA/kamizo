// Phase 2 / commit 1 — NEW component. Centered system-event chip for
// chat messages where sender_role (or future content_type) is 'system'.
// Examples per chat-spec.md §3.2: "заявка создана", "статус изменён",
// "исполнитель назначен", "заявка закрыта".
//
// Currently the API does not produce system messages — this component
// is forward-compat surface so when the backend lands the DB column
// content_type='system' (or sender_role='system'), MessageList already
// knows how to render them without another refactor.
//
// Visual matches the v2 design's SystemChip (kamizo-admin-chat.jsx
// L49-71): centered pill, brand-tinted bg by default, gray-tinted +
// gray-icon for `closed` state, optional chevron when clickable so the
// chip reads as a tap target into the linked request.

import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

interface SystemChipProps {
  /** Pill text — usually a short event label (e.g. "Заявка #UK-S-1001 · Принята") */
  text: string;
  /** Optional leading icon (lucide-react element, 13–14px) */
  icon?: ReactNode;
  /** Closed/inactive state — switches to neutral gray surface */
  closed?: boolean;
  /** Click target (e.g. navigate to linked request). When set, renders chevron */
  onClick?: () => void;
}

export function SystemChip({ text, icon, closed = false, onClick }: SystemChipProps) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <div className="flex items-center justify-center my-2">
      <Tag
        type={onClick ? 'button' : undefined}
        onClick={onClick}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-opacity ${
          closed
            ? 'bg-gray-100 text-gray-500 border border-gray-200'
            : 'bg-orange-50 text-orange-700 border border-orange-200'
        } ${onClick ? 'cursor-pointer hover:opacity-90 active:opacity-80 touch-manipulation' : ''}`}
      >
        {icon && <span className="grid place-items-center">{icon}</span>}
        <span>{text}</span>
        {onClick && <ChevronRight className="w-3.5 h-3.5 opacity-60" />}
      </Tag>
    </div>
  );
}
