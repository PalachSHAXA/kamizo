export interface TeamMember {
  id: string;
  name: string;
  phone: string;
  role: 'manager' | 'department_head' | 'executor';
  specialization?: string;
  status?: string;
  completed_count?: number;
  active_count?: number;
  avg_rating?: number;
}

export interface RatingSummaryData {
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toNumber = (value: unknown): number | undefined => {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) ? number : undefined;
};

export function parseRatingSummary(value: unknown): RatingSummaryData | null {
  if (!isRecord(value)) return null;

  const current = isRecord(value.current) ? {
    avg_overall: toNumber(value.current.avg_overall),
    avg_cleanliness: toNumber(value.current.avg_cleanliness),
    avg_responsiveness: toNumber(value.current.avg_responsiveness),
    avg_communication: toNumber(value.current.avg_communication),
    count: toNumber(value.current.count),
  } : undefined;

  const monthly = Array.isArray(value.monthly)
    ? value.monthly.flatMap((item) => {
        if (!isRecord(item) || typeof item.period !== 'string') return [];
        return [{ period: item.period, avg_overall: toNumber(item.avg_overall), count: toNumber(item.count) }];
      })
    : undefined;

  const recentComments = Array.isArray(value.recentComments)
    ? value.recentComments.flatMap((item) => {
        if (!isRecord(item) || typeof item.comment !== 'string') return [];
        const overall = toNumber(item.overall);
        if (overall === undefined) return [];
        return [{
          overall,
          comment: item.comment,
          created_at: typeof item.created_at === 'string' ? item.created_at : undefined,
        }];
      })
    : undefined;

  return { current, trend: toNumber(value.trend) ?? 0, monthly, recentComments };
}

export interface TeamData {
  managers: TeamMember[];
  departmentHeads: TeamMember[];
  executors: TeamMember[];
  total: number;
}

export interface MarketplaceReport {
  period: { start_date: string; end_date: string };
  overall: {
    total_orders: number;
    delivered_orders: number;
    cancelled_orders: number;
    total_revenue: number;
    total_delivery_fees: number;
    avg_rating: number;
    rated_orders: number;
  };
  top_products: Array<{
    product_id: string;
    product_name: string;
    image_url: string;
    total_sold: number;
    total_revenue: number;
    order_count: number;
  }>;
  categories: Array<{
    category_name: string;
    total_sold: number;
    total_revenue: number;
    order_count: number;
  }>;
  daily_sales: Array<{
    date: string;
    orders: number;
    revenue: number;
  }>;
  orders_by_status: Array<{
    status: string;
    count: number;
  }>;
  top_customers: Array<{
    user_id: string;
    user_name: string;
    user_phone: string;
    order_count: number;
    total_spent: number;
  }>;
  executor_stats: Array<{
    executor_id: string;
    executor_name: string;
    delivered_count: number;
    avg_rating: number;
  }>;
}

export type TabType = 'overview' | 'marketplace' | 'ratings';

export interface CompanyStats {
  totalRequests: number;
  newRequests: number;
  inProgress: number;
  completedTotal: number;
  completedThisWeek: number;
  completedThisMonth: number;
  pendingApproval: number;
  completionRate: number;
  totalStaff: number;
  totalManagers: number;
  totalDepartmentHeads: number;
  totalExecutors: number;
  onlineExecutors: number;
  avgRating: number;
  totalBuildings: number;
  totalResidents: number;
  activeMeetings: number;
  activeAnnouncements: number;
}

export interface BuildingStat {
  id: string;
  name: string;
  address: string;
  totalRequests: number;
  completed: number;
  pending: number;
  inProgress: number;
  completionRate: number;
}

export interface DepartmentStat {
  specialization: string;
  label: string;
  total: number;
  completed: number;
  avgRating: number;
  executorCount: number;
  completionRate: number;
}

export interface ChartData {
  weeklyData: Array<{ day: string; created: number; completed: number }>;
  statusData: Array<{ name: string; value: number; color: string }>;
  staffData: Array<{ name: string; value: number; color: string }>;
  deptPerformance: Array<{
    name: string;
    fullName: string;
    completed: number;
    pending: number;
    rate: number;
  }>;
}
