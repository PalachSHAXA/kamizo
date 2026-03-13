// ============================================
// КОНТРОЛЬ КАЧЕСТВА И KPI
// ============================================

// KPI метрика
export interface KPIMetric {
  id: string;
  code: string;
  name: string;
  description: string;

  // Тип и расчет
  type: 'time' | 'percentage' | 'count' | 'rating' | 'money';
  aggregation: 'avg' | 'sum' | 'min' | 'max' | 'count' | 'latest';
  formula?: string;

  // Целевые значения
  targetValue: number;
  warningThreshold: number;
  criticalThreshold: number;
  isHigherBetter: boolean;

  // Группировка
  category: 'response' | 'resolution' | 'quality' | 'financial' | 'satisfaction';
  applicableTo: 'executor' | 'team' | 'building' | 'company';

  isActive: boolean;
}

// Значение KPI
export interface KPIValue {
  id: string;
  metricId: string;

  // Период
  period: string;                  // YYYY-MM или YYYY-WW
  periodType: 'day' | 'week' | 'month' | 'quarter' | 'year';

  // Субъект
  subjectType: 'executor' | 'team' | 'building' | 'company';
  subjectId: string;
  subjectName: string;

  // Значение
  value: number;
  targetValue: number;
  previousValue?: number;

  // Статус
  status: 'green' | 'yellow' | 'red';
  trend: 'up' | 'down' | 'stable';

  calculatedAt: string;
}

// Причина просрочки/проблемы
export interface DelayReason {
  id: string;
  requestId?: string;
  workOrderId?: string;

  category: 'no_access' | 'no_materials' | 'wrong_category' | 'overload' | 'waiting_approval' | 'external' | 'other';
  description: string;

  delayMinutes: number;

  reportedBy: string;
  reportedAt: string;

  isResolved: boolean;
  resolution?: string;
  resolvedAt?: string;
}

// Жалоба/Претензия по качеству
export interface QualityComplaint {
  id: string;
  number: string;

  // Источник
  relatedTo: 'request' | 'work_order' | 'service' | 'employee' | 'other';
  relatedId?: string;

  // Заявитель
  complainantId: string;
  complainantName: string;
  complainantPhone: string;

  // Суть
  category: 'quality' | 'timeliness' | 'behavior' | 'damage' | 'billing' | 'other';
  description: string;

  // Обработка
  assignedTo?: string;
  investigation?: string;
  resolution?: string;

  // Компенсация
  compensationType?: 'none' | 'refund' | 'discount' | 'free_service' | 'other';
  compensationAmount?: number;
  compensationDescription?: string;

  // Статус
  status: 'new' | 'investigating' | 'resolved' | 'rejected' | 'escalated';
  priority: 'low' | 'normal' | 'high';

  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}
