// Estimate calculation engine — 3 tariff models used by УК in Uzbekistan.
//
// Pure functions only: no DB, no network, no globals. Route handlers hydrate
// input from finance_estimates + finance_estimate_staff + finance_estimate_items
// (kind='expense'/'income') + apartments (residential_area), then call
// computeEstimate(). Result is cached back to finance_estimates columns
// (fot_gross, tariff_resident, deficit_year, …).
//
// Golden tests in __tests__/compute.test.ts must pass with ±1 sum tolerance.

// ──────────────────────────────────────────────────────────────────────────
// Rounding helpers
// ──────────────────────────────────────────────────────────────────────────

/** Round to given precision. Used everywhere so rounding rules stay one place. */
export function round(x: number, digits = 0): number {
  const p = 10 ** digits;
  return Math.round(x * p) / p;
}

/** Round to whole сум — payroll_tax, tariff, most totals в УзРесп. смете. */
export const round0 = (x: number) => Math.round(x);

/** Round to 1 decimal — публикуемые ставки за м² в приказе Минюст. */
export const round1 = (x: number) => Math.round(x * 10) / 10;

// ──────────────────────────────────────────────────────────────────────────
// Domain types (см. §1 ТЗ)
// ──────────────────────────────────────────────────────────────────────────

export type EstimateModel = 'TARIFF_CALCULATED' | 'TARIFF_MANUAL' | 'TARIFF_FLAT';

export interface StaffPosition {
  title: string;
  units: number;     // может быть дробным (0.5)
  salary: number;    // оклад/мес
}

export type ExpenseSection = 'production' | 'periodic';
export type ItemUnit = 'flat' | 'per_sqm' | 'per_apt' | 'per_meter' | 'staff_computed';

export interface ExpenseLine {
  name: string;
  monthly: number;                 // сумма в месяц
  section?: ExpenseSection;        // производственные vs периодические
  unit?: ItemUnit;                 // как считался monthly (flat = руками)
  linked_to_staff?: boolean;       // строка "Расходы по зарплате" → monthly = FOT_total
  legal_code?: string;             // для проверки чек-листа 16 услуг
}

export type IncomeType = 'commercial' | 'basement' | 'parking' | 'telecom' | 'other';
export type IncomeOffset = 'BEFORE_PROFIT' | 'AFTER_PROFIT';

export interface IncomeStream {
  type: IncomeType;
  monthly: number;                 // фактическая сумма/мес
  offset?: IncomeOffset;           // default по type (см. defaultOffset ниже)
}

export interface EstimateObjectInput {
  residential_area: number;        // м² только жилых квартир
  floors?: number;                 // этажность — для валидатора мин. тарифа
  profit_rate: number;             // 0.07 = 7%
  payroll_tax_rate: number;        // 0.24 (12% ЕСП + 12% НДФЛ) или 0.25
}

export interface EstimateInput {
  model: EstimateModel;
  object: EstimateObjectInput;
  staff: StaffPosition[];
  expenses: ExpenseLine[];
  incomes: IncomeStream[];
  tariff_manual?: number;          // используется TARIFF_MANUAL
}

// ──────────────────────────────────────────────────────────────────────────
// Result types
// ──────────────────────────────────────────────────────────────────────────

export interface StaffLineResult {
  title: string;
  units: number;
  salary: number;
  monthly: number;                 // units * salary
}

export interface IncomeBreakdown {
  commercial: number;
  basement: number;
  parking: number;
  telecom: number;
  other: number;
}

export interface EstimateResult {
  model: EstimateModel;
  staff_lines: StaffLineResult[];
  fot_gross: number;               // Σ staff.monthly
  payroll_tax: number;             // round(FOT_gross * rate)
  fot_total: number;               // FOT_gross + payroll_tax
  total_expenses: number;          // Σ expense.monthly (with FOT_total in "Расходы по зарплате" row)
  income_breakdown: IncomeBreakdown;
  before_profit_offset: number;    // commercial + basement + parking
  self_cost_resident: number;      // total_expenses − before_profit_offset
  base_per_m2: number;             // self_cost_resident / residential_area
  with_profit_per_m2: number;      // base × (1 + profit)
  telecom_comp_per_m2: number;     // telecom / residential_area
  tariff_resident: number;         // with_profit_per_m2 − telecom_comp_per_m2
  tariff_effective: number;        // tariff_manual для MANUAL, tariff_resident иначе
  jami_tushum_year: number;        // приход/год при effective tariff
  umumiy_year: number;             // расход/год с наценкой
  deficit_year: number;            // jami − umumiy (<0 = не покрывает)
}

// ──────────────────────────────────────────────────────────────────────────
// Default income offset per type (§2.3 ТЗ)
//   commercial/basement/parking → BEFORE_PROFIT (удешевляют себестоимость)
//   telecom → AFTER_PROFIT (компенсация жителям после наценки)
//   other → BEFORE_PROFIT (можно переопределить в input)
// ──────────────────────────────────────────────────────────────────────────
function defaultOffset(type: IncomeType): IncomeOffset {
  return type === 'telecom' ? 'AFTER_PROFIT' : 'BEFORE_PROFIT';
}

// ──────────────────────────────────────────────────────────────────────────
// Aggregate helpers
// ──────────────────────────────────────────────────────────────────────────

function computeStaff(input: EstimateInput): {
  lines: StaffLineResult[]; fot_gross: number; payroll_tax: number; fot_total: number;
} {
  const lines = input.staff.map(p => ({
    title: p.title,
    units: p.units,
    salary: p.salary,
    monthly: p.units * p.salary,
  }));
  const fot_gross = lines.reduce((s, l) => s + l.monthly, 0);
  const payroll_tax = round0(fot_gross * input.object.payroll_tax_rate);
  const fot_total = fot_gross + payroll_tax;
  return { lines, fot_gross, payroll_tax, fot_total };
}

/**
 * Sum monthly expenses; strings marked linked_to_staff are overriden with
 * fot_total so the smetа shows "Расходы по зарплате" with the correct
 * salary+tax number even if user typed 0.
 */
function computeExpenses(input: EstimateInput, fot_total: number): number {
  return input.expenses.reduce((sum, e) => {
    const monthly = e.linked_to_staff ? fot_total : e.monthly;
    return sum + monthly;
  }, 0);
}

function computeIncomeBreakdown(input: EstimateInput): IncomeBreakdown {
  const b: IncomeBreakdown = { commercial: 0, basement: 0, parking: 0, telecom: 0, other: 0 };
  for (const inc of input.incomes) {
    b[inc.type] += inc.monthly;
  }
  return b;
}

function computeBeforeProfitOffset(input: EstimateInput, breakdown: IncomeBreakdown): number {
  // Уважаем явный offset в input (если задан), иначе — дефолтный per-type.
  let sum = 0;
  const seen: Record<string, boolean> = {};
  for (const inc of input.incomes) {
    const offset = inc.offset ?? defaultOffset(inc.type);
    if (offset === 'BEFORE_PROFIT') sum += inc.monthly;
    seen[inc.type] = true;
  }
  // Если ни одной строки не пришло по type — breakdown уже 0, ничего добавлять не надо.
  void breakdown;
  return sum;
}

// ──────────────────────────────────────────────────────────────────────────
// Main entry
// ──────────────────────────────────────────────────────────────────────────

export function computeEstimate(input: EstimateInput): EstimateResult {
  const { lines: staff_lines, fot_gross, payroll_tax, fot_total } = computeStaff(input);
  const total_expenses = computeExpenses(input, fot_total);
  const income_breakdown = computeIncomeBreakdown(input);
  const before_profit_offset = computeBeforeProfitOffset(input, income_breakdown);
  const area = input.object.residential_area;
  const profit = input.object.profit_rate;
  const telecom = income_breakdown.telecom;

  // Основной расчёт тарифа — работает для всех 3 моделей одинаково,
  // но семантика немного отличается (см. `tariff_effective` ниже).
  const self_cost_resident = total_expenses - before_profit_offset;
  const base_per_m2 = area > 0 ? self_cost_resident / area : 0;
  const with_profit_per_m2 = base_per_m2 * (1 + profit);
  const telecom_comp_per_m2 = area > 0 ? telecom / area : 0;
  const tariff_resident = with_profit_per_m2 - telecom_comp_per_m2;

  // Разрыв: годовой приход − годовой расход с наценкой.
  // При TARIFF_MANUAL используется явно заданный тариф; в остальных случаях
  // берётся расчётный. Это даёт менеджеру возможность утвердить тариф
  // отличный от расчётного (например, увеличить чтобы покрыть амортизацию).
  const tariff_effective = input.model === 'TARIFF_MANUAL' && input.tariff_manual != null
    ? input.tariff_manual
    : tariff_resident;

  const totalIncomesMonthly =
    income_breakdown.commercial +
    income_breakdown.basement +
    income_breakdown.parking +
    income_breakdown.telecom +
    income_breakdown.other;

  const jami_tushum_year = tariff_effective * area * 12 + totalIncomesMonthly * 12;
  const umumiy_year = total_expenses * 12 * (1 + profit);
  const deficit_year = jami_tushum_year - umumiy_year;

  return {
    model: input.model,
    staff_lines,
    fot_gross,
    payroll_tax,
    fot_total,
    total_expenses,
    income_breakdown,
    before_profit_offset,
    self_cost_resident,
    base_per_m2: round1(base_per_m2),
    with_profit_per_m2: round1(with_profit_per_m2),
    telecom_comp_per_m2: round1(telecom_comp_per_m2),
    tariff_resident: round1(tariff_resident),
    tariff_effective: round0(tariff_effective),
    jami_tushum_year: round0(jami_tushum_year),
    umumiy_year: round0(umumiy_year),
    deficit_year: round0(deficit_year),
  };
}

// ──────────────────────────────────────────────────────────────────────────
// TARIFF_FLAT helper (§2.7 ТЗ — «Qorasuv» простая схема)
// Дано: одна суммарная строка grand_total_monthly + total_area → tariff = round(grand/area)
// ──────────────────────────────────────────────────────────────────────────
export function computeFlatTariff(grand_total_monthly: number, total_area: number): {
  head_tariff_rounded: number; year: number;
} {
  const head_tariff_rounded = total_area > 0 ? round0(grand_total_monthly / total_area) : 0;
  return { head_tariff_rounded, year: grand_total_monthly * 12 };
}

// ──────────────────────────────────────────────────────────────────────────
// TARIFF_MANUAL sub-calc for legacy "SERVISE" template (§2.6 ТЗ)
// Возвращает готовые "прибыль" и "umumiy год" по subtotal — используется когда
// менеджер вводит смету одним числом (subtotal_year) без разбивки на статьи.
// ──────────────────────────────────────────────────────────────────────────
export function computeManualSubtotal(
  subtotal_year: number,
  profit_rate: number,
  fot_total_monthly: number,
  payroll_tax_rate: number,
): {
  profit_year: number; umumiy_year: number; tax_line_2_6: number;
} {
  const profit_year = round0(subtotal_year * profit_rate);
  const umumiy_year = subtotal_year + profit_year;
  const tax_line_2_6 = round0(fot_total_monthly * payroll_tax_rate);
  return { profit_year, umumiy_year, tax_line_2_6 };
}
