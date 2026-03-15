import { useState, useEffect } from 'react';
import { InstallAppSection } from '../components/InstallAppSection';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area
} from '../components/LazyCharts';
import {
  Users, FileText, Clock, CheckCircle, AlertTriangle,
  RefreshCw, UserCheck, ShoppingBag, Download, Calendar,
  Package, DollarSign, Star, TrendingUp, Briefcase, Activity,
  Megaphone, Building2, Eye, ToggleLeft, ToggleRight
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { SPECIALIZATION_LABELS } from '../types';
import { apiRequest } from '../services/api';
import { useLanguageStore } from '../stores/languageStore';
// ExcelJS loaded dynamically in exportMarketplaceReport to reduce initial bundle
import type { Style } from 'exceljs';

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

type TabType = 'overview' | 'marketplace' | 'platform_ads';

export function AdminDashboard() {
  const { user } = useAuthStore();
  const { requests, executors, getStats } = useDataStore();
  const { language } = useLanguageStore();

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

  // Platform ads state
  const [platformAds, setPlatformAds] = useState<any[]>([]);
  const [isLoadingPlatformAds, setIsLoadingPlatformAds] = useState(false);
  const [togglingAdId, setTogglingAdId] = useState<string | null>(null);

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
    if (activeTab === 'platform_ads' && platformAds.length === 0) {
      loadPlatformAds();
    }
  }, [activeTab, reportStartDate, reportEndDate]);

  const loadPlatformAds = async () => {
    setIsLoadingPlatformAds(true);
    try {
      const res = await apiRequest<{ ads: any[] }>('/api/ads/assigned');
      setPlatformAds(res.ads || []);
    } catch {
      setPlatformAds([]);
    } finally {
      setIsLoadingPlatformAds(false);
    }
  };

  const handleTogglePlatformAd = async (adId: string, tenantId: string, currentEnabled: number) => {
    setTogglingAdId(adId);
    try {
      await apiRequest(`/api/super-admin/ads/${adId}/tenants/${tenantId}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: currentEnabled === 0 }),
      });
      setPlatformAds(prev => prev.map(a => a.id === adId ? { ...a, tenant_enabled: currentEnabled === 0 ? 1 : 0 } : a));
    } catch (err: any) {
      alert(err.message || 'Ошибка');
    } finally {
      setTogglingAdId(null);
    }
  };

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

    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Kamizo';
    workbook.created = new Date();

    const formatCurrency = (value: number) => `${value.toLocaleString('ru-RU')} ${language === 'ru' ? 'сум' : 'so\'m'}`;

    // Common styles
    const headerStyle: Partial<Style> = {
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
    const cellStyle: Partial<Style> = {
      alignment: { horizontal: 'left', vertical: 'middle' },
      border: {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      },
    };
    const centerStyle: Partial<Style> = {
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      },
    };
    const currencyStyle: Partial<Style> = {
      alignment: { horizontal: 'right', vertical: 'middle' },
      border: {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      },
    };

    // ============ Sheet 1: Summary ============
    const ws1 = workbook.addWorksheet(language === 'ru' ? 'Сводный отчёт' : 'Umumiy hisobot');
    ws1.columns = [
      { width: 25 }, { width: 35 }, { width: 18 }, { width: 22 }, { width: 15 }
    ];

    // Title - merged and centered
    const titleRow = ws1.addRow([language === 'ru' ? 'ОТЧЁТ ПО МАРКЕТПЛЕЙСУ' : 'MARKETPLACE HISOBOTI']);
    ws1.mergeCells(`A${titleRow.number}:E${titleRow.number}`);
    titleRow.getCell(1).style = { font: { bold: true, size: 16 }, alignment: { horizontal: 'center' } };
    ws1.addRow([]);
    ws1.addRow([language === 'ru' ? 'Период:' : 'Davr:', `${marketplaceReport.period.start_date} — ${marketplaceReport.period.end_date}`]);
    ws1.addRow([language === 'ru' ? 'Дата формирования:' : 'Shakllantirilgan sana:', new Date().toLocaleDateString('ru-RU')]);
    ws1.addRow([]);

    // Overall Stats Section
    const statsTitle = ws1.addRow([language === 'ru' ? 'ОБЩАЯ СТАТИСТИКА' : 'UMUMIY STATISTIKA']);
    ws1.mergeCells(`A${statsTitle.number}:E${statsTitle.number}`);
    statsTitle.getCell(1).style = { font: { bold: true, size: 12 }, alignment: { horizontal: 'center' } };
    ws1.addRow([]);
    const statsHeader = ws1.addRow([language === 'ru' ? 'Показатель' : 'Ko\'rsatkich', language === 'ru' ? 'Значение' : 'Qiymat']);
    statsHeader.eachCell((cell) => { cell.style = headerStyle; });

    const statsData = [
      [language === 'ru' ? 'Всего заказов' : 'Jami buyurtmalar', marketplaceReport.overall.total_orders],
      [language === 'ru' ? 'Доставлено заказов' : 'Yetkazilgan buyurtmalar', marketplaceReport.overall.delivered_orders],
      [language === 'ru' ? 'Отменено заказов' : 'Bekor qilingan buyurtmalar', marketplaceReport.overall.cancelled_orders],
      [language === 'ru' ? 'Общая выручка' : 'Umumiy tushum', formatCurrency(marketplaceReport.overall.total_revenue)],
      [language === 'ru' ? 'Доход от доставки' : 'Yetkazish daromadi', formatCurrency(marketplaceReport.overall.total_delivery_fees)],
      [language === 'ru' ? 'Средний рейтинг' : 'O\'rtacha reyting', `${marketplaceReport.overall.avg_rating.toFixed(1)} ⭐`],
      [language === 'ru' ? 'Количество оценок' : 'Baholar soni', marketplaceReport.overall.rated_orders],
    ];
    statsData.forEach(row => {
      const r = ws1.addRow(row);
      r.getCell(1).style = cellStyle;
      r.getCell(2).style = centerStyle;
    });

    ws1.addRow([]);
    ws1.addRow([]);

    // Top Products Section
    const prodTitle = ws1.addRow([language === 'ru' ? 'ТОП-10 ТОВАРОВ ПО ПРОДАЖАМ' : 'ENG KO\'P SOTILGAN TOP-10 TOVAR']);
    ws1.mergeCells(`A${prodTitle.number}:E${prodTitle.number}`);
    prodTitle.getCell(1).style = { font: { bold: true, size: 12 }, alignment: { horizontal: 'center' } };
    ws1.addRow([]);
    const prodHeader = ws1.addRow([
      '№',
      language === 'ru' ? 'Название товара' : 'Tovar nomi',
      language === 'ru' ? 'Продано (шт)' : 'Sotilgan (dona)',
      language === 'ru' ? 'Выручка' : 'Tushum',
      language === 'ru' ? 'Заказов' : 'Buyurtmalar'
    ]);
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
    const catTitle = ws1.addRow([language === 'ru' ? 'ПРОДАЖИ ПО КАТЕГОРИЯМ' : 'KATEGORIYA BO\'YICHA SOTUVLAR']);
    ws1.mergeCells(`A${catTitle.number}:E${catTitle.number}`);
    catTitle.getCell(1).style = { font: { bold: true, size: 12 }, alignment: { horizontal: 'center' } };
    ws1.addRow([]);
    const catHeader = ws1.addRow([
      '№',
      language === 'ru' ? 'Категория' : 'Kategoriya',
      language === 'ru' ? 'Продано (шт)' : 'Sotilgan (dona)',
      language === 'ru' ? 'Выручка' : 'Tushum',
      language === 'ru' ? 'Заказов' : 'Buyurtmalar'
    ]);
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
    const courSummaryTitle = ws1.addRow([language === 'ru' ? 'СТАТИСТИКА КУРЬЕРОВ' : 'KURYERLAR STATISTIKASI']);
    ws1.mergeCells(`A${courSummaryTitle.number}:E${courSummaryTitle.number}`);
    courSummaryTitle.getCell(1).style = { font: { bold: true, size: 12 }, alignment: { horizontal: 'center' } };
    ws1.addRow([]);
    const courSummaryHeader = ws1.addRow([
      '№',
      language === 'ru' ? 'Имя курьера' : 'Kuryer ismi',
      language === 'ru' ? 'Доставлено заказов' : 'Yetkazilgan buyurtmalar',
      language === 'ru' ? 'Средний рейтинг' : 'O\'rtacha reyting'
    ]);
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
    const custSummaryTitle = ws1.addRow([language === 'ru' ? 'ТОП-10 ПОКУПАТЕЛЕЙ' : 'TOP-10 XARIDORLAR']);
    ws1.mergeCells(`A${custSummaryTitle.number}:E${custSummaryTitle.number}`);
    custSummaryTitle.getCell(1).style = { font: { bold: true, size: 12 }, alignment: { horizontal: 'center' } };
    ws1.addRow([]);
    const custSummaryHeader = ws1.addRow([
      '№',
      language === 'ru' ? 'Имя клиента' : 'Mijoz ismi',
      language === 'ru' ? 'Телефон' : 'Telefon',
      language === 'ru' ? 'Заказов' : 'Buyurtmalar',
      language === 'ru' ? 'Сумма покупок' : 'Xaridlar summasi'
    ]);
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
    const ws2 = workbook.addWorksheet(language === 'ru' ? 'По дням' : 'Kunlar bo\'yicha');
    ws2.columns = [{ width: 18 }, { width: 22 }, { width: 25 }];

    const dailyTitle = ws2.addRow([language === 'ru' ? 'ПРОДАЖИ ПО ДНЯМ' : 'KUNLIK SOTUVLAR']);
    ws2.mergeCells(`A${dailyTitle.number}:C${dailyTitle.number}`);
    dailyTitle.getCell(1).style = { font: { bold: true, size: 14 }, alignment: { horizontal: 'center' } };
    ws2.addRow([]);
    const dailyHeader = ws2.addRow([
      language === 'ru' ? 'Дата' : 'Sana',
      language === 'ru' ? 'Количество заказов' : 'Buyurtmalar soni',
      language === 'ru' ? 'Выручка' : 'Tushum'
    ]);
    dailyHeader.eachCell((cell) => { cell.style = headerStyle; });

    marketplaceReport.daily_sales.forEach(d => {
      const r = ws2.addRow([d.date, d.orders, formatCurrency(d.revenue)]);
      r.getCell(1).style = centerStyle;
      r.getCell(2).style = centerStyle;
      r.getCell(3).style = currencyStyle;
    });

    ws2.addRow([]);
    const totalRow = ws2.addRow([
      language === 'ru' ? 'ИТОГО:' : 'JAMI:',
      marketplaceReport.daily_sales.reduce((sum, d) => sum + d.orders, 0),
      formatCurrency(marketplaceReport.daily_sales.reduce((sum, d) => sum + d.revenue, 0))
    ]);
    totalRow.getCell(1).style = { ...cellStyle, font: { bold: true } };
    totalRow.getCell(2).style = { ...centerStyle, font: { bold: true } };
    totalRow.getCell(3).style = { ...currencyStyle, font: { bold: true } };

    // ============ Sheet 3: Products ============
    const ws3 = workbook.addWorksheet(language === 'ru' ? 'Товары' : 'Tovarlar');
    ws3.columns = [{ width: 6 }, { width: 45 }, { width: 16 }, { width: 22 }, { width: 12 }];

    const prodListTitle = ws3.addRow([language === 'ru' ? 'ДЕТАЛЬНЫЙ ОТЧЁТ ПО ТОВАРАМ' : 'TOVARLAR BO\'YICHA BATAFSIL HISOBOT']);
    ws3.mergeCells(`A${prodListTitle.number}:E${prodListTitle.number}`);
    prodListTitle.getCell(1).style = { font: { bold: true, size: 14 }, alignment: { horizontal: 'center' } };
    ws3.addRow([]);
    const prodListHeader = ws3.addRow([
      '№',
      language === 'ru' ? 'Название товара' : 'Tovar nomi',
      language === 'ru' ? 'Продано (шт)' : 'Sotilgan (dona)',
      language === 'ru' ? 'Выручка' : 'Tushum',
      language === 'ru' ? 'Заказов' : 'Buyurtmalar'
    ]);
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
    const ws4 = workbook.addWorksheet(language === 'ru' ? 'Покупатели' : 'Xaridorlar');
    ws4.columns = [{ width: 6 }, { width: 30 }, { width: 18 }, { width: 20 }, { width: 25 }];

    const custTitle = ws4.addRow([language === 'ru' ? 'ДЕТАЛЬНЫЙ ОТЧЁТ ПО ПОКУПАТЕЛЯМ' : 'XARIDORLAR BO\'YICHA BATAFSIL HISOBOT']);
    ws4.mergeCells(`A${custTitle.number}:E${custTitle.number}`);
    custTitle.getCell(1).style = { font: { bold: true, size: 14 }, alignment: { horizontal: 'center' } };
    ws4.addRow([]);
    const custHeader = ws4.addRow([
      '№',
      language === 'ru' ? 'Имя клиента' : 'Mijoz ismi',
      language === 'ru' ? 'Телефон' : 'Telefon',
      language === 'ru' ? 'Количество заказов' : 'Buyurtmalar soni',
      language === 'ru' ? 'Сумма покупок' : 'Xaridlar summasi'
    ]);
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
    const ws5 = workbook.addWorksheet(language === 'ru' ? 'Курьеры' : 'Kuryerlar');
    ws5.columns = [{ width: 6 }, { width: 30 }, { width: 22 }, { width: 18 }];

    const courTitle = ws5.addRow([language === 'ru' ? 'ОТЧЁТ ПО КУРЬЕРАМ' : 'KURYERLAR HISOBOTI']);
    ws5.mergeCells(`A${courTitle.number}:D${courTitle.number}`);
    courTitle.getCell(1).style = { font: { bold: true, size: 14 }, alignment: { horizontal: 'center' } };
    ws5.addRow([]);
    const courHeader = ws5.addRow([
      '№',
      language === 'ru' ? 'Имя курьера' : 'Kuryer ismi',
      language === 'ru' ? 'Доставлено заказов' : 'Yetkazilgan buyurtmalar',
      language === 'ru' ? 'Средний рейтинг' : 'O\'rtacha reyting'
    ]);
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
    a.download = language === 'ru'
      ? `Отчёт_маркетплейс_${reportStartDate}_${reportEndDate}.xlsx`
      : `Hisobot_marketplace_${reportStartDate}_${reportEndDate}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 md:space-y-6 xl:space-y-8 pb-24 md:pb-0">
      {/* Header - mobile optimized with greeting */}
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-gray-400 font-medium">
            {language === 'ru'
              ? `${new Date().getHours() < 12 ? 'Доброе утро' : new Date().getHours() < 18 ? 'Добрый день' : 'Добрый вечер'}, ${user?.name?.split(' ')[0] || ''} 👋`
              : `${new Date().getHours() < 12 ? 'Xayrli tong' : new Date().getHours() < 18 ? 'Xayrli kun' : 'Xayrli kech'}, ${user?.name?.split(' ')[0] || ''} 👋`}
          </p>
          <h1 className="text-xl md:text-2xl xl:text-3xl font-bold text-gray-900 truncate">{language === 'ru' ? 'Панель управления' : 'Boshqaruv paneli'}</h1>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="btn-secondary flex items-center gap-2 flex-shrink-0 min-h-[44px] py-2 px-3 md:py-2.5 md:px-4 touch-manipulation active:scale-[0.98]"
        >
          <RefreshCw className="w-4 h-4" />
          <span className="hidden sm:inline">{language === 'ru' ? 'Обновить' : 'Yangilash'}</span>
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
          {language === 'ru' ? 'Обзор' : 'Umumiy ko\'rinish'}
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
          {language === 'ru' ? 'Маркетплейс' : 'Marketplace'}
        </button>
        <button
          onClick={() => setActiveTab('platform_ads')}
          className={`px-4 py-2 min-h-[44px] font-medium text-sm border-b-2 transition-colors touch-manipulation active:bg-gray-100 ${
            activeTab === 'platform_ads'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Megaphone className="w-4 h-4 inline mr-2" />
          {language === 'ru' ? 'Реклама' : 'Reklama'}
        </button>
      </div>

      {activeTab === 'overview' && (
        <>
          {/* Alerts - mobile optimized */}
          {(staleApprovals.length > 0 || pendingApprovalRequests.length > 0) && (
            <div className="space-y-2 md:space-y-3">
              {staleApprovals.length > 0 && (
                <div className="glass-card p-3 md:p-4 xl:p-5 border-2 border-red-400 bg-red-50/50 w-full text-left">
                  <div className="flex items-center gap-2 md:gap-3">
                    <AlertTriangle className="w-5 h-5 md:w-6 md:h-6 text-red-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-red-800 text-sm md:text-base">
                        {staleApprovals.length} {language === 'ru' ? 'заявок >24ч' : 'ariza >24s'}
                      </div>
                      <div className="text-xs md:text-sm text-red-600 hidden sm:block">
                        {language === 'ru' ? 'Ожидают подтверждения' : 'Tasdiqlash kutilmoqda'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {pendingApprovalRequests.length > 0 && staleApprovals.length === 0 && (
                <div className="glass-card p-3 md:p-4 xl:p-5 border-2 border-purple-400 bg-purple-50/50">
                  <div className="flex items-center gap-2 md:gap-3">
                    <Clock className="w-5 h-5 md:w-6 md:h-6 text-purple-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-purple-800 text-sm md:text-base">
                        {pendingApprovalRequests.length} {language === 'ru' ? 'ожидают подтверждения' : 'tasdiqlash kutilmoqda'}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Stats Cards - mobile optimized */}
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-4 gap-2 sm:gap-3 md:gap-4 xl:gap-5">
            <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6 active:scale-[0.98] transition-transform touch-manipulation rounded-lg sm:rounded-xl">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-orange-400 to-amber-500 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 md:w-6 md:h-6 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-2xl md:text-3xl font-bold">{stats.totalRequests}</div>
                  <div className="text-xs md:text-sm text-gray-500 truncate">{language === 'ru' ? 'Всего' : 'Jami'}</div>
                </div>
              </div>
            </div>

            <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6 active:scale-[0.98] transition-transform touch-manipulation rounded-lg sm:rounded-xl">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-primary-400 to-primary-500 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5 md:w-6 md:h-6 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-2xl md:text-3xl font-bold">{stats.inProgress}</div>
                  <div className="text-xs md:text-sm text-gray-500 truncate">{language === 'ru' ? 'В работе' : 'Jarayonda'}</div>
                </div>
              </div>
            </div>

            <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6 active:scale-[0.98] transition-transform touch-manipulation rounded-lg sm:rounded-xl">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-purple-400 to-violet-500 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0">
                  <UserCheck className="w-5 h-5 md:w-6 md:h-6 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-2xl md:text-3xl font-bold">{stats.pendingApproval}</div>
                  <div className="text-xs md:text-sm text-gray-500 truncate">{language === 'ru' ? 'Ожидание' : 'Kutilmoqda'}</div>
                </div>
              </div>
            </div>

            <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6 active:scale-[0.98] transition-transform touch-manipulation rounded-lg sm:rounded-xl">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-green-400 to-emerald-500 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-5 h-5 md:w-6 md:h-6 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-2xl md:text-3xl font-bold">{stats.completedWeek}</div>
                  <div className="text-xs md:text-sm text-gray-500 truncate">{language === 'ru' ? 'За неделю' : 'Haftalik'}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 gap-2 sm:gap-3 md:gap-4 xl:gap-5">
            {/* Executors Status */}
            <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
              <div className="flex items-center justify-between mb-3 md:mb-4">
                <h3 className="font-bold text-base sm:text-lg md:text-xl xl:text-2xl flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary-500" />
                  {language === 'ru' ? 'Исполнители' : 'Ijrochilar'}
                </h3>
                <span className="text-sm text-gray-500">{executors.length} {language === 'ru' ? 'всего' : 'jami'}</span>
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
                      <div className="text-xs md:text-sm text-gray-500">{language === 'ru' ? 'заявок' : 'arizalar'}</div>
                    </div>
                  </div>
                ))}
                {executors.length === 0 && (
                  <div className="text-center text-gray-500 py-4 text-sm">
                    {language === 'ru' ? 'Нет исполнителей' : 'Ijrochilar yo\'q'}
                  </div>
                )}
              </div>
            </div>

            {/* Requests by Status */}
            <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
              <h3 className="font-bold text-base sm:text-lg md:text-xl xl:text-2xl mb-3 md:mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-purple-500" />
                {language === 'ru' ? 'Заявки по статусам' : 'Arizalar holati bo\'yicha'}
              </h3>
              <div className="space-y-3 md:space-y-4">
                {[
                  { status: 'new', label: language === 'ru' ? 'Новые' : 'Yangi', color: 'bg-blue-500', gradientFrom: 'from-blue-400', gradientTo: 'to-blue-500' },
                  { status: 'assigned', label: language === 'ru' ? 'Назначенные' : 'Tayinlangan', color: 'bg-orange-500', gradientFrom: 'from-orange-400', gradientTo: 'to-orange-500' },
                  { status: 'in_progress', label: language === 'ru' ? 'В работе' : 'Jarayonda', color: 'bg-amber-500', gradientFrom: 'from-amber-400', gradientTo: 'to-amber-500' },
                  { status: 'pending_approval', label: language === 'ru' ? 'Ожидают' : 'Kutilmoqda', color: 'bg-purple-500', gradientFrom: 'from-purple-400', gradientTo: 'to-purple-500' },
                  { status: 'completed', label: language === 'ru' ? 'Выполненные' : 'Bajarilgan', color: 'bg-green-500', gradientFrom: 'from-green-400', gradientTo: 'to-green-500' },
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
            <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
              <h3 className="font-bold text-base sm:text-lg md:text-xl xl:text-2xl mb-3 md:mb-4 flex items-center gap-2">
                <span className="text-yellow-500">★</span>
                {language === 'ru' ? 'Лучшие исполнители' : 'Eng yaxshi ijrochilar'}
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
                            <span className="hidden sm:inline">{executor.completedCount} {language === 'ru' ? 'заявок' : 'arizalar'}</span>
                            <span className="sm:hidden">{executor.completedCount}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                {executors.length === 0 && (
                  <div className="text-center text-gray-500 py-4 text-sm">
                    {language === 'ru' ? 'Нет данных' : 'Ma\'lumot yo\'q'}
                  </div>
                )}
              </div>
            </div>

            {/* Quick Stats */}
            <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
              <h3 className="font-bold text-base sm:text-lg md:text-xl xl:text-2xl mb-3 md:mb-4 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-500" />
                {language === 'ru' ? 'Сводка' : 'Xulosa'}
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                <div className="bg-white/30 rounded-lg p-3">
                  <div className="text-gray-500 text-xs md:text-sm">{language === 'ru' ? 'Всего заявок' : 'Jami arizalar'}</div>
                  <div className="font-bold text-xl md:text-2xl xl:text-3xl">{stats.totalRequests}</div>
                </div>
                <div className="bg-white/30 rounded-lg p-3">
                  <div className="text-gray-500 text-xs md:text-sm">{language === 'ru' ? 'Исполнителей' : 'Ijrochilar'}</div>
                  <div className="font-bold text-xl md:text-2xl xl:text-3xl">{executors.length}</div>
                </div>
                <div className="bg-white/30 rounded-lg p-3">
                  <div className="text-gray-500 text-xs md:text-sm">{language === 'ru' ? 'Выполнено' : 'Bajarildi'}</div>
                  <div className="font-bold text-xl md:text-2xl xl:text-3xl text-green-600">{stats.completedWeek}</div>
                </div>
                <div className="bg-white/30 rounded-lg p-3">
                  <div className="text-gray-500 text-xs md:text-sm">{language === 'ru' ? 'Активных' : 'Faol'}</div>
                  <div className="font-bold text-xl md:text-2xl xl:text-3xl text-amber-600">{stats.inProgress}</div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Marketplace Tab */}
      {activeTab === 'marketplace' && (
        <div className="space-y-4 md:space-y-6 xl:space-y-8">
          {/* Period selector and download button */}
          <div className="glass-card p-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Calendar className="w-5 h-5 text-gray-500" />
                <span className="text-sm text-gray-600">{language === 'ru' ? 'Период:' : 'Davr:'}</span>
                <input
                  type="date"
                  value={reportStartDate}
                  onChange={(e) => setReportStartDate(e.target.value)}
                  className="px-3 py-1.5 min-h-[44px] border border-gray-300 rounded-lg sm:rounded-xl text-sm touch-manipulation"
                />
                <span className="text-gray-400">—</span>
                <input
                  type="date"
                  value={reportEndDate}
                  onChange={(e) => setReportEndDate(e.target.value)}
                  className="px-3 py-1.5 min-h-[44px] border border-gray-300 rounded-lg sm:rounded-xl text-sm touch-manipulation"
                />
              </div>
              <button
                onClick={exportMarketplaceReport}
                disabled={!marketplaceReport || isLoadingReport}
                className="btn-primary flex items-center gap-2 min-h-[44px] touch-manipulation active:scale-[0.98]"
              >
                <Download className="w-4 h-4" />
                {language === 'ru' ? 'Скачать Excel' : 'Excel yuklash'}
              </button>
            </div>
          </div>

          {isLoadingReport ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw className="w-6 h-6 animate-spin text-primary-500" />
              <span className="ml-3 text-gray-600">{language === 'ru' ? 'Загрузка...' : 'Yuklanmoqda...'}</span>
            </div>
          ) : marketplaceReport ? (
            <>
              {/* Overall Stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3 md:gap-4 xl:gap-5">
                <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6 rounded-lg sm:rounded-xl">
                  <div className="flex items-center gap-3 mb-2">
                    <ShoppingBag className="w-6 h-6 text-primary-500" />
                  </div>
                  <div className="text-2xl font-bold">{marketplaceReport.overall.total_orders}</div>
                  <div className="text-sm text-gray-500">{language === 'ru' ? 'Всего заказов' : 'Jami buyurtmalar'}</div>
                  <div className="mt-2 text-xs">
                    <span className="text-green-600">{marketplaceReport.overall.delivered_orders} {language === 'ru' ? 'доставлено' : 'yetkazildi'}</span>
                    <span className="text-gray-400 mx-1">|</span>
                    <span className="text-red-600">{marketplaceReport.overall.cancelled_orders} {language === 'ru' ? 'отменено' : 'bekor qilindi'}</span>
                  </div>
                </div>

                <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6 rounded-lg sm:rounded-xl">
                  <div className="flex items-center gap-3 mb-2">
                    <DollarSign className="w-6 h-6 text-green-500" />
                  </div>
                  <div className="text-2xl font-bold">{marketplaceReport.overall.total_revenue.toLocaleString()}</div>
                  <div className="text-sm text-gray-500">{language === 'ru' ? 'Выручка (сум)' : 'Tushum (so\'m)'}</div>
                  <div className="mt-2 text-xs text-gray-600">
                    {language === 'ru' ? 'Доставка' : 'Yetkazish'}: {marketplaceReport.overall.total_delivery_fees.toLocaleString()} {language === 'ru' ? 'сум' : 'so\'m'}
                  </div>
                </div>

                <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6 rounded-lg sm:rounded-xl">
                  <div className="flex items-center gap-3 mb-2">
                    <Star className="w-6 h-6 text-yellow-500" />
                  </div>
                  <div className="text-2xl font-bold">{marketplaceReport.overall.avg_rating.toFixed(1)}</div>
                  <div className="text-sm text-gray-500">{language === 'ru' ? 'Средний рейтинг' : 'O\'rtacha reyting'}</div>
                  <div className="mt-2 text-xs text-gray-600">
                    {marketplaceReport.overall.rated_orders} {language === 'ru' ? 'оценок' : 'baholar'}
                  </div>
                </div>

                <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6 rounded-lg sm:rounded-xl">
                  <div className="flex items-center gap-3 mb-2">
                    <Package className="w-6 h-6 text-purple-500" />
                  </div>
                  <div className="text-2xl font-bold">
                    {marketplaceReport.top_products.reduce((sum, p) => sum + p.total_sold, 0)}
                  </div>
                  <div className="text-sm text-gray-500">{language === 'ru' ? 'Продано (шт)' : 'Sotilgan (dona)'}</div>
                  <div className="mt-2 text-xs text-gray-600">
                    {marketplaceReport.top_products.length} {language === 'ru' ? 'товаров' : 'tovar'}
                  </div>
                </div>
              </div>

              {/* Sales Chart */}
              <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
                <h3 className="font-bold text-base sm:text-lg md:text-xl xl:text-2xl mb-3 md:mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary-500" />
                  {language === 'ru' ? 'Динамика продаж' : 'Sotuvlar dinamikasi'}
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
                        name === 'revenue' ? `${value.toLocaleString()} ${language === 'ru' ? 'сум' : 'so\'m'}` : value,
                        name === 'revenue' ? (language === 'ru' ? 'Выручка' : 'Tushum') : (language === 'ru' ? 'Заказов' : 'Buyurtmalar')
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
                      name={language === 'ru' ? 'Выручка' : 'Tushum'}
                    />
                    <Area
                      type="monotone"
                      dataKey="orders"
                      stroke="#3B82F6"
                      strokeWidth={2}
                      fill="none"
                      name={language === 'ru' ? 'Заказов' : 'Buyurtmalar'}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Two column layout */}
              <div className="grid lg:grid-cols-2 gap-2 sm:gap-3 md:gap-4 xl:gap-5">
                {/* Top Products */}
                <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
                  <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                    <Package className="w-5 h-5 text-purple-500" />
                    {language === 'ru' ? 'Топ товаров' : 'Top tovarlar'}
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
                            {product.total_sold} {language === 'ru' ? 'шт' : 'dona'} • {product.order_count} {language === 'ru' ? 'заказов' : 'buyurtma'}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-sm text-green-600">
                            {product.total_revenue.toLocaleString()}
                          </div>
                          <div className="text-xs text-gray-400">{language === 'ru' ? 'сум' : 'so\'m'}</div>
                        </div>
                      </div>
                    ))}
                    {marketplaceReport.top_products.length === 0 && (
                      <div className="text-center text-gray-400 py-8">{language === 'ru' ? 'Нет данных' : 'Ma\'lumot yo\'q'}</div>
                    )}
                  </div>
                </div>

                {/* Categories */}
                <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
                  <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                    <Briefcase className="w-5 h-5 text-orange-500" />
                    {language === 'ru' ? 'По категориям' : 'Kategoriyalar bo\'yicha'}
                  </h3>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {marketplaceReport.categories.map((cat) => (
                      <div key={cat.category_name} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{cat.category_name}</div>
                          <div className="text-xs text-gray-500">
                            {cat.total_sold} {language === 'ru' ? 'шт' : 'dona'} • {cat.order_count} {language === 'ru' ? 'заказов' : 'buyurtma'}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-sm text-green-600">
                            {cat.total_revenue.toLocaleString()}
                          </div>
                          <div className="text-xs text-gray-400">{language === 'ru' ? 'сум' : 'so\'m'}</div>
                        </div>
                      </div>
                    ))}
                    {marketplaceReport.categories.length === 0 && (
                      <div className="text-center text-gray-400 py-8">{language === 'ru' ? 'Нет данных' : 'Ma\'lumot yo\'q'}</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Bottom section */}
              <div className="grid lg:grid-cols-2 gap-2 sm:gap-3 md:gap-4 xl:gap-5">
                {/* Top Customers */}
                <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
                  <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary-500" />
                    {language === 'ru' ? 'Топ покупателей' : 'Top xaridorlar'}
                  </h3>
                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {marketplaceReport.top_customers.map((customer, idx) => (
                      <div key={customer.user_id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                        <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center font-bold text-primary-600">
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{customer.user_name}</div>
                          <div className="text-xs text-gray-500">{customer.user_phone}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-sm">{customer.order_count} {language === 'ru' ? 'заказов' : 'buyurtma'}</div>
                          <div className="text-xs text-green-600">{customer.total_spent.toLocaleString()} {language === 'ru' ? 'сум' : 'so\'m'}</div>
                        </div>
                      </div>
                    ))}
                    {marketplaceReport.top_customers.length === 0 && (
                      <div className="text-center text-gray-400 py-8">{language === 'ru' ? 'Нет данных' : 'Ma\'lumot yo\'q'}</div>
                    )}
                  </div>
                </div>

                {/* Couriers */}
                <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
                  <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                    <UserCheck className="w-5 h-5 text-green-500" />
                    {language === 'ru' ? 'Курьеры' : 'Kuryerlar'}
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
                            {executor.delivered_count} {language === 'ru' ? 'доставок' : 'yetkazish'}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-yellow-600">
                          <Star className="w-4 h-4" />
                          <span className="font-medium">{executor.avg_rating.toFixed(1)}</span>
                        </div>
                      </div>
                    ))}
                    {marketplaceReport.executor_stats.length === 0 && (
                      <div className="text-center text-gray-400 py-8">{language === 'ru' ? 'Нет данных' : 'Ma\'lumot yo\'q'}</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Orders by Status pie chart */}
              <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
                <h3 className="font-bold text-base sm:text-lg md:text-xl xl:text-2xl mb-3 md:mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-purple-500" />
                  {language === 'ru' ? 'Заказы по статусам' : 'Buyurtmalar holati bo\'yicha'}
                </h3>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={marketplaceReport.orders_by_status.map(s => ({
                        name: language === 'ru' ? ({
                          new: 'Новые',
                          confirmed: 'Подтверждённые',
                          preparing: 'Готовятся',
                          ready: 'Готовы',
                          delivering: 'В доставке',
                          delivered: 'Доставлены',
                          cancelled: 'Отменены',
                        }[s.status] || s.status) : ({
                          new: 'Yangi',
                          confirmed: 'Tasdiqlangan',
                          preparing: 'Tayyorlanmoqda',
                          ready: 'Tayyor',
                          delivering: 'Yetkazilmoqda',
                          delivered: 'Yetkazildi',
                          cancelled: 'Bekor qilindi',
                        }[s.status] || s.status),
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
            <div className="text-center text-gray-400 py-20">{language === 'ru' ? 'Нет данных' : 'Ma\'lumot yo\'q'}</div>
          )}
        </div>
      )}
      {/* Platform Ads Tab */}
      {activeTab === 'platform_ads' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{language === 'ru' ? 'Реклама от платформы' : 'Platforma reklamalari'}</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {language === 'ru'
                ? 'Рекламные объявления, назначенные платформой. Включите или выключите видимость для ваших жильцов.'
                : 'Platforma tomonidan belgilangan reklamalar. Sakinlaringiz uchun ko\'rinishini yoqing yoki o\'chiring.'}
            </p>
          </div>

          {isLoadingPlatformAds ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw className="w-6 h-6 animate-spin text-primary-500" />
            </div>
          ) : platformAds.length === 0 ? (
            <div className="glass-card p-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-4">
                <Megaphone className="w-6 h-6 text-gray-300" />
              </div>
              <p className="text-gray-400 font-medium">
                {language === 'ru' ? 'Нет рекламы от платформы' : 'Platforma reklamalari yo\'q'}
              </p>
              <p className="text-gray-300 text-sm mt-1">
                {language === 'ru' ? 'Суперадмин ещё не назначил рекламу для вашей УК' : 'Superadmin hali reklama belgilamagan'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {platformAds.map(ad => (
                <div key={ad.id} className="glass-card overflow-hidden">
                  <div className="p-4 flex items-start gap-3">
                    {/* Logo */}
                    {ad.logo_url ? (
                      <img src={ad.logo_url} alt="" className="w-14 h-14 rounded-xl object-cover border border-gray-100 flex-shrink-0" />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-orange-50 to-orange-100 flex items-center justify-center text-2xl flex-shrink-0">
                        📋
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-bold text-gray-900 text-sm truncate">{ad.title}</h3>
                          <p className="text-xs text-gray-400 mt-0.5">{ad.category_name}</p>
                        </div>
                        {/* Toggle switch */}
                        <button
                          onClick={() => handleTogglePlatformAd(ad.id, (user as any)?.tenant_id, ad.tenant_enabled)}
                          disabled={togglingAdId === ad.id}
                          className="flex-shrink-0 flex items-center gap-2 transition-colors"
                          title={ad.tenant_enabled ? (language === 'ru' ? 'Показывается жильцам — нажмите чтобы скрыть' : 'Ko\'rinmoqda — yashirish uchun bosing') : (language === 'ru' ? 'Скрыто от жильцов — нажмите чтобы показать' : 'Yashirin — ko\'rsatish uchun bosing')}
                        >
                          {togglingAdId === ad.id ? (
                            <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
                          ) : ad.tenant_enabled ? (
                            <ToggleRight className="w-8 h-8 text-emerald-500" />
                          ) : (
                            <ToggleLeft className="w-8 h-8 text-gray-300" />
                          )}
                        </button>
                      </div>

                      {ad.description && (
                        <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">{ad.description}</p>
                      )}

                      <div className="flex items-center gap-3 mt-2 pt-2 border-t border-gray-50">
                        {ad.discount_percent > 0 && (
                          <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded text-xs font-bold">-{ad.discount_percent}%</span>
                        )}
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Eye className="w-3.5 h-3.5" /> {ad.views_count || 0}
                        </span>
                        {ad.expires_at && (
                          <span className="text-xs text-gray-400 ml-auto">
                            до {new Date(ad.expires_at).toLocaleDateString('ru-RU')}
                          </span>
                        )}
                        <span className={`text-xs font-semibold ml-auto ${ad.tenant_enabled ? 'text-emerald-600' : 'text-gray-400'}`}>
                          {ad.tenant_enabled
                            ? (language === 'ru' ? 'Включено' : 'Yoqilgan')
                            : (language === 'ru' ? 'Выключено' : 'O\'chirilgan')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Building targeting info */}
                  {ad.target_type && ad.target_type !== 'all' && (
                    <div className="px-4 pb-3">
                      <span className="text-[10px] text-gray-400 flex items-center gap-1">
                        <Building2 className="w-3 h-3" />
                        {language === 'ru' ? 'Таргетинг:' : 'Maqsad:'} {ad.target_type === 'branches' ? 'по филиалам' : 'по зданиям'}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Install App / Notifications */}
      <InstallAppSection language={language} roleContext="admin" />
    </div>
  );
}
