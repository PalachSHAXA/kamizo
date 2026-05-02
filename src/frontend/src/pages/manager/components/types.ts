import type { Request, Executor, RescheduleRequest, ExecutorSpecialization } from '../../../types';

export interface RequestCardProps {
  request: Request;
  onAssign: () => void;
  compact?: boolean;
}

export interface ExecutorCardProps {
  executor: Executor;
  onClick: () => void;
  onDelete: () => void;
  onStatusChange: (status: 'available' | 'busy' | 'offline') => void;
}

export interface AddExecutorModalProps {
  onClose: () => void;
  onAdd: (data: { name: string; phone: string; login: string; password: string; specialization: ExecutorSpecialization }) => void;
}

export interface AddResidentModalProps {
  onClose: () => void;
}

export interface ExecutorDetailsModalProps {
  executor: Executor;
  requests: Request[];
  onClose: () => void;
  onStatusChange: (status: 'available' | 'busy' | 'offline') => void;
  onDelete: () => void;
}

export interface RescheduleRequestCardProps {
  reschedule: RescheduleRequest;
  onClick: () => void;
}

export interface RescheduleHistoryCardProps {
  reschedule: RescheduleRequest;
}

export interface RescheduleDetailsModalProps {
  reschedule: RescheduleRequest;
  onClose: () => void;
}

export interface ManagerStats {
  newRequests: number;
  inProgress: number;
  completed: number;
  total: number;
  avgRating: number;
}

export interface ManagerChartData {
  weeklyData: Array<{ day: string; created: number; completed: number }>;
  statusData: Array<{ name: string; value: number; color: string }>;
}

export interface OverviewTabProps {
  stats: ManagerStats;
  chartData: ManagerChartData;
  categoryData: Array<{ name: string; value: number; color: string }>;
  pendingReschedules: RescheduleRequest[];
  recentReschedules: RescheduleRequest[];
  requests: Request[];
  onAssignRequest: (request: Request) => void;
  onSelectReschedule: (reschedule: RescheduleRequest) => void;
}

export interface ManagerRatingSummary {
  current?: {
    avg_overall?: number;
    avg_cleanliness?: number;
    avg_responsiveness?: number;
    avg_communication?: number;
    count?: number;
  };
  trend: number;
  monthly?: Array<{ period: string; avg_overall?: number; count?: number }>;
  recentComments?: Array<{ overall: number; comment: string; created_at?: string }>;
}

export interface RatingsTabProps {
  ratingSummary: ManagerRatingSummary | null;
  isLoadingRatings: boolean;
}

// Format request number - if it's already formatted (e.g., YS-L-1001 or #ABC123), don't add #
export const formatRequestNumber = (num: number | string): string => {
  if (typeof num === 'string') {
    // Already has prefix (YS-L-1001) or # symbol
    if (num.includes('-') || num.startsWith('#')) {
      return num;
    }
  }
  return `#${num}`;
};

// Category colors - consistent with ReportsPage
export const CATEGORY_COLORS: Record<string, string> = {
  plumber: '#3b82f6',      // blue
  electrician: '#f59e0b',   // amber/orange
  security: '#ef4444',      // red
  cleaning: '#10b981',      // green/emerald
  elevator: '#8b5cf6',      // purple/violet
  intercom: '#6366f1',      // indigo
  trash: '#d97706',         // amber darker
  locksmith: '#6b7280',     // gray
  other: '#ec4899',         // pink
};

// Available branches for the UK
export const BRANCHES = [
  { code: 'YS', name: 'Юнусабад' },
  { code: 'CH', name: 'Чиланзар' },
  { code: 'SG', name: 'Сергели' },
  { code: 'MR', name: 'Мирзо-Улугбек' },
  { code: 'YK', name: 'Яккасарай' },
  { code: 'SH', name: 'Шайхантаур' },
  { code: 'UC', name: 'Учтепа' },
  { code: 'BK', name: 'Бектемир' },
];
