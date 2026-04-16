import type { ReactNode } from 'react';
import { statusColor, type StatusTone } from '../../theme';

interface StatusBadgeProps {
  status: StatusTone;
  children: ReactNode;
  size?: 'sm' | 'md';
  className?: string;
}

export function StatusBadge({ status, children, size = 'md', className = '' }: StatusBadgeProps) {
  const { fg, bg } = statusColor[status];
  const sizing = size === 'sm'
    ? 'px-2 py-0.5 text-[11px]'
    : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold leading-none ${sizing} ${className}`}
      style={{ color: fg, background: bg }}
    >
      {children}
    </span>
  );
}

interface StatusStatProps {
  status: StatusTone;
  value: number | string;
  label: string;
  className?: string;
}

export function StatusStat({ status, value, label, className = '' }: StatusStatProps) {
  const { fg, bg } = statusColor[status];
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-2xl px-3 py-2.5 ${className}`}
      style={{ background: bg }}
    >
      <div className="text-xl font-bold leading-tight" style={{ color: fg }}>{value}</div>
      <div className="text-[11px] font-medium mt-0.5" style={{ color: fg, opacity: 0.85 }}>{label}</div>
    </div>
  );
}
