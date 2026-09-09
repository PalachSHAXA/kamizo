// P4/P5 fix (fix/smeta-p4-p5-config): единый источник истины для дефолтных
// значений при создании новой сметы. Регрессионные тесты гарантируют, что
// значения не разъедутся между backend'ом и frontend'ом и что реальные
// расчёты со значениями по умолчанию продолжают давать ожидаемые числа.
//
// Зеркальный тест на фронте: src/frontend/src/utils/__tests__/estimateDefaults.test.ts

import { describe, expect, it } from 'vitest';
import { DEFAULT_PAYROLL_TAX_RATE, DEFAULT_UK_PROFIT_PERCENT } from '../constants';
import { computeEstimate, type EstimateInput } from '../compute';

describe('P4/P5 defaults — backend constants', () => {
  it('DEFAULT_PAYROLL_TAX_RATE === 0.24 (12% НДФЛ + 12% соцналог для небюджетной УК)', () => {
    expect(DEFAULT_PAYROLL_TAX_RATE).toBe(0.24);
  });

  it('DEFAULT_UK_PROFIT_PERCENT === 7 (рыночный ориентир)', () => {
    expect(DEFAULT_UK_PROFIT_PERCENT).toBe(7);
  });

  it('оба значения — конечные числа (без NaN/Infinity)', () => {
    expect(Number.isFinite(DEFAULT_PAYROLL_TAX_RATE)).toBe(true);
    expect(Number.isFinite(DEFAULT_UK_PROFIT_PERCENT)).toBe(true);
  });
});

describe('P4/P5 behaviour — расчёт с дефолтными значениями', () => {
  const baselineWithDefaults = (): EstimateInput => ({
    model: 'TARIFF_CALCULATED',
    object: {
      residential_area: 1000,
      profit_rate: DEFAULT_UK_PROFIT_PERCENT / 100,   // 0.07
      payroll_tax_rate: DEFAULT_PAYROLL_TAX_RATE,     // 0.24
    },
    staff: [{ title: 'Директор', units: 1, salary: 5_000_000 }],
    expenses: [
      { name: 'Расходы по зарплате', monthly: 0, linked_to_staff: true },
      { name: 'Электрика МОП', monthly: 500_000 },
    ],
    incomes: [],
  });

  it('дефолты дают: FOT_total = 5M × 1.24 = 6.2M/мес', () => {
    const r = computeEstimate(baselineWithDefaults());
    // FOT_gross = 5_000_000 (нет отпускных, vacation_days undef → 0)
    // FOT_total = 5_000_000 × 1.24 = 6_200_000
    expect(r.fot_gross).toBe(5_000_000);
    expect(r.payroll_tax).toBe(1_200_000);
    expect(r.fot_total).toBe(6_200_000);
  });

  it('дефолты дают: umumiy_year = total_expenses × 12 × 1.07', () => {
    const r = computeEstimate(baselineWithDefaults());
    // total_expenses = FOT_total 6_200_000 + 500_000 = 6_700_000
    // umumiy_year = 6_700_000 × 12 × 1.07 = 86 028 000
    expect(r.total_expenses).toBe(6_700_000);
    expect(r.umumiy_year).toBe(Math.round(r.total_expenses * 12 * 1.07));
  });

  it('явный override 10% профит НЕ используется в дефолте, но работает как input', () => {
    // Симулирует существующую смету, у которой пользователь явно поставил 10%
    // до P4-фикса (когда UI отдавал 7 по дефолту, но некоторые записи имели 10).
    // Формула для тарифа должна корректно применить 10%, а не 7%.
    const input = baselineWithDefaults();
    input.object.profit_rate = 0.10; // явный override
    const r = computeEstimate(input);
    // base_per_m2 = (6 700 000) / 1000 = 6700
    // with_profit = 6700 × 1.10 = 7370
    expect(r.tariff_resident).toBe(7370);
  });

  it('явный override 0.25 налог (бюджетная УК) корректно применяется', () => {
    // Симулирует бюджетную УК, у которой соцналог 25% вместо 12%.
    // Дефолт 24% не должен схлопнуть их специфичное 25%.
    const input = baselineWithDefaults();
    input.object.payroll_tax_rate = 0.25;
    const r = computeEstimate(input);
    // FOT_gross = 5M; tax@25% = 1 250 000; FOT_total = 6 250 000
    expect(r.payroll_tax).toBe(1_250_000);
    expect(r.fot_total).toBe(6_250_000);
  });

  it('изменение дефолта в будущем автоматически подхватится тестом', () => {
    // Гарантирует, что если в будущем DEFAULT_UK_PROFIT_PERCENT изменится
    // (например на 5%), инвариант umumiy_year = total_expenses × 12 × (1 + profit)
    // продолжит держаться — тест использует константу, а не литерал.
    const input = baselineWithDefaults();
    const r = computeEstimate(input);
    expect(r.umumiy_year).toBe(
      Math.round(r.total_expenses * 12 * (1 + DEFAULT_UK_PROFIT_PERCENT / 100))
    );
  });
});
