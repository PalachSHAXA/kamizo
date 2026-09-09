// P1 fix (fix/smeta-p1-annual-mismatch): unit-тесты хелпера, который
// используется PDF-генератором для отображения годовой суммы каждой
// строки расхода и итога. Без этого хелпера верхний KPI «Себестоимость»
// расходился с итогом детализации в 10× (baseline: 959M vs 8.82B).
//
// Синтетические сценарии покрывают крайние случаи, чтобы фикс работал
// для ЛЮБОЙ УК с любыми данными, а не только для тестовой сметы myhelper.

import { describe, expect, it } from 'vitest';
import {
  effectiveAmountYear,
  totalExpensesYear,
  type ExpenseItemLike,
} from '../estimateExpenseAmount';

describe('effectiveAmountYear', () => {
  it('linked_to_staff=true → берёт fot_total × 12, игнорирует amount', () => {
    // Классический баг: amount в БД — старьё, fot_total — живое.
    // Правильное отображение — fot_total × 12.
    const item: ExpenseItemLike = {
      amount: 8_700_000_000, // старое замороженное значение из БД
      linked_to_staff: true,
    };
    const estimate = { fot_total: 13_433_333 };
    expect(effectiveAmountYear(item, estimate)).toBe(13_433_333 * 12);
  });

  it('linked_to_staff=false → берёт сохранённое amount', () => {
    const item: ExpenseItemLike = { amount: 12_000_000, linked_to_staff: false };
    const estimate = { fot_total: 13_433_333 };
    expect(effectiveAmountYear(item, estimate)).toBe(12_000_000);
  });

  it('linked_to_staff отсутствует → трактуется как false', () => {
    const item: ExpenseItemLike = { amount: 12_000_000 };
    expect(effectiveAmountYear(item, { fot_total: 999_000_000 })).toBe(12_000_000);
  });

  it('linked_to_staff=1 (SQLite boolean) → true', () => {
    // SQLite хранит boolean как 0/1 — проверяем truthy-контракт.
    const item: ExpenseItemLike = { amount: 0, linked_to_staff: 1 };
    expect(effectiveAmountYear(item, { fot_total: 5_000_000 })).toBe(60_000_000);
  });

  it('estimate.fot_total отсутствует и linked_to_staff=true → 0', () => {
    // Смета без штата (только commercial income + расходы): линкованные
    // строки должны обнулиться, а не вернуть NaN.
    const item: ExpenseItemLike = { amount: 1_000_000, linked_to_staff: true };
    expect(effectiveAmountYear(item, {})).toBe(0);
  });

  it('item.amount отсутствует и не linked_to_staff → 0', () => {
    // Guard от NaN на неполных данных.
    const item: ExpenseItemLike = {};
    expect(effectiveAmountYear(item, { fot_total: 5_000_000 })).toBe(0);
  });
});

describe('totalExpensesYear', () => {
  const estimate = { fot_total: 13_433_333 };

  it('пустой массив → 0, без NaN', () => {
    expect(totalExpensesYear([], estimate)).toBe(0);
  });

  it('инвариант: sum(effectiveAmountYear) === totalExpensesYear', () => {
    // Ключевая гарантия — итог считается тем же алгоритмом, что и
    // построчный вывод в детализации, поэтому расходиться не могут.
    const items: ExpenseItemLike[] = [
      { amount: 12_000_000, linked_to_staff: false },
      { amount: 8_700_000_000, linked_to_staff: true }, // linked → 13.43M×12
      { amount: 5_000_000, linked_to_staff: 0 },
    ];
    const perLine = items.reduce((s, i) => s + effectiveAmountYear(i, estimate), 0);
    expect(totalExpensesYear(items, estimate)).toBe(perLine);
  });

  // ────────────────────────────────────────────────────────────────
  // Сценарий 1 — Baseline (myhelper 2026-08, реальная prod-запись)
  // ────────────────────────────────────────────────────────────────
  it('BASELINE — myhelper 2026-08: 16 категорий, ФОТ 13.43M/мес', () => {
    // Реальные числа из docs/smeta-audit.md P1:
    //   fot_total = 13 433 333/мес  (в БД будет 8.7B/год если старьё)
    //   15 остальных категорий: суммарно 61 274 500/мес → 735 294 000/год
    // Ожидаем в PDF: 15 категорий × amount (уже год) + 1 linked × fot_total × 12
    //   = 735_294_000 (без linked-строки в этой сумме, т.к. в baseline
    //     linked-строка это Расходы по зарплате, часть 735.294)
    // Поэтому для чистоты — моделируем 15 не-linked + 1 linked отдельно.
    const items: ExpenseItemLike[] = [
      // 15 обычных статей на суммарно 61 274 500/мес × 12 = 735 294 000
      { amount: 735_294_000 - /* оставим одну линкованную строку отдельно */ 0, linked_to_staff: false },
      // 16-я — строка «Расходы по зарплате», в БД замороженная (устарела)
      { amount: 8_700_000_000, linked_to_staff: true },
    ];
    const est = { fot_total: 13_433_333 };
    // Ожидаемая сумма: 735 294 000 + 13 433 333 × 12 = 735 294 000 + 161 199 996 = 896 493 996
    // Это годовые расходы БЕЗ прибыли (себестоимость год). umumiy_year = × 1.07 = 959 248 576.
    expect(totalExpensesYear(items, est)).toBe(735_294_000 + 161_199_996);
  });

  // ────────────────────────────────────────────────────────────────
  // Сценарий 2 — Смета без commercial income (только расходы, доход=0)
  // ────────────────────────────────────────────────────────────────
  it('SCENARIO 2 — без commercial income: helper обрабатывает только expenses', () => {
    // Хелпер сам не считает incomes; проверяем, что расходная сумма
    // рассчитывается корректно и не зависит от наличия доходов.
    const items: ExpenseItemLike[] = [
      { amount: 100_000_000, linked_to_staff: false },
      { amount: 50_000_000, linked_to_staff: false },
      { amount: 0, linked_to_staff: true }, // ФОТ подставится
    ];
    const est = { fot_total: 10_000_000 };
    expect(totalExpensesYear(items, est)).toBe(150_000_000 + 120_000_000);
  });

  // ────────────────────────────────────────────────────────────────
  // Сценарий 3 — Частично заполненный штат / зарплаты
  // ────────────────────────────────────────────────────────────────
  it('SCENARIO 3 — частичный штат: fot_total низкий, но linked-строка НЕ ломается', () => {
    // Смета с 3 из 7 должностей: fot_total = 3M/мес (маленький).
    // Строка «Расходы по зарплате» должна показать 36M/год, не NaN и не
    // сохранённое устарелое значение.
    const items: ExpenseItemLike[] = [
      { amount: 42_000_000, linked_to_staff: false },
      { amount: 240_000_000, linked_to_staff: true }, // старая замороженная
    ];
    const est = { fot_total: 3_000_000 };
    expect(totalExpensesYear(items, est)).toBe(42_000_000 + 36_000_000);
  });

  // ────────────────────────────────────────────────────────────────
  // Сценарий 4 — Custom rates (5% профит, 25% налог на ФОТ)
  // ────────────────────────────────────────────────────────────────
  it('SCENARIO 4 — custom rates не влияют на суммирование (это дело движка)', () => {
    // Хелпер работает уровнем ниже, чем profit/tax — он получает
    // уже посчитанный fot_total (в котором учтён payroll_tax_rate).
    // Проверяем: разные fot_total дают разные годовые суммы.
    const items: ExpenseItemLike[] = [
      { amount: 100_000_000, linked_to_staff: false },
      { amount: 0, linked_to_staff: true },
    ];
    // Смета А: 24% налог, ФОТ 12.4M
    expect(totalExpensesYear(items, { fot_total: 12_400_000 }))
      .toBe(100_000_000 + 12_400_000 * 12);
    // Смета Б: 25% налог, ФОТ 12.5M — линкованная строка тоже другая
    expect(totalExpensesYear(items, { fot_total: 12_500_000 }))
      .toBe(100_000_000 + 12_500_000 * 12);
    // Смета В: 0 штат / без налога — линкованная строка = 0
    expect(totalExpensesYear(items, { fot_total: 0 }))
      .toBe(100_000_000);
  });
});
