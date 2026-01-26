import { useState, useMemo } from 'react';
import {
  FileText, CheckCircle, Star, Clock, PieChart, BarChart3,
  TrendingUp, TrendingDown, Download, Building2, Home, Users, Zap, AlertCircle,
  Percent, Timer, Award
} from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { useCRMStore } from '../../stores/crmStore';
import { useAuthStore } from '../../stores/authStore';
import { SPECIALIZATION_LABELS } from '../../types';

export function ReportsPage() {
  const { requests, executors } = useDataStore();
  const { buildings, residents } = useCRMStore();
  const { additionalUsers } = useAuthStore();
  const [period, setPeriod] = useState('week');
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [reportType, setReportType] = useState<'general' | 'branch'>('general');

  // Filter requests by period
  const getFilteredRequests = () => {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'day':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'year':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(0);
    }

    return requests.filter(r => new Date(r.createdAt) >= startDate);
  };

  const filteredRequests = getFilteredRequests();

  // Get building stats for reports (each building as separate object)
  const getBuildingStats = () => {
    return buildings.map(building => {
      // Get residents for this building - check multiple sources
      // 1. From CRM residents by apartmentId that belongs to this building
      const crmResidentsCount = residents.filter((r: any) =>
        r.building_id === building.id || r.buildingId === building.id || r.apartmentId?.startsWith(building.id)
      ).length;

      // 2. From additionalUsers by buildingId or by matching address
      const additionalResidentsCount = Object.values(additionalUsers)
        .filter(u => {
          if (u.user.role !== 'resident') return false;
          // Check by buildingId
          if (u.user.buildingId === building.id || (u.user as any).building_id === building.id) return true;
          // Check by address match
          if (u.user.address && (
            u.user.address.includes(building.address) ||
            building.address.includes(u.user.address) ||
            u.user.address.includes(building.name)
          )) return true;
          return false;
        })
        .length;

      // Use whichever count is higher (to avoid double counting)
      const buildingResidentsCount = Math.max(crmResidentsCount, additionalResidentsCount);

      // Get requests for this building (by buildingId from resident)
      const buildingRequests = filteredRequests.filter(r => {
        // Check buildingId directly (returned from API via resident's building_id)
        if (r.buildingId === building.id) return true;
        // Fallback: check by building name match in address
        if (r.address) {
          const addr = r.address.toLowerCase();
          const bName = building.name.toLowerCase();
          // Extract building number from "Дом 5A" -> "5a"
          const buildingNum = bName.replace(/дом\s*/i, '').trim().toLowerCase();
          if (buildingNum && addr.includes(buildingNum + '-')) return true; // e.g. "5A-уй"
          if (buildingNum && addr.includes(buildingNum + ' ')) return true;
        }
        return false;
      });

      const completedRequests = buildingRequests.filter(r => r.status === 'completed');
      const avgRating = completedRequests.filter(r => r.rating).length > 0
        ? completedRequests.reduce((sum, r) => sum + (r.rating || 0), 0) / completedRequests.filter(r => r.rating).length
        : 0;

      // Category breakdown
      const categoryBreakdown = buildingRequests.reduce((acc, req) => {
        acc[req.category] = (acc[req.category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return {
        branch: building.name,
        buildingId: building.id,
        buildings: 1,
        residents: buildingResidentsCount,
        totalRequests: buildingRequests.length,
        completed: completedRequests.length,
        avgRating: avgRating.toFixed(1),
        categoryBreakdown,
      };
    });
  };

  const branchStats = getBuildingStats();

  // Export branch report to CSV
  const handleExportBranchCSV = (branch?: string) => {
    const periodLabels: Record<string, string> = {
      day: 'сегодня',
      week: 'неделю',
      month: 'месяц',
      year: 'год'
    };

    const statsToExport = branch ? branchStats.filter(s => s.branch === branch) : branchStats;

    const headers = ['Объект', 'Домов', 'Жителей', 'Заявок', 'Выполнено', 'Ср. оценка', 'Сантехника', 'Электрика', 'Охрана', 'Уборка', 'Лифт', 'Домофон'];
    const rows = statsToExport.map(s => [
      s.branch,
      s.buildings,
      s.residents,
      s.totalRequests,
      s.completed,
      s.avgRating,
      s.categoryBreakdown.plumber || 0,
      s.categoryBreakdown.electrician || 0,
      s.categoryBreakdown.security || 0,
      s.categoryBreakdown.cleaning || 0,
      s.categoryBreakdown.elevator || 0,
      s.categoryBreakdown.intercom || 0,
    ]);

    const csvContent = [headers, ...rows].map(row => row.join(';')).join('\n');
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `отчет_объекты_${branch || 'все'}_${periodLabels[period]}_${new Date().toLocaleDateString('ru-RU')}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  // Export to CSV
  const handleExportCSV = () => {
    const periodLabels: Record<string, string> = {
      day: 'сегодня',
      week: 'неделю',
      month: 'месяц',
      year: 'год'
    };

    const headers = ['№', 'Название', 'Категория', 'Статус', 'Приоритет', 'Житель', 'Адрес', 'Исполнитель', 'Создано', 'Оценка'];
    const rows = filteredRequests.map(r => [
      r.number,
      r.title,
      SPECIALIZATION_LABELS[r.category] || r.category,
      r.status,
      r.priority,
      r.residentName,
      `${r.address} кв.${r.apartment}`,
      r.executorName || '-',
      new Date(r.createdAt).toLocaleDateString('ru-RU'),
      r.rating || '-'
    ]);

    const csvContent = [headers, ...rows].map(row => row.join(';')).join('\n');
    const BOM = '\uFEFF'; // For proper Cyrillic encoding in Excel
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `отчет_за_${periodLabels[period]}_${new Date().toLocaleDateString('ru-RU')}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  // Calculate stats
  const completedRequests = filteredRequests.filter(r => r.status === 'completed');
  const avgRating = completedRequests.length > 0
    ? (completedRequests.reduce((sum, r) => sum + (r.rating || 0), 0) / completedRequests.filter(r => r.rating).length).toFixed(1)
    : '—';

  const avgCompletionTime = completedRequests.length > 0
    ? Math.round(completedRequests.reduce((sum, r) => sum + (r.workDuration || 0), 0) / completedRequests.length / 60)
    : 0;

  // Advanced metrics
  const advancedMetrics = useMemo(() => {
    // Completion rate
    const completionRate = filteredRequests.length > 0
      ? Math.round((completedRequests.length / filteredRequests.length) * 100)
      : 0;

    // Average response time (time from created to assigned)
    const assignedRequests = filteredRequests.filter(r => r.assignedAt);
    const avgResponseTime = assignedRequests.length > 0
      ? Math.round(assignedRequests.reduce((sum, r) => {
          const created = new Date(r.createdAt).getTime();
          const assigned = new Date(r.assignedAt!).getTime();
          return sum + (assigned - created) / 60000; // in minutes
        }, 0) / assignedRequests.length)
      : 0;

    // Cancelled rate
    const cancelledCount = filteredRequests.filter(r => r.status === 'cancelled').length;
    const cancelledRate = filteredRequests.length > 0
      ? Math.round((cancelledCount / filteredRequests.length) * 100)
      : 0;

    // Get previous period for comparison
    const now = new Date();
    let prevStart: Date;
    let prevEnd: Date;

    switch (period) {
      case 'day':
        prevEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        prevStart = new Date(prevEnd.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        prevEnd = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        prevStart = new Date(prevEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        prevEnd = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        prevStart = new Date(prevEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        prevEnd = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        prevStart = new Date(prevEnd.getTime() - 365 * 24 * 60 * 60 * 1000);
    }

    const prevRequests = requests.filter(r => {
      const date = new Date(r.createdAt);
      return date >= prevStart && date < prevEnd;
    });
    const prevCompleted = prevRequests.filter(r => r.status === 'completed').length;
    const prevCompletionRate = prevRequests.length > 0
      ? Math.round((prevCompleted / prevRequests.length) * 100)
      : 0;

    const completionTrend = completionRate - prevCompletionRate;
    const requestsTrend = filteredRequests.length - prevRequests.length;

    // Best executor this period (exclude couriers - they have separate marketplace tab)
    const nonCourierExecutors = executors.filter(exec => exec.specialization !== 'courier');
    const executorPerformance = nonCourierExecutors.map(exec => {
      const execRequests = filteredRequests.filter(r => r.executorId === exec.id);
      const execCompleted = execRequests.filter(r => r.status === 'completed');
      const execRated = execCompleted.filter(r => r.rating);
      const execAvgRating = execRated.length > 0
        ? execRated.reduce((sum, r) => sum + (r.rating || 0), 0) / execRated.length
        : 0;

      return {
        ...exec,
        periodRequests: execRequests.length,
        periodCompleted: execCompleted.length,
        periodAvgRating: execAvgRating,
        efficiency: execRequests.length > 0
          ? Math.round((execCompleted.length / execRequests.length) * 100)
          : 0
      };
    }).sort((a, b) => b.periodCompleted - a.periodCompleted);

    const bestExecutor = executorPerformance[0];

    return {
      completionRate,
      avgResponseTime,
      cancelledRate,
      completionTrend,
      requestsTrend,
      bestExecutor,
      executorPerformance
    };
  }, [filteredRequests, completedRequests, period, requests, executors]);

  // Stats by category
  const categoryStats = filteredRequests.reduce((acc, req) => {
    if (!acc[req.category]) {
      acc[req.category] = { total: 0, completed: 0, inProgress: 0 };
    }
    acc[req.category].total++;
    if (req.status === 'completed') acc[req.category].completed++;
    if (req.status === 'in_progress') acc[req.category].inProgress++;
    return acc;
  }, {} as Record<string, { total: number; completed: number; inProgress: number }>);

  // Executor stats (exclude couriers - they have separate marketplace tab)
  const executorStats = executors
    .filter(exec => exec.specialization !== 'courier')
    .map(exec => ({
      ...exec,
      requests: requests.filter(r => r.executorId === exec.id).length,
      completedCount: requests.filter(r => r.executorId === exec.id && r.status === 'completed').length,
    })).sort((a, b) => b.completedCount - a.completedCount);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Отчёты и аналитика</h1>
          <p className="text-gray-500 mt-1">Статистика и показатели эффективности</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="glass-input w-40"
          >
            <option value="day">За сегодня</option>
            <option value="week">За неделю</option>
            <option value="month">За месяц</option>
            <option value="year">За год</option>
          </select>
          <button onClick={handleExportCSV} className="btn-secondary flex items-center gap-2">
            <Download className="w-4 h-4" />
            Скачать CSV
          </button>
        </div>
      </div>

      {/* Report Type Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setReportType('general')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            reportType === 'general'
              ? 'bg-primary-500 text-gray-900'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Общий отчёт
        </button>
        <button
          onClick={() => setReportType('branch')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            reportType === 'branch'
              ? 'bg-primary-500 text-gray-900'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          По объектам
        </button>
      </div>

      {/* Branch Reports Section - Interactive Dashboard */}
      {reportType === 'branch' && (
        <div className="space-y-6">
          {/* Object Selection */}
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Building2 className="w-5 h-5 text-gray-400" />
                Выберите объект для анализа
              </h2>
              <button
                onClick={() => handleExportBranchCSV(selectedBranch === 'all' ? undefined : selectedBranch)}
                className="btn-secondary flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Скачать отчёт
              </button>
            </div>

            {branchStats.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Building2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>Нет данных по объектам</p>
                <p className="text-sm mt-1">Добавьте здания в разделе "Дома"</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                <button
                  onClick={() => setSelectedBranch('all')}
                  className={`p-4 rounded-xl border-2 transition-all text-left ${
                    selectedBranch === 'all'
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-primary-300 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-primary-400 to-primary-600 rounded-lg flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="font-semibold">Все объекты</div>
                      <div className="text-xs text-gray-500">{branchStats.length} объектов</div>
                    </div>
                  </div>
                </button>
                {branchStats.map((stat) => (
                  <button
                    key={stat.buildingId}
                    onClick={() => setSelectedBranch(stat.branch)}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${
                      selectedBranch === stat.branch
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-primary-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-lg flex items-center justify-center">
                        <Home className="w-5 h-5 text-white" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{stat.branch}</div>
                        <div className="text-xs text-gray-500">{stat.totalRequests} заявок</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Detailed Stats for Selected Object */}
          {selectedBranch && branchStats.length > 0 && (() => {
            const selectedStats = selectedBranch === 'all'
              ? branchStats
              : branchStats.filter(s => s.branch === selectedBranch);

            // Calculate totals for selected objects
            const totalRequests = selectedStats.reduce((sum, s) => sum + s.totalRequests, 0);
            const totalCompleted = selectedStats.reduce((sum, s) => sum + s.completed, 0);
            const totalResidents = selectedStats.reduce((sum, s) => sum + s.residents, 0);

            // Get all requests for selected objects
            const selectedRequests = selectedBranch === 'all'
              ? filteredRequests
              : filteredRequests.filter(r => {
                  const building = buildings.find(b => b.name === selectedBranch);
                  return building && (r.address?.includes(building.address) || r.address?.includes(building.name));
                });

            // Status breakdown
            const statusBreakdown = selectedRequests.reduce((acc, req) => {
              acc[req.status] = (acc[req.status] || 0) + 1;
              return acc;
            }, {} as Record<string, number>);

            // Category breakdown for selected
            const catBreakdown = selectedRequests.reduce((acc, req) => {
              acc[req.category] = (acc[req.category] || 0) + 1;
              return acc;
            }, {} as Record<string, number>);

            // Priority breakdown
            const priorityBreakdown = selectedRequests.reduce((acc, req) => {
              acc[req.priority] = (acc[req.priority] || 0) + 1;
              return acc;
            }, {} as Record<string, number>);

            // Cancelled/rejected breakdown
            const cancelledRequests = selectedRequests.filter(r => r.status === 'cancelled');

            // Average response time (time from created to assigned)
            const assignedRequests = selectedRequests.filter(r => r.assignedAt);
            const avgResponseTime = assignedRequests.length > 0
              ? Math.round(assignedRequests.reduce((sum, r) => {
                  const created = new Date(r.createdAt).getTime();
                  const assigned = new Date(r.assignedAt!).getTime();
                  return sum + (assigned - created) / 60000; // in minutes
                }, 0) / assignedRequests.length)
              : 0;

            // Average completion time
            const completedReqs = selectedRequests.filter(r => r.completedAt && r.startedAt);
            const avgCompTime = completedReqs.length > 0
              ? Math.round(completedReqs.reduce((sum, r) => sum + (r.workDuration || 0), 0) / completedReqs.length / 60)
              : 0;

            // Average rating
            const ratedRequests = selectedRequests.filter(r => r.rating);
            const avgRat = ratedRequests.length > 0
              ? (ratedRequests.reduce((sum, r) => sum + (r.rating || 0), 0) / ratedRequests.length).toFixed(1)
              : '—';

            const statusLabels: Record<string, { label: string; color: string; barColor: string }> = {
              new: { label: 'Новые', color: 'bg-blue-100 text-blue-700', barColor: 'from-blue-400 to-blue-500' },
              assigned: { label: 'Назначены', color: 'bg-purple-100 text-purple-700', barColor: 'from-purple-400 to-purple-500' },
              accepted: { label: 'Приняты', color: 'bg-indigo-100 text-indigo-700', barColor: 'from-indigo-400 to-indigo-500' },
              in_progress: { label: 'В работе', color: 'bg-yellow-100 text-yellow-700', barColor: 'from-orange-400 to-amber-500' },
              pending_approval: { label: 'На проверке', color: 'bg-orange-100 text-orange-700', barColor: 'from-orange-400 to-orange-500' },
              completed: { label: 'Выполнены', color: 'bg-green-100 text-green-700', barColor: 'from-green-400 to-emerald-500' },
              cancelled: { label: 'Отменены', color: 'bg-red-100 text-red-700', barColor: 'from-red-400 to-red-500' },
            };

            const priorityLabels: Record<string, { label: string; color: string }> = {
              low: { label: 'Низкий', color: 'bg-gray-100 text-gray-600' },
              medium: { label: 'Средний', color: 'bg-blue-100 text-blue-600' },
              high: { label: 'Высокий', color: 'bg-orange-100 text-orange-600' },
              urgent: { label: 'Срочный', color: 'bg-red-100 text-red-600' },
            };

            return (
              <>
                {/* Key Metrics Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="glass-card p-5">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-xl flex items-center justify-center">
                        <FileText className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <div className="text-3xl font-bold">{totalRequests}</div>
                        <div className="text-sm text-gray-500">Всего заявок</div>
                      </div>
                    </div>
                  </div>

                  <div className="glass-card p-5">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-emerald-500 rounded-xl flex items-center justify-center">
                        <CheckCircle className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <div className="text-3xl font-bold">{totalCompleted}</div>
                        <div className="text-sm text-gray-500">Выполнено</div>
                      </div>
                    </div>
                  </div>

                  <div className="glass-card p-5">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-amber-500 rounded-xl flex items-center justify-center">
                        <Star className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <div className="text-3xl font-bold">{avgRat}</div>
                        <div className="text-sm text-gray-500">Средняя оценка</div>
                      </div>
                    </div>
                  </div>

                  <div className="glass-card p-5">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-violet-500 rounded-xl flex items-center justify-center">
                        <Users className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <div className="text-3xl font-bold">{totalResidents}</div>
                        <div className="text-sm text-gray-500">Жителей</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Time Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="glass-card p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Clock className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="font-semibold">Время реакции</div>
                        <div className="text-sm text-gray-500">от создания до назначения</div>
                      </div>
                    </div>
                    <div className="text-4xl font-bold text-blue-600">{avgResponseTime} мин</div>
                  </div>

                  <div className="glass-card p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                        <Clock className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <div className="font-semibold">Время выполнения</div>
                        <div className="text-sm text-gray-500">среднее время работы</div>
                      </div>
                    </div>
                    <div className="text-4xl font-bold text-green-600">{avgCompTime} мин</div>
                  </div>
                </div>

                {/* Status & Category Breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Status Breakdown */}
                  <div className="glass-card p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <Zap className="w-5 h-5 text-gray-400" />
                      Статусы заявок
                    </h3>
                    <div className="space-y-3">
                      {Object.entries(statusBreakdown)
                        .sort((a, b) => b[1] - a[1])
                        .map(([status, count]) => {
                          const info = statusLabels[status] || { label: status, color: 'bg-gray-100 text-gray-600', barColor: 'from-gray-400 to-gray-500' };
                          const percentage = totalRequests > 0 ? Math.round((count / totalRequests) * 100) : 0;
                          return (
                            <div key={status} className="flex items-center gap-3">
                              <div className="w-24">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${info.color}`}>
                                  {info.label}
                                </span>
                              </div>
                              <div className="flex-1">
                                <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full bg-gradient-to-r ${info.barColor} rounded-full transition-all`}
                                    style={{ width: `${percentage}%` }}
                                  />
                                </div>
                              </div>
                              <div className="w-16 text-right">
                                <span className="font-bold">{count}</span>
                                <span className="text-gray-400 text-sm ml-1">({percentage}%)</span>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  {/* Category Breakdown */}
                  <div className="glass-card p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <PieChart className="w-5 h-5 text-gray-400" />
                      По категориям (специалистам)
                    </h3>
                    <div className="space-y-3">
                      {Object.entries(catBreakdown)
                        .sort((a, b) => b[1] - a[1])
                        .map(([category, count]) => {
                          const label = SPECIALIZATION_LABELS[category as keyof typeof SPECIALIZATION_LABELS] || category;
                          const percentage = totalRequests > 0 ? Math.round((count / totalRequests) * 100) : 0;
                          const colors = {
                            plumber: 'from-blue-400 to-blue-500',
                            electrician: 'from-orange-400 to-orange-500',
                            security: 'from-red-400 to-red-500',
                            cleaning: 'from-green-400 to-emerald-500',
                            elevator: 'from-purple-400 to-violet-500',
                            intercom: 'from-indigo-400 to-indigo-500',
                            carpenter: 'from-amber-400 to-amber-500',
                            locksmith: 'from-gray-400 to-gray-500',
                            other: 'from-pink-400 to-pink-500',
                          };
                          const color = colors[category as keyof typeof colors] || 'from-gray-400 to-gray-500';
                          return (
                            <div key={category} className="flex items-center gap-3">
                              <div className="w-28 truncate">
                                <span className="text-sm font-medium">{label}</span>
                              </div>
                              <div className="flex-1">
                                <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full bg-gradient-to-r ${color} rounded-full transition-all`}
                                    style={{ width: `${percentage}%` }}
                                  />
                                </div>
                              </div>
                              <div className="w-16 text-right">
                                <span className="font-bold">{count}</span>
                                <span className="text-gray-400 text-sm ml-1">({percentage}%)</span>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>

                {/* Priority Breakdown */}
                <div className="glass-card p-6">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-gray-400" />
                    Приоритеты заявок
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {Object.entries(priorityLabels).map(([priority, info]) => {
                      const count = priorityBreakdown[priority] || 0;
                      return (
                        <div key={priority} className={`p-4 rounded-xl ${info.color}`}>
                          <div className="text-3xl font-bold">{count}</div>
                          <div className="text-sm font-medium mt-1">{info.label}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Cancelled Requests Details */}
                {cancelledRequests.length > 0 && (
                  <div className="glass-card p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-red-600">
                      <AlertCircle className="w-5 h-5" />
                      Отменённые заявки ({cancelledRequests.length})
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-gray-500 border-b">
                            <th className="pb-2 font-medium">№</th>
                            <th className="pb-2 font-medium">Заявка</th>
                            <th className="pb-2 font-medium">Категория</th>
                            <th className="pb-2 font-medium">Адрес</th>
                            <th className="pb-2 font-medium">Дата</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {cancelledRequests.slice(0, 10).map(req => (
                            <tr key={req.id} className="hover:bg-white/50">
                              <td className="py-2 font-mono text-gray-500">#{req.number}</td>
                              <td className="py-2 font-medium">{req.title}</td>
                              <td className="py-2">
                                <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">
                                  {SPECIALIZATION_LABELS[req.category as keyof typeof SPECIALIZATION_LABELS]}
                                </span>
                              </td>
                              <td className="py-2 text-gray-500">{req.address}, кв. {req.apartment}</td>
                              <td className="py-2 text-gray-400">
                                {new Date(req.createdAt).toLocaleDateString('ru-RU')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {cancelledRequests.length > 10 && (
                        <div className="text-center text-gray-400 text-sm mt-3">
                          И ещё {cancelledRequests.length - 10} отменённых заявок...
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {reportType === 'general' && (
        <>
          {/* Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-card p-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-xl flex items-center justify-center">
                  <FileText className="w-6 h-6 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-3xl font-bold">{filteredRequests.length}</span>
                    {advancedMetrics.requestsTrend !== 0 && (
                      <span className={`flex items-center text-sm ${advancedMetrics.requestsTrend > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {advancedMetrics.requestsTrend > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                        {Math.abs(advancedMetrics.requestsTrend)}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500">Всего заявок</div>
                </div>
              </div>
            </div>

            <div className="glass-card p-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-emerald-500 rounded-xl flex items-center justify-center">
                  <Percent className="w-6 h-6 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-3xl font-bold">{advancedMetrics.completionRate}%</span>
                    {advancedMetrics.completionTrend !== 0 && (
                      <span className={`flex items-center text-sm ${advancedMetrics.completionTrend > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {advancedMetrics.completionTrend > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                        {Math.abs(advancedMetrics.completionTrend)}%
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500">Выполнено</div>
                </div>
              </div>
            </div>

            <div className="glass-card p-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-amber-500 rounded-xl flex items-center justify-center">
                  <Star className="w-6 h-6 text-white" />
                </div>
                <div>
                  <div className="text-3xl font-bold">{avgRating}</div>
                  <div className="text-sm text-gray-500">Средний рейтинг</div>
                </div>
              </div>
            </div>

            <div className="glass-card p-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-violet-500 rounded-xl flex items-center justify-center">
                  <Timer className="w-6 h-6 text-white" />
                </div>
                <div>
                  <div className="text-3xl font-bold">{advancedMetrics.avgResponseTime}</div>
                  <div className="text-sm text-gray-500">Время реакции (мин)</div>
                </div>
              </div>
            </div>
          </div>

          {/* Efficiency Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="glass-card p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span className="font-medium">Выполнено</span>
                </div>
                <span className="text-2xl font-bold text-green-600">{completedRequests.length}</span>
              </div>
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-400 to-green-500 rounded-full"
                  style={{ width: `${advancedMetrics.completionRate}%` }}
                />
              </div>
            </div>

            <div className="glass-card p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-500" />
                  <span className="font-medium">Время выполнения</span>
                </div>
                <span className="text-2xl font-bold text-amber-600">{avgCompletionTime} мин</span>
              </div>
              <div className="text-sm text-gray-500">Среднее время работы над заявкой</div>
            </div>

            <div className="glass-card p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                  <span className="font-medium">Отменено</span>
                </div>
                <span className="text-2xl font-bold text-red-600">{advancedMetrics.cancelledRate}%</span>
              </div>
              <div className="text-sm text-gray-500">Процент отмененных заявок</div>
            </div>
          </div>

          {/* Best Executor Card */}
          {advancedMetrics.bestExecutor && advancedMetrics.bestExecutor.periodCompleted > 0 && (
            <div className="glass-card p-5 bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-200">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center">
                  <Award className="w-7 h-7 text-white" />
                </div>
                <div className="flex-1">
                  <div className="text-sm text-amber-700 font-medium">Лучший исполнитель периода</div>
                  <div className="text-xl font-bold text-gray-900">{advancedMetrics.bestExecutor.name}</div>
                  <div className="text-sm text-gray-600">
                    {SPECIALIZATION_LABELS[advancedMetrics.bestExecutor.specialization]} •
                    {advancedMetrics.bestExecutor.periodCompleted} выполнено •
                    <Star className="w-3 h-3 inline text-amber-500 ml-1" />
                    {advancedMetrics.bestExecutor.periodAvgRating.toFixed(1)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-amber-600">{advancedMetrics.bestExecutor.efficiency}%</div>
                  <div className="text-sm text-amber-700">эффективность</div>
                </div>
              </div>
            </div>
          )}

          {/* Charts Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Category Distribution */}
            <div className="glass-card p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <PieChart className="w-5 h-5 text-gray-400" />
                Распределение по категориям
              </h2>
              <div className="space-y-3">
                {Object.entries(categoryStats).map(([category, stats]) => (
                  <div key={category} className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{SPECIALIZATION_LABELS[category as keyof typeof SPECIALIZATION_LABELS]}</span>
                        <span className="text-sm text-gray-500">{stats.total}</span>
                      </div>
                      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-primary-400 to-primary-500 rounded-full"
                          style={{ width: `${(stats.completed / stats.total) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Status Distribution */}
            <div className="glass-card p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-gray-400" />
                Статусы заявок
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold text-blue-600">
                    {filteredRequests.filter(r => r.status === 'new').length}
                  </div>
                  <div className="text-sm text-blue-700">Новых</div>
                </div>
                <div className="bg-indigo-50 rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold text-indigo-600">
                    {filteredRequests.filter(r => r.status === 'assigned' || r.status === 'accepted').length}
                  </div>
                  <div className="text-sm text-indigo-700">Назначено</div>
                </div>
                <div className="bg-amber-50 rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold text-amber-600">
                    {filteredRequests.filter(r => r.status === 'in_progress').length}
                  </div>
                  <div className="text-sm text-amber-700">В работе</div>
                </div>
                <div className="bg-green-50 rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold text-green-600">
                    {filteredRequests.filter(r => r.status === 'completed').length}
                  </div>
                  <div className="text-sm text-green-700">Выполнено</div>
                </div>
              </div>
            </div>
          </div>

          {/* Top Executors */}
          <div className="glass-card p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-gray-400" />
              Топ исполнителей
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-gray-500 border-b border-gray-200">
                    <th className="pb-3 font-medium">#</th>
                    <th className="pb-3 font-medium">Исполнитель</th>
                    <th className="pb-3 font-medium">Специализация</th>
                    <th className="pb-3 font-medium text-center">Заявок</th>
                    <th className="pb-3 font-medium text-center">Выполнено</th>
                    <th className="pb-3 font-medium text-center">Рейтинг</th>
                    <th className="pb-3 font-medium text-center">Статус</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {executorStats.slice(0, 10).map((executor, index) => (
                    <tr key={executor.id} className="hover:bg-white/30">
                      <td className="py-3 text-gray-500">{index + 1}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center text-sm font-medium text-primary-700">
                            {executor.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </div>
                          <span className="font-medium">{executor.name}</span>
                        </div>
                      </td>
                      <td className="py-3 text-gray-600">{SPECIALIZATION_LABELS[executor.specialization]}</td>
                      <td className="py-3 text-center">{executor.requests}</td>
                      <td className="py-3 text-center">
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                          {executor.completedCount}
                        </span>
                      </td>
                      <td className="py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                          <span className="font-medium">{executor.rating}</span>
                        </div>
                      </td>
                      <td className="py-3 text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          executor.status === 'available' ? 'bg-green-100 text-green-700' :
                          executor.status === 'busy' ? 'bg-amber-100 text-amber-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {executor.status === 'available' ? 'Доступен' :
                           executor.status === 'busy' ? 'Занят' : 'Оффлайн'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
