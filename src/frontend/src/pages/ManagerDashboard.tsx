import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell
} from '../components/LazyCharts';
import {
  FileText, Clock, TrendingUp, X,
  Phone, Star, Trash2, Eye, EyeOff, Copy, Check, AlertCircle,
  Home, UserPlus, MapPin, Calendar, User, ChevronRight,
  Download, CalendarDays, RefreshCw
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { formatAddress } from '../utils/formatAddress';
import { SPECIALIZATION_LABELS, STATUS_LABELS, PRIORITY_LABELS, RESCHEDULE_REASON_LABELS, RESCHEDULE_STATUS_LABELS } from '../types';
import type { ExecutorSpecialization, Request, RequestStatus, RequestPriority, Executor, RescheduleRequest } from '../types';

// Format request number - if it's already formatted (e.g., YS-L-1001 or #ABC123), don't add #
const formatRequestNumber = (num: number | string): string => {
  if (typeof num === 'string') {
    // Already has prefix (YS-L-1001) or # symbol
    if (num.includes('-') || num.startsWith('#')) {
      return num;
    }
  }
  return `#${num}`;
};

export function ManagerDashboard() {
  const navigate = useNavigate();
  const {
    executors, requests, getStats, getChartData,
    addExecutor, deleteExecutor, updateExecutor, assignRequest, rescheduleRequests
  } = useDataStore();
  // Data is now fetched automatically by useRealtimeSync hook in Layout

  const stats = getStats();
  const chartData = getChartData();

  const [showAddExecutorModal, setShowAddExecutorModal] = useState(false);
  const [showAddResidentModal, setShowAddResidentModal] = useState(false);
  const [showCredentials, setShowCredentials] = useState<{ login: string; password: string } | null>(null);
  const [showAssignModal, setShowAssignModal] = useState<Request | null>(null);
  const [selectedExecutor, setSelectedExecutor] = useState<Executor | null>(null);
  const [selectedReschedule, setSelectedReschedule] = useState<RescheduleRequest | null>(null);

  // Get pending reschedule requests (менеджер видит все активные запросы на перенос)
  const pendingReschedules = rescheduleRequests.filter(r => r.status === 'pending');
  const recentReschedules = rescheduleRequests
    .filter(r => r.status !== 'pending')
    .sort((a, b) => new Date(b.respondedAt || b.createdAt).getTime() - new Date(a.respondedAt || a.createdAt).getTime())
    .slice(0, 5);

  // Removed filters - now on separate pages

  // Category colors - consistent with ReportsPage
  const CATEGORY_COLORS: Record<string, string> = {
    plumber: '#3b82f6',      // blue
    electrician: '#f59e0b',   // amber/orange
    security: '#ef4444',      // red
    cleaning: '#10b981',      // green/emerald
    elevator: '#8b5cf6',      // purple/violet
    intercom: '#6366f1',      // indigo
    carpenter: '#d97706',     // amber darker
    locksmith: '#6b7280',     // gray
    other: '#ec4899',         // pink
  };

  // Pie chart data for request categories
  const categoryData = Object.entries(
    requests.reduce((acc, r) => {
      acc[r.category] = (acc[r.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  ).map(([category, value]) => ({
    name: SPECIALIZATION_LABELS[category as ExecutorSpecialization] || category,
    value,
    color: CATEGORY_COLORS[category] || '#9ca3af',
  }));

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="min-w-0">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 truncate">Панель менеджера</h1>
        <p className="text-gray-500 text-sm md:text-base mt-0.5 md:mt-1 truncate">Управление заявками и исполнителями</p>
      </div>

      {/* Overview - Stats Cards */}
      <>
          {/* Stats Cards - 2 columns on mobile */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
            <div
              className="glass-card p-3 md:p-5 cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => navigate('/requests?status=new')}
            >
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-blue-500 rounded-xl flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 md:w-6 md:h-6 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-2xl md:text-3xl font-bold">{stats.newRequests}</div>
                  <div className="text-xs md:text-sm text-gray-500 truncate">Новые</div>
                </div>
              </div>
            </div>

            <div
              className="glass-card p-3 md:p-5 cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => navigate('/requests?status=in_progress')}
            >
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

            <div
              className="glass-card p-3 md:p-5 cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => navigate('/requests?status=pending_approval')}
            >
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-purple-500 rounded-xl flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-5 h-5 md:w-6 md:h-6 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-2xl md:text-3xl font-bold">{stats.pendingApproval}</div>
                  <div className="text-xs md:text-sm text-gray-500 truncate">Ожидают</div>
                </div>
              </div>
            </div>

            <div
              className="glass-card p-3 md:p-5 cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => navigate('/requests?status=completed')}
            >
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-green-500 rounded-xl flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="w-5 h-5 md:w-6 md:h-6 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-2xl md:text-3xl font-bold">{stats.completedWeek}</div>
                  <div className="text-xs md:text-sm text-gray-500 truncate">За неделю</div>
                </div>
              </div>
            </div>
          </div>

          {/* Charts Row - Stack on mobile */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            <div className="glass-card p-4 md:p-6">
              <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4">Заявки за неделю</h2>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" stroke="#6b7280" tick={{ fontSize: 12 }} />
                  <YAxis stroke="#6b7280" tick={{ fontSize: 12 }} width={30} />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(255, 255, 255, 0.9)',
                      borderRadius: '12px',
                      border: '1px solid rgba(255, 255, 255, 0.5)',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="created" name="Создано" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="completed" name="Выполнено" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="glass-card p-4 md:p-6">
              <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4">По категориям</h2>
              {categoryData.length > 0 && categoryData.some(d => d.value > 0) ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }: any) => `${(name || '').slice(0, 6)}... ${((percent || 0) * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-gray-400">
                  Нет данных для отображения
                </div>
              )}
            </div>
          </div>

          {/* Reschedule Requests Section */}
          {pendingReschedules.length > 0 && (
            <div className="glass-card p-4 md:p-6 border-2 border-amber-400 bg-amber-50/50">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-amber-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <RefreshCw className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-bold text-amber-800">Запросы на перенос времени</h2>
                  <p className="text-sm text-amber-600">
                    {pendingReschedules.length} {pendingReschedules.length === 1 ? 'запрос ожидает' : 'запросов ожидают'} ответа
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {pendingReschedules.map((reschedule) => (
                  <RescheduleRequestCard
                    key={reschedule.id}
                    reschedule={reschedule}
                    onClick={() => setSelectedReschedule(reschedule)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Recent Reschedules History */}
          {recentReschedules.length > 0 && (
            <div className="glass-card p-4 md:p-6">
              <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4">История переносов</h2>
              <div className="space-y-2">
                {recentReschedules.map((reschedule) => (
                  <RescheduleHistoryCard
                    key={reschedule.id}
                    reschedule={reschedule}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Recent Requests */}
          <div className="glass-card p-4 md:p-6">
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <h2 className="text-base md:text-lg font-semibold">Последние заявки</h2>
              <a href="/requests" className="text-primary-600 text-sm font-medium hover:underline touch-manipulation">
                Все →
              </a>
            </div>
            <div className="space-y-2 md:space-y-3">
              {requests.slice(0, 5).map((request) => (
                <RequestCard
                  key={request.id}
                  request={request}
                  onAssign={() => setShowAssignModal(request)}
                  compact
                />
              ))}
            </div>
          </div>
        </>

      {/* Modals */}
      {showAddExecutorModal && (
        <AddExecutorModal
          onClose={() => setShowAddExecutorModal(false)}
          onAdd={(data) => {
            addExecutor(data);
            setShowCredentials({ login: data.login, password: data.password });
            setShowAddExecutorModal(false);
          }}
        />
      )}

      {showAddResidentModal && (
        <AddResidentModal
          onClose={() => setShowAddResidentModal(false)}
        />
      )}

      {showCredentials && (
        <CredentialsModal
          login={showCredentials.login}
          password={showCredentials.password}
          onClose={() => setShowCredentials(null)}
        />
      )}

      {showAssignModal && (
        <AssignExecutorModal
          request={showAssignModal}
          executors={executors}
          onClose={() => setShowAssignModal(null)}
          onAssign={(executorId) => {
            assignRequest(showAssignModal.id, executorId);
            setShowAssignModal(null);
          }}
        />
      )}

      {selectedExecutor && (
        <ExecutorDetailsModal
          executor={selectedExecutor}
          requests={requests}
          onClose={() => setSelectedExecutor(null)}
          onStatusChange={(status) => {
            updateExecutor(selectedExecutor.id, { status });
            setSelectedExecutor({ ...selectedExecutor, status });
          }}
          onDelete={() => {
            deleteExecutor(selectedExecutor.id);
            setSelectedExecutor(null);
          }}
        />
      )}

      {selectedReschedule && (
        <RescheduleDetailsModal
          reschedule={selectedReschedule}
          onClose={() => setSelectedReschedule(null)}
        />
      )}
    </div>
  );
}

// Request Card Component
function RequestCard({
  request,
  onAssign,
  compact = false
}: {
  request: Request;
  onAssign: () => void;
  compact?: boolean;
}) {
  const getStatusBadge = (status: RequestStatus) => {
    const colors: Record<RequestStatus, string> = {
      new: 'bg-purple-100 text-purple-700',
      assigned: 'bg-blue-100 text-blue-700',
      accepted: 'bg-cyan-100 text-cyan-700',
      in_progress: 'bg-amber-100 text-amber-700',
      pending_approval: 'bg-orange-100 text-orange-700',
      completed: 'bg-green-100 text-green-700',
      cancelled: 'bg-red-100 text-red-700'
    };
    return <span className={`badge ${colors[status]}`}>{STATUS_LABELS[status]}</span>;
  };

  const getPriorityBadge = (priority: RequestPriority) => {
    const colors: Record<RequestPriority, string> = {
      low: 'bg-gray-100 text-gray-600',
      medium: 'bg-yellow-100 text-yellow-700',
      high: 'bg-orange-100 text-orange-700',
      urgent: 'bg-red-100 text-red-700'
    };
    return <span className={`badge ${colors[priority]}`}>{PRIORITY_LABELS[priority]}</span>;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (compact) {
    return (
      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 md:p-3 bg-white/30 rounded-xl hover:bg-white/50 transition-colors touch-manipulation gap-2">
        <div className="flex items-center gap-2 md:gap-3 flex-wrap min-w-0">
          <span className="text-xs md:text-sm text-gray-500">{formatRequestNumber(request.number)}</span>
          <span className="font-medium text-sm md:text-base truncate">{request.title}</span>
          {getStatusBadge(request.status)}
        </div>
        <div className="flex items-center gap-2 md:gap-3 justify-between sm:justify-end">
          <span className="text-xs md:text-sm text-gray-500 truncate">{request.residentName}</span>
          {request.status === 'new' && (
            <button onClick={onAssign} className="btn-secondary text-xs md:text-sm py-1 px-2 md:px-3 touch-manipulation flex-shrink-0">
              Назначить
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-3 md:p-5">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 md:gap-3 flex-wrap mb-2">
            <span className="text-xs md:text-sm text-gray-500">{formatRequestNumber(request.number)}</span>
            <h3 className="font-semibold text-base md:text-lg">{request.title}</h3>
            {getStatusBadge(request.status)}
            {getPriorityBadge(request.priority)}
          </div>
          <p className="text-gray-600 mb-2 md:mb-3 text-sm md:text-base line-clamp-2">{request.description}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs md:text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <User className="w-3 h-3 md:w-4 md:h-4" />
              {request.residentName}
            </span>
            <span className="flex items-center gap-1">
              <Phone className="w-3 h-3 md:w-4 md:h-4" />
              {request.residentPhone}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3 md:w-4 md:h-4" />
              <span className="truncate max-w-[120px] md:max-w-none">{formatAddress(request.address, request.apartment)}</span>
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3 md:w-4 md:h-4" />
              {formatDate(request.createdAt)}
            </span>
          </div>
          {request.executorName && (
            <div className="mt-2 text-xs md:text-sm">
              <span className="text-gray-500">Исполнитель: </span>
              <span className="font-medium">{request.executorName}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {request.status === 'new' && (
            <button onClick={onAssign} className="btn-primary flex items-center gap-2 py-2 px-3 md:py-2.5 md:px-4 touch-manipulation text-sm">
              <UserPlus className="w-4 h-4" />
              <span className="hidden sm:inline">Назначить</span>
              <span className="sm:hidden">Назн.</span>
            </button>
          )}
          {request.status === 'assigned' && (
            <button onClick={onAssign} className="btn-secondary flex items-center gap-2 py-2 px-3 touch-manipulation text-sm">
              <span className="hidden sm:inline">Переназначить</span>
              <span className="sm:hidden">Перен.</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Executor Card Component - used in ExecutorsPage
export function ExecutorCard({
  executor,
  onClick,
  onDelete,
  onStatusChange
}: {
  executor: Executor;
  onClick: () => void;
  onDelete: () => void;
  onStatusChange: (status: 'available' | 'busy' | 'offline') => void;
}) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'available': return <span className="badge bg-green-100 text-green-700 text-xs">Доступен</span>;
      case 'busy': return <span className="badge bg-amber-100 text-amber-700 text-xs">Занят</span>;
      case 'offline': return <span className="badge bg-gray-100 text-gray-600 text-xs">Оффлайн</span>;
      default: return <span className="badge text-xs">{status}</span>;
    }
  };

  return (
    <div
      onClick={onClick}
      className="flex flex-col sm:flex-row sm:items-center justify-between p-3 md:p-4 bg-white/30 rounded-xl hover:bg-white/50 transition-colors gap-3 cursor-pointer active:scale-[0.99] touch-manipulation"
    >
      <div className="flex items-center gap-3 md:gap-4 min-w-0 flex-1">
        <div className="w-10 h-10 md:w-12 md:h-12 bg-primary-100 rounded-full flex items-center justify-center text-sm md:text-lg font-medium text-primary-700 flex-shrink-0">
          {executor.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold flex items-center gap-2 flex-wrap text-sm md:text-base">
            <span className="truncate">{executor.name}</span>
            {getStatusBadge(executor.status)}
          </div>
          <div className="text-xs md:text-sm text-gray-500 truncate">
            {SPECIALIZATION_LABELS[executor.specialization as ExecutorSpecialization]}
          </div>
          <div className="flex items-center gap-2 md:gap-4 text-xs md:text-sm text-gray-500 mt-1 flex-wrap">
            <span className="flex items-center gap-1">
              <Phone className="w-3 h-3" />
              <span className="hidden sm:inline">{executor.phone}</span>
            </span>
            <span className="flex items-center gap-1">
              <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
              {executor.rating.toFixed(1)}
            </span>
            <span className="hidden sm:inline">{executor.completedCount} вып.</span>
            <span>{executor.activeRequests} акт.</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-auto">
        <select
          value={executor.status}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            e.stopPropagation();
            onStatusChange(e.target.value as 'available' | 'busy' | 'offline');
          }}
          className="glass-input text-xs md:text-sm py-1.5 md:py-2 px-2 md:px-3"
        >
          <option value="available">Доступен</option>
          <option value="busy">Занят</option>
          <option value="offline">Оффлайн</option>
        </select>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors touch-manipulation"
          title="Удалить"
        >
          <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
        </button>
        <ChevronRight className="w-5 h-5 text-gray-400 hidden sm:block" />
      </div>
    </div>
  );
}

// Residents Section - used in ResidentsPage
export function ResidentsSection() {
  const { requests } = useDataStore();

  // Get unique residents from requests
  const residents = Array.from(
    new Map(
      requests.map(r => [r.residentId, {
        id: r.residentId,
        name: r.residentName,
        phone: r.residentPhone,
        address: r.address,
        apartment: r.apartment
      }])
    ).values()
  );

  const getResidentStats = (residentId: string) => {
    const residentRequests = requests.filter(r => r.residentId === residentId);
    return {
      total: residentRequests.length,
      completed: residentRequests.filter(r => r.status === 'completed').length,
      active: residentRequests.filter(r => !['completed', 'cancelled'].includes(r.status)).length
    };
  };

  return (
    <div className="space-y-3 md:space-y-4">
      <div className="glass-card p-3 md:p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base md:text-lg font-semibold">Жители</h2>
            <p className="text-xs md:text-sm text-gray-500">{residents.length} жителей в системе</p>
          </div>
        </div>
      </div>

      <div className="space-y-2 md:space-y-3">
        {residents.length === 0 ? (
          <div className="glass-card p-6 md:p-8 text-center">
            <Home className="w-10 h-10 md:w-12 md:h-12 text-gray-300 mx-auto mb-2 md:mb-3" />
            <h3 className="text-base md:text-lg font-medium text-gray-600">Жителей пока нет</h3>
            <p className="text-gray-400 mt-1 text-sm">Жители появятся после создания заявок</p>
          </div>
        ) : (
          residents.map((resident) => {
            const stats = getResidentStats(resident.id);
            return (
              <div key={resident.id} className="glass-card p-3 md:p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 md:gap-4 min-w-0">
                    <div className="w-10 h-10 md:w-12 md:h-12 bg-blue-100 rounded-full flex items-center justify-center text-sm md:text-lg font-medium text-blue-700 flex-shrink-0">
                      {resident.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm md:text-base truncate">{resident.name}</div>
                      <div className="text-xs md:text-sm text-gray-500 flex flex-wrap items-center gap-2 md:gap-3">
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {resident.phone}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          <span className="truncate max-w-[100px] md:max-w-none">кв. {resident.apartment}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 md:gap-4 text-xs md:text-sm justify-end sm:justify-start flex-shrink-0">
                    <div className="text-center">
                      <div className="font-bold">{stats.total}</div>
                      <div className="text-gray-500">всего</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-green-600">{stats.completed}</div>
                      <div className="text-gray-500">вып.</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-amber-600">{stats.active}</div>
                      <div className="text-gray-500">акт.</div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// Reports Section - used in ReportsPage
export function ReportsSection({ requests, executors }: { requests: Request[]; executors: Executor[] }) {
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
    const headers = ['Исполнитель', 'Специализация', 'Всего заявок', 'Выполнено', 'Средний рейтинг', 'Среднее время (мин)'];
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
            <h2 className="text-lg font-semibold">Отчёты</h2>
            <p className="text-sm text-gray-500">
              {formatDate(start)} — {formatDate(end)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-white/30 rounded-xl p-1 gap-1">
              {[
                { id: 'today' as const, label: 'Сегодня' },
                { id: 'week' as const, label: 'Неделя' },
                { id: 'month' as const, label: 'Месяц' },
                { id: 'custom' as const, label: 'Период' },
              ].map(p => (
                <button
                  key={p.id}
                  onClick={() => setPeriod(p.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    period === p.id ? 'bg-primary-500 text-gray-900' : 'hover:bg-white/30'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button
              onClick={exportToExcel}
              className="btn-secondary flex items-center gap-2 py-2 px-3"
              title="Экспорт в Excel"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Экспорт</span>
            </button>
          </div>
        </div>

        {/* Custom date range */}
        {period === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-gray-200">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-500">С:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="glass-input py-1.5 px-3 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">По:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="glass-input py-1.5 px-3 text-sm"
              />
            </div>
          </div>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-3">
        <div className="glass-card p-3 text-center">
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-xs text-gray-500">Всего</div>
        </div>
        <div className="glass-card p-3 text-center">
          <div className="text-2xl font-bold text-purple-600">{stats.new}</div>
          <div className="text-xs text-gray-500">Новые</div>
        </div>
        <div className="glass-card p-3 text-center">
          <div className="text-2xl font-bold text-amber-600">{stats.inProgress}</div>
          <div className="text-xs text-gray-500">В работе</div>
        </div>
        <div className="glass-card p-3 text-center">
          <div className="text-2xl font-bold text-orange-600">{stats.pendingApproval}</div>
          <div className="text-xs text-gray-500">Ожидают</div>
        </div>
        <div className="glass-card p-3 text-center">
          <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
          <div className="text-xs text-gray-500">Выполнено</div>
        </div>
        <div className="glass-card p-3 text-center">
          <div className="text-2xl font-bold text-red-600">{stats.cancelled}</div>
          <div className="text-xs text-gray-500">Отменено</div>
        </div>
      </div>

      {/* Categories and Executors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* By Category */}
        <div className="glass-card p-4">
          <h3 className="text-base font-semibold mb-3">По категориям</h3>
          {categoryStats.length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-sm">
              Нет данных за выбранный период
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
          <h3 className="text-base font-semibold mb-3">Исполнители</h3>
          {executorStats.length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-sm">
              Нет данных за выбранный период
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
                      <span>Заявок: <b className="text-gray-700">{exec.total}</b></span>
                      <span>Выполнено: <b className="text-green-600">{exec.completed}</b></span>
                      {exec.avgTime > 0 && (
                        <span>Ср. время: <b className="text-gray-700">{exec.avgTime} мин</b></span>
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
        <h3 className="text-base font-semibold mb-3">Детальная статистика исполнителей</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-3 font-medium text-gray-500">Исполнитель</th>
                <th className="text-left py-2 px-3 font-medium text-gray-500">Специализация</th>
                <th className="text-center py-2 px-3 font-medium text-gray-500">Всего</th>
                <th className="text-center py-2 px-3 font-medium text-gray-500">Выполнено</th>
                <th className="text-center py-2 px-3 font-medium text-gray-500">Рейтинг</th>
                <th className="text-center py-2 px-3 font-medium text-gray-500">Ср. время</th>
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
                    {exec.avgTime > 0 ? `${exec.avgTime} мин` : '-'}
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

// Assign Executor Modal
function AssignExecutorModal({
  request,
  executors,
  onClose,
  onAssign
}: {
  request: Request;
  executors: any[];
  onClose: () => void;
  onAssign: (executorId: string) => void;
}) {
  // Filter executors by specialization
  const matchingExecutors = executors.filter(e => e.specialization === request.category);
  const otherExecutors = executors.filter(e => e.specialization !== request.category);

  const ExecutorOption = ({ executor, recommended }: { executor: any; recommended?: boolean }) => (
    <button
      onClick={() => onAssign(executor.id)}
      className={`w-full p-3 md:p-4 rounded-xl text-left transition-colors touch-manipulation ${
        recommended ? 'bg-green-50 hover:bg-green-100 border-2 border-green-200' : 'bg-white/30 hover:bg-white/50'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <div className="w-9 h-9 md:w-10 md:h-10 bg-primary-100 rounded-full flex items-center justify-center text-xs md:text-sm font-medium text-primary-700 flex-shrink-0">
            {executor.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
          </div>
          <div className="min-w-0">
            <div className="font-semibold flex items-center gap-1.5 md:gap-2 flex-wrap text-sm md:text-base">
              <span className="truncate">{executor.name}</span>
              {recommended && <span className="text-[10px] md:text-xs bg-green-500 text-white px-1.5 md:px-2 py-0.5 rounded-full flex-shrink-0">Рек.</span>}
            </div>
            <div className="text-xs md:text-sm text-gray-500 truncate">
              {SPECIALIZATION_LABELS[executor.specialization as ExecutorSpecialization]}
            </div>
          </div>
        </div>
        <div className="text-right text-xs md:text-sm flex-shrink-0">
          <div className="flex items-center gap-1 text-amber-500">
            <Star className="w-3 h-3 md:w-4 md:h-4 fill-amber-500" />
            {executor.rating}
          </div>
          <div className="text-gray-500">{executor.activeRequests} акт.</div>
        </div>
      </div>
    </button>
  );

  return (
    <div className="modal-backdrop">
      <div className="glass-card p-4 md:p-6 w-full max-w-lg mx-3 md:mx-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4 md:mb-6 gap-2">
          <div className="min-w-0">
            <h2 className="text-lg md:text-xl font-bold">Назначить исполнителя</h2>
            <p className="text-xs md:text-sm text-gray-500 mt-1 truncate">Заявка {formatRequestNumber(request.number)}: {request.title}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/30 rounded-lg touch-manipulation flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 md:space-y-4">
          {matchingExecutors.length > 0 && (
            <div>
              <h3 className="text-xs md:text-sm font-medium text-gray-500 mb-2">
                {SPECIALIZATION_LABELS[request.category as ExecutorSpecialization]} ({matchingExecutors.length})
              </h3>
              <div className="space-y-2">
                {matchingExecutors.map(executor => (
                  <ExecutorOption key={executor.id} executor={executor} recommended />
                ))}
              </div>
            </div>
          )}

          {otherExecutors.length > 0 && (
            <div>
              <h3 className="text-xs md:text-sm font-medium text-gray-500 mb-2">Другие специалисты</h3>
              <div className="space-y-2">
                {otherExecutors.map(executor => (
                  <ExecutorOption key={executor.id} executor={executor} />
                ))}
              </div>
            </div>
          )}

          {executors.length === 0 && (
            <div className="text-center py-6 md:py-8 text-gray-500 text-sm">
              Нет доступных исполнителей
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Add Executor Modal
function AddExecutorModal({
  onClose,
  onAdd
}: {
  onClose: () => void;
  onAdd: (data: { name: string; phone: string; login: string; password: string; specialization: ExecutorSpecialization }) => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [specialization, setSpecialization] = useState<ExecutorSpecialization>('plumber');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let pass = '';
    for (let i = 0; i < 10; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(pass);
    setShowPassword(true);
  };

  const generateLogin = () => {
    const prefix = specialization.slice(0, 3);
    const num = Math.floor(Math.random() * 900) + 100;
    setLogin(`${prefix}${num}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name || !phone || !login || !password) {
      setError('Заполните все поля');
      return;
    }

    onAdd({ name, phone, login, password, specialization });
  };

  return (
    <div className="modal-backdrop">
      <div className="glass-card p-4 md:p-6 w-full max-w-md mx-3 md:mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <h2 className="text-lg md:text-xl font-bold">Добавить исполнителя</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/30 rounded-lg touch-manipulation">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 md:space-y-4">
          <div>
            <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">ФИО</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Иванов Иван Иванович"
              className="glass-input text-sm md:text-base"
              required
            />
          </div>

          <div>
            <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">Телефон</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+998 90 XXX XX XX"
              className="glass-input text-sm md:text-base"
              required
            />
          </div>

          <div>
            <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">Специализация</label>
            <select
              value={specialization}
              onChange={(e) => setSpecialization(e.target.value as ExecutorSpecialization)}
              className="glass-input text-sm md:text-base"
            >
              {Object.entries(SPECIALIZATION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">Логин</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="plumber001"
                className="glass-input flex-1 text-sm md:text-base"
                required
              />
              <button type="button" onClick={generateLogin} className="btn-secondary px-2 md:px-4 text-xs md:text-sm touch-manipulation">
                <span className="hidden sm:inline">Сгенерировать</span>
                <span className="sm:hidden">Ген.</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">Пароль</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="glass-input pr-10 text-sm md:text-base"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 touch-manipulation"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <button type="button" onClick={generatePassword} className="btn-secondary px-2 md:px-4 text-xs md:text-sm touch-manipulation">
                <span className="hidden sm:inline">Сгенерировать</span>
                <span className="sm:hidden">Ген.</span>
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-2.5 md:p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs md:text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-2 md:gap-3 pt-3 md:pt-4">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 py-2.5 text-sm touch-manipulation">
              Отмена
            </button>
            <button type="submit" className="btn-primary flex-1 py-2.5 text-sm touch-manipulation">
              Добавить
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Available branches for the UK
const BRANCHES = [
  { code: 'YS', name: 'Юнусабад' },
  { code: 'CH', name: 'Чиланзар' },
  { code: 'SG', name: 'Сергели' },
  { code: 'MR', name: 'Мирзо-Улугбек' },
  { code: 'YK', name: 'Яккасарай' },
  { code: 'SH', name: 'Шайхантаур' },
  { code: 'UC', name: 'Учтепа' },
  { code: 'BK', name: 'Бектемир' },
];

// Add Resident Modal
function AddResidentModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [branch, setBranch] = useState('YS');
  const [building, setBuilding] = useState('');
  const [apartment, setApartment] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const { addMockUser } = useAuthStore.getState();

  // Auto-generate credentials when building/apartment changes
  const generateCredentials = () => {
    if (!building || !apartment) {
      setError('Сначала укажите дом и квартиру');
      return;
    }
    // Login: branch_building_apartment (e.g., YS_8A_23)
    const generatedLogin = `${branch}_${building}_${apartment}`.toUpperCase();
    setLogin(generatedLogin);
    // Password: BRANCH/BUILDING/APT (e.g., YS/8A/23)
    const generatedPassword = `${branch}/${building}/${apartment}`.toUpperCase();
    setPassword(generatedPassword);
    setShowPassword(true);
  };

  // Update login/password when branch/building/apartment changes if already generated
  const updateCredentialsIfNeeded = () => {
    if (login && password && building && apartment) {
      const expectedLogin = `${branch}_${building}_${apartment}`.toUpperCase();
      const expectedPassword = `${branch}/${building}/${apartment}`.toUpperCase();
      setLogin(expectedLogin);
      setPassword(expectedPassword);
    }
  };

  // Generate address from branch
  const getAddress = () => {
    const branchInfo = BRANCHES.find(b => b.code === branch);
    return branchInfo ? `${branchInfo.name}, дом ${building}` : `Дом ${building}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name || !phone || !building || !apartment || !login || !password) {
      setError('Заполните все обязательные поля');
      return;
    }

    const address = getAddress();

    addMockUser(login, password, {
      id: `resident_${Date.now()}`,
      phone,
      name,
      login,
      role: 'resident',
      address,
      apartment,
      branch,
      building
    });

    alert(`Житель добавлен!\nЛогин: ${login}\nПароль: ${password}`);
    onClose();
  };

  return (
    <div className="modal-backdrop">
      <div className="glass-card p-4 md:p-6 w-full max-w-md mx-3 md:mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <h2 className="text-lg md:text-xl font-bold">Добавить жителя</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/30 rounded-lg touch-manipulation">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 md:space-y-4">
          <div>
            <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">ФИО</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Иванов Иван Иванович"
              className="glass-input text-sm md:text-base"
              required
            />
          </div>

          <div>
            <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">Телефон</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+998 90 XXX XX XX"
              className="glass-input text-sm md:text-base"
              required
            />
          </div>

          {/* Location: Branch / Building / Apartment */}
          <div className="border-t pt-3 md:pt-4">
            <label className="block text-xs md:text-sm font-medium text-gray-700 mb-2">Расположение</label>
            <div className="grid grid-cols-3 gap-2 md:gap-3">
              <div>
                <label className="block text-[10px] md:text-xs text-gray-500 mb-1">Филиал</label>
                <select
                  value={branch}
                  onChange={(e) => {
                    setBranch(e.target.value);
                    updateCredentialsIfNeeded();
                  }}
                  className="glass-input text-sm md:text-base py-2"
                >
                  {BRANCHES.map(b => (
                    <option key={b.code} value={b.code}>{b.code} - {b.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] md:text-xs text-gray-500 mb-1">Дом</label>
                <input
                  type="text"
                  value={building}
                  onChange={(e) => {
                    setBuilding(e.target.value.toUpperCase());
                    updateCredentialsIfNeeded();
                  }}
                  placeholder="8A"
                  className="glass-input text-sm md:text-base"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] md:text-xs text-gray-500 mb-1">Кв.</label>
                <input
                  type="text"
                  value={apartment}
                  onChange={(e) => {
                    setApartment(e.target.value);
                    updateCredentialsIfNeeded();
                  }}
                  placeholder="23"
                  className="glass-input text-sm md:text-base"
                  required
                />
              </div>
            </div>
            {/* Preview address */}
            {building && (
              <div className="mt-2 text-xs text-gray-500 flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {getAddress()}, кв. {apartment || '...'}
              </div>
            )}
          </div>

          {/* Login credentials */}
          <div className="border-t pt-3 md:pt-4">
            <div className="flex items-center justify-between mb-2 md:mb-3">
              <span className="text-xs md:text-sm font-medium text-gray-700">Данные для входа</span>
              <button type="button" onClick={generateCredentials} className="btn-secondary text-xs md:text-sm py-1 px-2 md:px-3 touch-manipulation">
                Сгенерировать
              </button>
            </div>

            {/* Hint about password format */}
            <div className="mb-2 p-2 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-600">
              💡 Пароль будет в формате: <span className="font-mono font-bold">ФИЛИАЛ/ДОМ/КВАРТИРА</span>
              <br />
              Например: <span className="font-mono">YS/8A/23</span>
            </div>

            <div className="space-y-2 md:space-y-3">
              <div>
                <label className="block text-[10px] md:text-xs text-gray-500 mb-1">Логин</label>
                <input
                  type="text"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  placeholder="YS_8A_23"
                  className="glass-input text-sm md:text-base font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] md:text-xs text-gray-500 mb-1">Пароль</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="YS/8A/23"
                    className="glass-input pr-10 text-sm md:text-base font-mono"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 touch-manipulation"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-2.5 md:p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs md:text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-2 md:gap-3 pt-3 md:pt-4">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 py-2.5 text-sm touch-manipulation">
              Отмена
            </button>
            <button type="submit" className="btn-primary flex-1 py-2.5 text-sm touch-manipulation">
              Добавить
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Credentials Modal
function CredentialsModal({
  login,
  password,
  onClose
}: {
  login: string;
  password: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyCredentials = () => {
    navigator.clipboard.writeText(`Логин: ${login}\nПароль: ${password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-backdrop">
      <div className="glass-card p-4 md:p-6 w-full max-w-md mx-3 md:mx-4">
        <div className="text-center mb-4 md:mb-6">
          <div className="w-14 h-14 md:w-16 md:h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3 md:mb-4">
            <Check className="w-7 h-7 md:w-8 md:h-8 text-green-600" />
          </div>
          <h2 className="text-lg md:text-xl font-bold">Исполнитель добавлен!</h2>
          <p className="text-gray-500 mt-1.5 md:mt-2 text-sm md:text-base">Сохраните данные для входа</p>
        </div>

        <div className="bg-gray-50 rounded-xl p-3 md:p-4 space-y-2 md:space-y-3">
          <div>
            <div className="text-xs md:text-sm text-gray-500">Логин</div>
            <div className="font-mono text-base md:text-lg font-semibold">{login}</div>
          </div>
          <div>
            <div className="text-xs md:text-sm text-gray-500">Пароль</div>
            <div className="font-mono text-base md:text-lg font-semibold">{password}</div>
          </div>
        </div>

        <div className="flex gap-2 md:gap-3 mt-4 md:mt-6">
          <button
            onClick={copyCredentials}
            className="btn-secondary flex-1 flex items-center justify-center gap-2 py-2.5 text-sm touch-manipulation"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Скопировано!' : 'Копировать'}
          </button>
          <button onClick={onClose} className="btn-primary flex-1 py-2.5 text-sm touch-manipulation">
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}

// Executor Details Modal
function ExecutorDetailsModal({
  executor,
  requests,
  onClose,
  onStatusChange,
  onDelete
}: {
  executor: Executor;
  requests: Request[];
  onClose: () => void;
  onStatusChange: (status: 'available' | 'busy' | 'offline') => void;
  onDelete: () => void;
}) {
  const executorRequests = requests.filter(r => r.executorId === executor.id);
  const completedRequests = executorRequests.filter(r => r.status === 'completed');
  const activeRequests = executorRequests.filter(r => ['assigned', 'accepted', 'in_progress', 'pending_approval'].includes(r.status));

  // Calculate average completion time
  const avgTime = completedRequests.length > 0
    ? completedRequests.reduce((sum, r) => sum + (r.workDuration || 0), 0) / completedRequests.length
    : 0;

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds} сек`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} мин`;
    return `${Math.floor(seconds / 3600)}ч ${Math.floor((seconds % 3600) / 60)}мин`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'available': return <span className="badge bg-green-100 text-green-700">Доступен</span>;
      case 'busy': return <span className="badge bg-amber-100 text-amber-700">Занят</span>;
      case 'offline': return <span className="badge bg-gray-100 text-gray-600">Оффлайн</span>;
      default: return <span className="badge">{status}</span>;
    }
  };

  const getRequestStatusBadge = (status: string) => {
    const labels: Record<string, { bg: string; text: string; label: string }> = {
      'assigned': { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Назначена' },
      'accepted': { bg: 'bg-cyan-100', text: 'text-cyan-700', label: 'Принята' },
      'in_progress': { bg: 'bg-amber-100', text: 'text-amber-700', label: 'В работе' },
      'pending_approval': { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Ожидает' },
      'completed': { bg: 'bg-green-100', text: 'text-green-700', label: 'Выполнена' },
    };
    const info = labels[status] || { bg: 'bg-gray-100', text: 'text-gray-700', label: status };
    return <span className={`badge ${info.bg} ${info.text} text-xs`}>{info.label}</span>;
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="glass-card p-4 md:p-6 w-full max-w-lg mx-3 md:mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4 md:mb-6 gap-3">
          <div className="flex items-center gap-3 md:gap-4 min-w-0">
            <div className="w-14 h-14 md:w-16 md:h-16 bg-primary-100 rounded-full flex items-center justify-center text-lg md:text-xl font-bold text-primary-700 flex-shrink-0">
              {executor.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg md:text-xl font-bold truncate">{executor.name}</h2>
              <div className="flex items-center gap-2 flex-wrap mt-1">
                <span className="text-sm text-gray-500">
                  {SPECIALIZATION_LABELS[executor.specialization as ExecutorSpecialization]}
                </span>
                {getStatusBadge(executor.status)}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/30 rounded-lg touch-manipulation flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contact Info */}
        <div className="glass-card bg-white/30 p-3 md:p-4 rounded-xl mb-4">
          <div className="flex items-center gap-2 text-sm">
            <Phone className="w-4 h-4 text-gray-500" />
            <a href={`tel:${executor.phone}`} className="text-primary-600 font-medium">
              {executor.phone}
            </a>
          </div>
          <div className="flex items-center gap-2 text-sm mt-2">
            <User className="w-4 h-4 text-gray-500" />
            <span className="text-gray-600">Логин: <span className="font-mono">{executor.login}</span></span>
          </div>
          <div className="flex items-center gap-2 text-sm mt-2">
            <Calendar className="w-4 h-4 text-gray-500" />
            <span className="text-gray-600">Добавлен: {formatDate(executor.createdAt)}</span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mb-4">
          <div className="glass-card bg-white/30 p-3 text-center rounded-xl">
            <div className="flex items-center justify-center gap-1 text-amber-500 mb-1">
              <Star className="w-4 h-4 fill-amber-400" />
              <span className="text-xl md:text-2xl font-bold">{executor.rating.toFixed(1)}</span>
            </div>
            <div className="text-xs text-gray-500">Рейтинг</div>
          </div>
          <div className="glass-card bg-white/30 p-3 text-center rounded-xl">
            <div className="text-xl md:text-2xl font-bold text-green-600">{completedRequests.length}</div>
            <div className="text-xs text-gray-500">Выполнено</div>
          </div>
          <div className="glass-card bg-white/30 p-3 text-center rounded-xl">
            <div className="text-xl md:text-2xl font-bold text-blue-600">{activeRequests.length}</div>
            <div className="text-xs text-gray-500">Активных</div>
          </div>
          <div className="glass-card bg-white/30 p-3 text-center rounded-xl">
            <div className="text-xl md:text-2xl font-bold text-purple-600">{formatDuration(avgTime)}</div>
            <div className="text-xs text-gray-500">Ср. время</div>
          </div>
        </div>

        {/* Status Change */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Статус</label>
          <select
            value={executor.status}
            onChange={(e) => onStatusChange(e.target.value as 'available' | 'busy' | 'offline')}
            className="glass-input w-full"
          >
            <option value="available">Доступен</option>
            <option value="busy">Занят</option>
            <option value="offline">Оффлайн</option>
          </select>
        </div>

        {/* Active Requests */}
        {activeRequests.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Активные заявки</h3>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {activeRequests.map(request => (
                <div key={request.id} className="glass-card bg-white/30 p-2.5 rounded-lg">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-gray-400">{formatRequestNumber(request.number)}</span>
                        {getRequestStatusBadge(request.status)}
                      </div>
                      <div className="text-sm font-medium truncate">{request.title}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Completed */}
        {completedRequests.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Последние выполненные</h3>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {completedRequests.slice(0, 5).map(request => (
                <div key={request.id} className="glass-card bg-white/30 p-2.5 rounded-lg">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{formatRequestNumber(request.number)}</span>
                        {request.rating && (
                          <span className="flex items-center gap-0.5 text-xs text-amber-500">
                            <Star className="w-3 h-3 fill-amber-400" />
                            {request.rating}
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-medium truncate">{request.title}</div>
                    </div>
                    {request.workDuration && (
                      <span className="text-xs text-gray-500 flex-shrink-0">
                        {formatDuration(request.workDuration)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 md:gap-3 pt-2">
          <button
            onClick={onDelete}
            className="btn-secondary flex-1 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center justify-center gap-2 touch-manipulation"
          >
            <Trash2 className="w-4 h-4" />
            Удалить
          </button>
          <button onClick={onClose} className="btn-primary flex-1 py-2.5 text-sm touch-manipulation">
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

// Reschedule Request Card - показывает ожидающий запрос на перенос
function RescheduleRequestCard({
  reschedule,
  onClick
}: {
  reschedule: RescheduleRequest;
  onClick: () => void;
}) {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <button
      onClick={onClick}
      className="w-full p-3 bg-white/60 rounded-xl text-left hover:bg-white/80 active:bg-white transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-mono text-gray-500">#{reschedule.requestNumber}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              reschedule.initiator === 'resident'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-purple-100 text-purple-700'
            }`}>
              {reschedule.initiator === 'resident' ? 'От жителя' : 'От исполнителя'}
            </span>
          </div>

          <div className="text-sm text-gray-600 mb-2">
            <span className="font-medium text-gray-800">{reschedule.initiatorName}</span>
            {' → '}
            <span className="font-medium text-gray-800">{reschedule.recipientName}</span>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <CalendarDays className="w-4 h-4 text-amber-600" />
            <span className="font-medium text-amber-700">
              {reschedule.proposedDate} в {reschedule.proposedTime}
            </span>
          </div>

          <div className="text-xs text-gray-500 mt-2">
            Причина: {RESCHEDULE_REASON_LABELS[reschedule.reason].label}
            {reschedule.reasonText && ` - ${reschedule.reasonText}`}
          </div>

          <div className="text-xs text-gray-400 mt-1">
            Создан: {formatDate(reschedule.createdAt)}
          </div>
        </div>

        <ChevronRight className="w-5 h-5 text-amber-500 flex-shrink-0" />
      </div>
    </button>
  );
}

// Reschedule History Card - показывает историю переносов (принятые/отклонённые)
function RescheduleHistoryCard({
  reschedule
}: {
  reschedule: RescheduleRequest;
}) {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const statusInfo = RESCHEDULE_STATUS_LABELS[reschedule.status];

  return (
    <div className="p-3 bg-white/40 rounded-xl border border-gray-100">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-mono text-gray-500">#{reschedule.requestNumber}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium bg-${statusInfo.color}-100 text-${statusInfo.color}-700`}>
              {statusInfo.label}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              reschedule.initiator === 'resident'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-purple-100 text-purple-700'
            }`}>
              {reschedule.initiator === 'resident' ? 'От жителя' : 'От исполнителя'}
            </span>
          </div>

          <div className="text-sm text-gray-600 mb-1">
            <span className="font-medium">{reschedule.initiatorName}</span>
            {' → '}
            <span className="font-medium">{reschedule.recipientName}</span>
          </div>

          {reschedule.status === 'accepted' && (
            <div className="flex items-center gap-2 text-sm text-green-700 mb-1">
              <Check className="w-4 h-4" />
              <span>Перенесено на {reschedule.proposedDate} в {reschedule.proposedTime}</span>
            </div>
          )}

          {reschedule.status === 'rejected' && (
            <div className="text-sm text-red-700 mb-1">
              <X className="w-4 h-4 inline mr-1" />
              Отклонено
              {reschedule.responseNote && `: ${reschedule.responseNote}`}
            </div>
          )}

          {reschedule.respondedAt && (
            <div className="text-xs text-gray-400">
              Ответ: {formatDate(reschedule.respondedAt)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Modal для просмотра деталей запроса на перенос (если нужен в будущем)
function RescheduleDetailsModal({
  reschedule,
  onClose
}: {
  reschedule: RescheduleRequest;
  onClose: () => void;
}) {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const statusInfo = RESCHEDULE_STATUS_LABELS[reschedule.status];

  return (
    <div className="modal-backdrop">
      <div className="modal-content p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-amber-600" />
            Запрос на перенос
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/30 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <div className="text-sm text-gray-500 mb-1">Заявка</div>
            <div className="font-mono text-lg">#{reschedule.requestNumber}</div>
          </div>

          <div>
            <div className="text-sm text-gray-500 mb-1">Статус</div>
            <span className={`px-3 py-1 rounded-full text-sm font-medium bg-${statusInfo.color}-100 text-${statusInfo.color}-700`}>
              {statusInfo.label}
            </span>
          </div>

          <div>
            <div className="text-sm text-gray-500 mb-1">Инициатор</div>
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-gray-400" />
              <span className="font-medium">{reschedule.initiatorName}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                reschedule.initiator === 'resident'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-purple-100 text-purple-700'
              }`}>
                {reschedule.initiator === 'resident' ? 'Житель' : 'Исполнитель'}
              </span>
            </div>
          </div>

          <div>
            <div className="text-sm text-gray-500 mb-1">Получатель</div>
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-gray-400" />
              <span className="font-medium">{reschedule.recipientName}</span>
            </div>
          </div>

          {reschedule.currentDate && (
            <div>
              <div className="text-sm text-gray-500 mb-1">Текущее время</div>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span>{reschedule.currentDate} {reschedule.currentTime}</span>
              </div>
            </div>
          )}

          <div>
            <div className="text-sm text-gray-500 mb-1">Предложенное время</div>
            <div className="flex items-center gap-2 text-amber-700 font-medium">
              <CalendarDays className="w-4 h-4" />
              <span>{reschedule.proposedDate} в {reschedule.proposedTime}</span>
            </div>
          </div>

          <div>
            <div className="text-sm text-gray-500 mb-1">Причина</div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="font-medium">{RESCHEDULE_REASON_LABELS[reschedule.reason].label}</div>
              {reschedule.reasonText && (
                <div className="text-sm text-gray-600 mt-1">{reschedule.reasonText}</div>
              )}
            </div>
          </div>

          {reschedule.responseNote && (
            <div>
              <div className="text-sm text-gray-500 mb-1">Комментарий при ответе</div>
              <div className="p-3 bg-gray-50 rounded-lg text-sm">
                {reschedule.responseNote}
              </div>
            </div>
          )}

          <div className="text-xs text-gray-400 pt-2 border-t">
            <div>Создан: {formatDate(reschedule.createdAt)}</div>
            {reschedule.respondedAt && (
              <div>Ответ: {formatDate(reschedule.respondedAt)}</div>
            )}
            <div>Истекает: {formatDate(reschedule.expiresAt)}</div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-6 py-2.5 px-4 rounded-xl font-medium bg-gray-100 hover:bg-gray-200 transition-colors"
        >
          Закрыть
        </button>
      </div>
    </div>
  );
}
