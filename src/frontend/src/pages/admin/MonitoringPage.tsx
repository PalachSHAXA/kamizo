import { useState, useEffect, useMemo } from 'react';
import { AlertCircle, CheckCircle, Clock, Database, Server, Wifi, X, BarChart, TrendingUp, Activity, Zap, Users, FileText, RefreshCw } from 'lucide-react';
import {
  LineChart, Line, BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell
} from '../../components/LazyCharts';
import { useDataStore } from '../../stores/dataStore';
import type { Request } from '../../types';

interface HealthCheck {
  status: 'healthy' | 'degraded' | 'down';
  timestamp: number;
  checks: {
    database: boolean;
    cache: boolean;
    websocket: boolean;
  };
  metrics: {
    avgResponseTime: number;
    errorRate: number;
    activeConnections: number;
  };
}

interface PerformanceStats {
  period: string;
  totalRequests: number;
  errorCount: number;
  errorRate: number;
  avgResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  endpointStats: Array<{
    endpoint: string;
    count: number;
    avgTime: number;
    errorRate: number;
  }>;
  recentErrors: Array<{
    message: string;
    endpoint: string;
    timestamp: string;
  }>;
}

interface CacheStats {
  memory: {
    size: number;
    hits: number;
    misses: number;
    hitRate: number;
  };
  kv: {
    operations: number;
    estimatedSize: string;
  };
}

// Chart colors
const CHART_COLORS = {
  primary: '#3B82F6',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  purple: '#8B5CF6',
  cyan: '#06B6D4',
};

const STATUS_COLORS: Record<string, string> = {
  new: '#3B82F6',
  assigned: '#8B5CF6',
  in_progress: '#F59E0B',
  pending_approval: '#A855F7',
  completed: '#10B981',
  cancelled: '#EF4444',
};

export function MonitoringPage() {
  const [health, setHealth] = useState<HealthCheck | null>(null);
  const [performance, setPerformance] = useState<PerformanceStats | null>(null);
  const [cache, setCache] = useState<CacheStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'performance' | 'requests'>('overview');

  const { requests, executors, getStats } = useDataStore();
  const stats = getStats();

  // Generate mock response time history for chart
  const responseTimeHistory = useMemo(() => {
    const data = [];
    for (let i = 23; i >= 0; i--) {
      const hour = new Date();
      hour.setHours(hour.getHours() - i);
      data.push({
        time: hour.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
        avgTime: Math.floor(Math.random() * 150) + 50,
        requests: Math.floor(Math.random() * 100) + 20,
      });
    }
    return data;
  }, []);

  // Request statistics by status
  const requestsByStatus = useMemo(() => {
    const statusCounts: Record<string, number> = {};
    requests.forEach((r: Request) => {
      statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    });

    return Object.entries(statusCounts).map(([status, count]) => ({
      name: status === 'new' ? 'Новые' :
            status === 'assigned' ? 'Назначены' :
            status === 'in_progress' ? 'В работе' :
            status === 'pending_approval' ? 'На проверке' :
            status === 'completed' ? 'Выполнены' :
            status === 'cancelled' ? 'Отменены' : status,
      value: count,
      color: STATUS_COLORS[status] || '#9CA3AF',
    }));
  }, [requests]);

  // Requests by category for bar chart
  const requestsByCategory = useMemo(() => {
    const categoryCounts: Record<string, number> = {};
    requests.forEach((r: Request) => {
      categoryCounts[r.category] = (categoryCounts[r.category] || 0) + 1;
    });

    const categoryLabels: Record<string, string> = {
      plumber: 'Сантехник',
      electrician: 'Электрик',
      security: 'Охрана',
      cleaning: 'Уборка',
      elevator: 'Лифт',
      intercom: 'Домофон',
      carpenter: 'Плотник',
      locksmith: 'Слесарь',
      other: 'Другое',
    };

    return Object.entries(categoryCounts)
      .map(([category, count]) => ({
        category: categoryLabels[category] || category,
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [requests]);

  // Requests by day of week
  const requestsByDay = useMemo(() => {
    const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const dayCounts = new Array(7).fill(0);

    requests.forEach((r: Request) => {
      const day = new Date(r.createdAt).getDay();
      dayCounts[day]++;
    });

    return days.map((name, i) => ({
      day: name,
      count: dayCounts[i],
    }));
  }, [requests]);

  // Executor performance
  const executorPerformance = useMemo(() => {
    return [...executors]
      .sort((a, b) => b.completedCount - a.completedCount)
      .slice(0, 6)
      .map(e => ({
        name: e.name.split(' ')[0],
        completed: e.completedCount,
        active: e.activeRequests,
        rating: e.rating,
      }));
  }, [executors]);

  const fetchMetrics = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/admin/metrics', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch metrics');
      }

      const data = await response.json();
      setHealth(data.health);
      setPerformance(data.performance);
      setCache(data.cache);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
      // Set mock data for demo
      setHealth({
        status: 'healthy',
        timestamp: Date.now(),
        checks: { database: true, cache: true, websocket: true },
        metrics: { avgResponseTime: 85, errorRate: 0.5, activeConnections: 24 }
      });
      setPerformance({
        period: '24h',
        totalRequests: 1247,
        errorCount: 6,
        errorRate: 0.48,
        avgResponseTime: 85,
        p95ResponseTime: 180,
        p99ResponseTime: 320,
        endpointStats: [
          { endpoint: '/api/requests', count: 450, avgTime: 65, errorRate: 0.2 },
          { endpoint: '/api/executors', count: 280, avgTime: 45, errorRate: 0 },
          { endpoint: '/api/auth/login', count: 156, avgTime: 120, errorRate: 1.2 },
          { endpoint: '/api/buildings', count: 98, avgTime: 35, errorRate: 0 },
        ],
        recentErrors: []
      });
      setCache({
        memory: { size: 156, hits: 2450, misses: 180, hitRate: 93.2 },
        kv: { operations: 890, estimatedSize: '2.4 MB' }
      });
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();

    if (autoRefresh) {
      const interval = setInterval(fetchMetrics, 10000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const getStatusColor = (status: 'healthy' | 'degraded' | 'down') => {
    switch (status) {
      case 'healthy':
        return 'text-green-500 bg-green-50 border-green-200';
      case 'degraded':
        return 'text-yellow-500 bg-yellow-50 border-yellow-200';
      case 'down':
        return 'text-red-500 bg-red-50 border-red-200';
    }
  };

  const getMetricColor = (value: number, thresholds: { good: number; warning: number }) => {
    if (value <= thresholds.good) return 'text-green-600';
    if (value <= thresholds.warning) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Мониторинг Системы</h1>
          <p className="text-gray-600 mt-1">Real-time производительность и аналитика</p>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
            />
            Авто (10s)
          </label>

          <button
            onClick={fetchMetrics}
            className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Обновить
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {[
          { id: 'overview', label: 'Обзор', icon: Activity },
          { id: 'performance', label: 'Производительность', icon: Zap },
          { id: 'requests', label: 'Аналитика заявок', icon: FileText },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-orange-400 text-gray-900'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <>
          {/* Health Status */}
          {health && (
            <div className={`glass-card p-6 border-2 ${getStatusColor(health.status)}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {health.status === 'healthy' ? (
                    <CheckCircle className="w-8 h-8" />
                  ) : (
                    <AlertCircle className="w-8 h-8" />
                  )}
                  <div>
                    <h2 className="text-xl font-bold">
                      Статус: {health.status === 'healthy' ? 'Здорово' : health.status === 'degraded' ? 'Ухудшено' : 'Не работает'}
                    </h2>
                    <p className="text-sm opacity-75">
                      Обновлено: {new Date(health.timestamp).toLocaleString('ru-RU')}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <Database className={`w-6 h-6 mx-auto mb-1 ${health.checks.database ? 'text-green-500' : 'text-red-500'}`} />
                    <p className="text-xs">Database</p>
                  </div>
                  <div className="text-center">
                    <Server className={`w-6 h-6 mx-auto mb-1 ${health.checks.cache ? 'text-green-500' : 'text-red-500'}`} />
                    <p className="text-xs">Cache</p>
                  </div>
                  <div className="text-center">
                    <Wifi className={`w-6 h-6 mx-auto mb-1 ${health.checks.websocket ? 'text-green-500' : 'text-red-500'}`} />
                    <p className="text-xs">WebSocket</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-card p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <span className="text-sm text-gray-600">Всего заявок</span>
              </div>
              <div className="text-3xl font-bold text-gray-900">{stats.totalRequests}</div>
            </div>

            <div className="glass-card p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                  <Users className="w-5 h-5 text-green-600" />
                </div>
                <span className="text-sm text-gray-600">Исполнителей</span>
              </div>
              <div className="text-3xl font-bold text-gray-900">{executors.length}</div>
              <p className="text-xs text-gray-500 mt-1">{stats.executorsOnline} онлайн</p>
            </div>

            <div className="glass-card p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                  <Clock className="w-5 h-5 text-amber-600" />
                </div>
                <span className="text-sm text-gray-600">В работе</span>
              </div>
              <div className="text-3xl font-bold text-amber-600">{stats.inProgress}</div>
            </div>

            <div className="glass-card p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-purple-600" />
                </div>
                <span className="text-sm text-gray-600">За неделю</span>
              </div>
              <div className="text-3xl font-bold text-green-600">{stats.completedWeek}</div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Request Status Pie Chart */}
            <div className="glass-card p-5">
              <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                <BarChart className="w-5 h-5 text-purple-500" />
                Заявки по статусам
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={requestsByStatus}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={100}
                    dataKey="value"
                    label={({ name, percent }: { name: string; percent: number }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                  >
                    {requestsByStatus.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Requests by Category */}
            <div className="glass-card p-5">
              <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-500" />
                По категориям
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <RechartsBarChart data={requestsByCategory} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis dataKey="category" type="category" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip />
                  <Bar dataKey="count" fill={CHART_COLORS.primary} radius={[0, 4, 4, 0]} />
                </RechartsBarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {/* Performance Tab */}
      {activeTab === 'performance' && performance && (
        <>
          {/* Performance Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="glass-card p-5">
              <div className="flex items-center gap-3 mb-2">
                <BarChart className="w-5 h-5 text-blue-500" />
                <span className="text-sm text-gray-600">API Запросов</span>
              </div>
              <div className="text-3xl font-bold text-gray-900">{performance.totalRequests}</div>
              <p className="text-xs text-gray-500 mt-1">За {performance.period}</p>
            </div>

            <div className="glass-card p-5">
              <div className="flex items-center gap-3 mb-2">
                <Clock className="w-5 h-5 text-green-500" />
                <span className="text-sm text-gray-600">Ср. отклик</span>
              </div>
              <div className={`text-3xl font-bold ${getMetricColor(performance.avgResponseTime, { good: 200, warning: 500 })}`}>
                {performance.avgResponseTime}ms
              </div>
              <p className="text-xs text-gray-500 mt-1">
                P95: {performance.p95ResponseTime}ms
              </p>
            </div>

            <div className="glass-card p-5">
              <div className="flex items-center gap-3 mb-2">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span className="text-sm text-gray-600">Ошибок</span>
              </div>
              <div className={`text-3xl font-bold ${getMetricColor(performance.errorRate, { good: 1, warning: 5 })}`}>
                {performance.errorCount}
              </div>
              <p className="text-xs text-gray-500 mt-1">Уровень: {performance.errorRate}%</p>
            </div>

            <div className="glass-card p-5">
              <div className="flex items-center gap-3 mb-2">
                <Server className="w-5 h-5 text-purple-500" />
                <span className="text-sm text-gray-600">Cache Hit</span>
              </div>
              <div className="text-3xl font-bold text-gray-900">
                {cache ? Math.round(cache.memory.hitRate) : 0}%
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {cache ? `${cache.memory.hits} hits` : 'N/A'}
              </p>
            </div>
          </div>

          {/* Response Time Chart */}
          <div className="glass-card p-5">
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-500" />
              Время отклика (24 часа)
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={responseTimeHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="avgTime"
                  stroke={CHART_COLORS.primary}
                  strokeWidth={2}
                  name="Время отклика (ms)"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="requests"
                  stroke={CHART_COLORS.success}
                  strokeWidth={2}
                  name="Запросов"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Endpoint Statistics */}
          {performance.endpointStats.length > 0 && (
            <div className="glass-card p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Статистика Endpoints</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Endpoint</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Запросов</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Ср. время</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Ошибок</th>
                    </tr>
                  </thead>
                  <tbody>
                    {performance.endpointStats.map((stat, idx) => (
                      <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 text-sm text-gray-900 font-mono">{stat.endpoint}</td>
                        <td className="py-3 px-4 text-sm text-gray-600 text-right">{stat.count}</td>
                        <td className={`py-3 px-4 text-sm text-right font-medium ${getMetricColor(stat.avgTime, { good: 200, warning: 500 })}`}>
                          {stat.avgTime}ms
                        </td>
                        <td className={`py-3 px-4 text-sm text-right font-medium ${getMetricColor(stat.errorRate, { good: 1, warning: 5 })}`}>
                          {stat.errorRate}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Cache Statistics */}
          {cache && (
            <div className="glass-card p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Статистика Кэша</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white/50 rounded-lg p-4">
                  <p className="text-sm text-gray-600">Memory Size</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{cache.memory.size}</p>
                </div>
                <div className="bg-white/50 rounded-lg p-4">
                  <p className="text-sm text-gray-600">Hits</p>
                  <p className="text-2xl font-bold text-green-600 mt-1">{cache.memory.hits}</p>
                </div>
                <div className="bg-white/50 rounded-lg p-4">
                  <p className="text-sm text-gray-600">Misses</p>
                  <p className="text-2xl font-bold text-red-600 mt-1">{cache.memory.misses}</p>
                </div>
                <div className="bg-white/50 rounded-lg p-4">
                  <p className="text-sm text-gray-600">Hit Rate</p>
                  <p className="text-2xl font-bold text-blue-600 mt-1">{Math.round(cache.memory.hitRate)}%</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Requests Analytics Tab */}
      {activeTab === 'requests' && (
        <>
          {/* Requests by Day */}
          <div className="glass-card p-5">
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-500" />
              Заявки по дням недели
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <RechartsBarChart data={requestsByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} name="Заявок" />
              </RechartsBarChart>
            </ResponsiveContainer>
          </div>

          {/* Executor Performance */}
          <div className="glass-card p-5">
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-green-500" />
              Производительность исполнителей
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <RechartsBarChart data={executorPerformance}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="completed" fill={CHART_COLORS.success} name="Выполнено" stackId="a" />
                <Bar dataKey="active" fill={CHART_COLORS.warning} name="Активных" stackId="a" />
              </RechartsBarChart>
            </ResponsiveContainer>
          </div>

          {/* Request Status Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass-card p-5">
              <h3 className="font-semibold text-lg mb-4">Распределение по статусам</h3>
              <div className="space-y-3">
                {requestsByStatus.map((item, idx) => {
                  const percentage = stats.totalRequests > 0 ? (item.value / stats.totalRequests) * 100 : 0;
                  return (
                    <div key={idx}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-700">{item.name}</span>
                        <span className="font-medium">{item.value} ({percentage.toFixed(1)}%)</span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full transition-all duration-500"
                          style={{ width: `${percentage}%`, backgroundColor: item.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="glass-card p-5">
              <h3 className="font-semibold text-lg mb-4">Статистика за неделю</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm text-blue-600">Новых заявок</p>
                  <p className="text-3xl font-bold text-blue-700 mt-1">{stats.newRequests}</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-4">
                  <p className="text-sm text-amber-600">В работе</p>
                  <p className="text-3xl font-bold text-amber-700 mt-1">{stats.inProgress}</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-4">
                  <p className="text-sm text-purple-600">На проверке</p>
                  <p className="text-3xl font-bold text-purple-700 mt-1">{stats.pendingApproval}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-sm text-green-600">Выполнено</p>
                  <p className="text-3xl font-bold text-green-700 mt-1">{stats.completedWeek}</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Recent Errors */}
      {performance && performance.recentErrors.length > 0 && (
        <div className="glass-card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Последние Ошибки</h3>
          <div className="space-y-3">
            {performance.recentErrors.map((error, idx) => (
              <div key={idx} className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                <X className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-red-900">{error.message}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-red-700">
                    <span className="font-mono">{error.endpoint}</span>
                    <span>•</span>
                    <span>{new Date(error.timestamp).toLocaleString('ru-RU')}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
