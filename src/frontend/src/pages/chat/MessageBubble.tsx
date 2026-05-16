import { memo, type ReactNode } from 'react';
import { Check, CheckCheck, Loader2, AlertCircle } from 'lucide-react';
import { MessageContent } from '../../components/common';
import { formatName } from '../../utils/formatName';
import type { UserRole } from '../../types';

// Sprint 11: extracted from ChatPage.tsx to bring it under the
// 1500-LOC architect threshold. Renders one message row — bubble +
// avatar + sender header + read-receipt tick. Memoised because it's
// rendered inside a long list and re-rendering the entire list when
// only one message changes was wasteful.

export interface ChatMessageView {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_role: UserRole;
  content: string;
  created_at: string;
  read_by?: string[];
  management_read?: boolean;
  status?: 'sending' | 'sent' | 'failed';
}

interface MessageBubbleProps {
  message: ChatMessageView;
  /** True when the message was sent by the currently logged-in user. */
  isOwn: boolean;
  /** True for the first message in a contiguous block by the same author. */
  showSender: boolean;
  /** True when this message is the active search hit (orange ring). */
  isCurrentMatch: boolean;
  /** True when this message matches the current search (light orange ring). */
  isSearchMatch: boolean;
  /** Current viewer is a resident-shaped role. */
  isResident: boolean;
  /** Current channel is the resident ↔ support private channel. */
  isPrivateSupport: boolean;
  /** UI language code resolved by the parent. */
  language: 'ru' | 'uz';
  /** Time formatter — parent owns locale logic. */
  formatTime: (dateStr: string, lang: string) => string;
  /** Inline role badge — kept on the parent because it imports a big
   *  config table; passed in as a render-prop to avoid duplicating it. */
  renderRoleBadge: (role: UserRole) => ReactNode;
  /** Retry handler for a `status: 'failed'` send. */
  onRetry: (message: ChatMessageView) => void;
}

function MessageBubbleImpl({
  message,
  isOwn,
  showSender,
  isCurrentMatch,
  isSearchMatch,
  isResident,
  isPrivateSupport,
  language,
  formatTime,
  renderRoleBadge,
  onRetry,
}: MessageBubbleProps) {
  // Sprint 11: resident messages in private_support never receive
  // colleague read IDs (privacy fix in Sprint 11 of the prior series).
  // Use the aggregated management_read flag for the double-tick in
  // that one case; everywhere else read_by.length > 0 is correct.
  const isReadByOther =
    isResident && isPrivateSupport
      ? Boolean(message.management_read)
      : Boolean(message.read_by && message.read_by.length > 0);

  return (
    <div
      className={`flex items-end gap-2 px-1 ${isOwn ? 'justify-end' : 'justify-start'} ${
        showSender ? 'mt-2.5' : 'mt-0.5'
      }`}
    >
      {/* Admin side avatar — first message of an author's block only.
          Kept invisible (visibility: hidden) on subsequent messages so
          bubbles stay aligned. */}
      {!isOwn && (
        <div
          className="w-[30px] h-[30px] rounded-[10px] flex-shrink-0 flex items-center justify-center text-white text-[10px] font-bold bg-gradient-to-br from-[#E8621A] to-[#F59E0B]"
          style={{ visibility: showSender ? 'visible' : 'hidden' }}
        >
          УК
        </div>
      )}

      <div
        className={`max-w-[75%] min-w-0 flex flex-col ${isOwn ? 'items-end' : 'items-start'} ${
          isCurrentMatch
            ? 'ring-2 ring-orange-400 rounded-[20px]'
            : isSearchMatch
            ? 'ring-1 ring-orange-200 rounded-[20px]'
            : ''
        }`}
        style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
      >
        {showSender && (
          <div className="flex items-center gap-1.5 mb-1 px-1">
            <span className="text-[11px] font-semibold text-gray-600">{formatName(message.sender_name)}</span>
            {renderRoleBadge(message.sender_role)}
          </div>
        )}

        <div
          className={`px-3.5 py-2 ${
            isOwn
              ? 'text-white rounded-[18px] rounded-br-[6px] shadow-[0_3px_12px_rgba(232,98,26,0.18)]'
              : 'bg-white text-gray-900 rounded-[18px] rounded-bl-[6px] shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-black/[0.04]'
          } ${message.status === 'sending' ? 'opacity-60' : ''}`}
          style={isOwn ? { background: 'linear-gradient(135deg, #E8621A 0%, #F59E0B 100%)' } : undefined}
        >
          <MessageContent content={message.content} isOwn={isOwn} language={language} />
          <div className={`flex items-center justify-end gap-1 mt-1 ${isOwn ? 'text-white/75' : 'text-gray-400'}`}>
            <span className="text-[10px] font-medium">{formatTime(message.created_at, language)}</span>
            {isOwn && message.status === 'sending' && <Loader2 className="w-3 h-3 animate-spin" />}
            {isOwn && message.status !== 'sending' && message.status !== 'failed' && (
              isReadByOther ? <CheckCheck className="w-3 h-3" /> : <Check className="w-3 h-3" />
            )}
          </div>
        </div>
        {message.status === 'failed' && (
          <button
            onClick={() => onRetry(message)}
            className="text-red-500 text-[11px] flex items-center gap-1 mt-1 px-1"
          >
            <AlertCircle className="w-3 h-3" />{' '}
            {language === 'ru' ? 'Не отправлено. Повторить?' : 'Yuborilmadi. Qayta yuborishmi?'}
          </button>
        )}
      </div>
    </div>
  );
}

export const MessageBubble = memo(MessageBubbleImpl);
