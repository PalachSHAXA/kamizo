export type StatusTone = 'active' | 'pending' | 'expired' | 'critical' | 'info';

export const statusColor: Record<StatusTone, { fg: string; bg: string; cssVar: string }> = {
  active:   { fg: '#10B981', bg: 'rgba(16, 185, 129, 0.1)',  cssVar: '--status-active'   },
  pending:  { fg: '#F59E0B', bg: 'rgba(245, 158, 11, 0.1)',  cssVar: '--status-pending'  },
  expired:  { fg: '#6B7280', bg: 'rgba(107, 114, 128, 0.1)', cssVar: '--status-expired'  },
  critical: { fg: '#EF4444', bg: 'rgba(239, 68, 68, 0.1)',   cssVar: '--status-critical' },
  info:     { fg: '#3B82F6', bg: 'rgba(59, 130, 246, 0.1)',  cssVar: '--status-info'     },
};

export const TOUCH_TARGET_MIN = 44;
