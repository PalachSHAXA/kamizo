import { useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from '../components/LazyCharts';
import {
  FileText, Users, Clock,
  Star, ChevronRight,
  Wrench, CheckCircle, Loader2
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { SPECIALIZATION_LABELS, STATUS_LABELS, PRIORITY_LABELS } from '../types';
import type { ExecutorSpecialization } from '../types';

export function DepartmentHeadDashboard() {
  const { user } = useAuthStore();
  const {
    executors, requests,
    fetchRequests, fetchExecutors,
    isLoadingRequests, isLoadingExecutors
  } = useDataStore();

  // Fetch data on mount
  useEffect(() => {
    fetchRequests();
    fetchExecutors();
  }, [fetchRequests, fetchExecutors]);

  // Get department specialization from user
  const departmentSpecialization = user?.specialization || 'plumber';

  // Filter requests and executors by department
  const departmentRequests = requests.filter(r => r.category === departmentSpecialization);
  const departmentExecutors = executors.filter(e => e.specialization === departmentSpecialization);

  // Department stats
  const stats = {
    total: departmentRequests.length,
    new: departmentRequests.filter(r => r.status === 'new').length,
    inProgress: departmentRequests.filter(r => ['assigned', 'accepted', 'in_progress'].includes(r.status)).length,
    completed: departmentRequests.filter(r => r.status === 'completed').length,
    pendingApproval: departmentRequests.filter(r => r.status === 'pending_approval').length,
    avgRating: departmentExecutors.length > 0
      ? departmentExecutors.reduce((sum, e) => sum + e.rating, 0) / departmentExecutors.length
      : 0,
    executorsOnline: departmentExecutors.filter(e => e.status === 'available').length,
    executorsTotal: departmentExecutors.length,
  };

  // Chart data
  const statusData = [
    { name: 'Новые', value: stats.new, color: '#3b82f6' },
    { name: 'В работе', value: stats.inProgress, color: '#f59e0b' },
    { name: 'Ожидают', value: stats.pendingApproval, color: '#8b5cf6' },
    { name: 'Завершены', value: stats.completed, color: '#10b981' },
  ];

  // Executor stats for chart
  const executorChartData = departmentExecutors.map(e => ({
    name: e.name.split(' ')[0],
    completed: e.completedCount,
    rating: e.rating,
  }));

  const getSpecializationLabel = () => {
    return SPECIALIZATION_LABELS[departmentSpecialization as ExecutorSpecialization] || 'Специалисты';
  };

  const isLoading = isLoadingRequests || isLoadingExecutors;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center">
              <Wrench className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-gray-900">Отдел: {getSpecializationLabel()}</h1>
              <p className="text-gray-500 text-sm">Глава отдела</p>
            </div>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="glass-card p-8 flex flex-col items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-3" />
          <p className="text-gray-600">Загрузка данных отдела...</p>
        </div>
      )}

      {/* Content - only show when not loading */}
      {!isLoading && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
            <Link to="/requests" className="glass-card p-3 md:p-5 hover:scale-[1.02] transition-transform">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-blue-500 rounded-xl flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 md:w-6 md:h-6 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-2xl md:text-3xl font-bold">{stats.new}</div>
                  <div className="text-xs md:text-sm text-gray-500 truncate">Новые заявки</div>
                </div>
              </div>
            </Link>

            <div className="glass-card p-3 md:p-5">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-amber-500 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5 md:w-6 md:h-6 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-2xl md:text-3xl font-bold">{stats.inProgress}</div>
                  <div className="text-xs md:text-sm text-gray-500 truncate">В работе</div>
                </div>
              </div>
            </div>

            <div className="glass-card p-3 md:p-5">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-green-500 rounded-xl flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-5 h-5 md:w-6 md:h-6 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-2xl md:text-3xl font-bold">{stats.completed}</div>
                  <div className="text-xs md:text-sm text-gray-500 truncate">Завершено</div>
                </div>
              </div>
            </div>

            <Link to="/executors" className="glass-card p-3 md:p-5 hover:scale-[1.02] transition-transform">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-purple-500 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Users className="w-5 h-5 md:w-6 md:h-6 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-2xl md:text-3xl font-bold">{stats.executorsOnline}/{stats.executorsTotal}</div>
                  <div className="text-xs md:text-sm text-gray-500 truncate">Сотрудники</div>
                </div>
              </div>
            </Link>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Status Distribution */}
            <div className="glass-card p-4 md:p-6">
              <h3 className="font-semibold mb-4">Распределение заявок</h3>
              <div className="h-[200px]">
                {statusData.some(d => d.value > 0) ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, value }: { name: string; value: number }) => `${name}: ${value}`}
                      >
                        {statusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400">
                    Нет заявок для отображения
                  </div>
                )}
              </div>
            </div>

            {/* Executor Performance */}
            <div className="glass-card p-4 md:p-6">
              <h3 className="font-semibold mb-4">Производительность сотрудников</h3>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={executorChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="completed" fill="#3b82f6" name="Завершено" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Recent Requests */}
          <div className="glass-card p-4 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Последние заявки</h3>
              <Link
                to="/requests"
                className="text-primary-600 text-sm hover:underline flex items-center gap-1"
              >
                Все заявки <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="space-y-3">
              {departmentRequests.slice(0, 5).map((request) => (
                <div
                  key={request.id}
                  className="flex items-center justify-between p-3 bg-white/50 rounded-xl"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      request.status === 'new' ? 'bg-blue-500' :
                      request.status === 'in_progress' ? 'bg-amber-500' :
                      request.status === 'completed' ? 'bg-green-500' : 'bg-gray-400'
                    }`} />
                    <div className="min-w-0">
                      <div className="font-medium truncate">#{request.number} {request.title}</div>
                      <div className="text-sm text-gray-500 truncate">{request.residentName}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      request.status === 'new' ? 'bg-blue-100 text-blue-700' :
                      request.status === 'in_progress' ? 'bg-amber-100 text-amber-700' :
                      request.status === 'pending_approval' ? 'bg-purple-100 text-purple-700' :
                      request.status === 'completed' ? 'bg-green-100 text-green-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {STATUS_LABELS[request.status]}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      request.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                      request.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {PRIORITY_LABELS[request.priority]}
                    </span>
                  </div>
                </div>
              ))}
              {departmentRequests.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  Нет заявок по вашему отделу
                </div>
              )}
            </div>
          </div>

          {/* Top Executors */}
          <div className="glass-card p-4 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Лучшие сотрудники</h3>
              <Link
                to="/executors"
                className="text-primary-600 text-sm hover:underline flex items-center gap-1"
              >
                Все сотрудники <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="space-y-3">
              {departmentExecutors
                .sort((a, b) => b.completedCount - a.completedCount)
                .slice(0, 5)
                .map((executor, index) => (
                  <div key={executor.id} className="flex items-center gap-3 p-3 bg-white/50 rounded-xl">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${
                      index === 0 ? 'bg-orange-500' :
                      index === 1 ? 'bg-gray-400' :
                      index === 2 ? 'bg-amber-600' : 'bg-gray-300'
                    }`}>
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{executor.name}</div>
                      <div className="text-sm text-gray-500">{executor.completedCount} выполнено</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        executor.status === 'available' ? 'bg-green-100 text-green-700' :
                        executor.status === 'busy' ? 'bg-amber-100 text-amber-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {executor.status === 'available' ? 'Свободен' :
                         executor.status === 'busy' ? 'Занят' : 'Офлайн'}
                      </span>
                      <div className="flex items-center gap-1 text-amber-500">
                        <Star className="w-4 h-4 fill-current" />
                        <span className="font-medium">{executor.rating.toFixed(1)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              {departmentExecutors.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  Нет сотрудников в вашем отделе
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
