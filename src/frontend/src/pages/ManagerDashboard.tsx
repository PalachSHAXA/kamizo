import { useState, useEffect, useMemo } from 'react';
import { InstallAppSection } from '../components/InstallAppSection';
import { Activity, Star } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useRequestStore } from '../stores/requestStore';
import { useExecutorStore } from '../stores/executorStore';
import { useLanguageStore } from '../stores/languageStore';
import { ukRatingsApi } from '../services/api';
import { SPECIALIZATION_LABELS } from '../types';
import type { ExecutorSpecialization, Request, Executor, RescheduleRequest } from '../types';
import { CredentialsModal } from '../components/modals/CredentialsModal';
import { AssignExecutorModal } from '../components/modals/AssignExecutorModal';
import {
  OverviewTab,
  RatingsTab,
  AddExecutorModal,
  AddResidentModal,
  ExecutorDetailsModal,
  RescheduleDetailsModal,
  CATEGORY_COLORS,
} from './manager/components';

// Re-export components used by other pages
export { ExecutorCard } from './manager/components';
export { ResidentsSection } from './manager/components';
export { ReportsSection } from './manager/components';

export function ManagerDashboard() {
  const { user } = useAuthStore();
  const { language } = useLanguageStore();
  const executors = useExecutorStore(s => s.executors);
  const addExecutor = useExecutorStore(s => s.addExecutor);
  const deleteExecutor = useExecutorStore(s => s.deleteExecutor);
  const updateExecutor = useExecutorStore(s => s.updateExecutor);
  const requests = useRequestStore(s => s.requests);
  const getStats = useRequestStore(s => s.getStats);
  const getChartData = useRequestStore(s => s.getChartData);
  const assignRequest = useRequestStore(s => s.assignRequest);
  const rescheduleRequests = useRequestStore(s => s.rescheduleRequests);
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

  // Get pending reschedule requests
  const pendingReschedules = useMemo(() => rescheduleRequests.filter(r => r.status === 'pending'), [rescheduleRequests]);
  const recentReschedules = useMemo(() => rescheduleRequests
    .filter(r => r.status !== 'pending')
    .sort((a, b) => new Date(b.respondedAt || b.createdAt).getTime() - new Date(a.respondedAt || a.createdAt).getTime())
    .slice(0, 5), [rescheduleRequests]);

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

      {managerTab === 'overview' && (
        <>
          <OverviewTab
            stats={stats}
            chartData={chartData}
            categoryData={categoryData}
            pendingReschedules={pendingReschedules}
            recentReschedules={recentReschedules}
            requests={requests}
            onAssignRequest={(request) => setShowAssignModal(request)}
            onSelectReschedule={(reschedule) => setSelectedReschedule(reschedule)}
          />
        </>
      )}

      {/* Ratings Tab */}
      {managerTab === 'ratings' && (
        <RatingsTab
          ratingSummary={ratingSummary}
          isLoadingRatings={isLoadingRatings}
        />
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
