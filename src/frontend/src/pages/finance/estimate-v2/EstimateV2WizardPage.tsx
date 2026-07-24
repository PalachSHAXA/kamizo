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
import { useNavigate } from 'react-router-dom';
import { useBuildingStore } from '../../../stores/buildingStore';
import { useLanguageStore } from '../../../stores/languageStore';
import { useToastStore } from '../../../stores/toastStore';
import {
  estimateV2Api,
  type EstimateModelV2,
  type StaffPositionV2,
  type ExpenseLineV2,
  type IncomeStreamV2,
  type EstimateResultV2,
  type EstimateWarning,
  type IncomeType,
} from '../../../services/api';
import { WarningsPanel } from './WarningsPanel';

// ── Форматирование чисел (тысячи через пробел, для UZS сум) ──────────
function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ');
}

// Парсинг ввода в число: игнорирует пробелы/буквы, возвращает 0 для пустого.
function parseNum(s: string): number {
  const cleaned = s.replace(/[^\d.,-]/g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

// ── 16 обязательных услуг (мирроринг legal-constants.ts backend'а) ─
const MANDATORY_SERVICES: Array<{ code: string; label_ru: string; label_uz: string }> = [
  { code: 'electricity_common', label_ru: 'Электроснабжение МОП', label_uz: 'Umumiy joylar elektri' },
  { code: 'elevator_if_present', label_ru: 'Обслуживание лифта', label_uz: 'Lift xizmati' },
  { code: 'facades_entrances', label_ru: 'Фасады и подъезды', label_uz: 'Fasadlar va podyezdlar' },
  { code: 'pumps_if_present', label_ru: 'Насосное оборудование', label_uz: 'Nasos uskunasi' },
  { code: 'roof_waterproofing', label_ru: 'Гидроизоляция кровли', label_uz: 'Tom gidroizolyatsiyasi' },
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

  useEffect(() => {
    fetchBuildings();
  }, [fetchBuildings]);

  // Live-подсчёты для preview
  const fotGross = useMemo(
    () => staff.reduce((s, p) => s + (p.units || 0) * (p.salary || 0), 0),
    [staff]
  );
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
    // Добавить недостающие 16 услуг с monthly = 0
    const existingCodes = new Set(expenses.map((e) => e.legal_code).filter(Boolean));
    const toAdd: ExpenseLineV2[] = MANDATORY_SERVICES
      .filter((s) => !existingCodes.has(s.code))
      .map((s) => ({
        name: isRu ? s.label_ru : s.label_uz,
        monthly: 0,
        section: 'production',
        unit: 'flat',
        legal_code: s.code,
      }));
    if (toAdd.length === 0) {
      addToast('info', isRu ? 'Все 16 услуг уже добавлены' : 'Barcha 16 xizmat qo\'shilgan');
      return;
    }
    setExpenses([...expenses, ...toAdd]);
    addToast('success', isRu ? `Добавлено ${toAdd.length} статей` : `${toAdd.length} modda qo'shildi`);
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
    setSaving(true);
    try {
      let id = estimateId;
      if (!id) {
        if (!buildingId) {
          addToast('warning', isRu ? 'Выберите дом' : 'Uyni tanlang');
          return false;
        }
        const created = await estimateV2Api.create({
          building_id: buildingId,
          period,
          title: title || undefined,
          model,
          uk_profit_percent: profitPercent,
          payroll_tax_rate: payrollTaxRate,
          tariff_approved: model === 'TARIFF_MANUAL' && typeof tariffApproved === 'number'
            ? tariffApproved
            : undefined,
        });
        id = created.id;
        setEstimateId(id);
      }

      if (step === 1) await estimateV2Api.putStaff(id, staff);
      if (step === 2) await estimateV2Api.putExpenses(id, expenses);
      if (step === 3) {
        await estimateV2Api.putIncomes(id, incomes);
        // финальный пересчёт + валидация
        const [computeRes, validateRes] = await Promise.all([
          estimateV2Api.compute(id),
          estimateV2Api.validate(id),
        ]);
        setResult(computeRes.result);
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

  const handleFinishAndActivate = async () => {
    if (!estimateId) return;
    setSaving(true);
    try {
      // Активация — существующий legacy endpoint POST /api/finance/estimates/:id/activate
      const { financeApi } = await import('../../../services/api');
      await financeApi.activateEstimate(estimateId);
      addToast('success', isRu ? 'Смета активирована' : 'Smeta faollashtirildi');
      navigate('/finance/estimates');
    } catch (e: any) {
      addToast('error', e?.message || 'Ошибка активации');
    } finally {
      setSaving(false);
    }
  };

  // ── Рендер ────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isRu ? 'Новая смета' : 'Yangi smeta'}
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
          <Step1Basics
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
            isRu={isRu}
          />
        )}

        {step === 1 && (
          <Step2Staff
            staff={staff}
            setStaff={setStaff}
            fotGross={fotGross}
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
            isRu={isRu}
          />
        )}

        {step === 3 && (
          <Step4IncomesAndResult
            incomes={incomes}
            setIncomes={setIncomes}
            expensesTotal={expensesTotal}
            incomeTotal={incomeTotal}
            residentialArea={selectedBuilding?.total_area || 0}
            profitPercent={profitPercent}
            result={result}
            warnings={warnings}
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
          {step === steps.length - 1 && result && (
            <button
              onClick={handleFinishAndActivate}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold disabled:opacity-50"
            >
              {saving ? '...' : isRu ? 'Активировать смету' : 'Smetani faollashtirish'}
            </button>
          )}
          <button
            onClick={handleNext}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-semibold disabled:opacity-50"
          >
            {saving ? '...' : step === steps.length - 1 ? (isRu ? 'Пересчитать' : 'Qayta hisoblash') : (isRu ? 'Далее →' : 'Keyingi →')}
          </button>
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
  isRu: boolean;
}) {
  const { buildings, isRu } = props;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          <input
            type="number" min="0" max="30" step="0.1"
            value={props.profitPercent}
            onChange={(e) => props.setProfitPercent(parseNum(e.target.value))}
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
            <input
              type="number" min="0" step="1"
              value={props.tariffApproved}
              onChange={(e) => {
                const v = e.target.value;
                props.setTariffApproved(v === '' ? '' : parseNum(v));
              }}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            />
          </Field>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// STEP 2 — Штат
// ═══════════════════════════════════════════════════════════════════

function Step2Staff(props: {
  staff: StaffPositionV2[]; setStaff: (v: StaffPositionV2[]) => void;
  fotGross: number; fotTax: number; fotTotal: number; payrollTaxRate: number;
  isRu: boolean;
}) {
  const { staff, setStaff, fotGross, fotTax, fotTotal, payrollTaxRate, isRu } = props;

  const update = (i: number, patch: Partial<StaffPositionV2>) => {
    const next = [...staff];
    next[i] = { ...next[i], ...patch };
    setStaff(next);
  };
  const remove = (i: number) => setStaff(staff.filter((_, k) => k !== i));
  const add = () => setStaff([...staff, { title: '', units: 1, salary: 0 }]);

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
                    <input
                      type="number" min="0" step="0.5"
                      value={s.units}
                      onChange={(e) => update(i, { units: parseNum(e.target.value) })}
                      className="w-full px-2 py-1 rounded border border-gray-200 bg-white text-sm text-right focus:ring-1 focus:ring-primary-500 focus:border-transparent outline-none"
                    />
                  </td>
                  <td className="py-1.5 px-2">
                    <input
                      type="number" min="0" step="1000"
                      value={s.salary}
                      onChange={(e) => update(i, { salary: parseNum(e.target.value) })}
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
          <span>{isRu ? 'ФОТ (брутто)' : 'FOT (brutto)'}:</span>
          <span className="tabular-nums font-medium">{fmt(fotGross)} сум</span>
        </div>
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
  isRu: boolean;
}) {
  const { expenses, setExpenses, fotTotal, onAddMandatory, onAddLinkedToStaff, isRu } = props;

  const update = (i: number, patch: Partial<ExpenseLineV2>) => {
    const next = [...expenses];
    next[i] = { ...next[i], ...patch };
    setExpenses(next);
  };
  const remove = (i: number) => setExpenses(expenses.filter((_, k) => k !== i));
  const addBlank = () =>
    setExpenses([...expenses, { name: '', monthly: 0, section: 'production', unit: 'flat' }]);

  const productionTotal = expenses
    .filter((e) => e.section === 'production')
    .reduce((s, e) => s + (e.linked_to_staff ? fotTotal : e.monthly || 0), 0);
  const periodicTotal = expenses
    .filter((e) => e.section === 'periodic')
    .reduce((s, e) => s + (e.linked_to_staff ? fotTotal : e.monthly || 0), 0);
  const grandTotal = productionTotal + periodicTotal;

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
                    </td>
                    <td className="py-1.5 px-2">
                      <input
                        type="number" min="0" step="1000"
                        value={e.linked_to_staff ? fotTotal : (e.monthly || 0)}
                        disabled={!!e.linked_to_staff}
                        onChange={(ev) => update(i, { monthly: parseNum(ev.target.value) })}
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
        <div className="flex justify-between">
          <span>{isRu ? 'Периодические' : 'Davriy'}:</span>
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
  result: EstimateResultV2 | null; warnings: EstimateWarning[];
  isRu: boolean;
}) {
  const { incomes, setIncomes, result, warnings, isRu } = props;

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
          </div>
        </div>

        {incomes.length === 0 ? (
          <div className="text-center text-gray-400 py-6 text-sm">
            {isRu ? 'Нет доходов. Коммерция/подвал/парковка удешевляют тариф, телеком компенсирует жителям после наценки.' : 'Daromadlar yo\'q.'}
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
                  </td>
                  <td className="py-1.5 px-2">
                    <input
                      type="number" min="0" step="10000"
                      value={inc.monthly}
                      onChange={(e) => update(i, { monthly: parseNum(e.target.value) })}
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

      {/* Итог */}
      {result && (
        <div className="border-2 border-primary-300 rounded-xl p-5 bg-primary-50/40 space-y-2 text-sm">
          <h3 className="text-base font-bold text-primary-800 mb-3">
            {isRu ? 'Расчёт тарифа' : 'Tarif hisoblash'}
          </h3>
          <ResultRow label={isRu ? 'Себестоимость (жители)' : 'Tannarx (aholi)'} value={result.self_cost_resident} suffix="сум/мес" />
          <ResultRow label={isRu ? 'База / м²' : 'Baza / m²'} value={result.base_per_m2} suffix="сум/м²" />
          <ResultRow label={isRu ? 'С прибылью / м²' : 'Foyda bilan / m²'} value={result.with_profit_per_m2} suffix="сум/м²" />
          <ResultRow label={isRu ? 'Компенсация телеком / м²' : 'Telekom kompensatsiya'} value={result.telecom_comp_per_m2} suffix="сум/м²" negative />
          <div className="border-t border-primary-200 pt-3 mt-2">
            <ResultRow
              label={isRu ? '⭐ ТАРИФ ЖИТЕЛЮ' : '⭐ AHOLI TARIFI'}
              value={result.tariff_resident}
              suffix="сум/м²/мес"
              bold
            />
          </div>
          <div className="grid grid-cols-3 gap-2 pt-3 text-xs">
            <MiniStat label={isRu ? 'Приход/год' : 'Yiliga daromad'} value={result.jami_tushum_year} />
            <MiniStat label={isRu ? 'Расход/год' : 'Yiliga xarajat'} value={result.umumiy_year} />
            <MiniStat
              label={isRu ? 'Разрыв' : 'Farq'}
              value={result.deficit_year}
              tone={result.deficit_year >= 0 ? 'green' : 'red'}
            />
          </div>
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
