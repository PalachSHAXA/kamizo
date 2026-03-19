import { useEffect, useState, useMemo, useCallback } from 'react';
import { useFinanceStore } from '../../stores/financeStore';
import { useLanguageStore } from '../../stores/languageStore';
import { Modal, EmptyState } from '../../components/common';
import { PageSkeleton } from '../../components/PageSkeleton';
import {
  TrendingUp,
  Plus,
  Settings,
  Filter,
  DollarSign,
  Calendar,
  Tag,
  FileText,
  Layers,
  AlertTriangle,
} from 'lucide-react';

const SOURCE_TYPES = ['rental', 'parking', 'advertising', 'basement', 'custom'] as const;
type SourceType = (typeof SOURCE_TYPES)[number];

const SOURCE_LABELS: Record<SourceType, { ru: string; uz: string }> = {
  rental: { ru: 'Аренда', uz: 'Ijara' },
  parking: { ru: 'Парковка', uz: 'Parkovka' },
  advertising: { ru: 'Реклама', uz: 'Reklama' },
  basement: { ru: 'Подвал', uz: 'Podval' },
  custom: { ru: 'Другое', uz: 'Boshqa' },
};

const SOURCE_COLORS: Record<SourceType, string> = {
  rental: 'bg-primary-100 text-primary-700',
  parking: 'bg-primary-100 text-primary-700',
  advertising: 'bg-amber-100 text-amber-700',
  basement: 'bg-emerald-100 text-emerald-700',
  custom: 'bg-gray-100 text-gray-700',
};

function getCurrentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function IncomePage() {
  const language = useLanguageStore((s) => s.language);
  const t = (ru: string, uz: string) => (language === 'ru' ? ru : uz);

  const income = useFinanceStore((s) => s.income);
  const incomeCategories = useFinanceStore((s) => s.incomeCategories);
  const incomeLoading = useFinanceStore((s) => s.incomeLoading);
  const filters = useFinanceStore((s) => s.filters);
  const fetchIncome = useFinanceStore((s) => s.fetchIncome);
  const fetchIncomeCategories = useFinanceStore((s) => s.fetchIncomeCategories);
  const createIncome = useFinanceStore((s) => s.createIncome);
  const createIncomeCategory = useFinanceStore((s) => s.createIncomeCategory);
  const setFilters = useFinanceStore((s) => s.setFilters);

  // Local filter state (apply on button click)
  const [filterPeriod, setFilterPeriod] = useState(filters.period || getCurrentPeriod());
  const [filterCategory, setFilterCategory] = useState('');

  // Modals
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [catModalOpen, setCatModalOpen] = useState(false);

  // Add income form
  const [form, setForm] = useState({
    category_id: '',
    amount: '',
    period: getCurrentPeriod(),
    description: '',
    source_type: 'rental' as SourceType,
  });
  const [formLoading, setFormLoading] = useState(false);

  // Add category
  const [newCatName, setNewCatName] = useState('');
  const [catLoading, setCatLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setLoadError(false);
        await Promise.all([fetchIncomeCategories(), fetchIncome()]);
      } catch {
        setLoadError(true);
      }
    };
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApplyFilters = useCallback(() => {
    setFilters({ period: filterPeriod });
    // fetchIncome will use updated filters
    setTimeout(() => fetchIncome(), 0);
  }, [filterPeriod, setFilters, fetchIncome]);

  // Filter by category locally (backend filters by period, we filter category client-side)
  const filteredIncome = useMemo(() => {
    if (!filterCategory) return income as Record<string, unknown>[];
    return (income as Record<string, unknown>[]).filter(
      (item) => item.category_id === filterCategory
    );
  }, [income, filterCategory]);

  const totalIncome = useMemo(() => {
    return filteredIncome.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  }, [filteredIncome]);

  const handleCreateIncome = useCallback(async () => {
    if (!form.category_id || !form.amount || !form.period) return;
    setFormLoading(true);
    const ok = await createIncome({
      category_id: form.category_id,
      amount: Number(form.amount),
      period: form.period,
      description: form.description,
      source_type: form.source_type,
    });
    setFormLoading(false);
    if (ok) {
      setAddModalOpen(false);
      setForm({ category_id: '', amount: '', period: getCurrentPeriod(), description: '', source_type: 'rental' });
    }
  }, [form, createIncome]);

  const handleCreateCategory = useCallback(async () => {
    if (!newCatName.trim()) return;
    setCatLoading(true);
    const ok = await createIncomeCategory(newCatName.trim());
    setCatLoading(false);
    if (ok) setNewCatName('');
  }, [newCatName, createIncomeCategory]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatAmount = (amount: number) => {
    return Number(amount).toLocaleString('ru-RU') + ' ' + t('сум', 'so\'m');
  };

  if (incomeLoading && (income as unknown[]).length === 0) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t('Доходы УК', 'UK daromadlari')}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('Управление доходами компании', 'Kompaniya daromadlarini boshqarish')}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setCatModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white/60 backdrop-blur-xl rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <Settings className="w-4 h-4" />
            {t('Категории', 'Kategoriyalar')}
          </button>
          <button
            onClick={() => setAddModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            {t('Добавить доход', 'Daromad qo\'shish')}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white/60 backdrop-blur-xl rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-col sm:flex-row items-end gap-3">
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              <Calendar className="w-3.5 h-3.5 inline mr-1" />
              {t('Период', 'Davr')}
            </label>
            <input
              type="month"
              value={filterPeriod}
              onChange={(e) => setFilterPeriod(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            />
          </div>
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              <Tag className="w-3.5 h-3.5 inline mr-1" />
              {t('Категория', 'Kategoriya')}
            </label>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            >
              <option value="">{t('Все категории', 'Barcha kategoriyalar')}</option>
              {(incomeCategories as { id: string; name: string }[]).map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleApplyFilters}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <Filter className="w-4 h-4" />
            {t('Применить', 'Qo\'llash')}
          </button>
        </div>
      </div>

      {/* Summary Card */}
      <div className="bg-white/60 backdrop-blur-xl rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
            <DollarSign className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">
              {t('Общий доход за период', 'Davr uchun umumiy daromad')}
            </p>
            <p className="text-2xl font-bold text-gray-900">{formatAmount(totalIncome)}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-gray-400">{t('Записей', 'Yozuvlar')}</p>
            <p className="text-lg font-semibold text-gray-700">{filteredIncome.length}</p>
          </div>
        </div>
      </div>

      {/* Table or Empty */}
      {loadError && (income as unknown[]).length === 0 ? (
        <EmptyState
          icon={<AlertTriangle className="w-12 h-12" />}
          title={t('Ошибка загрузки', 'Yuklashda xatolik')}
          description={t('Попробуйте обновить страницу', 'Sahifani yangilang')}
        />
      ) : filteredIncome.length === 0 ? (
        <EmptyState
          icon={<TrendingUp className="w-12 h-12" />}
          title={t('Нет записей о доходах', 'Daromad yozuvlari yo\'q')}
          description={t(
            'Добавьте первый доход, чтобы начать отслеживание',
            'Kuzatishni boshlash uchun birinchi daromadni qo\'shing'
          )}
        />
      ) : (
        <div className="bg-white/60 backdrop-blur-xl rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-4 py-3 font-medium text-gray-500">
                    {t('Дата', 'Sana')}
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">
                    {t('Категория', 'Kategoriya')}
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">
                    {t('Сумма', 'Summa')}
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">
                    {t('Описание', 'Tavsif')}
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">
                    {t('Тип', 'Turi')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredIncome.map((item) => {
                  const sourceType = (item.source_type as SourceType) || 'custom';
                  const colorClass = SOURCE_COLORS[sourceType] || SOURCE_COLORS.custom;
                  const label = SOURCE_LABELS[sourceType] || SOURCE_LABELS.custom;
                  return (
                    <tr key={item.id as string} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {formatDate(item.created_at as string)}
                      </td>
                      <td className="px-4 py-3 text-gray-900 font-medium">
                        {(item.category_name as string) || '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-600 whitespace-nowrap">
                        {formatAmount(Number(item.amount))}
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">
                        {(item.description as string) || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass}`}
                        >
                          {t(label.ru, label.uz)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Income Modal */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title={t('Добавить доход', 'Daromad qo\'shish')}
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Tag className="w-3.5 h-3.5 inline mr-1" />
              {t('Категория', 'Kategoriya')} *
            </label>
            <select
              value={form.category_id}
              onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
              className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            >
              <option value="">{t('Выберите категорию', 'Kategoriyani tanlang')}</option>
              {(incomeCategories as { id: string; name: string }[]).map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <DollarSign className="w-3.5 h-3.5 inline mr-1" />
              {t('Сумма', 'Summa')} *
            </label>
            <input
              type="number"
              min="0"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder={t('Введите сумму', 'Summani kiriting')}
              className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Calendar className="w-3.5 h-3.5 inline mr-1" />
              {t('Период', 'Davr')} *
            </label>
            <input
              type="month"
              value={form.period}
              onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))}
              className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <FileText className="w-3.5 h-3.5 inline mr-1" />
              {t('Описание', 'Tavsif')}
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              placeholder={t('Описание дохода...', 'Daromad tavsifi...')}
              className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Layers className="w-3.5 h-3.5 inline mr-1" />
              {t('Тип источника', 'Manba turi')}
            </label>
            <select
              value={form.source_type}
              onChange={(e) => setForm((f) => ({ ...f, source_type: e.target.value as SourceType }))}
              className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            >
              {SOURCE_TYPES.map((st) => (
                <option key={st} value={st}>
                  {t(SOURCE_LABELS[st].ru, SOURCE_LABELS[st].uz)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setAddModalOpen(false)}
              className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              {t('Отмена', 'Bekor qilish')}
            </button>
            <button
              onClick={handleCreateIncome}
              disabled={formLoading || !form.category_id || !form.amount || !form.period}
              className="px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {formLoading ? t('Сохранение...', 'Saqlanmoqda...') : t('Сохранить', 'Saqlash')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Manage Categories Modal */}
      <Modal
        isOpen={catModalOpen}
        onClose={() => setCatModalOpen(false)}
        title={t('Управление категориями', 'Kategoriyalarni boshqarish')}
        size="md"
      >
        <div className="space-y-4">
          {/* Existing categories */}
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {(incomeCategories as { id: string; name: string; is_default?: boolean | number; is_active?: boolean | number }[]).length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">
                {t('Нет категорий', 'Kategoriyalar yo\'q')}
              </p>
            ) : (
              (incomeCategories as { id: string; name: string; is_default?: boolean | number; is_active?: boolean | number }[]).map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-100"
                >
                  <span className="text-sm text-gray-800 font-medium">{cat.name}</span>
                  <div className="flex items-center gap-2">
                    {(cat.is_default === true || cat.is_default === 1) && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-700">
                        {t('По умолчанию', 'Standart')}
                      </span>
                    )}
                    {(cat.is_active === false || cat.is_active === 0) && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-500">
                        {t('Неактивна', 'Nofaol')}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Add new category */}
          <div className="border-t border-gray-100 pt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('Новая категория', 'Yangi kategoriya')}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder={t('Название категории', 'Kategoriya nomi')}
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateCategory()}
              />
              <button
                onClick={handleCreateCategory}
                disabled={catLoading || !newCatName.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {catLoading ? '...' : t('Добавить', 'Qo\'shish')}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
