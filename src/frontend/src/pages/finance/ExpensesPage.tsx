import { useState, useEffect, useCallback, useMemo } from 'react';
import { TrendingDown, Plus, Filter, FileText } from 'lucide-react';
import { useBuildingStore } from '../../stores/buildingStore';
import { useLanguageStore } from '../../stores/languageStore';
import { useAuthStore } from '../../stores/authStore';
import { apiRequest } from '../../services/api';
import { Modal, EmptyState } from '../../components/common';
import { PageSkeleton } from '../../components/PageSkeleton';
import { formatAmount } from '../../utils/formatCurrency';

interface ExpenseRow {
  id: string;
  building_id?: string;
  estimate_item_name?: string;
  amount: number;
  expense_date: string;
  description?: string;
  document_url?: string;
  request_id?: string;
  created_by_name?: string;
  created_at: string;
}

interface SummaryRow {
  name: string;
  plan_monthly: number;
  plan_yearly: number;
  fact: number;
  difference: number;
}

export default function ExpensesPage() {
  const language = useLanguageStore((s) => s.language);
  const t = useCallback((ru: string, uz: string) => (language === 'ru' ? ru : uz), [language]);
  const user = useAuthStore((s) => s.user);

  const buildings = useBuildingStore((s) => s.buildings);
  const fetchBuildings = useBuildingStore((s) => s.fetchBuildings);

  const isResident = user?.role === 'resident' || user?.role === 'tenant';
  const isManager = user?.role === 'manager' || user?.role === 'admin' || user?.role === 'director';

  // State
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [estimateId, setEstimateId] = useState<string | null>(null);

  // Filters
  const [filterBuilding, setFilterBuilding] = useState('');
  const [filterPeriod, setFilterPeriod] = useState(() => new Date().toISOString().slice(0, 7));

  // Add modal
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addForm, setAddForm] = useState({
    estimate_item_name: '',
    amount: '',
    expense_date: new Date().toISOString().slice(0, 10),
    description: '',
    request_id: '',
  });

  // Available expense articles from summary (plan items)
  const articleNames = useMemo(() => summary.map((s) => s.name), [summary]);

  // Load
  useEffect(() => {
    fetchBuildings();
  }, [fetchBuildings]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterBuilding) params.set('building_id', filterBuilding);
      if (filterPeriod) params.set('period', filterPeriod);
      const query = params.toString();

      const [expRes, sumRes] = await Promise.all([
        apiRequest<{ expenses: ExpenseRow[] }>(`/api/finance/expenses${query ? '?' + query : ''}`),
        apiRequest<{ summary: SummaryRow[]; estimate_id: string | null; enterprise_profit_percent: number }>(
          `/api/finance/expenses/summary${query ? '?' + query : ''}`
        ),
      ]);

      setExpenses(expRes.expenses || []);
      setSummary(sumRes.summary || []);
      setEstimateId(sumRes.estimate_id);
    } catch {
      setExpenses([]);
      setSummary([]);
    } finally {
      setLoading(false);
    }
  }, [filterBuilding, filterPeriod]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // For residents: filter out enterprise profit
  const visibleSummary = useMemo(() => {
    if (!isResident) return summary;
    return summary.filter(
      (s) =>
        !s.name.toLowerCase().includes('доход предприятия') &&
        !s.name.toLowerCase().includes('korxona daromadi')
    );
  }, [summary, isResident]);

  const totalPlan = useMemo(() => visibleSummary.reduce((s, r) => s + r.plan_yearly, 0), [visibleSummary]);
  const totalFact = useMemo(() => visibleSummary.reduce((s, r) => s + r.fact, 0), [visibleSummary]);

  // Submit
  const handleAdd = async () => {
    if (!addForm.amount || !addForm.expense_date) return;
    setSaving(true);
    try {
      await apiRequest('/api/finance/expenses', {
        method: 'POST',
        body: JSON.stringify({
          building_id: filterBuilding || null,
          estimate_id: estimateId,
          estimate_item_name: addForm.estimate_item_name || null,
          amount: Number(addForm.amount),
          expense_date: addForm.expense_date,
          description: addForm.description || null,
          request_id: addForm.request_id || null,
        }),
      });
      setShowAdd(false);
      setAddForm({ estimate_item_name: '', amount: '', expense_date: new Date().toISOString().slice(0, 10), description: '', request_id: '' });
      fetchData();
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadge = (diff: number) => {
    if (diff < 0)
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">{t('Перерасход', 'Ortiqcha')}</span>;
    if (diff === 0)
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">{t('В бюджете', 'Byudjetda')}</span>;
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">{t('Остаток', 'Qoldiq')}</span>;
  };

  if (loading && expenses.length === 0 && summary.length === 0) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <div className="space-y-6 pb-24 md:pb-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <TrendingDown className="w-6 h-6 text-primary-500" />
            {isResident ? t('На что потрачены ваши взносы', "Badallarga nima sarflandi") : t('Расходы', 'Xarajatlar')}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {isResident
              ? t('Расходы управляющей компании по вашему дому', 'Boshqaruv kompaniyasi xarajatlari')
              : t('План vs факт по статьям сметы', "Smeta bo'yicha reja va haqiqiy xarajatlar")}
          </p>
        </div>
        {isManager && (
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-500 text-white rounded-xl hover:bg-primary-600 transition-colors font-medium text-sm shadow-sm"
          >
            <Plus className="w-4 h-4" />
            {t('Добавить расход', 'Xarajat qo\'shish')}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white/60 backdrop-blur-xl rounded-xl border border-gray-100 shadow-sm p-4 flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 text-gray-500">
          <Filter className="w-4 h-4" />
          <span className="text-sm font-medium">{t('Фильтры', 'Filtrlar')}</span>
        </div>
        <select
          value={filterBuilding}
          onChange={(e) => setFilterBuilding(e.target.value)}
          className="flex-1 min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
        >
          <option value="">{t('Все комплексы', 'Barcha komplekslar')}</option>
          {buildings.map((b) => (
            <option key={b.id as string} value={b.id as string}>
              {(b.name as string) || (b.address as string)}
            </option>
          ))}
        </select>
        <input
          type="month"
          value={filterPeriod}
          onChange={(e) => setFilterPeriod(e.target.value)}
          className="sm:w-48 rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
        />
      </div>

      {/* Summary table — plan vs fact */}
      {visibleSummary.length > 0 ? (
        <div className="bg-white/60 backdrop-blur-xl rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">{t('Статья', 'Band')}</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">{t('План (год)', 'Reja (yil)')}</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">{t('Факт', 'Haqiqiy')}</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">{t('Разница', 'Farq')}</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">{t('Статус', 'Status')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleSummary.map((row, idx) => (
                  <tr key={idx} className={`border-b border-gray-50 ${row.difference < 0 ? 'bg-red-50/50' : ''}`}>
                    <td className="px-4 py-3 font-medium text-gray-900">{row.name}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatAmount(row.plan_yearly)} {t('сум', "so'm")}</td>
                    <td className="px-4 py-3 text-right text-gray-900 font-medium">{formatAmount(row.fact)} {t('сум', "so'm")}</td>
                    <td className={`px-4 py-3 text-right font-medium ${row.difference < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {row.difference < 0 ? '' : '+'}{formatAmount(row.difference)} {t('сум', "so'm")}
                    </td>
                    <td className="px-4 py-3 text-center">{getStatusBadge(row.difference)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td className="px-4 py-3 font-bold text-gray-900">{t('Итого', 'Jami')}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">{formatAmount(totalPlan)}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">{formatAmount(totalFact)}</td>
                  <td className={`px-4 py-3 text-right font-bold ${(totalPlan - totalFact) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {(totalPlan - totalFact) < 0 ? '' : '+'}{formatAmount(totalPlan - totalFact)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState
          icon={<TrendingDown className="w-12 h-12" />}
          title={t('Нет данных', "Ma'lumot yo'q")}
          description={t('Выберите комплекс и период для просмотра расходов', 'Xarajatlarni ko\'rish uchun kompleks va davrni tanlang')}
        />
      )}

      {/* Recent expenses list */}
      {expenses.length > 0 && (
        <div className="bg-white/60 backdrop-blur-xl rounded-xl border border-gray-100 shadow-sm">
          <div className="p-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">{t('Последние расходы', 'So\'nggi xarajatlar')}</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {expenses.slice(0, 20).map((exp) => (
              <div key={exp.id} className="px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                  <TrendingDown className="w-4 h-4 text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 text-sm truncate">
                      {exp.estimate_item_name || exp.description || t('Расход', 'Xarajat')}
                    </span>
                    {exp.request_id && (
                      <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                        <FileText className="w-3 h-3 inline" /> {t('Заявка', 'Ariza')}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {exp.expense_date} {exp.created_by_name && `• ${exp.created_by_name}`}
                  </div>
                </div>
                <span className="font-bold text-red-600 text-sm whitespace-nowrap">
                  -{formatAmount(exp.amount)} {t('сум', "so'm")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add expense modal */}
      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title={t('Добавить расход', 'Xarajat qo\'shish')} size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('Статья расхода', 'Xarajat bandi')}</label>
            <select
              value={addForm.estimate_item_name}
              onChange={(e) => setAddForm((p) => ({ ...p, estimate_item_name: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            >
              <option value="">{t('Выберите статью', 'Bandni tanlang')}</option>
              {articleNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
              <option value="__other">{t('Другое (указать вручную)', 'Boshqa (qo\'lda kiritish)')}</option>
            </select>
          </div>

          {addForm.estimate_item_name === '__other' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('Название', 'Nomi')}</label>
              <input
                type="text"
                value=""
                onChange={(e) => setAddForm((p) => ({ ...p, estimate_item_name: e.target.value }))}
                placeholder={t('Введите название статьи', 'Band nomini kiriting')}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('Сумма', 'Summa')} *</label>
              <input
                type="number"
                min="0"
                value={addForm.amount}
                onChange={(e) => setAddForm((p) => ({ ...p, amount: e.target.value }))}
                placeholder={t('сум', "so'm")}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('Дата', 'Sana')} *</label>
              <input
                type="date"
                value={addForm.expense_date}
                onChange={(e) => setAddForm((p) => ({ ...p, expense_date: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('Описание', 'Tavsif')}</label>
            <textarea
              value={addForm.description}
              onChange={(e) => setAddForm((p) => ({ ...p, description: e.target.value }))}
              rows={2}
              placeholder={t('Описание расхода', 'Xarajat tavsifi')}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('Связанная заявка (ID)', 'Bog\'liq ariza (ID)')}</label>
            <input
              type="text"
              value={addForm.request_id}
              onChange={(e) => setAddForm((p) => ({ ...p, request_id: e.target.value }))}
              placeholder={t('Необязательно', 'Ixtiyoriy')}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            />
          </div>

          <button
            onClick={handleAdd}
            disabled={saving || !addForm.amount || !addForm.expense_date}
            className="w-full px-4 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? t('Сохранение...', 'Saqlanmoqda...') : t('Сохранить', 'Saqlash')}
          </button>
        </div>
      </Modal>
    </div>
  );
}
