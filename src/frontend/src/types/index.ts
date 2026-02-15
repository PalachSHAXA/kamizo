export type UserRole = 'super_admin' | 'admin' | 'director' | 'manager' | 'department_head' | 'executor' | 'resident' | 'commercial_owner' | 'tenant' | 'advertiser' | 'dispatcher' | 'security' | 'marketplace_manager';
export type ExecutorSpecialization = 'plumber' | 'electrician' | 'elevator' | 'intercom' | 'cleaning' | 'security' | 'trash' | 'boiler' | 'ac' | 'courier' | 'other';
export type RequestStatus = 'new' | 'assigned' | 'accepted' | 'in_progress' | 'pending_approval' | 'completed' | 'cancelled';
export type CancelledBy = 'resident' | 'executor' | 'manager' | 'admin';
export type RequestPriority = 'low' | 'medium' | 'high' | 'urgent';

export type ContractType = 'standard' | 'commercial' | 'temporary';

export interface User {
  id: string;
  phone: string;
  name: string;
  login: string;
  email?: string;
  role: UserRole;
  specialization?: ExecutorSpecialization;
  avatar?: string;
  address?: string;
  apartment?: string;
  branch?: string; // филиал (YS, CH, etc.)
  building?: string; // номер дома (8A, 15, etc.)
  buildingId?: string;
  entrance?: string; // подъезд
  floor?: string; // этаж
  totalArea?: number; // площадь квартиры в кв.м

  // Contract fields (for residents)
  qrCode?: string; // уникальный QR-код для подписания договора
  signatureKey?: string; // уникальный ключ электронной подписи (для голосований)
  contractSignedAt?: string; // дата подписания договора
  agreedToTermsAt?: string; // дата принятия оферты
  contractNumber?: string; // номер договора (ДОГ-2024-00001)
  contractStartDate?: string; // дата начала договора
  contractEndDate?: string; // дата окончания (null = бессрочный)
  contractType?: ContractType; // тип договора

  // Onboarding tracking (from DB, works across devices)
  passwordChangedAt?: string; // дата смены пароля

  // Timestamps
  createdAt?: string;

  // Special account types (for advertising platform)
  account_type?: 'advertiser';
}

export interface Executor {
  id: string;
  name: string;
  phone: string;
  login: string;
  password?: string;
  specialization: ExecutorSpecialization;
  status: 'available' | 'busy' | 'offline';
  rating: number;
  completedCount: number;
  activeRequests: number;
  totalEarnings: number;
  avgCompletionTime: number;
  createdAt: string;
}

export interface Request {
  id: string;
  number: number | string;  // Can be numeric (1001) or with prefix (YS-1001)
  title: string;
  description: string;
  category: ExecutorSpecialization;
  status: RequestStatus;
  priority: RequestPriority;
  residentId: string;
  residentName: string;
  residentPhone: string;
  address: string;
  apartment: string;
  executorId?: string;
  executorName?: string;
  executorPhone?: string;
  executorRating?: number;
  createdAt: string;
  scheduledDate?: string; // желаемая дата выполнения
  scheduledTime?: string; // желаемое время выполнения (например "09:00-12:00")
  accessInfo?: string; // информация о доступе в квартиру
  assignedAt?: string;
  acceptedAt?: string;
  startedAt?: string;
  completedAt?: string;
  approvedAt?: string;
  rating?: number;
  feedback?: string;
  workDuration?: number; // in seconds
  pausedAt?: string; // when work was paused
  pauseReason?: string; // reason for pausing work
  totalPausedTime?: number; // total paused time in seconds
  isPaused?: boolean; // current pause state
  cancelledAt?: string;
  cancelledBy?: CancelledBy;
  cancellationReason?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  rejectionCount?: number; // сколько раз работа была отклонена
  buildingId?: string; // ID дома резидента
  buildingName?: string; // Название дома
}

export interface Notification {
  id: string;
  userId: string;
  type: 'request_created' | 'request_assigned' | 'request_accepted' | 'request_started' | 'request_completed' | 'request_approved' | 'request_rejected' | 'request_cancelled' | 'request_declined';
  title: string;
  message: string;
  requestId?: string;
  read: boolean;
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  action: string;
  details: string;
  requestId?: string;
  timestamp: string;
}

export interface DashboardStats {
  totalRequests: number;
  newRequests: number;
  inProgress: number;
  completedToday: number;
  completedWeek: number;
  avgCompletionTime: number;
  executorsOnline: number;
  executorsTotal: number;
}

export interface ChartData {
  date: string;
  name: string;
  created: number;
  completed: number;
}

export interface Building {
  id: string;
  name: string;
  address: string;
  floors: number;
  apartments: number;
  entrances: number;
  yearBuilt?: number;
  managerId?: string;
  createdAt: string;
  residentsCount: number;
  activeRequestsCount: number;
}

// Rental apartment for commercial owners (tenants)
export interface RentalApartment {
  id: string;
  name: string; // e.g., "Квартира 42" or custom name
  address: string;
  apartment: string;
  ownerId: string; // tenant user id
  ownerName: string;
  ownerPhone: string;
  ownerLogin: string;
  ownerPassword?: string; // stored for delete confirmation
  ownerType: 'tenant' | 'commercial_owner'; // tenant = посуточная аренда, commercial_owner = коммерческая недвижимость
  createdAt: string;
  isActive: boolean;
}

// Rental record (guest check-in/check-out)
export interface RentalRecord {
  id: string;
  apartmentId: string;
  guestNames: string; // comma separated or single name
  passportInfo: string;
  checkInDate: string;
  checkOutDate: string;
  amount: number; // rental amount
  currency: string; // UZS, USD, etc.
  notes?: string;
  createdAt: string;
  createdBy: string; // manager id
}

// Announcement types
export type AnnouncementType = 'residents' | 'employees' | 'all';
export type AnnouncementPriority = 'normal' | 'important' | 'urgent';
export type AnnouncementTargetType = 'all' | 'branch' | 'building' | 'entrance' | 'floor' | 'custom';

// Announcement targeting
export interface AnnouncementTarget {
  type: AnnouncementTargetType;
  branchId?: string; // for branch targeting
  buildingId?: string; // for building targeting
  entrance?: string; // for entrance/подъезд targeting
  floor?: string; // for floor targeting
  customLogins?: string[]; // for custom targeting (from Excel import)
}

// File attachment for announcements
export interface FileAttachment {
  name: string;
  url: string; // data URL or external URL
  type: string; // MIME type
  size: number; // in bytes
}

// Personalized data for debt-based announcements
export interface AnnouncementPersonalizedData {
  [login: string]: {
    name: string;
    debt: number;
  };
}

// Announcement for residents or staff
export interface Announcement {
  id: string;
  title: string;
  content: string;
  type: AnnouncementType; // 'residents' = for residents, 'employees' = for UK workers, 'all' = everyone
  priority: AnnouncementPriority;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  createdAt: string;
  expiresAt?: string; // optional expiration date
  isActive: boolean;
  viewedBy: string[]; // array of user IDs who viewed (for current user check)
  viewCount?: number; // total view count from API (for admin/manager display)
  attachments?: FileAttachment[]; // file attachments
  // Targeting fields
  target?: AnnouncementTarget;
  // Personalized data for debt-based announcements (template variables per login)
  personalizedData?: AnnouncementPersonalizedData;
}

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

// Service categories for residents
export interface ServiceCategory {
  id: ExecutorSpecialization;
  name: string;
  nameUz: string;
  icon: string;
  description: string;
  descriptionUz: string;
}

export const SERVICE_CATEGORIES: ServiceCategory[] = [
  // Popular services (first 4 shown in grid)
  { id: 'plumber', name: 'Сантехника', nameUz: 'Santexnika', icon: '🔧', description: 'Ремонт труб, кранов, унитазов', descriptionUz: 'Quvurlar, kranlar, unitazlar ta\'miri' },
  { id: 'electrician', name: 'Электрика', nameUz: 'Elektrika', icon: '💡', description: 'Проводка, розетки, освещение', descriptionUz: 'Simlar, rozetkalar, yoritish' },
  { id: 'security', name: 'Охрана', nameUz: 'Qo\'riqlash', icon: '🛡️', description: 'Безопасность и охрана территории', descriptionUz: 'Xavfsizlik va hududni qo\'riqlash' },
  { id: 'cleaning', name: 'Уборка', nameUz: 'Tozalash', icon: '🧹', description: 'Уборка подъездов и территории', descriptionUz: 'Kirish joylari va hududni tozalash' },
  // Other services
  { id: 'elevator', name: 'Лифт', nameUz: 'Lift', icon: '🛗', description: 'Ремонт и обслуживание лифтов', descriptionUz: 'Liftlarni ta\'mirlash va xizmat ko\'rsatish' },
  { id: 'intercom', name: 'Домофон', nameUz: 'Domofon', icon: '🔔', description: 'Ремонт домофонов и замков', descriptionUz: 'Domofon va qulflarni ta\'mirlash' },
  { id: 'trash', name: 'Вывоз мусора', nameUz: 'Chiqindi olib ketish', icon: '🗑️', description: 'Вывоз и утилизация мусора', descriptionUz: 'Chiqindilarni olib ketish va qayta ishlash' },
  { id: 'boiler', name: 'Котёл', nameUz: 'Qozon', icon: '🔥', description: 'Ремонт и обслуживание котлов', descriptionUz: 'Qozonlarni ta\'mirlash va xizmat ko\'rsatish' },
  { id: 'ac', name: 'Кондиционер', nameUz: 'Konditsioner', icon: '❄️', description: 'Установка и ремонт кондиционеров', descriptionUz: 'Konditsionerlarni o\'rnatish va ta\'mirlash' },
  { id: 'other', name: 'Другое', nameUz: 'Boshqa', icon: '📋', description: 'Прочие услуги', descriptionUz: 'Boshqa xizmatlar' },
];

// Labels
export const SPECIALIZATION_LABELS: Record<ExecutorSpecialization, string> = {
  plumber: 'Сантехник',
  electrician: 'Электрик',
  elevator: 'Лифтёр',
  intercom: 'Домофон',
  cleaning: 'Уборщица',
  security: 'Охранник',
  trash: 'Вывоз мусора',
  boiler: 'Котельщик',
  ac: 'Кондиционерщик',
  courier: 'Курьер',
  other: 'Другое'
};

export const SPECIALIZATION_LABELS_UZ: Record<ExecutorSpecialization, string> = {
  plumber: 'Santexnik',
  electrician: 'Elektrik',
  elevator: 'Liftchi',
  intercom: 'Domofon',
  cleaning: 'Tozalovchi',
  security: 'Qo\'riqchi',
  trash: 'Chiqindi olib ketish',
  boiler: 'Qozonchi',
  ac: 'Konditsionerchi',
  courier: 'Kuryer',
  other: 'Boshqa'
};

export const STATUS_LABELS: Record<RequestStatus, string> = {
  new: 'Новая',
  assigned: 'Назначена',
  accepted: 'Принята',
  in_progress: 'В работе',
  pending_approval: 'Ожидает подтверждения',
  completed: 'Выполнена',
  cancelled: 'Отменена'
};

export const STATUS_LABELS_UZ: Record<RequestStatus, string> = {
  new: 'Yangi',
  assigned: 'Tayinlangan',
  accepted: 'Qabul qilingan',
  in_progress: 'Bajarilmoqda',
  pending_approval: 'Tasdiqlash kutilmoqda',
  completed: 'Bajarildi',
  cancelled: 'Bekor qilindi'
};

export const PRIORITY_LABELS: Record<RequestPriority, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
  urgent: 'Срочный'
};

export const PRIORITY_LABELS_UZ: Record<RequestPriority, string> = {
  low: 'Past',
  medium: 'O\'rtacha',
  high: 'Yuqori',
  urgent: 'Shoshilinch'
};

export const PAUSE_REASON_LABELS: Record<string, { label: string; labelUz: string; icon: string }> = {
  waiting_materials: { label: 'Ожидание материалов', labelUz: 'Materiallar kutilmoqda', icon: '📦' },
  waiting_resident: { label: 'Ожидание жителя', labelUz: 'Aholini kutish', icon: '🏠' },
  lunch_break: { label: 'Обеденный перерыв', labelUz: 'Tushlik tanaffusi', icon: '🍽️' },
  other_task: { label: 'Другая задача', labelUz: 'Boshqa vazifa', icon: '📋' },
  personal: { label: 'Личные причины', labelUz: 'Shaxsiy sabablar', icon: '👤' },
};

// ============================================
// MEETINGS MODULE - Собрания жильцов
// ============================================

// Meeting status - state machine
export type MeetingStatus =
  | 'draft'                    // Черновик
  | 'pending_moderation'       // На модерации УК
  | 'schedule_poll_open'       // Выбор даты/времени
  | 'schedule_confirmed'       // Дата/время утверждены
  | 'voting_open'              // Голосование открыто
  | 'voting_closed'            // Голосование закрыто
  | 'results_published'        // Итоги опубликованы
  | 'protocol_generated'       // Протокол сформирован
  | 'protocol_approved'        // Протокол подписан/утвержден
  | 'cancelled';               // Отменено

// Meeting format
export type MeetingFormat = 'online' | 'offline' | 'hybrid';

// Meeting organizer type
export type MeetingOrganizerType = 'resident' | 'management';

// Vote choice for agenda items
export type VoteChoice = 'for' | 'against' | 'abstain' | 'not_voted';

// Voting unit type - what counts as one vote
export type VotingUnitType = 'apartment' | 'owner' | 'share';

// Decision threshold type
export type DecisionThreshold = 'simple_majority' | 'qualified_majority' | 'two_thirds' | 'three_quarters' | 'unanimous';

// Agenda item type (predefined categories)
export type AgendaItemType =
  | 'budget_approval'          // Утверждение бюджета
  | 'tariff_change'            // Изменение тарифов
  | 'major_repair'             // Капитальный ремонт
  | 'common_property'          // Использование общего имущества
  | 'management_contract'      // Договор управления
  | 'chairman_election'        // Выбор председателя
  | 'audit_commission'         // Ревизионная комиссия
  | 'rules_amendment'          // Изменение правил
  | 'landscaping'              // Благоустройство
  | 'security'                 // Охрана и безопасность
  | 'parking'                  // Парковка
  | 'other';                   // Другое

// Schedule option for date/time voting
export interface ScheduleOption {
  id: string;
  dateTime: string;            // ISO datetime
  votes: string[];             // Array of voter IDs
  votesByShare?: number;       // Sum of shares if voting by shares
}

// Agenda item
export interface AgendaItem {
  id: string;
  type: AgendaItemType;
  title: string;
  description: string;
  threshold: DecisionThreshold;
  materials: MeetingMaterial[];
  votesFor: number;           // Votes by area (sq.m) as per Uzbekistan law
  votesAgainst: number;
  votesAbstain: number;
  votesForByShare?: number;   // Alias for compatibility
  votesAgainstByShare?: number;
  votesAbstainByShare?: number;
  isApproved?: boolean;
  decision?: string;
  order: number;               // Order in agenda
}

// Meeting material (attachment)
export interface MeetingMaterial {
  id: string;
  name: string;
  type: 'document' | 'image' | 'link';
  url: string;
  size?: number;
  uploadedAt: string;
  uploadedBy: string;
}

// Agenda item comment (комментарий/довод к вопросу повестки дня)
export interface AgendaComment {
  id: string;
  agendaItemId: string;
  meetingId: string;
  residentId: string;
  residentName: string;
  apartmentNumber?: string;
  content: string;
  includeInProtocol: boolean;
  createdAt: string;
  updatedAt?: string;
}

// Vote record with audit trail
export interface VoteRecord {
  id: string;
  meetingId: string;
  agendaItemId?: string;       // null for schedule votes
  scheduleOptionId?: string;   // for schedule votes
  voterId: string;
  voterName: string;
  apartmentId?: string;
  apartmentNumber?: string;
  ownershipShare?: number;     // доля собственности (0-100)
  choice: VoteChoice | 'schedule';

  // Audit & verification
  verificationMethod: 'otp_sms' | 'otp_push' | 'password' | 'e_signature' | 'otp' | 'login' | 'in_person' | 'proxy';
  otpVerified: boolean;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  votedAt: string;
  voteHash: string;            // SHA-256 hash for immutability proof

  // Re-vote tracking
  isRevote?: boolean;
  previousVoteId?: string;
}

// OTP verification record
export interface OTPRecord {
  id: string;
  userId: string;
  phone: string;
  code: string;
  purpose: 'meeting_vote' | 'schedule_vote' | 'phone_verification';
  meetingId?: string;
  agendaItemId?: string;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  expiresAt: string;
  verifiedAt?: string;
  isUsed: boolean;
}

// Notification log for meetings
export interface MeetingNotificationLog {
  id: string;
  meetingId: string;
  recipientId: string;
  recipientPhone?: string;
  recipientEmail?: string;
  channel: 'sms' | 'push' | 'email' | 'in_app';
  type: 'meeting_created' | 'schedule_poll' | 'schedule_confirmed' | 'voting_open' | 'voting_reminder' | 'results_published' | 'protocol_ready';
  status: 'pending' | 'sent' | 'delivered' | 'failed';
  sentAt?: string;
  deliveredAt?: string;
  errorMessage?: string;
}

// Meeting protocol
export interface MeetingProtocol {
  id: string;
  meetingId: string;
  number: string;              // Protocol number
  generatedAt: string;
  content: string;             // HTML or markdown content

  // Signatures
  signedByUK?: {
    userId: string;
    name: string;
    role: string;
    signedAt: string;
    signatureHash: string;
  };
  signedByChairman?: {
    userId: string;
    name: string;
    signedAt: string;
    signatureHash: string;
  };
  signedBySecretary?: {
    userId: string;
    name: string;
    signedAt: string;
    signatureHash: string;
  };

  // Integrity
  protocolHash: string;        // Hash of entire protocol for verification
  attachments: string[];       // IDs of related materials
}

// Main Meeting entity
export interface Meeting {
  id: string;
  number: number;              // Sequential meeting number
  buildingId: string;
  buildingAddress: string;

  // Organization
  organizerType: MeetingOrganizerType;
  organizerId: string;
  organizerName: string;
  format: MeetingFormat;
  status: MeetingStatus;

  // Schedule
  scheduleOptions: ScheduleOption[];
  schedulePollEndsAt?: string;
  confirmedDateTime?: string;
  location?: string;           // For offline/hybrid meetings

  // Agenda
  agendaItems: AgendaItem[];
  materials: MeetingMaterial[];

  // Voting settings (per building/meeting)
  votingSettings: {
    votingUnit: VotingUnitType;
    quorumPercent: number;     // % required for valid meeting
    allowRevote: boolean;      // Can change vote before closing
    requireOTP: boolean;       // Require OTP for each vote
    showIntermediateResults: boolean;
  };

  // Participation
  eligibleVoters: string[];    // User IDs who can vote
  totalEligibleCount: number;
  totalEligibleShares?: number;
  participatedVoters: string[];

  // Results
  quorumReached: boolean;
  participationPercent: number;
  participationByShares?: number;

  // Protocol
  protocolId?: string;

  // Timestamps
  createdAt: string;
  moderatedAt?: string;
  moderationComment?: string;      // Комментарий модератора
  schedulePollOpenedAt?: string;
  scheduleConfirmedAt?: string;
  votingOpenedAt?: string;
  votingClosedAt?: string;
  resultsPublishedAt?: string;
  protocolGeneratedAt?: string;
  protocolApprovedAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;

  // Reminders sent
  remindersSent: {
    type: string;
    sentAt: string;
  }[];

  // Audit
  notificationLogs: MeetingNotificationLog[];
}

// Building meeting settings (configurable per building)
export interface BuildingMeetingSettings {
  buildingId: string;
  votingUnit: VotingUnitType;
  defaultQuorumPercent: number;
  schedulePollDurationDays: number;
  votingDurationHours: number;
  allowResidentInitiative: boolean;
  requireModeration: boolean;
  defaultMeetingTime: string;  // e.g., "19:00"
  reminderHoursBefore: number[];
  notificationChannels: ('sms' | 'push' | 'email' | 'in_app')[];
}

// Apartment/Unit for voting
export interface VotingUnit {
  id: string;
  buildingId: string;
  apartmentId?: string;        // ID квартиры
  apartmentNumber: string;
  totalArea?: number;          // Общая площадь
  floor?: number;
  entrance?: number;
  ownershipShare: number;      // % of total building (for share-based voting)
  ownerId: string;             // Primary owner user ID
  ownerName?: string;          // Имя владельца
  coOwnerIds: string[];        // Co-owners user IDs
  residentIds?: string[];      // All residents (including renters)
  isVerified: boolean;         // KYC verified
  verifiedAt?: string;
  verifiedBy?: string;
}

// Predefined agenda item templates
export const AGENDA_ITEM_TYPES: Record<AgendaItemType, {
  label: string;
  labelUz: string;
  defaultThreshold: DecisionThreshold;
  requiresMaterials: boolean;
  description: string;
  descriptionUz: string;
}> = {
  budget_approval: {
    label: 'Утверждение бюджета',
    labelUz: 'Byudjetni tasdiqlash',
    defaultThreshold: 'simple_majority',
    requiresMaterials: true,
    description: 'Рассмотрение и утверждение годового бюджета дома',
    descriptionUz: 'Yillik uy byudjetini ko\'rib chiqish va tasdiqlash'
  },
  tariff_change: {
    label: 'Изменение тарифов',
    labelUz: 'Tariflarni o\'zgartirish',
    defaultThreshold: 'simple_majority',
    requiresMaterials: true,
    description: 'Изменение размера ежемесячных платежей',
    descriptionUz: 'Oylik to\'lovlar miqdorini o\'zgartirish'
  },
  major_repair: {
    label: 'Капитальный ремонт',
    labelUz: 'Asosiy ta\'mirlash',
    defaultThreshold: 'two_thirds',
    requiresMaterials: true,
    description: 'Решение о проведении капитального ремонта',
    descriptionUz: 'Asosiy ta\'mirlash to\'g\'risida qaror'
  },
  common_property: {
    label: 'Общее имущество',
    labelUz: 'Umumiy mulk',
    defaultThreshold: 'two_thirds',
    requiresMaterials: false,
    description: 'Использование общего имущества дома',
    descriptionUz: 'Umumiy uy mulkidan foydalanish'
  },
  management_contract: {
    label: 'Договор управления',
    labelUz: 'Boshqaruv shartnomasi',
    defaultThreshold: 'simple_majority',
    requiresMaterials: true,
    description: 'Заключение или изменение договора с УК',
    descriptionUz: 'Boshqaruv kompaniyasi bilan shartnoma tuzish yoki o\'zgartirish'
  },
  chairman_election: {
    label: 'Выбор председателя',
    labelUz: 'Rais saylov',
    defaultThreshold: 'simple_majority',
    requiresMaterials: false,
    description: 'Выборы председателя совета дома',
    descriptionUz: 'Uy kengashi raisi saylovi'
  },
  audit_commission: {
    label: 'Ревизионная комиссия',
    labelUz: 'Taftish komissiyasi',
    defaultThreshold: 'simple_majority',
    requiresMaterials: false,
    description: 'Формирование ревизионной комиссии',
    descriptionUz: 'Taftish komissiyasini shakllantirish'
  },
  rules_amendment: {
    label: 'Изменение правил',
    labelUz: 'Qoidalarni o\'zgartirish',
    defaultThreshold: 'two_thirds',
    requiresMaterials: true,
    description: 'Изменение правил проживания в доме',
    descriptionUz: 'Uyda yashash qoidalarini o\'zgartirish'
  },
  landscaping: {
    label: 'Благоустройство',
    labelUz: 'Obodonlashtirish',
    defaultThreshold: 'simple_majority',
    requiresMaterials: true,
    description: 'Работы по благоустройству территории',
    descriptionUz: 'Hududni obodonlashtirish ishlari'
  },
  security: {
    label: 'Охрана и безопасность',
    labelUz: 'Xavfsizlik',
    defaultThreshold: 'simple_majority',
    requiresMaterials: false,
    description: 'Вопросы охраны и безопасности дома',
    descriptionUz: 'Uy xavfsizligi masalalari'
  },
  parking: {
    label: 'Парковка',
    labelUz: 'Avtoturargoh',
    defaultThreshold: 'simple_majority',
    requiresMaterials: false,
    description: 'Организация парковки на территории',
    descriptionUz: 'Hududda avtoturargoh tashkil etish'
  },
  other: {
    label: 'Другое',
    labelUz: 'Boshqa',
    defaultThreshold: 'simple_majority',
    requiresMaterials: false,
    description: 'Прочие вопросы',
    descriptionUz: 'Boshqa masalalar'
  }
};

// Decision threshold labels
export const DECISION_THRESHOLD_LABELS: Record<DecisionThreshold, { label: string; labelUz: string; percent: number }> = {
  simple_majority: { label: 'Простое большинство (50%+1)', labelUz: 'Oddiy ko\'pchilik (50%+1)', percent: 50 },
  qualified_majority: { label: 'Квалифицированное большинство (60%)', labelUz: 'Malakali ko\'pchilik (60%)', percent: 60 },
  two_thirds: { label: 'Две трети (66.7%)', labelUz: 'Uchdan ikki (66.7%)', percent: 66.67 },
  three_quarters: { label: 'Три четверти (75%)', labelUz: 'To\'rtdan uch (75%)', percent: 75 },
  unanimous: { label: 'Единогласно (100%)', labelUz: 'Bir ovozdan (100%)', percent: 100 }
};

// Meeting status labels
export const MEETING_STATUS_LABELS: Record<MeetingStatus, { label: string; labelUz: string; color: string }> = {
  draft: { label: 'Черновик', labelUz: 'Qoralama', color: 'gray' },
  pending_moderation: { label: 'На модерации', labelUz: 'Moderatsiyada', color: 'yellow' },
  schedule_poll_open: { label: 'Выбор даты', labelUz: 'Sana tanlash', color: 'blue' },
  schedule_confirmed: { label: 'Дата утверждена', labelUz: 'Sana tasdiqlangan', color: 'indigo' },
  voting_open: { label: 'Голосование', labelUz: 'Ovoz berish', color: 'green' },
  voting_closed: { label: 'Голосование закрыто', labelUz: 'Ovoz berish yopildi', color: 'orange' },
  results_published: { label: 'Итоги опубликованы', labelUz: 'Natijalar e\'lon qilindi', color: 'purple' },
  protocol_generated: { label: 'Протокол готов', labelUz: 'Bayonnoma tayyor', color: 'teal' },
  protocol_approved: { label: 'Протокол утвержден', labelUz: 'Bayonnoma tasdiqlangan', color: 'emerald' },
  cancelled: { label: 'Отменено', labelUz: 'Bekor qilindi', color: 'red' }
};

// ============================================
// CRM MODULE - Иерархия объектов и жильцы
// ============================================

// Расширенный дом с полной информацией
export interface BuildingFull {
  id: string;
  name: string;
  address: string;
  zone?: string;                   // Название района/зоны (Юнусабад, Чиланзар и т.д.)
  cadastralNumber?: string;        // Кадастровый номер
  branchCode?: string;             // Код филиала (YS, CH, etc.)
  buildingNumber?: string;         // Номер дома (8A, 15, etc.)

  // Технические характеристики
  floors: number;
  entrances: number;
  totalApartments: number;
  totalArea: number;               // Общая площадь м²
  livingArea: number;              // Жилая площадь м²
  commonArea: number;              // Площадь МОП м²
  landArea?: number;               // Площадь участка м²
  yearBuilt: number;
  yearRenovated?: number;
  buildingType: 'panel' | 'brick' | 'monolith' | 'block' | 'wooden' | 'mixed';
  roofType: 'flat' | 'pitched' | 'combined';
  wallMaterial: string;
  foundationType: string;

  // Инженерные системы
  hasElevator: boolean;
  elevatorCount: number;
  hasGas: boolean;
  heatingType: 'central' | 'individual' | 'autonomous';
  hasHotWater: boolean;
  waterSupplyType: 'central' | 'autonomous';
  sewerageType: 'central' | 'autonomous';
  hasIntercom: boolean;
  hasVideoSurveillance: boolean;
  hasConcierge: boolean;
  hasParkingLot: boolean;
  parkingSpaces: number;
  hasPlayground: boolean;

  // Управление
  managerId?: string;
  managerName?: string;
  managementStartDate?: string;
  contractNumber?: string;
  contractEndDate?: string;

  // Финансовые данные
  monthlyBudget: number;
  reserveFund: number;
  totalDebt: number;
  collectionRate: number;          // % собираемости

  // Статистика
  residentsCount: number;
  ownersCount: number;
  tenantsCount: number;
  vacantApartments: number;
  activeRequestsCount: number;

  // Документы
  documents: BuildingDocument[];

  createdAt: string;
  updatedAt: string;
}

// Документ дома
export interface BuildingDocument {
  id: string;
  buildingId: string;
  name: string;
  type: 'contract' | 'act' | 'protocol' | 'passport' | 'license' | 'certificate' | 'other';
  fileUrl: string;
  fileSize: number;
  uploadedAt: string;
  uploadedBy: string;
  expiresAt?: string;
  isActive: boolean;
}

// Подъезд
export interface Entrance {
  id: string;
  buildingId: string;
  number: number;
  floorsFrom: number;
  floorsTo: number;
  apartmentsFrom: number;
  apartmentsTo: number;
  hasElevator: boolean;
  elevatorId?: string;
  intercomType?: 'audio' | 'video' | 'smart' | 'none';
  intercomCode?: string;
  cleaningSchedule?: string;
  responsibleId?: string;          // Ответственный сотрудник
  lastInspection?: string;
  notes?: string;
}

// Квартира (расширенная)
export interface Apartment {
  id: string;
  buildingId: string;
  entranceId: string;
  number: string;                  // Номер квартиры
  floor: number;

  // Характеристики
  rooms: number;
  totalArea: number;               // Общая площадь м²
  livingArea: number;              // Жилая площадь м²
  kitchenArea?: number;
  balconyArea?: number;
  loggiaArea?: number;             // Площадь лоджии
  ceilingHeight?: number;          // Высота потолков
  hasBalcony: boolean;
  hasLoggia: boolean;
  hasStorage?: boolean;            // Кладовая
  hasParking?: boolean;            // Парковка
  parkingNumber?: string;          // Номер парковки

  // Право собственности
  ownershipType: 'private' | 'municipal' | 'state' | 'cooperative';
  ownershipShare?: number;          // Доля в общем имуществе %
  registrationNumber?: string;     // Регистрационный номер
  registrationDate?: string;       // Дата регистрации
  cadastralValue?: number;

  // Текущий статус
  status: 'occupied' | 'vacant' | 'rented' | 'commercial' | 'under_repair';
  isCommercial: boolean;           // Нежилое помещение
  commercialType?: string;         // Тип коммерческого помещения

  // Счетчики
  meters: Meter[];

  // Связи
  personalAccountId?: string;
  primaryOwnerId?: string;

  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// Счетчик (ИПУ)
export interface Meter {
  id: string;
  apartmentId?: string;
  buildingId?: string;             // Для ОДПУ
  type: 'cold_water' | 'hot_water' | 'electricity' | 'gas' | 'heat';
  serialNumber: string;
  model?: string;
  brand?: string;                  // Бренд/производитель
  manufacturer?: string;
  installDate: string;
  verificationDate: string;
  nextVerificationDate: string;
  sealNumber?: string;
  location: string;
  initialValue: number;
  currentValue: number;
  lastReadingDate?: string;
  isActive: boolean;
  isCommon: boolean;               // ОДПУ
  tariffZone?: string;             // Тарифная зона
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Показания счетчика
export interface MeterReading {
  id: string;
  meterId: string;
  apartmentId?: string;
  value: number;
  previousValue: number;
  consumption: number;
  readingDate: string;
  source: 'manual' | 'online' | 'auto' | 'calculated';
  submittedBy?: string;
  submittedAt: string;
  isVerified: boolean;
  verifiedBy?: string;
  verifiedAt?: string;
  photoUrl?: string;
  status?: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  notes?: string;
  createdAt?: string;
}

// Собственник/Наниматель
export interface Owner {
  id: string;

  // Персональные данные
  type: 'individual' | 'legal_entity';
  lastName: string;
  firstName: string;
  middleName?: string;
  fullName: string;                // ФИО или название юр.лица

  // Документы (для физлица)
  passportSeries?: string;
  passportNumber?: string;
  passportIssuedBy?: string;
  passportIssuedDate?: string;
  inn?: string;
  snils?: string;
  birthDate?: string;
  birthPlace?: string;             // Место рождения

  // Для юр.лица
  companyName?: string;
  ogrn?: string;
  kpp?: string;
  legalAddress?: string;
  directorName?: string;

  // Контакты
  phone: string;
  additionalPhone?: string;        // Дополнительный телефон
  phoneAdditional?: string;
  email?: string;
  preferredContact: 'phone' | 'sms' | 'email' | 'whatsapp' | 'telegram';

  // Адрес регистрации
  registrationAddress?: string;
  actualAddress?: string;          // Фактический адрес

  // Право собственности
  ownershipType: 'owner' | 'co_owner' | 'tenant' | 'representative';
  ownershipShare?: number;         // Доля %
  ownershipDocument?: string;      // Свидетельство/Выписка
  ownershipDocumentDate?: string;  // Дата документа
  ownershipDate?: string;          // Дата регистрации права

  // Банковские реквизиты
  bankName?: string;
  bankBik?: string;
  bankAccount?: string;

  // Связи
  apartmentIds: string[];          // Может владеть несколькими квартирами
  personalAccountIds: string[];

  // Статус
  isActive: boolean;
  isVerified: boolean;
  verifiedAt?: string;
  verifiedBy?: string;

  // Примечания
  notes?: string;
  tags: string[];

  createdAt: string;
  updatedAt: string;
}

// Проживающий (может отличаться от собственника)
export interface Resident {
  id: string;
  apartmentId: string;
  ownerId?: string;                // Связь с собственником, если есть

  // Данные
  lastName: string;
  firstName: string;
  middleName?: string;
  fullName: string;
  birthDate?: string;

  // Тип проживания
  residentType: 'owner' | 'family_member' | 'tenant' | 'registered' | 'temporary';
  relationToOwner?: string;        // Родство с собственником

  // Регистрация
  registrationType: 'permanent' | 'temporary' | 'none';
  registrationDate?: string;
  registrationEndDate?: string;

  // Контакты
  phone?: string;
  additionalPhone?: string;        // Дополнительный телефон
  email?: string;

  // Паспортные данные
  passportSeries?: string;
  passportNumber?: string;

  // Статус
  isActive: boolean;
  movedInDate?: string;
  movedOutDate?: string;
  movedOutReason?: string;

  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

// Лицевой счет
export interface PersonalAccount {
  id: string;
  number: string;                  // Номер ЛС

  // Связи
  apartmentId: string;
  buildingId: string;
  primaryOwnerId: string;

  // Данные
  ownerName: string;
  apartmentNumber: string;
  address: string;

  // Площади для расчета
  totalArea: number;
  heatedArea?: number;
  residentsCount: number;
  registeredCount: number;

  // Финансы
  balance: number;                 // Текущий баланс (+ переплата, - долг)
  currentDebt: number;
  penaltyAmount: number;
  lastPaymentDate?: string;
  lastPaymentAmount?: number;
  lastChargeDate?: string;         // Дата последнего начисления
  lastChargeAmount?: number;       // Сумма последнего начисления

  // Льготы
  hasSubsidy: boolean;
  subsidyAmount?: number;
  subsidyPercent?: number;         // Процент субсидии
  subsidyEndDate?: string;
  hasDiscount: boolean;
  discountPercent?: number;
  discountReason?: string;

  // Статус
  status: 'active' | 'closed' | 'blocked' | 'archived';
  blockReason?: string;
  closedAt?: string;               // Дата закрытия
  closedReason?: string;           // Причина закрытия

  // Тарифный план
  tariffPlanId?: string;

  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// ФИНАНСЫ И БИЛЛИНГ
// ============================================

// Услуга ЖКХ
export interface Service {
  id: string;
  code: string;                    // Код услуги
  name: string;
  shortName: string;
  category: 'housing' | 'utility' | 'additional' | 'repair' | 'other';
  unit: 'sqm' | 'person' | 'apartment' | 'kwh' | 'cbm' | 'gcal' | 'fixed';

  // Настройки
  isMetered: boolean;              // По счетчику
  isActive: boolean;
  sortOrder: number;
}

// Тариф
export interface Tariff {
  id: string;
  serviceId: string;
  serviceName: string;
  buildingId?: string;             // null = для всех домов

  // Ставки
  rate: number;                    // Основная ставка
  ratePer: 'sqm' | 'person' | 'apartment' | 'unit';
  normative?: number;              // Норматив потребления
  normativeUnit?: string;

  // Дифференциация
  hasDayNightRates: boolean;
  dayRate?: number;
  nightRate?: number;

  // Период действия
  effectiveFrom: string;
  effectiveTo?: string;

  // НДС
  includesVat: boolean;
  vatRate: number;

  createdAt: string;
  createdBy: string;
}

// Начисление
export interface Charge {
  id: string;
  personalAccountId: string;
  apartmentId: string;
  buildingId: string;

  // Период
  period: string;                  // YYYY-MM

  // Услуга
  serviceId: string;
  serviceName: string;
  tariffId: string;

  // Расчет
  quantity: number;                // Объем (площадь/кол-во/показания)
  rate: number;                    // Тариф
  amount: number;                  // Сумма без льгот
  subsidyAmount: number;           // Сумма субсидии
  discountAmount: number;          // Скидка
  recalculationAmount: number;     // Перерасчет
  penaltyAmount: number;           // Пени
  totalAmount: number;             // Итого к оплате

  // Показания счетчика
  meterReadingId?: string;
  previousReading?: number;
  currentReading?: number;
  consumption?: number;

  // Статус
  status: 'draft' | 'calculated' | 'approved' | 'billed' | 'paid' | 'partially_paid';

  calculatedAt: string;
  calculatedBy: string;
  approvedAt?: string;
  approvedBy?: string;
}

// Квитанция (ЕПД)
export interface Invoice {
  id: string;
  number: string;
  personalAccountId: string;

  // Период
  period: string;
  dueDate: string;

  // Суммы
  previousBalance: number;
  totalCharges: number;
  totalPayments: number;
  currentBalance: number;
  amountDue: number;

  // Детализация
  charges: Charge[];

  // Статус
  status: 'draft' | 'sent' | 'viewed' | 'paid' | 'overdue' | 'cancelled';
  sentAt?: string;
  sentVia?: 'email' | 'sms' | 'post' | 'personal';
  viewedAt?: string;
  paidAt?: string;

  // QR-код для оплаты
  qrCode?: string;
  paymentUrl?: string;

  createdAt: string;
}

// Платеж
export interface Payment {
  id: string;
  personalAccountId: string;
  invoiceId?: string;

  // Сумма
  amount: number;

  // Источник
  source: 'bank' | 'card' | 'cash' | 'terminal' | 'online' | 'mobile' | 'auto';
  transactionId?: string;
  bankName?: string;
  payerName?: string;

  // Распределение по услугам
  distribution: {
    chargeId: string;
    serviceId: string;
    amount: number;
  }[];

  // Статус
  status: 'pending' | 'completed' | 'failed' | 'refunded' | 'cancelled';

  paymentDate: string;
  processedAt?: string;
  processedBy?: string;

  notes?: string;
}

// Акт сверки
export interface ReconciliationAct {
  id: string;
  number: string;
  personalAccountId: string;
  ownerName: string;

  // Период
  periodFrom: string;
  periodTo: string;

  // Суммы
  openingBalance: number;
  totalCharges: number;
  totalPayments: number;
  closingBalance: number;

  // Детализация
  items: {
    date: string;
    description: string;
    debit: number;
    credit: number;
    balance: number;
  }[];

  // Статус
  status: 'draft' | 'sent' | 'confirmed' | 'disputed';

  createdAt: string;
  createdBy: string;
  sentAt?: string;
  confirmedAt?: string;
}

// Претензия (для работы с дебиторкой)
export interface DebtClaim {
  id: string;
  number: string;
  personalAccountId: string;
  ownerId: string;

  // Задолженность
  debtAmount: number;
  penaltyAmount: number;
  totalAmount: number;
  debtPeriods: string[];           // Периоды задолженности

  // Этапы работы
  stage: 'reminder' | 'warning' | 'pretrial' | 'court' | 'enforcement' | 'restructured' | 'written_off';

  // История действий
  actions: {
    date: string;
    type: 'sms' | 'call' | 'letter' | 'visit' | 'meeting' | 'agreement' | 'court_filing';
    description: string;
    result?: string;
    performedBy: string;
    documents?: string[];
  }[];

  // Реструктуризация
  hasRestructuring: boolean;
  restructuringSchedule?: {
    date: string;
    amount: number;
    isPaid: boolean;
  }[];

  // Статус
  status: 'active' | 'resolved' | 'court' | 'closed';
  closedReason?: string;

  assignedTo?: string;

  createdAt: string;
  updatedAt: string;
}

// ============================================
// WORKFORCE - УПРАВЛЕНИЕ РАБОТАМИ
// ============================================

// Типы работ
export type WorkType =
  | 'scheduled_maintenance'      // Плановое ТО
  | 'seasonal_inspection'        // Сезонный осмотр
  | 'emergency_repair'           // Аварийный ремонт
  | 'current_repair'             // Текущий ремонт
  | 'capital_repair'             // Капитальный ремонт
  | 'cleaning'                   // Уборка
  | 'landscaping'                // Благоустройство
  | 'meter_inspection'           // Поверка счетчиков
  | 'deratization'               // Дератизация
  | 'disinfection'               // Дезинфекция
  | 'fire_safety'                // Пожарная безопасность
  | 'elevator_maintenance'       // Обслуживание лифтов
  | 'itp_maintenance'            // Обслуживание ИТП
  | 'other';

// План-график работ
export interface WorkSchedule {
  id: string;
  name: string;
  description?: string;

  // Тип и категория
  workType: WorkType;
  category: ExecutorSpecialization;

  // Объекты
  buildingIds: string[];           // Для каких домов
  scope: 'building' | 'entrance' | 'apartment' | 'common_area' | 'territory';

  // Расписание
  scheduleType: 'once' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';
  startDate: string;
  endDate?: string;
  recurrenceRule?: string;         // RRULE format
  plannedDates: string[];          // Конкретные даты

  // Ресурсы
  estimatedDuration: number;       // Минуты
  requiredWorkers: number;
  assignedTeamId?: string;
  assignedExecutorIds: string[];

  // Материалы
  requiredMaterials: {
    materialId: string;
    quantity: number;
  }[];
  estimatedCost: number;

  // Чек-лист
  checklistTemplateId?: string;

  // Статус
  isActive: boolean;
  isPaused: boolean;
  pauseReason?: string;

  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

// Наряд/Заказ работ
export interface WorkOrder {
  id: string;
  number: string;

  // Источник
  source: 'schedule' | 'request' | 'emergency' | 'inspection' | 'manual';
  scheduleId?: string;
  requestId?: string;
  emergencyId?: string;

  // Описание
  workType: WorkType;
  category: ExecutorSpecialization;
  title: string;
  description: string;

  // Объект
  buildingId: string;
  buildingAddress: string;
  entranceId?: string;
  apartmentId?: string;
  location: string;                // Конкретное место

  // Время
  plannedStartDate: string;
  plannedEndDate: string;
  actualStartDate?: string;
  actualEndDate?: string;

  // Исполнители
  assignedTeamId?: string;
  assignedExecutorIds: string[];
  primaryExecutorId?: string;

  // Материалы
  plannedMaterials: {
    materialId: string;
    materialName: string;
    quantity: number;
    unit: string;
    unitCost: number;
    totalCost: number;
  }[];
  actualMaterials: {
    materialId: string;
    materialName: string;
    quantity: number;
    unit: string;
    unitCost: number;
    totalCost: number;
    warehouseId: string;
  }[];

  // Трудозатраты
  plannedLabor: number;            // Человеко-часы
  actualLabor: number;
  laborCost: number;

  // Стоимость
  estimatedCost: number;
  actualCost: number;

  // Чек-лист
  checklist: ChecklistItem[];
  checklistCompletedAt?: string;

  // Фото
  photosBefore: WorkPhoto[];
  photosAfter: WorkPhoto[];
  photosProcess: WorkPhoto[];

  // Подписи
  executorSignature?: string;
  residentSignature?: string;
  managerSignature?: string;

  // Статус
  status: 'draft' | 'planned' | 'assigned' | 'in_progress' | 'paused' | 'completed' | 'verified' | 'cancelled';
  priority: 'low' | 'normal' | 'high' | 'urgent';

  // Отклонение/Отмена
  cancelledAt?: string;
  cancelledBy?: string;
  cancelReason?: string;

  // Оценка
  rating?: number;
  feedback?: string;

  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

// Пункт чек-листа
export interface ChecklistItem {
  id: string;
  order: number;
  title: string;
  description?: string;
  isRequired: boolean;
  isCompleted: boolean;
  completedAt?: string;
  completedBy?: string;
  notes?: string;
  photoRequired: boolean;
  photoId?: string;
}

// Фото работ
export interface WorkPhoto {
  id: string;
  workOrderId: string;
  type: 'before' | 'after' | 'process' | 'defect' | 'materials';
  url: string;
  thumbnailUrl: string;
  takenAt: string;
  takenBy: string;
  geoLocation?: {
    latitude: number;
    longitude: number;
  };
  notes?: string;
}

// Шаблон чек-листа
export interface ChecklistTemplate {
  id: string;
  name: string;
  workType: WorkType;
  category: ExecutorSpecialization;
  items: {
    order: number;
    title: string;
    description?: string;
    isRequired: boolean;
    photoRequired: boolean;
  }[];
  isActive: boolean;
  createdAt: string;
  createdBy: string;
}

// ============================================
// СКЛАД И МАТЕРИАЛЫ
// ============================================

// Склад
export interface Warehouse {
  id: string;
  name: string;
  address: string;
  type: 'main' | 'building' | 'mobile';
  buildingId?: string;
  responsibleId: string;
  responsibleName: string;
  isActive: boolean;
}

// Материал
export interface Material {
  id: string;
  code: string;
  name: string;
  category: string;
  unit: string;

  // Цены
  averageCost: number;
  lastPurchasePrice: number;

  // Остатки
  totalQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  minQuantity: number;             // Минимальный остаток

  // Характеристики
  manufacturer?: string;
  specifications?: string;
  shelfLife?: number;              // Срок годности в днях

  isActive: boolean;
}

// Остаток материала на складе
export interface StockItem {
  id: string;
  warehouseId: string;
  materialId: string;
  quantity: number;
  reservedQuantity: number;
  lotNumber?: string;
  expirationDate?: string;
  location?: string;               // Ячейка/полка
  lastMovementAt: string;
}

// Движение материала
export interface StockMovement {
  id: string;
  warehouseId: string;
  materialId: string;

  type: 'receipt' | 'issue' | 'transfer' | 'write_off' | 'inventory' | 'return';
  quantity: number;

  // Связи
  workOrderId?: string;
  purchaseOrderId?: string;
  transferFromWarehouseId?: string;

  // Данные
  unitCost: number;
  totalCost: number;
  lotNumber?: string;

  // Подтверждение
  performedBy: string;
  performedAt: string;
  approvedBy?: string;
  approvedAt?: string;

  notes?: string;
}

// ============================================
// АВАРИЙНО-ДИСПЕТЧЕРСКАЯ СЛУЖБА
// ============================================

// Тип аварии
export type EmergencyType =
  | 'water_leak'                 // Течь воды
  | 'water_main_break'           // Порыв водопровода
  | 'sewage_backup'              // Засор канализации
  | 'no_water'                   // Нет воды
  | 'no_hot_water'               // Нет горячей воды
  | 'power_outage'               // Отключение электричества
  | 'electrical_short'           // Короткое замыкание
  | 'gas_leak'                   // Утечка газа
  | 'elevator_stuck'             // Застряли в лифте
  | 'elevator_malfunction'       // Неисправность лифта
  | 'heating_failure'            // Авария отопления
  | 'fire'                       // Пожар
  | 'flooding'                   // Затопление
  | 'roof_leak'                  // Течь крыши
  | 'door_lock_failure'          // Не открывается дверь
  | 'intercom_failure'           // Не работает домофон
  | 'other';

// Аварийная заявка
export interface EmergencyRequest {
  id: string;
  number: string;

  // Тип и приоритет
  emergencyType: EmergencyType;
  severity: 'low' | 'medium' | 'high' | 'critical';

  // Описание
  title: string;
  description: string;

  // Объект
  buildingId: string;
  buildingAddress: string;
  entranceId?: string;
  apartmentId?: string;
  apartmentNumber?: string;
  floor?: number;
  location: string;

  // Заявитель
  reporterId?: string;
  reporterName: string;
  reporterPhone: string;
  reporterType: 'resident' | 'employee' | 'security' | 'anonymous' | 'auto';

  // Прием заявки
  receivedAt: string;
  receivedBy: string;
  receivedVia: 'phone' | 'app' | 'web' | 'sms' | 'intercom' | 'auto';

  // Реагирование
  dispatchedAt?: string;
  dispatchedBy?: string;
  assignedTeamId?: string;
  assignedExecutorIds: string[];

  // Время прибытия
  estimatedArrival?: string;
  actualArrival?: string;

  // Выполнение
  workStartedAt?: string;
  workCompletedAt?: string;

  // Результат
  resolution?: string;
  workOrderId?: string;
  requiresFollowUp: boolean;
  followUpWorkOrderId?: string;

  // Чек-лист по сценарию
  scenarioChecklist: {
    step: string;
    isCompleted: boolean;
    completedAt?: string;
    notes?: string;
  }[];

  // Статус
  status: 'received' | 'dispatched' | 'en_route' | 'on_site' | 'in_progress' | 'completed' | 'cancelled' | 'false_alarm';

  // Анализ
  causeCategory?: string;
  rootCause?: string;
  preventionMeasures?: string;

  // Фото/документы
  photos: string[];
  documents: string[];

  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  closedBy?: string;
}

// Сценарий реагирования
export interface EmergencyScenario {
  id: string;
  emergencyType: EmergencyType;
  name: string;
  description: string;

  // Чек-лист действий
  steps: {
    order: number;
    action: string;
    description: string;
    isRequired: boolean;
    timeLimit?: number;            // Минуты
  }[];

  // Уведомления
  notifications: {
    role: UserRole;
    channel: 'sms' | 'push' | 'call' | 'email';
    template: string;
    delayMinutes: number;
  }[];

  // SLA
  responseTimeMinutes: number;
  resolutionTimeMinutes: number;

  isActive: boolean;
}

// ============================================
// КОНТРОЛЬ КАЧЕСТВА И KPI
// ============================================

// KPI метрика
export interface KPIMetric {
  id: string;
  code: string;
  name: string;
  description: string;

  // Тип и расчет
  type: 'time' | 'percentage' | 'count' | 'rating' | 'money';
  aggregation: 'avg' | 'sum' | 'min' | 'max' | 'count' | 'latest';
  formula?: string;

  // Целевые значения
  targetValue: number;
  warningThreshold: number;
  criticalThreshold: number;
  isHigherBetter: boolean;

  // Группировка
  category: 'response' | 'resolution' | 'quality' | 'financial' | 'satisfaction';
  applicableTo: 'executor' | 'team' | 'building' | 'company';

  isActive: boolean;
}

// Значение KPI
export interface KPIValue {
  id: string;
  metricId: string;

  // Период
  period: string;                  // YYYY-MM или YYYY-WW
  periodType: 'day' | 'week' | 'month' | 'quarter' | 'year';

  // Субъект
  subjectType: 'executor' | 'team' | 'building' | 'company';
  subjectId: string;
  subjectName: string;

  // Значение
  value: number;
  targetValue: number;
  previousValue?: number;

  // Статус
  status: 'green' | 'yellow' | 'red';
  trend: 'up' | 'down' | 'stable';

  calculatedAt: string;
}

// Причина просрочки/проблемы
export interface DelayReason {
  id: string;
  requestId?: string;
  workOrderId?: string;

  category: 'no_access' | 'no_materials' | 'wrong_category' | 'overload' | 'waiting_approval' | 'external' | 'other';
  description: string;

  delayMinutes: number;

  reportedBy: string;
  reportedAt: string;

  isResolved: boolean;
  resolution?: string;
  resolvedAt?: string;
}

// Жалоба/Претензия по качеству
export interface QualityComplaint {
  id: string;
  number: string;

  // Источник
  relatedTo: 'request' | 'work_order' | 'service' | 'employee' | 'other';
  relatedId?: string;

  // Заявитель
  complainantId: string;
  complainantName: string;
  complainantPhone: string;

  // Суть
  category: 'quality' | 'timeliness' | 'behavior' | 'damage' | 'billing' | 'other';
  description: string;

  // Обработка
  assignedTo?: string;
  investigation?: string;
  resolution?: string;

  // Компенсация
  compensationType?: 'none' | 'refund' | 'discount' | 'free_service' | 'other';
  compensationAmount?: number;
  compensationDescription?: string;

  // Статус
  status: 'new' | 'investigating' | 'resolved' | 'rejected' | 'escalated';
  priority: 'low' | 'normal' | 'high';

  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

// ============================================
// РОЛИ И ПРАВА ДОСТУПА
// ============================================

// Расширенные роли
export type ExtendedUserRole =
  | 'super_admin'                // Супер-админ (полный доступ)
  | 'admin'                      // Администратор УК
  | 'director'                   // Директор
  | 'accountant'                 // Бухгалтер
  | 'chief_engineer'             // Главный инженер
  | 'dispatcher'                 // Диспетчер
  | 'manager'                    // Менеджер по работе с жителями
  | 'foreman'                    // Мастер/бригадир
  | 'executor'                   // Исполнитель
  | 'resident'                   // Житель
  | 'owner_representative';      // Представитель собственника

// Разрешение
export interface Permission {
  id: string;
  code: string;
  name: string;
  description: string;
  module: 'crm' | 'requests' | 'workforce' | 'finance' | 'emergency' | 'reports' | 'settings' | 'audit';
  action: 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'export' | 'manage';
}

// Роль с правами
export interface Role {
  id: string;
  code: ExtendedUserRole;
  name: string;
  description: string;

  permissions: string[];           // Permission IDs

  // Ограничения по объектам
  buildingScope: 'all' | 'assigned' | 'none';
  canViewFinancials: boolean;
  canViewPersonalData: boolean;
  canExportData: boolean;

  isSystem: boolean;               // Системная роль (нельзя удалить)
  isActive: boolean;

  createdAt: string;
  updatedAt: string;
}

// Лог аудита (расширенный)
export interface AuditLog {
  id: string;

  // Кто
  userId: string;
  userName: string;
  userRole: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;

  // Что
  action: 'create' | 'read' | 'update' | 'delete' | 'login' | 'logout' | 'export' | 'approve' | 'reject' | 'assign' | 'other';
  module: string;
  entityType: string;
  entityId: string;
  entityName?: string;

  // Детали изменений
  previousValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  changedFields?: string[];

  // Результат
  status: 'success' | 'failure' | 'partial';
  errorMessage?: string;

  // Контекст
  buildingId?: string;
  requestId?: string;

  timestamp: string;
}

// ============================================
// ЛЕЙБЛЫ ДЛЯ НОВЫХ ТИПОВ
// ============================================

export const WORK_TYPE_LABELS: Record<WorkType, string> = {
  scheduled_maintenance: 'Плановое ТО',
  seasonal_inspection: 'Сезонный осмотр',
  emergency_repair: 'Аварийный ремонт',
  current_repair: 'Текущий ремонт',
  capital_repair: 'Капитальный ремонт',
  cleaning: 'Уборка',
  landscaping: 'Благоустройство',
  meter_inspection: 'Поверка счетчиков',
  deratization: 'Дератизация',
  disinfection: 'Дезинфекция',
  fire_safety: 'Пожарная безопасность',
  elevator_maintenance: 'Обслуживание лифтов',
  itp_maintenance: 'Обслуживание ИТП',
  other: 'Другое'
};

export const EMERGENCY_TYPE_LABELS: Record<EmergencyType, string> = {
  water_leak: 'Течь воды',
  water_main_break: 'Порыв водопровода',
  sewage_backup: 'Засор канализации',
  no_water: 'Нет воды',
  no_hot_water: 'Нет горячей воды',
  power_outage: 'Отключение электричества',
  electrical_short: 'Короткое замыкание',
  gas_leak: 'Утечка газа',
  elevator_stuck: 'Застряли в лифте',
  elevator_malfunction: 'Неисправность лифта',
  heating_failure: 'Авария отопления',
  fire: 'Пожар',
  flooding: 'Затопление',
  roof_leak: 'Течь крыши',
  door_lock_failure: 'Не открывается дверь',
  intercom_failure: 'Не работает домофон',
  other: 'Другое'
};

export const ROLE_LABELS: Record<ExtendedUserRole, string> = {
  super_admin: 'Супер-администратор',
  admin: 'Администратор',
  director: 'Директор',
  accountant: 'Бухгалтер',
  chief_engineer: 'Главный инженер',
  dispatcher: 'Диспетчер',
  manager: 'Менеджер',
  foreman: 'Мастер',
  executor: 'Исполнитель',
  resident: 'Житель',
  owner_representative: 'Представитель собственника'
};

export const BUILDING_TYPE_LABELS: Record<BuildingFull['buildingType'], string> = {
  panel: 'Панельный',
  brick: 'Кирпичный',
  monolith: 'Монолитный',
  block: 'Блочный',
  wooden: 'Деревянный',
  mixed: 'Смешанный'
};

export const SERVICE_CATEGORY_LABELS: Record<Service['category'], string> = {
  housing: 'Жилищные услуги',
  utility: 'Коммунальные услуги',
  additional: 'Дополнительные услуги',
  repair: 'Ремонтные работы',
  other: 'Прочее'
};

export const DEBT_STAGE_LABELS: Record<DebtClaim['stage'], string> = {
  reminder: 'Напоминание',
  warning: 'Предупреждение',
  pretrial: 'Досудебная претензия',
  court: 'Судебное взыскание',
  enforcement: 'Исполнительное производство',
  restructured: 'Реструктуризация',
  written_off: 'Списано'
};

// ============================================
// СИСТЕМА ТРЕНИНГОВ
// ============================================

// Статус предложения тренинга
export type TrainingProposalStatus =
  | 'voting'        // Голосование открыто
  | 'review'        // Рассмотрение (набран порог)
  | 'approved'      // Одобрено партнёром
  | 'scheduled'     // Назначено время
  | 'completed'     // Проведено
  | 'rejected';     // Отклонено

// Формат тренинга
export type TrainingFormat = 'online' | 'offline' | 'any';

// Удобное время
export type TrainingTimeSlot = 'morning' | 'afternoon' | 'evening' | 'weekend';

// Готовность участвовать
export type ParticipationIntent = 'definitely' | 'maybe' | 'support_only';

// Партнёр (лектор)
export interface Partner {
  id: string;
  name: string;
  position: string;
  specialization?: string;
  email?: string;
  phone?: string;
  bio?: string;
  avatar?: string;
  avatarUrl?: string;
  isActive: boolean;
  trainingsСonducted?: number;
  averageRating?: number;
}

// Голос за предложение тренинга
export interface TrainingVote {
  id: string;
  proposalId: string;
  voterId: string;
  voterName: string;
  participationIntent: ParticipationIntent;
  isAnonymous: boolean;
  votedAt: string;
}

// Предложение тренинга
export interface TrainingProposal {
  id: string;

  // Основная информация
  topic: string;
  description?: string;

  // Автор
  authorId: string;
  authorName: string;
  isAuthorAnonymous: boolean;

  // Параметры
  partnerId: string;
  partnerName: string;
  format: TrainingFormat;
  preferredTimeSlots: TrainingTimeSlot[];

  // Голоса
  votes: TrainingVote[];
  voteThreshold: number; // Порог для уведомления

  // Статус
  status: TrainingProposalStatus;
  partnerResponse?: 'accepted' | 'rejected';
  partnerResponseAt?: string;
  partnerResponseNote?: string;

  // Назначенный тренинг
  scheduledDate?: string;
  scheduledTime?: string;
  scheduledLocation?: string;
  scheduledLink?: string; // Для онлайн

  // Записавшиеся
  maxParticipants?: number;
  registeredParticipants?: string[];

  // Отзывы
  feedback?: TrainingFeedback[];

  // Мета
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  actualParticipantsCount?: number;

  // Computed fields from API
  voteCount?: number;
  registeredCount?: number;
}

// Отзыв о тренинге
export interface TrainingFeedback {
  id: string;
  proposalId: string;
  reviewerId: string;
  reviewerName: string;
  isAnonymous: boolean;
  rating: number; // 1-5
  contentRating?: number;
  presenterRating?: number;
  usefulnessRating?: number;
  comment?: string;
  createdAt: string;
}

// Уведомление о тренинге
export interface TrainingNotification {
  id: string;
  type:
    | 'new_proposal'           // Новое предложение
    | 'threshold_reached'      // Достигнут порог голосов
    | 'partner_response'       // Ответ партнёра
    | 'training_scheduled'     // Назначена дата
    | 'reminder_day_before'    // Напоминание за день
    | 'reminder_hour_before'   // Напоминание за час
    | 'feedback_request';      // Запрос отзыва
  proposalId: string;
  recipientId: string;
  recipientRole: 'employee' | 'partner' | 'admin';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

// Настройки системы тренингов
export interface TrainingSettings {
  voteThreshold: number;           // Порог голосов для уведомления (по умолчанию 5)
  allowAnonymousProposals: boolean;
  allowAnonymousVotes: boolean;
  allowAnonymousFeedback: boolean;
  notifyAllOnNewProposal: boolean;
  autoCloseAfterDays?: number;     // Автозакрытие неактивных предложений
}

// Метки для UI
export const TRAINING_STATUS_LABELS: Record<TrainingProposalStatus, { label: string; labelUz: string; color: string }> = {
  voting: { label: 'Голосование', labelUz: 'Ovoz berish', color: 'blue' },
  review: { label: 'Рассмотрение', labelUz: 'Ko\'rib chiqish', color: 'yellow' },
  approved: { label: 'Одобрено', labelUz: 'Tasdiqlangan', color: 'green' },
  scheduled: { label: 'Назначено', labelUz: 'Belgilangan', color: 'purple' },
  completed: { label: 'Проведено', labelUz: 'O\'tkazildi', color: 'gray' },
  rejected: { label: 'Отклонено', labelUz: 'Rad etilgan', color: 'red' },
};

export const TRAINING_FORMAT_LABELS: Record<TrainingFormat, { label: string; labelUz: string }> = {
  online: { label: 'Онлайн', labelUz: 'Onlayn' },
  offline: { label: 'Офлайн', labelUz: 'Oflayn' },
  any: { label: 'Неважно', labelUz: 'Farqi yo\'q' },
};

export const TRAINING_TIME_LABELS: Record<TrainingTimeSlot, { label: string; labelUz: string }> = {
  morning: { label: 'Утро', labelUz: 'Ertalab' },
  afternoon: { label: 'День', labelUz: 'Kunduzi' },
  evening: { label: 'Вечер', labelUz: 'Kechqurun' },
  weekend: { label: 'Выходные', labelUz: 'Dam olish kuni' },
};

export const PARTICIPATION_LABELS: Record<ParticipationIntent, { label: string; labelUz: string }> = {
  definitely: { label: 'Обязательно приду', labelUz: 'Albatta kelaman' },
  maybe: { label: 'Возможно приду', labelUz: 'Balki kelaman' },
  support_only: { label: 'Просто поддерживаю', labelUz: 'Faqat qo\'llab-quvvatlayman' },
};

// ============================================
// VEHICLES MODULE - Автомобили жителей
// ============================================

export type VehicleType = 'car' | 'motorcycle' | 'truck' | 'other';
export type VehicleOwnerType = 'individual' | 'legal_entity' | 'service';

export interface Vehicle {
  id: string;
  ownerId: string;           // ID жителя или менеджера (для служебных)
  ownerName: string;
  ownerPhone: string;
  apartment: string;
  address: string;
  plateNumber: string;       // Номер авто (01A123BC)
  brand: string;             // Марка (Toyota, Chevrolet, etc)
  model: string;             // Модель (Camry, Nexia, etc)
  color: string;             // Цвет
  year?: number;             // Год выпуска
  type: VehicleType;
  ownerType: VehicleOwnerType; // Тип владельца: физлицо, юрлицо, служебный
  companyName?: string;      // Название компании (для юрлица/служебного)
  parkingSpot?: string;      // Номер парковочного места
  notes?: string;            // Примечания
  createdAt: string;
  updatedAt?: string;
}

export const VEHICLE_TYPE_LABELS: Record<VehicleType, { label: string; labelUz: string }> = {
  car: { label: 'Легковой автомобиль', labelUz: 'Yengil avtomobil' },
  motorcycle: { label: 'Мотоцикл', labelUz: 'Mototsikl' },
  truck: { label: 'Грузовик', labelUz: 'Yuk mashinasi' },
  other: { label: 'Другое', labelUz: 'Boshqa' },
};

export const VEHICLE_OWNER_TYPE_LABELS: Record<VehicleOwnerType, { label: string; labelUz: string; icon: string }> = {
  individual: { label: 'Физ. лицо', labelUz: 'Jismoniy shaxs', icon: '👤' },
  legal_entity: { label: 'Юр. лицо', labelUz: 'Yuridik shaxs', icon: '🏢' },
  service: { label: 'Служебный', labelUz: 'Xizmat', icon: '🚐' },
};

// ============================================
// GUEST QR ACCESS MODULE - QR-пропуска для гостей
// ============================================

// Тип посетителя
export type VisitorType = 'courier' | 'guest' | 'taxi' | 'other';

// Тип доступа (срок действия пропуска)
export type AccessType = 'single_use' | 'day' | 'week' | 'custom';

// Статус QR-пропуска
export type GuestAccessStatus = 'active' | 'expired' | 'used' | 'revoked';

// QR-пропуск для гостя
export interface GuestAccessCode {
  id: string;

  // Создатель (житель)
  residentId: string;
  residentName: string;
  residentPhone: string;
  residentApartment: string;
  residentAddress: string;

  // Данные посетителя
  visitorType: VisitorType;
  visitorName?: string;          // Имя гостя (необязательно для курьера/такси)
  visitorPhone?: string;         // Телефон (необязательно)
  visitorVehiclePlate?: string;  // Номер авто посетителя (для такси)

  // Параметры доступа
  accessType: AccessType;
  validFrom: string;             // ISO datetime - начало действия
  validUntil: string;            // ISO datetime - окончание действия
  maxUses: number;               // Макс. количество использований (1 для single_use)
  currentUses: number;           // Текущее количество использований

  // QR-код
  qrToken: string;               // Уникальный токен для QR (UUID + подпись)
  qrImageUrl?: string;           // URL сгенерированного QR изображения

  // Статус
  status: GuestAccessStatus;

  // Причина отзыва (если revoked)
  revokedAt?: string;
  revokedBy?: string;
  revokedByName?: string;
  revokedByRole?: UserRole;
  revocationReason?: string;

  // Примечание от жителя
  notes?: string;

  // Мета
  createdAt: string;
  updatedAt?: string;
  lastUsedAt?: string;

  // Информация о создателе (для management view)
  creatorName?: string;
  creatorApartment?: string;
  creatorPhone?: string;
}

// Лог использования QR-пропуска
export interface GuestAccessLog {
  id: string;
  accessCodeId: string;

  // Кто сканировал
  scannedById: string;
  scannedByName: string;
  scannedByRole: UserRole;       // security, manager, admin

  // Результат сканирования
  action: 'scan_success' | 'scan_expired' | 'scan_used' | 'scan_revoked' | 'scan_invalid' | 'entry_allowed' | 'entry_denied';

  // Данные на момент сканирования
  visitorType: VisitorType;
  residentName: string;
  residentApartment: string;

  // Дополнительно
  notes?: string;

  // Геолокация сканирования (опционально)
  geoLocation?: {
    latitude: number;
    longitude: number;
  };

  // Мета
  timestamp: string;
}

// Статистика гостевых пропусков для дашборда
export interface GuestAccessStats {
  totalActive: number;           // Активных пропусков
  totalUsedToday: number;        // Использовано сегодня
  totalCreatedToday: number;     // Создано сегодня
  byVisitorType: {
    courier: number;
    guest: number;
    taxi: number;
    other: number;
  };
  recentScans: GuestAccessLog[]; // Последние сканирования
}

// Лимиты для жителей
export interface GuestAccessLimits {
  maxActivePerResident: number;  // Макс. активных пропусков на жителя
  maxDayPassDuration: number;    // Макс. длительность дневного пропуска (часы)
  maxWeekPassDuration: number;   // Макс. длительность недельного пропуска (дни)
  maxCustomDuration: number;     // Макс. длительность кастомного пропуска (дни)
  allowVehiclePlate: boolean;    // Разрешить указывать номер авто
}

// Метки для UI
export const VISITOR_TYPE_LABELS: Record<VisitorType, { label: string; labelUz: string; icon: string }> = {
  courier: { label: 'Курьер', labelUz: 'Kuryer', icon: '📦' },
  guest: { label: 'Гость', labelUz: 'Mehmon', icon: '👥' },
  taxi: { label: 'Такси', labelUz: 'Taksi', icon: '🚕' },
  other: { label: 'Другое', labelUz: 'Boshqa', icon: '👤' },
};

export const ACCESS_TYPE_LABELS: Record<AccessType, { label: string; labelUz: string; description: string; descriptionUz: string }> = {
  single_use: {
    label: 'Одноразовый',
    labelUz: 'Bir martalik',
    description: 'Действует до первого использования',
    descriptionUz: 'Birinchi foydalanishgacha amal qiladi'
  },
  day: {
    label: 'На день',
    labelUz: 'Kunlik',
    description: 'Действует до конца дня',
    descriptionUz: 'Kun oxirigacha amal qiladi'
  },
  week: {
    label: 'На неделю',
    labelUz: 'Haftalik',
    description: 'Действует 7 дней',
    descriptionUz: '7 kun amal qiladi'
  },
  custom: {
    label: 'Свой срок',
    labelUz: 'Maxsus muddat',
    description: 'Укажите период действия',
    descriptionUz: 'Amal qilish muddatini belgilang'
  },
};

export const GUEST_ACCESS_STATUS_LABELS: Record<GuestAccessStatus, { label: string; labelUz: string; color: string }> = {
  active: { label: 'Активен', labelUz: 'Faol', color: 'green' },
  expired: { label: 'Истёк', labelUz: 'Muddati tugagan', color: 'gray' },
  used: { label: 'Использован', labelUz: 'Ishlatilgan', color: 'blue' },
  revoked: { label: 'Отменён', labelUz: 'Bekor qilingan', color: 'red' },
};

export const GUEST_ACCESS_LOG_ACTION_LABELS: Record<GuestAccessLog['action'], { label: string; labelUz: string; color: string }> = {
  scan_success: { label: 'Успешное сканирование', labelUz: 'Muvaffaqiyatli skanerlash', color: 'green' },
  scan_expired: { label: 'Пропуск истёк', labelUz: 'Ruxsatnoma muddati tugagan', color: 'orange' },
  scan_used: { label: 'Пропуск уже использован', labelUz: 'Ruxsatnoma ishlatilgan', color: 'yellow' },
  scan_revoked: { label: 'Пропуск отменён', labelUz: 'Ruxsatnoma bekor qilingan', color: 'red' },
  scan_invalid: { label: 'Недействительный QR', labelUz: 'Noto\'g\'ri QR', color: 'red' },
  entry_allowed: { label: 'Вход разрешён', labelUz: 'Kirish ruxsat etildi', color: 'green' },
  entry_denied: { label: 'Вход запрещён', labelUz: 'Kirish rad etildi', color: 'red' },
};

// ============================================
// RESCHEDULE/FEEDBACK SYSTEM - Перенос заявок
// ============================================

// Статус запроса на перенос
export type RescheduleRequestStatus = 'pending' | 'accepted' | 'rejected' | 'expired';

// Кто инициировал перенос
export type RescheduleInitiator = 'resident' | 'executor';

// Причина переноса
export type RescheduleReason =
  | 'busy_time'           // Занят в это время
  | 'emergency'           // Непредвиденные обстоятельства
  | 'not_at_home'         // Не буду дома
  | 'need_preparation'    // Нужно время на подготовку
  | 'other';              // Другое

// Запрос на перенос времени заявки
export interface RescheduleRequest {
  id: string;
  requestId: string;              // ID заявки
  requestNumber: number | string; // Номер заявки для отображения (может быть с префиксом, e.g. YS-1001)

  // Инициатор
  initiator: RescheduleInitiator;
  initiatorId: string;
  initiatorName: string;

  // Получатель (тот кто должен подтвердить)
  recipientId: string;
  recipientName: string;
  recipientRole: 'resident' | 'executor';

  // Текущее время заявки
  currentDate?: string;
  currentTime?: string;

  // Предложенное новое время
  proposedDate: string;
  proposedTime: string;

  // Причина переноса
  reason: RescheduleReason;
  reasonText?: string;            // Дополнительный комментарий

  // Статус
  status: RescheduleRequestStatus;

  // Ответ
  respondedAt?: string;
  responseNote?: string;          // Комментарий при принятии/отклонении

  // Мета
  createdAt: string;
  expiresAt: string;              // Запрос истекает через 24 часа
}

// Уведомление о переносе (добавляем новые типы)
export type RescheduleNotificationType =
  | 'reschedule_requested'        // Запрошен перенос
  | 'reschedule_accepted'         // Перенос принят
  | 'reschedule_rejected'         // Перенос отклонен
  | 'reschedule_expired';         // Запрос истёк

// Метки причин переноса
export const RESCHEDULE_REASON_LABELS: Record<RescheduleReason, { label: string; labelUz: string }> = {
  busy_time: { label: 'Занят в это время', labelUz: 'Bu vaqtda band' },
  emergency: { label: 'Непредвиденные обстоятельства', labelUz: 'Kutilmagan holat' },
  not_at_home: { label: 'Не буду дома', labelUz: 'Uyda bo\'lmayman' },
  need_preparation: { label: 'Нужно время на подготовку', labelUz: 'Tayyorgarlik kerak' },
  other: { label: 'Другая причина', labelUz: 'Boshqa sabab' },
};

export const RESCHEDULE_STATUS_LABELS: Record<RescheduleRequestStatus, { label: string; labelUz: string; color: string }> = {
  pending: { label: 'Ожидает ответа', labelUz: 'Javob kutilmoqda', color: 'yellow' },
  accepted: { label: 'Принято', labelUz: 'Qabul qilindi', color: 'green' },
  rejected: { label: 'Отклонено', labelUz: 'Rad etildi', color: 'red' },
  expired: { label: 'Истёк срок', labelUz: 'Muddati tugadi', color: 'gray' },
};

// ============================================
// MARKETPLACE TYPES
// ============================================

export type MarketplaceOrderStatus =
  | 'new'           // Новый заказ
  | 'confirmed'     // Подтверждён
  | 'preparing'     // Готовится
  | 'ready'         // Готов к выдаче
  | 'delivering'    // Доставляется
  | 'delivered'     // Доставлен
  | 'cancelled';    // Отменён

export interface MarketplaceCategory {
  id: string;
  name: string;
  nameUz: string;
  icon: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}

export interface MarketplaceProduct {
  id: string;
  categoryId: string;
  categoryName?: string;
  categoryNameUz?: string;
  name: string;
  nameUz: string;
  description?: string;
  descriptionUz?: string;
  price: number;
  unit: string;        // шт, кг, литр, упаковка
  unitUz: string;
  image?: string;
  images?: string[];   // дополнительные фото
  stock: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceCartItem {
  id: string;
  productId: string;
  product?: MarketplaceProduct;
  quantity: number;
  addedAt: string;
}

export interface MarketplaceOrder {
  id: string;
  orderNumber: string;  // MKT-2024-00001
  residentId: string;
  residentName?: string;
  residentPhone?: string;
  residentAddress?: string;
  residentApartment?: string;
  status: MarketplaceOrderStatus;
  items: MarketplaceOrderItem[];
  totalAmount: number;
  itemsCount: number;
  deliveryNote?: string;
  rating?: number;
  feedback?: string;
  createdAt: string;
  confirmedAt?: string;
  preparingAt?: string;
  readyAt?: string;
  deliveringAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
}

export interface MarketplaceOrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName?: string;
  productNameUz?: string;
  productImage?: string;
  quantity: number;
  price: number;
  total: number;
}

export interface MarketplaceFavorite {
  id: string;
  productId: string;
  product?: MarketplaceProduct;
  addedAt: string;
}

export interface MarketplaceReview {
  id: string;
  productId: string;
  residentId: string;
  residentName?: string;
  orderId: string;
  rating: number;
  comment?: string;
  createdAt: string;
}

export const MARKETPLACE_ORDER_STATUS_LABELS: Record<MarketplaceOrderStatus, { label: string; labelUz: string; color: string }> = {
  new: { label: 'Новый', labelUz: 'Yangi', color: 'blue' },
  confirmed: { label: 'Подтверждён', labelUz: 'Tasdiqlandi', color: 'indigo' },
  preparing: { label: 'Готовится', labelUz: 'Tayyorlanmoqda', color: 'yellow' },
  ready: { label: 'Готов к выдаче', labelUz: 'Berishga tayyor', color: 'orange' },
  delivering: { label: 'Доставляется', labelUz: 'Yetkazilmoqda', color: 'purple' },
  delivered: { label: 'Доставлен', labelUz: 'Yetkazildi', color: 'green' },
  cancelled: { label: 'Отменён', labelUz: 'Bekor qilindi', color: 'red' },
};

export const MARKETPLACE_CATEGORY_ICONS: Record<string, string> = {
  groceries: '🛒',
  dairy: '🥛',
  meat: '🥩',
  bakery: '🍞',
  fruits: '🍎',
  vegetables: '🥬',
  beverages: '🥤',
  household: '🧹',
  personal: '🧴',
  baby: '👶',
  pets: '🐾',
  frozen: '❄️',
  snacks: '🍿',
};
