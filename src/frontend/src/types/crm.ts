// ============================================
// CRM MODULE - Собственники и проживающие
// ============================================

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
