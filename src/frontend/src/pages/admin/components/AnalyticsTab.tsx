import { useState } from 'react';
import { Building2, Users, Banknote, FileText, TrendingUp, RefreshCw } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area
} from '../../../components/LazyCharts';
import { useLanguageStore } from '../../../stores/languageStore';
import type { AnalyticsData, TimePeriod } from './types';
import {
  PLAN_COLORS, PLAN_LABELS, FEATURE_COLORS,
  getFeatureLabel,
} from './types';

interface AnalyticsTabProps {
  analytics: AnalyticsData | null;
  isLoadingAnalytics: boolean;
}

export function AnalyticsTab({ analytics, isLoadingAnalytics }: AnalyticsTabProps) {
  const { language } = useLanguageStore();
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('monthly');

  if (isLoadingAnalytics) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="text-center py-20 text-gray-400">
        Нет данных для отображения
      </div>
    );
  }

  const formatPeriod = (val: string) => {
    if (timePeriod === 'daily') {
      const parts = val.split('-');
      return parts.length === 3 ? `${parts[2]}.${parts[1]}` : val;
    }
    if (timePeriod === 'weekly') {
      const m = val.match(/W(\d+)/);
      return m ? `Нед ${parseInt(m[1])}` : val;
    }
    const parts = val.split('-');
    return parts.length === 2 ? `${parts[1]}.${parts[0]}` : val;
  };

  const growthData = analytics.growth[timePeriod] || [];
  const periodLabel = timePeriod === 'daily' ? 'дням' : timePeriod === 'weekly' ? 'неделям' : 'месяцам';
  const periodTitle = timePeriod === 'daily' ? 'за 30 дней' : timePeriod === 'weekly' ? 'за 12 недель' : 'за 12 месяцев';

  return (
    <div className="space-y-6">
      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-white p-5 rounded-lg shadow-sm border">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-orange-100 rounded-lg">
              <Building2 className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <div className="text-xs text-gray-500">Тенанты</div>
              <div className="text-xl font-bold">{analytics.totals.tenants}</div>
            </div>
          </div>
        </div>
        <div className="bg-white p-5 rounded-lg shadow-sm border">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary-100 rounded-lg">
              <Users className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <div className="text-xs text-gray-500">Пользователи</div>
              <div className="text-xl font-bold">{analytics.totals.users.toLocaleString()}</div>
            </div>
          </div>
        </div>
        <div className="bg-white p-5 rounded-lg shadow-sm border">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-100 rounded-lg">
              <FileText className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <div className="text-xs text-gray-500">Заявки</div>
              <div className="text-xl font-bold">{analytics.totals.requests.toLocaleString()}</div>
            </div>
          </div>
        </div>
        <div className="bg-white p-5 rounded-lg shadow-sm border">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-green-100 rounded-lg">
              <Building2 className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <div className="text-xs text-gray-500">Комплексы</div>
              <div className="text-xl font-bold">{analytics.totals.buildings.toLocaleString()}</div>
            </div>
          </div>
        </div>
        <div className="bg-white p-5 rounded-lg shadow-sm border">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-100 rounded-lg">
              <Banknote className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <div className="text-xs text-gray-500">Выручка</div>
              <div className="text-xl font-bold">{Number(analytics.totals.revenue).toLocaleString('ru-RU')} сум</div>
            </div>
          </div>
        </div>
      </div>

      {/* Period Toggle */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500 mr-1">Период:</span>
        {([['daily', 'Дни'], ['weekly', 'Недели'], ['monthly', 'Месяцы']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTimePeriod(key)}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
              timePeriod === key
                ? 'bg-orange-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Bar Charts Row */}
      <div className="grid lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="bg-white p-5 rounded-lg shadow-sm border">
          <h3 className="font-semibold text-sm mb-4 flex items-center gap-2 text-gray-700">
            <Users className="w-4 h-4 text-primary-500" />
            Пользователи по {periodLabel}
          </h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={growthData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="period" tick={{ fontSize: 12 }} tickFormatter={formatPeriod} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip labelFormatter={formatPeriod} />
              <Bar dataKey="users" fill="#f97316" name="Пользователи" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-5 rounded-lg shadow-sm border">
          <h3 className="font-semibold text-sm mb-4 flex items-center gap-2 text-gray-700">
            <FileText className="w-4 h-4 text-amber-500" />
            Заявки по {periodLabel}
          </h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={growthData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="period" tick={{ fontSize: 12 }} tickFormatter={formatPeriod} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip labelFormatter={formatPeriod} />
              <Bar dataKey="requests" fill="#F59E0B" name="Заявки" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-5 rounded-lg shadow-sm border">
          <h3 className="font-semibold text-sm mb-4 flex items-center gap-2 text-gray-700">
            <Banknote className="w-4 h-4 text-green-500" />
            Выручка по {periodLabel}
          </h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={growthData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="period" tick={{ fontSize: 12 }} tickFormatter={formatPeriod} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip labelFormatter={formatPeriod} formatter={(value: number) => Number(value).toLocaleString('ru-RU') + ' сум'} />
              <Bar dataKey="revenue" fill="#10B981" name="Выручка" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Pie Charts Row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Plan Distribution */}
        <div className="bg-white p-4 sm:p-5 rounded-lg shadow-sm border">
          <h3 className="font-semibold text-sm mb-4 text-gray-700">Распределение по тарифам</h3>
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-4 sm:gap-6">
            <div className="flex-1">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={analytics.planDistribution.map(p => ({ ...p, label: PLAN_LABELS[p.plan] || p.plan }))}
                    cx="50%" cy="50%"
                    outerRadius={80}
                    innerRadius={40}
                    dataKey="count"
                    nameKey="label"
                    label={false}
                  >
                    {analytics.planDistribution.map((entry, index) => (
                      <Cell key={`plan-${index}`} fill={PLAN_COLORS[entry.plan] || '#9CA3AF'} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number, name: string) => [`${value} УК`, name]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-3 shrink-0">
              {analytics.planDistribution.map((entry) => (
                <div key={entry.plan} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PLAN_COLORS[entry.plan] || '#9CA3AF' }} />
                  <span className="text-sm text-gray-600">{PLAN_LABELS[entry.plan] || entry.plan}</span>
                  <span className="text-sm font-bold ml-1">{entry.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Feature Usage - Pie Chart */}
        <div className="bg-white p-4 sm:p-5 rounded-lg shadow-sm border">
          <h3 className="font-semibold text-sm mb-4 text-gray-700">Использование функций</h3>
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-4 sm:gap-6">
            <div className="flex-1">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={analytics.featureUsage.map(f => ({ ...f, label: getFeatureLabel(f.feature, language) }))}
                    cx="50%" cy="50%"
                    outerRadius={80}
                    innerRadius={40}
                    dataKey="count"
                    nameKey="label"
                    label={false}
                  >
                    {analytics.featureUsage.map((_, index) => (
                      <Cell key={`feat-${index}`} fill={FEATURE_COLORS[index % FEATURE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number, name: string) => [`${value} УК`, name]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 shrink-0">
              {analytics.featureUsage
                .sort((a, b) => b.count - a.count)
                .map((item, index) => (
                  <div key={item.feature} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: FEATURE_COLORS[index % FEATURE_COLORS.length] }} />
                    <span className="text-sm text-gray-600">{getFeatureLabel(item.feature, language)}</span>
                    <span className="text-sm font-bold ml-1">{item.count}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>

      {/* Area Chart: Growth */}
      <div className="bg-white p-5 rounded-lg shadow-sm border">
        <h3 className="font-semibold text-sm mb-4 flex items-center gap-2 text-gray-700">
          <TrendingUp className="w-4 h-4 text-green-500" />
          Динамика роста {periodTitle}
        </h3>
        {growthData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={growthData}>
              <defs>
                <linearGradient id="gradUsers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradRequests" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="period" tick={{ fontSize: 12 }} tickFormatter={formatPeriod} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip labelFormatter={formatPeriod} />
              <Legend />
              <Area type="monotone" dataKey="users" stroke="#f97316" strokeWidth={2} fill="url(#gradUsers)" name="Новые пользователи" />
              <Area type="monotone" dataKey="requests" stroke="#F59E0B" strokeWidth={2} fill="url(#gradRequests)" name="Новые заявки" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center py-12 text-gray-400">
            Нет данных за выбранный период
          </div>
        )}
      </div>
    </div>
  );
}
