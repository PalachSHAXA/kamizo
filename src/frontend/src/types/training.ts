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
  trainingsConducted?: number;
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
