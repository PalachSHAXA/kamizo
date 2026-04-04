import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area
} from '../../components/LazyCharts';
import {
  Building2, Users, FileText, TrendingUp, TrendingDown, Minus,
  AlertTriangle, Briefcase, Star, Activity, ArrowRight,
  Clock, MapPin, Megaphone, Vote, Shield, UserCheck, Wrench
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { InstallAppSection } from '../../components/InstallAppSection';
import { Modal, EmptyState } from '../../components/common';
import { formatAddress } from '../../utils/formatAddress';
import { SPECIALIZATION_LABELS } from '../../types';
import type { CompanyStats, TeamData, BuildingStat, DepartmentStat, ChartData } from './types';
import { getStatusColor, getRequestStatusLabels } from './translations';

// Modal component for details
function DetailModal({
  isOpen,
  onClose,
  title,
  children
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg">
      <div className="overflow-y-auto max-h-[60dvh]">
        {children}
      </div>
    </Modal>
  );
}

interface OverviewTabProps {
  language: string;
  companyStats: CompanyStats;
  chartData: ChartData;
  buildingStats: BuildingStat[];
  departmentStats: DepartmentStat[];
  topExecutors: Array<{ id: string; name: string; rating?: number }>;
  recentRequests: Array<any>;
  teamData: TeamData | null;
  executors: Array<any>;
  buildings: Array<any>;
  meetings: Array<any>;
  announcements: Array<any>;
  t: (key: string) => string;
}

export function OverviewTab({
  language,
  companyStats,
  chartData,
  buildingStats,
  departmentStats,
  topExecutors,
  recentRequests,
  teamData,
  executors,
  buildings,
  meetings,
  announcements,
  t,
}: OverviewTabProps) {
  const navigate = useNavigate();
  const [activeModal, setActiveModal] = useState<'requests' | 'staff' | 'buildings' | 'activity' | null>(null);
  const REQUEST_STATUS_LABELS = getRequestStatusLabels(language);

  return (
    <>
      {/* Main Stats - Clickable Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4 xl:gap-5">
        {/* Requests - Clickable */}
        <div
          className="glass-card p-3 sm:p-4 md:p-5 xl:p-6 cursor-pointer hover:shadow-lg transition-all active:scale-[0.98] touch-manipulation rounded-lg sm:rounded-xl"
          onClick={() => setActiveModal('requests')}
        >
          <div className="flex items-center justify-between mb-3">
            <FileText className="w-8 h-8 text-primary-500" />
            <span className={`text-xs px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full ${
              companyStats.newRequests > 10 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
            }`}>
              {companyStats.newRequests} {t('director.new')}
            </span>
          </div>
          <div className="text-2xl font-bold">{companyStats.totalRequests}</div>
          <div className="text-sm text-gray-500">{t('director.requests')}</div>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className="text-yellow-600">{companyStats.inProgress} {t('director.inProgress')}</span>
            <span className="text-gray-400">|</span>
            <span className="text-green-600">{companyStats.completedThisWeek} {t('director.thisWeek')}</span>
          </div>
        </div>

        {/* Staff - Clickable */}
        <div
          className="glass-card p-3 sm:p-4 md:p-5 xl:p-6 cursor-pointer hover:shadow-lg transition-all active:scale-[0.98] touch-manipulation rounded-lg sm:rounded-xl"
          onClick={() => setActiveModal('staff')}
        >
          <div className="flex items-center justify-between mb-3">
            <Users className="w-8 h-8 text-purple-500" />
            <span className="text-xs px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full bg-green-100 text-green-700">
              {companyStats.onlineExecutors} {t('director.online')}
            </span>
          </div>
          <div className="text-2xl font-bold">{companyStats.totalStaff}</div>
          <div className="text-sm text-gray-500">{t('director.staff')}</div>
          <div className="mt-2 flex items-center gap-2 text-xs flex-wrap">
            <span className="text-purple-600">{companyStats.totalManagers} {language === 'ru' ? 'мен.' : 'men.'}</span>
            <span className="text-primary-600">{companyStats.totalDepartmentHeads} {language === 'ru' ? 'гл.' : 'bosh.'}</span>
            <span className="text-green-600">{companyStats.totalExecutors} {language === 'ru' ? 'исп.' : 'ijr.'}</span>
          </div>
        </div>

        {/* Buildings - Clickable */}
        <div
          className="glass-card p-3 sm:p-4 md:p-5 xl:p-6 cursor-pointer hover:shadow-lg transition-all active:scale-[0.98] touch-manipulation rounded-lg sm:rounded-xl"
          onClick={() => setActiveModal('buildings')}
        >
          <div className="flex items-center justify-between mb-3">
            <Building2 className="w-8 h-8 text-teal-500" />
          </div>
          <div className="text-2xl font-bold">{companyStats.totalBuildings}</div>
          <div className="text-sm text-gray-500">{t('director.buildings')}</div>
          <div className="mt-2 text-xs text-gray-600">
            {companyStats.totalResidents} {t('director.residents')}
          </div>
        </div>

        {/* Meetings & Announcements - Clickable */}
        <div
          className="glass-card p-3 sm:p-4 md:p-5 xl:p-6 cursor-pointer hover:shadow-lg transition-all active:scale-[0.98] touch-manipulation rounded-lg sm:rounded-xl"
          onClick={() => setActiveModal('activity')}
        >
          <div className="flex items-center justify-between mb-3">
            <Activity className="w-8 h-8 text-primary-500" />
          </div>
          <div className="flex items-baseline gap-4">
            <div>
              <div className="text-2xl font-bold">{companyStats.activeMeetings}</div>
              <div className="text-xs text-gray-500">{t('director.meetings')}</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{companyStats.activeAnnouncements}</div>
              <div className="text-xs text-gray-500">{t('director.announcements')}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Completion Rate Banner */}
      <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6 bg-gradient-to-r from-primary-50 to-purple-50 rounded-lg sm:rounded-xl">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-600 mb-1">{t('director.completionRate')}</div>
            <div className="text-3xl font-bold text-gray-900">{companyStats.completionRate.toFixed(1)}%</div>
          </div>
          <div className="flex items-center gap-2">
            {companyStats.completionRate >= 80 ? (
              <TrendingUp className="w-8 h-8 text-green-500" />
            ) : companyStats.completionRate >= 50 ? (
              <Minus className="w-8 h-8 text-yellow-500" />
            ) : (
              <TrendingDown className="w-8 h-8 text-red-500" />
            )}
          </div>
        </div>
        <div className="mt-3 w-full bg-gray-200 rounded-full h-3">
          <div
            className={`h-3 rounded-full ${
              companyStats.completionRate >= 80 ? 'bg-green-500' :
              companyStats.completionRate >= 50 ? 'bg-orange-500' : 'bg-red-500'
            }`}
            style={{ width: `${Math.min(companyStats.completionRate, 100)}%` }}
          />
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid lg:grid-cols-2 gap-2 sm:gap-3 md:gap-4 xl:gap-5">
        {/* Weekly Trends Chart */}
        <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
          <h3 className="font-bold text-base sm:text-lg md:text-xl xl:text-2xl mb-3 md:mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary-500" />
            {language === 'ru' ? 'Динамика заявок за неделю' : 'Haftalik arizalar dinamikasi'}
          </h3>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData.weeklyData}>
              <defs>
                <linearGradient id="colorCreated" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Area
                type="monotone"
                dataKey="created"
                stroke="#3B82F6"
                strokeWidth={2}
                fill="url(#colorCreated)"
                name={language === 'ru' ? 'Создано' : 'Yaratilgan'}
              />
              <Area
                type="monotone"
                dataKey="completed"
                stroke="#10B981"
                strokeWidth={2}
                fill="url(#colorCompleted)"
                name={language === 'ru' ? 'Выполнено' : 'Bajarilgan'}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Request Status Distribution */}
        <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
          <h3 className="font-bold text-base sm:text-lg md:text-xl xl:text-2xl mb-3 md:mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-purple-500" />
            {language === 'ru' ? 'Статусы заявок' : 'Ariza holatlari'}
          </h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={chartData.statusData}
                cx="50%"
                cy="50%"
                labelLine={false}
                outerRadius={80}
                dataKey="value"
                label={({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {chartData.statusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Second row of charts */}
      <div className="grid lg:grid-cols-2 gap-2 sm:gap-3 md:gap-4 xl:gap-5">
        {/* Staff Distribution */}
        <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
          <h3 className="font-bold text-base sm:text-lg md:text-xl xl:text-2xl mb-3 md:mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-green-500" />
            {language === 'ru' ? 'Состав персонала' : 'Xodimlar tarkibi'}
          </h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={chartData.staffData}
                cx="50%"
                cy="50%"
                labelLine={false}
                outerRadius={80}
                dataKey="value"
                label={({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {chartData.staffData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Department Performance */}
        <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
          <h3 className="font-bold text-base sm:text-lg md:text-xl xl:text-2xl mb-3 md:mb-4 flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-orange-500" />
            {language === 'ru' ? 'Эффективность отделов' : 'Bo\'limlar samaradorligi'}
          </h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData.deptPerformance}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar
                dataKey="completed"
                stackId="a"
                fill="#10B981"
                name={language === 'ru' ? 'Выполнено' : 'Bajarildi'}
              />
              <Bar
                dataKey="pending"
                stackId="a"
                fill="#F59E0B"
                name={language === 'ru' ? 'В работе' : 'Jarayonda'}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid lg:grid-cols-2 gap-2 sm:gap-3 md:gap-4 xl:gap-5">
        {/* Stats by Building */}
        <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
          <h3 className="font-bold text-base sm:text-lg md:text-xl xl:text-2xl mb-3 md:mb-4 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-teal-500" />
            {t('director.byBuilding')}
          </h3>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {buildingStats.slice(0, 10).map((building) => (
              <div key={building.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{building.name}</div>
                  <div className="text-xs text-gray-500 truncate">{building.address}</div>
                </div>
                <div className="flex items-center gap-3 ml-2">
                  <div className="text-right">
                    <div className="text-sm font-medium">{building.totalRequests}</div>
                    <div className="text-xs text-gray-500">{t('director.requests')}</div>
                  </div>
                  <div className={`w-12 text-center text-xs font-medium px-2 py-1 rounded ${
                    building.completionRate >= 80 ? 'bg-green-100 text-green-700' :
                    building.completionRate >= 50 ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {building.completionRate.toFixed(0)}%
                  </div>
                </div>
              </div>
            ))}
            {buildingStats.length === 0 && (
              <EmptyState title={language === 'ru' ? 'Нет данных' : "Ma'lumot yo'q"} />
            )}
          </div>
        </div>

        {/* Stats by Department */}
        <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
          <h3 className="font-bold text-base sm:text-lg md:text-xl xl:text-2xl mb-3 md:mb-4 flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-purple-500" />
            {t('director.byDepartment')}
          </h3>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {departmentStats.map((dept) => (
              <div key={dept.specialization} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{dept.label}</div>
                  <div className="text-xs text-gray-500">
                    {dept.executorCount} {language === 'ru' ? 'сотр.' : 'xod.'}
                    {dept.avgRating > 0 && (
                      <span className="ml-2 text-yellow-600">
                        <Star className="w-3 h-3 inline" /> {dept.avgRating.toFixed(1)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 ml-2">
                  <div className="text-right">
                    <div className="text-sm font-medium">{dept.completed}/{dept.total}</div>
                    <div className="text-xs text-gray-500">{t('director.completed')}</div>
                  </div>
                  <div className={`w-12 text-center text-xs font-medium px-2 py-1 rounded ${
                    dept.completionRate >= 80 ? 'bg-green-100 text-green-700' :
                    dept.completionRate >= 50 ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {dept.completionRate.toFixed(0)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Performers */}
      <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
        <h3 className="font-bold text-base sm:text-lg md:text-xl xl:text-2xl mb-3 md:mb-4 flex items-center gap-2">
          <Star className="w-5 h-5 text-yellow-500" />
          {t('director.topPerformers')}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3 md:gap-4 xl:gap-5">
          {topExecutors.map((executor, index) => (
            <div key={executor.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white ${
                index === 0 ? 'bg-orange-500' :
                index === 1 ? 'bg-gray-400' :
                index === 2 ? 'bg-orange-400' :
                'bg-gray-300'
              }`}>
                {index + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{executor.name}</div>
                <div className="flex items-center gap-1 text-xs text-yellow-600">
                  <Star className="w-3 h-3" />
                  {(executor.rating || 0).toFixed(1)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Alerts */}
      {companyStats.pendingApproval > 0 && (
        <div
          className="glass-card p-3 sm:p-4 md:p-5 xl:p-6 border-2 border-primary-400 bg-primary-50 cursor-pointer hover:bg-primary-100 transition-colors touch-manipulation active:scale-[0.98] rounded-lg sm:rounded-xl"
          onClick={() => navigate('/requests')}
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-yellow-600" />
            <div className="flex-1">
              <div className="font-medium text-yellow-800">
                {companyStats.pendingApproval} {language === 'ru' ? 'заявок ожидают подтверждения' : 'arizalar tasdiqlanishni kutmoqda'}
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-yellow-600" />
          </div>
        </div>
      )}

      {/* Install App / Notifications */}
      <InstallAppSection language={language} roleContext="director" />

      {/* Requests Modal */}
      <DetailModal
        isOpen={activeModal === 'requests'}
        onClose={() => setActiveModal(null)}
        title={t('director.recentRequests')}
      >
        <div className="space-y-3">
          {recentRequests.map((req: any) => (
            <div key={req.id} className="p-3 bg-gray-50 rounded-xl">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="font-medium">{req.title}</div>
                  <div className="text-sm text-gray-500 flex items-center gap-2 mt-1">
                    <MapPin className="w-3 h-3" />
                    {formatAddress(req.address, req.apartment)}
                  </div>
                  <div className="text-xs text-gray-400 mt-1 flex items-center gap-2">
                    <Clock className="w-3 h-3" />
                    {new Date(req.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full ${getStatusColor(req.status)}`}>
                  {REQUEST_STATUS_LABELS[req.status]}
                </span>
              </div>
              {req.executorName && (
                <div className="mt-2 text-sm text-gray-600 flex items-center gap-2">
                  <Users className="w-3 h-3" />
                  {req.executorName}
                </div>
              )}
            </div>
          ))}
          <button
            onClick={() => { setActiveModal(null); navigate('/requests'); }}
            className="w-full min-h-[44px] py-2 text-center text-primary-600 font-medium hover:bg-primary-50 rounded-lg sm:rounded-xl touch-manipulation active:bg-primary-100"
          >
            {t('director.viewAll')} →
          </button>
        </div>
      </DetailModal>

      {/* Staff Modal */}
      <DetailModal
        isOpen={activeModal === 'staff'}
        onClose={() => setActiveModal(null)}
        title={t('director.staffList')}
      >
        <div className="space-y-4">
          {/* Managers */}
          {teamData && teamData.managers.length > 0 && (
            <div>
              <h4 className="font-medium text-sm text-purple-700 mb-2 flex items-center gap-2">
                <Shield className="w-4 h-4" />
                {language === 'ru' ? 'Менеджеры' : 'Menejerlar'} ({teamData.managers.length})
              </h4>
              <div className="space-y-2">
                {teamData.managers.map(member => (
                  <div key={member.id} className="p-3 bg-purple-50 rounded-xl flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold bg-purple-500">
                      {member.name.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">{member.name}</div>
                      <div className="text-sm text-gray-500">{member.phone}</div>
                    </div>
                    <div className="text-xs text-purple-600 bg-purple-100 px-2 py-1 rounded">
                      {language === 'ru' ? 'Менеджер' : 'Menejer'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Department Heads */}
          {teamData && teamData.departmentHeads.length > 0 && (
            <div>
              <h4 className="font-medium text-sm text-primary-700 mb-2 flex items-center gap-2">
                <UserCheck className="w-4 h-4" />
                {language === 'ru' ? 'Главы отделов' : 'Bo\'lim boshliklari'} ({teamData.departmentHeads.length})
              </h4>
              <div className="space-y-2">
                {teamData.departmentHeads.map(member => (
                  <div key={member.id} className="p-3 bg-primary-50 rounded-xl flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold bg-primary-500">
                      {member.name.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">{member.name}</div>
                      <div className="text-sm text-gray-500">
                        {SPECIALIZATION_LABELS[member.specialization as keyof typeof SPECIALIZATION_LABELS] || member.specialization || ''}
                      </div>
                    </div>
                    <div className="text-xs text-primary-600 bg-primary-100 px-2 py-1 rounded">
                      {language === 'ru' ? 'Глава' : 'Boshlik'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Executors */}
          <div>
            <h4 className="font-medium text-sm text-green-700 mb-2 flex items-center gap-2">
              <Wrench className="w-4 h-4" />
              {language === 'ru' ? 'Исполнители' : 'Ijrochilar'} ({teamData?.executors.length || executors.length})
            </h4>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {(teamData?.executors || executors).slice(0, 10).map((member: any) => (
                <div key={member.id} className="p-3 bg-green-50 rounded-xl flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                    member.status === 'available' ? 'bg-green-500' :
                    member.status === 'busy' ? 'bg-orange-500' : 'bg-gray-400'
                  }`}>
                    {member.name.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{member.name}</div>
                    <div className="text-sm text-gray-500">
                      {SPECIALIZATION_LABELS[member.specialization as keyof typeof SPECIALIZATION_LABELS] || member.specialization || ''}
                    </div>
                  </div>
                  <div className="text-right">
                    {(member.avg_rating || member.rating) && (
                      <div className="flex items-center gap-1 text-yellow-600">
                        <Star className="w-4 h-4" />
                        {(member.avg_rating || member.rating || 0).toFixed(1)}
                      </div>
                    )}
                    <div className="text-xs text-gray-500">
                      {member.completed_count || 0} {language === 'ru' ? 'вып.' : 'baj.'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => { setActiveModal(null); navigate('/team'); }}
            className="w-full min-h-[44px] py-2 text-center text-primary-600 font-medium hover:bg-primary-50 rounded-lg sm:rounded-xl touch-manipulation active:bg-primary-100"
          >
            {t('director.viewAll')} →
          </button>
        </div>
      </DetailModal>

      {/* Buildings Modal */}
      <DetailModal
        isOpen={activeModal === 'buildings'}
        onClose={() => setActiveModal(null)}
        title={t('director.buildingsList')}
      >
        <div className="space-y-3">
          {buildings.slice(0, 15).map((building: any) => (
            <div key={building.id} className="p-3 bg-gray-50 rounded-xl">
              <div className="flex items-start gap-3">
                <Building2 className="w-8 h-8 text-teal-500 flex-shrink-0" />
                <div className="flex-1">
                  <div className="font-medium">{building.name}</div>
                  <div className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                    <MapPin className="w-3 h-3" />
                    {building.address}
                  </div>
                  {building.totalApartments && (
                    <div className="text-xs text-gray-400 mt-1">
                      {building.totalApartments} {language === 'ru' ? 'квартир' : 'xonadon'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          <button
            onClick={() => { setActiveModal(null); navigate('/buildings'); }}
            className="w-full min-h-[44px] py-2 text-center text-primary-600 font-medium hover:bg-primary-50 rounded-lg sm:rounded-xl touch-manipulation active:bg-primary-100"
          >
            {t('director.viewAll')} →
          </button>
        </div>
      </DetailModal>

      {/* Activity Modal */}
      <DetailModal
        isOpen={activeModal === 'activity'}
        onClose={() => setActiveModal(null)}
        title={t('director.activityDetails')}
      >
        <div className="space-y-4">
          {/* Meetings section */}
          <div>
            <h4 className="font-medium flex items-center gap-2 mb-3">
              <Vote className="w-5 h-5 text-purple-500" />
              {t('director.meetings')} ({companyStats.activeMeetings})
            </h4>
            <div className="space-y-2">
              {meetings.filter((m: any) => ['schedule_poll_open', 'schedule_confirmed', 'voting_open'].includes(m.status)).slice(0, 5).map((meeting: any) => (
                <div key={meeting.id} className="p-3 bg-gray-50 rounded-xl">
                  <div className="font-medium text-sm">#{meeting.number}</div>
                  <div className="text-xs text-gray-500">{meeting.buildingAddress}</div>
                  <div className={`text-xs mt-1 ${
                    meeting.status === 'voting_open' ? 'text-green-600' : 'text-blue-600'
                  }`}>
                    {meeting.status === 'voting_open' ? (language === 'ru' ? 'Голосование открыто' : 'Ovoz berish ochiq') :
                     meeting.status === 'schedule_poll_open' ? (language === 'ru' ? 'Опрос по дате' : 'Sana so\'rovi') :
                     (language === 'ru' ? 'Дата подтверждена' : 'Sana tasdiqlandi')}
                  </div>
                </div>
              ))}
              {meetings.filter((m: any) => ['schedule_poll_open', 'schedule_confirmed', 'voting_open'].includes(m.status)).length === 0 && (
                <div className="text-gray-400 text-sm text-center py-4">
                  {language === 'ru' ? 'Нет активных собраний' : 'Faol yig\'ilishlar yo\'q'}
                </div>
              )}
            </div>
            <button
              onClick={() => { setActiveModal(null); navigate('/meetings'); }}
              className="w-full min-h-[44px] py-2 text-center text-primary-600 font-medium hover:bg-primary-50 rounded-lg sm:rounded-xl mt-2 touch-manipulation active:bg-primary-100"
            >
              {t('director.viewAll')} →
            </button>
          </div>

          {/* Announcements section */}
          <div>
            <h4 className="font-medium flex items-center gap-2 mb-3">
              <Megaphone className="w-5 h-5 text-orange-500" />
              {t('director.announcements')} ({companyStats.activeAnnouncements})
            </h4>
            <div className="space-y-2">
              {announcements.filter((a: any) => a.isActive).slice(0, 5).map((announcement: any) => (
                <div key={announcement.id} className="p-3 bg-gray-50 rounded-xl">
                  <div className="font-medium text-sm">{announcement.title}</div>
                  <div className="text-xs text-gray-500 line-clamp-2 mt-1">{announcement.content}</div>
                  <div className={`text-xs mt-1 px-2 py-0.5 rounded inline-block ${
                    announcement.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                    announcement.priority === 'important' ? 'bg-orange-100 text-orange-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {announcement.priority === 'urgent' ? (language === 'ru' ? 'Срочно' : 'Shoshilinch') :
                     announcement.priority === 'important' ? (language === 'ru' ? 'Важно' : 'Muhim') :
                     (language === 'ru' ? 'Обычный' : 'Oddiy')}
                  </div>
                </div>
              ))}
              {announcements.filter((a: any) => a.isActive).length === 0 && (
                <div className="text-gray-400 text-sm text-center py-4">
                  {language === 'ru' ? 'Нет активных объявлений' : 'Faol e\'lonlar yo\'q'}
                </div>
              )}
            </div>
            <button
              onClick={() => { setActiveModal(null); navigate('/announcements'); }}
              className="w-full min-h-[44px] py-2 text-center text-primary-600 font-medium hover:bg-primary-50 rounded-lg sm:rounded-xl mt-2 touch-manipulation active:bg-primary-100"
            >
              {t('director.viewAll')} →
            </button>
          </div>
        </div>
      </DetailModal>
    </>
  );
}

