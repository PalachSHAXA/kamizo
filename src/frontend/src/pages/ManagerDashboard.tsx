// TODO: Split into components (2093 lines)
import { useState, useEffect, useMemo } from 'react';
import { InstallAppSection } from '../components/InstallAppSection';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area
} from '../components/LazyCharts';
import {
  FileText, Clock, TrendingUp, TrendingDown, X,
  Phone, Star, Trash2, Eye, EyeOff, Check, AlertCircle, AlertTriangle,
  Home, UserPlus, MapPin, Calendar, User, ChevronRight,
  Download, CalendarDays, RefreshCw, Activity
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { useLanguageStore } from '../stores/languageStore';
import { useToastStore } from '../stores/toastStore';
import { formatAddress } from '../utils/formatAddress';
import { ukRatingsApi } from '../services/api';
import { SPECIALIZATION_LABELS, STATUS_LABELS, PRIORITY_LABELS, RESCHEDULE_REASON_LABELS, RESCHEDULE_STATUS_LABELS } from '../types';
import type { ExecutorSpecialization, Request, RequestStatus, RequestPriority, Executor, RescheduleRequest } from '../types';
import { CredentialsModal } from '../components/modals/CredentialsModal';
import { AssignExecutorModal } from '../components/modals/AssignExecutorModal';

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
  const { user } = useAuthStore();
  const { language } = useLanguageStore();
  const {
    executors, requests, getStats, getChartData,
    addExecutor, deleteExecutor, updateExecutor, assignRequest, rescheduleRequests
  } = useDataStore();
  // Data is now fetched automatically by useWebSocketSync hook in Layout

  const stats = getStats();
  const chartData = getChartData();

  const [showAddExecutorModal, setShowAddExecutorModal] = useState(false);
  const [showAddResidentModal, setShowAddResidentModal] = useState(false);
  const [showCredentials, setShowCredentials] = useState<{ login: string; password: string } | null>(null);
  const [showAssignModal, setShowAssignModal] = useState<Request | null>(null);
  const [selectedExecutor, setSelectedExecutor] = useState<Executor | null>(null);
  const [selectedReschedule, setSelectedReschedule] = useState<RescheduleRequest | null>(null);
  const [managerTab, setManagerTab] = useState<'overview' | 'ratings'>('overview');
  const [ratingSummary, setRatingSummary] = useState<any>(null);
  const [isLoadingRatings, setIsLoadingRatings] = useState(false);

  useEffect(() => {
    if (managerTab === 'ratings' && !ratingSummary) {
      setIsLoadingRatings(true);
      ukRatingsApi.getSummary(6)
        .then(data => setRatingSummary(data))
        .catch(err => console.error('Failed to load ratings:', err))
        .finally(() => setIsLoadingRatings(false));
    }
  }, [managerTab]);

  // Get pending reschedule requests (менеджер видит все активные запросы на перенос)
  const pendingReschedules = useMemo(() => rescheduleRequests.filter(r => r.status === 'pending'), [rescheduleRequests]);
  const recentReschedules = useMemo(() => rescheduleRequests
    .filter(r => r.status !== 'pending')
    .sort((a, b) => new Date(b.respondedAt || b.createdAt).getTime() - new Date(a.respondedAt || a.createdAt).getTime())
    .slice(0, 5), [rescheduleRequests]);

  // Removed filters - now on separate pages

  // Category colors - consistent with ReportsPage
  const CATEGORY_COLORS: Record<string, string> = {
    plumber: '#3b82f6',      // blue
    electrician: '#f59e0b',   // amber/orange
    security: '#ef4444',      // red
    cleaning: '#10b981',      // green/emerald
    elevator: '#8b5cf6',      // purple/violet
    intercom: '#6366f1',      // indigo
    trash: '#d97706',         // amber darker
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
    <div className="space-y-4 md:space-y-6 xl:space-y-8 pb-24 md:pb-0">
      {/* Header with greeting */}
      <div className="min-w-0">
        <p className="text-sm text-gray-400 font-medium">
          {language === 'ru'
            ? `${new Date().getHours() < 12 ? 'Доброе утро' : new Date().getHours() < 18 ? 'Добрый день' : 'Добрый вечер'}, ${user?.name?.split(' ')[0] || ''} 👋`
            : `${new Date().getHours() < 12 ? 'Xayrli tong' : new Date().getHours() < 18 ? 'Xayrli kun' : 'Xayrli kech'}, ${user?.name?.split(' ')[0] || ''} 👋`}
        </p>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 truncate">{language === 'ru' ? 'Панель управления' : 'Boshqaruv paneli'}</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setManagerTab('overview')}
          className={`px-4 py-2 min-h-[44px] font-medium text-sm border-b-2 transition-colors touch-manipulation active:bg-gray-100 ${
            managerTab === 'overview'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Activity className="w-4 h-4 inline mr-2" />
          {language === 'ru' ? 'Обзор' : 'Umumiy'}
        </button>
        <button
          onClick={() => setManagerTab('ratings')}
          className={`px-4 py-2 min-h-[44px] font-medium text-sm border-b-2 transition-colors touch-manipulation active:bg-gray-100 ${
            managerTab === 'ratings'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Star className="w-4 h-4 inline mr-2" />
          {language === 'ru' ? 'Отчёты' : 'Hisobotlar'}
        </button>
      </div>

      {managerTab === 'overview' && (<>
      {/* Overview - Stats Cards */}
      <>
          {/* Stats Cards - 2 columns on mobile */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 xl:gap-5">
            <div
              className="glass-card p-3 sm:p-4 md:p-5 xl:p-6 cursor-pointer hover:shadow-lg transition-all active:scale-[0.98] touch-manipulation rounded-lg sm:rounded-xl"
              onClick={() => navigate('/requests?status=new')}
            >
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-primary-500 rounded-xl flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 md:w-6 md:h-6 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-2xl md:text-3xl font-bold">{stats.newRequests}</div>
                  <div className="text-xs md:text-sm text-gray-500 truncate">{language === 'ru' ? 'Новые' : 'Yangi'}</div>
                </div>
              </div>
            </div>

            <div
              className="glass-card p-3 sm:p-4 md:p-5 xl:p-6 cursor-pointer hover:shadow-lg transition-all active:scale-[0.98] touch-manipulation rounded-lg sm:rounded-xl"
              onClick={() => navigate('/requests?status=in_progress')}
            >
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-amber-500 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5 md:w-6 md:h-6 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-2xl md:text-3xl font-bold">{stats.inProgress}</div>
                  <div className="text-xs md:text-sm text-gray-500 truncate">{language === 'ru' ? 'В работе' : 'Jarayonda'}</div>
                </div>
              </div>
            </div>

            <div
              className="glass-card p-3 sm:p-4 md:p-5 xl:p-6 cursor-pointer hover:shadow-lg transition-all active:scale-[0.98] touch-manipulation rounded-lg sm:rounded-xl"
              onClick={() => navigate('/requests?status=pending_approval')}
            >
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-purple-500 rounded-xl flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-5 h-5 md:w-6 md:h-6 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-2xl md:text-3xl font-bold">{stats.pendingApproval}</div>
                  <div className="text-xs md:text-sm text-gray-500 truncate">{language === 'ru' ? 'Ожидают' : 'Kutilmoqda'}</div>
                </div>
              </div>
            </div>

            <div
              className="glass-card p-3 sm:p-4 md:p-5 xl:p-6 cursor-pointer hover:shadow-lg transition-all active:scale-[0.98] touch-manipulation rounded-lg sm:rounded-xl"
              onClick={() => navigate('/requests?status=completed')}
            >
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-green-500 rounded-xl flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="w-5 h-5 md:w-6 md:h-6 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-2xl md:text-3xl font-bold">{stats.completedWeek}</div>
                  <div className="text-xs md:text-sm text-gray-500 truncate">{language === 'ru' ? 'За неделю' : 'Hafta davomida'}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Charts Row - Stack on mobile */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 sm:gap-3 md:gap-4 xl:gap-5">
            <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
              <h2 className="text-base sm:text-lg md:text-xl xl:text-2xl font-bold mb-3 md:mb-4">{language === 'ru' ? 'Заявки за неделю' : 'Haftalik arizalar'}</h2>
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
                  <Bar dataKey="created" name={language === 'ru' ? 'Создано' : 'Yaratilgan'} fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="completed" name={language === 'ru' ? 'Выполнено' : 'Bajarilgan'} fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
              <h2 className="text-base sm:text-lg md:text-xl xl:text-2xl font-bold mb-3 md:mb-4">{language === 'ru' ? 'По категориям' : 'Kategoriya bo\'yicha'}</h2>
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
                  {language === 'ru' ? 'Нет данных для отображения' : 'Ko\'rsatish uchun ma\'lumot yo\'q'}
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
                  <h2 className="text-base sm:text-lg md:text-xl xl:text-2xl font-bold text-amber-800">{language === 'ru' ? 'Запросы на перенос времени' : 'Vaqtni ko\'chirish so\'rovlari'}</h2>
                  <p className="text-sm text-amber-600">
                    {pendingReschedules.length} {language === 'ru' ? (pendingReschedules.length === 1 ? 'запрос ожидает' : 'запросов ожидают') : (pendingReschedules.length === 1 ? 'so\'rov kutmoqda' : 'so\'rov kutmoqda')} {language === 'ru' ? 'ответа' : 'javob'}
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
            <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
              <h2 className="text-base sm:text-lg md:text-xl xl:text-2xl font-bold mb-3 md:mb-4">{language === 'ru' ? 'История переносов' : 'Ko\'chirishlar tarixi'}</h2>
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
          <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <h2 className="text-base sm:text-lg md:text-xl xl:text-2xl font-bold">{language === 'ru' ? 'Последние заявки' : 'Oxirgi arizalar'}</h2>
              <a href="/requests" className="text-primary-600 text-sm font-medium hover:underline touch-manipulation min-h-[44px] flex items-center active:text-primary-800">
                {language === 'ru' ? 'Все' : 'Hammasi'} →
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
      </>)}

      {/* ── RATINGS TAB ── */}
      {managerTab === 'ratings' && (
        <div className="space-y-4 sm:space-y-6">
          <h2 className="text-lg font-semibold">{language === 'ru' ? 'Удовлетворённость жителей' : 'Aholining qoniqishi'}</h2>

          {isLoadingRatings ? (
            <div className="text-center text-gray-400 py-20">{language === 'ru' ? 'Загрузка...' : 'Yuklanmoqda...'}</div>
          ) : !ratingSummary?.current ? (
            <div className="text-center text-gray-400 py-20">{language === 'ru' ? 'Оценок пока нет' : 'Hali baholar yo\'q'}</div>
          ) : (
            <>
              {/* Trend Banner */}
              {ratingSummary.trend !== 0 && (
                <div className={`rounded-xl p-4 flex items-center gap-3 ${
                  ratingSummary.trend > 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                }`}>
                  {ratingSummary.trend > 0 ? (
                    <TrendingUp className="w-6 h-6 text-green-600 shrink-0" />
                  ) : (
                    <TrendingDown className="w-6 h-6 text-red-600 shrink-0" />
                  )}
                  <div>
                    <div className={`text-[15px] font-bold ${ratingSummary.trend > 0 ? 'text-green-800' : 'text-red-800'}`}>
                      {ratingSummary.trend > 0 ? '+' : ''}{ratingSummary.trend.toFixed(1)}% {ratingSummary.trend > 0 ? (language === 'ru' ? 'лучше чем' : 'yaxshiroq') : (language === 'ru' ? 'хуже чем' : 'yomonroq')} {language === 'ru' ? 'прошлый месяц' : 'o\'tgan oy'}
                    </div>
                    <div className={`text-[12px] ${ratingSummary.trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {language === 'ru' ? 'vs прошлый месяц' : 'o\'tgan oyga nisbatan'}
                    </div>
                  </div>
                </div>
              )}

              {/* Stats Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: language === 'ru' ? 'Общая оценка' : 'Umumiy baho', value: ratingSummary.current.avg_overall },
                  { label: language === 'ru' ? 'Чистота' : 'Tozalik', value: ratingSummary.current.avg_cleanliness },
                  { label: language === 'ru' ? 'Реагирование' : 'Javob berish', value: ratingSummary.current.avg_responsiveness },
                  { label: language === 'ru' ? 'Коммуникация' : 'Muloqot', value: ratingSummary.current.avg_communication },
                ].map((stat, idx) => (
                  <div key={idx} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <div className="text-[12px] text-gray-500 font-medium mb-1">{stat.label}</div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[28px] font-extrabold text-gray-900">
                        {stat.value ? Number(stat.value).toFixed(1) : '—'}
                      </span>
                      <span className="text-[13px] text-gray-400">/5</span>
                    </div>
                    {stat.value && (
                      <div className="mt-2 flex gap-0.5">
                        {[1, 2, 3, 4, 5].map(s => (
                          <Star
                            key={s}
                            className={`w-4 h-4 ${s <= Math.round(Number(stat.value)) ? 'text-yellow-400' : 'text-gray-200'}`}
                            fill={s <= Math.round(Number(stat.value)) ? 'currentColor' : 'none'}
                            strokeWidth={s <= Math.round(Number(stat.value)) ? 0 : 1.5}
                          />
                        ))}
                      </div>
                    )}
                    <div className="text-[11px] text-gray-400 mt-1">
                      {ratingSummary.current.count || 0} {language === 'ru' ? 'голосов' : 'ovozlar'}
                    </div>
                  </div>
                ))}
              </div>

              {/* Monthly Trend Chart */}
              {ratingSummary.monthly?.length > 1 && (
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <h3 className="text-sm font-semibold mb-3">{language === 'ru' ? 'Динамика по месяцам' : 'Oylik dinamika'}</h3>
                  <div className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={ratingSummary.monthly.map((m: any) => ({
                        period: m.period,
                        overall: Number(m.avg_overall || 0).toFixed(1),
                        count: m.count,
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                        <YAxis domain={[0, 5]} tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Area type="monotone" dataKey="overall" stroke="rgb(var(--brand-rgb))" fill="rgba(var(--brand-rgb), 0.1)" strokeWidth={2} name={language === 'ru' ? 'Общая оценка' : 'Umumiy baho'} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Recommendations */}
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <h3 className="text-sm font-semibold mb-3">{language === 'ru' ? 'Рекомендации' : 'Tavsiyalar'}</h3>
                <div className="space-y-2">
                  {(() => {
                    const recs: { text: string; priority: 'high' | 'medium' | 'low' }[] = [];
                    const c = ratingSummary.current;
                    if (c.avg_responsiveness && Number(c.avg_responsiveness) < 3.5) {
                      recs.push({
                        text: language === 'ru'
                          ? 'Скорость реагирования ниже среднего. Рассмотрите оптимизацию процессов обработки заявок.'
                          : 'Javob berish tezligi o\'rtachadan past. Arizalarni ko\'rib chiqish jarayonlarini optimallashtiring.',
                        priority: 'high'
                      });
                    }
                    if (c.avg_cleanliness && Number(c.avg_cleanliness) < 3.5) {
                      recs.push({
                        text: language === 'ru'
                          ? 'Оценка чистоты ниже ожидаемого. Проверьте график уборки и контроль качества.'
                          : 'Tozalik bahosi kutilganidan past. Tozalash jadvalini va sifat nazoratini tekshiring.',
                        priority: 'high'
                      });
                    }
                    if (c.avg_communication && Number(c.avg_communication) < 3.5) {
                      recs.push({
                        text: language === 'ru'
                          ? 'Коммуникация требует улучшения. Улучшите информирование жителей о работах и событиях.'
                          : 'Muloqotni yaxshilash kerak. Aholini ishlar va tadbirlar haqida xabardor qilishni yaxshilang.',
                        priority: 'medium'
                      });
                    }
                    if (c.avg_overall && Number(c.avg_overall) >= 4.0) {
                      recs.push({
                        text: language === 'ru'
                          ? 'Отличный результат! Общая оценка выше 4.0 — продолжайте в том же духе.'
                          : 'Ajoyib natija! Umumiy baho 4.0 dan yuqori — shu tarzda davom eting.',
                        priority: 'low'
                      });
                    }
                    if (recs.length === 0) {
                      recs.push({
                        text: language === 'ru'
                          ? 'Показатели в норме. Продолжайте следить за качеством обслуживания.'
                          : 'Ko\'rsatkichlar normal. Xizmat sifatini nazorat qilishda davom eting.',
                        priority: 'low'
                      });
                    }
                    return recs.map((rec, i) => (
                      <div key={i} className={`flex items-start gap-2.5 p-3 rounded-lg ${
                        rec.priority === 'high' ? 'bg-red-50' : rec.priority === 'medium' ? 'bg-amber-50' : 'bg-green-50'
                      }`}>
                        <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${
                          rec.priority === 'high' ? 'text-red-500' : rec.priority === 'medium' ? 'text-amber-500' : 'text-green-500'
                        }`} />
                        <span className="text-[13px] text-gray-700">{rec.text}</span>
                      </div>
                    ));
                  })()}
                </div>
              </div>

              {/* Recent Comments */}
              {ratingSummary.recentComments?.length > 0 && (
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <h3 className="text-sm font-semibold mb-3">{language === 'ru' ? 'Последние отзывы' : 'So\'nggi sharhlar'}</h3>
                  <div className="space-y-3">
                    {ratingSummary.recentComments.map((comment: any, idx: number) => (
                      <div key={idx} className="border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="flex gap-0.5">
                            {[1, 2, 3, 4, 5].map(s => (
                              <Star
                                key={s}
                                className={`w-3 h-3 ${s <= comment.overall ? 'text-yellow-400' : 'text-gray-200'}`}
                                fill={s <= comment.overall ? 'currentColor' : 'none'}
                                strokeWidth={s <= comment.overall ? 0 : 1.5}
                              />
                            ))}
                          </div>
                          <span className="text-[11px] text-gray-400">{comment.created_at?.slice(0, 10)}</span>
                        </div>
                        <p className="text-[13px] text-gray-600">{comment.comment}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Install App / Notifications */}
      <InstallAppSection language={language} roleContext="manager" />

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

      <CredentialsModal
        isOpen={!!showCredentials}
        credentials={showCredentials || { login: '', password: '' }}
        onClose={() => setShowCredentials(null)}
      />

      <AssignExecutorModal
        isOpen={!!showAssignModal}
        request={showAssignModal || {} as Request}
        executors={executors}
        onClose={() => setShowAssignModal(null)}
        onAssign={(requestId, executorId) => {
          assignRequest(requestId, executorId);
          setShowAssignModal(null);
        }}
      />

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
  const { language } = useLanguageStore();
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
            <button onClick={onAssign} className="btn-secondary text-xs md:text-sm min-h-[44px] py-2 px-3 md:px-4 touch-manipulation active:scale-[0.98] flex-shrink-0">
              {language === 'ru' ? 'Назначить' : 'Tayinlash'}
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
          {/* Trash type and volume badges */}
          {request.category === 'trash' && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {request.title.includes(': ') && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-100 text-primary-700 rounded-full text-xs font-medium">
                  🗑️ {request.title.split(': ').slice(1).join(': ')}
                </span>
              )}
              {request.description?.includes('Объём: ') && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                  📦 {request.description.split('Объём: ')[1].split('\n')[0]}
                </span>
              )}
            </div>
          )}
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
              <span className="text-gray-500">{language === 'ru' ? 'Исполнитель: ' : 'Ijrochi: '}</span>
              <span className="font-medium">{request.executorName}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {request.status === 'new' && (
            <button onClick={onAssign} className="btn-primary flex items-center gap-2 min-h-[44px] py-2 px-3 md:py-2.5 md:px-4 touch-manipulation active:scale-[0.98] text-sm">
              <UserPlus className="w-4 h-4" />
              <span className="hidden sm:inline">{language === 'ru' ? 'Назначить' : 'Tayinlash'}</span>
              <span className="sm:hidden">{language === 'ru' ? 'Назн.' : 'Tay.'}</span>
            </button>
          )}
          {request.status === 'assigned' && (
            <button onClick={onAssign} className="btn-secondary flex items-center gap-2 min-h-[44px] py-2 px-3 touch-manipulation active:scale-[0.98] text-sm">
              <span className="hidden sm:inline">{language === 'ru' ? 'Переназначить' : 'Qayta tayinlash'}</span>
              <span className="sm:hidden">{language === 'ru' ? 'Перен.' : 'Qayta'}</span>
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
  const { language } = useLanguageStore();
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'available': return <span className="badge bg-green-100 text-green-700 text-xs">{language === 'ru' ? 'Доступен' : 'Mavjud'}</span>;
      case 'busy': return <span className="badge bg-amber-100 text-amber-700 text-xs">{language === 'ru' ? 'Занят' : 'Band'}</span>;
      case 'offline': return <span className="badge bg-gray-100 text-gray-600 text-xs">{language === 'ru' ? 'Оффлайн' : 'Oflayn'}</span>;
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
            <span className="hidden sm:inline">{executor.completedCount} {language === 'ru' ? 'вып.' : 'baj.'}</span>
            <span>{executor.activeRequests} {language === 'ru' ? 'акт.' : 'faol'}</span>
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
          <option value="available">{language === 'ru' ? 'Доступен' : 'Mavjud'}</option>
          <option value="busy">{language === 'ru' ? 'Занят' : 'Band'}</option>
          <option value="offline">{language === 'ru' ? 'Оффлайн' : 'Oflayn'}</option>
        </select>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-red-500 hover:bg-red-50 rounded-lg sm:rounded-xl transition-colors touch-manipulation active:bg-red-100"
          title={language === 'ru' ? 'Удалить' : 'O\'chirish'}
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
  const { language } = useLanguageStore();

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
      <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base sm:text-lg md:text-xl xl:text-2xl font-bold">{language === 'ru' ? 'Жители' : 'Yashovchilar'}</h2>
            <p className="text-xs md:text-sm text-gray-500">{residents.length} {language === 'ru' ? 'жителей в системе' : 'tizimda yashovchilar'}</p>
          </div>
        </div>
      </div>

      <div className="space-y-2 md:space-y-3">
        {residents.length === 0 ? (
          <div className="glass-card p-6 md:p-8 text-center">
            <Home className="w-10 h-10 md:w-12 md:h-12 text-gray-300 mx-auto mb-2 md:mb-3" />
            <h3 className="text-base md:text-lg font-medium text-gray-600">{language === 'ru' ? 'Жителей пока нет' : 'Yashovchilar hali yo\'q'}</h3>
            <p className="text-gray-400 mt-1 text-sm">{language === 'ru' ? 'Жители появятся после создания заявок' : 'Arizalar yaratilgandan keyin yashovchilar paydo bo\'ladi'}</p>
          </div>
        ) : (
          residents.map((resident) => {
            const stats = getResidentStats(resident.id);
            return (
              <div key={resident.id} className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 md:gap-4 min-w-0">
                    <div className="w-10 h-10 md:w-12 md:h-12 bg-primary-100 rounded-full flex items-center justify-center text-sm md:text-lg font-medium text-primary-700 flex-shrink-0">
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
                          <span className="truncate max-w-[100px] md:max-w-none">{language === 'ru' ? 'кв.' : 'kv.'} {resident.apartment}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 md:gap-4 text-xs md:text-sm justify-end sm:justify-start flex-shrink-0">
                    <div className="text-center">
                      <div className="font-bold">{stats.total}</div>
                      <div className="text-gray-500">{language === 'ru' ? 'всего' : 'jami'}</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-green-600">{stats.completed}</div>
                      <div className="text-gray-500">{language === 'ru' ? 'вып.' : 'baj.'}</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-amber-600">{stats.active}</div>
                      <div className="text-gray-500">{language === 'ru' ? 'акт.' : 'faol'}</div>
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
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">{language === 'ru' ? 'По:' : 'Gacha:'}</span>
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

// Add Executor Modal
function AddExecutorModal({
  onClose,
  onAdd
}: {
  onClose: () => void;
  onAdd: (data: { name: string; phone: string; login: string; password: string; specialization: ExecutorSpecialization }) => void;
}) {
  const { language } = useLanguageStore();
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
      setError(language === 'ru' ? 'Заполните все поля' : 'Barcha maydonlarni to\'ldiring');
      return;
    }

    onAdd({ name, phone, login, password, specialization });
  };

  // TODO: migrate to <Modal> component
  return (
    <div className="modal-backdrop">
      <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6 w-full max-w-md mx-3 md:mx-4 max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <h2 className="text-lg md:text-xl font-bold">{language === 'ru' ? 'Добавить исполнителя' : 'Ijrochi qo\'shish'}</h2>
          <button onClick={onClose} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-white/30 rounded-lg sm:rounded-xl touch-manipulation active:bg-gray-200" aria-label="Закрыть">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 md:space-y-4">
          <div>
            <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'ФИО' : 'F.I.O.'}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={language === 'ru' ? 'Иванов Иван Иванович' : 'Ismingizni kiriting'}
              className="glass-input text-sm md:text-base"
              required
            />
          </div>

          <div>
            <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Телефон' : 'Telefon'}</label>
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
            <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Специализация' : 'Mutaxassislik'}</label>
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
            <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Логин' : 'Login'}</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="plumber001"
                className="glass-input flex-1 text-sm md:text-base"
                required
              />
              <button type="button" onClick={generateLogin} className="btn-secondary px-2 md:px-4 min-h-[44px] text-xs md:text-sm touch-manipulation active:scale-[0.98]">
                <span className="hidden sm:inline">{language === 'ru' ? 'Сгенерировать' : 'Yaratish'}</span>
                <span className="sm:hidden">{language === 'ru' ? 'Ген.' : 'Yar.'}</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Пароль' : 'Parol'}</label>
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
              <button type="button" onClick={generatePassword} className="btn-secondary px-2 md:px-4 min-h-[44px] text-xs md:text-sm touch-manipulation active:scale-[0.98]">
                <span className="hidden sm:inline">{language === 'ru' ? 'Сгенерировать' : 'Yaratish'}</span>
                <span className="sm:hidden">{language === 'ru' ? 'Ген.' : 'Yar.'}</span>
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
            <button type="button" onClick={onClose} className="btn-secondary flex-1 min-h-[44px] py-2.5 text-sm touch-manipulation active:scale-[0.98]">
              {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
            </button>
            <button type="submit" className="btn-primary flex-1 min-h-[44px] py-2.5 text-sm touch-manipulation active:scale-[0.98]">
              {language === 'ru' ? 'Добавить' : 'Qo\'shish'}
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
  const { language } = useLanguageStore();
  const addToast = useToastStore(s => s.addToast);
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
      setError(language === 'ru' ? 'Сначала укажите дом и квартиру' : 'Avval uy va kvartirani ko\'rsating');
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
    return branchInfo ? `${branchInfo.name}, ${language === 'ru' ? 'дом' : 'uy'} ${building}` : `${language === 'ru' ? 'Дом' : 'Uy'} ${building}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name || !phone || !building || !apartment || !login || !password) {
      setError(language === 'ru' ? 'Заполните все обязательные поля' : 'Barcha majburiy maydonlarni to\'ldiring');
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

    addToast('success', language === 'ru'
      ? `Житель добавлен! Логин: ${login}, Пароль: ${password}`
      : `Yashovchi qo'shildi! Login: ${login}, Parol: ${password}`
    );
    onClose();
  };

  // TODO: migrate to <Modal> component
  return (
    <div className="modal-backdrop">
      <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6 w-full max-w-md mx-3 md:mx-4 max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <h2 className="text-lg md:text-xl font-bold">{language === 'ru' ? 'Добавить жителя' : 'Yashovchi qo\'shish'}</h2>
          <button onClick={onClose} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-white/30 rounded-lg sm:rounded-xl touch-manipulation active:bg-gray-200" aria-label="Закрыть">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 md:space-y-4">
          <div>
            <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'ФИО' : 'F.I.O.'}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={language === 'ru' ? 'Иванов Иван Иванович' : 'Ismingizni kiriting'}
              className="glass-input text-sm md:text-base"
              required
            />
          </div>

          <div>
            <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Телефон' : 'Telefon'}</label>
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
            <label className="block text-xs md:text-sm font-medium text-gray-700 mb-2">{language === 'ru' ? 'Расположение' : 'Joylashuv'}</label>
            <div className="grid grid-cols-3 md:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-3 xl:gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">{language === 'ru' ? 'Филиал' : 'Filial'}</label>
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
                <label className="block text-xs text-gray-500 mb-1">{language === 'ru' ? 'Дом' : 'Uy'}</label>
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
                <label className="block text-xs text-gray-500 mb-1">{language === 'ru' ? 'Кв.' : 'Kv.'}</label>
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
                {getAddress()}, {language === 'ru' ? 'кв.' : 'kv.'} {apartment || '...'}
              </div>
            )}
          </div>

          {/* Login credentials */}
          <div className="border-t pt-3 md:pt-4">
            <div className="flex items-center justify-between mb-2 md:mb-3">
              <span className="text-xs md:text-sm font-medium text-gray-700">{language === 'ru' ? 'Данные для входа' : 'Kirish ma\'lumotlari'}</span>
              <button type="button" onClick={generateCredentials} className="btn-secondary text-xs md:text-sm min-h-[44px] py-1 px-2 md:px-3 touch-manipulation active:scale-[0.98]">
                {language === 'ru' ? 'Сгенерировать' : 'Yaratish'}
              </button>
            </div>

            {/* Hint about password format */}
            <div className="mb-2 p-2 bg-primary-50 border border-primary-100 rounded-lg text-xs text-primary-600">
              💡 {language === 'ru' ? 'Пароль будет в формате:' : 'Parol formatda bo\'ladi:'} <span className="font-mono font-bold">{language === 'ru' ? 'ФИЛИАЛ/ДОМ/КВАРТИРА' : 'FILIAL/UY/KVARTIRA'}</span>
              <br />
              {language === 'ru' ? 'Например:' : 'Masalan:'} <span className="font-mono">YS/8A/23</span>
            </div>

            <div className="space-y-2 md:space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">{language === 'ru' ? 'Логин' : 'Login'}</label>
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
                <label className="block text-xs text-gray-500 mb-1">{language === 'ru' ? 'Пароль' : 'Parol'}</label>
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
            <button type="button" onClick={onClose} className="btn-secondary flex-1 min-h-[44px] py-2.5 text-sm touch-manipulation active:scale-[0.98]">
              {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
            </button>
            <button type="submit" className="btn-primary flex-1 min-h-[44px] py-2.5 text-sm touch-manipulation active:scale-[0.98]">
              {language === 'ru' ? 'Добавить' : 'Qo\'shish'}
            </button>
          </div>
        </form>
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
  const { language } = useLanguageStore();
  const executorRequests = requests.filter(r => r.executorId === executor.id);
  const completedRequests = executorRequests.filter(r => r.status === 'completed');
  const activeRequests = executorRequests.filter(r => ['assigned', 'accepted', 'in_progress', 'pending_approval'].includes(r.status));

  // Calculate average completion time
  const avgTime = completedRequests.length > 0
    ? completedRequests.reduce((sum, r) => sum + (r.workDuration || 0), 0) / completedRequests.length
    : 0;

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds} ${language === 'ru' ? 'сек' : 'son'}`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} ${language === 'ru' ? 'мин' : 'daq'}`;
    return `${Math.floor(seconds / 3600)}${language === 'ru' ? 'ч' : 's'} ${Math.floor((seconds % 3600) / 60)}${language === 'ru' ? 'мин' : 'daq'}`;
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
      case 'available': return <span className="badge bg-green-100 text-green-700">{language === 'ru' ? 'Доступен' : 'Mavjud'}</span>;
      case 'busy': return <span className="badge bg-amber-100 text-amber-700">{language === 'ru' ? 'Занят' : 'Band'}</span>;
      case 'offline': return <span className="badge bg-gray-100 text-gray-600">{language === 'ru' ? 'Оффлайн' : 'Oflayn'}</span>;
      default: return <span className="badge">{status}</span>;
    }
  };

  const getRequestStatusBadge = (status: string) => {
    const labels: Record<string, { bg: string; text: string; label: string }> = {
      'assigned': { bg: 'bg-blue-100', text: 'text-blue-700', label: language === 'ru' ? 'Назначена' : 'Tayinlangan' },
      'accepted': { bg: 'bg-cyan-100', text: 'text-cyan-700', label: language === 'ru' ? 'Принята' : 'Qabul qilingan' },
      'in_progress': { bg: 'bg-amber-100', text: 'text-amber-700', label: language === 'ru' ? 'В работе' : 'Jarayonda' },
      'pending_approval': { bg: 'bg-purple-100', text: 'text-purple-700', label: language === 'ru' ? 'Ожидает' : 'Kutilmoqda' },
      'completed': { bg: 'bg-green-100', text: 'text-green-700', label: language === 'ru' ? 'Выполнена' : 'Bajarilgan' },
    };
    const info = labels[status] || { bg: 'bg-gray-100', text: 'text-gray-700', label: status };
    return <span className={`badge ${info.bg} ${info.text} text-xs`}>{info.label}</span>;
  };

  // TODO: migrate to <Modal> component
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="glass-card p-3 sm:p-4 md:p-5 xl:p-6 w-full max-w-lg mx-3 md:mx-4 max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl"
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
          <button onClick={onClose} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-white/30 rounded-lg sm:rounded-xl touch-manipulation active:bg-gray-200 flex-shrink-0" aria-label="Закрыть">
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
            <span className="text-gray-600">{language === 'ru' ? 'Логин' : 'Login'}: <span className="font-mono">{executor.login}</span></span>
          </div>
          <div className="flex items-center gap-2 text-sm mt-2">
            <Calendar className="w-4 h-4 text-gray-500" />
            <span className="text-gray-600">{language === 'ru' ? 'Добавлен' : 'Qo\'shilgan'}: {formatDate(executor.createdAt)}</span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 xl:gap-4 mb-4">
          <div className="glass-card bg-white/30 p-3 text-center rounded-xl">
            <div className="flex items-center justify-center gap-1 text-amber-500 mb-1">
              <Star className="w-4 h-4 fill-amber-400" />
              <span className="text-xl md:text-2xl font-bold">{executor.rating.toFixed(1)}</span>
            </div>
            <div className="text-xs text-gray-500">{language === 'ru' ? 'Рейтинг' : 'Reyting'}</div>
          </div>
          <div className="glass-card bg-white/30 p-3 text-center rounded-xl">
            <div className="text-xl md:text-2xl font-bold text-green-600">{completedRequests.length}</div>
            <div className="text-xs text-gray-500">{language === 'ru' ? 'Выполнено' : 'Bajarilgan'}</div>
          </div>
          <div className="glass-card bg-white/30 p-3 text-center rounded-xl">
            <div className="text-xl md:text-2xl font-bold text-primary-600">{activeRequests.length}</div>
            <div className="text-xs text-gray-500">{language === 'ru' ? 'Активных' : 'Faol'}</div>
          </div>
          <div className="glass-card bg-white/30 p-3 text-center rounded-xl">
            <div className="text-xl md:text-2xl font-bold text-purple-600">{formatDuration(avgTime)}</div>
            <div className="text-xs text-gray-500">{language === 'ru' ? 'Ср. время' : 'O\'rt. vaqt'}</div>
          </div>
        </div>

        {/* Status Change */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">{language === 'ru' ? 'Статус' : 'Holat'}</label>
          <select
            value={executor.status}
            onChange={(e) => onStatusChange(e.target.value as 'available' | 'busy' | 'offline')}
            className="glass-input w-full"
          >
            <option value="available">{language === 'ru' ? 'Доступен' : 'Mavjud'}</option>
            <option value="busy">{language === 'ru' ? 'Занят' : 'Band'}</option>
            <option value="offline">{language === 'ru' ? 'Оффлайн' : 'Oflayn'}</option>
          </select>
        </div>

        {/* Active Requests */}
        {activeRequests.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">{language === 'ru' ? 'Активные заявки' : 'Faol arizalar'}</h3>
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
            <h3 className="text-sm font-semibold text-gray-700 mb-2">{language === 'ru' ? 'Последние выполненные' : 'Oxirgi bajarilganlar'}</h3>
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
            {language === 'ru' ? 'Удалить' : 'O\'chirish'}
          </button>
          <button onClick={onClose} className="btn-primary flex-1 min-h-[44px] py-2.5 text-sm touch-manipulation active:scale-[0.98]">
            {language === 'ru' ? 'Закрыть' : 'Yopish'}
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
  const { language } = useLanguageStore();
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
      className="w-full p-3 min-h-[44px] bg-white/60 rounded-lg sm:rounded-xl text-left hover:bg-white/80 active:bg-white transition-colors touch-manipulation"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-mono text-gray-500">#{reschedule.requestNumber}</span>
            <span className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-xs font-medium ${
              reschedule.initiator === 'resident'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-purple-100 text-purple-700'
            }`}>
              {reschedule.initiator === 'resident' ? (language === 'ru' ? 'От жителя' : 'Yashovchidan') : (language === 'ru' ? 'От исполнителя' : 'Ijrochidan')}
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
              {reschedule.proposedDate} {language === 'ru' ? 'в' : 'da'} {reschedule.proposedTime}
            </span>
          </div>

          <div className="text-xs text-gray-500 mt-2">
            {language === 'ru' ? 'Причина' : 'Sabab'}: {RESCHEDULE_REASON_LABELS[reschedule.reason].label}
            {reschedule.reasonText && ` - ${reschedule.reasonText}`}
          </div>

          <div className="text-xs text-gray-400 mt-1">
            {language === 'ru' ? 'Создан' : 'Yaratilgan'}: {formatDate(reschedule.createdAt)}
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
  const { language } = useLanguageStore();
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
            <span className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-xs font-medium ${
              reschedule.initiator === 'resident'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-purple-100 text-purple-700'
            }`}>
              {reschedule.initiator === 'resident' ? (language === 'ru' ? 'От жителя' : 'Yashovchidan') : (language === 'ru' ? 'От исполнителя' : 'Ijrochidan')}
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
              <span>{language === 'ru' ? 'Перенесено на' : 'Ko\'chirilgan'} {reschedule.proposedDate} {language === 'ru' ? 'в' : 'da'} {reschedule.proposedTime}</span>
            </div>
          )}

          {reschedule.status === 'rejected' && (
            <div className="text-sm text-red-700 mb-1">
              <X className="w-4 h-4 inline mr-1" />
              {language === 'ru' ? 'Отклонено' : 'Rad etilgan'}
              {reschedule.responseNote && `: ${reschedule.responseNote}`}
            </div>
          )}

          {reschedule.respondedAt && (
            <div className="text-xs text-gray-400">
              {language === 'ru' ? 'Ответ' : 'Javob'}: {formatDate(reschedule.respondedAt)}
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
  const { language } = useLanguageStore();
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

  // TODO: migrate to <Modal> component
  return (
    <div className="modal-backdrop">
      <div className="modal-content p-3 sm:p-4 md:p-5 xl:p-6 w-full max-w-md mx-4 rounded-t-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-amber-600" />
            {language === 'ru' ? 'Запрос на перенос' : 'Ko\'chirish so\'rovi'}
          </h2>
          <button onClick={onClose} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-white/30 rounded-lg sm:rounded-xl touch-manipulation active:bg-gray-200" aria-label="Закрыть">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <div className="text-sm text-gray-500 mb-1">{language === 'ru' ? 'Заявка' : 'Ariza'}</div>
            <div className="font-mono text-lg">#{reschedule.requestNumber}</div>
          </div>

          <div>
            <div className="text-sm text-gray-500 mb-1">{language === 'ru' ? 'Статус' : 'Holat'}</div>
            <span className={`px-3 py-1 rounded-full text-sm font-medium bg-${statusInfo.color}-100 text-${statusInfo.color}-700`}>
              {statusInfo.label}
            </span>
          </div>

          <div>
            <div className="text-sm text-gray-500 mb-1">{language === 'ru' ? 'Инициатор' : 'Tashabbuskor'}</div>
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-gray-400" />
              <span className="font-medium">{reschedule.initiatorName}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                reschedule.initiator === 'resident'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-purple-100 text-purple-700'
              }`}>
                {reschedule.initiator === 'resident' ? (language === 'ru' ? 'Житель' : 'Yashovchi') : (language === 'ru' ? 'Исполнитель' : 'Ijrochi')}
              </span>
            </div>
          </div>

          <div>
            <div className="text-sm text-gray-500 mb-1">{language === 'ru' ? 'Получатель' : 'Qabul qiluvchi'}</div>
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-gray-400" />
              <span className="font-medium">{reschedule.recipientName}</span>
            </div>
          </div>

          {reschedule.currentDate && (
            <div>
              <div className="text-sm text-gray-500 mb-1">{language === 'ru' ? 'Текущее время' : 'Hozirgi vaqt'}</div>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span>{reschedule.currentDate} {reschedule.currentTime}</span>
              </div>
            </div>
          )}

          <div>
            <div className="text-sm text-gray-500 mb-1">{language === 'ru' ? 'Предложенное время' : 'Taklif qilingan vaqt'}</div>
            <div className="flex items-center gap-2 text-amber-700 font-medium">
              <CalendarDays className="w-4 h-4" />
              <span>{reschedule.proposedDate} {language === 'ru' ? 'в' : 'da'} {reschedule.proposedTime}</span>
            </div>
          </div>

          <div>
            <div className="text-sm text-gray-500 mb-1">{language === 'ru' ? 'Причина' : 'Sabab'}</div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="font-medium">{RESCHEDULE_REASON_LABELS[reschedule.reason].label}</div>
              {reschedule.reasonText && (
                <div className="text-sm text-gray-600 mt-1">{reschedule.reasonText}</div>
              )}
            </div>
          </div>

          {reschedule.responseNote && (
            <div>
              <div className="text-sm text-gray-500 mb-1">{language === 'ru' ? 'Комментарий при ответе' : 'Javob izohi'}</div>
              <div className="p-3 bg-gray-50 rounded-lg text-sm">
                {reschedule.responseNote}
              </div>
            </div>
          )}

          <div className="text-xs text-gray-400 pt-2 border-t">
            <div>{language === 'ru' ? 'Создан' : 'Yaratilgan'}: {formatDate(reschedule.createdAt)}</div>
            {reschedule.respondedAt && (
              <div>{language === 'ru' ? 'Ответ' : 'Javob'}: {formatDate(reschedule.respondedAt)}</div>
            )}
            <div>{language === 'ru' ? 'Истекает' : 'Muddati tugaydi'}: {formatDate(reschedule.expiresAt)}</div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-6 min-h-[44px] py-2.5 px-4 rounded-lg sm:rounded-xl font-medium bg-gray-100 hover:bg-gray-200 transition-colors touch-manipulation active:scale-[0.98]"
        >
          {language === 'ru' ? 'Закрыть' : 'Yopish'}
        </button>
      </div>
    </div>
  );
}
