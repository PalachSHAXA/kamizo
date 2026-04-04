import {
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area,
  CartesianGrid, XAxis, YAxis, Tooltip, Legend
} from '../../components/LazyCharts';
import {
  TrendingUp, Star, RefreshCw, Briefcase, Users, FileText,
  ShoppingBag, Download, Calendar, Package, Banknote, Wrench
} from 'lucide-react';
import type { MarketplaceReport } from './types';
import type { Style } from 'exceljs';

interface MarketplaceTabProps {
  language: string;
  t: (key: string) => string;
  marketplaceReport: MarketplaceReport | null;
  isLoadingReport: boolean;
  reportStartDate: string;
  reportEndDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
}

export function MarketplaceTab({
  language,
  t,
  marketplaceReport,
  isLoadingReport,
  reportStartDate,
  reportEndDate,
  onStartDateChange,
  onEndDateChange,
}: MarketplaceTabProps) {

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
    ws1.addRow([language === 'ru' ? 'Дата формирования:' : 'Shakllantirish sanasi:', new Date().toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ')]);
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
      [language === 'ru' ? 'Общая выручка' : 'Umumiy daromad', formatCurrency(marketplaceReport.overall.total_revenue)],
      [language === 'ru' ? 'Доход от доставки' : 'Yetkazishdan daromad', formatCurrency(marketplaceReport.overall.total_delivery_fees)],
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
    const prodTitle = ws1.addRow([language === 'ru' ? 'ТОП-10 ТОВАРОВ ПО ПРОДАЖАМ' : 'TOP-10 ENG KO\'P SOTILGAN MAHSULOTLAR']);
    ws1.mergeCells(`A${prodTitle.number}:E${prodTitle.number}`);
    prodTitle.getCell(1).style = { font: { bold: true, size: 12 }, alignment: { horizontal: 'center' } };
    ws1.addRow([]);
    const prodHeader = ws1.addRow(['№', language === 'ru' ? 'Название товара' : 'Mahsulot nomi', language === 'ru' ? 'Продано (шт)' : 'Sotildi (dona)', language === 'ru' ? 'Выручка' : 'Daromad', language === 'ru' ? 'Заказов' : 'Buyurtmalar']);
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
    const catTitle = ws1.addRow([language === 'ru' ? 'ПРОДАЖИ ПО КАТЕГОРИЯМ' : 'KATEGORIYALAR BO\'YICHA SOTUVLAR']);
    ws1.mergeCells(`A${catTitle.number}:E${catTitle.number}`);
    catTitle.getCell(1).style = { font: { bold: true, size: 12 }, alignment: { horizontal: 'center' } };
    ws1.addRow([]);
    const catHeader = ws1.addRow(['№', language === 'ru' ? 'Категория' : 'Kategoriya', language === 'ru' ? 'Продано (шт)' : 'Sotildi (dona)', language === 'ru' ? 'Выручка' : 'Daromad', language === 'ru' ? 'Заказов' : 'Buyurtmalar']);
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
    const courSummaryHeader = ws1.addRow(['№', language === 'ru' ? 'Имя курьера' : 'Kuryer ismi', language === 'ru' ? 'Доставлено заказов' : 'Yetkazilgan buyurtmalar', language === 'ru' ? 'Средний рейтинг' : 'O\'rtacha reyting']);
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
    const custSummaryHeader = ws1.addRow(['№', language === 'ru' ? 'Имя клиента' : 'Mijoz ismi', language === 'ru' ? 'Телефон' : 'Telefon', language === 'ru' ? 'Заказов' : 'Buyurtmalar', language === 'ru' ? 'Сумма покупок' : 'Xaridlar summasi']);
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
    const dailyHeader = ws2.addRow([language === 'ru' ? 'Дата' : 'Sana', language === 'ru' ? 'Количество заказов' : 'Buyurtmalar soni', language === 'ru' ? 'Выручка' : 'Daromad']);
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
    const ws3 = workbook.addWorksheet(language === 'ru' ? 'Товары' : 'Mahsulotlar');
    ws3.columns = [{ width: 6 }, { width: 45 }, { width: 16 }, { width: 22 }, { width: 12 }];

    const prodListTitle = ws3.addRow([language === 'ru' ? 'ДЕТАЛЬНЫЙ ОТЧЁТ ПО ТОВАРАМ' : 'MAHSULOTLAR BO\'YICHA BATAFSIL HISOBOT']);
    ws3.mergeCells(`A${prodListTitle.number}:E${prodListTitle.number}`);
    prodListTitle.getCell(1).style = { font: { bold: true, size: 14 }, alignment: { horizontal: 'center' } };
    ws3.addRow([]);
    const prodListHeader = ws3.addRow(['№', language === 'ru' ? 'Название товара' : 'Mahsulot nomi', language === 'ru' ? 'Продано (шт)' : 'Sotildi (dona)', language === 'ru' ? 'Выручка' : 'Daromad', language === 'ru' ? 'Заказов' : 'Buyurtmalar']);
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
    const custHeader = ws4.addRow(['№', language === 'ru' ? 'Имя клиента' : 'Mijoz ismi', language === 'ru' ? 'Телефон' : 'Telefon', language === 'ru' ? 'Количество заказов' : 'Buyurtmalar soni', language === 'ru' ? 'Сумма покупок' : 'Xaridlar summasi']);
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

    const courTitle = ws5.addRow([language === 'ru' ? 'ОТЧЁТ ПО КУРЬЕРАМ' : 'KURYERLAR BO\'YICHA HISOBOT']);
    ws5.mergeCells(`A${courTitle.number}:D${courTitle.number}`);
    courTitle.getCell(1).style = { font: { bold: true, size: 14 }, alignment: { horizontal: 'center' } };
    ws5.addRow([]);
    const courHeader = ws5.addRow(['№', language === 'ru' ? 'Имя курьера' : 'Kuryer ismi', language === 'ru' ? 'Доставлено заказов' : 'Yetkazilgan buyurtmalar', language === 'ru' ? 'Средний рейтинг' : 'O\'rtacha reyting']);
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
    a.download = language === 'ru' ? `Отчёт_маркетплейс_${reportStartDate}_${reportEndDate}.xlsx` : `Marketplace_hisobot_${reportStartDate}_${reportEndDate}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 xl:space-y-8">
      {/* Period selector and download button */}
      <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Calendar className="w-5 h-5 text-gray-500" />
            <span className="text-sm text-gray-600">{t('director.period')}:</span>
            <input
              type="date"
              value={reportStartDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              className="px-3 py-1.5 min-h-[44px] border border-gray-300 rounded-lg sm:rounded-xl text-sm touch-manipulation"
            />
            <span className="text-gray-400">—</span>
            <input
              type="date"
              value={reportEndDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              className="px-3 py-1.5 min-h-[44px] border border-gray-300 rounded-lg sm:rounded-xl text-sm touch-manipulation"
            />
          </div>
          <button
            onClick={exportMarketplaceReport}
            disabled={!marketplaceReport || isLoadingReport}
            className="btn-primary flex items-center gap-2 min-h-[44px] touch-manipulation active:scale-[0.98]"
          >
            <Download className="w-4 h-4" />
            {t('director.download')}
          </button>
        </div>
      </div>

      {isLoadingReport ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-8 h-8 animate-spin text-primary-500" />
          <span className="ml-3 text-gray-600">{t('director.loading')}</span>
        </div>
      ) : marketplaceReport ? (
        <>
          {/* Overall Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4 xl:gap-5">
            <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
              <div className="flex items-center gap-3 mb-2">
                <ShoppingBag className="w-8 h-8 text-primary-500" />
              </div>
              <div className="text-2xl font-bold">{marketplaceReport.overall.total_orders}</div>
              <div className="text-sm text-gray-500">{t('director.totalOrders')}</div>
              <div className="mt-2 text-xs">
                <span className="text-green-600">{marketplaceReport.overall.delivered_orders} {t('director.delivered')}</span>
                <span className="text-gray-400 mx-1">|</span>
                <span className="text-red-600">{marketplaceReport.overall.cancelled_orders} {t('director.cancelled')}</span>
              </div>
            </div>

            <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
              <div className="flex items-center gap-3 mb-2">
                <Banknote className="w-8 h-8 text-green-500" />
              </div>
              <div className="text-2xl font-bold">{marketplaceReport.overall.total_revenue.toLocaleString('ru-RU')} {language === 'ru' ? 'сум' : "so'm"}</div>
              <div className="text-sm text-gray-500">{t('director.revenue')}</div>
              <div className="mt-2 text-xs text-gray-600">
                {t('director.deliveryFees')}: {marketplaceReport.overall.total_delivery_fees.toLocaleString()} {language === 'ru' ? 'сум' : 'so\'m'}
              </div>
            </div>

            <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
              <div className="flex items-center gap-3 mb-2">
                <Star className="w-8 h-8 text-yellow-500" />
              </div>
              <div className="text-2xl font-bold">{marketplaceReport.overall.avg_rating.toFixed(1)}</div>
              <div className="text-sm text-gray-500">{t('director.avgRating')}</div>
              <div className="mt-2 text-xs text-gray-600">
                {marketplaceReport.overall.rated_orders} {language === 'ru' ? 'оценок' : 'baho'}
              </div>
            </div>

            <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
              <div className="flex items-center gap-3 mb-2">
                <Package className="w-8 h-8 text-purple-500" />
              </div>
              <div className="text-2xl font-bold">
                {marketplaceReport.top_products.reduce((sum, p) => sum + p.total_sold, 0)}
              </div>
              <div className="text-sm text-gray-500">{t('director.sold')} ({language === 'ru' ? 'шт' : 'dona'})</div>
              <div className="mt-2 text-xs text-gray-600">
                {marketplaceReport.top_products.length} {language === 'ru' ? 'товаров' : 'mahsulot'}
              </div>
            </div>
          </div>

          {/* Sales Chart */}
          <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
            <h3 className="font-bold text-base sm:text-lg md:text-xl xl:text-2xl mb-3 md:mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary-500" />
              {t('director.salesChart')}
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
                  tickFormatter={(val: string) => new Date(val).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', { day: 'numeric', month: 'short' })}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    name === 'revenue' ? `${value.toLocaleString()} ${language === 'ru' ? 'сум' : 'so\'m'}` : value,
                    name === 'revenue' ? t('director.revenue') : t('director.orders')
                  ]}
                  labelFormatter={(label: string) => new Date(label).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ')}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#10B981"
                  strokeWidth={2}
                  fill="url(#colorRevenue)"
                  name={t('director.revenue')}
                />
                <Area
                  type="monotone"
                  dataKey="orders"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  fill="none"
                  name={t('director.orders')}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Two column layout */}
          <div className="grid lg:grid-cols-2 gap-2 sm:gap-3 md:gap-4 xl:gap-5">
            {/* Top Products */}
            <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
              <h3 className="font-bold text-base sm:text-lg md:text-xl xl:text-2xl mb-3 md:mb-4 flex items-center gap-2">
                <Package className="w-5 h-5 text-purple-500" />
                {t('director.topProducts')}
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
                        {product.total_sold} {language === 'ru' ? 'шт' : 'dona'} • {product.order_count} {t('director.orders')}
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
                  <div className="text-center text-gray-400 py-8">{t('director.noData')}</div>
                )}
              </div>
            </div>

            {/* Categories */}
            <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
              <h3 className="font-bold text-base sm:text-lg md:text-xl xl:text-2xl mb-3 md:mb-4 flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-orange-500" />
                {t('director.byCategory')}
              </h3>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {marketplaceReport.categories.map((cat) => (
                  <div key={cat.category_name} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{cat.category_name}</div>
                      <div className="text-xs text-gray-500">
                        {cat.total_sold} {language === 'ru' ? 'шт' : 'dona'} • {cat.order_count} {t('director.orders')}
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
                  <div className="text-center text-gray-400 py-8">{t('director.noData')}</div>
                )}
              </div>
            </div>
          </div>

          {/* Bottom section */}
          <div className="grid lg:grid-cols-2 gap-2 sm:gap-3 md:gap-4 xl:gap-5">
            {/* Top Customers */}
            <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
              <h3 className="font-bold text-base sm:text-lg md:text-xl xl:text-2xl mb-3 md:mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-primary-500" />
                {t('director.topCustomers')}
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
                      <div className="font-semibold text-sm">{customer.order_count} {t('director.orders')}</div>
                      <div className="text-xs text-green-600">{customer.total_spent.toLocaleString()} {language === 'ru' ? 'сум' : 'so\'m'}</div>
                    </div>
                  </div>
                ))}
                {marketplaceReport.top_customers.length === 0 && (
                  <div className="text-center text-gray-400 py-8">{t('director.noData')}</div>
                )}
              </div>
            </div>

            {/* Couriers */}
            <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
              <h3 className="font-bold text-base sm:text-lg md:text-xl xl:text-2xl mb-3 md:mb-4 flex items-center gap-2">
                <Wrench className="w-5 h-5 text-green-500" />
                {t('director.couriers')}
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
                        {executor.delivered_count} {t('director.deliveredCount')}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-yellow-600">
                      <Star className="w-4 h-4" />
                      <span className="font-medium">{executor.avg_rating.toFixed(1)}</span>
                    </div>
                  </div>
                ))}
                {marketplaceReport.executor_stats.length === 0 && (
                  <div className="text-center text-gray-400 py-8">{t('director.noData')}</div>
                )}
              </div>
            </div>
          </div>

          {/* Orders by Status pie chart */}
          <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
            <h3 className="font-bold text-base sm:text-lg md:text-xl xl:text-2xl mb-3 md:mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-purple-500" />
              {language === 'ru' ? 'Заказы по статусам' : 'Buyurtmalar holati'}
            </h3>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={marketplaceReport.orders_by_status.map(s => ({
                    name: {
                      new: language === 'ru' ? 'Новые' : 'Yangi',
                      confirmed: language === 'ru' ? 'Подтверждённые' : 'Tasdiqlangan',
                      preparing: language === 'ru' ? 'Готовятся' : 'Tayyorlanmoqda',
                      ready: language === 'ru' ? 'Готовы' : 'Tayyor',
                      delivering: language === 'ru' ? 'В доставке' : 'Yetkazilmoqda',
                      delivered: language === 'ru' ? 'Доставлены' : 'Yetkazildi',
                      cancelled: language === 'ru' ? 'Отменены' : 'Bekor qilindi',
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
        <div className="text-center text-gray-400 py-20">{t('director.noData')}</div>
      )}
    </div>
  );
}
