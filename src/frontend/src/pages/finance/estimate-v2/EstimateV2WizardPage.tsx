/**
 * EstimateV2WizardPage — 4-шаговый мастер создания сметы v2.
 *
 * Sprint 3: реализует UI-часть плана /Users/…/plans/bubbly-riding-dove.md.
 * Backend (Sprint 2): /api/finance/estimates/v2 семейство роутов
 * (create → PUT staff → PUT expenses → PUT incomes → GET compute → GET validate).
 *
 * Шаги:
 *   1. Основа       — здание, период, модель, profit_rate, payroll_tax_rate
 *   2. Штат          — таблица позиций (units × salary) с автосуммой ФОТ
 *   3. Расходы      — таблица статей (production/periodic), кнопка "16 услуг"
 *   4. Доходы+Итог  — коммерция/подвал/парковка/телеком + live-расчёт tariff
 *
 * Валидация Ташкентского минимума и чек-лист 16 услуг тянутся из
 * /validate endpoint'а и рендерятся через WarningsPanel.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useBuildingStore } from '../../../stores/buildingStore';
import { useLanguageStore } from '../../../stores/languageStore';
import { useToastStore } from '../../../stores/toastStore';
import { useTenantStore } from '../../../stores/tenantStore';
import { useAuthStore } from '../../../stores/authStore';
import { FinanceDemoReadOnlyBanner } from '../FinanceDemoReadOnlyBanner';
import { generateEstimateV2Excel } from './generateEstimateV2Excel';
import { NumericInput } from './NumericInput';
import {
  estimateV2Api,
  branchesApi,
  type EstimateModelV2,
  type StaffPositionV2,
  type ExpenseLineV2,
  type IncomeStreamV2,
  type EstimateResultV2,
  type EstimateWarning,
  type IncomeType,
} from '../../../services/api';
import { WarningsPanel } from './WarningsPanel';
import { canApproveEstimate } from '../../../utils/estimateStatus';

// ── Форматирование чисел (тысячи через пробел, для UZS сум) ──────────
function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ');
}

// ── Обязательные услуги (мирроринг legal-constants.ts backend'а) ─
// conditional — показывать только если у дома есть лифт/насосы.
// optional — не обязательна (гидроизоляция), рендерится галочкой.
const MANDATORY_SERVICES: Array<{ code: string; label_ru: string; label_uz: string; conditional?: 'has_elevator' | 'has_pumps'; optional?: boolean }> = [
  { code: 'electricity_common', label_ru: 'Электроснабжение МОП', label_uz: 'Umumiy joylar elektri' },
  { code: 'elevator_if_present', label_ru: 'Обслуживание лифта', label_uz: 'Lift xizmati', conditional: 'has_elevator' },
  { code: 'facades', label_ru: 'Фасады', label_uz: 'Fasadlar' },
  { code: 'entrances', label_ru: 'Подъезды', label_uz: 'Podyezdlar' },
  { code: 'pumps_if_present', label_ru: 'Насосное оборудование', label_uz: 'Nasos uskunasi', conditional: 'has_pumps' },
  { code: 'roof_waterproofing', label_ru: 'Гидроизоляция кровли', label_uz: 'Tom gidroizolyatsiyasi', optional: true },
  { code: 'basement_shaft_networks', label_ru: 'Сети подвала/шахты', label_uz: 'Yerto\'la/shaxta tarmoqlari' },
  { code: 'gutters', label_ru: 'Водостоки', label_uz: 'Suv oqizgichlar' },
  { code: 'stairwell_lift_cleaning_weekly', label_ru: 'Уборка подъездов (≥1/нед)', label_uz: 'Podyezd tozalash' },
  { code: 'territory_cleaning', label_ru: 'Уборка территории', label_uz: 'Hudud tozaligi' },
  { code: 'sanitation_disinfection', label_ru: 'Санитария и дезинфекция', label_uz: 'Sanitariya' },
  { code: 'fire_safety', label_ru: 'Пожарная безопасность', label_uz: 'Yong\'in xavfsizligi' },
  { code: 'heating_season_prep', label_ru: 'Подготовка к отопительному сезону', label_uz: 'Isitish mavsumi' },
  { code: 'greenery', label_ru: 'Озеленение', label_uz: 'Ko\'kalamzorlashtirish' },
  { code: 'playgrounds', label_ru: 'Детские площадки', label_uz: 'Bolalar maydonchalari' },
  { code: 'paths_parking', label_ru: 'Дорожки и парковка', label_uz: 'Yo\'laklar va avtoturargoh' },
  { code: 'cctv_intercom_dispatch', label_ru: 'Видеонаблюдение/домофон + диспетчер', label_uz: 'Videokuzatuv/domofon' },
];

const STEPS_RU = ['Основа', 'Штат', 'Расходы', 'Доходы и итог'];
const STEPS_UZ = ['Asos', 'Xodimlar', 'Xarajatlar', 'Daromadlar va yakun'];

// ── Компонент ──────────────────────────────────────────────────────

export function EstimateV2WizardPage() {
  const navigate = useNavigate();
  const { language } = useLanguageStore();
  const addToast = useToastStore((s) => s.addToast);
  const buildings = useBuildingStore((s) => s.buildings);
  const fetchBuildings = useBuildingStore((s) => s.fetchBuildings);
  const tenantName = useTenantStore((s) => s.config?.tenant?.name) || 'Kamizo';
  const isDemoSession = useAuthStore((s) => s.user?.demoSession === true);
  // Директор/админ утверждает смету сразу; остальные составители отправляют
  // её на рассмотрение (migration 065 + POST /estimates/:id/submit).
  const mayApprove = useAuthStore((s) => canApproveEstimate(s.user?.role));

  const isRu = language === 'ru';
  const steps = isRu ? STEPS_RU : STEPS_UZ;

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [estimateId, setEstimateId] = useState<string | null>(null);
  const [result, setResult] = useState<EstimateResultV2 | null>(null);
  const [warnings, setWarnings] = useState<EstimateWarning[]>([]);

  // ── Step 1: основные поля ─────────────────────────────────────
  const [buildingId, setBuildingId] = useState('');
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [title, setTitle] = useState('');
  const [model, setModel] = useState<EstimateModelV2>('TARIFF_CALCULATED');
  const [profitPercent, setProfitPercent] = useState(7);
  const [payrollTaxRate, setPayrollTaxRate] = useState(0.24);
  const [tariffApproved, setTariffApproved] = useState<number | ''>('');

  // ── Step 2: штат ──────────────────────────────────────────────
  const [staff, setStaff] = useState<StaffPositionV2[]>([]);

  // ── Step 3: расходы ───────────────────────────────────────────
  const [expenses, setExpenses] = useState<ExpenseLineV2[]>([]);

  // ── Step 4: доходы ────────────────────────────────────────────
  const [incomes, setIncomes] = useState<IncomeStreamV2[]>([]);

  // Периодические расходы применяются в этом году (иначе исключаются из тарифа).
  const [periodicEnabled, setPeriodicEnabled] = useState(true);
  // НДС: УК — плательщик НДС (ставка РУз 12%).
  const [vatEnabled, setVatEnabled] = useState(false);
  const [vatRate, setVatRate] = useState(0.12);

  // Режим сметы: на один дом ('building'), на ЖК ('complex') или черновик
  // без объекта ('unassigned') — объект выбирают позже, при привязке
  // (см. migration 066).
  const [scopeMode, setScopeMode] = useState<'building' | 'complex' | 'unassigned'>('building');
  const [branchCode, setBranchCode] = useState('');           // выбранный ЖК
  const [complexBuildingIds, setComplexBuildingIds] = useState<string[]>([]); // дома ЖК в смете
  const [complexResult, setComplexResult] = useState<import('../../../services/api/finance-v2').ComplexResultV2 | null>(null);
  // Язык выгрузки (по умолчанию — язык интерфейса).
  const [exportLang, setExportLang] = useState<'ru' | 'uz'>(language as 'ru' | 'uz');
  // Показывать прибыль УК жителям (перенесено из легаси-формы).
  const [showProfit, setShowProfit] = useState(false);

  useEffect(() => {
    fetchBuildings();
  }, [fetchBuildings]);

  // Список ЖК (для режима complex).
  const [branches, setBranches] = useState<Array<{ code: string; name: string }>>([]);
  useEffect(() => {
    branchesApi.getAll().then((r) => {
      setBranches((r.branches || []).map((b: any) => ({ code: String(b.code), name: String(b.name || b.code) })));
    }).catch(() => {});
  }, []);
  // Дома выбранного ЖК (из стора, по branchCode).
  const branchBuildings = useMemo(
    () => buildings.filter((b: any) => String(b.branchCode || '') === branchCode),
    [buildings, branchCode],
  );

  // Режим редактирования: ?edit=<id> → загрузить черновик и заполнить шаги.
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');
  // Пока черновик грузится — блокируем «Далее», иначе быстрый клик создаст
  // новую пустую смету (estimateId ещё null) и затрёт штат.
  const [editLoading, setEditLoading] = useState(!!searchParams.get('edit'));
  useEffect(() => {
    if (!editId) return;
    setEditLoading(true);
    (async () => {
      try {
        const full = await estimateV2Api.getFull(editId);
        const est = full.estimate as any;
        const inp = full.input as any;
        setEstimateId(editId);
        setBuildingId(String(est.building_id || ''));
        if (est.period) setPeriod(String(est.period));
        if (est.title) setTitle(String(est.title));
        setModel((inp?.model || est.model || 'TARIFF_CALCULATED') as EstimateModelV2);
        setProfitPercent(Number(est.uk_profit_percent ?? (inp?.object?.profit_rate ?? 0) * 100) || 0);
        setPayrollTaxRate(Number(inp?.object?.payroll_tax_rate ?? est.payroll_tax_rate ?? 0.24));
        setTariffApproved(inp?.tariff_manual ?? (est.tariff_approved || ''));
        setStaff((inp?.staff || []) as StaffPositionV2[]);
        setExpenses((inp?.expenses || []) as ExpenseLineV2[]);
        setIncomes((inp?.incomes || []) as IncomeStreamV2[]);
        setPeriodicEnabled(inp?.object?.periodic_enabled !== false);
        setVatEnabled(!!inp?.object?.vat_enabled);
        setVatRate(Number(inp?.object?.vat_rate ?? 0.12));
        setShowProfit(est.show_profit_to_residents === 1 || est.show_profit_to_residents === true);
        if (est.scope_level === 'unassigned') setScopeMode('unassigned');
        else if (est.scope_level === 'complex') setScopeMode('complex');
      } catch {
        addToast('error', isRu ? 'Не удалось загрузить смету' : 'Smetani yuklab bo\'lmadi');
      } finally {
        setEditLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  // Live-подсчёты для preview (совпадают с движком compute.ts):
  // ФОТ брутто = оклады + резерв отпускных (units*salary*дней/252).
  const fotBase = useMemo(
    () => staff.reduce((s, p) => s + (p.units || 0) * (p.salary || 0), 0),
    [staff]
  );
  const fotVacation = useMemo(
    () => staff.reduce((s, p) => s + ((p.units || 0) * (p.salary || 0) * (p.vacation_days ?? 0)) / (21 * 12), 0),
    [staff]
  );
  const fotGross = fotBase + fotVacation;
  const fotTax = Math.round(fotGross * payrollTaxRate);
  const fotTotal = fotGross + fotTax;
  const expensesTotal = useMemo(
    () => expenses.reduce((s, e) => s + (e.linked_to_staff ? fotTotal : (e.monthly || 0)), 0),
    [expenses, fotTotal]
  );
  const incomeTotal = useMemo(
    () => incomes.reduce((s, i) => s + (i.monthly || 0), 0),
    [incomes]
  );

  const selectedBuilding = useMemo(
    () => buildings.find((b) => b.id === buildingId),
    [buildings, buildingId]
  );

  // ── Действия ──────────────────────────────────────────────────

  const handleAddMandatory = () => {
    // Добавить недостающие обязательные услуги (monthly=0). Пропускаем:
    //  - conditional (лифт/насосы), если у дома их нет;
    //  - optional (гидроизоляция) — они добавляются отдельными галочками.
    const existingCodes = new Set(expenses.map((e) => e.legal_code).filter(Boolean));
    // У черновика без объекта дома ещё нет — условные услуги (лифт, насосы)
    // не подставляем, их добавят после привязки к объекту.
    const hasElevator = !!(selectedBuilding as any)?.hasElevator;
    const hasPumps = !!(selectedBuilding as any)?.hasPumps;
    const toAdd: ExpenseLineV2[] = MANDATORY_SERVICES
      .filter((s) => !s.optional && !existingCodes.has(s.code))
      .filter((s) => !(s.conditional === 'has_elevator' && !hasElevator))
      .filter((s) => !(s.conditional === 'has_pumps' && !hasPumps))
      .map((s) => ({
        name: isRu ? s.label_ru : s.label_uz,
        monthly: 0,
        section: 'production',
        unit: 'flat',
        legal_code: s.code,
      }));
    if (toAdd.length === 0) {
      addToast('info', isRu ? 'Все обязательные услуги добавлены' : 'Barcha majburiy xizmatlar qo\'shilgan');
      return;
    }
    setExpenses([...expenses, ...toAdd]);
    addToast('success', isRu ? `Добавлено ${toAdd.length} статей` : `${toAdd.length} modda qo'shildi`);
  };

  // Опциональная услуга (гидроизоляция): галочка добавляет/убирает строку.
  const toggleOptionalService = (code: string, checked: boolean) => {
    const svc = MANDATORY_SERVICES.find((s) => s.code === code);
    if (!svc) return;
    if (checked) {
      if (expenses.some((e) => e.legal_code === code)) return;
      setExpenses([...expenses, {
        name: isRu ? svc.label_ru : svc.label_uz,
        monthly: 0, section: 'production', unit: 'flat', legal_code: code,
      }]);
    } else {
      setExpenses(expenses.filter((e) => e.legal_code !== code));
    }
  };

  const handleAddLinkedToStaff = () => {
    // Один клик — добавить строку "Расходы по зарплате" c linked_to_staff=true
    if (expenses.some((e) => e.linked_to_staff)) {
      addToast('info', isRu ? 'Строка ФОТ уже есть' : 'FOT allaqachon');
      return;
    }
    setExpenses([
      ...expenses,
      {
        name: isRu ? 'Расходы по заработной плате (ФОТ + налог)' : 'Ish haqi (FOT + soliq)',
        monthly: 0,
        section: 'production',
        unit: 'staff_computed',
        linked_to_staff: true,
      },
    ]);
  };

  // Сохранить + пересчитать. На каждом шаге: если estimateId нет — POST create;
  // затем PUT соответствующего массива; на последнем шаге дёрнуть /compute + /validate.
  const persistCurrentStep = async (): Promise<boolean> => {
    if (isDemoSession) return false;
    setSaving(true);
    try {
      let id = estimateId;
      const isComplex = scopeMode === 'complex';
      const isUnassigned = scopeMode === 'unassigned';
      if (!id) {
        if (isComplex && complexBuildingIds.length === 0) {
          addToast('warning', isRu ? 'Выберите ЖК и дома' : 'JK va uylarni tanlang');
          return false;
        }
        if (!isComplex && !isUnassigned && !buildingId) {
          addToast('warning', isRu ? 'Выберите дом' : 'Uyni tanlang');
          return false;
        }
        const created = await estimateV2Api.create({
          building_id: isComplex || isUnassigned ? undefined : buildingId,
          period,
          title: title || undefined,
          model,
          uk_profit_percent: profitPercent,
          payroll_tax_rate: payrollTaxRate,
          tariff_approved: model === 'TARIFF_MANUAL' && typeof tariffApproved === 'number'
            ? tariffApproved
            : undefined,
          ...(isComplex ? {
            scope_level: 'complex' as const,
            branch_code: branchCode,
            buildings: complexBuildingIds.map((bid) => ({ building_id: bid })),
          } : {}),
          ...(isUnassigned ? { scope_level: 'unassigned' as const } : {}),
        });
        id = created.id;
        setEstimateId(id);
      }

      if (step === 1) await estimateV2Api.putStaff(id, staff);
      if (step === 2) await estimateV2Api.putExpenses(id, expenses);
      if (step === 3) {
        await estimateV2Api.putIncomes(id, incomes);
        // Сохранить флаги сметы (периодика, НДС) до пересчёта.
        await estimateV2Api.putSettings(id, {
          periodic_enabled: periodicEnabled,
          vat_enabled: vatEnabled,
          vat_rate: vatRate,
          show_profit_to_residents: showProfit,
        });
        // финальный пересчёт + валидация
        const [computeRes, validateRes] = await Promise.all([
          estimateV2Api.compute(id),
          estimateV2Api.validate(id),
        ]);
        setResult(computeRes.result);
        setComplexResult(computeRes.complexResult || null);
        setWarnings(validateRes.warnings);
      }
      return true;
    } catch (e: any) {
      addToast('error', e?.message || 'Ошибка сохранения');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    const ok = await persistCurrentStep();
    if (!ok) return;
    if (step < steps.length - 1) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  // Финал мастера. У утверждающего — сразу утвердить (POST /activate),
  // у остальных составителей — отправить на рассмотрение (POST /submit).
  // Черновик без объекта не проходит ни то ни другое: сперва его привязывают
  // к объекту в списке смет (бэкенд вернёт 400 на обе попытки).
  const handleFinish = async () => {
    if (isDemoSession || !estimateId) return;
    if (scopeMode === 'unassigned') {
      addToast('success', isRu ? 'Черновик сохранён' : 'Qoralama saqlandi');
      navigate('/finance/estimates');
      return;
    }
    setSaving(true);
    try {
      const { financeApi } = await import('../../../services/api');
      if (mayApprove) {
        await financeApi.activateEstimate(estimateId);
        addToast('success', isRu ? 'Смета утверждена' : 'Smeta tasdiqlandi');
      } else {
        await financeApi.submitEstimate(estimateId);
        addToast('success', isRu
          ? 'Смета отправлена на утверждение'
          : 'Smeta tasdiqlashga yuborildi');
      }
      navigate('/finance/estimates');
    } catch (e: any) {
      addToast('error', e?.message || (isRu ? 'Ошибка' : 'Xatolik'));
    } finally {
      setSaving(false);
    }
  };

  // Скачать Excel из текущего состояния мастера. Доступно только после
  // «Пересчитать» (есть result) — берём готовые цифры тарифа из него.
  const handleDownloadExcel = async () => {
    if (!result) return;
    try {
      const b = selectedBuilding as any; // стор отдаёт camelCase (totalArea/livingArea/…)
      // У черновика без объекта дома ещё нет — в шапку идёт заглушка.
      const buildingHeader = scopeMode === 'unassigned'
        ? {
            name: isRu ? 'Без объекта' : 'Obyektsiz',
            address: undefined,
            totalArea: 0,
            livingArea: 0,
            floors: undefined,
            entrances: undefined,
            apartments: undefined,
            hasElevator: false,
          }
        : {
            name: b?.name || '',
            address: b?.address || undefined,
            // Стор отдаёт площадь как totalArea/livingArea (camelCase). Раньше читали
            // total_area → undefined → 0, из-за чего колонка «Тариф 1 м²» была пустой.
            totalArea: b?.totalArea || 0,
            livingArea: b?.livingArea || 0,
            floors: b?.floors,
            entrances: b?.entrances,
            apartments: b?.totalApartments,
            hasElevator: b?.hasElevator,
          };
      await generateEstimateV2Excel({
        period,
        title: title || undefined,
        status: 'draft',
        model,
        profitPercent,
        payrollTaxRate,
        building: buildingHeader,
        staff: result.staff_lines,
        vacationReserve: result.fot_vacation,
        payrollTax: result.payroll_tax,
        expenses,
        incomes,
        result,
        complexBuildings: complexResult?.buildings.map((cb) => ({
          building_id: cb.building_id,
          name: String((buildings as any[]).find((x) => String(x.id) === cb.building_id)?.name || cb.building_id),
          residential_area: cb.residential_area,
          share: cb.share,
          self_expense: cb.self_expense,
          self_cost_resident: cb.self_cost_resident,
          base_per_m2: cb.base_per_m2,
          with_profit_per_m2: cb.with_profit_per_m2,
          telecom_comp_per_m2: cb.telecom_comp_per_m2,
          tariff_resident: cb.tariff_resident,
          tariff_effective: cb.tariff_effective,
          vat_per_m2: cb.vat_per_m2,
          tariff_with_vat: cb.tariff_with_vat,
        })),
        complexFotTotal: complexResult?.fot_total,
        branchName: branchCode ? String(branches.find((br) => br.code === branchCode)?.name || branchCode) : undefined,
        language: exportLang,
        tenantName,
      });
    } catch (e: any) {
      addToast('error', e?.message || (isRu ? 'Ошибка выгрузки Excel' : 'Excel xatosi'));
    }
  };

  // ── Рендер ────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {editId ? (isRu ? 'Редактирование сметы' : 'Smetani tahrirlash') : (isRu ? 'Новая смета' : 'Yangi smeta')}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isRu
              ? 'Мастер расчёта тарифа с учётом штата, доходов и Ташкентского минимума'
              : 'Xodimlar, daromadlar va Toshkent minimum tarifi bilan hisoblash ustasi'}
          </p>
        </div>
        <button
          onClick={() => navigate('/finance/estimates')}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          {isRu ? '← К списку' : '← Ro\'yxatga'}
        </button>
      </div>

      {isDemoSession && <FinanceDemoReadOnlyBanner />}

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {steps.map((label, i) => (
          <div key={i} className="flex-1 flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                i < step
                  ? 'bg-primary-500 text-white'
                  : i === step
                    ? 'bg-primary-100 text-primary-700 ring-2 ring-primary-500'
                    : 'bg-gray-100 text-gray-400'
              }`}
            >
              {i + 1}
            </div>
            <span className={`text-sm hidden sm:inline ${i === step ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>
              {label}
            </span>
            {i < steps.length - 1 && <div className="flex-1 h-px bg-gray-200 mx-1" />}
          </div>
        ))}
      </div>

      {/* Step body */}
      <div className="glass-card p-4 sm:p-6">
        {step === 0 && (
          <div className="space-y-4">
            {/* Режим сметы: на дом / на ЖК */}
            <div>
              <div className="text-xs font-medium text-gray-600 mb-1">{isRu ? 'Тип сметы' : 'Smeta turi'}</div>
              <div className="inline-flex flex-wrap rounded-lg border border-gray-200 overflow-hidden text-sm">
                {(['building', 'complex', 'unassigned'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={!!editId}
                    onClick={() => setScopeMode(m)}
                    className={`px-4 py-2 font-medium ${scopeMode === m ? 'bg-primary-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'} disabled:opacity-50`}
                  >
                    {m === 'building' && (isRu ? 'На один дом' : 'Bitta uy')}
                    {m === 'complex' && (isRu ? 'На ЖК (объект)' : 'JK (obyekt)')}
                    {m === 'unassigned' && (isRu ? 'Без объекта' : 'Obyektsiz')}
                  </button>
                ))}
              </div>
              {scopeMode === 'unassigned' && (
                <p className="mt-2 text-xs text-gray-500">
                  {isRu
                    ? 'Черновик сохранится без объекта. Тариф посчитается после того, как смету привяжут к объекту в списке смет.'
                    : "Qoralama obyektsiz saqlanadi. Tarif smeta obyektga bog'langanidan keyin hisoblanadi."}
                </p>
              )}
            </div>

            {/* Выбор ЖК и его домов (complex) */}
            {scopeMode === 'complex' && (
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{isRu ? 'ЖК (объект)' : 'JK (obyekt)'}</label>
                  <select
                    value={branchCode}
                    onChange={(e) => {
                      const code = e.target.value;
                      setBranchCode(code);
                      const ids = buildings.filter((b: any) => String(b.branchCode || '') === code).map((b: any) => String(b.id));
                      setComplexBuildingIds(ids);
                    }}
                    className="w-full sm:w-96 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">{isRu ? '— выберите ЖК —' : '— JK tanlang —'}</option>
                    {branches.map((br) => (
                      <option key={br.code} value={br.code}>{br.name}</option>
                    ))}
                  </select>
                </div>
                {branchCode && (
                  <div>
                    <div className="text-xs font-medium text-gray-600 mb-1">{isRu ? 'Дома в смете' : 'Smetadagi uylar'}</div>
                    {branchBuildings.length === 0 ? (
                      <div className="text-sm text-gray-400">{isRu ? 'В этом ЖК нет домов' : 'Bu JKda uylar yo\'q'}</div>
                    ) : (
                      <div className="flex flex-wrap gap-x-4 gap-y-2">
                        {branchBuildings.map((b: any) => {
                          const id = String(b.id);
                          const checked = complexBuildingIds.includes(id);
                          return (
                            <label key={id} className="inline-flex items-center gap-2 text-sm cursor-pointer">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(ev) => setComplexBuildingIds((prev) =>
                                  ev.target.checked ? [...prev, id] : prev.filter((x) => x !== id))}
                                className="rounded border-gray-300 text-primary-500"
                              />
                              {String(b.name)}{b.livingArea ? ` · ${Math.round(b.livingArea)} м²` : ''}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

          <Step1Basics
            scopeMode={scopeMode}
            buildings={buildings as any}
            buildingId={buildingId}
            setBuildingId={setBuildingId}
            period={period}
            setPeriod={setPeriod}
            title={title}
            setTitle={setTitle}
            model={model}
            setModel={setModel}
            profitPercent={profitPercent}
            setProfitPercent={setProfitPercent}
            payrollTaxRate={payrollTaxRate}
            setPayrollTaxRate={setPayrollTaxRate}
            tariffApproved={tariffApproved}
            setTariffApproved={setTariffApproved}
            vatEnabled={vatEnabled}
            setVatEnabled={setVatEnabled}
            vatRate={vatRate}
            setVatRate={setVatRate}
            showProfit={showProfit}
            setShowProfit={setShowProfit}
            isRu={isRu}
          />
          </div>
        )}

        {step === 1 && (
          <Step2Staff
            staff={staff}
            setStaff={setStaff}
            fotGross={fotGross}
            fotVacation={fotVacation}
            fotTax={fotTax}
            fotTotal={fotTotal}
            payrollTaxRate={payrollTaxRate}
            isRu={isRu}
          />
        )}

        {step === 2 && (
          <Step3Expenses
            expenses={expenses}
            setExpenses={setExpenses}
            fotTotal={fotTotal}
            onAddMandatory={handleAddMandatory}
            onAddLinkedToStaff={handleAddLinkedToStaff}
            periodicEnabled={periodicEnabled}
            setPeriodicEnabled={setPeriodicEnabled}
            toggleOptionalService={toggleOptionalService}
            scopeBuildings={scopeMode === 'complex' ? complexBuildingIds.map((id) => ({ id, name: String((buildings as any[]).find((b) => String(b.id) === id)?.name || id) })) : []}
            isRu={isRu}
          />
        )}

        {step === 3 && (
          <Step4IncomesAndResult
            incomes={incomes}
            setIncomes={setIncomes}
            expensesTotal={expensesTotal}
            incomeTotal={incomeTotal}
            residentialArea={selectedBuilding?.totalArea || 0}
            profitPercent={profitPercent}
            result={result}
            complexResult={complexResult}
            buildingNameMap={Object.fromEntries((buildings as any[]).map((b) => [String(b.id), String(b.name)]))}
            scopeBuildings={scopeMode === 'complex' ? complexBuildingIds.map((id) => ({ id, name: String((buildings as any[]).find((b) => String(b.id) === id)?.name || id) })) : []}
            warnings={warnings}
            unassigned={scopeMode === 'unassigned'}
            isRu={isRu}
          />
        )}
      </div>

      {/* Footer nav */}
      <div className="flex items-center justify-between">
        <button
          onClick={handleBack}
          disabled={step === 0 || saving}
          className="px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isRu ? '← Назад' : '← Orqaga'}
        </button>

        <div className="flex items-center gap-2">
          {!isDemoSession && step === steps.length - 1 && result && (
            <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs">
              {(['ru', 'uz'] as const).map((lng) => (
                <button
                  key={lng}
                  onClick={() => setExportLang(lng)}
                  className={`px-2.5 py-2 font-semibold ${exportLang === lng ? 'bg-primary-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  {lng.toUpperCase()}
                </button>
              ))}
            </div>
          )}
          {!isDemoSession && step === steps.length - 1 && result && (
            <button
              onClick={handleDownloadExcel}
              disabled={saving}
              className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 font-semibold disabled:opacity-50"
            >
              {isRu ? '⬇ Скачать Excel' : '⬇ Excel yuklash'}
            </button>
          )}
          {!isDemoSession && step === steps.length - 1 && result && (
            <button
              onClick={handleFinish}
              disabled={saving}
              className={`px-5 py-2.5 rounded-xl text-white font-semibold disabled:opacity-50 ${
                scopeMode === 'unassigned'
                  ? 'bg-gray-700 hover:bg-gray-800'
                  : mayApprove ? 'bg-green-600 hover:bg-green-700' : 'bg-amber-500 hover:bg-amber-600'
              }`}
            >
              {saving
                ? '...'
                : scopeMode === 'unassigned'
                  ? (isRu ? 'Сохранить черновик' : 'Qoralamani saqlash')
                  : mayApprove
                    ? (isRu ? 'Утвердить смету' : 'Smetani tasdiqlash')
                    : (isRu ? 'Отправить на утверждение' : 'Tasdiqlashga yuborish')}
            </button>
          )}
          {!isDemoSession && <button
            onClick={handleNext}
            disabled={saving || editLoading}
            className="px-5 py-2.5 rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-semibold disabled:opacity-50"
          >
            {editLoading ? (isRu ? 'Загрузка…' : 'Yuklanmoqda…') : saving ? '...' : step === steps.length - 1 ? (isRu ? 'Пересчитать' : 'Qayta hisoblash') : (isRu ? 'Далее →' : 'Keyingi →')}
          </button>}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// STEP 1 — Основа
// ═══════════════════════════════════════════════════════════════════

function Step1Basics(props: {
  buildings: Array<{ id: string; name: string; total_area?: number; residential_area?: number }>;
  buildingId: string; setBuildingId: (v: string) => void;
  period: string; setPeriod: (v: string) => void;
  title: string; setTitle: (v: string) => void;
  model: EstimateModelV2; setModel: (v: EstimateModelV2) => void;
  profitPercent: number; setProfitPercent: (v: number) => void;
  payrollTaxRate: number; setPayrollTaxRate: (v: number) => void;
  tariffApproved: number | ''; setTariffApproved: (v: number | '') => void;
  vatEnabled: boolean; setVatEnabled: (v: boolean) => void;
  vatRate: number; setVatRate: (v: number) => void;
  showProfit: boolean; setShowProfit: (v: boolean) => void;
  scopeMode: 'building' | 'complex' | 'unassigned';
  isRu: boolean;
}) {
  const { buildings, isRu } = props;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Справочник домов не показываем ни для ЖК (там свой выбор), ни для
            объекта вне обслуживания (его в справочнике нет вовсе). */}
        {props.scopeMode === 'building' && (
        <Field label={isRu ? 'Дом (объект)' : 'Uy'} required>
          <select
            value={props.buildingId}
            onChange={(e) => props.setBuildingId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
          >
            <option value="">{isRu ? '— выберите —' : '— tanlang —'}</option>
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </Field>
        )}

        <Field label={isRu ? 'Период (месяц)' : 'Davr (oy)'} required>
          <input
            type="month"
            value={props.period}
            onChange={(e) => props.setPeriod(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
          />
        </Field>

        <Field label={isRu ? 'Название сметы' : 'Smeta nomi'}>
          <input
            type="text"
            value={props.title}
            onChange={(e) => props.setTitle(e.target.value)}
            placeholder={isRu ? `Смета ${props.period}` : `Smeta ${props.period}`}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
          />
        </Field>

        <Field label={isRu ? 'Модель расчёта' : 'Hisoblash modeli'} required>
          <select
            value={props.model}
            onChange={(e) => props.setModel(e.target.value as EstimateModelV2)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
          >
            <option value="TARIFF_CALCULATED">{isRu ? 'Расчётный тариф (главная)' : 'Hisoblangan tarif'}</option>
            <option value="TARIFF_MANUAL">{isRu ? 'Ручной тариф' : 'Qo\'lda tarif'}</option>
            <option value="TARIFF_FLAT">{isRu ? 'Плоское деление' : 'Tekis bo\'lish'}</option>
          </select>
        </Field>

        <Field label={isRu ? 'Прибыль УК, %' : 'UK foyda, %'}>
          <NumericInput
            decimal
            value={props.profitPercent}
            onChange={(n) => props.setProfitPercent(n)}
            placeholder={isRu ? 'напр. 9' : 'masalan 9'}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
          />
        </Field>

        <Field label={isRu ? 'Соцналог + НДФЛ, доля' : 'Soliq + NDFL, ulush'}>
          <select
            value={props.payrollTaxRate}
            onChange={(e) => props.setPayrollTaxRate(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
          >
            <option value={0.24}>0.24 (12% + 12%)</option>
            <option value={0.25}>0.25 (12.5% + 12.5%)</option>
          </select>
        </Field>

        {props.model === 'TARIFF_MANUAL' && (
          <Field label={isRu ? 'Утверждённый тариф, сум/м²' : 'Tasdiqlangan tarif, so\'m/m²'}>
            <NumericInput
              value={typeof props.tariffApproved === 'number' ? props.tariffApproved : 0}
              onChange={(n) => props.setTariffApproved(n === 0 ? '' : n)}
              placeholder={isRu ? 'напр. 2 700' : 'masalan 2 700'}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            />
          </Field>
        )}
      </div>

      {/* НДС */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={props.vatEnabled}
            onChange={(e) => props.setVatEnabled(e.target.checked)}
            className="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
          />
          <span className="font-medium">{isRu ? 'УК — плательщик НДС' : 'BT — QQS to\'lovchisi'}</span>
        </label>
        {props.vatEnabled && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">{isRu ? 'Ставка НДС, %' : 'QQS stavkasi, %'}</span>
            <NumericInput
              decimal
              value={Math.round(props.vatRate * 100 * 10) / 10}
              onChange={(n) => props.setVatRate((n || 0) / 100)}
              placeholder="12"
              className="w-20 px-2 py-1 rounded-lg border border-gray-200 bg-white text-sm text-right focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>
        )}
        {props.vatEnabled && (
          <div className="w-full text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5">
            {isRu
              ? '⚠️ Расходы вводите БЕЗ НДС (входящий НДС УК зачитывает). НДС 12% начисляется сверху на тариф — иначе НДС задвоится.'
              : '⚠️ Xarajatlarni QQSsiz kiriting. QQS 12% tarifga ustidan qo\'shiladi.'}
          </div>
        )}
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={props.showProfit}
            onChange={(e) => props.setShowProfit(e.target.checked)}
            className="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
          />
          <span className="font-medium">{isRu ? 'Показывать прибыль УК жителям' : 'Foydani aholiga ko\'rsatish'}</span>
        </label>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// STEP 2 — Штат
// ═══════════════════════════════════════════════════════════════════

function Step2Staff(props: {
  staff: StaffPositionV2[]; setStaff: (v: StaffPositionV2[]) => void;
  fotGross: number; fotVacation: number; fotTax: number; fotTotal: number; payrollTaxRate: number;
  isRu: boolean;
}) {
  const { staff, setStaff, fotGross, fotVacation, fotTax, fotTotal, payrollTaxRate, isRu } = props;

  const update = (i: number, patch: Partial<StaffPositionV2>) => {
    const next = [...staff];
    next[i] = { ...next[i], ...patch };
    setStaff(next);
  };
  const remove = (i: number) => setStaff(staff.filter((_, k) => k !== i));
  // Новая позиция: 21 день отпуска по умолчанию (минимум ТК РУз).
  const add = () => setStaff([...staff, { title: '', units: 1, salary: 0, vacation_days: 21 }]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{isRu ? 'Штатное расписание' : 'Xodimlar jadvali'}</h2>
        <button onClick={add} className="btn-primary text-sm">
          + {isRu ? 'Позиция' : 'Lavozim'}
        </button>
      </div>

      {staff.length === 0 ? (
        <div className="text-center text-gray-400 py-8 text-sm">
          {isRu ? 'Нет позиций. Добавьте штатные единицы.' : 'Lavozimlar yo\'q.'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b">
                <th className="text-left py-2 pr-2 font-medium">{isRu ? 'Должность' : 'Lavozim'}</th>
                <th className="text-right py-2 px-2 font-medium w-24">{isRu ? 'Ед.' : 'Birlik'}</th>
                <th className="text-right py-2 px-2 font-medium w-36">{isRu ? 'Оклад, сум' : 'Maosh, so\'m'}</th>
                <th className="text-right py-2 px-2 font-medium w-24">{isRu ? 'Отпуск, дн.' : 'Ta\'til, kun'}</th>
                <th className="text-right py-2 px-2 font-medium w-36">{isRu ? 'Итого/мес' : 'Jami/oy'}</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s, i) => (
                <tr key={i} className="border-b hover:bg-gray-50">
                  <td className="py-1.5 pr-2">
                    <input
                      type="text"
                      value={s.title}
                      onChange={(e) => update(i, { title: e.target.value })}
                      placeholder={isRu ? 'Например: Дворник' : 'Masalan: Farrosh'}
                      className="w-full px-2 py-1 rounded border border-gray-200 bg-white text-sm focus:ring-1 focus:ring-primary-500 focus:border-transparent outline-none"
                    />
                  </td>
                  <td className="py-1.5 px-2">
                    <NumericInput
                      decimal
                      value={s.units}
                      onChange={(n) => update(i, { units: n })}
                      placeholder="1"
                      className="w-full px-2 py-1 rounded border border-gray-200 bg-white text-sm text-right focus:ring-1 focus:ring-primary-500 focus:border-transparent outline-none"
                    />
                  </td>
                  <td className="py-1.5 px-2">
                    <NumericInput
                      value={s.salary}
                      onChange={(n) => update(i, { salary: n })}
                      placeholder={isRu ? 'оклад' : 'oylik'}
                      className="w-full px-2 py-1 rounded border border-gray-200 bg-white text-sm text-right focus:ring-1 focus:ring-primary-500 focus:border-transparent outline-none"
                    />
                  </td>
                  <td className="py-1.5 px-2">
                    <NumericInput
                      value={s.vacation_days ?? 21}
                      onChange={(n) => update(i, { vacation_days: n })}
                      placeholder="21"
                      className="w-full px-2 py-1 rounded border border-gray-200 bg-white text-sm text-right focus:ring-1 focus:ring-primary-500 focus:border-transparent outline-none"
                    />
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums font-medium">
                    {fmt((s.units || 0) * (s.salary || 0))}
                  </td>
                  <td className="py-1.5 px-2 text-right">
                    <button onClick={() => remove(i)} className="text-red-500 hover:text-red-700 text-sm">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Итог ФОТ */}
      <div className="bg-primary-50 border border-primary-100 rounded-xl p-4 space-y-1 text-sm">
        <div className="flex justify-between">
          <span>{isRu ? 'ФОТ (брутто, с отпускными)' : 'FOT (brutto)'}:</span>
          <span className="tabular-nums font-medium">{fmt(fotGross)} сум</span>
        </div>
        {fotVacation > 0 && (
          <div className="flex justify-between text-gray-500 text-xs">
            <span>{isRu ? '↳ в т.ч. резерв отпускных' : '↳ shu jumladan ta\'til rezervi'}:</span>
            <span className="tabular-nums">{fmt(fotVacation)} сум</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>{isRu ? `Налог на ФОТ (${(payrollTaxRate * 100).toFixed(0)}%)` : `FOT solig'i (${(payrollTaxRate * 100).toFixed(0)}%)`}:</span>
          <span className="tabular-nums font-medium">{fmt(fotTax)} сум</span>
        </div>
        <div className="flex justify-between pt-2 border-t border-primary-200 font-bold">
          <span>{isRu ? 'ФОТ (итого)' : 'FOT (jami)'}:</span>
          <span className="tabular-nums text-primary-700">{fmt(fotTotal)} сум</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// STEP 3 — Расходы
// ═══════════════════════════════════════════════════════════════════

function Step3Expenses(props: {
  expenses: ExpenseLineV2[]; setExpenses: (v: ExpenseLineV2[]) => void;
  fotTotal: number;
  onAddMandatory: () => void; onAddLinkedToStaff: () => void;
  periodicEnabled: boolean; setPeriodicEnabled: (v: boolean) => void;
  toggleOptionalService: (code: string, checked: boolean) => void;
  scopeBuildings: Array<{ id: string; name: string }>;
  isRu: boolean;
}) {
  const {
    expenses, setExpenses, fotTotal, onAddMandatory, onAddLinkedToStaff,
    periodicEnabled, setPeriodicEnabled, toggleOptionalService, scopeBuildings, isRu,
  } = props;

  const update = (i: number, patch: Partial<ExpenseLineV2>) => {
    const next = [...expenses];
    next[i] = { ...next[i], ...patch };
    setExpenses(next);
  };
  const remove = (i: number) => setExpenses(expenses.filter((_, k) => k !== i));
  const addBlank = () =>
    setExpenses([...expenses, { name: '', monthly: 0, section: 'production', unit: 'flat' }]);

  const optionalServices = MANDATORY_SERVICES.filter((s) => s.optional);

  const productionTotal = expenses
    .filter((e) => e.section === 'production')
    .reduce((s, e) => s + (e.linked_to_staff ? fotTotal : e.monthly || 0), 0);
  const periodicTotal = expenses
    .filter((e) => e.section === 'periodic')
    .reduce((s, e) => s + (e.linked_to_staff ? fotTotal : e.monthly || 0), 0);
  // Если периодика выключена — она не входит в итог (как на бэкенде).
  const grandTotal = productionTotal + (periodicEnabled ? periodicTotal : 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold">{isRu ? 'Статьи расходов' : 'Xarajat moddalari'}</h2>
        <div className="flex gap-2 flex-wrap">
          <button onClick={onAddLinkedToStaff} className="btn-secondary text-sm">
            + {isRu ? 'ФОТ строка' : 'FOT'}
          </button>
          <button onClick={onAddMandatory} className="btn-secondary text-sm">
            + {isRu ? 'Чек-лист 16 услуг' : '16 xizmat'}
          </button>
          <button onClick={addBlank} className="btn-primary text-sm">
            + {isRu ? 'Статья' : 'Modda'}
          </button>
        </div>
      </div>

      {/* Опциональные услуги (галочки) — например гидроизоляция кровли */}
      {optionalServices.length > 0 && (
        <div className="flex flex-wrap gap-3 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
          <span className="text-xs font-medium text-amber-800 self-center">
            {isRu ? 'Опциональные услуги:' : 'Ixtiyoriy xizmatlar:'}
          </span>
          {optionalServices.map((s) => {
            const checked = expenses.some((e) => e.legal_code === s.code);
            return (
              <label key={s.code} className="inline-flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(ev) => toggleOptionalService(s.code, ev.target.checked)}
                  className="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                />
                {isRu ? s.label_ru : s.label_uz}
              </label>
            );
          })}
        </div>
      )}

      {/* Тумблер: применяются ли периодические расходы в этом году */}
      <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={periodicEnabled}
          onChange={(ev) => setPeriodicEnabled(ev.target.checked)}
          className="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
        />
        <span className="font-medium">
          {isRu ? 'Периодические расходы применяются в этом году' : 'Davriy xarajatlar shu yili qo\'llaniladi'}
        </span>
      </label>

      {expenses.length === 0 ? (
        <div className="text-center text-gray-400 py-8 text-sm">
          {isRu ? 'Пусто. Начните с «16 услуг» или добавьте статью.' : 'Bo\'sh. 16 xizmatdan boshlang.'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b">
                <th className="text-left py-2 pr-2 font-medium">{isRu ? 'Наименование' : 'Nomi'}</th>
                <th className="text-left py-2 px-2 font-medium w-32">{isRu ? 'Секция' : 'Bo\'lim'}</th>
                <th className="text-right py-2 px-2 font-medium w-36">{isRu ? 'В месяц, сум' : 'Oyiga, so\'m'}</th>
                <th className="text-right py-2 px-2 font-medium w-36">{isRu ? 'В год' : 'Yiliga'}</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e, i) => {
                const monthly = e.linked_to_staff ? fotTotal : (e.monthly || 0);
                return (
                  <tr key={i} className="border-b hover:bg-gray-50">
                    <td className="py-1.5 pr-2">
                      <input
                        type="text"
                        value={e.name}
                        onChange={(ev) => update(i, { name: ev.target.value })}
                        className="w-full px-2 py-1 rounded border border-gray-200 bg-white text-sm focus:ring-1 focus:ring-primary-500 focus:border-transparent outline-none"
                        placeholder={isRu ? 'Например: Уборка' : 'Masalan: Tozalash'}
                      />
                      {e.linked_to_staff && (
                        <div className="text-[10px] text-primary-600 mt-0.5">
                          {isRu ? '↳ авто из штата (Шаг 2)' : '↳ Xodimlardan avtomatik'}
                        </div>
                      )}
                      {e.legal_code && (
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          {e.legal_code}
                        </div>
                      )}
                    </td>
                    <td className="py-1.5 px-2">
                      <select
                        value={e.section || 'production'}
                        onChange={(ev) => update(i, { section: ev.target.value as any })}
                        className="w-full px-2 py-1 rounded border border-gray-200 bg-white text-xs focus:ring-1 focus:ring-primary-500 outline-none"
                      >
                        <option value="production">{isRu ? 'Производ.' : 'Ishlab ch.'}</option>
                        <option value="periodic">{isRu ? 'Периодич.' : 'Davriy'}</option>
                      </select>
                      {scopeBuildings.length > 0 && (
                        <select
                          value={e.building_id || ''}
                          onChange={(ev) => update(i, { building_id: ev.target.value || undefined })}
                          className="mt-1 w-full px-2 py-1 rounded border border-gray-200 bg-white text-xs focus:ring-1 focus:ring-primary-500 outline-none"
                          title={isRu ? 'На какие дома' : 'Qaysi uylarga'}
                        >
                          <option value="">{isRu ? 'Все дома' : 'Barcha uylar'}</option>
                          {scopeBuildings.map((b) => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="py-1.5 px-2">
                      <NumericInput
                        value={e.linked_to_staff ? fotTotal : (e.monthly || 0)}
                        disabled={!!e.linked_to_staff}
                        blankZero={!e.linked_to_staff}
                        onChange={(n) => update(i, { monthly: n })}
                        placeholder={isRu ? 'сумма/мес' : 'summa/oy'}
                        className="w-full px-2 py-1 rounded border border-gray-200 bg-white text-sm text-right focus:ring-1 focus:ring-primary-500 outline-none disabled:bg-gray-100 disabled:text-gray-500"
                      />
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums font-medium">
                      {fmt(monthly * 12)}
                    </td>
                    <td className="py-1.5 px-2 text-right">
                      <button onClick={() => remove(i)} className="text-red-500 hover:text-red-700 text-sm">✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-primary-50 border border-primary-100 rounded-xl p-4 space-y-1 text-sm">
        <div className="flex justify-between">
          <span>{isRu ? 'Производственные' : 'Ishlab chiqarish'}:</span>
          <span className="tabular-nums font-medium">{fmt(productionTotal)} сум/мес</span>
        </div>
        <div className={`flex justify-between ${periodicEnabled ? '' : 'opacity-40 line-through'}`}>
          <span>{isRu ? 'Периодические' : 'Davriy'}{periodicEnabled ? '' : (isRu ? ' (выкл)' : ' (o\'chiq)')}:</span>
          <span className="tabular-nums font-medium">{fmt(periodicTotal)} сум/мес</span>
        </div>
        <div className="flex justify-between pt-2 border-t border-primary-200 font-bold">
          <span>{isRu ? 'Итого расходы' : 'Jami xarajatlar'}:</span>
          <span className="tabular-nums text-primary-700">{fmt(grandTotal)} сум/мес</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// STEP 4 — Доходы + Итог + Warnings
// ═══════════════════════════════════════════════════════════════════

function Step4IncomesAndResult(props: {
  incomes: IncomeStreamV2[]; setIncomes: (v: IncomeStreamV2[]) => void;
  expensesTotal: number; incomeTotal: number; residentialArea: number; profitPercent: number;
  result: EstimateResultV2 | null;
  complexResult?: import('../../../services/api/finance-v2').ComplexResultV2 | null;
  buildingNameMap?: Record<string, string>;
  scopeBuildings?: Array<{ id: string; name: string }>;
  warnings: EstimateWarning[];
  // Черновик без объекта: тариф и разрыв нулевые по построению, красным не пугаем.
  unassigned?: boolean;
  isRu: boolean;
}) {
  const { incomes, setIncomes, result, complexResult, buildingNameMap = {}, scopeBuildings = [], warnings, unassigned = false, isRu } = props;

  const update = (i: number, patch: Partial<IncomeStreamV2>) => {
    const next = [...incomes];
    next[i] = { ...next[i], ...patch };
    setIncomes(next);
  };
  const remove = (i: number) => setIncomes(incomes.filter((_, k) => k !== i));
  const add = (type: IncomeType) => setIncomes([...incomes, { type, monthly: 0 }]);

  return (
    <div className="space-y-6">
      {/* Доходы */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-bold">{isRu ? 'Доходные потоки' : 'Daromadlar'}</h2>
          <div className="flex gap-2 flex-wrap text-sm">
            <button onClick={() => add('commercial')} className="btn-secondary text-xs">+ {isRu ? 'Коммерция' : 'Tijorat'}</button>
            <button onClick={() => add('basement')} className="btn-secondary text-xs">+ {isRu ? 'Подвал' : 'Yerto\'la'}</button>
            <button onClick={() => add('parking')} className="btn-secondary text-xs">+ {isRu ? 'Парковка' : 'Avtoturargoh'}</button>
            <button onClick={() => add('telecom')} className="btn-secondary text-xs">+ {isRu ? 'Телеком' : 'Telekom'}</button>
            <button onClick={() => add('advertising')} className="btn-secondary text-xs">+ {isRu ? 'Реклама' : 'Reklama'}</button>
          </div>
        </div>

        {incomes.length === 0 ? (
          <div className="text-center text-gray-400 py-6 text-sm">
            {isRu ? 'Нет доходов. Коммерция/подвал/парковка/реклама удешевляют тариф жителям, телеком компенсирует после наценки.' : 'Daromadlar yo\'q.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b">
                <th className="text-left py-2 font-medium">{isRu ? 'Тип' : 'Turi'}</th>
                <th className="text-right py-2 px-2 font-medium w-40">{isRu ? 'В месяц, сум' : 'Oyiga, so\'m'}</th>
                <th className="text-right py-2 px-2 font-medium w-36">{isRu ? 'В год' : 'Yiliga'}</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {incomes.map((inc, i) => (
                <tr key={i} className="border-b hover:bg-gray-50">
                  <td className="py-1.5 pr-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded text-xs">
                      {inc.type}
                    </span>
                    {scopeBuildings.length > 0 && (
                      <select
                        value={inc.building_id || ''}
                        onChange={(ev) => update(i, { building_id: ev.target.value || undefined })}
                        className="mt-1 w-full px-2 py-1 rounded border border-gray-200 bg-white text-xs focus:ring-1 focus:ring-primary-500 outline-none"
                      >
                        <option value="">{isRu ? 'Весь ЖК' : 'Butun JK'}</option>
                        {scopeBuildings.map((b) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="py-1.5 px-2">
                    <NumericInput
                      value={inc.monthly}
                      onChange={(n) => update(i, { monthly: n })}
                      placeholder={isRu ? 'сумма/мес' : 'summa/oy'}
                      className="w-full px-2 py-1 rounded border border-gray-200 bg-white text-sm text-right focus:ring-1 focus:ring-primary-500 focus:border-transparent outline-none"
                    />
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums font-medium">
                    {fmt((inc.monthly || 0) * 12)}
                  </td>
                  <td className="py-1.5 px-2 text-right">
                    <button onClick={() => remove(i)} className="text-red-500 hover:text-red-700 text-sm">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Warnings */}
      {warnings.length > 0 && <WarningsPanel warnings={warnings} isRu={isRu} />}

      {/* Пер-домовой итог (смета на ЖК) */}
      {complexResult && complexResult.buildings.length > 0 && (
        <div className="border-2 border-primary-300 rounded-xl p-4 bg-white overflow-x-auto">
          <h3 className="text-base font-bold text-primary-800 mb-3">
            {isRu ? 'Тариф по домам ЖК' : 'JK uylari bo\'yicha tarif'}
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b">
                <th className="text-left py-2 pr-2 font-medium">{isRu ? 'Дом' : 'Uy'}</th>
                <th className="text-right py-2 px-2 font-medium">{isRu ? 'Жил. площадь' : 'Turar maydon'}</th>
                <th className="text-right py-2 px-2 font-medium">{isRu ? 'Расход/мес' : 'Xarajat/oy'}</th>
                <th className="text-right py-2 px-2 font-medium">{isRu ? '⭐ Тариф, сум/м²' : '⭐ Tarif'}</th>
              </tr>
            </thead>
            <tbody>
              {complexResult.buildings.map((b) => (
                <tr key={b.building_id} className="border-b">
                  <td className="py-1.5 pr-2">{buildingNameMap[b.building_id] || b.building_id}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{fmt(b.residential_area)} м²</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{fmt(b.self_expense)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums font-bold text-primary-700">{fmt(b.tariff_effective)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="py-2 pr-2" colSpan={2}>{isRu ? 'Итого по ЖК' : 'JK jami'}</td>
                <td className="py-2 px-2 text-right tabular-nums">{fmt(complexResult.total_expenses)}</td>
                <td className="py-2 px-2 text-right text-xs text-gray-500">
                  {isRu ? `дефицит/год: ${fmt(complexResult.deficit_year)}` : `defitsit: ${fmt(complexResult.deficit_year)}`}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Итог (одиночная смета / агрегат) */}
      {result && (
        <div className="border-2 border-primary-300 rounded-xl p-5 bg-primary-50/40 space-y-2 text-sm">
          <h3 className="text-base font-bold text-primary-800 mb-3">
            {isRu ? 'Расчёт тарифа' : 'Tarif hisoblash'}
          </h3>
          <ResultRow label={isRu ? 'Себестоимость (жители)' : 'Tannarx (aholi)'} value={result.self_cost_resident} suffix="сум/мес" />
          <ResultRow label={isRu ? 'База / м²' : 'Baza / m²'} value={result.base_per_m2} suffix="сум/м²" />
          <ResultRow label={isRu ? 'С прибылью / м²' : 'Foyda bilan / m²'} value={result.with_profit_per_m2} suffix="сум/м²" />
          <ResultRow label={isRu ? 'Компенсация телеком / м²' : 'Telekom kompensatsiya'} value={result.telecom_comp_per_m2} suffix="сум/м²" negative />
          {!!result.resident_saving_per_m2 && result.resident_saving_per_m2 > 0 && (
            <div className="mt-2 rounded-lg bg-green-50 border border-green-100 px-3 py-2 text-green-800 text-xs">
              {isRu
                ? `💚 Экономия жителям за счёт доходов УК: ${fmt(result.resident_saving_per_m2)} сум/м²/мес (${fmt(result.resident_saving_year || 0)} сум/год). На столько тариф ниже.`
                : `💚 Aholiga tejamkorlik: ${fmt(result.resident_saving_per_m2)} so'm/m²/oy (${fmt(result.resident_saving_year || 0)} so'm/yil).`}
            </div>
          )}
          <div className="border-t border-primary-200 pt-3 mt-2">
            <ResultRow
              label={isRu ? '⭐ ТАРИФ ЖИТЕЛЮ' : '⭐ AHOLI TARIFI'}
              value={result.tariff_resident}
              suffix="сум/м²/мес"
              bold
            />
            {!!result.vat_per_m2 && result.vat_per_m2 > 0 && (
              <>
                <ResultRow label={isRu ? 'в т.ч. НДС' : 'shu jumladan QQS'} value={result.vat_per_m2} suffix="сум/м²" />
                <ResultRow label={isRu ? 'ИТОГО с НДС' : 'QQS bilan JAMI'} value={result.tariff_with_vat || 0} suffix="сум/м²/мес" bold />
              </>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 pt-3 text-xs">
            <MiniStat label={isRu ? 'Приход/год' : 'Yiliga daromad'} value={result.jami_tushum_year} />
            <MiniStat label={isRu ? 'Расход/год' : 'Yiliga xarajat'} value={result.umumiy_year} />
            <MiniStat
              label={isRu ? 'Разрыв' : 'Farq'}
              value={result.deficit_year}
              tone={unassigned ? undefined : (result.deficit_year >= 0 ? 'green' : 'red')}
            />
          </div>
          {unassigned && (
            <div className="mt-3 rounded-lg bg-violet-50 border border-violet-100 px-3 py-2 text-xs text-violet-800">
              {isRu
                ? 'Черновик без объекта: тариф и разрыв пока нулевые — жилая площадь подставится при привязке к объекту, и расчёт обновится автоматически. Расходы и штат сохранятся как есть.'
                : "Obyektsiz qoralama: tarif obyektga bog'langanda hisoblanadi. Xarajat va xodimlar saqlanadi."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function ResultRow({ label, value, suffix, bold, negative }: { label: string; value: number; suffix: string; bold?: boolean; negative?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'text-base font-bold' : ''}`}>
      <span>{label}</span>
      <span className={`tabular-nums ${negative ? 'text-orange-600' : ''}`}>
        {negative && value > 0 ? '−' : ''}{fmt(Math.abs(value))} {suffix}
      </span>
    </div>
  );
}

function MiniStat({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'green' | 'red' }) {
  const bg = tone === 'green' ? 'bg-green-100 text-green-800' : tone === 'red' ? 'bg-red-100 text-red-800' : 'bg-white text-gray-800';
  return (
    <div className={`rounded-lg p-2 ${bg}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-sm font-bold tabular-nums mt-0.5">{fmt(value)}</div>
    </div>
  );
}
