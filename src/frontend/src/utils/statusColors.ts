/**
 * Centralized status color mappings for consistent styling across the application.
 *
 * These mappings reflect the most common patterns found across dashboard pages,
 * request cards, and other components. Each entry provides Tailwind CSS classes
 * for background, text, and dot/indicator colors.
 */

// ---------------------------------------------------------------------------
// Request Status Colors
// ---------------------------------------------------------------------------
// Source patterns: RequestCard.tsx, ManagerDashboard.tsx, ExecutorDashboard.tsx,
// DepartmentHeadDashboard.tsx, DirectorDashboard.tsx, shared/RequestsPage.tsx

export interface StatusColorSet {
  bg: string;
  text: string;
  dot: string;
}

export const REQUEST_STATUS_COLORS: Record<string, StatusColorSet> = {
  new:              { bg: 'bg-blue-100',    text: 'text-blue-700',    dot: 'bg-blue-500' },
  assigned:         { bg: 'bg-purple-100',  text: 'text-purple-700',  dot: 'bg-purple-500' },
  accepted:         { bg: 'bg-cyan-100',    text: 'text-cyan-700',    dot: 'bg-cyan-500' },
  in_progress:      { bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-500' },
  paused:           { bg: 'bg-orange-100',  text: 'text-orange-700',  dot: 'bg-orange-500' },
  pending_approval: { bg: 'bg-purple-100',  text: 'text-purple-700',  dot: 'bg-purple-500' },
  completed:        { bg: 'bg-green-100',   text: 'text-green-700',   dot: 'bg-green-500' },
  approved:         { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  rejected:         { bg: 'bg-red-100',     text: 'text-red-700',     dot: 'bg-red-500' },
  cancelled:        { bg: 'bg-gray-100',    text: 'text-gray-700',    dot: 'bg-gray-400' },
  closed:           { bg: 'bg-slate-100',   text: 'text-slate-700',   dot: 'bg-slate-400' },
};

export const getRequestStatusColor = (status: string): StatusColorSet =>
  REQUEST_STATUS_COLORS[status] || REQUEST_STATUS_COLORS.new;

/**
 * Returns combined bg + text class string for badge usage.
 * Example: "bg-blue-100 text-blue-700"
 */
export const getRequestStatusBadgeClass = (status: string): string => {
  const color = getRequestStatusColor(status);
  return `${color.bg} ${color.text}`;
};

// ---------------------------------------------------------------------------
// Request Priority Colors
// ---------------------------------------------------------------------------
// Source patterns: RequestCard.tsx, ManagerDashboard.tsx, DepartmentHeadDashboard.tsx

export const PRIORITY_COLORS: Record<string, StatusColorSet> = {
  low:    { bg: 'bg-gray-100',   text: 'text-gray-600',  dot: 'bg-gray-400' },
  medium: { bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  high:   { bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
  urgent: { bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500' },
};

/** Variant used by RequestCard where "urgent" has a filled background */
export const PRIORITY_COLORS_FILLED: Record<string, string> = {
  low:    'bg-gray-100 text-gray-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high:   'bg-red-100 text-red-700',
  urgent: 'bg-red-600 text-white',
};

export const getPriorityColor = (priority: string): StatusColorSet =>
  PRIORITY_COLORS[priority] || PRIORITY_COLORS.low;

export const getPriorityBadgeClass = (priority: string): string => {
  const color = getPriorityColor(priority);
  return `${color.bg} ${color.text}`;
};

// ---------------------------------------------------------------------------
// Executor Status Colors
// ---------------------------------------------------------------------------
// Source patterns: ManagerDashboard.tsx, AdminDashboard.tsx, ExecutorDashboard.tsx,
// DepartmentHeadDashboard.tsx, shared/ExecutorsPage.tsx

export const EXECUTOR_STATUS_COLORS: Record<string, StatusColorSet> = {
  available: { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
  busy:      { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
  offline:   { bg: 'bg-gray-100',  text: 'text-gray-600',  dot: 'bg-gray-400' },
};

export const getExecutorStatusColor = (status: string): StatusColorSet =>
  EXECUTOR_STATUS_COLORS[status] || EXECUTOR_STATUS_COLORS.offline;

export const getExecutorStatusBadgeClass = (status: string): string => {
  const color = getExecutorStatusColor(status);
  return `${color.bg} ${color.text}`;
};

// ---------------------------------------------------------------------------
// Work Order Status Colors
// ---------------------------------------------------------------------------
// Source patterns: WorkOrdersPage.tsx

export const WORK_ORDER_STATUS_COLORS: Record<string, StatusColorSet> = {
  pending:     { bg: 'bg-gray-100',   text: 'text-gray-700',   dot: 'bg-gray-400' },
  scheduled:   { bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-500' },
  in_progress: { bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  completed:   { bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500' },
  cancelled:   { bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500' },
};

export const getWorkOrderStatusColor = (status: string): StatusColorSet =>
  WORK_ORDER_STATUS_COLORS[status] || WORK_ORDER_STATUS_COLORS.pending;

export const getWorkOrderStatusBadgeClass = (status: string): string => {
  const color = getWorkOrderStatusColor(status);
  return `${color.bg} ${color.text}`;
};

// ---------------------------------------------------------------------------
// Work Order Priority Colors (text-only variant)
// ---------------------------------------------------------------------------
// Source patterns: WorkOrdersPage.tsx

export const WORK_ORDER_PRIORITY_COLORS: Record<string, string> = {
  low:    'text-gray-500',
  medium: 'text-blue-500',
  high:   'text-orange-500',
  urgent: 'text-red-500',
};

export const getWorkOrderPriorityColor = (priority: string): string =>
  WORK_ORDER_PRIORITY_COLORS[priority] || WORK_ORDER_PRIORITY_COLORS.low;

// ---------------------------------------------------------------------------
// Marketplace Order Status Colors
// ---------------------------------------------------------------------------
// Source patterns: MarketplaceOrdersPage.tsx, ExecutorDashboard.tsx

export const MARKETPLACE_ORDER_STATUS_COLORS: Record<string, StatusColorSet> = {
  new:        { bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-500' },
  confirmed:  { bg: 'bg-indigo-100', text: 'text-indigo-700', dot: 'bg-indigo-500' },
  preparing:  { bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  ready:      { bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
  delivering: { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
  delivered:  { bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500' },
  cancelled:  { bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500' },
};

export const getMarketplaceOrderStatusColor = (status: string): StatusColorSet =>
  MARKETPLACE_ORDER_STATUS_COLORS[status] || MARKETPLACE_ORDER_STATUS_COLORS.new;

export const getMarketplaceOrderStatusBadgeClass = (status: string): string => {
  const color = getMarketplaceOrderStatusColor(status);
  return `${color.bg} ${color.text}`;
};

// ---------------------------------------------------------------------------
// Announcement Priority Colors
// ---------------------------------------------------------------------------
// Source patterns: AnnouncementsPage.tsx, DirectorDashboard.tsx

export const ANNOUNCEMENT_PRIORITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  normal:    { bg: 'bg-blue-100',  text: 'text-blue-700',  border: 'border-blue-200' },
  important: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' },
  urgent:    { bg: 'bg-red-100',   text: 'text-red-700',   border: 'border-red-200' },
};

export const getAnnouncementPriorityColor = (priority: string) =>
  ANNOUNCEMENT_PRIORITY_COLORS[priority] || ANNOUNCEMENT_PRIORITY_COLORS.normal;

export const getAnnouncementPriorityBadgeClass = (priority: string): string => {
  const color = getAnnouncementPriorityColor(priority);
  return `${color.bg} ${color.text} ${color.border}`;
};

// ---------------------------------------------------------------------------
// Completion Rate Colors (used for building/department performance)
// ---------------------------------------------------------------------------
// Source patterns: DirectorDashboard.tsx

export const getCompletionRateColor = (rate: number): StatusColorSet => {
  if (rate >= 80) return { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' };
  if (rate >= 50) return { bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500' };
  return { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500' };
};

export const getCompletionRateBadgeClass = (rate: number): string => {
  const color = getCompletionRateColor(rate);
  return `${color.bg} ${color.text}`;
};
