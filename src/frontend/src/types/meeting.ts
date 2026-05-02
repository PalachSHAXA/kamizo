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
  voteCount?: number;          // Aggregated vote count from API
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
  attachments?: Array<{ name: string; url: string; type: string; size?: number }>;
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
