import { memo, type ReactNode } from 'react';
import { Check, CheckCheck, Loader2, AlertCircle } from 'lucide-react';
import { MessageContent } from '../../components/common';
import { formatName } from '../../utils/formatName';
import type { UserRole } from '../../types';
import { getAvatarColor, getInitials } from './chatUtils';

// Sprint B (chat redesign): TG/WhatsApp-style message bubble.
// - Avatar only on the first message of an author's block; siblings indent
//   via `pl-12` instead of using an invisible spacer.
// - Block spacing widened (mt-3 / mt-0.5) so message groups breathe.
// - Bubble corner ear (rounded-br-[6px] / rounded-bl-[6px]) only on the
//   first message of a block; siblings keep full rounding for a stacked
//   feel.
// - Timestamp 11px (was 10px), tick 14×14 (was 12×12), better-contrast
//   white instead of white/75 inside own bubbles.

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
  isOwn: boolean;
  showSender: boolean;
  isCurrentMatch: boolean;
  isSearchMatch: boolean;
  isResident: boolean;
  isPrivateSupport: boolean;
  language: 'ru' | 'uz';
  formatTime: (dateStr: string, lang: string) => string;
  renderRoleBadge: (role: UserRole) => ReactNode;
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
  const isReadByOther =
    isResident && isPrivateSupport
      ? Boolean(message.management_read)
      : Boolean(message.read_by && message.read_by.length > 0);

  // Bubble shape: only the first message of an author's block gets the
  // tail-corner ear. Subsequent messages keep all four corners rounded
  // for that stacked-IM look.
  const ownShape = isOwn
    ? `rounded-[18px] ${showSender ? 'rounded-br-[6px]' : ''}`
    : '';
  const otherShape = !isOwn
    ? `rounded-[18px] ${showSender ? 'rounded-bl-[6px]' : ''}`
    : '';

  return (
    <div
      className={`flex items-end gap-2 px-1 ${isOwn ? 'justify-end' : 'justify-start'} ${
        showSender ? 'mt-3' : 'mt-0.5'
      }`}
    >
      {/* Avatar — only on the first message of an author's block.
          Sibling messages indent via pl-12 below so bubbles stay aligned
          without an invisible spacer in the DOM. */}
      {!isOwn && showSender && (
        <div
          className={`w-[34px] h-[34px] rounded-full flex-shrink-0 flex items-center justify-center text-white text-[12px] font-semibold bg-gradient-to-br ${getAvatarColor(
            message.sender_name,
          )} shadow-sm`}
        >
          {getInitials(message.sender_name)}
        </div>
      )}
      {!isOwn && !showSender && <div className="w-[34px] flex-shrink-0" aria-hidden />}

      <div
        className={`max-w-[78%] min-w-0 flex flex-col ${isOwn ? 'items-end' : 'items-start'} ${
          isCurrentMatch
            ? 'ring-2 ring-orange-400 rounded-[20px]'
            : isSearchMatch
            ? 'ring-1 ring-orange-200 rounded-[20px]'
            : ''
        }`}
        style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
      >
        {showSender && !isOwn && (
          <div className="flex items-center gap-1.5 mb-1 px-1">
            <span
              className="text-[12px] font-semibold"
              style={{ color: 'var(--chat-bubble-in-text, #374151)' }}
            >
              {formatName(message.sender_name)}
            </span>
            {renderRoleBadge(message.sender_role)}
          </div>
        )}

        <div
          className={`px-3.5 py-2 ${
            isOwn
              ? `text-white ${ownShape} shadow-[0_3px_12px_rgba(232,98,26,0.18)]`
              : `${otherShape} shadow-[0_2px_8px_rgba(0,0,0,0.04)]`
          } ${message.status === 'sending' ? 'opacity-60' : ''}`}
          style={
            isOwn
              ? { background: 'linear-gradient(135deg, #E8621A 0%, #F59E0B 100%)' }
              : {
                  background: 'var(--chat-bubble-in-bg, #FFFFFF)',
                  color: 'var(--chat-bubble-in-text, #1C1917)',
                  border: '1px solid var(--chat-bubble-in-border, rgba(0,0,0,0.04))',
                }
          }
        >
          <MessageContent content={message.content} isOwn={isOwn} language={language} />
          <div
            className={`flex items-center justify-end gap-1 mt-1 ${isOwn ? 'text-white/85' : ''}`}
            style={isOwn ? undefined : { color: 'var(--chat-timestamp, #6B7280)' }}
          >
            <span className="text-[11px] font-medium">{formatTime(message.created_at, language)}</span>
            {isOwn && message.status === 'sending' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isOwn && message.status !== 'sending' && message.status !== 'failed' && (
              isReadByOther ? <CheckCheck className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />
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
