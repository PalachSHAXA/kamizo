import { useEffect, useState, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useFinanceStore } from '../../stores/financeStore';
import { useBuildingStore } from '../../stores/buildingStore';
import { useLanguageStore } from '../../stores/languageStore';
import { useTenantStore } from '../../stores/tenantStore';
import { useAuthStore } from '../../stores/authStore';
import { Modal, EmptyState } from '../../components/common';
import { PageSkeleton } from '../../components/PageSkeleton';
import {
  FileSpreadsheet,
  FileText,
  Plus,
  Pencil,
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
  Send,
  Undo2,
  Clock,
  Sparkles,
  Link2,
} from 'lucide-react';
import { formatAmount } from '../../utils/formatCurrency';
import { generateEstimateExcel } from '../../utils/generateEstimateExcel';
import { generateEstimatePdf } from '../../utils/generateEstimatePdf';
import { FinanceDemoReadOnlyBanner } from './FinanceDemoReadOnlyBanner';
import {
  canEditEstimate,
  canApproveEstimate,
  estimateStage,
  estimateStageLabel,
  estimateObjectName,
  isEstimateEditable,
  isUnassignedEstimate,
  ESTIMATE_STAGE_STYLES,
  type EstimateStage,
} from '../../utils/estimateStatus';

// ── Default expense articles (real УК template) ──
const DEFAULT_EXPENSE_ARTICLES: Array<{ name_ru: string; name_uz: string; section: string }> = [
  { name_ru: 'Расходы по зарплате', name_uz: 'Ish haqi xarajatlari', section: 'salary' },
  { name_ru: 'Хозяйственные товары', name_uz: 'Xo\'jalik mollari', section: 'materials' },
  { name_ru: 'Спецодежда с вышивкой', name_uz: 'Tikilgan maxsus kiyim', section: 'materials' },
  { name_ru: 'Принадлежности для электрика и сантехника', name_uz: 'Elektrik va santexnik uchun buyumlar', section: 'materials' },
  { name_ru: 'Общие коммунальные и профил. расходы', name_uz: 'Umumiy kommunal va profilaktika xarajatlari', section: 'materials' },
  { name_ru: 'Обслуживание лифта и домофона', name_uz: 'Lift va domofon xizmati', section: 'production' },
  { name_ru: 'Прочие расходы', name_uz: 'Boshqa xarajatlar', section: 'production' },
  { name_ru: 'Канцелярские принадлежности', name_uz: 'Ish yuritish buyumlari', section: 'admin' },
  { name_ru: 'Закупка офисной мебели', name_uz: 'Ofis mebelini sotib olish', section: 'admin' },
  { name_ru: 'Закупка мебели для охранной будки', name_uz: 'Qo\'riqchi budkasi uchun mebel', section: 'admin' },
  { name_ru: 'Закупка оргтехники', name_uz: 'Orgtexnika sotib olish', section: 'admin' },
  { name_ru: 'Расходы садовника', name_uz: 'Bog\'bon xarajatlari', section: 'admin' },
];

interface ExpenseItem {
  name: string;
  monthly_amount: number;
  amount: number; // yearly = monthly * 12
  // Секция статьи для группировки в выгрузке сметы (Excel/PDF) с под-итогом
  // «Жами». Ключи см. EXPENSE_SECTIONS в generateEstimateExcel.ts:
  // salary | materials | production | admin | other.
  section?: string;
}

// Фильтр по витринной стадии → серверные параметры (status + approval_status).
// Смета «на рассмотрении» — это всё ещё status='draft', поэтому одной осью
// фильтровать нельзя, см. migrations/065.
const STAGE_FILTER_PARAMS: Record<string, { status: string; approvalStatus: string }> = {
  '': { status: '', approvalStatus: '' },
  draft: { status: 'draft', approvalStatus: 'draft' },
  pending: { status: '', approvalStatus: 'pending' },
  rejected: { status: '', approvalStatus: 'rejected' },
  approved: { status: 'active', approvalStatus: '' },
  archived: { status: 'archived', approvalStatus: '' },
};

const STAGE_FILTER_ORDER: EstimateStage[] = ['draft', 'pending', 'rejected', 'approved', 'archived'];

export default function EstimatesPage() {
  const language = useLanguageStore((s) => s.language);
  const tenantName = useTenantStore((s) => s.config?.tenant?.name) || 'Kamizo';
  const isDemoSession = useAuthStore((s) => s.user?.demoSession === true);
  const userRole = useAuthStore((s) => s.user?.role);
  const t = useCallback((ru: string, uz: string) => (language === 'ru' ? ru : uz), [language]);

  // Права: составитель вводит и правит, утверждающий — утверждает и возвращает.
  // Сервер проверяет то же самое; здесь только показ кнопок.
  const mayEdit = !isDemoSession && canEditEstimate(userRole);
  const mayApprove = !isDemoSession && canApproveEstimate(userRole);

  const estimates = useFinanceStore((s) => s.estimates);
  const estimatesLoading = useFinanceStore((s) => s.estimatesLoading);
  const currentEstimate = useFinanceStore((s) => s.currentEstimate);
  const fetchEstimates = useFinanceStore((s) => s.fetchEstimates);
  const fetchEstimate = useFinanceStore((s) => s.fetchEstimate);
  const createEstimate = useFinanceStore((s) => s.createEstimate);
  const submitEstimate = useFinanceStore((s) => s.submitEstimate);
  const rejectEstimate = useFinanceStore((s) => s.rejectEstimate);
  const attachEstimateToBuilding = useFinanceStore((s) => s.attachEstimateToBuilding);
  const activateEstimate = useFinanceStore((s) => s.activateEstimate);
  const generateCharges = useFinanceStore((s) => s.generateCharges);
  const setFilters = useFinanceStore((s) => s.setFilters);

  const buildings = useBuildingStore((s) => s.buildings);
  const fetchBuildings = useBuildingStore((s) => s.fetchBuildings);
  const navigate = useNavigate();

  const [loadError, setLoadError] = useState(false);

  // Filters
  const [filterBuilding, setFilterBuilding] = useState('');
  // Одна витринная стадия вместо двух серверных осей — см. STAGE_FILTER_PARAMS.
  const [filterStage, setFilterStage] = useState('');
  // Тип объекта: '' | building | complex | unassigned.
  const [filterScope, setFilterScope] = useState('');

  // Привязка черновика без объекта (только админ/директор). Один черновик —
  // один объект: смета, подходящая одному дому, не годится другому.
  const [showLink, setShowLink] = useState(false);
  const [linkBuildingId, setLinkBuildingId] = useState('');
  const [linkEstimateId, setLinkEstimateId] = useState('');
  const [linking, setLinking] = useState(false);

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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
      section: a.section,
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
        const stageParams = STAGE_FILTER_PARAMS[filterStage] || STAGE_FILTER_PARAMS[''];
        setFilters({
          buildingId: filterBuilding,
          status: stageParams.status,
          approvalStatus: stageParams.approvalStatus,
          scopeLevel: filterScope,
        });
        await fetchEstimates();
      } catch {
        setLoadError(true);
      }
    };
    load();
  }, [filterBuilding, filterStage, filterScope]); // eslint-disable-line react-hooks/exhaustive-deps

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
    return Number((selectedBuilding as unknown as Record<string, unknown>).total_area) || 0;
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

  const stageLabel = useCallback(
    (stage: EstimateStage) => estimateStageLabel(stage, language === 'ru'),
    [language],
  );

  // Черновики без объекта — кандидаты на привязку. Утверждённые сюда попасть
  // не могут: непривязанную смету нельзя утвердить (бэкенд запрещает), но
  // фильтр по статусу оставляем явным — на случай ручной правки данных.
  const unassignedDrafts = useMemo(
    () => estimates.filter((e) => isUnassignedEstimate(e) && String(e.status || 'draft') === 'draft'),
    [estimates],
  );

  const openLinkModal = (preselectId?: string) => {
    if (!mayApprove) return;
    setLinkBuildingId('');
    setLinkEstimateId(preselectId || '');
    setShowLink(true);
  };

  const handleLink = async () => {
    if (!mayApprove || !linkBuildingId || !linkEstimateId) return;
    setLinking(true);
    const ok = await attachEstimateToBuilding(linkEstimateId, linkBuildingId);
    setLinking(false);
    if (ok) {
      setShowLink(false);
      setLinkEstimateId('');
      setLinkBuildingId('');
    }
  };

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
    setFormItems((prev) => [...prev, { name: '', monthly_amount: 0, amount: 0, section: 'other' }]);
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
        section: a.section,
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
    if (isDemoSession || !formBuilding || formItems.length === 0) return;
    setSaving(true);
    const validItems = formItems.filter((it) => it.name && (it.amount > 0 || it.monthly_amount > 0));
    const ok = await createEstimate({
      building_id: formBuilding,
      period: formEffectiveDate ? formEffectiveDate.slice(0, 7) : new Date().toISOString().slice(0, 7),
      effective_date: formEffectiveDate || undefined,
      title: formTitle || undefined,
      items: validItems.map((it) => ({
        name: it.name,
        // Секция статьи (salary/materials/production/admin/other) едет в поле
        // `category` — оно уже персистится и раньше было мёртвым 'maintenance'.
        // По ней выгрузка сметы группирует статьи с под-итогом «Жами».
        category: it.section || 'other',
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
    // Пересчитать и обновить кеш, чтобы модалка показывала реальные
    // тариф/годовую сумму/дефицит (для v2/ЖК-смет иначе там нули).
    try {
      const { estimateV2Api } = await import('../../services/api');
      await estimateV2Api.compute(id);
      await fetchEstimate(id);
    } catch { /* смета могла быть легаси/без v2-расчёта — игнорируем */ }
  };

  // Редактирование черновика — открываем Мастер v2 в режиме правки.
  const handleEditEstimate = (id: string) => {
    if (!mayEdit) return;
    navigate(`/finance/estimates/v2/new?edit=${id}`);
  };

  // Удаление черновика (активные и отправленные на рассмотрение удалять
  // нельзя — бэкенд вернёт 409).
  const handleDeleteEstimate = async (id: string) => {
    if (!mayEdit) return;
    if (!window.confirm(t('Удалить черновик сметы?', 'Smeta qoralamasini o\'chirasizmi?'))) return;
    try {
      const { estimateV2Api } = await import('../../services/api');
      await estimateV2Api.remove(id);
      await fetchEstimates();
    } catch (e: any) {
      window.alert(e?.message || t('Не удалось удалить', 'O\'chirib bo\'lmadi'));
    }
  };

  // Отправка на рассмотрение: с этого момента правки закрыты до решения
  // утверждающего (бэкенд вернёт 400/409 на PUT).
  const handleSubmitForApproval = async (id: string) => {
    if (!mayEdit) return;
    if (!window.confirm(t(
      'Отправить смету на утверждение? Пока она на рассмотрении, править её нельзя.',
      "Smetani tasdiqlashga yuborilsinmi? Ko'rib chiqilayotganda uni tahrirlab bo'lmaydi.",
    ))) return;
    setSubmitting(true);
    const ok = await submitEstimate(id);
    setSubmitting(false);
    if (ok && currentEstimate?.id === id) await fetchEstimate(id);
  };

  // Возврат на доработку — причина обязательна, её увидит составитель.
  const handleReject = async (id: string) => {
    if (!mayApprove) return;
    const reason = window.prompt(t(
      'Причина возврата сметы на доработку:',
      'Smetani qayta ishlashga qaytarish sababi:',
    ));
    if (reason === null) return;
    if (!reason.trim()) {
      window.alert(t('Причина обязательна', 'Sabab majburiy'));
      return;
    }
    setActivating(true);
    const ok = await rejectEstimate(id, reason.trim());
    setActivating(false);
    if (ok && currentEstimate?.id === id) await fetchEstimate(id);
  };

  const handleActivate = async () => {
    if (!mayApprove || !currentEstimate) return;
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
    if (isDemoSession || !currentEstimate) return;
    setGenerating(true);
    await generateCharges(currentEstimate.id as string);
    setGenerating(false);
  };

  // --- Render ---

  if (estimatesLoading && estimates.length === 0) {
    return <PageSkeleton variant="list" />;
  }

  const detailItems = (currentEstimate?.items as Record<string, unknown>[] | undefined) || [];
  // В «Статьи расхода» показываем только расходы (доходы kind='income' не сюда).
  const detailExpenseItems = detailItems.filter((it) => (it.kind as string) !== 'income');
  const detailExpMonthly = detailExpenseItems.reduce(
    (s, it) => s + (Number(it.monthly_amount) || Math.round(Number(it.amount) / 12) || 0), 0,
  );
  const detailExpYear = detailExpenseItems.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const detailStage = estimateStage(currentEstimate);
  const detailIsUnassigned = isUnassignedEstimate(currentEstimate);

  return (
    <div className="admin-form-controls w-full min-w-0 max-w-full space-y-6 overflow-x-clip pb-24 md:pb-0">
      {/* Header */}
      <div className="flex flex-col items-stretch justify-between gap-3 min-[360px]:flex-row min-[360px]:items-center">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#E8621A] to-[#F59E0B] flex items-center justify-center shadow-sm shrink-0">
            <FileSpreadsheet className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 truncate">
              {t('Сметы', 'Smetalar')}
            </h1>
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              {t('Управление финансовыми сметами комплексов', 'Komplekslar moliyaviy smetalarini boshqarish')}
            </p>
          </div>
        </div>
        <div className="flex w-full items-center gap-2 min-[360px]:w-auto min-[360px]:shrink-0">
          {/* Объект завели в системе — выбираем для него один из черновиков */}
          {mayApprove && unassignedDrafts.length > 0 && (
            <button
              onClick={() => openLinkModal()}
              className="staff-primary-control inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-medium text-violet-700 hover:bg-violet-100"
            >
              <Link2 className="w-4 h-4" />
              <span className="hidden sm:inline">{t('Привязать к объекту', 'Obyektga bog\'lash')}</span>
              <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-violet-600 px-1.5 text-xs font-semibold text-white">
                {unassignedDrafts.length}
              </span>
            </button>
          )}
          {/* Sprint 3: новый 4-шаговый мастер v2 (штат + доходы + гос. минимум).
              Hotfix: заменили <a href> на <Link to> — иначе браузер делал
              полную перезагрузку, index.html → SPA-fallback → ProtectedRoute
              редиректил manager'а на "/", т.к. роут был admin/director-only.
              Роль manager теперь в allowedRoles Layout.tsx (см. далее). */}
          {/* Создание сметы — только через Мастер v2 (старая форма убрана). */}
          {mayEdit && <Link
            to="/finance/estimates/v2/new"
            aria-label={t('Создать смету', 'Smeta yaratish')}
            className="staff-primary-control inline-flex min-h-[44px] w-full items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-br from-[#E8621A] to-[#F59E0B] text-white rounded-xl hover:opacity-90 transition-opacity font-medium text-sm shadow-sm min-[360px]:w-auto"
          >
            <Plus className="w-4 h-4" />
            <span className="estimate-create-label">{t('Создать смету', 'Smeta yaratish')}</span>
          </Link>}
        </div>
      </div>

      {isDemoSession && <FinanceDemoReadOnlyBanner />}

      {/* Filters */}
      <div className="bg-white/60 backdrop-blur-xl rounded-xl border border-gray-100 shadow-sm p-4 flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 text-gray-500">
          <Filter className="w-4 h-4" />
          <span className="text-sm font-medium">{t('Фильтры', 'Filtrlar')}</span>
        </div>
        <select
          value={filterBuilding}
          onChange={(e) => setFilterBuilding(e.target.value)}
          className="min-h-[44px] flex-1 min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
        >
          <option value="">{t('Все комплексы', 'Barcha komplekslar')}</option>
          {buildings.map((b) => (
            <option key={b.id as string} value={b.id as string}>
              {(b.name as string) || (b.address as string)}
            </option>
          ))}
        </select>
        <select
          value={filterStage}
          onChange={(e) => setFilterStage(e.target.value)}
          className="min-h-[44px] sm:w-56 rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
        >
          <option value="">{t('Все статусы', 'Barcha statuslar')}</option>
          {STAGE_FILTER_ORDER.map((stage) => (
            <option key={stage} value={stage}>{stageLabel(stage)}</option>
          ))}
        </select>
        <select
          value={filterScope}
          onChange={(e) => setFilterScope(e.target.value)}
          className="min-h-[44px] sm:w-56 rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
        >
          <option value="">{t('Все объекты', 'Barcha obyektlar')}</option>
          <option value="building">{t('Отдельный дом', 'Alohida uy')}</option>
          <option value="complex">{t('ЖК', 'JK')}</option>
          <option value="unassigned">{t('Без объекта', 'Obyektsiz')}</option>
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
          action={mayEdit ? {
            label: t('Создать смету', 'Smeta yaratish'),
            onClick: () => navigate('/finance/estimates/v2/new'),
          } : undefined}
        />
      ) : (
        <div className="grid min-w-0 max-w-full gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {estimates.map((est) => {
            const id = est.id as string;
            const stage = estimateStage(est);
            // Черновик без объекта: утвердить нельзя, пока не привязан
            // к объекту (см. migration 066).
            const isUnassigned = isUnassignedEstimate(est);
            const objectName = estimateObjectName(est, buildingMap[est.building_id as string] || '', language === 'ru');
            const effectiveDate = est.effective_date as string | undefined;
            return (
              <div
                key={id}
                className="group min-w-0 max-w-full overflow-hidden rounded-xl border border-gray-100 bg-white/60 p-5 shadow-sm backdrop-blur-xl transition-shadow hover:shadow-md"
              >
                <button
                  type="button"
                  className="block min-h-[44px] w-full cursor-pointer border-0 bg-transparent p-0 text-left"
                  onClick={() => openDetail(id)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${ESTIMATE_STAGE_STYLES[stage]}`}
                    >
                      {stage === 'pending' && <Clock className="w-3 h-3" />}
                      {stage === 'approved' && <CheckCircle2 className="w-3 h-3" />}
                      {stageLabel(stage)}
                    </span>
                    <div className="flex items-center gap-2">
                      {isUnassigned && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700">
                          <Sparkles className="w-3 h-3" />
                          {t('Без объекта', 'Obyektsiz')}
                        </span>
                      )}
                      <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-primary-500 transition-colors" />
                    </div>
                  </div>
                  {(est.title as string) && (
                    <h3 className="font-semibold text-gray-900 mb-1 truncate">
                      {est.title as string}
                    </h3>
                  )}
                  <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-1">
                    <Building2 className="w-3.5 h-3.5" />
                    <span className="truncate">{objectName}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-3">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>
                      {effectiveDate
                        ? `${t('с', 'dan')} ${effectiveDate}`
                        : (est.period as string) || '-'}
                    </span>
                  </div>
                  {(() => {
                    const annual = Number(est.umumiy_year) || Number(est.total_amount) || 0;
                    const tariff = Number(est.tariff_resident) || 0;
                    const deficit = Number(est.deficit_year) || 0;
                    if (annual <= 0) {
                      // Смета ещё не рассчитана (не доходили до «Пересчитать»).
                      return (
                        <div className="text-sm text-amber-600 bg-amber-50 rounded-lg px-2 py-1.5">
                          {t('Не рассчитана — откройте и нажмите «Пересчитать»', 'Hisoblanmagan — «Qayta hisoblash»')}
                        </div>
                      );
                    }
                    return (
                      <>
                        <div className="flex items-center gap-2">
                          <Banknote className="w-4 h-4 text-primary-500" />
                          <span className="text-lg font-bold text-gray-900">
                            {formatAmount(annual)} {t('сум/год', "so'm/yil")}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap text-xs">
                          {tariff > 0 && (
                            <span className="text-gray-500">
                              {t('тариф', 'tarif')} {formatAmount(tariff)} {t('сум/м²', "so'm/m²")}
                            </span>
                          )}
                          {/* Без объекта дефицит = все расходы: дохода неоткуда
                              взяться, пока нет площади. Не пугаем красным. */}
                          {!isUnassigned && deficit < 0 && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                              {t('Дефицит', 'Defitsit')}: {formatAmount(deficit)} {t('сум/год', "so'm")}
                            </span>
                          )}
                          {isUnassigned && (
                            <span className="text-violet-600">
                              {t('тариф — после привязки', "tarif — bog'langach")}
                            </span>
                          )}
                        </div>
                        {!isUnassigned && deficit < 0 && (
                          <div className="text-[11px] text-red-500 mt-1">
                            {t('Расходы выше доходов — поднимите тариф или добавьте доходы.', 'Xarajat daromaddan yuqori — tarifni oshiring.')}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </button>

                {/* Причина возврата — составителю нужно видеть её сразу в списке */}
                {stage === 'rejected' && (est.rejection_reason as string) && (
                  <div className="mt-3 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700">
                    <span className="font-medium">{t('Возвращена', 'Qaytarilgan')}: </span>
                    {est.rejection_reason as string}
                  </div>
                )}

                {/* Кто и когда утвердил */}
                {stage === 'approved' && (est.approved_at as string) && (
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-700">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">
                      {t('Утвердил', 'Tasdiqladi')}: {(est.approved_by_name as string) || '—'},{' '}
                      {String(est.approved_at).slice(0, 10)}
                    </span>
                  </div>
                )}

                {/* Действия: правка/удаление/отправка — пока смета редактируема */}
                {isEstimateEditable(stage) && mayEdit && (
                  <div className="flex min-w-0 max-w-full flex-col flex-wrap items-stretch gap-2 border-t border-gray-100 pt-3 mt-4 min-[360px]:flex-row min-[360px]:items-center">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEditEstimate(id); }}
                      className="staff-primary-control inline-flex min-h-[44px] min-w-[44px] max-w-full flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
                    >
                      <Pencil className="w-3.5 h-3.5" /> {t('Редактировать', 'Tahrirlash')}
                    </button>
                    {/* Объект завели в системе — привязываем к нему черновик */}
                    {isUnassigned && mayApprove && (
                      <button
                        onClick={(e) => { e.stopPropagation(); openLinkModal(id); }}
                        className="staff-primary-control inline-flex min-h-[44px] min-w-[44px] max-w-full flex-1 items-center justify-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm text-violet-700 hover:bg-violet-100"
                      >
                        <Link2 className="w-3.5 h-3.5" /> {t('Привязать', 'Bog\'lash')}
                      </button>
                    )}
                    {/* Непривязанный черновик не утверждается */}
                    {!isUnassigned && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSubmitForApproval(id); }}
                        disabled={submitting}
                        className="staff-primary-control inline-flex min-h-[44px] min-w-[44px] max-w-full flex-1 items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                      >
                        <Send className="w-3.5 h-3.5" /> {t('На утверждение', 'Tasdiqlashga')}
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteEstimate(id); }}
                      className="staff-primary-control inline-flex min-h-[44px] min-w-[44px] max-w-full flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> {t('Удалить', "O'chirish")}
                    </button>
                  </div>
                )}

                {/* На рассмотрении: решение принимает утверждающий */}
                {stage === 'pending' && mayApprove && (
                  <div className="flex min-w-0 max-w-full flex-col flex-wrap items-stretch gap-2 border-t border-gray-100 pt-3 mt-4 min-[360px]:flex-row min-[360px]:items-center">
                    <button
                      onClick={(e) => { e.stopPropagation(); openDetail(id); }}
                      className="staff-primary-control inline-flex min-h-[44px] min-w-[44px] max-w-full flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> {t('Рассмотреть', "Ko'rib chiqish")}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleReject(id); }}
                      disabled={activating}
                      className="staff-primary-control inline-flex min-h-[44px] min-w-[44px] max-w-full flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
                    >
                      <Undo2 className="w-3.5 h-3.5" /> {t('Вернуть', 'Qaytarish')}
                    </button>
                  </div>
                )}

                {/* На рассмотрении, но решать не этому пользователю */}
                {stage === 'pending' && !mayApprove && (
                  <div className="mt-4 border-t border-gray-100 pt-3 text-xs text-amber-700">
                    {t('Ожидает решения администратора или директора — правки закрыты',
                       'Administrator yoki direktor qaroriga kutilmoqda — tahrirlash yopiq')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Привязка расчётов с переговоров к заведённому объекту ─── */}
      <Modal
        isOpen={showLink}
        onClose={() => setShowLink(false)}
        title={t('Привязать расчёты к объекту', "Hisob-kitoblarni obyektga bog'lash")}
        size="lg"
      >
        <div className="space-y-5">
          <p className="text-sm text-gray-500">
            {t('Объект появился в системе — выберите для него один из подготовленных черновиков. К объекту привязывается ровно одна смета.',
               "Obyekt tizimda paydo bo'ldi — u uchun tayyorlangan qoralamalardan birini tanlang. Obyektga aynan bitta smeta bog'lanadi.")}
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('Объект', 'Obyekt')} *
            </label>
            <select
              value={linkBuildingId}
              onChange={(e) => setLinkBuildingId(e.target.value)}
              className="min-h-[44px] w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">{t('— выберите объект —', '— obyektni tanlang —')}</option>
              {buildings.map((b) => (
                <option key={b.id as string} value={b.id as string}>
                  {(b.name as string) || (b.address as string)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="mb-2 text-sm font-medium text-gray-700">
              {t('Черновик', 'Qoralama')} *
            </div>

            {unassignedDrafts.length === 0 ? (
              <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-4 text-sm text-gray-500">
                {t('Нет черновиков без объекта', "Obyektsiz qoralamalar yo'q")}
              </div>
            ) : (
              <div className="max-h-[45dvh] space-y-2 overflow-y-auto pr-1">
                {unassignedDrafts.map((est) => {
                  const eid = est.id as string;
                  const checked = linkEstimateId === eid;
                  const annual = Number(est.umumiy_year) || Number(est.total_amount) || 0;
                  return (
                    <label
                      key={eid}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                        checked ? 'border-violet-300 bg-violet-50' : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="link-estimate"
                        checked={checked}
                        onChange={() => setLinkEstimateId(eid)}
                        className="mt-0.5 border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-gray-900">
                          {(est.title as string) || t('Без названия', 'Nomsiz')}
                        </span>
                        <span className="mt-0.5 block text-xs text-gray-500">
                          {(est.period as string) || '—'}
                          {annual > 0 && ` · ${formatAmount(annual)} ${t('сум/год', "so'm/yil")}`}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Площадь появляется только с объектом, поэтому сервер сразу
              пересчитывает тариф. */}
          {linkBuildingId && linkEstimateId && (
            <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {t('Жилая площадь возьмётся из карточки объекта, тариф пересчитается автоматически. После этого смету можно отправить на утверждение.',
                 "Turar joy maydoni obyekt kartasidan olinadi, tarif avtomatik hisoblanadi. So'ng smetani tasdiqlashga yuborish mumkin.")}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
            <button
              onClick={() => setShowLink(false)}
              className="min-h-[44px] rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {t('Отмена', 'Bekor qilish')}
            </button>
            <button
              onClick={handleLink}
              disabled={linking || !linkBuildingId || !linkEstimateId}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {linking ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <Link2 className="h-4 w-4" />
              )}
              {t('Привязать', "Bog'lash")}
            </button>
          </div>
        </div>
      </Modal>

      {/* ─── Create Modal ─── */}
      <Modal
        isOpen={!isDemoSession && showCreate}
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
                  {/* v2 hotfix: type="text" + inputMode="numeric" вместо type="number".
                      Причина: type="number" сбивал фокус при быстром вводе (spinner-стрелки
                      ловили клик), и `value={x || ''}` глотал введённые нули.
                      Теперь принимаем строку как есть, парсим при сохранении. */}
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={item.monthly_amount === 0 ? '' : String(item.monthly_amount)}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^\d]/g, '');
                      updateItem(idx, 'monthly_amount', raw === '' ? 0 : Number(raw));
                    }}
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
                    type="text"
                    inputMode="decimal"
                    value={String(formProfitPct ?? '')}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^\d.,]/g, '').replace(',', '.');
                      setFormProfitPct(raw === '' || raw === '.' ? 0 : Number(raw));
                    }}
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
                  type="text"
                  inputMode="numeric"
                  value={formCommercialRate ? String(formCommercialRate) : ''}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^\d]/g, '');
                    setFormCommercialRate(raw === '' ? 0 : Number(raw));
                  }}
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
                  type="text"
                  inputMode="numeric"
                  value={formBasementRate ? String(formBasementRate) : ''}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^\d]/g, '');
                    setFormBasementRate(raw === '' ? 0 : Number(raw));
                  }}
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
                  type="text"
                  inputMode="numeric"
                  value={formParkingRate ? String(formParkingRate) : ''}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^\d]/g, '');
                    setFormParkingRate(raw === '' ? 0 : Number(raw));
                  }}
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
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${ESTIMATE_STAGE_STYLES[detailStage]}`}
              >
                {detailStage === 'pending' && <Clock className="w-3 h-3" />}
                {detailStage === 'approved' && <CheckCircle2 className="w-3 h-3" />}
                {stageLabel(detailStage)}
              </span>
              {detailIsUnassigned && (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700">
                  <Sparkles className="w-3 h-3" />
                  {t('Без объекта', 'Obyektsiz')}
                </span>
              )}
              <span className="text-sm text-gray-500 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5" />
                {estimateObjectName(
                  currentEstimate,
                  buildingMap[currentEstimate.building_id as string] || '',
                  language === 'ru',
                )}
              </span>
              <span className="text-sm text-gray-500 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {(currentEstimate.effective_date as string)
                  ? `${t('с', 'dan')} ${currentEstimate.effective_date as string}`
                  : (currentEstimate.period as string) || '-'}
              </span>
            </div>

            {/* Согласование: кто отправил / кто утвердил / почему вернули */}
            {detailStage === 'pending' && (
              <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-sm text-amber-900">
                <div className="flex items-center gap-1.5 font-medium">
                  <Clock className="w-4 h-4" />
                  {t('Смета на рассмотрении — правки закрыты', "Smeta ko'rib chiqilmoqda — tahrirlash yopiq")}
                </div>
                {(currentEstimate.submitted_at as string) && (
                  <div className="mt-1 text-xs text-amber-700">
                    {t('Отправил', 'Yubordi')}: {(currentEstimate.submitted_by_name as string) || '—'},{' '}
                    {String(currentEstimate.submitted_at).slice(0, 16).replace('T', ' ')}
                  </div>
                )}
              </div>
            )}
            {detailStage === 'rejected' && (
              <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-800">
                <div className="flex items-center gap-1.5 font-medium">
                  <Undo2 className="w-4 h-4" />
                  {t('Возвращена на доработку', 'Qayta ishlashga qaytarilgan')}
                </div>
                {(currentEstimate.rejection_reason as string) && (
                  <div className="mt-1">{currentEstimate.rejection_reason as string}</div>
                )}
                {(currentEstimate.rejected_at as string) && (
                  <div className="mt-1 text-xs text-red-600">
                    {(currentEstimate.rejected_by_name as string) || '—'},{' '}
                    {String(currentEstimate.rejected_at).slice(0, 16).replace('T', ' ')}
                  </div>
                )}
              </div>
            )}
            {detailStage === 'approved' && (currentEstimate.approved_at as string) && (
              <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-sm text-emerald-800">
                <span className="font-medium">{t('Утверждена', 'Tasdiqlangan')}: </span>
                {(currentEstimate.approved_by_name as string) || '—'},{' '}
                {String(currentEstimate.approved_at).slice(0, 16).replace('T', ' ')}
              </div>
            )}

            {/* Смета на ЖК: тарифы у каждого дома свои */}
            {(currentEstimate.scope_level as string) === 'complex' && (
              <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-sm text-blue-800">
                {t('Смета на ЖК: у каждого дома свой тариф. Полная разбивка — в «Скачать Excel» (лист на каждый дом) или при «Редактировать».',
                   'JK smetasi: har uyning tarifi alohida. To\'liq — Excelda.')}
              </div>
            )}

            {/* Итоги (v2): годовая сумма, тариф, дефицит */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-primary-50 rounded-lg p-3">
                <p className="text-xs text-primary-600 font-medium mb-1">
                  {(currentEstimate.scope_level as string) === 'complex'
                    ? t('Тариф (средн. по ЖК)', 'Tarif (o\'rtacha)')
                    : t('Тариф жилых, за м²', 'Turar tarif, m²')}
                </p>
                <p className="text-lg font-bold text-primary-900">
                  {formatAmount((Number(currentEstimate.tariff_resident) || Number(currentEstimate.commercial_rate_per_sqm) || 0))}
                </p>
                <p className="text-xs text-primary-400">{t('сум/м² (без НДС)', "so'm/m² (QQSsiz)")}</p>
                {Number(currentEstimate.vat_enabled) === 1 && Number(currentEstimate.tariff_resident) > 0 && (
                  <p className="text-xs text-primary-700 font-semibold mt-1">
                    {t('с НДС', 'QQS bilan')}: {formatAmount(Math.round(Number(currentEstimate.tariff_resident) * (1 + (Number(currentEstimate.vat_rate) || 0.12))))} {t('сум/м²', "so'm/m²")}
                  </p>
                )}
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 font-medium mb-1">{t('Годовая сумма', 'Yillik summa')}</p>
                <p className="text-lg font-bold text-gray-900">
                  {formatAmount(Number(currentEstimate.umumiy_year) || 0)}
                </p>
                <p className="text-xs text-gray-400">{t('сум/год', "so'm/yil")}</p>
              </div>
              {/* У черновика без объекта тариф и доход нулевые по построению —
                  показывать «Дефицит» красным было бы ложной тревогой. */}
              {detailIsUnassigned ? (
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-500 font-medium mb-1">{t('Баланс', 'Balans')}</p>
                  <p className="text-lg font-bold text-gray-400">—</p>
                  <p className="text-xs text-gray-400">{t('после привязки', "bog'langach")}</p>
                </div>
              ) : (
                <div className={`rounded-lg p-3 ${Number(currentEstimate.deficit_year) < 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
                  <p className={`text-xs font-medium mb-1 ${Number(currentEstimate.deficit_year) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {Number(currentEstimate.deficit_year) < 0 ? t('Дефицит', 'Defitsit') : t('Профицит/баланс', 'Balans')}
                  </p>
                  <p className={`text-lg font-bold ${Number(currentEstimate.deficit_year) < 0 ? 'text-red-900' : 'text-emerald-900'}`}>
                    {formatAmount(Number(currentEstimate.deficit_year) || 0)}
                  </p>
                  <p className="text-xs text-gray-400">{t('сум/год', "so'm/yil")}</p>
                </div>
              )}
            </div>
            {detailIsUnassigned ? (
              <div className="rounded-lg bg-violet-50 border border-violet-100 px-3 py-2 text-xs text-violet-800">
                {t('Тариф и баланс появятся после привязки к объекту — тогда подставится его жилая площадь. Сумма расходов уже посчитана.',
                   "Tarif va balans obyektga bog'langandan keyin paydo bo'ladi. Xarajatlar summasi allaqachon hisoblangan.")}
              </div>
            ) : Number(currentEstimate.deficit_year) < 0 && (
              <div className="text-xs text-red-500">
                {t('Расходы выше доходов — поднимите тариф или добавьте доходы (реклама/парковка/коммерция).',
                   'Xarajat daromaddan yuqori — tarifni oshiring.')}
              </div>
            )}

            {/* Доп. ставки (если заданы) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Number(currentEstimate.non_commercial_rate_per_sqm) > 0 && (
              <div className="bg-amber-50 rounded-lg p-3">
                <p className="text-xs text-amber-600 font-medium mb-1">
                  {t('Нежилое (за м²)', 'Noturar (m² uchun)')}
                </p>
                <p className="text-lg font-bold text-amber-900">
                  {formatAmount(currentEstimate.non_commercial_rate_per_sqm as number)}
                </p>
                <p className="text-xs text-amber-400">{t('сум', "so'm")}</p>
              </div>
              )}
              {Number(currentEstimate.commercial_rate) > 0 && (
                <div className="bg-blue-50 rounded-lg p-3">
                  <p className="text-xs text-blue-600 font-medium mb-1">
                    {t('Коммерч.', 'Tijoriy')}
                  </p>
                  <p className="text-lg font-bold text-blue-900">
                    {formatAmount(currentEstimate.commercial_rate as number)}
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
                    {formatAmount(currentEstimate.parking_rate as number)}
                  </p>
                  <p className="text-xs text-violet-400">{t('сум/место', "so'm/joy")}</p>
                </div>
              )}
            </div>

            {/* Items table */}
            {detailExpenseItems.length > 0 && (
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
                    {detailExpenseItems.map((it, idx) => (
                      <tr key={idx} className="border-b border-gray-50">
                        <td className="py-2 px-3 text-gray-400 text-xs">{idx + 1}</td>
                        <td className="py-2 px-3 text-gray-900">
                          {(it.name as string) || '-'}
                        </td>
                        <td className="py-2 px-3 text-right text-gray-600">
                          {formatAmount((it.monthly_amount || Math.round(Number(it.amount) / 12)) as number)}
                        </td>
                        <td className="py-2 px-3 text-right font-medium text-gray-900">
                          {formatAmount(it.amount as number)}
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
                        {formatAmount(detailExpMonthly)}
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-gray-900">
                        {formatAmount(detailExpYear)} {t('сум', "so'm")}
                      </td>
                    </tr>
                    {Number(currentEstimate.uk_profit_percent || currentEstimate.enterprise_profit_percent) > 0 && (
                      <tr className="border-t border-gray-100">
                        <td />
                        <td className="py-2 px-3 text-gray-600">
                          {t('Доход предприятия', 'Korxona daromadi')} ({String(currentEstimate.uk_profit_percent || currentEstimate.enterprise_profit_percent)}%)
                        </td>
                        <td />
                        <td className="py-2 px-3 text-right font-medium text-primary-700">
                          {formatAmount(Math.round(detailExpYear * Number(currentEstimate.uk_profit_percent || currentEstimate.enterprise_profit_percent || 0) / 100))} {t('сум', "so'm")}
                        </td>
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-100">
              {/* Черновик без объекта: сперва привязка, потом утверждение */}
              {detailIsUnassigned && (
                <div className="w-full space-y-2 rounded-lg border border-violet-100 bg-violet-50 px-3 py-2 text-sm text-violet-800">
                  <p>
                    {t('Черновик не привязан к объекту. Утвердить его нельзя — сначала выберите объект.',
                       "Qoralama obyektga bog'lanmagan. Tasdiqlash uchun avval obyektni tanlang.")}
                  </p>
                  {mayApprove && (
                    <button
                      onClick={() => openLinkModal(currentEstimate.id as string)}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-700"
                    >
                      <Link2 className="h-4 w-4" />
                      {t('Привязать к объекту', "Obyektga bog'lash")}
                    </button>
                  )}
                </div>
              )}
              {/* Составитель: отправить на рассмотрение */}
              {!detailIsUnassigned && isEstimateEditable(detailStage) && mayEdit && (
                <button
                  onClick={() => handleSubmitForApproval(currentEstimate.id as string)}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-500 text-white rounded-xl hover:bg-amber-600 disabled:opacity-50 transition-colors font-medium text-sm"
                >
                  {submitting ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  {t('Отправить на утверждение', 'Tasdiqlashga yuborish')}
                </button>
              )}
              {/* Утверждающий: утвердить прямо из черновика или с рассмотрения */}
              {!detailIsUnassigned && (detailStage === 'draft' || detailStage === 'pending' || detailStage === 'rejected') && mayApprove && (
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
              {/* Утверждающий: вернуть на доработку (только с рассмотрения) */}
              {detailStage === 'pending' && mayApprove && (
                <button
                  onClick={() => handleReject(currentEstimate.id as string)}
                  disabled={activating}
                  className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors font-medium text-sm"
                >
                  <Undo2 className="w-4 h-4" />
                  {t('Вернуть на доработку', 'Qayta ishlashga qaytarish')}
                </button>
              )}
              {detailStage === 'approved' && mayApprove && (
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
                      buildings.map((building) => ({
                        id: building.id,
                        name: building.name,
                        totalArea: building.totalArea,
                        livingArea: building.livingArea,
                        commonArea: building.commonArea,
                      })),
                      language as 'ru' | 'uz',
                      tenantName,  // Sprint 4: реальное имя УК в шапку
                    );
                  }
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium text-sm"
              >
                <FileSpreadsheet className="w-4 h-4" />
                {t('Скачать Excel', 'Excel yuklash')}
              </button>
              {/* Sprint 8: PDF-экспорт через window.print */}
              <button
                onClick={() => {
                  if (currentEstimate) {
                    generateEstimatePdf(
                      currentEstimate as unknown as Record<string, unknown>,
                      detailItems as unknown as Parameters<typeof generateEstimatePdf>[1],
                      buildings.map((building) => ({
                        id: building.id,
                        name: building.name,
                        address: building.address,
                        totalArea: building.totalArea,
                      })),
                      language as 'ru' | 'uz',
                      tenantName,
                    );
                  }
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium text-sm"
              >
                <FileText className="w-4 h-4" />
                {t('Печать / PDF', 'Chop / PDF')}
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
