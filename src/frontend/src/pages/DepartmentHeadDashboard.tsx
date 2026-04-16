import { useEffect } from 'react';
import { InstallAppSection } from '../components/InstallAppSection';
import { EmptyState } from '../components/common';
import { formatName } from '../utils/formatName';
import { PageSkeleton } from '../components/PageSkeleton';
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
import { useLanguageStore } from '../stores/languageStore';
import { SPECIALIZATION_LABELS, STATUS_LABELS, PRIORITY_LABELS } from '../types';
import type { ExecutorSpecialization } from '../types';

export function DepartmentHeadDashboard() {
  const { user } = useAuthStore();
  const {
    executors, requests,
    fetchRequests, fetchExecutors,
    isLoadingRequests, isLoadingExecutors
  } = useDataStore();
  const { language } = useLanguageStore();

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
    { name: language === 'ru' ? 'Новые' : 'Yangi', value: stats.new, color: '#3b82f6' },
    { name: language === 'ru' ? 'В работе' : 'Jarayonda', value: stats.inProgress, color: '#f59e0b' },
    { name: language === 'ru' ? 'Ожидают' : 'Kutilmoqda', value: stats.pendingApproval, color: '#8b5cf6' },
    { name: language === 'ru' ? 'Завершены' : 'Bajarilgan', value: stats.completed, color: '#10b981' },
  ];

  // Executor stats for chart
  const executorChartData = departmentExecutors.map(e => ({
    name: e.name.split(' ')[0],
    completed: e.completedCount,
    rating: e.rating,
  }));

  const getSpecializationLabel = () => {
    return SPECIALIZATION_LABELS[departmentSpecialization as ExecutorSpecialization] || (language === 'ru' ? 'Специалисты' : 'Mutaxassislar');
  };

  const isLoading = isLoadingRequests || isLoadingExecutors;

  return (
    <div className="space-y-4 md:space-y-6 xl:space-y-8 pb-24 md:pb-0">
      {/* Header with greeting */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-gray-400 font-medium mb-1">
            {language === 'ru'
              ? `${new Date().getHours() < 12 ? 'Доброе утро' : new Date().getHours() < 18 ? 'Добрый день' : 'Добрый вечер'}, ${user?.name?.split(' ')[0] || ''} 👋`
              : `${new Date().getHours() < 12 ? 'Xayrli tong' : new Date().getHours() < 18 ? 'Xayrli kun' : 'Xayrli kech'}, ${user?.name?.split(' ')[0] || ''} 👋`}
          </p>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-primary-500 rounded-xl flex items-center justify-center">
              <Wrench className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-gray-900">{language === 'ru' ? 'Отдел' : 'Bo\'lim'}: {getSpecializationLabel()}</h1>
            </div>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <PageSkeleton variant="dashboard" />
      )}

      {/* Content - only show when not loading */}
      {!isLoading && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 xl:gap-5">
            <Link to="/requests" className="glass-card p-3 sm:p-4 md:p-5 xl:p-6 hover:scale-[1.02] active:scale-[0.98] transition-transform touch-manipulation rounded-lg sm:rounded-xl">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-primary-500 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 md:w-6 md:h-6 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-2xl md:text-3xl font-bold">{stats.new}</div>
                  <div className="text-xs md:text-sm text-gray-500 truncate">{language === 'ru' ? 'Новые заявки' : 'Yangi arizalar'}</div>
                </div>
              </div>
            </Link>

            <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6 rounded-lg sm:rounded-xl">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-amber-500 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5 md:w-6 md:h-6 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-2xl md:text-3xl font-bold">{stats.inProgress}</div>
                  <div className="text-xs md:text-sm text-gray-500 truncate">{language === 'ru' ? 'В работе' : 'Jarayonda'}</div>
                </div>
              </div>
            </div>

            <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6 rounded-lg sm:rounded-xl">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-green-500 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-5 h-5 md:w-6 md:h-6 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-2xl md:text-3xl font-bold">{stats.completed}</div>
                  <div className="text-xs md:text-sm text-gray-500 truncate">{language === 'ru' ? 'Завершено' : 'Bajarildi'}</div>
                </div>
              </div>
            </div>

            <Link to="/executors" className="glass-card p-3 sm:p-4 md:p-5 xl:p-6 hover:scale-[1.02] active:scale-[0.98] transition-transform touch-manipulation rounded-lg sm:rounded-xl">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-purple-500 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0">
                  <Users className="w-5 h-5 md:w-6 md:h-6 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-2xl md:text-3xl font-bold" title={language === 'ru' ? `${stats.executorsOnline} онлайн из ${stats.executorsTotal} всего` : `${stats.executorsOnline} / ${stats.executorsTotal}`}>
                    {stats.executorsOnline}<span className="text-gray-400 text-lg"> / {stats.executorsTotal}</span>
                  </div>
                  <div className="text-xs md:text-sm text-gray-500 truncate">
                    {language === 'ru' ? 'Онлайн / Всего' : 'Onlayn / Jami'}
                  </div>
                </div>
              </div>
            </Link>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-3 md:gap-4 xl:gap-5">
            {/* Status Distribution */}
            <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
              <h3 className="font-bold text-base sm:text-lg md:text-xl xl:text-2xl mb-3 md:mb-4">{language === 'ru' ? 'Распределение заявок' : 'Arizalar taqsimoti'}</h3>
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
                    {language === 'ru' ? 'Нет заявок для отображения' : 'Ko\'rsatish uchun arizalar yo\'q'}
                  </div>
                )}
              </div>
            </div>

            {/* Executor Performance */}
            <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
              <h3 className="font-bold text-base sm:text-lg md:text-xl xl:text-2xl mb-3 md:mb-4">{language === 'ru' ? 'Производительность сотрудников' : 'Xodimlar samaradorligi'}</h3>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={executorChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="completed" fill="#3b82f6" name={language === 'ru' ? 'Завершено' : 'Bajarildi'} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Recent Requests */}
          <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-base sm:text-lg md:text-xl xl:text-2xl">{language === 'ru' ? 'Последние заявки' : 'Oxirgi arizalar'}</h3>
              <Link
                to="/requests"
                className="text-primary-600 text-sm hover:underline flex items-center gap-1 min-h-[44px] touch-manipulation active:text-primary-800"
              >
                {language === 'ru' ? 'Все заявки' : 'Barcha arizalar'} <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="space-y-3">
              {departmentRequests.slice(0, 5).map((request) => (
                <div
                  key={request.id}
                  className="flex items-center justify-between p-3 bg-white/50 rounded-lg sm:rounded-xl hover:bg-white/70 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      request.status === 'new' ? 'bg-blue-500' :
                      request.status === 'in_progress' ? 'bg-amber-500' :
                      request.status === 'completed' ? 'bg-green-500' : 'bg-gray-400'
                    }`} />
                    <div className="min-w-0">
                      <div className="font-medium truncate">#{request.number} {request.title}</div>
                      {request.category === 'trash' && (
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {request.title.includes(': ') && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-primary-100 text-primary-700 rounded-full text-xs font-medium">
                              {request.title.split(': ').slice(1).join(': ')}
                            </span>
                          )}
                          {request.description?.includes(language === 'ru' ? 'Объём: ' : 'Hajmi: ') && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                              {request.description.split('Объём: ')[1]?.split('\n')[0] || request.description.split('Hajmi: ')[1]?.split('\n')[0]}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="text-sm text-gray-500 truncate">{formatName(request.residentName)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-xs font-medium ${
                      request.status === 'new' ? 'bg-blue-100 text-blue-700' :
                      request.status === 'in_progress' ? 'bg-amber-100 text-amber-700' :
                      request.status === 'pending_approval' ? 'bg-purple-100 text-purple-700' :
                      request.status === 'completed' ? 'bg-green-100 text-green-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {STATUS_LABELS[request.status]}
                    </span>
                    <span className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-xs font-medium ${
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
                  {language === 'ru' ? 'Нет заявок по вашему отделу' : 'Bo\'limingiz bo\'yicha arizalar yo\'q'}
                </div>
              )}
            </div>
          </div>

          {/* Top Executors */}
          <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-base sm:text-lg md:text-xl xl:text-2xl">{language === 'ru' ? 'Лучшие сотрудники' : 'Eng yaxshi xodimlar'}</h3>
              <Link
                to="/executors"
                className="text-primary-600 text-sm hover:underline flex items-center gap-1 min-h-[44px] touch-manipulation active:text-primary-800"
              >
                {language === 'ru' ? 'Все сотрудники' : 'Barcha xodimlar'} <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="space-y-3">
              {departmentExecutors
                .sort((a, b) => b.completedCount - a.completedCount)
                .slice(0, 5)
                .map((executor, index) => (
                  <div key={executor.id} className="flex items-center gap-3 p-3 bg-white/50 rounded-lg sm:rounded-xl hover:bg-white/70 transition-colors">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${
                      index === 0 ? 'bg-orange-500' :
                      index === 1 ? 'bg-gray-400' :
                      index === 2 ? 'bg-amber-600' : 'bg-gray-300'
                    }`}>
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{executor.name}</div>
                      <div className="text-sm text-gray-500">{executor.completedCount} {language === 'ru' ? 'выполнено' : 'bajarildi'}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-xs font-medium ${
                        executor.status === 'available' ? 'bg-green-100 text-green-700' :
                        executor.status === 'busy' ? 'bg-amber-100 text-amber-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {executor.status === 'available' ? (language === 'ru' ? 'Свободен' : 'Bo\'sh') :
                         executor.status === 'busy' ? (language === 'ru' ? 'Занят' : 'Band') : (language === 'ru' ? 'Офлайн' : 'Oflayn')}
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
                  {language === 'ru' ? 'Нет сотрудников в вашем отделе' : 'Bo\'limingizda xodimlar yo\'q'}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Install App / Notifications */}
      <InstallAppSection language={language} roleContext="department_head" />
    </div>
  );
}
