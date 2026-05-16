// Sprint 28: extracted from ColleaguesSection. Full profile view
// (avatar, name, ratings table by criterion, thank history).

import { Heart, Award } from 'lucide-react';
import { useLanguageStore } from '../../stores/languageStore';
import { Avatar } from './Avatar';
import { StarRating } from './StarRating';
import { getColleagueLabels } from './labels';
import type { Employee, Thank } from './types';

export function EmployeeProfile({ employee, onBack, thanks }: {
  employee: Employee;
  onBack: () => void;
  thanks: Thank[];
}) {
  const { language } = useLanguageStore();
  const avgRating = safeFixed(safeAvgRating(employee.ratings));
  const employeeThanks = thanks.filter(t => t.toId === employee.id);

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="mb-4 flex items-center gap-2 text-gray-600 hover:text-gray-800 font-medium"
      >
        ← Назад к списку
      </button>

      <div className="glass-card p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6">
          <Avatar
            name={employee.name}
            src={employee.photo}
            className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl object-cover flex-shrink-0 text-2xl"
          />
          <div className="flex-1 text-center sm:text-left min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold truncate">{employee.name}</h1>
            <p className="text-gray-600 mb-1">{employee.position}</p>
            <p className="text-sm text-gray-500">{employee.department}</p>

            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 sm:gap-4 mt-4">
              <div className="flex items-center gap-2">
                <StarRating rating={parseFloat(avgRating)} size="sm" />
                <span className="font-bold text-lg">{avgRating}</span>
              </div>
              <div className="text-sm text-gray-600">
                {employee.totalRatings} оценок
              </div>
              <div className="text-sm text-gray-600">
                {employee.monthlyRatings} в этом месяце
              </div>
            </div>

            {employee.badges.length > 0 && (
              <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-4">
                {employee.badges.map((badge, i) => (
                  <span
                    key={i}
                    className="px-3 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full flex items-center gap-1"
                  >
                    <Award className="w-3 h-3" />
                    {badge}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="glass-card p-4 sm:p-6">
        <h2 className="text-lg font-bold mb-4">{language === 'ru' ? 'Оценки по критериям' : 'Mezonlar bo\'yicha baholar'}</h2>
        <div className="space-y-3">
          {Object.entries(getColleagueLabels(language).criteriaLabels).map(([key, label]) => (
            <div key={key} className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-2">
              <span className="text-sm truncate">{label}</span>
              <div className="flex items-center gap-2 flex-shrink-0">
                <StarRating rating={employee.ratings?.[key as keyof typeof employee.ratings] ?? 0} size="sm" />
                <span className="text-sm font-medium w-8 text-right">
                  {safeFixed(employee.ratings?.[key as keyof typeof employee.ratings])}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-card p-4 sm:p-6">
        <h2 className="text-lg font-bold mb-4">Полученные благодарности ({employeeThanks.length})</h2>
        {employeeThanks.length === 0 ? (
          <p className="text-gray-500 text-sm">Пока нет благодарностей</p>
        ) : (
          <div className="space-y-3">
            {employeeThanks.map((thank) => (
              <div key={thank.id} className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <Heart className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <span className="text-sm font-medium truncate">
                    {thank.isAnonymous ? 'Анонимно' : thank.fromName}
                  </span>
                </div>
                <p className="text-sm text-gray-700">{thank.reason}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(thank.createdAt).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
