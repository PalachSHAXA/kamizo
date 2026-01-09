import { memo } from 'react';
import type { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  icon: LucideIcon;
  value: number | string;
  label: string;
  color: 'blue' | 'amber' | 'green' | 'purple' | 'red' | 'indigo';
  className?: string;
}

const colorClasses = {
  blue: 'bg-blue-500',
  amber: 'bg-amber-500',
  green: 'bg-green-500',
  purple: 'bg-purple-500',
  red: 'bg-red-500',
  indigo: 'bg-indigo-500',
};

/**
 * Мемоизированная карточка статистики
 * Не перерисовывается если props не изменились
 */
export const StatsCard = memo<StatsCardProps>(({ icon: Icon, value, label, color, className = '' }) => {
  return (
    <div className={`glass-card p-3 md:p-5 ${className}`}>
      <div className="flex items-center gap-2 md:gap-3">
        <div className={`w-10 h-10 md:w-12 md:h-12 ${colorClasses[color]} rounded-xl flex items-center justify-center flex-shrink-0`}>
          <Icon className="w-5 h-5 md:w-6 md:h-6 text-white" />
        </div>
        <div className="min-w-0">
          <div className="text-2xl md:text-3xl font-bold">{value}</div>
          <div className="text-xs md:text-sm text-gray-500 truncate">{label}</div>
        </div>
      </div>
    </div>
  );
});

StatsCard.displayName = 'StatsCard';
