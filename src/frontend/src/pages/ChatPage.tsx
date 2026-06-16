import { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2, AlertCircle, MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';
import { useModalPresence } from '../stores/modalStore';
import { useIsMobile } from '../hooks/useBreakpoint';
import { chatApi } from '../services/api';
import { AdminChannelList } from './chat/AdminChannelList';
import { ChatView } from './chat/ChatView';
import { ResidentChatView } from './chat/ResidentChatView';
import { type ChatChannel } from './chat/chatUtils';
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
  const isMobile = useIsMobile();

  // Hide the floating BottomBar when a manager/director/dispatcher (admin
  // role) has a conversation OPEN on a MOBILE viewport. Mirror of the
  // hide-on-/chat rule the BottomBar already enforces for direct-chat
  // roles (resident/tenant/commercial_owner): the chat dialog owns its
  // own composer that pins to the bottom, and the floating tab pill
  // overlaps it. On the list view the bar stays visible (admins navigate
  // between conversations); on desktop the bar stays visible too (the
  // two-pane master-detail layout has horizontal space for both).
  //
  // Implementation uses the existing useModalPresence pattern (push +1
  // to modalStore.count, pop on cleanup) — BottomBar already hides
  // while count>0, so no new conditional is needed in BottomBar itself.
  useModalPresence(!isResident && isMobile && !!selectedChannelId);

  const fetchChannels = useCallback(async () => {
    try {
      setError(null);
      if (isResident) {
        const channel = await chatApi.getOrCreateSupportChannel();
        if (channel && channel.id) {
          setResidentChannel(channel as unknown as ChatChannel);
        } else {
          setError(language === 'ru' ? 'Не удалось создать чат' : 'Chat yaratib bo\'lmadi');
        }
      } else {
        const response = await chatApi.getChannels();
        const newChannels = (response.channels || []) as unknown as ChatChannel[];
        // Preserve unread_count: 0 for the currently open channel (user is reading it)
        setChannels(() => {
          const merged = newChannels.map((ch: ChatChannel) => {
            // If this channel is currently open, always force unread to 0
            // (the user is actively reading it — markAsRead runs on polling)
            if (selectedChannelIdRef.current === ch.id) {
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
      // Resident view — Claude Design §10-chat handoff. Full-bleed kz-screen
      // so the sticky header + composer pin correctly; the global floating
      // BottomBar overlays the bottom and the composer reserves clearance.
      return (
        <ResidentChatView
          channel={residentChannel}
          onBack={() => navigate('/')}
        />
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
  // Height excludes the mobile header (top safe-area inside) AND the bottom
  // safe-area / bottom-bar so the message input is never clipped by the iOS
  // home-indicator on iPhone with notch. Without this last subtraction the
  // composer was hiding 34px below the screen.
  return (
    <div
      // v113: dropped the leading `-mx-4 -mt-4`. Previously the chat
      // wrapper bled into the host page's px-4/pt-4 padding, but the
      // useEffect above (and the .chat-active CSS rule) already zero
      // #main-content's padding when chat is open — so the negative
      // margin became a pure -16px shift that pushed the wrapper past
      // the LEFT viewport edge. Avatars and bubbles ended up flush
      // against (and on iPhone, clipped by) the screen. With the
      // wrapper now at margin 0 it naturally fills the zeroed parent
      // edge-to-edge, and MessageList's px-3 gutter is honored as
      // designed. Desktop is unchanged: md:rounded-[22px] +
      // md:shadow-sm + md:border still wrap the card, and the chat
      // sits inside the normal main-content padding above the md
      // breakpoint.
      className="bg-white md:rounded-[22px] md:shadow-sm md:border overflow-hidden"
      style={{
        height: 'calc(100dvh - var(--mobile-header-h, 68px) - env(safe-area-inset-bottom, 0px))',
        maxHeight: 'calc(100dvh - 68px - env(safe-area-inset-bottom, 0px))',
      }}
    >
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
            // Desktop empty state — matches the v2 admin chat design's
            // EmptyDesktop component: 76x76 brand-tinted tile (var
            // --surface) with brand-orange icon, 16px/800 headline,
            // 13px helper text capped at 280px width. Both copy lines
            // taken from kamizo-admin-dialog.jsx EmptyDesktop.
            <div className="h-full flex items-center justify-center bg-orange-50/30">
              <div className="text-center">
                <div
                  className="w-[76px] h-[76px] mx-auto mb-[18px] rounded-[22px] flex items-center justify-center bg-white shadow-md border"
                  style={{ color: 'var(--brand, #F97316)', borderColor: 'var(--border-c, rgba(28,25,23,0.08))' }}
                >
                  <MessageCircle className="w-[34px] h-[34px]" />
                </div>
                <p className="font-extrabold text-[16px] text-gray-700">
                  {language === 'ru' ? 'Выберите диалог из списка' : "Ro'yxatdan dialog tanlang"}
                </p>
                <p className="text-gray-400 text-[13px] mt-[6px] max-w-[280px] leading-[1.5] mx-auto px-4">
                  {language === 'ru'
                    ? 'Слева — обращения жителей. Непрочитанные подняты наверх.'
                    : "Chap tarafda — aholi murojatlari. O'qilmaganlari yuqorida."}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
