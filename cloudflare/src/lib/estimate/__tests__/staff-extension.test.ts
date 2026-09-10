// PR-7 (feat/smeta-staff-extension) блок C: unit-тесты гарантируют, что
// расчётный движок compute.ts ИГНОРИРУЕТ новые поля из миграции 085
// (employment_type, employment_share, employer_contributions,
// additional_payments, period_start/end, building_id, staff_category).
//
// Baseline инвариант: расчёт FOT_base/gross/tax/total не меняется от
// наличия/отсутствия этих полей — это ключ к тому, что PDF SHA256
// сохранится (9-е измерение).

import { describe, expect, it } from 'vitest';
import { computeEstimate, type EstimateInput, type StaffPosition } from '../compute';

// Extension-тип с расширенными полями (миграция 085). Compute-движок
// не типизирует их, но объекты приходят через SELECT с этими property.
interface StaffPositionExtended extends StaffPosition {
  employment_type?: string;
  employment_share?: number;
  employer_contributions?: number;
  additional_payments?: number;
  period_start?: string;
  period_end?: string;
  building_id?: string;
  staff_category?: string;
}

describe('PR-7 staff extension — compute engine игнорирует новые поля', () => {
  const baseInput = (staffExtra: Partial<StaffPositionExtended> = {}): EstimateInput => ({
    model: 'TARIFF_CALCULATED',
    object: { residential_area: 1000, profit_rate: 0.07, payroll_tax_rate: 0.24 },
    staff: [
      {
        title: 'Дворник',
        units: 1,
        salary: 5_000_000,
        ...staffExtra,
      } as StaffPosition,
    ],
    expenses: [],
    incomes: [],
  });

  it('BASELINE: только title/units/salary → FOT_gross=5M, tax=1.2M, total=6.2M', () => {
    const r = computeEstimate(baseInput());
    expect(r.fot_gross).toBe(5_000_000);
    expect(r.payroll_tax).toBe(1_200_000);
    expect(r.fot_total).toBe(6_200_000);
  });

  it('employment_type=part_time — расчёт не меняется', () => {
    const r = computeEstimate(baseInput({ employment_type: 'part_time' }));
    expect(r.fot_gross).toBe(5_000_000);
    expect(r.fot_total).toBe(6_200_000);
  });

  it('employment_share=0.5 — расчёт НЕ пересчитывается (это только документация)', () => {
    // Реальный пересчёт monthly = units × salary × employment_share будет
    // отдельным PR. Сейчас поле информационное, compute про него не знает.
    const r = computeEstimate(baseInput({ employment_share: 0.5 }));
    // FOT_gross по-прежнему = 5M, не 2.5M
    expect(r.fot_gross).toBe(5_000_000);
  });

  it('employer_contributions=100000 — не подмешивается в FOT (это отдельные взносы)', () => {
    // employer_contributions — доп. взносы работодателя, НЕ облагаемые
    // payroll_tax_rate. Отдельная логика — если понадобится, будет
    // отдельный PR.
    const r = computeEstimate(baseInput({ employer_contributions: 100_000 }));
    expect(r.fot_gross).toBe(5_000_000);   // без изменений
    expect(r.fot_total).toBe(6_200_000);   // без изменений
  });

  it('additional_payments=200000 — тоже не пересчитывается', () => {
    const r = computeEstimate(baseInput({ additional_payments: 200_000 }));
    expect(r.fot_gross).toBe(5_000_000);
    expect(r.fot_total).toBe(6_200_000);
  });

  it('period_start/period_end — расчёт по-прежнему считает как за 12 месяцев', () => {
    // Для сезонных сотрудников (например, дворник на летний период) в
    // будущем нужно будет пересчитывать jami_tushum_year с учётом дней
    // работы. Пока — просто игнорируются.
    const r = computeEstimate(baseInput({
      period_start: '2026-06-01',
      period_end: '2026-08-31',
    }));
    // FOT в стаффе, но нет expenses с linked_to_staff → total_expenses = 0
    // umumiy_year = 0. Ключевое: fot_gross всё равно 5M (наш расчёт),
    // period_start/end на compute никак не влияет.
    expect(r.fot_gross).toBe(5_000_000);
  });

  it('building_id и staff_category — тоже игнорируются', () => {
    const r = computeEstimate(baseInput({
      building_id: 'some-uuid',
      staff_category: 'admin',
    }));
    expect(r.fot_gross).toBe(5_000_000);
    expect(r.fot_total).toBe(6_200_000);
  });

  it('ВСЕ новые поля заполнены — расчёт всё ещё baseline', () => {
    const r = computeEstimate(baseInput({
      employment_type: 'contract',
      employment_share: 0.75,
      employer_contributions: 300_000,
      additional_payments: 500_000,
      period_start: '2026-01-01',
      period_end: '2026-12-31',
      building_id: 'building-42',
      staff_category: 'production',
    }));
    expect(r.fot_gross).toBe(5_000_000);
    expect(r.payroll_tax).toBe(1_200_000);
    expect(r.fot_total).toBe(6_200_000);
  });

  it('vacation_days по-прежнему участвует (единственное «активное» поле)', () => {
    // Регресс: vacation_days из миграции 060 — единственное поле сверх
    // базовых (title/units/salary), которое реально влияет на расчёт.
    // Проверяем, что расширение 085 не сломало эту связку.
    const r = computeEstimate(baseInput({ vacation_days: 21 }));
    // FOT_base=5M + vacation_reserve = 5M/12 ≈ 416 666.67 → gross ≈ 5 416 667
    // (compute не округляет fot_gross, только payroll_tax через round0)
    expect(r.fot_gross).toBeCloseTo(5_416_667, 0);
    expect(r.payroll_tax).toBe(Math.round(r.fot_gross * 0.24));
  });
});

describe('PR-7 staff_category — прото-разделение admin/production', () => {
  it('поле сохраняется как строка, значения enum не проверяются на compute-уровне', () => {
    // CHECK constraint не добавляли — валидация значений на бэке в
    // отдельном PR. Тест: любая строка не ломает compute.
    const input: EstimateInput = {
      model: 'TARIFF_CALCULATED',
      object: { residential_area: 1000, profit_rate: 0.07, payroll_tax_rate: 0.24 },
      staff: [
        { title: 'A', units: 1, salary: 1000, staff_category: 'admin' } as StaffPositionExtended,
        { title: 'B', units: 1, salary: 2000, staff_category: 'production' } as StaffPositionExtended,
        { title: 'C', units: 1, salary: 3000, staff_category: 'unknown-value' } as StaffPositionExtended,
      ],
      expenses: [],
      incomes: [],
    };
    const r = computeEstimate(input);
    expect(r.fot_gross).toBe(6000);
  });
});
