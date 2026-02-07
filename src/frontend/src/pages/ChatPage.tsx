import { useState, useRef, useEffect, useCallback } from 'react';
import {
  MessageCircle, Send, ArrowLeft, Users, Building2,
  HeadphonesIcon, Search, Check, CheckCheck,
  User, Crown, Shield, Wrench, Loader2, AlertCircle
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';
import { chatApi } from '../services/api';
import { subscribeToChatMessages } from '../hooks/useWebSocketSync';
import { CHAT_CHANNEL_LABELS, type ChatChannelType, type UserRole } from '../types';

// Types for API responses
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
}

// Role badge component
function RoleBadge({ role, language }: { role: UserRole; language: string }) {
  const roleConfig: Record<UserRole, { label: string; labelUz: string; color: string; icon: React.ReactNode }> = {
    super_admin: {
      label: 'Супер Админ',
      labelUz: 'Super Admin',
      color: 'bg-purple-100 text-purple-700',
      icon: <Shield className="w-3 h-3" />
    },
    admin: {
      label: 'Админ',
      labelUz: 'Admin',
      color: 'bg-red-100 text-red-700',
      icon: <Shield className="w-3 h-3" />
    },
    manager: {
      label: 'Менеджер',
      labelUz: 'Menejer',
      color: 'bg-purple-100 text-purple-700',
      icon: <Crown className="w-3 h-3" />
    },
    executor: {
      label: 'Исполнитель',
      labelUz: 'Ijrochi',
      color: 'bg-orange-100 text-orange-700',
      icon: <Wrench className="w-3 h-3" />
    },
    resident: {
      label: 'Житель',
      labelUz: 'Turar joy egasi',
      color: 'bg-blue-100 text-blue-700',
      icon: <User className="w-3 h-3" />
    },
    tenant: {
      label: 'Арендатор',
      labelUz: 'Ijarachi',
      color: 'bg-green-100 text-green-700',
      icon: <User className="w-3 h-3" />
    },
    commercial_owner: {
      label: 'Коммерция',
      labelUz: 'Tijorat',
      color: 'bg-yellow-100 text-yellow-700',
      icon: <Building2 className="w-3 h-3" />
    },
    department_head: {
      label: 'Глава отдела',
      labelUz: 'Bo\'lim boshlig\'i',
      color: 'bg-indigo-100 text-indigo-700',
      icon: <Crown className="w-3 h-3" />
    },
    director: {
      label: 'Директор',
      labelUz: 'Direktor',
      color: 'bg-rose-100 text-rose-700',
      icon: <Crown className="w-3 h-3" />
    },
    advertiser: {
      label: 'Рекламодатель',
      labelUz: 'Reklamaberuvchi',
      color: 'bg-pink-100 text-pink-700',
      icon: <User className="w-3 h-3" />
    },
    coupon_checker: {
      label: 'Чекер',
      labelUz: 'Tekshiruvchi',
      color: 'bg-teal-100 text-teal-700',
      icon: <User className="w-3 h-3" />
    },
    dispatcher: {
      label: 'Диспетчер',
      labelUz: 'Dispetcher',
      color: 'bg-cyan-100 text-cyan-700',
      icon: <User className="w-3 h-3" />
    },
    security: {
      label: 'Охранник',
      labelUz: 'Qo\'riqchi',
      color: 'bg-slate-100 text-slate-700',
      icon: <Shield className="w-3 h-3" />
    },
    marketplace_manager: {
      label: 'Менеджер магазина',
      labelUz: 'Do\'kon menejeri',
      color: 'bg-emerald-100 text-emerald-700',
      icon: <User className="w-3 h-3" />
    }
  };

  const config = roleConfig[role] || roleConfig.resident;

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${config.color}`}>
      {config.icon}
      {language === 'ru' ? config.label : config.labelUz}
    </span>
  );
}

// Channel list for admin/manager - shows private support chats from residents
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

  // Filter channels by search query
  const filteredChannels = channels.filter(ch => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      ch.name?.toLowerCase().includes(query) ||
      ch.description?.toLowerCase().includes(query) ||
      ch.last_message?.toLowerCase().includes(query)
    );
  });

  // Separate private support and group channels (from filtered)
  // Sort by unread count (unread first), then by last_message_at
  const sortByUnread = (a: ChatChannel, b: ChatChannel) => {
    // First, sort by unread count (channels with unread messages first)
    const aUnread = a.unread_count || 0;
    const bUnread = b.unread_count || 0;
    if (bUnread !== aUnread) return bUnread - aUnread;
    // Then by last message time
    const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    return bTime - aTime;
  };

  const privateSupportChannels = filteredChannels
    .filter(ch => ch.type === 'private_support')
    .sort(sortByUnread);
  const groupChannels = filteredChannels
    .filter(ch => ch.type === 'uk_general' || ch.type === 'building_general')
    .sort(sortByUnread);

  // Calculate total unread
  const totalUnread = channels.reduce((sum, ch) => sum + (ch.unread_count || 0), 0);

  const getChannelIcon = (type: ChatChannelType) => {
    switch (type) {
      case 'uk_general': return <Building2 className="w-5 h-5" />;
      case 'building_general': return <Users className="w-5 h-5" />;
      case 'private_support': return <User className="w-5 h-5" />;
      default: return <MessageCircle className="w-5 h-5" />;
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b bg-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">
              {language === 'ru' ? 'Сообщения' : 'Xabarlar'}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {language === 'ru' ? 'Чаты с жителями и группы' : 'Aholi bilan chatlar va guruhlar'}
            </p>
          </div>
          {totalUnread > 0 && (
            <div className="flex items-center gap-2 px-3 py-1 bg-red-100 text-red-600 rounded-full">
              <span className="text-sm font-medium">{totalUnread}</span>
              <span className="text-xs">{language === 'ru' ? 'новых' : 'yangi'}</span>
            </div>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={language === 'ru' ? 'Поиск по имени или сообщению...' : 'Ism yoki xabar bo\'yicha qidirish...'}
            className="w-full pl-9 pr-4 py-2 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <>
            {/* Private support chats section */}
            {privateSupportChannels.length > 0 && (
              <div>
                <div className="px-4 py-2 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {language === 'ru' ? 'Обращения жителей' : 'Aholi murojatları'} ({privateSupportChannels.length})
                </div>
                <div className="divide-y">
                  {privateSupportChannels.map((channel) => {
                    const isSelected = selectedChannelId === channel.id;

                    return (
                      <button
                        key={channel.id}
                        onClick={() => onSelectChannel(channel.id)}
                        className={`w-full p-4 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors ${
                          isSelected ? 'bg-primary-50' : ''
                        } ${channel.unread_count && channel.unread_count > 0 ? 'bg-blue-50/50' : ''}`}
                      >
                        <div className="relative">
                          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-medium text-lg">
                            {/* Show first letter of name, fallback to 'U' for User if name is missing or starts with a number */}
                            {channel.name && !/^\d/.test(channel.name) ? channel.name.charAt(0).toUpperCase() : 'U'}
                          </div>
                          {channel.unread_count && channel.unread_count > 0 && (
                            <div className="absolute -top-1 -right-1 min-w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                              <span className="text-xs text-white font-medium px-1">
                                {channel.unread_count > 99 ? '99+' : channel.unread_count}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className={`truncate ${channel.unread_count && channel.unread_count > 0 ? 'font-semibold' : 'font-medium'}`}>
                              {channel.name}
                            </span>
                            {channel.last_message_at && (
                              <span className={`text-xs ${channel.unread_count && channel.unread_count > 0 ? 'text-blue-500 font-medium' : 'text-gray-400'}`}>
                                {new Date(channel.last_message_at).toLocaleTimeString(language === 'ru' ? 'ru-RU' : 'uz-UZ', {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {channel.description && (
                              <span className="text-xs text-gray-400">
                                {channel.description}
                              </span>
                            )}
                            <span className={`text-sm truncate ${channel.unread_count && channel.unread_count > 0 ? 'text-gray-700 font-medium' : 'text-gray-500'}`}>
                              {channel.last_message || ''}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Group channels section */}
            <div>
              <div className="px-4 py-2 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wider">
                {language === 'ru' ? 'Групповые чаты' : 'Guruh chatlari'}
              </div>
              <div className="divide-y">
                {groupChannels.map((channel) => {
                  const labels = CHAT_CHANNEL_LABELS[channel.type];
                  const isSelected = selectedChannelId === channel.id;

                  return (
                    <button
                      key={channel.id}
                      onClick={() => onSelectChannel(channel.id)}
                      className={`w-full p-4 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors ${
                        isSelected ? 'bg-primary-50' : ''
                      }`}
                    >
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                        channel.type === 'uk_general' ? 'bg-purple-100 text-purple-600' : 'bg-green-100 text-green-600'
                      }`}>
                        {getChannelIcon(channel.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-medium truncate">
                            {language === 'ru' ? labels.label : labels.labelUz}
                          </span>
                          {channel.last_message_at && (
                            <span className="text-xs text-gray-400">
                              {new Date(channel.last_message_at).toLocaleTimeString(language === 'ru' ? 'ru-RU' : 'uz-UZ', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          )}
                        </div>
                        {channel.message_count && channel.message_count > 0 ? (
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <Users className="w-3.5 h-3.5" />
                            <span>{channel.message_count} {language === 'ru' ? 'сообщений' : 'xabar'}</span>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-400">
                            {language === 'ru' ? 'Нет сообщений' : 'Xabar yo\'q'}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Chat view component - shared for all users
function ChatView({
  channelId,
  channel,
  onBack,
  hideBackOnDesktop = false
}: {
  channelId: string;
  channel?: ChatChannel;
  onBack: () => void;
  hideBackOnDesktop?: boolean;
}) {
  const { user } = useAuthStore();
  const { language } = useLanguageStore();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    // Skip if channelId is not valid
    if (!channelId || channelId === 'undefined') {
      console.warn('Invalid channelId, skipping message fetch');
      setIsLoading(false);
      return;
    }
    try {
      const response = await chatApi.getMessages(channelId);
      const messageList = response.messages || [];
      setMessages(messageList);
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    } finally {
      setIsLoading(false);
    }
  }, [channelId]);

  // Mark channel as read when opening
  const markAsRead = useCallback(async () => {
    if (!channelId || channelId === 'undefined') return;
    try {
      await chatApi.markRead(channelId);
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  }, [channelId]);

  // Initial fetch and WebSocket subscription (no polling!)
  useEffect(() => {
    setIsLoading(true);
    fetchMessages();

    // Mark channel as read when opening
    markAsRead();

    // Subscribe to WebSocket chat messages instead of polling
    const unsubscribe = subscribeToChatMessages((message) => {
      // Only process messages for this channel
      if (message.channel_id === channelId) {
        console.log('[Chat] WebSocket message for this channel:', message);

        // Handle read receipts
        if (message.type === 'read') {
          setMessages(prev => prev.map(m =>
            m.id === message.message_id
              ? { ...m, read_by: [...(m.read_by || []), message.user_id] }
              : m
          ));
          return;
        }

        // Add new message if not already present
        setMessages(prev => {
          const exists = prev.some(m => m.id === message.id);
          if (exists) return prev;
          return [...prev, message];
        });

        // Auto-mark new messages as read since user is viewing
        markAsRead();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [fetchMessages, channelId, markAsRead]);

  // Scroll to bottom on new messages - with slight delay to ensure DOM update
  useEffect(() => {
    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
    return () => clearTimeout(timer);
  }, [messages.length]);

  const handleSend = async () => {
    if (!newMessage.trim() || !user || isSending) return;

    const messageToSend = newMessage.trim();
    setNewMessage(''); // Clear immediately for better UX
    setIsSending(true);

    try {
      const response = await chatApi.sendMessage(channelId, messageToSend);
      // Add sent message to local state immediately (optimistic update)
      if (response.message) {
        setMessages(prev => {
          const exists = prev.some(m => m.id === response.message.id);
          if (exists) return prev;
          return [...prev, response.message];
        });
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      // Restore message on error
      setNewMessage(messageToSend);
      alert('Не удалось отправить сообщение');
    } finally {
      setIsSending(false);
    }
  };

  // Get channel title based on type
  const getChannelTitle = () => {
    if (channel?.type === 'private_support') {
      // For residents - show "Chat with administration"
      if (user?.role === 'resident') {
        return language === 'ru' ? 'Чат с администрацией' : 'Administratsiya bilan chat';
      }
      // For admin/manager - show resident name
      return channel.name || 'Чат';
    }
    if (channel) {
      const labels = CHAT_CHANNEL_LABELS[channel.type];
      return language === 'ru' ? labels.label : labels.labelUz;
    }
    return language === 'ru' ? 'Чат' : 'Chat';
  };

  const getChannelSubtitle = () => {
    if (channel?.type === 'private_support') {
      if (user?.role === 'resident') {
        return language === 'ru' ? 'Личный чат' : 'Shaxsiy chat';
      }
      return channel.description || '';
    }
    return `${messages.length} ${language === 'ru' ? 'сообщений' : 'xabar'}`;
  };

  const isResidentView = user?.role === 'resident' && channel?.type === 'private_support';

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header - compact for residents */}
      <div className={`bg-white border-b flex items-center gap-3 ${isResidentView ? 'p-3' : 'p-4'}`}>
        {!hideBackOnDesktop && (
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded-xl md:hidden"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div className={`rounded-full flex items-center justify-center ${
          isResidentView ? 'w-8 h-8' : 'w-10 h-10'
        } ${
          channel?.type === 'private_support' ? 'bg-blue-100 text-blue-600' :
          channel?.type === 'uk_general' ? 'bg-purple-100 text-purple-600' :
          channel?.type === 'building_general' ? 'bg-green-100 text-green-600' :
          channel?.type === 'entrance' ? 'bg-amber-100 text-amber-600' :
          'bg-gray-100 text-gray-600'
        }`}>
          {channel?.type === 'private_support' ? (
            user?.role === 'resident' ? <HeadphonesIcon className={isResidentView ? 'w-4 h-4' : 'w-5 h-5'} /> : <User className="w-5 h-5" />
          ) : (
            <MessageCircle className="w-5 h-5" />
          )}
        </div>
        <div className="flex-1">
          <h3 className={`font-medium ${isResidentView ? 'text-sm' : ''}`}>{getChannelTitle()}</h3>
          {!isResidentView && <p className="text-xs text-gray-500">{getChannelSubtitle()}</p>}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <HeadphonesIcon className="w-10 h-10 text-gray-300 mb-3" />
            <p className="text-gray-400 text-sm">
              {language === 'ru' ? 'Напишите ваш вопрос' : 'Savolingizni yozing'}
            </p>
          </div>
        ) : (
          <>
            {messages.map((message, index) => {
              const isOwn = message.sender_id === user?.id;
              const showAvatar = index === 0 ||
                messages[index - 1].sender_id !== message.sender_id;
              const showName = !isOwn && showAvatar;

              return (
                <div
                  key={message.id}
                  className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[80%] ${isOwn ? 'order-1' : ''}`}>
                    {showName && (
                      <div className="flex items-center gap-2 mb-1 px-2">
                        <span className="text-sm font-medium text-gray-700">
                          {message.sender_name}
                        </span>
                        <RoleBadge role={message.sender_role} language={language} />
                      </div>
                    )}
                    <div className={`px-4 py-2 rounded-2xl ${
                      isOwn
                        ? 'bg-primary-500 text-gray-900 rounded-br-md'
                        : 'bg-white text-gray-900 rounded-bl-md shadow-sm'
                    }`}>
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      <div className={`flex items-center justify-end gap-1 mt-1 ${
                        isOwn ? 'text-gray-700' : 'text-gray-400'
                      }`}>
                        <span className="text-[10px]">
                          {new Date(message.created_at).toLocaleTimeString(language === 'ru' ? 'ru-RU' : 'uz-UZ', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                        {isOwn && (
                          message.read_by && message.read_by.length > 1
                            ? <CheckCheck className="w-3 h-3" />
                            : <Check className="w-3 h-3" />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className={`bg-white border-t ${isResidentView ? 'p-3' : 'p-4'}`}>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={language === 'ru' ? 'Написать...' : 'Yozing...'}
            className={`flex-1 bg-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 ${
              isResidentView ? 'px-3 py-2.5 text-sm' : 'px-4 py-3'
            }`}
            disabled={isSending}
          />
          <button
            onClick={handleSend}
            disabled={!newMessage.trim() || isSending}
            className={`bg-primary-500 hover:bg-primary-600 disabled:bg-gray-300 rounded-xl transition-colors ${
              isResidentView ? 'p-2.5' : 'p-3'
            }`}
          >
            {isSending ? (
              <Loader2 className={`text-gray-900 animate-spin ${isResidentView ? 'w-4 h-4' : 'w-5 h-5'}`} />
            ) : (
              <Send className={`text-gray-900 ${isResidentView ? 'w-4 h-4' : 'w-5 h-5'}`} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Sound notification hook
function useNotificationSound() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Create audio element for notification sound
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

// Main Chat Page
export function ChatPage() {
  const { user } = useAuthStore();
  const { language } = useLanguageStore();
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [residentChannel, setResidentChannel] = useState<ChatChannel | null>(null);
  const prevUnreadRef = useRef<number>(0);
  const playSound = useNotificationSound();

  const isResident = user?.role === 'resident';

  // Fetch channels with polling
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

        // Calculate total unread
        const totalUnread = newChannels.reduce((sum: number, ch: ChatChannel) => sum + (ch.unread_count || 0), 0);

        // Play sound if new messages arrived
        if (totalUnread > prevUnreadRef.current && prevUnreadRef.current > 0) {
          playSound();
        }
        prevUnreadRef.current = totalUnread;

        setChannels(newChannels);
      }
    } catch (err) {
      console.error('Failed to fetch channels:', err);
      setError(language === 'ru' ? 'Ошибка загрузки' : 'Yuklanmadi');
    }
  }, [isResident, playSound, language]);

  // Initial fetch
  useEffect(() => {
    setIsLoading(true);
    fetchChannels().finally(() => setIsLoading(false));
  }, [fetchChannels]);

  // Poll for channel updates every 5 seconds
  useEffect(() => {
    if (isResident) return;

    const interval = setInterval(fetchChannels, 5000);
    return () => clearInterval(interval);
  }, [fetchChannels, isResident]);

  // Find selected channel
  const selectedChannel = channels.find(ch => ch.id === selectedChannelId);

  // If resident and has channel, show compact chat card
  if (isResident) {
    if (isLoading) {
      return (
        <div className="max-w-lg mx-auto">
          <div className="bg-white rounded-2xl shadow-sm border overflow-hidden h-[70vh] md:h-[65vh] flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        </div>
      );
    }

    if (residentChannel) {
      return (
        <div className="max-w-lg mx-auto">
          <div className="bg-white rounded-2xl shadow-sm border overflow-hidden h-[70vh] md:h-[65vh] flex flex-col">
            <ChatView
              channelId={residentChannel.id}
              channel={residentChannel}
              onBack={() => window.history.back()}
              hideBackOnDesktop
            />
          </div>
        </div>
      );
    }

    return (
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden h-[70vh] md:h-[65vh] flex flex-col items-center justify-center gap-4 p-6">
          <AlertCircle className="w-12 h-12 text-red-400" />
          <p className="text-gray-500 text-center">{error || (language === 'ru' ? 'Ошибка загрузки чата' : 'Chat yuklanmadi')}</p>
          <button
            onClick={() => {
              setIsLoading(true);
              setError(null);
              fetchChannels().finally(() => setIsLoading(false));
            }}
            className="px-4 py-2 bg-primary-500 text-gray-900 rounded-xl hover:bg-primary-600 transition-colors"
          >
            {language === 'ru' ? 'Повторить' : 'Qayta urinish'}
          </button>
        </div>
      </div>
    );
  }

  // For admin/manager - show channel list with chat view
  return (
    <div className="h-[calc(100vh-180px)] md:h-[calc(100vh-140px)] bg-white rounded-2xl shadow-sm border overflow-hidden">
      <div className="h-full flex">
        {/* Channel list - always visible on desktop, hidden when chat selected on mobile */}
        <div className={`${
          selectedChannelId ? 'hidden md:block' : 'block'
        } w-full md:w-80 lg:w-96 border-r bg-white/80 backdrop-blur-sm`}>
          <AdminChannelList
            channels={channels}
            onSelectChannel={setSelectedChannelId}
            selectedChannelId={selectedChannelId}
            isLoading={isLoading}
          />
        </div>

        {/* Chat view - shown when channel selected */}
        <div className={`${
          selectedChannelId ? 'block' : 'hidden md:flex'
        } flex-1 bg-gray-50/50`}>
          {selectedChannelId ? (
            <ChatView
              channelId={selectedChannelId}
              channel={selectedChannel}
              onBack={() => setSelectedChannelId(null)}
            />
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="w-20 h-20 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                  <MessageCircle className="w-10 h-10 text-gray-400" />
                </div>
                <p className="text-gray-500">
                  {language === 'ru' ? 'Выберите чат для просмотра' : 'Ko\'rish uchun chatni tanlang'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
