import type { UserRole } from './common';

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
