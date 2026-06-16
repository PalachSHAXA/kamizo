// Sprint 15: extracted from ChatPage.tsx. The right-side pane that
// renders the actual conversation: header, message list, sticky
// composer, in-conversation search overlay, info dropdown. All of
// the chat's interactive state (newMessage, attachedFile, search,
// keyboard offset, messages) lives here — ChatPage now only owns
// channel selection / list rendering.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { EmptyState } from '../../components/common';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { formatName } from '../../utils/formatName';
import { plural } from '../../utils/plural';
import { useAuthStore } from '../../stores/authStore';
import { useLanguageStore } from '../../stores/languageStore';
import { useToastStore } from '../../stores/toastStore';
import { chatApi } from '../../services/api';
import { subscribeToChatMessages } from '../../hooks/useWebSocketSync';
import { CHAT_CHANNEL_LABELS, type UserRole } from '../../types';
import { ChatComposer } from './ChatComposer';
import { QuickReplies } from './QuickReplies';
import { MessageList } from './MessageList';
import { DialogHeader } from './DialogHeader';
import { ActiveRequestBanner, type ActiveRequest } from './ActiveRequestBanner';
import { AssignStaffModal } from './AssignStaffModal';
import { type ChatChannel, type ChatMessage } from './chatUtils';

export function ChatView({
  channelId,
  channel,
  onBack,
  hideBackOnDesktop = false,
  onMarkRead,
  onChannelUpdated,
}: {
  channelId: string;
  channel?: ChatChannel;
  onBack: () => void;
  hideBackOnDesktop?: boolean;
  onMarkRead?: () => void;
  // v120 commit 2 — bubble channel-mutating PATCH responses up to
  // ChatPage so it can replace the row in its local channels[] state
  // and the list view (Решено pill) re-renders without a full refetch.
  onChannelUpdated?: (updated: ChatChannel) => void;
}) {
  const { user } = useAuthStore();
  const { language } = useLanguageStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  // sendingRef synchronously locks the send path so a rapid double-tap can't
  // produce two API calls before React re-renders setIsSending(true). The
  // boolean state still drives the UI spinner; the ref is purely a guard.
  const sendingRef = useRef(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [attachedFile, setAttachedFile] = useState<{ name: string; size: number; dataUrl?: string; isImage: boolean } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // v120 commit 2 — admin action state. ChatView owns the modal +
  // confirm dialog so both the "Назначен:" line in DialogHeader and
  // the InfoDropdown row open the same assign modal without
  // prop-drilling. Confirm for resolve/unresolve is one ConfirmDialog
  // whose label and PATCH target flip on channel.resolved_at.
  // (isStaff / isResident are derived from `user` further down — we
  // gate handlers on the same boolean.)
  const addToast = useToastStore((s) => s.addToast);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showResolveConfirm, setShowResolveConfirm] = useState(false);
  const [isResolveBusy, setIsResolveBusy] = useState(false);

  const handleAssignClick = useCallback(() => {
    setShowAssignModal(true);
  }, []);

  const handleResolveClick = useCallback(() => {
    setShowResolveConfirm(true);
  }, []);

  const handleResolveConfirm = useCallback(async () => {
    if (!channel || isResolveBusy) return;
    setIsResolveBusy(true);
    try {
      const updated = channel.resolved_at
        ? ((await chatApi.unresolveChannel(channel.id)) as unknown as ChatChannel)
        : ((await chatApi.resolveChannel(channel.id)) as unknown as ChatChannel);
      onChannelUpdated?.(updated);
      addToast(
        'success',
        channel.resolved_at
          ? language === 'ru'
            ? 'Отметка снята'
            : 'Belgi olib tashlandi'
          : language === 'ru'
          ? 'Обращение помечено решённым'
          : 'Murojaat hal qilingan deb belgilandi',
      );
      setShowResolveConfirm(false);
    } catch (e) {
      addToast(
        'error',
        language === 'ru' ? 'Не удалось пометить, попробуйте позже' : "Belgilab bo'lmadi, keyinroq urinib ko'ring",
      );
    } finally {
      setIsResolveBusy(false);
    }
  }, [channel, isResolveBusy, addToast, language, onChannelUpdated]);

  const handleAssignedFromModal = useCallback(
    (updated: ChatChannel) => {
      onChannelUpdated?.(updated);
    },
    [onChannelUpdated],
  );

  // Resident-side quick replies — the 3 most common openings. Shown only
  // when message input is empty so they don't overlap typing.
  const RESIDENT_QUICK_REPLIES = language === 'ru'
    ? ['Вызвать мастера', 'Статус заявки', 'Показания счётчиков']
    : ['Usta chaqirish', 'Ariza holati', 'Hisoblagichlar'];

  // Human-readable file size for attachment chip.
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleFilePick = (file: File) => {
    const isImage = file.type.startsWith('image/');
    // Cap inline images at 800 KB — anything bigger would bloat the message
    // payload. Larger files arrive as a filename reference only until proper
    // object storage is wired up.
    const INLINE_IMAGE_LIMIT = 800 * 1024;
    if (isImage && file.size <= INLINE_IMAGE_LIMIT) {
      const reader = new FileReader();
      reader.onload = () => {
        setAttachedFile({ name: file.name, size: file.size, dataUrl: String(reader.result), isImage: true });
      };
      reader.readAsDataURL(file);
    } else {
      setAttachedFile({ name: file.name, size: file.size, isImage });
    }
  };

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

  const insertEmoji = (emoji: string) => {
    setNewMessage(prev => prev + emoji);
    setShowEmojiPicker(false);
  };

  const isStaff = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'super_admin' || user?.role === 'director' || user?.role === 'department_head';
  const isResident = user?.role === 'resident' || user?.role === 'tenant' || user?.role === 'commercial_owner';
  // While `channel` is still loading the resident UI used to flash a generic
  // non-support layout for ~1 frame (wrong avatar, wrong subtitle). For
  // residents the only channel they ever see IS private_support, so treat
  // unknown channel as private_support for them — eliminates the flicker.
  // Staff wait for the real type because they have multiple channel types.
  const channelLoaded = !!channel;
  const isPrivateSupport = channelLoaded
    ? channel.type === 'private_support'
    : isResident;

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

    const unsubscribe = subscribeToChatMessages((message: ChatMessage & { type?: string; message_id?: string; user_id?: string; user_role?: string }) => {
      if (message.channel_id === channelId) {
        if (message.type === 'read') {
          // Sprint 11: hide colleague IDs from read_by entirely; only
          // non-management readers (residents) get added by ID. For a
          // management reader, flip the aggregated management_read flag
          // so the resident's checkmark goes ✓✓ without leaking which
          // specific manager opened it.
          const readerRole = message.user_role || '';
          const isMgmtReader = ['admin', 'director', 'manager', 'department_head', 'super_admin'].includes(readerRole);
          setMessages(prev => prev.map(m => {
            if (m.id !== message.message_id) return m;
            if (isMgmtReader) {
              return { ...m, management_read: true };
            }
            return { ...m, read_by: [...(m.read_by || []), message.user_id ?? ''] };
          }));
          return;
        }
        setMessages(prev => {
          const exists = prev.some(m => m.id === message.id);
          if (exists) return prev;
          return [...prev, message as ChatMessage];
        });
        markAsRead();
      }
    });

    return () => { unsubscribe(); };
  }, [fetchMessages, channelId, markAsRead]);

  // Polling fallback while WebSocket is disabled.
  // Audit P0: was 10s — that's 6 req/min × N online residents → significant
  // D1 load (600 req/min @ 100 online users). 30s halves the cost while
  // keeping perceived "live chat" feel. markAsRead is only re-issued when
  // the tab is visible to avoid sync churn for background tabs.
  useEffect(() => {
    if (!channelId || channelId === 'undefined') return;
    const POLL_MS = 30000;
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchMessages();
      markAsRead();
    };
    const interval = setInterval(tick, POLL_MS);
    return () => clearInterval(interval);
  }, [fetchMessages, channelId, markAsRead]);

  // Scroll to bottom
  useEffect(() => {
    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
    return () => clearTimeout(timer);
  }, [messages.length]);

  // Search logic — Sprint 58: debounce 150ms.
  // Was firing a full scan on every keystroke (500 messages × lowercase
  // + includes = noticeable lag in long channels). Now waits for the
  // user to stop typing before scanning.
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      const q = searchQuery.toLowerCase();
      const indices = messages
        .map((m, i) => m.content.toLowerCase().includes(q) ? i : -1)
        .filter(i => i !== -1);
      setSearchResults(indices);
      setCurrentSearchIndex(0);
    }, 150);
    return () => clearTimeout(timer);
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
    const textPart = newMessage.trim();
    const hasAttachment = !!attachedFile;
    if (!textPart && !hasAttachment) return;
    if (!user || isSending) return;
    if (sendingRef.current) return; // synchronous guard against double-tap
    sendingRef.current = true;

    // Build the outgoing payload. Inline images get embedded as a data-URL
    // inside the message content so they render inline via MessageContent
    // without needing a separate uploads endpoint. Non-image files surface
    // as a "[📎 filename (size)]" reference so the recipient at least
    // sees what was meant to be shared.
    let messageToSend = textPart;
    if (hasAttachment) {
      if (attachedFile!.isImage && attachedFile!.dataUrl) {
        messageToSend = textPart
          ? `${textPart}\n\n![${attachedFile!.name}](${attachedFile!.dataUrl})`
          : `![${attachedFile!.name}](${attachedFile!.dataUrl})`;
      } else {
        const ref = `[📎 ${attachedFile!.name} · ${formatFileSize(attachedFile!.size)}]`;
        messageToSend = textPart ? `${textPart}\n${ref}` : ref;
      }
    }

    setNewMessage('');
    setAttachedFile(null);
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
      sendingRef.current = false;
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

  return (
    <div
      ref={chatContainerRef}
      // v114: added `min-w-0 min-h-0` so this column flex container can
      // actually shrink to fit its parent. Combined with the matching
      // additions on ChatPage.tsx's two-pane wrapper, this stops the chat
      // from inflating to its own content's intrinsic size — DialogHeader
      // stays sticky at top, Composer stays sticky at bottom, and
      // MessageList scrolls inside the bounded middle band as designed.
      className="h-full flex flex-col bg-[#FEFAF6] min-w-0 min-h-0"
      style={keyboardOffset > 0 ? { height: `calc(100% - ${keyboardOffset}px)` } : undefined}
    >
      {/* Phase 2 / commit 2: extracted to DialogHeader. Same markup
          (back arrow + avatar + name + subtitle + search/info buttons +
          inline info dropdown) — see DialogHeader.tsx. */}
      <DialogHeader
        channel={channel}
        language={language === 'ru' ? 'ru' : 'uz'}
        isResident={isResident}
        isPrivateSupport={isPrivateSupport}
        isStaff={isStaff}
        messagesCount={messages.length}
        hideBackOnDesktop={hideBackOnDesktop}
        showSearch={showSearch}
        showInfo={showInfo}
        onBack={onBack}
        onToggleSearch={() => { setShowSearch(s => !s); setShowInfo(false); }}
        onToggleInfo={() => { setShowInfo(s => !s); setShowSearch(false); setShowEmojiPicker(false); }}
        onCloseInfo={() => setShowInfo(false)}
        // v120 commit 2 — staff-only action handlers. Undefined for
        // residents → InfoDropdown disables the rows and the
        // assigned-to line in the header collapses to non-tappable text.
        onAssignClick={isStaff ? handleAssignClick : undefined}
        onResolveClick={isStaff ? handleResolveClick : undefined}
        getTitle={getTitle}
        getSubtitle={getSubtitle}
      />

      {/* Phase 2 / commit 2: ActiveRequestBanner — inline strip under the
          header when the channel has a linked active request (per chat-
          spec.md §3.1 active_request_id). Currently no API row populates
          the field, so the banner stays hidden in production; the
          component is forward-compat — when the backend lands, the
          banner activates automatically. Cast the channel to read the
          optional field defensively. */}
      <ActiveRequestBanner
        request={
          (channel as ChatChannel & { active_request?: ActiveRequest })?.active_request ?? null
        }
        language={language === 'ru' ? 'ru' : 'uz'}
      />

      {/* ── Search Bar ── */}
      {showSearch && (
        <div className="bg-white border-b px-4 py-2 flex items-center gap-2">
          <div className="flex-1 relative flex items-center">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="search"
              inputMode="search"
              autoComplete="off"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={language === 'ru' ? 'Поиск по сообщениям...' : 'Xabarlardan qidirish...'}
              // Sprint 1: explicit 16px to dodge iOS zoom on iPad portrait
              // (global rule only covers ≤640px). Focus ring opacity /30
              // was nearly invisible on the gray-50 input bg; /60 is the
              // minimum that reads as "focused" on a real device.
              style={{ fontSize: '16px' }}
              className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-[10px] focus:outline-none focus:ring-2 focus:ring-orange-500/60 focus:border-orange-400 transition-all"
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

      {/* v116: Staff QuickReplies (formerly rendered ABOVE MessageList,
            directly under DialogHeader) moved to immediately above the
            Composer — see the new render position after MessageList.
            That position matches the Anthropic design pack "Открытый
            диалог" mockup, the resident chat's own quick-reply strip,
            and the WhatsApp/Telegram pattern: pills sit on the composer
            surface, not under the header where they'd compete with the
            resident-context strip. The flex chain is unchanged
            (`shrink-0` on header + QuickReplies + composer, `flex-1
            min-h-0` on MessageList) so this is a pure render-order
            change. The TemplatesPicker popover anchored `top-full`
            against the strip in v114 (so it opens below) still works
            — opens between the strip and the composer. */}

      {/* ── Messages ──
            Phase 2 / commit 1: extracted to MessageList. Refs stay on
            ChatView so the existing scroll-to-bottom + scroll-to-search-
            match useEffects keep working unchanged. The component renders
            loading / empty / map+DateSeparator+MessageBubble paths byte-
            for-byte from the previous inline version. */}
      <MessageList
        messages={messages}
        isLoading={isLoading}
        currentUserId={user?.id}
        isResident={isResident}
        isPrivateSupport={isPrivateSupport}
        language={language === 'ru' ? 'ru' : 'uz'}
        searchResults={searchResults}
        currentSearchIndex={currentSearchIndex}
        onRetry={retrySend}
        containerRef={messagesContainerRef}
        endRef={messagesEndRef}
      />

      {/* ── Resident quick replies — shown only when the composer is empty so
            they don't fight with ongoing typing. Hidden for staff (who have
            their own preset responses via QuickReplies above).
            Horizontally scrollable so on narrow phones the third option
            isn't visually clipped — user can drag-scroll to reveal it. ── */}
      {isResident && isPrivateSupport && !newMessage.trim() && !attachedFile && !isLoading && (
        <div
          className="flex gap-2 px-3 py-2 overflow-x-auto overflow-y-hidden border-t border-black/[0.03] bg-white scrollbar-none flex-shrink-0"
          style={{ scrollbarWidth: 'none' }}
          aria-label={language === 'ru' ? 'Быстрые ответы' : 'Tez javoblar'}
        >
          {RESIDENT_QUICK_REPLIES.map((text, i) => (
            <button
              key={i}
              onClick={() => setNewMessage(text)}
              className="flex-shrink-0 px-3.5 py-1.5 rounded-[20px] text-[12px] font-semibold whitespace-nowrap transition-colors active:scale-95 touch-manipulation"
              style={{
                color: 'rgb(var(--brand-rgb))',
                background: 'rgba(var(--brand-rgb), 0.06)',
                border: '1px solid rgba(var(--brand-rgb), 0.22)',
              }}
            >
              {text}
            </button>
          ))}
          {/* Trailing spacer so the last chip clears the screen edge after
              the user scrolls — iOS rubber-band feels cleaner with this. */}
          <div className="w-2 flex-shrink-0" aria-hidden />
        </div>
      )}

      {/* ── Quick replies (staff in private support) ──
            v116: moved here from above MessageList. See the render-
            position comment block above. The pills sit on the composer
            surface, matching the design pack mockup + the
            resident-side quick-replies strip rendered above. */}
      {isStaff && isPrivateSupport && (
        <QuickReplies
          onSelect={(text) => setNewMessage(text)}
          language={language}
        />
      )}

      {/* Sticky composer — extracted to ChatComposer in Sprint 12. */}
      <ChatComposer
        language={language === 'ru' ? 'ru' : 'uz'}
        value={newMessage}
        onChange={setNewMessage}
        onSend={handleSend}
        isSending={isSending}
        isComposing={isComposing}
        onCompositionStart={() => setIsComposing(true)}
        onCompositionEnd={() => setIsComposing(false)}
        attachedFile={attachedFile}
        onRemoveAttachment={() => setAttachedFile(null)}
        showEmojiPicker={showEmojiPicker}
        onToggleEmoji={() => setShowEmojiPicker((p) => !p)}
        onInsertEmoji={insertEmoji}
        fileInputRef={fileInputRef}
        onFilePick={handleFilePick}
        keyboardOffset={keyboardOffset}
      />

      {/* v120 commit 2 — admin action overlays.
          AssignStaffModal: bottom sheet on mobile / centered card on
          desktop. Renders only for staff (handlers undefined for
          residents so even a programmatic open would be a no-op).
          ConfirmDialog: single instance — title/body/button flip on
          channel.resolved_at so one render covers both resolve and
          unresolve. Primary tone (orange) matches the brand button. */}
      {channel && isStaff && (
        <AssignStaffModal
          channel={channel}
          isOpen={showAssignModal}
          onClose={() => setShowAssignModal(false)}
          onAssigned={handleAssignedFromModal}
        />
      )}
      <ConfirmDialog
        isOpen={showResolveConfirm}
        title={
          channel?.resolved_at
            ? language === 'ru'
              ? 'Вернуть обращение в активные?'
              : 'Murojaatni faolga qaytarish?'
            : language === 'ru'
            ? 'Пометить обращение решённым?'
            : 'Murojaatni hal qilingan deb belgilash?'
        }
        description={
          channel?.resolved_at
            ? language === 'ru'
              ? 'Отметка «Решено» снимется, обращение снова станет активным.'
              : "«Hal qilingan» belgisi olib tashlanadi, murojaat yana faol bo'ladi."
            : language === 'ru'
            ? 'Диалог останется в списке с пометкой «Решено». Это действие можно отменить.'
            : "Suhbat ro'yxatda «Hal qilingan» belgisi bilan qoladi. Bu amalni qaytarish mumkin."
        }
        confirmLabel={
          channel?.resolved_at
            ? language === 'ru'
              ? 'Вернуть в активные'
              : 'Faolga qaytarish'
            : language === 'ru'
            ? 'Пометить решённым'
            : 'Hal qilingan deb belgilash'
        }
        cancelLabel={language === 'ru' ? 'Отмена' : 'Bekor qilish'}
        tone="primary"
        icon={<Check className="w-6 h-6" />}
        confirmDisabled={isResolveBusy}
        onConfirm={handleResolveConfirm}
        onClose={() => {
          if (!isResolveBusy) setShowResolveConfirm(false);
        }}
      />
    </div>
  );
}
