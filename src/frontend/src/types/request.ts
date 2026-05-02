import type { UserRole, ExecutorSpecialization, RequestStatus, RequestPriority } from './common';

export type CancelledBy = 'resident' | 'executor' | 'manager' | 'admin';

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
  photos?: string[]; // фото от жителя — base64 data-URLs или (если есть R2) URL
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
  { id: 'gardener', name: 'Садовник', nameUz: 'Bog\'bon', icon: '🌿', description: 'Уход за растениями и территорией', descriptionUz: 'O\'simliklar va hududga parvarish' },
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
  gardener: 'Садовник',
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
  gardener: 'Bog\'bon',
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
