// Sprint 27: extracted from ColleaguesSection. Top-3 rated employees
// across the platform with their avatar + average rating + badge.

import { Component } from 'react';
import { Award, Star, Users } from 'lucide-react';
import { EmptyState } from '../../components/common';
import { Avatar } from './Avatar';
import { safeFixed, safeAvgRating } from './ratingUtils';
import type { Employee } from './types';

export function TopColleagues({ employees, isResidentView }: { employees: Employee[]; isResidentView: boolean }) {
  const sortedByRating = [...employees].sort((a, b) => safeAvgRating(b.ratings) - safeAvgRating(a.ratings));

  const topThree = sortedByRating.slice(0, 3);

  const getBestByCategory = (category: keyof Employee['ratings']) => {
    return [...employees].sort((a, b) => (b.ratings?.[category] ?? 0) - (a.ratings?.[category] ?? 0))[0];
  };

  if (employees.length === 0) {
    return null;
  }

  // Residents don't have "colleagues" here — they're rating building staff.
  const heading = isResidentView ? 'Лучшие мастера месяца' : 'Лучшие коллеги месяца';

  return (
    <div className="glass-card p-4 sm:p-6 mb-6 overflow-hidden">
      <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
        <Award className="w-5 h-5 text-primary-500 flex-shrink-0" />
        <span className="truncate">{heading}</span>
      </h2>

      <div className="space-y-3 mb-6">
        {topThree.map((emp, i) => {
          const avgRating = safeFixed(safeAvgRating(emp.ratings));
          return (
            <div
              key={emp.id}
              className={`p-3 rounded-xl border-2 flex items-center gap-3 ${
                i === 0 ? 'border-primary-400 bg-primary-50' :
                i === 1 ? 'border-gray-300 bg-gray-50' :
                'border-primary-300 bg-primary-50'
              }`}
            >
              <span className="text-xl flex-shrink-0">
                {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
              </span>
              <Avatar
                name={emp.name}
                src={emp.photo}
                className="w-10 h-10 rounded-lg object-cover flex-shrink-0 text-sm"
              />
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-sm truncate">{emp.name}</h3>
                <p className="text-xs text-gray-600 truncate">{emp.position}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                <span className="text-sm font-bold">{avgRating}</span>
              </div>
            </div>
          );
        })}
      </div>

      {employees.length > 0 && (
        <>
          <h3 className="font-bold mb-3 text-sm">Лидеры по категориям</h3>
          <div className="space-y-2">
            {[
              { key: 'teamwork' as const, label: 'Командность', icon: '🤝' },
              { key: 'professionalKnowledge' as const, label: 'Знания', icon: '🎓' },
              { key: 'communication' as const, label: 'Коммуникация', icon: '💬' },
              { key: 'initiative' as const, label: 'Инициативность', icon: '🚀' },
            ].map(({ key, label, icon }) => {
              const best = getBestByCategory(key);
              if (!best) return null;
              return (
                <div key={key} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                  <span className="flex-shrink-0">{icon}</span>
                  <span className="text-xs text-gray-500 flex-shrink-0 w-24">{label}</span>
                  <span className="text-xs font-medium flex-1 min-w-0 truncate">{best.name}</span>
                  <span className="text-xs font-bold flex-shrink-0 bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded">{safeFixed(best.ratings?.[key])}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ==================== MAIN COMPONENT ====================

// Основной компонент
// Local error boundary — if inner render throws due to unexpected executor data
// shape, show a friendly empty state instead of the full-page React Error Boundary.
class ColleaguesErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: Error) { console.error('[ColleaguesSection] render failed:', err); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6">
          <EmptyState
            icon={<Users className="w-12 h-12" />}
            title="Сотрудники"
            description="Данные временно недоступны. Попробуйте позже."
          />
        </div>
      );
    }
    return this.props.children;
  }
}
