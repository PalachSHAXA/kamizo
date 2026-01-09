import { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area
} from '../components/LazyCharts';
import {
  Building2, Users, FileText, TrendingUp, TrendingDown, Minus,
  AlertTriangle, Briefcase, Star, Activity, ArrowRight, RefreshCw,
  X, Clock, MapPin, Megaphone, Vote, Shield, UserCheck, Wrench
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDataStore } from '../stores/dataStore';
import { useCRMStore } from '../stores/crmStore';
import { useMeetingStore } from '../stores/meetingStore';
import { useLanguageStore } from '../stores/languageStore';
import { formatAddress } from '../utils/formatAddress';
import { SPECIALIZATION_LABELS } from '../types';
import { teamApi } from '../services/api';

const REQUEST_STATUS_LABELS: Record<string, string> = {
  new: 'Новая',
  assigned: 'Назначена',
  accepted: 'Принята',
  in_progress: 'В работе',
  pending_approval: 'На проверке',
  completed: 'Выполнена',
  cancelled: 'Отменена',
};

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
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {children}
        </div>
      </div>
    </div>
  );
}

interface TeamMember {
  id: string;
  name: string;
  phone: string;
  role: 'manager' | 'department_head' | 'executor';
  specialization?: string;
  status?: string;
  completed_count?: number;
  active_count?: number;
  avg_rating?: number;
}

interface TeamData {
  managers: TeamMember[];
  departmentHeads: TeamMember[];
  executors: TeamMember[];
  total: number;
}

export function DirectorDashboard() {
  const navigate = useNavigate();
  const { requests, executors, announcements, fetchRequests, fetchExecutors } = useDataStore();
  const { buildings, residents, fetchBuildings } = useCRMStore();
  const { meetings, fetchMeetings } = useMeetingStore();
  const { language } = useLanguageStore();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeModal, setActiveModal] = useState<'requests' | 'staff' | 'buildings' | 'activity' | null>(null);
  const [teamData, setTeamData] = useState<TeamData | null>(null);

  // Load data on mount
  useEffect(() => {
    fetchRequests();
    fetchExecutors();
    fetchBuildings();
    fetchMeetings();
    loadTeamData();
  }, [fetchRequests, fetchExecutors, fetchBuildings, fetchMeetings]);

  const loadTeamData = async () => {
    try {
      const data = await teamApi.getAll();
      // Add total count to match TeamData interface
      const totalCount = (data.managers?.length || 0) + (data.departmentHeads?.length || 0) + (data.executors?.length || 0);
      setTeamData({
        ...data,
        total: totalCount,
      });
    } catch (err) {
      console.error('Failed to load team data:', err);
    }
  };

  // Calculate company-wide statistics
  const companyStats = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Request stats
    const totalRequests = requests.length;
    const newRequests = requests.filter(r => r.status === 'new').length;
    const inProgress = requests.filter(r => ['assigned', 'accepted', 'in_progress'].includes(r.status)).length;
    const completedTotal = requests.filter(r => r.status === 'completed').length;
    const completedThisWeek = requests.filter(r => {
      if (r.status !== 'completed') return false;
      const completedAt = r.completedAt ? new Date(r.completedAt) : null;
      return completedAt && completedAt >= weekAgo;
    }).length;
    const completedThisMonth = requests.filter(r => {
      if (r.status !== 'completed') return false;
      const completedAt = r.completedAt ? new Date(r.completedAt) : null;
      return completedAt && completedAt >= monthAgo;
    }).length;
    const pendingApproval = requests.filter(r => r.status === 'pending_approval').length;

    // Calculate completion rate
    const completionRate = totalRequests > 0 ? (completedTotal / totalRequests * 100) : 0;

    // Team stats from teamApi
    const totalManagers = teamData?.managers.length || 0;
    const totalDepartmentHeads = teamData?.departmentHeads.length || 0;
    const totalExecutorsFromTeam = teamData?.executors.length || executors.length;
    const totalStaff = (teamData?.total || 0) || (totalManagers + totalDepartmentHeads + totalExecutorsFromTeam);

    const onlineExecutors = executors.filter(e => e.status !== 'offline').length;
    const avgRating = executors.length > 0
      ? executors.reduce((sum, e) => sum + (e.rating || 0), 0) / executors.length
      : 0;

    // Building stats
    const totalBuildings = buildings.length;
    const totalResidents = residents.length;

    // Active meetings
    const activeMeetings = meetings.filter(m =>
      ['schedule_poll_open', 'schedule_confirmed', 'voting_open'].includes(m.status)
    ).length;

    // Active announcements
    const activeAnnouncements = announcements.filter(a => a.isActive).length;

    return {
      totalRequests,
      newRequests,
      inProgress,
      completedTotal,
      completedThisWeek,
      completedThisMonth,
      pendingApproval,
      completionRate,
      totalStaff,
      totalManagers,
      totalDepartmentHeads,
      totalExecutors: totalExecutorsFromTeam,
      onlineExecutors,
      avgRating,
      totalBuildings,
      totalResidents,
      activeMeetings,
      activeAnnouncements,
    };
  }, [requests, executors, buildings, residents, meetings, announcements, teamData]);

  // Recent requests for modal
  const recentRequests = useMemo(() => {
    return [...requests]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);
  }, [requests]);

  // Stats by building
  const buildingStats = useMemo(() => {
    return buildings.map(building => {
      const buildingRequests = requests.filter(r => {
        // Check building_id directly (returned from API via resident's building_id)
        if ((r as any).building_id === building.id || (r as any).buildingId === building.id) return true;
        // Fallback: check by building name match in address
        if (r.address) {
          const addr = r.address.toLowerCase();
          const bName = building.name.toLowerCase();
          const buildingNum = bName.replace(/дом\s*/i, '').trim().toLowerCase();
          if (buildingNum && addr.includes(buildingNum + '-')) return true;
          if (buildingNum && addr.includes(buildingNum + ' ')) return true;
        }
        return false;
      });
      const completed = buildingRequests.filter(r => r.status === 'completed').length;
      const pending = buildingRequests.filter(r => r.status === 'new').length;
      const inProgress = buildingRequests.filter(r => ['assigned', 'accepted', 'in_progress'].includes(r.status)).length;

      return {
        id: building.id,
        name: building.name,
        address: building.address,
        totalRequests: buildingRequests.length,
        completed,
        pending,
        inProgress,
        completionRate: buildingRequests.length > 0 ? (completed / buildingRequests.length * 100) : 0,
      };
    }).sort((a, b) => b.totalRequests - a.totalRequests);
  }, [buildings, requests]);

  // Stats by specialization (department)
  const departmentStats = useMemo(() => {
    const specs = new Map<string, { total: number; completed: number; avgRating: number; executorCount: number }>();

    executors.forEach(executor => {
      const spec = executor.specialization || 'other';
      if (!specs.has(spec)) {
        specs.set(spec, { total: 0, completed: 0, avgRating: 0, executorCount: 0 });
      }
      const data = specs.get(spec)!;
      data.executorCount++;
      data.avgRating = (data.avgRating * (data.executorCount - 1) + (executor.rating || 0)) / data.executorCount;
    });

    requests.forEach(req => {
      const spec = req.category || 'other';
      if (!specs.has(spec)) {
        specs.set(spec, { total: 0, completed: 0, avgRating: 0, executorCount: 0 });
      }
      const data = specs.get(spec)!;
      data.total++;
      if (req.status === 'completed') {
        data.completed++;
      }
    });

    return Array.from(specs.entries())
      .map(([spec, data]) => ({
        specialization: spec,
        label: SPECIALIZATION_LABELS[spec as keyof typeof SPECIALIZATION_LABELS] || spec,
        ...data,
        completionRate: data.total > 0 ? (data.completed / data.total * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [executors, requests]);

  // Top performers
  const topExecutors = useMemo(() => {
    return [...executors]
      .sort((a, b) => (b.rating || 0) - (a.rating || 0))
      .slice(0, 5);
  }, [executors]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      fetchRequests(),
      fetchExecutors(),
      fetchBuildings(),
      fetchMeetings(),
      loadTeamData(),
    ]);
    setIsRefreshing(false);
  };

  // Data for charts
  const chartData = useMemo(() => {
    // Weekly request trends (last 7 days)
    const weeklyData = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayName = date.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', { weekday: 'short' });

      const created = requests.filter(r => r.createdAt.startsWith(dateStr)).length;
      const completed = requests.filter(r => r.completedAt?.startsWith(dateStr)).length;

      weeklyData.push({ day: dayName, created, completed });
    }

    // Request status distribution
    const statusData = [
      { name: language === 'ru' ? 'Новые' : 'Yangi', value: companyStats.newRequests, color: '#3B82F6' },
      { name: language === 'ru' ? 'В работе' : 'Jarayonda', value: companyStats.inProgress, color: '#F59E0B' },
      { name: language === 'ru' ? 'На проверке' : 'Tekshiruvda', value: companyStats.pendingApproval, color: '#8B5CF6' },
      { name: language === 'ru' ? 'Выполнено' : 'Bajarildi', value: companyStats.completedTotal, color: '#10B981' },
    ].filter(d => d.value > 0);

    // Staff distribution by role
    const staffData = [
      { name: language === 'ru' ? 'Менеджеры' : 'Menejerlar', value: companyStats.totalManagers, color: '#8B5CF6' },
      { name: language === 'ru' ? 'Главы отделов' : 'Bo\'lim boshliklari', value: companyStats.totalDepartmentHeads, color: '#3B82F6' },
      { name: language === 'ru' ? 'Исполнители' : 'Ijrochilar', value: companyStats.totalExecutors, color: '#10B981' },
    ].filter(d => d.value > 0);

    // Department performance
    const deptPerformance = departmentStats.slice(0, 6).map(d => ({
      name: d.label.length > 8 ? d.label.slice(0, 8) + '...' : d.label,
      fullName: d.label,
      completed: d.completed,
      pending: d.total - d.completed,
      rate: Math.round(d.completionRate),
    }));

    return { weeklyData, statusData, staffData, deptPerformance };
  }, [requests, companyStats, departmentStats, language]);

  const t = (key: string) => {
    const translations: Record<string, Record<string, string>> = {
      'director.title': { ru: 'Обзор компании', uz: 'Kompaniya sharhi' },
      'director.subtitle': { ru: 'Ключевые показатели и статистика', uz: 'Asosiy ko\'rsatkichlar va statistika' },
      'director.refresh': { ru: 'Обновить', uz: 'Yangilash' },
      'director.requests': { ru: 'Заявки', uz: 'Arizalar' },
      'director.new': { ru: 'Новые', uz: 'Yangi' },
      'director.inProgress': { ru: 'В работе', uz: 'Jarayonda' },
      'director.completed': { ru: 'Выполнено', uz: 'Bajarildi' },
      'director.thisWeek': { ru: 'за неделю', uz: 'hafta uchun' },
      'director.staff': { ru: 'Сотрудники', uz: 'Xodimlar' },
      'director.online': { ru: 'Онлайн', uz: 'Onlayn' },
      'director.avgRating': { ru: 'Средний рейтинг', uz: 'O\'rtacha reyting' },
      'director.buildings': { ru: 'Здания', uz: 'Binolar' },
      'director.residents': { ru: 'Жители', uz: 'Aholisi' },
      'director.meetings': { ru: 'Собрания', uz: 'Yig\'ilishlar' },
      'director.active': { ru: 'Активные', uz: 'Faol' },
      'director.announcements': { ru: 'Объявления', uz: 'E\'lonlar' },
      'director.byBuilding': { ru: 'По зданиям', uz: 'Binolar bo\'yicha' },
      'director.byDepartment': { ru: 'По отделам', uz: 'Bo\'limlar bo\'yicha' },
      'director.topPerformers': { ru: 'Лучшие сотрудники', uz: 'Eng yaxshi xodimlar' },
      'director.completionRate': { ru: 'Выполнение', uz: 'Bajarish' },
      'director.pending': { ru: 'Ожидает', uz: 'Kutmoqda' },
      'director.viewAll': { ru: 'Смотреть все', uz: 'Hammasini ko\'rish' },
      'director.recentRequests': { ru: 'Последние заявки', uz: 'So\'nggi arizalar' },
      'director.staffList': { ru: 'Список сотрудников', uz: 'Xodimlar ro\'yxati' },
      'director.buildingsList': { ru: 'Список зданий', uz: 'Binolar ro\'yxati' },
      'director.activityDetails': { ru: 'Активность', uz: 'Faollik' },
    };
    return translations[key]?.[language] || key;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new': return 'bg-blue-100 text-blue-700';
      case 'assigned': return 'bg-yellow-100 text-yellow-700';
      case 'in_progress': return 'bg-orange-100 text-orange-700';
      case 'completed': return 'bg-green-100 text-green-700';
      case 'pending_approval': return 'bg-purple-100 text-purple-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('director.title')}</h1>
          <p className="text-gray-500">{t('director.subtitle')}</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="btn-secondary flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          {t('director.refresh')}
        </button>
      </div>

      {/* Main Stats - Clickable Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Requests - Clickable */}
        <div
          className="glass-card p-5 cursor-pointer hover:shadow-lg transition-shadow active:scale-[0.98]"
          onClick={() => setActiveModal('requests')}
        >
          <div className="flex items-center justify-between mb-3">
            <FileText className="w-8 h-8 text-blue-500" />
            <span className={`text-xs px-2 py-1 rounded-full ${
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
          className="glass-card p-5 cursor-pointer hover:shadow-lg transition-shadow active:scale-[0.98]"
          onClick={() => setActiveModal('staff')}
        >
          <div className="flex items-center justify-between mb-3">
            <Users className="w-8 h-8 text-purple-500" />
            <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">
              {companyStats.onlineExecutors} {t('director.online')}
            </span>
          </div>
          <div className="text-2xl font-bold">{companyStats.totalStaff}</div>
          <div className="text-sm text-gray-500">{t('director.staff')}</div>
          <div className="mt-2 flex items-center gap-2 text-xs flex-wrap">
            <span className="text-purple-600">{companyStats.totalManagers} {language === 'ru' ? 'мен.' : 'men.'}</span>
            <span className="text-blue-600">{companyStats.totalDepartmentHeads} {language === 'ru' ? 'гл.' : 'bosh.'}</span>
            <span className="text-green-600">{companyStats.totalExecutors} {language === 'ru' ? 'исп.' : 'ijr.'}</span>
          </div>
        </div>

        {/* Buildings - Clickable */}
        <div
          className="glass-card p-5 cursor-pointer hover:shadow-lg transition-shadow active:scale-[0.98]"
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
          className="glass-card p-5 cursor-pointer hover:shadow-lg transition-shadow active:scale-[0.98]"
          onClick={() => setActiveModal('activity')}
        >
          <div className="flex items-center justify-between mb-3">
            <Activity className="w-8 h-8 text-orange-500" />
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
      <div className="glass-card p-5 bg-gradient-to-r from-blue-50 to-purple-50">
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
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Weekly Trends Chart */}
        <div className="glass-card p-5">
          <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-500" />
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
        <div className="glass-card p-5">
          <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
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
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Staff Distribution */}
        <div className="glass-card p-5">
          <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
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
        <div className="glass-card p-5">
          <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
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
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Stats by Building */}
        <div className="glass-card p-5">
          <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
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
              <div className="text-center text-gray-400 py-8">
                {language === 'ru' ? 'Нет данных' : 'Ma\'lumot yo\'q'}
              </div>
            )}
          </div>
        </div>

        {/* Stats by Department */}
        <div className="glass-card p-5">
          <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
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
      <div className="glass-card p-5">
        <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
          <Star className="w-5 h-5 text-yellow-500" />
          {t('director.topPerformers')}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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
          className="glass-card p-4 border-2 border-orange-400 bg-orange-50 cursor-pointer hover:bg-orange-100 transition-colors"
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

      {/* Requests Modal */}
      <DetailModal
        isOpen={activeModal === 'requests'}
        onClose={() => setActiveModal(null)}
        title={t('director.recentRequests')}
      >
        <div className="space-y-3">
          {recentRequests.map(req => (
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
                <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(req.status)}`}>
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
            className="w-full py-2 text-center text-blue-600 font-medium hover:bg-blue-50 rounded-xl"
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
              <h4 className="font-medium text-sm text-blue-700 mb-2 flex items-center gap-2">
                <UserCheck className="w-4 h-4" />
                {language === 'ru' ? 'Главы отделов' : 'Bo\'lim boshliklari'} ({teamData.departmentHeads.length})
              </h4>
              <div className="space-y-2">
                {teamData.departmentHeads.map(member => (
                  <div key={member.id} className="p-3 bg-blue-50 rounded-xl flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold bg-blue-500">
                      {member.name.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">{member.name}</div>
                      <div className="text-sm text-gray-500">
                        {SPECIALIZATION_LABELS[member.specialization as keyof typeof SPECIALIZATION_LABELS] || member.specialization || ''}
                      </div>
                    </div>
                    <div className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded">
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
            className="w-full py-2 text-center text-blue-600 font-medium hover:bg-blue-50 rounded-xl"
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
          {buildings.slice(0, 15).map(building => (
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
            className="w-full py-2 text-center text-blue-600 font-medium hover:bg-blue-50 rounded-xl"
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
              {meetings.filter(m => ['schedule_poll_open', 'schedule_confirmed', 'voting_open'].includes(m.status)).slice(0, 5).map(meeting => (
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
              {meetings.filter(m => ['schedule_poll_open', 'schedule_confirmed', 'voting_open'].includes(m.status)).length === 0 && (
                <div className="text-gray-400 text-sm text-center py-4">
                  {language === 'ru' ? 'Нет активных собраний' : 'Faol yig\'ilishlar yo\'q'}
                </div>
              )}
            </div>
            <button
              onClick={() => { setActiveModal(null); navigate('/meetings'); }}
              className="w-full py-2 text-center text-blue-600 font-medium hover:bg-blue-50 rounded-xl mt-2"
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
              {announcements.filter(a => a.isActive).slice(0, 5).map(announcement => (
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
              {announcements.filter(a => a.isActive).length === 0 && (
                <div className="text-gray-400 text-sm text-center py-4">
                  {language === 'ru' ? 'Нет активных объявлений' : 'Faol e\'lonlar yo\'q'}
                </div>
              )}
            </div>
            <button
              onClick={() => { setActiveModal(null); navigate('/announcements'); }}
              className="w-full py-2 text-center text-blue-600 font-medium hover:bg-blue-50 rounded-xl mt-2"
            >
              {t('director.viewAll')} →
            </button>
          </div>
        </div>
      </DetailModal>
    </div>
  );
}
