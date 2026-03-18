import { useEffect, useState, useMemo, useCallback } from 'react';
import { AlertTriangle, FileText, Filter, Users, Banknote } from 'lucide-react';
import { useFinanceStore } from '../../stores/financeStore';
import { useBuildingStore } from '../../stores/buildingStore';
import { useLanguageStore } from '../../stores/languageStore';
import { useTenantStore } from '../../stores/tenantStore';
import { generateReconciliationDoc, generatePretensionDoc } from '../../utils/generateFinanceDocs';
import { EmptyState } from '../../components/common';
import { PageSkeleton } from '../../components/PageSkeleton';

interface Debtor {
  apartment_id: string;
  apartment_number: string;
  building_id: string;
  building_name: string;
  owner_name: string;
  owner_phone: string;
  total_debt: number;
  months_overdue: number;
  last_payment_date: string | null;
}

export default function DebtorsPage() {
  const language = useLanguageStore((s) => s.language);
  const t = (ru: string, uz: string) => (language === 'ru' ? ru : uz);

  const tenantName = useTenantStore((s) => s.config?.tenant?.name) || 'УК';

  const debtors = useFinanceStore((s) => s.debtors) as Debtor[];
  const debtorsLoading = useFinanceStore((s) => s.debtorsLoading);
  const fetchDebtors = useFinanceStore((s) => s.fetchDebtors);
  const generateReconciliation = useFinanceStore((s) => s.generateReconciliation);
  const generatePretension = useFinanceStore((s) => s.generatePretension);
  const setFilters = useFinanceStore((s) => s.setFilters);

  const buildings = useBuildingStore((s) => s.buildings) as { id: string; name: string }[];
  const fetchBuildings = useBuildingStore((s) => s.fetchBuildings);

  const [filterBuilding, setFilterBuilding] = useState('');
  const [filterMinDebt, setFilterMinDebt] = useState('');
  const [filterMinMonths, setFilterMinMonths] = useState('');

  useEffect(() => {
    fetchBuildings();
    fetchDebtors();
  }, [fetchBuildings, fetchDebtors]);

  const handleApplyFilters = useCallback(() => {
    setFilters({ buildingId: filterBuilding });
    fetchDebtors();
  }, [filterBuilding, setFilters, fetchDebtors]);

  const filtered = useMemo(() => {
    let list = debtors;
    if (filterBuilding) {
      list = list.filter((d) => d.building_id === filterBuilding);
    }
    if (filterMinDebt) {
      const min = Number(filterMinDebt);
      if (!isNaN(min)) list = list.filter((d) => d.total_debt >= min);
    }
    if (filterMinMonths) {
      const min = Number(filterMinMonths);
      if (!isNaN(min)) list = list.filter((d) => d.months_overdue >= min);
    }
    return list;
  }, [debtors, filterBuilding, filterMinDebt, filterMinMonths]);

  const totalDebt = useMemo(() => filtered.reduce((s, d) => s + (d.total_debt || 0), 0), [filtered]);

  const handleReconciliation = useCallback(
    async (d: Debtor) => {
      const now = new Date();
      const periodTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const monthsBack = d.months_overdue || 1;
      const from = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
      const periodFrom = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}`;
      const result = await generateReconciliation({ apartment_id: d.apartment_id, period_from: periodFrom, period_to: periodTo });
      if (result) {
        generateReconciliationDoc(result as Parameters<typeof generateReconciliationDoc>[0], tenantName);
      }
    },
    [generateReconciliation, tenantName],
  );

  const handlePretension = useCallback(
    async (d: Debtor) => {
      const msg = t(
        `Сформировать претензию для кв. ${d.apartment_number} (${d.owner_name})?`,
        `${d.apartment_number}-xonadon uchun da'vo shakllantirilsinmi (${d.owner_name})?`,
      );
      if (window.confirm(msg)) {
        const result = await generatePretension(d.apartment_id);
        if (result) {
          generatePretensionDoc(result as Parameters<typeof generatePretensionDoc>[0], tenantName);
        }
      }
    },
    [generatePretension, t, tenantName],
  );

  if (debtorsLoading) return <PageSkeleton variant="list" />;

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <h1 className="text-2xl font-bold text-gray-900">{t('Должники', 'Qarzdorlar')}</h1>

      {/* Filter bar */}
      <div className="bg-white/60 backdrop-blur-xl rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap items-end gap-4">
          {/* Building */}
          <div className="flex flex-col gap-1 min-w-[180px]">
            <label className="text-xs font-medium text-gray-500">{t('Здание', 'Bino')}</label>
            <select
              value={filterBuilding}
              onChange={(e) => setFilterBuilding(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{t('Все здания', 'Barcha binolar')}</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Min debt */}
          <div className="flex flex-col gap-1 min-w-[160px]">
            <label className="text-xs font-medium text-gray-500">{t('Мин. долг (сум)', "Min. qarz (so'm)")}</label>
            <input
              type="number"
              min={0}
              value={filterMinDebt}
              onChange={(e) => setFilterMinDebt(e.target.value)}
              placeholder="0"
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Min months */}
          <div className="flex flex-col gap-1 min-w-[160px]">
            <label className="text-xs font-medium text-gray-500">
              {t('Мин. месяцев просрочки', 'Min. kechikish oylari')}
            </label>
            <input
              type="number"
              min={0}
              value={filterMinMonths}
              onChange={(e) => setFilterMinMonths(e.target.value)}
              placeholder="0"
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Apply */}
          <button
            onClick={handleApplyFilters}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <Filter className="h-4 w-4" />
            {t('Применить', 'Qo\'llash')}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white/60 backdrop-blur-xl rounded-xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-gray-500">{t('Всего должников', 'Jami qarzdorlar')}</p>
            <p className="text-2xl font-bold text-gray-900">{filtered.length}</p>
          </div>
        </div>
        <div className="bg-white/60 backdrop-blur-xl rounded-xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-red-100 text-red-600">
            <Banknote className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-gray-500">{t('Общий долг', 'Umumiy qarz')}</p>
            <p className="text-2xl font-bold text-gray-900">
              {totalDebt.toLocaleString()} {t('сум', "so'm")}
            </p>
          </div>
        </div>
      </div>

      {/* Table or empty */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title={t('Должников не найдено', 'Qarzdorlar topilmadi')}
          description={t(
            'Нет жильцов с задолженностью по текущим фильтрам',
            "Joriy filtrlar bo'yicha qarzdor topilmadi",
          )}
        />
      ) : (
        <div className="bg-white/60 backdrop-blur-xl rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/50">
                  <th className="px-4 py-3 text-left font-medium text-gray-500">#</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">{t('Квартира', 'Xonadon')}</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">{t('Здание', 'Bino')}</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">{t('Владелец', 'Egasi')}</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">{t('Телефон', 'Telefon')}</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">{t('Долг', 'Qarz')}</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-500">
                    {t('Мес. просрочки', 'Kechikish')}
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">
                    {t('Последняя оплата', "Oxirgi to'lov")}
                  </th>
                  <th className="px-4 py-3 text-center font-medium text-gray-500">{t('Действия', 'Amallar')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((d, idx) => (
                  <tr key={d.apartment_id} className={d.months_overdue >= 3 ? 'bg-red-50' : ''}>
                    <td className="px-4 py-3 text-gray-500">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{d.apartment_number}</td>
                    <td className="px-4 py-3 text-gray-700">{d.building_name}</td>
                    <td className="px-4 py-3 text-gray-700">{d.owner_name}</td>
                    <td className="px-4 py-3 text-gray-500">{d.owner_phone || '—'}</td>
                    <td className="px-4 py-3 text-right font-bold text-red-600">
                      {(d.total_debt || 0).toLocaleString()} {t('сум', "so'm")}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          d.months_overdue >= 3
                            ? 'bg-red-100 text-red-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {d.months_overdue}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{d.last_payment_date || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleReconciliation(d)}
                          title={t('Акт сверки', 'Solishtirma dalolatnoma')}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          <span className="hidden lg:inline">{t('Сверка', 'Solisht.')}</span>
                        </button>
                        <button
                          onClick={() => handlePretension(d)}
                          title={t('Претензия', "Da'vo")}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <AlertTriangle className="h-3.5 w-3.5" />
                          <span className="hidden lg:inline">{t('Претензия', "Da'vo")}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
