import type { UserRole, ExecutorSpecialization, ContractType } from './common';

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
