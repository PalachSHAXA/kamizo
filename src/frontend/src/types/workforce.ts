import type { ExecutorSpecialization } from './common';

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

// Labels
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
