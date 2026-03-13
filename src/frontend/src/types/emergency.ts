import type { UserRole } from './common';

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

// Labels
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
