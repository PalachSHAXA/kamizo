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
