import { useState, useEffect, useMemo } from 'react';
import { Activity, RefreshCw, ShoppingBag, Star } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { useCRMStore } from '../stores/crmStore';
import { useMeetingStore } from '../stores/meetingStore';
import { useLanguageStore } from '../stores/languageStore';
import { SPECIALIZATION_LABELS } from '../types';
import { teamApi, apiRequest, ukRatingsApi } from '../services/api';
import { OverviewTab, MarketplaceTab, RatingsTab, createTranslator } from './dashboard';
import type { TeamData, MarketplaceReport, TabType, CompanyStats, BuildingStat, DepartmentStat, ChartData } from './dashboard';

export function DirectorDashboard() {
  const { user } = useAuthStore();
  const { requests, executors, announcements, fetchRequests, fetchExecutors } = useDataStore();
  const { buildings, residents, fetchBuildings } = useCRMStore();
  const { meetings, fetchMeetings } = useMeetingStore();
  const { language } = useLanguageStore();

  const t = useMemo(() => createTranslator(language), [language]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [teamData, setTeamData] = useState<TeamData | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [marketplaceReport, setMarketplaceReport] = useState<MarketplaceReport | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [reportStartDate, setReportStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [reportEndDate, setReportEndDate] = useState(() => new Date().toISOString().slice(0, 10));

  // UK Satisfaction ratings state
  const [ratingSummary, setRatingSummary] = useState<any>(null);
  const [isLoadingRatings, setIsLoadingRatings] = useState(false);

  const loadRatingSummary = async () => {
    setIsLoadingRatings(true);
    try {
      const data = await ukRatingsApi.getSummary(6);
      setRatingSummary(data);
    } catch (err) {
      console.error('Failed to load ratings summary:', err);
    } finally {
      setIsLoadingRatings(false);
    }
  };

  // Load data on mount
  useEffect(() => {
    fetchRequests();
    fetchExecutors();
    fetchBuildings();
    fetchMeetings();
    loadTeamData();
  }, [fetchRequests, fetchExecutors, fetchBuildings, fetchMeetings]);

  // Load marketplace report when tab changes or dates change
  useEffect(() => {
    if (activeTab === 'marketplace') {
      loadMarketplaceReport();
    }
    if (activeTab === 'ratings') {
      loadRatingSummary();
    }
  }, [activeTab, reportStartDate, reportEndDate]);

  const loadMarketplaceReport = async () => {
    setIsLoadingReport(true);
    try {
      const data = await apiRequest<MarketplaceReport>(
        `/api/marketplace/admin/reports?start_date=${reportStartDate}&end_date=${reportEndDate}`
      );
      setMarketplaceReport(data);
    } catch (err) {
      console.error('Failed to load marketplace report:', err);
    } finally {
      setIsLoadingReport(false);
    }
  };

  const loadTeamData = async () => {
    try {
      const data = await teamApi.getAll();
      const totalCount = (data.managers?.length || 0) + (data.departmentHeads?.length || 0) + (data.executors?.length || 0);
      setTeamData({ ...data, total: totalCount });
    } catch (err) {
      console.error('Failed to load team data:', err);
    }
  };

  // Calculate company-wide statistics
  const companyStats: CompanyStats = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

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
    const completionRate = totalRequests > 0 ? (completedTotal / totalRequests * 100) : 0;

    const totalManagers = teamData?.managers.length || 0;
    const totalDepartmentHeads = teamData?.departmentHeads.length || 0;
    const totalExecutorsFromTeam = teamData?.executors.length || executors.length;
    const totalStaff = (teamData?.total || 0) || (totalManagers + totalDepartmentHeads + totalExecutorsFromTeam);
    const onlineExecutors = executors.filter(e => e.status !== 'offline').length;
    const avgRating = executors.length > 0
      ? executors.reduce((sum, e) => sum + (e.rating || 0), 0) / executors.length
      : 0;

    return {
      totalRequests, newRequests, inProgress, completedTotal, completedThisWeek,
      completedThisMonth, pendingApproval, completionRate, totalStaff, totalManagers,
      totalDepartmentHeads, totalExecutors: totalExecutorsFromTeam, onlineExecutors,
      avgRating, totalBuildings: buildings.length, totalResidents: residents.length,
      activeMeetings: meetings.filter(m => ['schedule_poll_open', 'schedule_confirmed', 'voting_open'].includes(m.status)).length,
      activeAnnouncements: announcements.filter(a => a.isActive).length,
    };
  }, [requests, executors, buildings, residents, meetings, announcements, teamData]);

  // Recent requests for modal
  const recentRequests = useMemo(() => {
    return [...requests]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);
  }, [requests]);

  // Stats by building
  const buildingStats: BuildingStat[] = useMemo(() => {
    return buildings.map(building => {
      const buildingRequests = requests.filter(r => {
        if ((r as any).building_id === building.id || (r as any).buildingId === building.id) return true;
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
      const inProg = buildingRequests.filter(r => ['assigned', 'accepted', 'in_progress'].includes(r.status)).length;

      return {
        id: building.id,
        name: building.name,
        address: building.address,
        totalRequests: buildingRequests.length,
        completed, pending, inProgress: inProg,
        completionRate: buildingRequests.length > 0 ? (completed / buildingRequests.length * 100) : 0,
      };
    }).sort((a, b) => b.totalRequests - a.totalRequests);
  }, [buildings, requests]);

  // Stats by specialization (department)
  const departmentStats: DepartmentStat[] = useMemo(() => {
    const specs = new Map<string, { total: number; completed: number; avgRating: number; executorCount: number }>();

    executors.forEach(executor => {
      const spec = executor.specialization || 'other';
      if (!specs.has(spec)) specs.set(spec, { total: 0, completed: 0, avgRating: 0, executorCount: 0 });
      const data = specs.get(spec)!;
      data.executorCount++;
      data.avgRating = (data.avgRating * (data.executorCount - 1) + (executor.rating || 0)) / data.executorCount;
    });

    requests.forEach(req => {
      const spec = req.category || 'other';
      if (!specs.has(spec)) specs.set(spec, { total: 0, completed: 0, avgRating: 0, executorCount: 0 });
      const data = specs.get(spec)!;
      data.total++;
      if (req.status === 'completed') data.completed++;
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
    return [...executors].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 5);
  }, [executors]);

  // Data for charts
  const chartData: ChartData = useMemo(() => {
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

    const statusData = [
      { name: language === 'ru' ? 'Новые' : 'Yangi', value: companyStats.newRequests, color: '#3B82F6' },
      { name: language === 'ru' ? 'В работе' : 'Jarayonda', value: companyStats.inProgress, color: '#F59E0B' },
      { name: language === 'ru' ? 'На проверке' : 'Tekshiruvda', value: companyStats.pendingApproval, color: '#8B5CF6' },
      { name: language === 'ru' ? 'Выполнено' : 'Bajarildi', value: companyStats.completedTotal, color: '#10B981' },
    ].filter(d => d.value > 0);

    const staffData = [
      { name: language === 'ru' ? 'Менеджеры' : 'Menejerlar', value: companyStats.totalManagers, color: '#8B5CF6' },
      { name: language === 'ru' ? 'Главы отделов' : 'Bo\'lim boshliklari', value: companyStats.totalDepartmentHeads, color: '#3B82F6' },
      { name: language === 'ru' ? 'Исполнители' : 'Ijrochilar', value: companyStats.totalExecutors, color: '#10B981' },
    ].filter(d => d.value > 0);

    const deptPerformance = departmentStats.slice(0, 6).map(d => ({
      name: d.label.length > 8 ? d.label.slice(0, 8) + '...' : d.label,
      fullName: d.label,
      completed: d.completed,
      pending: d.total - d.completed,
      rate: Math.round(d.completionRate),
    }));

    return { weeklyData, statusData, staffData, deptPerformance };
  }, [requests, companyStats, departmentStats, language]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      fetchRequests(), fetchExecutors(), fetchBuildings(), fetchMeetings(), loadTeamData(),
      activeTab === 'marketplace' ? loadMarketplaceReport() : Promise.resolve(),
    ]);
    setIsRefreshing(false);
  };

  return (
    <div className="space-y-6 xl:space-y-8 pb-24 md:pb-0">
      {/* Header with greeting */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-400 font-medium">
            {language === 'ru'
              ? `${new Date().getHours() < 12 ? 'Доброе утро' : new Date().getHours() < 18 ? 'Добрый день' : 'Добрый вечер'}, ${user?.name?.split(' ')[0] || ''} 👋`
              : `${new Date().getHours() < 12 ? 'Xayrli tong' : new Date().getHours() < 18 ? 'Xayrli kun' : 'Xayrli kech'}, ${user?.name?.split(' ')[0] || ''} 👋`}
          </p>
          <h1 className="text-xl md:text-2xl xl:text-3xl font-bold text-gray-900">{t('director.title')}</h1>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="btn-secondary flex items-center gap-2 min-h-[44px] touch-manipulation active:scale-[0.98]"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          {t('director.refresh')}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 min-h-[44px] font-medium text-sm border-b-2 transition-colors touch-manipulation active:bg-gray-100 ${
            activeTab === 'overview'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Activity className="w-4 h-4 inline mr-2" />
          {t('director.overview')}
        </button>
        <button
          onClick={() => setActiveTab('marketplace')}
          className={`px-4 py-2 min-h-[44px] font-medium text-sm border-b-2 transition-colors touch-manipulation active:bg-gray-100 ${
            activeTab === 'marketplace'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <ShoppingBag className="w-4 h-4 inline mr-2" />
          {t('director.marketplace')}
        </button>
        <button
          onClick={() => setActiveTab('ratings')}
          className={`px-4 py-2 min-h-[44px] font-medium text-sm border-b-2 transition-colors touch-manipulation active:bg-gray-100 ${
            activeTab === 'ratings'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Star className="w-4 h-4 inline mr-2" />
          {t('director.ratings')}
        </button>
      </div>

      {activeTab === 'overview' && (
        <OverviewTab
          language={language}
          companyStats={companyStats}
          chartData={chartData}
          buildingStats={buildingStats}
          departmentStats={departmentStats}
          topExecutors={topExecutors}
          recentRequests={recentRequests}
          teamData={teamData}
          executors={executors}
          buildings={buildings}
          meetings={meetings}
          announcements={announcements}
          t={t}
        />
      )}

      {activeTab === 'marketplace' && (
        <MarketplaceTab
          language={language}
          t={t}
          marketplaceReport={marketplaceReport}
          isLoadingReport={isLoadingReport}
          reportStartDate={reportStartDate}
          reportEndDate={reportEndDate}
          onStartDateChange={setReportStartDate}
          onEndDateChange={setReportEndDate}
        />
      )}

      {activeTab === 'ratings' && (
        <RatingsTab
          language={language}
          t={t}
          ratingSummary={ratingSummary}
          isLoadingRatings={isLoadingRatings}
        />
      )}
    </div>
  );
}
