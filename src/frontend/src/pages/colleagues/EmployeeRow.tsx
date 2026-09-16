// Sprint 28: extracted from ColleaguesSection. Compact one-row card
// for an employee (avatar + name + rating + actions). The parent
// owns the actions (open profile / rate / thank).

import { Star, Heart, CheckCircle } from 'lucide-react';
import { Avatar } from './Avatar';
import type { Employee } from './types';

export function EmployeeRow({
  emp,
  avgRating,
  isRated,
  onOpen,
  onRate,
  onThank,
  readOnly = false,
  accent = 'default',
}: {
  emp: Employee;
  avgRating: string;
  isRated: boolean;
  onOpen: () => void;
  onRate: () => void;
  onThank: () => void;
  readOnly?: boolean;
  accent?: 'default' | 'team';
}) {
  const bg = accent === 'team'
    ? 'bg-primary-50/50 border-primary-200 hover:bg-primary-50'
    : 'bg-white/60 border-gray-200 hover:bg-white/80';
  const rating = (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-amber-600 flex-shrink-0">
      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
      {avgRating}
    </span>
  );
  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3 border rounded-xl transition-all hover:shadow-md ${bg}`}
    >
      {/* Row 1 (mobile) / left (desktop): avatar + name/position */}
      <div className="flex items-center gap-3 min-w-0 sm:flex-1">
        <button onClick={onOpen} className="flex-shrink-0 touch-manipulation" aria-label={emp.name}>
          <Avatar
            name={emp.name}
            src={emp.photo}
            className="w-12 h-12 rounded-xl object-cover text-sm"
          />
        </button>
        <button
          onClick={onOpen}
          className="flex-1 min-w-0 text-left touch-manipulation"
        >
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="font-bold text-sm truncate">{emp.name}</h3>
            {/* Rating inline with name on desktop only; on mobile it lives in row 2 */}
            <span className="hidden sm:inline-flex">{rating}</span>
          </div>
          <p className="text-xs text-gray-500 truncate">{emp.position}</p>
        </button>
      </div>
      {/* Row 2 (mobile) / right (desktop): rating (mobile only) + action buttons */}
      {!readOnly && (
        <div className="flex items-center gap-1.5 sm:flex-shrink-0 justify-end sm:justify-start pl-[60px] sm:pl-0">
          <span className="inline-flex sm:hidden mr-auto">{rating}</span>
          <button
            onClick={onRate}
            disabled={isRated}
            title={isRated ? 'Уже оценено' : 'Оценить'}
            aria-label={isRated ? 'Уже оценено' : 'Оценить'}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors touch-manipulation ${
              isRated
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-primary-500 hover:bg-primary-600 active:bg-primary-700 text-gray-900'
            }`}
          >
            {isRated ? <CheckCircle className="w-4 h-4" /> : <Star className="w-4 h-4" />}
          </button>
          <button
            onClick={onThank}
            title="Спасибо"
            aria-label="Сказать спасибо"
            className="w-10 h-10 rounded-lg flex items-center justify-center bg-purple-50 hover:bg-purple-100 active:bg-purple-200 text-purple-600 transition-colors touch-manipulation"
          >
            <Heart className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
