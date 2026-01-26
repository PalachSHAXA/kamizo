import { useState, useEffect } from 'react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area
} from '../components/LazyCharts';
import {
  Users, FileText, Clock, CheckCircle, AlertTriangle,
  RefreshCw, UserCheck, ShoppingBag, Download, Calendar,
  Package, DollarSign, Star, TrendingUp, Briefcase, Activity
} from 'lucide-react';
import { useDataStore } from '../stores/dataStore';
import { SPECIALIZATION_LABELS } from '../types';
import { apiRequest } from '../services/api';
import ExcelJS from 'exceljs';

interface MarketplaceReport {
  period: { start_date: string; end_date: string };
  overall: {
    total_orders: number;
    delivered_orders: number;
    cancelled_orders: number;
    total_revenue: number;
    total_delivery_fees: number;
    avg_rating: number;
    rated_orders: number;
  };
  top_products: Array<{
    product_id: string;
    product_name: string;
    image_url: string;
    total_sold: number;
    total_revenue: number;
    order_count: number;
  }>;
  categories: Array<{
    category_name: string;
    total_sold: number;
    total_revenue: number;
    order_count: number;
  }>;
  daily_sales: Array<{
    date: string;
    orders: number;
    revenue: number;
  }>;
  orders_by_status: Array<{
    status: string;
    count: number;
  }>;
  top_customers: Array<{
    user_id: string;
    user_name: string;
    user_phone: string;
    order_count: number;
    total_spent: number;
  }>;
  executor_stats: Array<{
    executor_id: string;
    executor_name: string;
    delivered_count: number;
    avg_rating: number;
  }>;
}

type TabType = 'overview' | 'marketplace';

export function AdminDashboard() {
  const { requests, executors, getStats } = useDataStore();

  const stats = getStats();

  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [marketplaceReport, setMarketplaceReport] = useState<MarketplaceReport | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [reportStartDate, setReportStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [reportEndDate, setReportEndDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Get pending approval requests that need attention
  const pendingApprovalRequests = requests.filter(r => r.status === 'pending_approval');

  // Get requests where resident hasn't approved for more than 24 hours
  const staleApprovals = pendingApprovalRequests.filter(r => {
    if (!r.completedAt) return false;
    const completedTime = new Date(r.completedAt).getTime();
    const hoursSinceCompletion = (Date.now() - completedTime) / (1000 * 60 * 60);
    return hoursSinceCompletion > 24;
  });

  // Load marketplace report when tab changes or dates change
  useEffect(() => {
    if (activeTab === 'marketplace') {
      loadMarketplaceReport();
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

  const exportMarketplaceReport = async () => {
    if (!marketplaceReport) return;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Kamizo';
    workbook.created = new Date();

    const formatCurrency = (value: number) => `${value.toLocaleString('ru-RU')} сум`;

    // Common styles
    const headerStyle: Partial<ExcelJS.Style> = {
      font: { bold: true, size: 11 },
      alignment: { horizontal: 'center', vertical: 'middle' },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } },
      border: {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      },
    };
    const cellStyle: Partial<ExcelJS.Style> = {
      alignment: { horizontal: 'left', vertical: 'middle' },
      border: {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      },
    };
    const centerStyle: Partial<ExcelJS.Style> = {
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      },
    };
    const currencyStyle: Partial<ExcelJS.Style> = {
      alignment: { horizontal: 'right', vertical: 'middle' },
      border: {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      },
    };

    // ============ Sheet 1: Summary ============
    const ws1 = workbook.addWorksheet('Сводный отчёт');
    ws1.columns = [
      { width: 25 }, { width: 35 }, { width: 18 }, { width: 22 }, { width: 15 }
    ];

    // Title - merged and centered
    const titleRow = ws1.addRow(['ОТЧЁТ ПО МАРКЕТПЛЕЙСУ']);
    ws1.mergeCells(`A${titleRow.number}:E${titleRow.number}`);
    titleRow.getCell(1).style = { font: { bold: true, size: 16 }, alignment: { horizontal: 'center' } };
    ws1.addRow([]);
    ws1.addRow(['Период:', `${marketplaceReport.period.start_date} — ${marketplaceReport.period.end_date}`]);
    ws1.addRow(['Дата формирования:', new Date().toLocaleDateString('ru-RU')]);
    ws1.addRow([]);

    // Overall Stats Section
    const statsTitle = ws1.addRow(['ОБЩАЯ СТАТИСТИКА']);
    ws1.mergeCells(`A${statsTitle.number}:E${statsTitle.number}`);
    statsTitle.getCell(1).style = { font: { bold: true, size: 12 }, alignment: { horizontal: 'center' } };
    ws1.addRow([]);
    const statsHeader = ws1.addRow(['Показатель', 'Значение']);
    statsHeader.eachCell((cell) => { cell.style = headerStyle; });

    const statsData = [
      ['Всего заказов', marketplaceReport.overall.total_orders],
      ['Доставлено заказов', marketplaceReport.overall.delivered_orders],
      ['Отменено заказов', marketplaceReport.overall.cancelled_orders],
      ['Общая выручка', formatCurrency(marketplaceReport.overall.total_revenue)],
      ['Доход от доставки', formatCurrency(marketplaceReport.overall.total_delivery_fees)],
      ['Средний рейтинг', `${marketplaceReport.overall.avg_rating.toFixed(1)} ⭐`],
      ['Количество оценок', marketplaceReport.overall.rated_orders],
    ];
    statsData.forEach(row => {
      const r = ws1.addRow(row);
      r.getCell(1).style = cellStyle;
      r.getCell(2).style = centerStyle;
    });

    ws1.addRow([]);
    ws1.addRow([]);

    // Top Products Section
    const prodTitle = ws1.addRow(['ТОП-10 ТОВАРОВ ПО ПРОДАЖАМ']);
    ws1.mergeCells(`A${prodTitle.number}:E${prodTitle.number}`);
    prodTitle.getCell(1).style = { font: { bold: true, size: 12 }, alignment: { horizontal: 'center' } };
    ws1.addRow([]);
    const prodHeader = ws1.addRow(['№', 'Название товара', 'Продано (шт)', 'Выручка', 'Заказов']);
    prodHeader.eachCell((cell) => { cell.style = headerStyle; });

    marketplaceReport.top_products.forEach((p, i) => {
      const r = ws1.addRow([i + 1, p.product_name, p.total_sold, formatCurrency(p.total_revenue), p.order_count]);
      r.getCell(1).style = centerStyle;
      r.getCell(2).style = cellStyle;
      r.getCell(3).style = centerStyle;
      r.getCell(4).style = currencyStyle;
      r.getCell(5).style = centerStyle;
    });

    ws1.addRow([]);
    ws1.addRow([]);

    // Categories Section
    const catTitle = ws1.addRow(['ПРОДАЖИ ПО КАТЕГОРИЯМ']);
    ws1.mergeCells(`A${catTitle.number}:E${catTitle.number}`);
    catTitle.getCell(1).style = { font: { bold: true, size: 12 }, alignment: { horizontal: 'center' } };
    ws1.addRow([]);
    const catHeader = ws1.addRow(['№', 'Категория', 'Продано (шт)', 'Выручка', 'Заказов']);
    catHeader.eachCell((cell) => { cell.style = headerStyle; });

    marketplaceReport.categories.forEach((c, i) => {
      const r = ws1.addRow([i + 1, c.category_name, c.total_sold, formatCurrency(c.total_revenue), c.order_count]);
      r.getCell(1).style = centerStyle;
      r.getCell(2).style = cellStyle;
      r.getCell(3).style = centerStyle;
      r.getCell(4).style = currencyStyle;
      r.getCell(5).style = centerStyle;
    });

    ws1.addRow([]);
    ws1.addRow([]);

    // Couriers Stats Section on Summary sheet
    const courSummaryTitle = ws1.addRow(['СТАТИСТИКА КУРЬЕРОВ']);
    ws1.mergeCells(`A${courSummaryTitle.number}:E${courSummaryTitle.number}`);
    courSummaryTitle.getCell(1).style = { font: { bold: true, size: 12 }, alignment: { horizontal: 'center' } };
    ws1.addRow([]);
    const courSummaryHeader = ws1.addRow(['№', 'Имя курьера', 'Доставлено заказов', 'Средний рейтинг']);
    courSummaryHeader.eachCell((cell) => { cell.style = headerStyle; });

    marketplaceReport.executor_stats.forEach((e, i) => {
      const r = ws1.addRow([i + 1, e.executor_name, e.delivered_count, `${e.avg_rating.toFixed(1)} ⭐`]);
      r.getCell(1).style = centerStyle;
      r.getCell(2).style = cellStyle;
      r.getCell(3).style = centerStyle;
      r.getCell(4).style = centerStyle;
    });

    ws1.addRow([]);
    ws1.addRow([]);

    // Top Customers Section on Summary sheet
    const custSummaryTitle = ws1.addRow(['ТОП-10 ПОКУПАТЕЛЕЙ']);
    ws1.mergeCells(`A${custSummaryTitle.number}:E${custSummaryTitle.number}`);
    custSummaryTitle.getCell(1).style = { font: { bold: true, size: 12 }, alignment: { horizontal: 'center' } };
    ws1.addRow([]);
    const custSummaryHeader = ws1.addRow(['№', 'Имя клиента', 'Телефон', 'Заказов', 'Сумма покупок']);
    custSummaryHeader.eachCell((cell) => { cell.style = headerStyle; });

    marketplaceReport.top_customers.forEach((c, i) => {
      const r = ws1.addRow([i + 1, c.user_name, c.user_phone, c.order_count, formatCurrency(c.total_spent)]);
      r.getCell(1).style = centerStyle;
      r.getCell(2).style = cellStyle;
      r.getCell(3).style = cellStyle;
      r.getCell(4).style = centerStyle;
      r.getCell(5).style = currencyStyle;
    });

    // ============ Sheet 2: Daily Sales ============
    const ws2 = workbook.addWorksheet('По дням');
    ws2.columns = [{ width: 18 }, { width: 22 }, { width: 25 }];

    const dailyTitle = ws2.addRow(['ПРОДАЖИ ПО ДНЯМ']);
    ws2.mergeCells(`A${dailyTitle.number}:C${dailyTitle.number}`);
    dailyTitle.getCell(1).style = { font: { bold: true, size: 14 }, alignment: { horizontal: 'center' } };
    ws2.addRow([]);
    const dailyHeader = ws2.addRow(['Дата', 'Количество заказов', 'Выручка']);
    dailyHeader.eachCell((cell) => { cell.style = headerStyle; });

    marketplaceReport.daily_sales.forEach(d => {
      const r = ws2.addRow([d.date, d.orders, formatCurrency(d.revenue)]);
      r.getCell(1).style = centerStyle;
      r.getCell(2).style = centerStyle;
      r.getCell(3).style = currencyStyle;
    });

    ws2.addRow([]);
    const totalRow = ws2.addRow([
      'ИТОГО:',
      marketplaceReport.daily_sales.reduce((sum, d) => sum + d.orders, 0),
      formatCurrency(marketplaceReport.daily_sales.reduce((sum, d) => sum + d.revenue, 0))
    ]);
    totalRow.getCell(1).style = { ...cellStyle, font: { bold: true } };
    totalRow.getCell(2).style = { ...centerStyle, font: { bold: true } };
    totalRow.getCell(3).style = { ...currencyStyle, font: { bold: true } };

    // ============ Sheet 3: Products ============
    const ws3 = workbook.addWorksheet('Товары');
    ws3.columns = [{ width: 6 }, { width: 45 }, { width: 16 }, { width: 22 }, { width: 12 }];

    const prodListTitle = ws3.addRow(['ДЕТАЛЬНЫЙ ОТЧЁТ ПО ТОВАРАМ']);
    ws3.mergeCells(`A${prodListTitle.number}:E${prodListTitle.number}`);
    prodListTitle.getCell(1).style = { font: { bold: true, size: 14 }, alignment: { horizontal: 'center' } };
    ws3.addRow([]);
    const prodListHeader = ws3.addRow(['№', 'Название товара', 'Продано (шт)', 'Выручка', 'Заказов']);
    prodListHeader.eachCell((cell) => { cell.style = headerStyle; });

    marketplaceReport.top_products.forEach((p, i) => {
      const r = ws3.addRow([i + 1, p.product_name, p.total_sold, formatCurrency(p.total_revenue), p.order_count]);
      r.getCell(1).style = centerStyle;
      r.getCell(2).style = cellStyle;
      r.getCell(3).style = centerStyle;
      r.getCell(4).style = currencyStyle;
      r.getCell(5).style = centerStyle;
    });

    // ============ Sheet 4: Customers ============
    const ws4 = workbook.addWorksheet('Покупатели');
    ws4.columns = [{ width: 6 }, { width: 30 }, { width: 18 }, { width: 20 }, { width: 25 }];

    const custTitle = ws4.addRow(['ДЕТАЛЬНЫЙ ОТЧЁТ ПО ПОКУПАТЕЛЯМ']);
    ws4.mergeCells(`A${custTitle.number}:E${custTitle.number}`);
    custTitle.getCell(1).style = { font: { bold: true, size: 14 }, alignment: { horizontal: 'center' } };
    ws4.addRow([]);
    const custHeader = ws4.addRow(['№', 'Имя клиента', 'Телефон', 'Количество заказов', 'Сумма покупок']);
    custHeader.eachCell((cell) => { cell.style = headerStyle; });

    marketplaceReport.top_customers.forEach((c, i) => {
      const r = ws4.addRow([i + 1, c.user_name, c.user_phone, c.order_count, formatCurrency(c.total_spent)]);
      r.getCell(1).style = centerStyle;
      r.getCell(2).style = cellStyle;
      r.getCell(3).style = centerStyle;
      r.getCell(4).style = centerStyle;
      r.getCell(5).style = currencyStyle;
    });

    // ============ Sheet 5: Couriers ============
    const ws5 = workbook.addWorksheet('Курьеры');
    ws5.columns = [{ width: 6 }, { width: 30 }, { width: 22 }, { width: 18 }];

    const courTitle = ws5.addRow(['ОТЧЁТ ПО КУРЬЕРАМ']);
    ws5.mergeCells(`A${courTitle.number}:D${courTitle.number}`);
    courTitle.getCell(1).style = { font: { bold: true, size: 14 }, alignment: { horizontal: 'center' } };
    ws5.addRow([]);
    const courHeader = ws5.addRow(['№', 'Имя курьера', 'Доставлено заказов', 'Средний рейтинг']);
    courHeader.eachCell((cell) => { cell.style = headerStyle; });

    marketplaceReport.executor_stats.forEach((e, i) => {
      const r = ws5.addRow([i + 1, e.executor_name, e.delivered_count, `${e.avg_rating.toFixed(1)} ⭐`]);
      r.getCell(1).style = centerStyle;
      r.getCell(2).style = cellStyle;
      r.getCell(3).style = centerStyle;
      r.getCell(4).style = centerStyle;
    });

    // Generate and download file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Отчёт_маркетплейс_${reportStartDate}_${reportEndDate}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

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

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'overview'
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Activity className="w-4 h-4 inline mr-2" />
          Обзор
        </button>
        <button
          onClick={() => setActiveTab('marketplace')}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'marketplace'
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <ShoppingBag className="w-4 h-4 inline mr-2" />
          Маркетплейс
        </button>
      </div>

      {activeTab === 'overview' && (
        <>
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
        </>
      )}

      {/* Marketplace Tab */}
      {activeTab === 'marketplace' && (
        <div className="space-y-6">
          {/* Period selector and download button */}
          <div className="glass-card p-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Calendar className="w-5 h-5 text-gray-500" />
                <span className="text-sm text-gray-600">Период:</span>
                <input
                  type="date"
                  value={reportStartDate}
                  onChange={(e) => setReportStartDate(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                />
                <span className="text-gray-400">—</span>
                <input
                  type="date"
                  value={reportEndDate}
                  onChange={(e) => setReportEndDate(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <button
                onClick={exportMarketplaceReport}
                disabled={!marketplaceReport || isLoadingReport}
                className="btn-primary flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Скачать Excel
              </button>
            </div>
          </div>

          {isLoadingReport ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw className="w-8 h-8 animate-spin text-orange-500" />
              <span className="ml-3 text-gray-600">Загрузка...</span>
            </div>
          ) : marketplaceReport ? (
            <>
              {/* Overall Stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="glass-card p-5">
                  <div className="flex items-center gap-3 mb-2">
                    <ShoppingBag className="w-8 h-8 text-blue-500" />
                  </div>
                  <div className="text-2xl font-bold">{marketplaceReport.overall.total_orders}</div>
                  <div className="text-sm text-gray-500">Всего заказов</div>
                  <div className="mt-2 text-xs">
                    <span className="text-green-600">{marketplaceReport.overall.delivered_orders} доставлено</span>
                    <span className="text-gray-400 mx-1">|</span>
                    <span className="text-red-600">{marketplaceReport.overall.cancelled_orders} отменено</span>
                  </div>
                </div>

                <div className="glass-card p-5">
                  <div className="flex items-center gap-3 mb-2">
                    <DollarSign className="w-8 h-8 text-green-500" />
                  </div>
                  <div className="text-2xl font-bold">{marketplaceReport.overall.total_revenue.toLocaleString()}</div>
                  <div className="text-sm text-gray-500">Выручка (сум)</div>
                  <div className="mt-2 text-xs text-gray-600">
                    Доставка: {marketplaceReport.overall.total_delivery_fees.toLocaleString()} сум
                  </div>
                </div>

                <div className="glass-card p-5">
                  <div className="flex items-center gap-3 mb-2">
                    <Star className="w-8 h-8 text-yellow-500" />
                  </div>
                  <div className="text-2xl font-bold">{marketplaceReport.overall.avg_rating.toFixed(1)}</div>
                  <div className="text-sm text-gray-500">Средний рейтинг</div>
                  <div className="mt-2 text-xs text-gray-600">
                    {marketplaceReport.overall.rated_orders} оценок
                  </div>
                </div>

                <div className="glass-card p-5">
                  <div className="flex items-center gap-3 mb-2">
                    <Package className="w-8 h-8 text-purple-500" />
                  </div>
                  <div className="text-2xl font-bold">
                    {marketplaceReport.top_products.reduce((sum, p) => sum + p.total_sold, 0)}
                  </div>
                  <div className="text-sm text-gray-500">Продано (шт)</div>
                  <div className="mt-2 text-xs text-gray-600">
                    {marketplaceReport.top_products.length} товаров
                  </div>
                </div>
              </div>

              {/* Sales Chart */}
              <div className="glass-card p-5">
                <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-blue-500" />
                  Динамика продаж
                </h3>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={marketplaceReport.daily_sales}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(val: string) => new Date(val).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                    />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        name === 'revenue' ? `${value.toLocaleString()} сум` : value,
                        name === 'revenue' ? 'Выручка' : 'Заказов'
                      ]}
                      labelFormatter={(label: string) => new Date(label).toLocaleDateString('ru-RU')}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#10B981"
                      strokeWidth={2}
                      fill="url(#colorRevenue)"
                      name="Выручка"
                    />
                    <Area
                      type="monotone"
                      dataKey="orders"
                      stroke="#3B82F6"
                      strokeWidth={2}
                      fill="none"
                      name="Заказов"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Two column layout */}
              <div className="grid lg:grid-cols-2 gap-6">
                {/* Top Products */}
                <div className="glass-card p-5">
                  <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                    <Package className="w-5 h-5 text-purple-500" />
                    Топ товаров
                  </h3>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {marketplaceReport.top_products.slice(0, 10).map((product, idx) => (
                      <div key={product.product_id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                        <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center font-bold text-purple-600">
                          {idx + 1}
                        </div>
                        {product.image_url ? (
                          <img src={product.image_url} alt="" className="w-10 h-10 object-cover rounded-lg" />
                        ) : (
                          <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center">
                            <Package className="w-5 h-5 text-gray-400" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{product.product_name}</div>
                          <div className="text-xs text-gray-500">
                            {product.total_sold} шт • {product.order_count} заказов
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-sm text-green-600">
                            {product.total_revenue.toLocaleString()}
                          </div>
                          <div className="text-xs text-gray-400">сум</div>
                        </div>
                      </div>
                    ))}
                    {marketplaceReport.top_products.length === 0 && (
                      <div className="text-center text-gray-400 py-8">Нет данных</div>
                    )}
                  </div>
                </div>

                {/* Categories */}
                <div className="glass-card p-5">
                  <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                    <Briefcase className="w-5 h-5 text-orange-500" />
                    По категориям
                  </h3>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {marketplaceReport.categories.map((cat) => (
                      <div key={cat.category_name} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{cat.category_name}</div>
                          <div className="text-xs text-gray-500">
                            {cat.total_sold} шт • {cat.order_count} заказов
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-sm text-green-600">
                            {cat.total_revenue.toLocaleString()}
                          </div>
                          <div className="text-xs text-gray-400">сум</div>
                        </div>
                      </div>
                    ))}
                    {marketplaceReport.categories.length === 0 && (
                      <div className="text-center text-gray-400 py-8">Нет данных</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Bottom section */}
              <div className="grid lg:grid-cols-2 gap-6">
                {/* Top Customers */}
                <div className="glass-card p-5">
                  <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                    <Users className="w-5 h-5 text-blue-500" />
                    Топ покупателей
                  </h3>
                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {marketplaceReport.top_customers.map((customer, idx) => (
                      <div key={customer.user_id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-600">
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{customer.user_name}</div>
                          <div className="text-xs text-gray-500">{customer.user_phone}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-sm">{customer.order_count} заказов</div>
                          <div className="text-xs text-green-600">{customer.total_spent.toLocaleString()} сум</div>
                        </div>
                      </div>
                    ))}
                    {marketplaceReport.top_customers.length === 0 && (
                      <div className="text-center text-gray-400 py-8">Нет данных</div>
                    )}
                  </div>
                </div>

                {/* Couriers */}
                <div className="glass-card p-5">
                  <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                    <UserCheck className="w-5 h-5 text-green-500" />
                    Курьеры
                  </h3>
                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {marketplaceReport.executor_stats.map((executor) => (
                      <div key={executor.executor_id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                        <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white font-bold">
                          {executor.executor_name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{executor.executor_name}</div>
                          <div className="text-xs text-gray-500">
                            {executor.delivered_count} доставок
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-yellow-600">
                          <Star className="w-4 h-4" />
                          <span className="font-medium">{executor.avg_rating.toFixed(1)}</span>
                        </div>
                      </div>
                    ))}
                    {marketplaceReport.executor_stats.length === 0 && (
                      <div className="text-center text-gray-400 py-8">Нет данных</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Orders by Status pie chart */}
              <div className="glass-card p-5">
                <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-purple-500" />
                  Заказы по статусам
                </h3>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={marketplaceReport.orders_by_status.map(s => ({
                        name: {
                          new: 'Новые',
                          confirmed: 'Подтверждённые',
                          preparing: 'Готовятся',
                          ready: 'Готовы',
                          delivering: 'В доставке',
                          delivered: 'Доставлены',
                          cancelled: 'Отменены',
                        }[s.status] || s.status,
                        value: s.count,
                        color: {
                          new: '#3B82F6',
                          confirmed: '#8B5CF6',
                          preparing: '#F59E0B',
                          ready: '#06B6D4',
                          delivering: '#F97316',
                          delivered: '#10B981',
                          cancelled: '#EF4444',
                        }[s.status] || '#9CA3AF',
                      }))}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={80}
                      dataKey="value"
                      label={({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {marketplaceReport.orders_by_status.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={{
                          new: '#3B82F6',
                          confirmed: '#8B5CF6',
                          preparing: '#F59E0B',
                          ready: '#06B6D4',
                          delivering: '#F97316',
                          delivered: '#10B981',
                          cancelled: '#EF4444',
                        }[entry.status] || '#9CA3AF'} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <div className="text-center text-gray-400 py-20">Нет данных</div>
          )}
        </div>
      )}
    </div>
  );
}
