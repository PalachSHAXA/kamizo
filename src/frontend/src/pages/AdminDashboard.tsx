import {
  Users, FileText, Clock, CheckCircle, AlertTriangle,
  RefreshCw, UserCheck
} from 'lucide-react';
import { useDataStore } from '../stores/dataStore';
import { SPECIALIZATION_LABELS } from '../types';

export function AdminDashboard() {
  const { requests, executors, getStats } = useDataStore();

  const stats = getStats();

  // Get pending approval requests that need attention
  const pendingApprovalRequests = requests.filter(r => r.status === 'pending_approval');

  // Get requests where resident hasn't approved for more than 24 hours
  const staleApprovals = pendingApprovalRequests.filter(r => {
    if (!r.completedAt) return false;
    const completedTime = new Date(r.completedAt).getTime();
    const hoursSinceCompletion = (Date.now() - completedTime) / (1000 * 60 * 60);
    return hoursSinceCompletion > 24;
  });

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header - mobile optimized */}
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 truncate">Панель администратора</h1>
          <p className="text-gray-500 text-sm md:text-base mt-0.5 md:mt-1">Мониторинг системы</p>
        </div>
        <button className="btn-secondary flex items-center gap-2 flex-shrink-0 py-2 px-3 md:py-2.5 md:px-4 touch-manipulation">
          <RefreshCw className="w-4 h-4" />
          <span className="hidden sm:inline">Обновить</span>
        </button>
      </div>

      {/* Alerts - mobile optimized */}
      {(staleApprovals.length > 0 || pendingApprovalRequests.length > 0) && (
        <div className="space-y-2 md:space-y-3">
          {staleApprovals.length > 0 && (
            <div className="glass-card p-3 md:p-4 border-2 border-red-400 bg-red-50/50 w-full text-left">
              <div className="flex items-center gap-2 md:gap-3">
                <AlertTriangle className="w-5 h-5 md:w-6 md:h-6 text-red-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-red-800 text-sm md:text-base">
                    {staleApprovals.length} заявок &gt;24ч
                  </div>
                  <div className="text-xs md:text-sm text-red-600 hidden sm:block">
                    Ожидают подтверждения
                  </div>
                </div>
              </div>
            </div>
          )}

          {pendingApprovalRequests.length > 0 && staleApprovals.length === 0 && (
            <div className="glass-card p-3 md:p-4 border-2 border-purple-400 bg-purple-50/50">
              <div className="flex items-center gap-2 md:gap-3">
                <Clock className="w-5 h-5 md:w-6 md:h-6 text-purple-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-purple-800 text-sm md:text-base">
                    {pendingApprovalRequests.length} ожидают подтверждения
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stats Cards - mobile optimized */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
        <div className="glass-card p-3 md:p-5">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-xl flex items-center justify-center flex-shrink-0">
              <FileText className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-2xl md:text-3xl font-bold">{stats.totalRequests}</div>
              <div className="text-xs md:text-sm text-gray-500 truncate">Всего</div>
            </div>
          </div>
        </div>

        <div className="glass-card p-3 md:p-5">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center flex-shrink-0">
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
            <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-purple-400 to-violet-500 rounded-xl flex items-center justify-center flex-shrink-0">
              <UserCheck className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-2xl md:text-3xl font-bold">{stats.pendingApproval}</div>
              <div className="text-xs md:text-sm text-gray-500 truncate">Ожидание</div>
            </div>
          </div>
        </div>

        <div className="glass-card p-3 md:p-5">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-green-400 to-emerald-500 rounded-xl flex items-center justify-center flex-shrink-0">
              <CheckCircle className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-2xl md:text-3xl font-bold">{stats.completedWeek}</div>
              <div className="text-xs md:text-sm text-gray-500 truncate">За неделю</div>
            </div>
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Executors Status */}
        <div className="glass-card p-4 md:p-5">
          <div className="flex items-center justify-between mb-3 md:mb-4">
            <h3 className="font-semibold text-base md:text-lg flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-500" />
              Исполнители
            </h3>
            <span className="text-sm text-gray-500">{executors.length} всего</span>
          </div>
          <div className="space-y-2 md:space-y-3">
            {executors.slice(0, 6).map((executor) => (
              <div key={executor.id} className="flex items-center justify-between p-2 md:p-3 bg-white/30 rounded-lg">
                <div className="flex items-center gap-2 md:gap-3 min-w-0">
                  <div className={`w-2.5 h-2.5 md:w-3 md:h-3 rounded-full flex-shrink-0 ${
                    executor.status === 'available' ? 'bg-green-500' :
                    executor.status === 'busy' ? 'bg-amber-500' : 'bg-gray-400'
                  }`} />
                  <div className="min-w-0">
                    <div className="font-medium text-sm md:text-base truncate">{executor.name}</div>
                    <div className="text-xs md:text-sm text-gray-500 truncate">
                      {SPECIALIZATION_LABELS[executor.specialization]}
                    </div>
                  </div>
                </div>
                <div className="text-right flex-shrink-0 ml-2">
                  <div className="font-semibold text-sm md:text-base">{executor.activeRequests}</div>
                  <div className="text-xs md:text-sm text-gray-500">заявок</div>
                </div>
              </div>
            ))}
            {executors.length === 0 && (
              <div className="text-center text-gray-500 py-4 text-sm">
                Нет исполнителей
              </div>
            )}
          </div>
        </div>

        {/* Requests by Status */}
        <div className="glass-card p-4 md:p-5">
          <h3 className="font-semibold text-base md:text-lg mb-3 md:mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-purple-500" />
            Заявки по статусам
          </h3>
          <div className="space-y-3 md:space-y-4">
            {[
              { status: 'new', label: 'Новые', color: 'bg-blue-500', gradientFrom: 'from-blue-400', gradientTo: 'to-blue-500' },
              { status: 'assigned', label: 'Назначенные', color: 'bg-indigo-500', gradientFrom: 'from-indigo-400', gradientTo: 'to-indigo-500' },
              { status: 'in_progress', label: 'В работе', color: 'bg-amber-500', gradientFrom: 'from-amber-400', gradientTo: 'to-amber-500' },
              { status: 'pending_approval', label: 'Ожидают', color: 'bg-purple-500', gradientFrom: 'from-purple-400', gradientTo: 'to-purple-500' },
              { status: 'completed', label: 'Выполненные', color: 'bg-green-500', gradientFrom: 'from-green-400', gradientTo: 'to-green-500' },
            ].map(({ status, label, gradientFrom, gradientTo }) => {
              const count = requests.filter(r => r.status === status).length;
              const percentage = stats.totalRequests > 0 ? (count / stats.totalRequests) * 100 : 0;
              return (
                <div key={status}>
                  <div className="flex items-center justify-between text-xs md:text-sm mb-1.5">
                    <span className="text-gray-700">{label}</span>
                    <span className="font-semibold">{count}</span>
                  </div>
                  <div className="h-2 md:h-2.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full bg-gradient-to-r ${gradientFrom} ${gradientTo} transition-all duration-500`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Performers */}
        <div className="glass-card p-4 md:p-5">
          <h3 className="font-semibold text-base md:text-lg mb-3 md:mb-4 flex items-center gap-2">
            <span className="text-yellow-500">★</span>
            Лучшие исполнители
          </h3>
          <div className="space-y-2 md:space-y-3">
            {[...executors]
              .sort((a, b) => b.completedCount - a.completedCount)
              .slice(0, 5)
              .map((executor, index) => (
                <div key={executor.id} className="flex items-center p-2 md:p-3 bg-white/30 rounded-lg">
                  <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
                    <div className={`w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center font-bold text-white text-sm flex-shrink-0 ${
                      index === 0 ? 'bg-orange-500' :
                      index === 1 ? 'bg-gray-400' :
                      index === 2 ? 'bg-amber-600' : 'bg-gray-300'
                    }`}>
                      {index + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-sm md:text-base truncate">{executor.name}</div>
                      <div className="flex items-center gap-1 md:gap-2 text-xs md:text-sm text-gray-500">
                        <span>★ {executor.rating}</span>
                        <span className="hidden sm:inline">•</span>
                        <span className="hidden sm:inline">{executor.completedCount} заявок</span>
                        <span className="sm:hidden">{executor.completedCount}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            {executors.length === 0 && (
              <div className="text-center text-gray-500 py-4 text-sm">
                Нет данных
              </div>
            )}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="glass-card p-4 md:p-5">
          <h3 className="font-semibold text-base md:text-lg mb-3 md:mb-4 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            Сводка
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/30 rounded-lg p-3">
              <div className="text-gray-500 text-xs md:text-sm">Всего заявок</div>
              <div className="font-bold text-xl md:text-2xl">{stats.totalRequests}</div>
            </div>
            <div className="bg-white/30 rounded-lg p-3">
              <div className="text-gray-500 text-xs md:text-sm">Исполнителей</div>
              <div className="font-bold text-xl md:text-2xl">{executors.length}</div>
            </div>
            <div className="bg-white/30 rounded-lg p-3">
              <div className="text-gray-500 text-xs md:text-sm">Выполнено</div>
              <div className="font-bold text-xl md:text-2xl text-green-600">{stats.completedWeek}</div>
            </div>
            <div className="bg-white/30 rounded-lg p-3">
              <div className="text-gray-500 text-xs md:text-sm">Активных</div>
              <div className="font-bold text-xl md:text-2xl text-amber-600">{stats.inProgress}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
