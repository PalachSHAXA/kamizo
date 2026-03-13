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

// Labels
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
