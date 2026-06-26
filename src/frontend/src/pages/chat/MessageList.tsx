// Phase 2 / commit 1 — extracted from ChatView.tsx. Renders the chat
// message timeline: loading spinner, empty-state, or the message-by-
// message map with date separators and (forward-compat) system chips.
//
// This is a PURE refactor. The map block, the loading branch, the
// empty-state branch, the date-key memoisation, the per-message search
// match calculation, and the `messagesEndRef` sentinel at the bottom
// are all moved here byte-for-byte from the inline ChatView block. No
// behavioural change, no visual change, no token change.
//
// Refs (containerRef, endRef) are still owned by ChatView so the
// existing scroll-to-bottom + scroll-to-search-match useEffects keep
// working without forwardRef machinery — they're passed as props and
// attached here at the right DOM nodes.

import type { RefObject } from 'react';
import { Loader2, MessageCircle } from 'lucide-react';
import { ScrollArea } from '../../components/common/ScrollArea';
import { MessageBubble } from './MessageBubble';
import { DateSeparator } from './DateSeparator';
import { SystemChip } from './SystemChip';
import { RoleBadge } from './RoleBadge';
import { type ChatMessage, formatMessageTime } from './chatUtils';

export function MessageList({
  messages,
  isLoading,
  currentUserId,
  isResident,
  isPrivateSupport,
  language,
  searchResults,
  currentSearchIndex,
  onRetry,
  containerRef,
  endRef,
}: {
  messages: ChatMessage[];
  isLoading: boolean;
  currentUserId?: string;
  isResident: boolean;
  isPrivateSupport: boolean;
  language: 'ru' | 'uz';
  searchResults: number[];
  currentSearchIndex: number;
  onRetry: (msg: ChatMessage) => void;
  containerRef: RefObject<HTMLDivElement>;
  endRef: RefObject<HTMLDivElement>;
}) {
  // Per-day grouping key — y-m-d in local time, identical to the
  // previous inline version in ChatView.tsx.
  const getDateKey = (dateStr: string) => {
    const d = new Date(dateStr.endsWith?.('Z') ? dateStr : dateStr + 'Z');
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  };

  return (
    // v118.111 — migrated from hand-rolled `flex-1 min-h-0 overflow-y-
    // auto` + `overscrollBehaviorY:contain` (no momentum hint) to the
    // shared <ScrollArea> which enforces the verified iOS-safe combo
    // (overflow-y:auto + -webkit-overflow-scrolling:touch + overscroll-
    // behavior:contain + min-height:0). Same scroll-stick-at-bottom
    // protection as the v254 resident-chat fix, in a single shared
    // implementation.
    <ScrollArea
      ref={containerRef}
      className="px-3 py-3"
      role="log"
      ariaLabel={language === 'ru' ? 'Сообщения чата' : 'Chat xabarlari'}
      ariaLive="polite"
      style={{
        background: 'var(--chat-page-gradient, linear-gradient(180deg, #FEFAF6 0%, #F5F0EA 100%))',
      }}
    >
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
        <div className="space-y-0.5">
          {messages.map((message, index) => {
            const isOwn = message.sender_id === currentUserId;
            const prevMsg = index > 0 ? messages[index - 1] : null;
            const sameAuthorAsPrev = prevMsg && prevMsg.sender_id === message.sender_id;
            const showSender = !isOwn && !sameAuthorAsPrev;
            const showDateSeparator =
              !prevMsg || getDateKey(prevMsg.created_at) !== getDateKey(message.created_at);

            // Forward-compat system-event branch (see SystemChip.tsx for the
            // backend contract). Cast through `string` because UserRole's
            // union doesn't currently include 'system' — when the chat-spec
            // §3.2 column lands, add 'system' to UserRole and drop the cast.
            const isSystem = (message.sender_role as string) === 'system';

            const isSearchMatch = searchResults.includes(index);
            const isCurrentMatch = searchResults[currentSearchIndex] === index;

            return (
              <div key={message.id} id={`msg-${index}`}>
                {showDateSeparator && (
                  <DateSeparator dateStr={message.created_at} language={language} />
                )}

                {isSystem ? (
                  <SystemChip text={message.content} />
                ) : (
                  <MessageBubble
                    message={message}
                    isOwn={isOwn}
                    showSender={showSender}
                    isCurrentMatch={isCurrentMatch}
                    isSearchMatch={isSearchMatch}
                    isResident={isResident}
                    isPrivateSupport={isPrivateSupport}
                    language={language}
                    formatTime={formatMessageTime}
                    renderRoleBadge={(role) => <RoleBadge role={role} language={language} />}
                    onRetry={onRetry}
                  />
                )}
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      )}
    </ScrollArea>
  );
}
