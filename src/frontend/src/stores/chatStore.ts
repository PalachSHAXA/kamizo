import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChatChannel, ChatMessage } from '../types';

const generateId = () => Math.random().toString(36).substr(2, 9);

interface ChatState {
  channels: ChatChannel[];
  messages: ChatMessage[];

  // Channel actions
  createChannel: (data: Omit<ChatChannel, 'id' | 'createdAt' | 'participants'> & { participants?: string[] }) => ChatChannel;
  addParticipant: (channelId: string, userId: string) => void;
  removeParticipant: (channelId: string, userId: string) => void;
  getChannelsByUser: (userId: string, buildingId?: string, userRole?: string) => ChatChannel[];

  // Message actions
  sendMessage: (data: Omit<ChatMessage, 'id' | 'createdAt' | 'readBy'>) => ChatMessage;
  markAsRead: (messageId: string, userId: string) => void;
  getUnreadCount: (channelId: string, userId: string) => number;
  getMessagesByChannel: (channelId: string) => ChatMessage[];

  // Initialize default channels
  initializeDefaultChannels: (buildingId?: string, entrance?: string, floor?: string) => void;

  // Get or create private support channel for a resident
  getOrCreatePrivateSupportChannel: (residentId: string, residentName: string, residentApartment?: string) => ChatChannel;

  // Get all private support channels (for admin/manager view)
  getAllPrivateSupportChannels: () => ChatChannel[];
}

// Default channels that should exist
const createDefaultChannels = (): ChatChannel[] => {
  const now = new Date().toISOString();

  return [
    {
      id: 'uk-general',
      type: 'uk_general',
      name: 'Общий чат УК',
      description: 'Общий чат всех жителей управляющей компании',
      participants: [],
      createdAt: now,
    },
    {
      id: 'admin-support',
      type: 'admin_support',
      name: 'Чат с администрацией',
      description: 'Прямой чат с администрацией УК',
      participants: [],
      createdAt: now,
    },
  ];
};

// Demo messages
const createDemoMessages = (): ChatMessage[] => {
  const now = new Date();

  return [
    {
      id: 'demo-msg-1',
      channelId: 'uk-general',
      senderId: 'admin1',
      senderName: 'Администратор',
      senderRole: 'admin',
      content: 'Добро пожаловать в общий чат! Здесь вы можете общаться с соседями и получать важные уведомления от УК.',
      createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      readBy: ['admin1'],
    },
    {
      id: 'demo-msg-2',
      channelId: 'uk-general',
      senderId: 'resident1',
      senderName: 'Иванов Иван Иванович',
      senderRole: 'resident',
      senderApartment: '42',
      content: 'Здравствуйте! Подскажите, когда будут проводить уборку в подъезде?',
      createdAt: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(),
      readBy: ['resident1', 'admin1'],
    },
    {
      id: 'demo-msg-3',
      channelId: 'uk-general',
      senderId: 'manager1',
      senderName: 'Менеджер Акаунтов',
      senderRole: 'manager',
      content: 'Уборка проводится ежедневно в утренние часы с 8:00 до 10:00. Если есть замечания по качеству, пожалуйста, создайте заявку через приложение.',
      createdAt: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
      readBy: ['manager1', 'admin1'],
    },
  ];
};

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      channels: createDefaultChannels(),
      messages: createDemoMessages(),

      createChannel: (data) => {
        const newChannel: ChatChannel = {
          ...data,
          id: generateId(),
          participants: data.participants || [],
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          channels: [...state.channels, newChannel],
        }));

        return newChannel;
      },

      addParticipant: (channelId, userId) => {
        set((state) => ({
          channels: state.channels.map((ch) =>
            ch.id === channelId && !ch.participants.includes(userId)
              ? { ...ch, participants: [...ch.participants, userId] }
              : ch
          ),
        }));
      },

      removeParticipant: (channelId, userId) => {
        set((state) => ({
          channels: state.channels.map((ch) =>
            ch.id === channelId
              ? { ...ch, participants: ch.participants.filter((p) => p !== userId) }
              : ch
          ),
        }));
      },

      getChannelsByUser: (userId, buildingId, userRole) => {
        const state = get();
        return state.channels.filter((ch) => {
          // UK general is available to all
          if (ch.type === 'uk_general') return true;

          // Admin support (old shared channel) - hide it, we use private_support now
          if (ch.type === 'admin_support') return false;

          // Private support channel - show to the resident who owns it
          if (ch.type === 'private_support') {
            // For residents - only show their own channel
            if (userRole === 'resident' && ch.residentId === userId) return true;
            // For admin/manager - show all private support channels (handled separately)
            return false;
          }

          // Building-specific channels
          if (buildingId && ch.buildingId === buildingId) return true;

          // Direct participant
          if (ch.participants.includes(userId)) return true;

          return false;
        });
      },

      sendMessage: (data) => {
        const newMessage: ChatMessage = {
          ...data,
          id: generateId(),
          createdAt: new Date().toISOString(),
          readBy: [data.senderId],
        };

        set((state) => ({
          messages: [...state.messages, newMessage],
          channels: state.channels.map((ch) =>
            ch.id === data.channelId
              ? {
                  ...ch,
                  lastMessageAt: newMessage.createdAt,
                  lastMessage: data.content.slice(0, 50) + (data.content.length > 50 ? '...' : ''),
                }
              : ch
          ),
        }));

        return newMessage;
      },

      markAsRead: (messageId, userId) => {
        set((state) => ({
          messages: state.messages.map((msg) =>
            msg.id === messageId && !msg.readBy.includes(userId)
              ? { ...msg, readBy: [...msg.readBy, userId] }
              : msg
          ),
        }));
      },

      getUnreadCount: (channelId, userId) => {
        const state = get();
        return state.messages.filter(
          (msg) => msg.channelId === channelId && !msg.readBy.includes(userId)
        ).length;
      },

      getMessagesByChannel: (channelId) => {
        return get().messages.filter((msg) => msg.channelId === channelId);
      },

      initializeDefaultChannels: (buildingId, entrance, floor) => {
        const state = get();
        const now = new Date().toISOString();
        const newChannels: ChatChannel[] = [];

        // Create building channel if buildingId provided
        if (buildingId && !state.channels.some((ch) => ch.type === 'building_general' && ch.buildingId === buildingId)) {
          newChannels.push({
            id: `building-${buildingId}`,
            type: 'building_general',
            name: 'Чат ЖК',
            description: 'Чат жителей вашего жилого комплекса',
            buildingId,
            participants: [],
            createdAt: now,
          });
        }

        // Create entrance channel if entrance provided
        if (buildingId && entrance && !state.channels.some((ch) => ch.type === 'entrance' && ch.buildingId === buildingId && ch.entrance === entrance)) {
          newChannels.push({
            id: `entrance-${buildingId}-${entrance}`,
            type: 'entrance',
            name: `Подъезд ${entrance}`,
            description: 'Чат жителей вашего подъезда',
            buildingId,
            entrance,
            participants: [],
            createdAt: now,
          });
        }

        // Create floor channel if floor provided
        if (buildingId && entrance && floor && !state.channels.some((ch) => ch.type === 'floor' && ch.buildingId === buildingId && ch.entrance === entrance && ch.floor === floor)) {
          newChannels.push({
            id: `floor-${buildingId}-${entrance}-${floor}`,
            type: 'floor',
            name: `Этаж ${floor}`,
            description: 'Чат жителей вашего этажа',
            buildingId,
            entrance,
            floor,
            participants: [],
            createdAt: now,
          });
        }

        if (newChannels.length > 0) {
          set((state) => ({
            channels: [...state.channels, ...newChannels],
          }));
        }
      },

      getOrCreatePrivateSupportChannel: (residentId, residentName, residentApartment) => {
        const state = get();

        // Check if channel already exists for this resident
        const existingChannel = state.channels.find(
          ch => ch.type === 'private_support' && ch.residentId === residentId
        );

        if (existingChannel) {
          return existingChannel;
        }

        // Create new private support channel
        const newChannel: ChatChannel = {
          id: `private-support-${residentId}`,
          type: 'private_support',
          name: residentName,
          description: residentApartment ? `кв. ${residentApartment}` : 'Личный чат',
          residentId,
          residentName,
          residentApartment,
          participants: [residentId],
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          channels: [...state.channels, newChannel],
        }));

        return newChannel;
      },

      getAllPrivateSupportChannels: () => {
        const state = get();
        return state.channels
          .filter(ch => ch.type === 'private_support')
          .sort((a, b) => {
            // Sort by last message time, newest first
            const aTime = a.lastMessageAt || a.createdAt;
            const bTime = b.lastMessageAt || b.createdAt;
            return new Date(bTime).getTime() - new Date(aTime).getTime();
          });
      },
    }),
    {
      name: 'uk-chat-storage',
      // Limit messages to prevent localStorage bloat
      partialize: (state) => ({
        channels: state.channels.slice(0, 50),
        messages: state.messages.slice(-500), // Keep only last 500 messages total
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<ChatState>;

        // Ensure default channels exist
        const defaultChannels = createDefaultChannels();
        const existingChannels = persisted.channels || [];

        // Add missing default channels
        const missingDefaults = defaultChannels.filter(
          (dc) => !existingChannels.some((ec) => ec.id === dc.id)
        );

        return {
          ...currentState,
          channels: [...existingChannels, ...missingDefaults],
          messages: persisted.messages || createDemoMessages(),
        };
      },
    }
  )
);
