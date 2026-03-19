import { useEffect, useState, useMemo, useCallback } from 'react';
import { useFinanceStore } from '../../stores/financeStore';
import { useBuildingStore } from '../../stores/buildingStore';
import { useLanguageStore } from '../../stores/languageStore';
import { Modal, EmptyState } from '../../components/common';
import { PageSkeleton } from '../../components/PageSkeleton';
import {
  FileSpreadsheet,
  Plus,
  Trash2,
  ChevronRight,
  Building2,
  Calendar,
  Filter,
  Zap,
  CheckCircle2,
  Eye,
  AlertTriangle,
} from 'lucide-react';

interface EstimateItem {
  name: string;
  category: string;
  amount: number;
}

const CATEGORIES = ['maintenance', 'utilities', 'salary', 'other'] as const;

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-emerald-100 text-emerald-700',
  archived: 'bg-slate-100 text-slate-600',
};

function formatAmount(n: number | unknown): string {
  const num = typeof n === 'number' ? n : Number(n) || 0;
  return num.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function EstimatesPage() {
  const language = useLanguageStore((s) => s.language);
  const t = (ru: string, uz: string) => (language === 'ru' ? ru : uz);

  const estimates = useFinanceStore((s) => s.estimates);
  const estimatesLoading = useFinanceStore((s) => s.estimatesLoading);
  const currentEstimate = useFinanceStore((s) => s.currentEstimate);
  const fetchEstimates = useFinanceStore((s) => s.fetchEstimates);
  const fetchEstimate = useFinanceStore((s) => s.fetchEstimate);
  const createEstimate = useFinanceStore((s) => s.createEstimate);
  const activateEstimate = useFinanceStore((s) => s.activateEstimate);
  const generateCharges = useFinanceStore((s) => s.generateCharges);
  const setFilters = useFinanceStore((s) => s.setFilters);

  const buildings = useBuildingStore((s) => s.buildings);
  const fetchBuildings = useBuildingStore((s) => s.fetchBuildings);

  const [loadError, setLoadError] = useState(false);

  // Filters
  const [filterBuilding, setFilterBuilding] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Create form state
  const [formBuilding, setFormBuilding] = useState('');
  const [formPeriod, setFormPeriod] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formItems, setFormItems] = useState<EstimateItem[]>([
    { name: '', category: 'maintenance', amount: 0 },
  ]);
  const [formProfitPct, setFormProfitPct] = useState(10);
  const [formNcCoeff, setFormNcCoeff] = useState(1.5);
  const [formShowProfit, setFormShowProfit] = useState(false);
  const [formShowDebtor, setFormShowDebtor] = useState(false);

  // Load data on mount
  useEffect(() => {
    const load = async () => {
      try {
        setLoadError(false);
        await Promise.all([fetchBuildings(), fetchEstimates()]);
      } catch {
        setLoadError(true);
      }
    };
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch when filters change
  useEffect(() => {
    const load = async () => {
      try {
        setLoadError(false);
        setFilters({ buildingId: filterBuilding, status: filterStatus });
        await fetchEstimates();
      } catch {
        setLoadError(true);
      }
    };
    load();
  }, [filterBuilding, filterStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const formTotal = useMemo(
    () => formItems.reduce((sum, it) => sum + (Number(it.amount) || 0), 0),
    [formItems],
  );

  const buildingMap = useMemo(() => {
    const m: Record<string, string> = {};
    buildings.forEach((b) => {
      m[b.id as string] = (b.name as string) || (b.address as string) || '';
    });
    return m;
  }, [buildings]);

  const categoryLabel = useCallback(
    (cat: string) => {
      const map: Record<string, [string, string]> = {
        maintenance: ['Обслуживание', 'Xizmat ko\'rsatish'],
        utilities: ['Коммуналка', 'Kommunal'],
        salary: ['Зарплата', 'Ish haqi'],
        other: ['Прочее', 'Boshqa'],
      };
      const pair = map[cat];
      return pair ? t(pair[0], pair[1]) : cat;
    },
    [language], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const statusLabel = useCallback(
    (status: string) => {
      const map: Record<string, [string, string]> = {
        draft: ['Черновик', 'Qoralama'],
        active: ['Активна', 'Faol'],
        archived: ['Архив', 'Arxiv'],
      };
      const pair = map[status];
      return pair ? t(pair[0], pair[1]) : status;
    },
    [language], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // --- Item handlers ---
  const updateItem = (idx: number, field: keyof EstimateItem, value: string | number) => {
    setFormItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)),
    );
  };

  const removeItem = (idx: number) => {
    setFormItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const addItem = () => {
    setFormItems((prev) => [...prev, { name: '', category: 'maintenance', amount: 0 }]);
  };

  // --- Create ---
  const resetForm = () => {
    setFormBuilding('');
    setFormPeriod('');
    setFormTitle('');
    setFormItems([{ name: '', category: 'maintenance', amount: 0 }]);
    setFormProfitPct(10);
    setFormNcCoeff(1.5);
    setFormShowProfit(false);
    setFormShowDebtor(false);
  };

  const handleCreate = async () => {
    if (!formBuilding || !formPeriod || formItems.length === 0) return;
    setSaving(true);
    const ok = await createEstimate({
      building_id: formBuilding,
      period: formPeriod,
      title: formTitle || undefined,
      items: formItems.filter((it) => it.name && it.amount > 0).map((it) => ({
        name: it.name,
        category: it.category,
        amount: Number(it.amount),
      })),
      uk_profit_percent: formProfitPct,
      non_commercial_coefficient: formNcCoeff,
      show_profit_to_residents: formShowProfit ? 1 : 0,
    } as Parameters<typeof createEstimate>[0]);
    setSaving(false);
    if (ok) {
      setShowCreate(false);
      resetForm();
    }
  };

  // --- Detail ---
  const openDetail = async (id: string) => {
    await fetchEstimate(id);
    setShowDetail(true);
  };

  const handleActivate = async () => {
    if (!currentEstimate) return;
    setActivating(true);
    const ok = await activateEstimate(currentEstimate.id as string);
    setActivating(false);
    if (ok) {
      await fetchEstimate(currentEstimate.id as string);
      const msg = language === 'ru'
        ? 'Смета активирована. Сформировать начисления на все квартиры?'
        : 'Smeta faollashtirildi. Barcha xonadonlar uchun hisob-kitoblar yaratilsinmi?';
      if (window.confirm(msg)) {
        setGenerating(true);
        await generateCharges(currentEstimate.id as string);
        setGenerating(false);
      }
    }
  };

  const handleGenerate = async () => {
    if (!currentEstimate) return;
    setGenerating(true);
    await generateCharges(currentEstimate.id as string);
    setGenerating(false);
  };

  // --- Render ---

  if (estimatesLoading && estimates.length === 0) {
    return <PageSkeleton variant="list" />;
  }

  const detailItems = (currentEstimate?.items as Record<string, unknown>[] | undefined) || [];
  const detailStatus = (currentEstimate?.status as string) || '';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t('Сметы', 'Smetalar')}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('Управление финансовыми сметами зданий', 'Binolar moliyaviy smetalarini boshqarish')}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium text-sm shadow-sm"
        >
          <Plus className="w-4 h-4" />
          {t('Создать смету', 'Smeta yaratish')}
        </button>
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
          className="flex-1 min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
        >
          <option value="">{t('Все здания', 'Barcha binolar')}</option>
          {buildings.map((b) => (
            <option key={b.id as string} value={b.id as string}>
              {(b.name as string) || (b.address as string)}
            </option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="sm:w-48 rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
        >
          <option value="">{t('Все статусы', 'Barcha statuslar')}</option>
          <option value="draft">{t('Черновик', 'Qoralama')}</option>
          <option value="active">{t('Активна', 'Faol')}</option>
          <option value="archived">{t('Архив', 'Arxiv')}</option>
        </select>
      </div>

      {/* List */}
      {loadError && estimates.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle className="w-12 h-12" />}
          title={t('Ошибка загрузки', 'Yuklashda xatolik')}
          description={t('Попробуйте обновить страницу', 'Sahifani yangilang')}
        />
      ) : estimates.length === 0 ? (
        <EmptyState
          icon={<FileSpreadsheet className="w-12 h-12" />}
          title={t('Нет смет', 'Smetalar yo\'q')}
          description={t(
            'Создайте первую смету для начала работы с финансами',
            'Moliyaviy ish boshlash uchun birinchi smetani yarating',
          )}
          action={{
            label: t('Создать смету', 'Smeta yaratish'),
            onClick: () => setShowCreate(true),
          }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {estimates.map((est) => {
            const id = est.id as string;
            const status = (est.status as string) || 'draft';
            const bName = buildingMap[est.building_id as string] || '';
            return (
              <button
                key={id}
                onClick={() => openDetail(id)}
                className="bg-white/60 backdrop-blur-xl rounded-xl border border-gray-100 shadow-sm p-5 text-left hover:shadow-md transition-shadow group"
              >
                <div className="flex items-start justify-between mb-3">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status] || STATUS_STYLES.draft}`}
                  >
                    {statusLabel(status)}
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors" />
                </div>
                {(est.title as string) && (
                  <h3 className="font-semibold text-gray-900 mb-1 truncate">
                    {est.title as string}
                  </h3>
                )}
                <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-1">
                  <Building2 className="w-3.5 h-3.5" />
                  <span className="truncate">{bName || t('Здание', 'Bino')}</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-3">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{(est.period as string) || '-'}</span>
                </div>
                <div className="text-lg font-bold text-gray-900">
                  {formatAmount(est.total_amount)} {t('сум', 'so\'m')}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ─── Create Modal ─── */}
      <Modal
        isOpen={showCreate}
        onClose={() => {
          setShowCreate(false);
          resetForm();
        }}
        title={t('Новая смета', 'Yangi smeta')}
        size="2xl"
      >
        <div className="space-y-5">
          {/* Building + Period */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('Здание', 'Bino')} *
              </label>
              <select
                value={formBuilding}
                onChange={(e) => setFormBuilding(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              >
                <option value="">{t('Выберите здание', 'Binoni tanlang')}</option>
                {buildings.map((b) => (
                  <option key={b.id as string} value={b.id as string}>
                    {(b.name as string) || (b.address as string)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('Период', 'Davr')} *
              </label>
              <input
                type="month"
                value={formPeriod}
                onChange={(e) => setFormPeriod(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('Название', 'Nomi')}
            </label>
            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder={t('Например: Смета на март 2026', 'Masalan: 2026 mart smetasi')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>

          {/* Items */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('Статьи расходов', 'Xarajat bandlari')} *
            </label>
            <div className="space-y-2">
              {formItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => updateItem(idx, 'name', e.target.value)}
                    placeholder={t('Название', 'Nomi')}
                    className="flex-1 min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                  <select
                    value={item.category}
                    onChange={(e) => updateItem(idx, 'category', e.target.value)}
                    className="w-36 rounded-lg border border-gray-300 px-2 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {categoryLabel(cat)}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={item.amount || ''}
                    onChange={(e) => updateItem(idx, 'amount', Number(e.target.value))}
                    placeholder={t('Сумма', 'Summa')}
                    className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                  <button
                    onClick={() => removeItem(idx)}
                    disabled={formItems.length <= 1}
                    className="p-2 text-gray-400 hover:text-red-500 disabled:opacity-30 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={addItem}
              className="mt-2 inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              <Plus className="w-4 h-4" />
              {t('Добавить статью', 'Band qo\'shish')}
            </button>
          </div>

          {/* Coefficients */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('Прибыль УК, %', 'BX foydasi, %')}
              </label>
              <input
                type="number"
                value={formProfitPct}
                onChange={(e) => setFormProfitPct(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('Коэфф. нежилых', 'Noturar koeff.')}
              </label>
              <input
                type="number"
                step="0.1"
                value={formNcCoeff}
                onChange={(e) => setFormNcCoeff(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>
          </div>

          {/* Checkboxes */}
          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formShowProfit}
                onChange={(e) => setFormShowProfit(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">
                {t('Показывать прибыль жильцам', 'Foydani aholiga ko\'rsatish')}
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formShowDebtor}
                onChange={(e) => setFormShowDebtor(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">
                {t('Показывать статус должника жильцам', 'Qarzdorlik statusini aholiga ko\'rsatish')}
              </span>
            </label>
          </div>

          {/* Total + submit */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            <div className="text-sm text-gray-500">
              {t('Итого', 'Jami')}:{' '}
              <span className="text-lg font-bold text-gray-900">
                {formatAmount(formTotal)} {t('сум', 'so\'m')}
              </span>
            </div>
            <button
              onClick={handleCreate}
              disabled={saving || !formBuilding || !formPeriod || formItems.length === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm"
            >
              {saving ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <FileSpreadsheet className="w-4 h-4" />
              )}
              {t('Сохранить черновик', 'Qoralama saqlash')}
            </button>
          </div>
        </div>
      </Modal>

      {/* ─── Detail Modal ─── */}
      <Modal
        isOpen={showDetail}
        onClose={() => setShowDetail(false)}
        title={
          (currentEstimate?.title as string) ||
          `${t('Смета', 'Smeta')} ${(currentEstimate?.period as string) || ''}`
        }
        size="2xl"
      >
        {currentEstimate ? (
          <div className="space-y-5">
            {/* Meta */}
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[detailStatus] || STATUS_STYLES.draft}`}
              >
                {statusLabel(detailStatus)}
              </span>
              <span className="text-sm text-gray-500 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5" />
                {buildingMap[currentEstimate.building_id as string] || t('Здание', 'Bino')}
              </span>
              <span className="text-sm text-gray-500 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {(currentEstimate.period as string) || '-'}
              </span>
            </div>

            {/* Rates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-xs text-blue-600 font-medium mb-1">
                  {t('Ставка жилых (за м\u00B2)', 'Turar joy stavkasi (m\u00B2 uchun)')}
                </p>
                <p className="text-xl font-bold text-blue-900">
                  {formatAmount(currentEstimate.commercial_rate_per_sqm)} {t('сум', 'so\'m')}
                </p>
              </div>
              <div className="bg-amber-50 rounded-lg p-4">
                <p className="text-xs text-amber-600 font-medium mb-1">
                  {t('Ставка нежилых (за м\u00B2)', 'Noturar stavkasi (m\u00B2 uchun)')}
                </p>
                <p className="text-xl font-bold text-amber-900">
                  {formatAmount(currentEstimate.non_commercial_rate_per_sqm)} {t('сум', 'so\'m')}
                </p>
              </div>
            </div>

            {/* Items table */}
            {detailItems.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 font-medium text-gray-500">
                        {t('Статья', 'Band')}
                      </th>
                      <th className="text-left py-2 px-3 font-medium text-gray-500">
                        {t('Категория', 'Kategoriya')}
                      </th>
                      <th className="text-right py-2 px-3 font-medium text-gray-500">
                        {t('Сумма', 'Summa')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailItems.map((it, idx) => (
                      <tr key={idx} className="border-b border-gray-50">
                        <td className="py-2 px-3 text-gray-900">
                          {(it.name as string) || '-'}
                        </td>
                        <td className="py-2 px-3 text-gray-600">
                          {categoryLabel((it.category as string) || 'other')}
                        </td>
                        <td className="py-2 px-3 text-right font-medium text-gray-900">
                          {formatAmount(it.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-200">
                      <td colSpan={2} className="py-2 px-3 font-semibold text-gray-700">
                        {t('Итого', 'Jami')}
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-gray-900">
                        {formatAmount(currentEstimate.total_amount)} {t('сум', 'so\'m')}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-100">
              {detailStatus === 'draft' && (
                <button
                  onClick={handleActivate}
                  disabled={activating}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors font-medium text-sm"
                >
                  {activating ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  {t('Активировать', 'Faollashtirish')}
                </button>
              )}
              {detailStatus === 'active' && (
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium text-sm"
                >
                  {generating ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4" />
                  )}
                  {t('Сгенерировать начисления', 'Hisob-kitoblarni yaratish')}
                </button>
              )}
              {currentEstimate.show_profit_to_residents === 1 && (
                <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                  <Eye className="w-3.5 h-3.5" />
                  {t('Прибыль видна жильцам', 'Foyda aholiga ko\'rinadi')}
                </span>
              )}
            </div>
          </div>
        ) : (
          <PageSkeleton variant="detail" />
        )}
      </Modal>
    </div>
  );
}
