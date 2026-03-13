import type { UserRole } from './common';

// Chat types
export type ChatChannelType = 'uk_general' | 'building_general' | 'entrance' | 'floor' | 'admin_support' | 'private_support';

export interface ChatChannel {
  id: string;
  type: ChatChannelType;
  name: string;
  description?: string;
  buildingId?: string;
  entrance?: string;
  floor?: string;
  participants: string[]; // user IDs
  createdAt: string;
  lastMessageAt?: string;
  unreadCount?: number;
  // For private_support channels
  residentId?: string; // The resident who owns this support channel
  residentName?: string;
  residentApartment?: string;
  lastMessage?: string; // Preview of last message for listing
}

export interface ChatMessage {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  senderApartment?: string;
  content: string;
  createdAt: string;
  readBy: string[]; // user IDs who read the message
  replyToId?: string; // for reply functionality
  attachments?: ChatAttachment[];
}

export interface ChatAttachment {
  id: string;
  type: 'image' | 'file';
  name: string;
  url: string;
  size?: number;
}

export const CHAT_CHANNEL_LABELS: Record<ChatChannelType, { label: string; labelUz: string; icon: string; description: string; descriptionUz: string }> = {
  uk_general: {
    label: 'Общий чат УК',
    labelUz: 'UK umumiy chat',
    icon: '🏢',
    description: 'Общий чат всех жителей управляющей компании',
    descriptionUz: 'Boshqaruv kompaniyasi barcha turar joy egalari uchun umumiy chat'
  },
  building_general: {
    label: 'Чат ЖК',
    labelUz: 'TJM chat',
    icon: '🏠',
    description: 'Чат жителей вашего жилого комплекса',
    descriptionUz: 'Sizning turar joy majmuangiz aholisi uchun chat'
  },
  entrance: {
    label: 'Чат подъезда',
    labelUz: 'Kirish chati',
    icon: '🚪',
    description: 'Чат жителей вашего подъезда',
    descriptionUz: 'Sizning kirishingiz aholisi uchun chat'
  },
  floor: {
    label: 'Чат этажа',
    labelUz: 'Qavat chati',
    icon: '🔢',
    description: 'Чат жителей вашего этажа',
    descriptionUz: 'Sizning qavatingiz aholisi uchun chat'
  },
  admin_support: {
    label: 'Чат с администрацией',
    labelUz: 'Administratsiya bilan chat',
    icon: '👨‍💼',
    description: 'Прямой чат с администрацией УК',
    descriptionUz: 'UK administratsiyasi bilan to\'g\'ridan-to\'g\'ri chat'
  },
  private_support: {
    label: 'Личный чат с УК',
    labelUz: 'UK bilan shaxsiy chat',
    icon: '💬',
    description: 'Ваш личный чат с администрацией',
    descriptionUz: 'Administratsiya bilan shaxsiy chatizngiz'
  }
};
