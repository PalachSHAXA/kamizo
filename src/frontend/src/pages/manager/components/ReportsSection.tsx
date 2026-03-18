import { useState } from 'react';
import { Star, Download, CalendarDays } from 'lucide-react';
import { useLanguageStore } from '../../../stores/languageStore';
import { SPECIALIZATION_LABELS } from '../../../types';
import type { Request, Executor, ExecutorSpecialization } from '../../../types';

// Reports Section - used in ReportsPage
export function ReportsSection({ requests, executors }: { requests: Request[]; executors: Executor[] }) {
  const { language } = useLanguageStore();
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'custom'>('week');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Calculate date range
  const getDateRange = () => {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    let start = new Date(end);

    switch (period) {
      case 'today':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        break;
      case 'week':
        start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'custom':
        if (startDate && endDate) {
          return {
            start: new Date(startDate),
            end: new Date(endDate + 'T23:59:59')
          };
        }
        break;
    }
    return { start, end };
  };

  const { start, end } = getDateRange();

  // Filter requests by date range
  const filteredRequests = requests.filter(r => {
    const created = new Date(r.createdAt);
    return created >= start && created <= end;
  });

  // Calculate stats
  const stats = {
    total: filteredRequests.length,
    new: filteredRequests.filter(r => r.status === 'new').length,
    inProgress: filteredRequests.filter(r => ['assigned', 'accepted', 'in_progress'].includes(r.status)).length,
    pendingApproval: filteredRequests.filter(r => r.status === 'pending_approval').length,
    completed: filteredRequests.filter(r => r.status === 'completed').length,
    cancelled: filteredRequests.filter(r => r.status === 'cancelled').length,
  };

  // Stats by category
  const categoryStats = Object.entries(
    filteredRequests.reduce((acc, r) => {
      acc[r.category] = (acc[r.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  ).map(([category, count]) => ({
    category,
    label: SPECIALIZATION_LABELS[category as ExecutorSpecialization] || category,
    count: count as number
  })).sort((a, b) => b.count - a.count);

  // Executor performance
  const executorStats = executors.map(executor => {
    const executorRequests = filteredRequests.filter(r => r.executorId === executor.id);
    const completed = executorRequests.filter(r => r.status === 'completed');
    const ratings = completed.filter(r => r.rating).map(r => r.rating!);
    const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
    const totalTime = completed.reduce((sum, r) => sum + (r.workDuration || 0), 0);
    const avgTime = completed.length > 0 ? totalTime / completed.length : 0;

    return {
      id: executor.id,
      name: executor.name,
      specialization: SPECIALIZATION_LABELS[executor.specialization as ExecutorSpecialization],
      total: executorRequests.length,
      completed: completed.length,
      avgRating: Math.round(avgRating * 10) / 10,
      avgTime: Math.round(avgTime / 60), // in minutes
    };
  }).filter(e => e.total > 0).sort((a, b) => b.completed - a.completed);

  // Export to Excel
  const exportToExcel = () => {
    // Create CSV content
    const headers = [
      language === 'ru' ? 'Исполнитель' : 'Ijrochi',
      language === 'ru' ? 'Специализация' : 'Mutaxassislik',
      language === 'ru' ? 'Всего заявок' : 'Jami arizalar',
      language === 'ru' ? 'Выполнено' : 'Bajarilgan',
      language === 'ru' ? 'Средний рейтинг' : 'O\'rtacha reyting',
      language === 'ru' ? 'Среднее время (мин)' : 'O\'rtacha vaqt (daq)'
    ];
    const rows = executorStats.map(e => [
      e.name,
      e.specialization,
      e.total,
      e.completed,
      e.avgRating || '-',
      e.avgTime || '-'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    // Add BOM for Excel UTF-8 support
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `report_${period}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  return (
    <div className="space-y-4">
      {/* Period Selection */}
      <div className="glass-card p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg md:text-xl xl:text-2xl font-bold">{language === 'ru' ? 'Отчёты' : 'Hisobotlar'}</h2>
            <p className="text-sm text-gray-500">
              {formatDate(start)} — {formatDate(end)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-white/30 rounded-xl p-1 gap-1">
              {[
                { id: 'today' as const, label: language === 'ru' ? 'Сегодня' : 'Bugun' },
                { id: 'week' as const, label: language === 'ru' ? 'Неделя' : 'Hafta' },
                { id: 'month' as const, label: language === 'ru' ? 'Месяц' : 'Oy' },
                { id: 'custom' as const, label: language === 'ru' ? 'Период' : 'Davr' },
              ].map(p => (
                <button
                  key={p.id}
                  onClick={() => setPeriod(p.id)}
                  className={`px-3 py-1.5 min-h-[44px] rounded-lg sm:rounded-xl text-sm font-medium transition-colors touch-manipulation active:scale-[0.98] ${
                    period === p.id ? 'bg-primary-500 text-gray-900' : 'hover:bg-white/30'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button
              onClick={exportToExcel}
              className="btn-secondary flex items-center gap-2 min-h-[44px] py-2 px-3 touch-manipulation active:scale-[0.98]"
              title={language === 'ru' ? 'Экспорт в Excel' : 'Excelga eksport'}
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">{language === 'ru' ? 'Экспорт' : 'Eksport'}</span>
            </button>
          </div>
        </div>

        {/* Custom date range */}
        {period === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-gray-200">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-500">{language === 'ru' ? 'С:' : 'Dan:'}</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="glass-input py-1.5 px-3 text-sm"
                aria-label={language === 'ru' ? 'Дата начала' : 'Boshlanish sanasi'}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">{language === 'ru' ? 'По:' : 'Gacha:'}</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="glass-input py-1.5 px-3 text-sm"
                aria-label={language === 'ru' ? 'Дата окончания' : 'Tugash sanasi'}
              />
            </div>
          </div>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-3 xl:gap-4">
        <div className="glass-card p-3 text-center">
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-xs text-gray-500">{language === 'ru' ? 'Всего' : 'Jami'}</div>
        </div>
        <div className="glass-card p-3 text-center">
          <div className="text-2xl font-bold text-purple-600">{stats.new}</div>
          <div className="text-xs text-gray-500">{language === 'ru' ? 'Новые' : 'Yangi'}</div>
        </div>
        <div className="glass-card p-3 text-center">
          <div className="text-2xl font-bold text-amber-600">{stats.inProgress}</div>
          <div className="text-xs text-gray-500">{language === 'ru' ? 'В работе' : 'Jarayonda'}</div>
        </div>
        <div className="glass-card p-3 text-center">
          <div className="text-2xl font-bold text-orange-600">{stats.pendingApproval}</div>
          <div className="text-xs text-gray-500">{language === 'ru' ? 'Ожидают' : 'Kutilmoqda'}</div>
        </div>
        <div className="glass-card p-3 text-center">
          <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
          <div className="text-xs text-gray-500">{language === 'ru' ? 'Выполнено' : 'Bajarilgan'}</div>
        </div>
        <div className="glass-card p-3 text-center">
          <div className="text-2xl font-bold text-red-600">{stats.cancelled}</div>
          <div className="text-xs text-gray-500">{language === 'ru' ? 'Отменено' : 'Bekor qilingan'}</div>
        </div>
      </div>

      {/* Categories and Executors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 xl:gap-6">
        {/* By Category */}
        <div className="glass-card p-4">
          <h3 className="text-base sm:text-lg md:text-xl font-bold mb-3">{language === 'ru' ? 'По категориям' : 'Kategoriya bo\'yicha'}</h3>
          {categoryStats.length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-sm">
              {language === 'ru' ? 'Нет данных за выбранный период' : 'Tanlangan davr uchun ma\'lumot yo\'q'}
            </div>
          ) : (
            <div className="space-y-2">
              {categoryStats.map(cat => (
                <div key={cat.category} className="flex items-center justify-between p-2 bg-white/30 rounded-lg">
                  <span className="text-sm font-medium">{cat.label}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-primary-500 h-2 rounded-full"
                        style={{ width: `${(cat.count / stats.total) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold w-8 text-right">{cat.count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Executor Performance */}
        <div className="glass-card p-4">
          <h3 className="text-base sm:text-lg md:text-xl font-bold mb-3">{language === 'ru' ? 'Исполнители' : 'Ijrochilar'}</h3>
          {executorStats.length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-sm">
              {language === 'ru' ? 'Нет данных за выбранный период' : 'Tanlangan davr uchun ma\'lumot yo\'q'}
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {executorStats.map(exec => (
                <div key={exec.id} className="p-3 bg-white/30 rounded-lg">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-medium text-sm truncate">{exec.name}</span>
                    <div className="flex items-center gap-1 text-amber-500 flex-shrink-0">
                      <Star className="w-3 h-3 fill-amber-400" />
                      <span className="text-sm font-bold">{exec.avgRating || '-'}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{exec.specialization}</span>
                    <div className="flex items-center gap-3">
                      <span>{language === 'ru' ? 'Заявок' : 'Arizalar'}: <b className="text-gray-700">{exec.total}</b></span>
                      <span>{language === 'ru' ? 'Выполнено' : 'Bajarilgan'}: <b className="text-green-600">{exec.completed}</b></span>
                      {exec.avgTime > 0 && (
                        <span>{language === 'ru' ? 'Ср. время' : 'O\'rt. vaqt'}: <b className="text-gray-700">{exec.avgTime} {language === 'ru' ? 'мин' : 'daq'}</b></span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Full Executor Table for Desktop */}
      <div className="glass-card p-4 hidden lg:block">
        <h3 className="text-base sm:text-lg md:text-xl font-bold mb-3">{language === 'ru' ? 'Детальная статистика исполнителей' : 'Ijrochilarning batafsil statistikasi'}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-3 font-medium text-gray-500">{language === 'ru' ? 'Исполнитель' : 'Ijrochi'}</th>
                <th className="text-left py-2 px-3 font-medium text-gray-500">{language === 'ru' ? 'Специализация' : 'Mutaxassislik'}</th>
                <th className="text-center py-2 px-3 font-medium text-gray-500">{language === 'ru' ? 'Всего' : 'Jami'}</th>
                <th className="text-center py-2 px-3 font-medium text-gray-500">{language === 'ru' ? 'Выполнено' : 'Bajarilgan'}</th>
                <th className="text-center py-2 px-3 font-medium text-gray-500">{language === 'ru' ? 'Рейтинг' : 'Reyting'}</th>
                <th className="text-center py-2 px-3 font-medium text-gray-500">{language === 'ru' ? 'Ср. время' : 'O\'rt. vaqt'}</th>
              </tr>
            </thead>
            <tbody>
              {executorStats.map(exec => (
                <tr key={exec.id} className="border-b border-gray-100 hover:bg-white/30">
                  <td className="py-2 px-3 font-medium">{exec.name}</td>
                  <td className="py-2 px-3 text-gray-500">{exec.specialization}</td>
                  <td className="py-2 px-3 text-center">{exec.total}</td>
                  <td className="py-2 px-3 text-center text-green-600 font-medium">{exec.completed}</td>
                  <td className="py-2 px-3 text-center">
                    <span className="flex items-center justify-center gap-1 text-amber-500">
                      <Star className="w-3 h-3 fill-amber-400" />
                      {exec.avgRating || '-'}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-center text-gray-500">
                    {exec.avgTime > 0 ? `${exec.avgTime} ${language === 'ru' ? 'мин' : 'daq'}` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
