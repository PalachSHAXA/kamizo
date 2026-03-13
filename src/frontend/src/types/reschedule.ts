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
