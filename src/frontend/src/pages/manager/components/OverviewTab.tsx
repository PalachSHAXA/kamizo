import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell
} from '../../../components/LazyCharts';
import {
  FileText, Clock, TrendingUp, AlertCircle, RefreshCw
} from 'lucide-react';
import { useLanguageStore } from '../../../stores/languageStore';
import { RequestCard } from './RequestCard';
import { RescheduleRequestCard, RescheduleHistoryCard } from './RescheduleCards';
import type { OverviewTabProps } from './types';

export function OverviewTab({
  stats,
  chartData,
  categoryData,
  pendingReschedules,
  recentReschedules,
  requests,
  onAssignRequest,
  onSelectReschedule
}: OverviewTabProps) {
  const navigate = useNavigate();
  const { language } = useLanguageStore();

  return (
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
              <div className="text-xs md:text-sm text-gray-500 truncate">{language === 'ru' ? 'Выполнено за неделю' : 'Hafta davomida bajarildi'}</div>
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
                  label={({ name, percent }: { name?: string; percent?: number }) => `${(name || '').slice(0, 6)}... ${((percent || 0) * 100).toFixed(0)}%`}
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
                onClick={() => onSelectReschedule(reschedule)}
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
              onAssign={() => onAssignRequest(request)}
              compact
            />
          ))}
        </div>
      </div>
    </>
  );
}
