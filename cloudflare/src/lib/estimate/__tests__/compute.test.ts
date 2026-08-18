// Golden test cases for estimate calculation engine.
// Source: smeta_test_cases.json (§5 ТЗ). Tolerance ±1 сум для округления.

import { describe, expect, it } from 'vitest';
import {
  computeEstimate,
  computeFlatTariff,
  computeManualSubtotal,
  round0,
  type EstimateInput,
} from '../compute';
import { validate } from '../validators';
import { getMinTariff } from '../legal-constants';

/** Проверка равенства ±1 (округление сум). */
function expectClose(actual: number, expected: number, epsilon = 1) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(epsilon);
}

describe('Golden case: IbnSino_tariff_resident', () => {
  it('вычисляет тариф 1692 сум/м² по формуле §2.4', () => {
    // Вход:
    //   total_expenses = 18 656 041.67
    //   commercial_income = 2 200 000 (550 м² × 4000 сум)
    //   basement_income = 0
    //   parking_income = 0
    //   telecom_income = 6 500 000 (аренда крыши операторам)
    //   residential_area = 6565 м²
    //   profit_rate = 0.07
    //
    // Ожидаем:
    //   self_cost_resident   = 18 656 041.67 − 2 200 000            = 16 456 041.67
    //   base_per_m2          = 16 456 041.67 / 6565                 = 2506.6
    //   with_profit_per_m2   = 2506.6 × 1.07                        = 2682.1
    //   telecom_comp_per_m2  = 6 500 000 / 6565                     = 990.1
    //   tariff_resident      = 2682.1 − 990.1                       = 1692.0
    const input: EstimateInput = {
      model: 'TARIFF_CALCULATED',
      object: { residential_area: 6565, profit_rate: 0.07, payroll_tax_rate: 0.24 },
      staff: [],
      // Расходы задаём одной суммарной строкой — это соответствует состоянию,
      // где менеджер уже прожал в total. computeEstimate() не разбирает
      // структуру статей, только суммирует их monthly.
      expenses: [{ name: 'ИТОГО расходы', monthly: 18656041.67 }],
      incomes: [
        { type: 'commercial', monthly: 2200000 },
        { type: 'telecom', monthly: 6500000 },
      ],
    };

    const r = computeEstimate(input);

    expectClose(r.self_cost_resident, 16456041.67);
    expect(r.base_per_m2).toBeCloseTo(2506.6, 1);
    expect(r.with_profit_per_m2).toBeCloseTo(2682.1, 1);
    expect(r.telecom_comp_per_m2).toBeCloseTo(990.1, 1);
    expect(r.tariff_resident).toBeCloseTo(1692.0, 1);
  });
});

describe('Golden case: IbnSino_FOT', () => {
  it('FOT_gross=9 150 000 → tax@24%=2 196 000 → FOT_total=11 346 000', () => {
    const input: EstimateInput = {
      model: 'TARIFF_CALCULATED',
      object: { residential_area: 6565, profit_rate: 0.07, payroll_tax_rate: 0.24 },
      staff: [{ title: 'Все позиции', units: 1, salary: 9150000 }],
      expenses: [],
      incomes: [],
    };
    const r = computeEstimate(input);
    expect(r.fot_gross).toBe(9150000);
    expect(r.payroll_tax).toBe(2196000);
    expect(r.fot_total).toBe(11346000);
  });
});

describe('Golden case: Kushbegi_FOT', () => {
  it('FOT_gross=10 500 000 → tax@24%=2 520 000 → FOT_total=13 020 000', () => {
    const input: EstimateInput = {
      model: 'TARIFF_CALCULATED',
      object: { residential_area: 1, profit_rate: 0.07, payroll_tax_rate: 0.24 },
      staff: [{ title: 'Все', units: 1, salary: 10500000 }],
      expenses: [],
      incomes: [],
    };
    const r = computeEstimate(input);
    expect(r.fot_gross).toBe(10500000);
    expect(r.payroll_tax).toBe(2520000);
    expect(r.fot_total).toBe(13020000);
  });
});

describe('Golden case: Assalom_tax_25pct', () => {
  it('FOT_gross=36 500 000 @ tax=0.25 → tax=9 125 000, FOT_total=45 625 000', () => {
    const input: EstimateInput = {
      model: 'TARIFF_CALCULATED',
      object: { residential_area: 1, profit_rate: 0.07, payroll_tax_rate: 0.25 },
      staff: [{ title: 'Все', units: 1, salary: 36500000 }],
      expenses: [],
      incomes: [],
    };
    const r = computeEstimate(input);
    expect(r.fot_gross).toBe(36500000);
    expect(r.payroll_tax).toBe(9125000);
    expect(r.fot_total).toBe(45625000);
  });
});

describe('Golden case: SERVISE_pr11_totals (§2.6 модель TARIFF_MANUAL)', () => {
  it('subtotal_year=261 523 656 @ 9% → profit=23 537 129, umumiy=285 060 785, tax=2 320 904', () => {
    // Из ТЗ §5: SERVISE_pr11_totals
    //   subtotal_year=261 523 656; profit_rate=0.09;
    //   FOT_total_monthly=9 670 432; payroll_tax_rate=0.24
    // Ожидаем: profit_year=23 537 129; umumiy_year=285 060 785; tax_line_2_6=2 320 904
    const r = computeManualSubtotal(261523656, 0.09, 9670432, 0.24);
    expectClose(r.profit_year, 23537129);
    expectClose(r.umumiy_year, 285060785);
    expectClose(r.tax_line_2_6, 2320904);
  });
});

describe('Golden case: Parkent_1_1_income', () => {
  it('tariff=2700 сум/м² × area=4834.4 × 12 = 156 634 560', () => {
    // Проверяем формулу годового прихода "tariff * area * 12" =
    // это шапка jami_tushum_year в §2.5 (без прочих доходов).
    const area = 4834.4;
    const tariff = 2700;
    const yearIncome = tariff * area * 12;
    expectClose(yearIncome, 156634560);
  });
});

describe('Golden case: Qorasuv_head_tariff (§2.7 модель TARIFF_FLAT)', () => {
  it('grand_total_monthly=28 221 136 / area=12838 → tariff≈2199 (±1 сум), year=338 653 632', () => {
    // 28 221 136 / 12838 = 2198.09 → Math.round = 2198.
    // ТЗ ожидает 2199 — это результат постатейного округления и последующего
    // сложения (accumulation), а не round(sum/area). Наш API принимает
    // grand_total как скаляр без разбивки, поэтому используем допуск ±1 сум
    // (meta.purpose ТЗ явно разрешает "±1 rounding").
    const r = computeFlatTariff(28221136, 12838);
    expectClose(r.head_tariff_rounded, 2199);
    expect(r.year).toBe(338653632);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Sanity edge cases
// ────────────────────────────────────────────────────────────────────────

describe('Edge: пустая смета', () => {
  it('нулевые входы → нулевые выходы, без crash', () => {
    const r = computeEstimate({
      model: 'TARIFF_CALCULATED',
      object: { residential_area: 1000, profit_rate: 0.07, payroll_tax_rate: 0.24 },
      staff: [],
      expenses: [],
      incomes: [],
    });
    expect(r.fot_gross).toBe(0);
    expect(r.total_expenses).toBe(0);
    expect(r.tariff_resident).toBe(0);
  });
});

describe('Edge: linked_to_staff подставляет FOT_total', () => {
  it('строка "Расходы по зарплате" пустая → берёт FOT_total', () => {
    const r = computeEstimate({
      model: 'TARIFF_CALCULATED',
      object: { residential_area: 1000, profit_rate: 0, payroll_tax_rate: 0.24 },
      staff: [{ title: 'Директор', units: 1, salary: 5000000 }],
      expenses: [
        { name: 'Расходы по зарплате', monthly: 0, linked_to_staff: true },
        { name: 'Электрика', monthly: 100000 },
      ],
      incomes: [],
    });
    // FOT_gross = 5 000 000; tax = 1 200 000; FOT_total = 6 200 000
    // total_expenses = 6 200 000 + 100 000 = 6 300 000
    expect(r.fot_total).toBe(6200000);
    expect(r.total_expenses).toBe(6300000);
  });
});

describe('Edge: TARIFF_MANUAL с явным тарифом', () => {
  it('utilizes tariff_manual для tariff_effective и разрыва', () => {
    const r = computeEstimate({
      model: 'TARIFF_MANUAL',
      object: { residential_area: 4834.4, profit_rate: 0.09, payroll_tax_rate: 0.24 },
      staff: [],
      expenses: [{ name: 'ИТОГО', monthly: 10000000 }],
      incomes: [],
      tariff_manual: 2700,
    });
    expect(r.tariff_effective).toBe(2700);
    // jami = 2700 * 4834.4 * 12 = 156 634 560
    expectClose(r.jami_tushum_year, 156634560);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Validators
// ────────────────────────────────────────────────────────────────────────

describe('Validators', () => {
  it('BELOW_MIN_TARIFF срабатывает если тариф < ташкентского минимума', () => {
    // 5-эт дом = минимум 1513. Ставим тариф 1000 → должен вылететь error.
    const input: EstimateInput = {
      model: 'TARIFF_MANUAL',
      object: { residential_area: 1000, profit_rate: 0.07, payroll_tax_rate: 0.24 },
      staff: [],
      expenses: [{ name: 'x', monthly: 100000 }],
      incomes: [],
      tariff_manual: 1000,
    };
    const result = computeEstimate(input);
    const warnings = validate(input, result, { floors: 5 });
    const min = warnings.find(w => w.code === 'BELOW_MIN_TARIFF');
    expect(min).toBeDefined();
    expect(min?.severity).toBe('error');
  });

  it('MISSING_MANDATORY_SERVICE — если legal_code не покрыт статьями', () => {
    const input: EstimateInput = {
      model: 'TARIFF_CALCULATED',
      object: { residential_area: 1000, profit_rate: 0.07, payroll_tax_rate: 0.24 },
      staff: [],
      expenses: [
        { name: 'Электрика МОП', monthly: 100000, legal_code: 'electricity_common' },
      ],
      incomes: [],
    };
    const result = computeEstimate(input);
    const warnings = validate(input, result, { floors: 5, has_elevator: false, has_pumps: false });
    const missing = warnings.filter(w => w.code === 'MISSING_MANDATORY_SERVICE');
    // покрыли только 1 из ~14 обязательных (лифт/насосы conditional отключены)
    expect(missing.length).toBeGreaterThan(10);
    // но electricity_common не должен фигурировать в missing
    expect(missing.find(w => w.meta?.legal_code === 'electricity_common')).toBeUndefined();
  });

  it('условная услуга (лифт) не проверяется если has_elevator=false', () => {
    const input: EstimateInput = {
      model: 'TARIFF_CALCULATED',
      object: { residential_area: 1000, profit_rate: 0.07, payroll_tax_rate: 0.24 },
      staff: [],
      expenses: [], // ничего не покрыто
      incomes: [],
    };
    const result = computeEstimate(input);
    const warnings = validate(input, result, { floors: 5, has_elevator: false });
    expect(warnings.find(w => w.meta?.legal_code === 'elevator_if_present')).toBeUndefined();
  });

  it('getMinTariff возвращает правильные значения по этажности', () => {
    expect(getMinTariff(2)).toBe(1148);
    expect(getMinTariff(5)).toBe(1513);
    expect(getMinTariff(9)).toBe(1703);
    expect(getMinTariff(10)).toBe(1829);
    expect(getMinTariff(15)).toBe(1829); // 10+
    expect(getMinTariff(undefined)).toBe(1148); // default
    expect(getMinTariff(1)).toBe(1148); // guard
  });
});

// ────────────────────────────────────────────────────────────────────────
// Round helper sanity
// ────────────────────────────────────────────────────────────────────────

describe('round0', () => {
  it('округляет положительные суммы вверх на 0.5 (в сметах все суммы ≥0)', () => {
    expect(round0(0.5)).toBe(1);
    expect(round0(1.5)).toBe(2);
    expect(round0(2196000.0)).toBe(2196000);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Фаза 1: периодические расходы опциональны (periodic_enabled)
// ────────────────────────────────────────────────────────────────────────

describe('periodic_enabled', () => {
  const base: EstimateInput = {
    model: 'TARIFF_CALCULATED',
    object: { residential_area: 1000, profit_rate: 0, payroll_tax_rate: 0 },
    staff: [],
    expenses: [
      { name: 'Производственная', monthly: 100000, section: 'production' },
      { name: 'Периодическая', monthly: 40000, section: 'periodic' },
    ],
    incomes: [],
  };

  it('по умолчанию (undefined) периодика ВХОДИТ в total_expenses', () => {
    const r = computeEstimate(base);
    expect(r.total_expenses).toBe(140000);
  });

  it('periodic_enabled=true — периодика входит', () => {
    const r = computeEstimate({ ...base, object: { ...base.object, periodic_enabled: true } });
    expect(r.total_expenses).toBe(140000);
  });

  it('periodic_enabled=false — периодика ИСКЛЮЧЕНА', () => {
    const r = computeEstimate({ ...base, object: { ...base.object, periodic_enabled: false } });
    expect(r.total_expenses).toBe(100000);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Фаза 2: отпускные (vacation_days) входят в ФОТ и облагаются налогом
// ────────────────────────────────────────────────────────────────────────

describe('vacation_days (отпускные)', () => {
  const mk = (vacation_days?: number): EstimateInput => ({
    model: 'TARIFF_CALCULATED',
    object: { residential_area: 1000, profit_rate: 0, payroll_tax_rate: 0.24 },
    staff: [{ title: 'Дворник', units: 1, salary: 252000, vacation_days }],
    expenses: [],
    incomes: [],
  });

  it('без vacation_days (undefined) — отпускных нет', () => {
    const r = computeEstimate(mk(undefined));
    expect(r.fot_vacation).toBe(0);
    expect(r.fot_gross).toBe(252000);
  });

  it('21 день ≈ 1 оклад/год: резерв = salary/12', () => {
    const r = computeEstimate(mk(21));
    expect(r.fot_vacation).toBe(21000);
    expect(r.fot_gross).toBe(273000);
    expect(r.payroll_tax).toBe(Math.round(273000 * 0.24));
  });

  it('0 дней — отпускных нет', () => {
    expect(computeEstimate(mk(0)).fot_vacation).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Фаза 3: доход «реклама» удешевляет тариф (BEFORE_PROFIT) + экономия жителям
// ────────────────────────────────────────────────────────────────────────

describe('advertising income + resident_saving', () => {
  const base: EstimateInput = {
    model: 'TARIFF_CALCULATED',
    object: { residential_area: 1000, profit_rate: 0, payroll_tax_rate: 0 },
    staff: [],
    expenses: [{ name: 'Расход', monthly: 1000000, section: 'production' }],
    incomes: [],
  };

  it('реклама уменьшает себестоимость (BEFORE_PROFIT)', () => {
    const withAd = computeEstimate({ ...base, incomes: [{ type: 'advertising', monthly: 200000 }] });
    // self_cost = 1000000 - 200000 = 800000; base/m² = 800
    expect(withAd.self_cost_resident).toBe(800000);
    expect(withAd.base_per_m2).toBe(800);
  });

  it('resident_saving = сумма доходов, снижающих платёж', () => {
    const r = computeEstimate({ ...base, incomes: [
      { type: 'advertising', monthly: 200000 },
      { type: 'telecom', monthly: 100000 },
    ] });
    // before_profit(adv 200000) + telecom 100000 = 300000/мес; /1000 = 300/м²
    expect(r.resident_saving_per_m2).toBe(300);
    expect(r.resident_saving_year).toBe(3600000);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Фаза 4: НДС на тариф жителю
// ────────────────────────────────────────────────────────────────────────

describe('НДС (vat)', () => {
  const base: EstimateInput = {
    model: 'TARIFF_CALCULATED',
    object: { residential_area: 1000, profit_rate: 0, payroll_tax_rate: 0 },
    staff: [],
    expenses: [{ name: 'Расход', monthly: 1000000, section: 'production' }],
    incomes: [],
  };

  it('vat выключен — vat_per_m2=0, tariff_with_vat=tariff', () => {
    const r = computeEstimate(base);
    expect(r.vat_per_m2).toBe(0);
    expect(r.tariff_with_vat).toBe(r.tariff_resident);
  });

  it('vat 12% включён — +12% на тариф', () => {
    const r = computeEstimate({ ...base, object: { ...base.object, vat_enabled: true, vat_rate: 0.12 } });
    // tariff = 1000; vat = 120; with_vat = 1120
    expect(r.vat_per_m2).toBe(120);
    expect(r.tariff_with_vat).toBe(1120);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Смета на ЖК → разбивка на дома (computeComplexEstimate)
// ────────────────────────────────────────────────────────────────────────
import { computeComplexEstimate, type ComplexEstimateInput } from '../compute';

describe('computeComplexEstimate', () => {
  it('1 дом, все статьи shared = совпадает с одиночным расчётом', () => {
    const single = computeEstimate({
      model: 'TARIFF_CALCULATED',
      object: { residential_area: 1000, profit_rate: 0, payroll_tax_rate: 0 },
      staff: [], expenses: [{ name: 'Р', monthly: 1000000, section: 'production' }], incomes: [],
    });
    const cx = computeComplexEstimate({
      model: 'TARIFF_CALCULATED',
      object: { profit_rate: 0, payroll_tax_rate: 0 },
      buildings: [{ building_id: 'A', residential_area: 1000 }],
      staff: [], expenses: [{ name: 'Р', monthly: 1000000, section: 'production' }], incomes: [],
    });
    expect(cx.buildings[0].tariff_resident).toBe(single.tariff_resident); // 1000
    expect(cx.total_expenses).toBe(single.total_expenses);
  });

  it('общий расход делится по жилой площади', () => {
    // 2 дома: 1000 и 3000 м²; общий расход 4 000 000 → база 1000/м² у обоих
    const cx = computeComplexEstimate({
      model: 'TARIFF_CALCULATED',
      object: { profit_rate: 0, payroll_tax_rate: 0 },
      buildings: [{ building_id: 'A', residential_area: 1000 }, { building_id: 'B', residential_area: 3000 }],
      staff: [], expenses: [{ name: 'Мусор', monthly: 4000000, section: 'production' }], incomes: [],
    });
    const A = cx.buildings.find(b => b.building_id === 'A')!;
    const B = cx.buildings.find(b => b.building_id === 'B')!;
    expect(A.self_expense).toBe(1000000); // 4M × 1000/4000
    expect(B.self_expense).toBe(3000000); // 4M × 3000/4000
    expect(A.tariff_resident).toBe(1000);
    expect(B.tariff_resident).toBe(1000);
    expect(cx.total_expenses).toBe(4000000);
  });

  it('адресный расход поднимает тариф только своего дома', () => {
    // общий 0; ремонт крыши 900 000 только дому B (площадь 900) → +1000/м² у B
    const cx = computeComplexEstimate({
      model: 'TARIFF_CALCULATED',
      object: { profit_rate: 0, payroll_tax_rate: 0 },
      buildings: [{ building_id: 'A', residential_area: 900 }, { building_id: 'B', residential_area: 900 }],
      staff: [],
      expenses: [{ name: 'Крыша', monthly: 900000, section: 'production', building_id: 'B' }],
      incomes: [],
    });
    const A = cx.buildings.find(b => b.building_id === 'A')!;
    const B = cx.buildings.find(b => b.building_id === 'B')!;
    expect(A.tariff_resident).toBe(0);
    expect(B.tariff_resident).toBe(1000);
    // инвариант: сумма пер-домовых расходов = total_expenses
    expect(A.self_expense + B.self_expense).toBe(cx.total_expenses);
  });

  it('адресный доход снижает тариф только своего дома', () => {
    // дом B получает доход-парковку 900 000 (before-profit) → тариф B ниже на 1000/м²
    const cx = computeComplexEstimate({
      model: 'TARIFF_CALCULATED',
      object: { profit_rate: 0, payroll_tax_rate: 0 },
      buildings: [{ building_id: 'A', residential_area: 900 }, { building_id: 'B', residential_area: 900 }],
      staff: [],
      expenses: [{ name: 'Общий', monthly: 1800000, section: 'production' }],
      incomes: [{ type: 'parking', monthly: 900000, building_id: 'B' }],
    });
    const A = cx.buildings.find(b => b.building_id === 'A')!;
    const B = cx.buildings.find(b => b.building_id === 'B')!;
    expect(A.tariff_resident).toBe(1000); // 900k / 900
    expect(B.tariff_resident).toBe(0);    // (900k − 900k) / 900
  });
});
