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
  Banknote,
} from 'lucide-react';
import { formatAmount } from '../../utils/formatCurrency';
import { generateEstimateExcel } from '../../utils/generateEstimateExcel';

// ── Default expense articles (real УК template) ──
const DEFAULT_EXPENSE_ARTICLES: Array<{ name_ru: string; name_uz: string }> = [
  { name_ru: 'Хозяйственные товары', name_uz: 'Xo\'jalik mollari' },
  { name_ru: 'Спецодежда с вышивкой', name_uz: 'Tikilgan maxsus kiyim' },
  { name_ru: 'Канцелярские принадлежности', name_uz: 'Ish yuritish buyumlari' },
  { name_ru: 'Принадлежности для электрика и сантехника', name_uz: 'Elektrik va santexnik uchun buyumlar' },
  { name_ru: 'Закупка офисной мебели', name_uz: 'Ofis mebelini sotib olish' },
  { name_ru: 'Закупка мебели для охранной будки', name_uz: 'Qo\'riqchi budkasi uchun mebel' },
  { name_ru: 'Закупка оргтехники', name_uz: 'Orgtexnika sotib olish' },
  { name_ru: 'Обслуживание лифта и домофона', name_uz: 'Lift va domofon xizmati' },
  { name_ru: 'Общие коммунальные и профил. расходы', name_uz: 'Umumiy kommunal va profilaktika xarajatlari' },
  { name_ru: 'Прочие расходы', name_uz: 'Boshqa xarajatlar' },
  { name_ru: 'Расходы по зарплате', name_uz: 'Ish haqi xarajatlari' },
  { name_ru: 'Расходы садовника', name_uz: 'Bog\'bon xarajatlari' },
];

interface ExpenseItem {
  name: string;
  monthly_amount: number;
  amount: number; // yearly = monthly * 12
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-emerald-100 text-emerald-700',
  archived: 'bg-slate-100 text-slate-600',
};

export default function EstimatesPage() {
  const language = useLanguageStore((s) => s.language);
  const t = useCallback((ru: string, uz: string) => (language === 'ru' ? ru : uz), [language]);

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
  const [formEffectiveDate, setFormEffectiveDate] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formItems, setFormItems] = useState<ExpenseItem[]>(() =>
    DEFAULT_EXPENSE_ARTICLES.map((a) => ({
      name: language === 'ru' ? a.name_ru : a.name_uz,
      monthly_amount: 0,
      amount: 0,
    }))
  );
  const [formProfitPct, setFormProfitPct] = useState(9);
  const [formCommercialRate, setFormCommercialRate] = useState(0);
  const [formBasementRate, setFormBasementRate] = useState(0);
  const [formParkingRate, setFormParkingRate] = useState(0);
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

  // Calculations
  const formTotalYearly = useMemo(
    () => formItems.reduce((sum, it) => sum + (Number(it.amount) || 0), 0),
    [formItems],
  );

  const formTotalMonthly = useMemo(
    () => formItems.reduce((sum, it) => sum + (Number(it.monthly_amount) || 0), 0),
    [formItems],
  );

  const formEnterpiseIncome = useMemo(
    () => Math.round(formTotalYearly * (formProfitPct / 100)),
    [formTotalYearly, formProfitPct],
  );

  const formGrandTotal = useMemo(
    () => formTotalYearly + formEnterpiseIncome,
    [formTotalYearly, formEnterpiseIncome],
  );

  // Get building info for selected complex
  const selectedBuilding = useMemo(
    () => buildings.find((b) => (b.id as string) === formBuilding),
    [buildings, formBuilding],
  );

  // Estimate total area from building data (if available)
  const totalArea = useMemo(() => {
    if (!selectedBuilding) return 0;
    return Number((selectedBuilding as Record<string, unknown>).total_area) || 0;
  }, [selectedBuilding]);

  const costPerSqm = useMemo(
    () => (totalArea > 0 ? Math.round(formGrandTotal / totalArea) : 0),
    [formGrandTotal, totalArea],
  );

  const buildingMap = useMemo(() => {
    const m: Record<string, string> = {};
    buildings.forEach((b) => {
      m[b.id as string] = (b.name as string) || (b.address as string) || '';
    });
    return m;
  }, [buildings]);

  const statusLabel = useCallback(
    (status: string) => {
      const map: Record<string, [string, string]> = {
        draft: ['Черновик', 'Qoralama'],
        active: ['Действующая', 'Amalda'],
        archived: ['Архив', 'Arxiv'],
      };
      const pair = map[status];
      return pair ? t(pair[0], pair[1]) : status;
    },
    [t],
  );

  // --- Item handlers ---
  const updateItem = (idx: number, field: keyof ExpenseItem, value: string | number) => {
    setFormItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const updated = { ...it, [field]: value };
        // Auto-calc yearly from monthly
        if (field === 'monthly_amount') {
          updated.amount = Math.round(Number(value) * 12);
        }
        return updated;
      }),
    );
  };

  const removeItem = (idx: number) => {
    setFormItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const addItem = () => {
    setFormItems((prev) => [...prev, { name: '', monthly_amount: 0, amount: 0 }]);
  };

  // --- Create ---
  const resetForm = () => {
    setFormBuilding('');
    setFormEffectiveDate('');
    setFormTitle('');
    setFormItems(
      DEFAULT_EXPENSE_ARTICLES.map((a) => ({
        name: language === 'ru' ? a.name_ru : a.name_uz,
        monthly_amount: 0,
        amount: 0,
      }))
    );
    setFormProfitPct(9);
    setFormCommercialRate(0);
    setFormBasementRate(0);
    setFormParkingRate(0);
    setFormShowProfit(false);
    setFormShowDebtor(false);
  };

  const handleCreate = async () => {
    if (!formBuilding || formItems.length === 0) return;
    setSaving(true);
    const validItems = formItems.filter((it) => it.name && (it.amount > 0 || it.monthly_amount > 0));
    const ok = await createEstimate({
      building_id: formBuilding,
      period: formEffectiveDate ? formEffectiveDate.slice(0, 7) : new Date().toISOString().slice(0, 7),
      effective_date: formEffectiveDate || undefined,
      title: formTitle || undefined,
      items: validItems.map((it) => ({
        name: it.name,
        category: 'maintenance',
        amount: Number(it.amount),
        monthly_amount: Number(it.monthly_amount),
      })),
      uk_profit_percent: formProfitPct,
      enterprise_profit_percent: formProfitPct,
      non_commercial_coefficient: 1.5,
      show_profit_to_residents: formShowProfit ? 1 : 0,
      commercial_rate: formCommercialRate,
      basement_rate: formBasementRate,
      parking_rate: formParkingRate,
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
        ? 'Смета утверждена. Сформировать начисления на все квартиры?'
        : 'Smeta tasdiqlandi. Barcha xonadonlar uchun hisob-kitoblar yaratilsinmi?';
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
            {t('Управление финансовыми сметами комплексов', 'Komplekslar moliyaviy smetalarini boshqarish')}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-500 text-white rounded-xl hover:bg-primary-600 transition-colors font-medium text-sm shadow-sm"
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
          className="flex-1 min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
        >
          <option value="">{t('Все комплексы', 'Barcha komplekslar')}</option>
          {buildings.map((b) => (
            <option key={b.id as string} value={b.id as string}>
              {(b.name as string) || (b.address as string)}
            </option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="sm:w-48 rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
        >
          <option value="">{t('Все статусы', 'Barcha statuslar')}</option>
          <option value="draft">{t('Черновик', 'Qoralama')}</option>
          <option value="active">{t('Действующая', 'Amalda')}</option>
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
            const effectiveDate = est.effective_date as string | undefined;
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
                  <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-primary-500 transition-colors" />
                </div>
                {(est.title as string) && (
                  <h3 className="font-semibold text-gray-900 mb-1 truncate">
                    {est.title as string}
                  </h3>
                )}
                <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-1">
                  <Building2 className="w-3.5 h-3.5" />
                  <span className="truncate">{bName || t('Комплекс', 'Kompleks')}</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-3">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>
                    {effectiveDate
                      ? `${t('с', 'dan')} ${effectiveDate}`
                      : (est.period as string) || '-'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Banknote className="w-4 h-4 text-primary-500" />
                  <span className="text-lg font-bold text-gray-900">
                    {formatAmount(est.total_amount)} {t('сум', "so'm")}
                  </span>
                </div>
                {Number(est.commercial_rate_per_sqm) > 0 && (
                  <div className="text-xs text-gray-400 mt-1">
                    1 {t('кв.м', 'kv.m')} = {formatAmount(est.commercial_rate_per_sqm)} {t('сум', "so'm")}
                  </div>
                )}
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
        <div className="space-y-5 max-h-[75dvh] overflow-y-auto pr-1">
          {/* 1. Building + Effective Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('Комплекс', 'Kompleks')} *
              </label>
              <select
                value={formBuilding}
                onChange={(e) => setFormBuilding(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              >
                <option value="">{t('Выберите комплекс', 'Kompleksni tanlang')}</option>
                {buildings.map((b) => (
                  <option key={b.id as string} value={b.id as string}>
                    {(b.name as string) || (b.address as string)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('Вступает в силу с', 'Kuchga kirish sanasi')} *
              </label>
              <input
                type="date"
                value={formEffectiveDate}
                onChange={(e) => setFormEffectiveDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              />
            </div>
          </div>

          {/* 2. Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('Название', 'Nomi')}
            </label>
            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder={t('Например: Смета на 2026 год', 'Masalan: 2026 yil smetasi')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            />
          </div>

          {/* 3. Expense articles table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                {t('Б) Расходы', 'B) Xarajatlar')}
              </label>
            </div>

            {/* Table header */}
            <div className="hidden sm:grid sm:grid-cols-[1fr_140px_160px_40px] gap-2 px-1 mb-1">
              <span className="text-xs font-medium text-gray-500">{t('Статья расхода', 'Xarajat bandi')}</span>
              <span className="text-xs font-medium text-gray-500 text-right">{t('В месяц', 'Oylik')}</span>
              <span className="text-xs font-medium text-gray-500 text-right">{t('В год (авто)', 'Yillik (avto)')}</span>
              <span />
            </div>

            <div className="space-y-2">
              {formItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-1 sm:grid-cols-[1fr_140px_160px_40px] gap-2 items-center">
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => updateItem(idx, 'name', e.target.value)}
                    placeholder={t('Название статьи', 'Band nomi')}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                  />
                  <input
                    type="number"
                    value={item.monthly_amount || ''}
                    onChange={(e) => updateItem(idx, 'monthly_amount', Number(e.target.value))}
                    placeholder={t('сумма/мес', "summa/oy")}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-right focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                  />
                  <div className="flex items-center gap-1">
                    <span className="text-gray-400 text-sm">=</span>
                    <span className="flex-1 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-right text-gray-500">
                      {item.amount ? `${formatAmount(item.amount)} ${t('сум/год', "so'm/yil")}` : '—'}
                    </span>
                  </div>
                  <button
                    onClick={() => removeItem(idx)}
                    className="p-2 text-gray-400 hover:text-red-500 transition-colors justify-self-center"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={addItem}
              className="mt-2 inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              <Plus className="w-4 h-4" />
              {t('Добавить статью', 'Band qo\'shish')}
            </button>
          </div>

          {/* 4. Calculation parameters — single block */}
          <div className="border-t border-gray-100 pt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">
              {t('Г) Параметры расчёта', 'G) Hisoblash parametrlari')}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Enterprise profit */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {t('Доход предприятия, %', 'Korxona daromadi, %')}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.1"
                    value={formProfitPct}
                    onChange={(e) => setFormProfitPct(Number(e.target.value))}
                    className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                  />
                  <span className="text-sm text-gray-400">&rarr;</span>
                  <span className="text-sm font-semibold text-primary-700">{formatAmount(formEnterpiseIncome)} {t('сум/год', "so'm/yil")}</span>
                </div>
              </div>
              {/* Commercial rate */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {t('Коммерч. помещ.', 'Tijoriy bino')} ({t('сум/кв.м', "so'm/kv.m")})
                </label>
                <input
                  type="number"
                  value={formCommercialRate || ''}
                  onChange={(e) => setFormCommercialRate(Number(e.target.value))}
                  placeholder="0"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                />
              </div>
              {/* Basement rate */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {t('Подвал', 'Podval')} ({t('сум/кв.м', "so'm/kv.m")})
                </label>
                <input
                  type="number"
                  value={formBasementRate || ''}
                  onChange={(e) => setFormBasementRate(Number(e.target.value))}
                  placeholder="0"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                />
              </div>
              {/* Parking rate */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {t('Парковка', 'Avtoturargoh')} ({t('сум/место', "so'm/joy")})
                </label>
                <input
                  type="number"
                  value={formParkingRate || ''}
                  onChange={(e) => setFormParkingRate(Number(e.target.value))}
                  placeholder="0"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                />
              </div>
            </div>
          </div>

          {/* 5. Checkboxes */}
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formShowProfit}
                onChange={(e) => setFormShowProfit(e.target.checked)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">
                {t('Показывать прибыль жильцам', "Foydani aholiga ko'rsatish")}
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formShowDebtor}
                onChange={(e) => setFormShowDebtor(e.target.checked)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">
                {t('Показывать статус должника жильцам', "Qarzdorlik statusini aholiga ko'rsatish")}
              </span>
            </label>
          </div>

          {/* 6. Summary block */}
          <div className="border-t border-gray-200 pt-4 bg-gradient-to-r from-primary-50 to-amber-50 -mx-1 px-4 pb-4 rounded-lg">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div>
                <p className="text-xs text-gray-500 mb-1">{t('Расходы/мес', 'Xarajat/oy')}</p>
                <p className="text-base font-bold text-gray-900">{formatAmount(formTotalMonthly)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">{t('Расходы/год', 'Xarajat/yil')}</p>
                <p className="text-base font-bold text-gray-900">{formatAmount(formTotalYearly)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">{t('Доход предпр.', 'Korx. daromadi')}</p>
                <p className="text-base font-bold text-primary-700">{formatAmount(formEnterpiseIncome)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">{t('ВСЕГО', 'JAMI')}</p>
                <p className="text-lg font-bold text-primary-800">{formatAmount(formGrandTotal)}</p>
              </div>
              {totalArea > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">{t('1 кв.м', '1 kv.m')}</p>
                  <p className="text-base font-bold text-amber-700">{formatAmount(costPerSqm)}</p>
                  <p className="text-xs text-gray-400">{t('сум/кв.м/год', "so'm/kv.m/yil")}</p>
                </div>
              )}
            </div>
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end pt-2">
            <button
              onClick={handleCreate}
              disabled={saving || !formBuilding || formItems.length === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-500 text-white rounded-xl hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm"
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
          `${t('Смета', 'Smeta')} ${(currentEstimate?.effective_date as string) || (currentEstimate?.period as string) || ''}`
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
                {buildingMap[currentEstimate.building_id as string] || t('Комплекс', 'Kompleks')}
              </span>
              <span className="text-sm text-gray-500 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {(currentEstimate.effective_date as string)
                  ? `${t('с', 'dan')} ${currentEstimate.effective_date as string}`
                  : (currentEstimate.period as string) || '-'}
              </span>
            </div>

            {/* Rates summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-primary-50 rounded-lg p-3">
                <p className="text-xs text-primary-600 font-medium mb-1">
                  {t('Жилое (за м²)', 'Turar joy (m² uchun)')}
                </p>
                <p className="text-lg font-bold text-primary-900">
                  {formatAmount(currentEstimate.commercial_rate_per_sqm)}
                </p>
                <p className="text-xs text-primary-400">{t('сум', "so'm")}</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3">
                <p className="text-xs text-amber-600 font-medium mb-1">
                  {t('Нежилое (за м²)', 'Noturar (m² uchun)')}
                </p>
                <p className="text-lg font-bold text-amber-900">
                  {formatAmount(currentEstimate.non_commercial_rate_per_sqm)}
                </p>
                <p className="text-xs text-amber-400">{t('сум', "so'm")}</p>
              </div>
              {Number(currentEstimate.commercial_rate) > 0 && (
                <div className="bg-blue-50 rounded-lg p-3">
                  <p className="text-xs text-blue-600 font-medium mb-1">
                    {t('Коммерч.', 'Tijoriy')}
                  </p>
                  <p className="text-lg font-bold text-blue-900">
                    {formatAmount(currentEstimate.commercial_rate)}
                  </p>
                  <p className="text-xs text-blue-400">{t('сум/м²', "so'm/m²")}</p>
                </div>
              )}
              {Number(currentEstimate.parking_rate) > 0 && (
                <div className="bg-violet-50 rounded-lg p-3">
                  <p className="text-xs text-violet-600 font-medium mb-1">
                    {t('Парковка', 'Avtoturargoh')}
                  </p>
                  <p className="text-lg font-bold text-violet-900">
                    {formatAmount(currentEstimate.parking_rate)}
                  </p>
                  <p className="text-xs text-violet-400">{t('сум/место', "so'm/joy")}</p>
                </div>
              )}
            </div>

            {/* Items table */}
            {detailItems.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 font-medium text-gray-500">
                        #
                      </th>
                      <th className="text-left py-2 px-3 font-medium text-gray-500">
                        {t('Статья расхода', 'Xarajat bandi')}
                      </th>
                      <th className="text-right py-2 px-3 font-medium text-gray-500">
                        {t('В месяц', 'Oylik')}
                      </th>
                      <th className="text-right py-2 px-3 font-medium text-gray-500">
                        {t('В год', 'Yillik')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailItems.map((it, idx) => (
                      <tr key={idx} className="border-b border-gray-50">
                        <td className="py-2 px-3 text-gray-400 text-xs">{idx + 1}</td>
                        <td className="py-2 px-3 text-gray-900">
                          {(it.name as string) || '-'}
                        </td>
                        <td className="py-2 px-3 text-right text-gray-600">
                          {formatAmount(it.monthly_amount || Math.round(Number(it.amount) / 12))}
                        </td>
                        <td className="py-2 px-3 text-right font-medium text-gray-900">
                          {formatAmount(it.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-200">
                      <td />
                      <td className="py-2 px-3 font-semibold text-gray-700">
                        {t('Итого расходов', 'Jami xarajatlar')}
                      </td>
                      <td className="py-2 px-3 text-right font-medium text-gray-600">
                        {formatAmount(Math.round(Number(currentEstimate.total_amount) / 12))}
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-gray-900">
                        {formatAmount(currentEstimate.total_amount)} {t('сум', "so'm")}
                      </td>
                    </tr>
                    {Number(currentEstimate.uk_profit_percent || currentEstimate.enterprise_profit_percent) > 0 && (
                      <tr className="border-t border-gray-100">
                        <td />
                        <td className="py-2 px-3 text-gray-600">
                          {t('Доход предприятия', 'Korxona daromadi')} ({currentEstimate.uk_profit_percent || currentEstimate.enterprise_profit_percent}%)
                        </td>
                        <td />
                        <td className="py-2 px-3 text-right font-medium text-primary-700">
                          {formatAmount(Math.round(Number(currentEstimate.total_amount) * Number(currentEstimate.uk_profit_percent || currentEstimate.enterprise_profit_percent || 0) / 100))} {t('сум', "so'm")}
                        </td>
                      </tr>
                    )}
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
                  {t('Утвердить', 'Tasdiqlash')}
                </button>
              )}
              {detailStatus === 'active' && (
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-500 text-white rounded-xl hover:bg-primary-600 disabled:opacity-50 transition-colors font-medium text-sm"
                >
                  {generating ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4" />
                  )}
                  {t('Сформировать начисления', 'Hisob-kitoblarni yaratish')}
                </button>
              )}
              <button
                onClick={() => {
                  if (currentEstimate) {
                    generateEstimateExcel(
                      currentEstimate,
                      detailItems,
                      buildings as any[],
                      language as 'ru' | 'uz'
                    );
                  }
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium text-sm"
              >
                <FileSpreadsheet className="w-4 h-4" />
                {t('Скачать Excel', 'Excel yuklash')}
              </button>
              {currentEstimate.show_profit_to_residents === 1 && (
                <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                  <Eye className="w-3.5 h-3.5" />
                  {t('Прибыль видна жильцам', "Foyda aholiga ko'rinadi")}
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
