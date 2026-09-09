// PR-2 (feat/smeta-expense-categories) блок F: unit-тесты группировки
// статей расходов по expense_type. Проверяем:
//   - Baseline (все items без category_id) → одна группа 'production',
//     PDF рендерится плоско (shouldRenderGroups=false).
//   - Смешанные типы → несколько групп, подытоги в сумме дают total.
//   - Порядок групп/items внутри группы сохраняется.
//   - Неизвестный expense_type → fallback на 'production'.

import { describe, expect, it } from 'vitest';
import {
  groupByExpenseType,
  shouldRenderGroups,
  normalizeExpenseType,
  expenseTypeLabel,
  type ExpenseItemWithCategory,
} from '../estimateExpenseGrouping';
import { totalExpensesYear } from '../estimateExpenseAmount';

const estimate = { fot_total: 13_433_333 };

describe('normalizeExpenseType', () => {
  it('пропускает известные типы как есть', () => {
    expect(normalizeExpenseType('production')).toBe('production');
    expect(normalizeExpenseType('management')).toBe('management');
    expect(normalizeExpenseType('current_repair')).toBe('current_repair');
    expect(normalizeExpenseType('capital_repair')).toBe('capital_repair');
    expect(normalizeExpenseType('other')).toBe('other');
  });

  it('нормализует регистр и trim', () => {
    expect(normalizeExpenseType('  PRODUCTION  ')).toBe('production');
    expect(normalizeExpenseType('Current_Repair')).toBe('current_repair');
  });

  it('NULL/undefined/пусто → fallback на production', () => {
    expect(normalizeExpenseType(null)).toBe('production');
    expect(normalizeExpenseType(undefined)).toBe('production');
    expect(normalizeExpenseType('')).toBe('production');
  });

  it('неизвестный тип → fallback на production (defensive)', () => {
    expect(normalizeExpenseType('bogus_type')).toBe('production');
    expect(normalizeExpenseType(42)).toBe('production');
  });
});

describe('expenseTypeLabel', () => {
  it('возвращает русский лейбл для лаyout=ru', () => {
    expect(expenseTypeLabel('production', 'ru')).toBe('Производственные');
    expect(expenseTypeLabel('management', 'ru')).toBe('Управленческие');
    expect(expenseTypeLabel('current_repair', 'ru')).toBe('Текущий ремонт');
    expect(expenseTypeLabel('capital_repair', 'ru')).toBe('Капитальный ремонт');
    expect(expenseTypeLabel('other', 'ru')).toBe('Прочие');
  });

  it('возвращает узбекский лейбл для lang=uz', () => {
    expect(expenseTypeLabel('production', 'uz')).toBe('Ishlab chiqarish');
    expect(expenseTypeLabel('capital_repair', 'uz')).toBe('Kapital ta\'mir');
  });
});

// ───────────────────────────────────────────────────────────────
// BASELINE-совместимость (главное — не сломать существующий рендер)
// ───────────────────────────────────────────────────────────────
describe('BASELINE — все items без category_id → одна группа production', () => {
  const baselineItems: ExpenseItemWithCategory[] = [
    { amount: 144_000_000, linked_to_staff: false }, // #1 Электрика МОП
    { amount: 0, linked_to_staff: false },           // #2 Фасады (0)
    { amount: 77_760_000, linked_to_staff: false },  // #3 Подъезды
    { amount: 0, linked_to_staff: true },            // #15 Ish haqi (linked)
    // ... 12 остальных категорий (не важно для теста логики)
  ];

  it('groupByExpenseType возвращает ровно 1 группу типа production', () => {
    const groups = groupByExpenseType(baselineItems, estimate);
    expect(groups).toHaveLength(1);
    expect(groups[0].expense_type).toBe('production');
    expect(groups[0].items).toHaveLength(4);
  });

  it('shouldRenderGroups === false для baseline → PDF рендерится плоско', () => {
    const groups = groupByExpenseType(baselineItems, estimate);
    expect(shouldRenderGroups(groups)).toBe(false);
  });

  it('subtotal_year группы = totalExpensesYear (инвариант согласованности)', () => {
    const groups = groupByExpenseType(baselineItems, estimate);
    expect(groups[0].subtotal_year).toBe(totalExpensesYear(baselineItems, estimate));
  });
});

// ───────────────────────────────────────────────────────────────
// Смешанные типы — грyппировка активируется
// ───────────────────────────────────────────────────────────────
describe('Смешанные expense_type → рендер с группами', () => {
  const mixedItems: ExpenseItemWithCategory[] = [
    { amount: 100_000_000, linked_to_staff: false, category_expense_type: 'production' },
    { amount: 50_000_000,  linked_to_staff: false, category_expense_type: 'management' },
    { amount: 200_000_000, linked_to_staff: false, category_expense_type: 'production' },
    { amount: 30_000_000,  linked_to_staff: false, category_expense_type: 'current_repair' },
  ];

  it('возвращает 3 группы (production, management, current_repair)', () => {
    const groups = groupByExpenseType(mixedItems, estimate);
    expect(groups).toHaveLength(3);
    expect(groups.map(g => g.expense_type)).toEqual(['production', 'management', 'current_repair']);
  });

  it('shouldRenderGroups === true → PDF рендерится с заголовками и подытогами', () => {
    const groups = groupByExpenseType(mixedItems, estimate);
    expect(shouldRenderGroups(groups)).toBe(true);
  });

  it('порядок групп — по первому появлению в исходном массиве items', () => {
    // Первый item production → группа production первой.
    // Второй item management → management вторая.
    // Четвёртый item current_repair → current_repair третья.
    const groups = groupByExpenseType(mixedItems, estimate);
    expect(groups[0].expense_type).toBe('production');
    expect(groups[1].expense_type).toBe('management');
    expect(groups[2].expense_type).toBe('current_repair');
  });

  it('items внутри группы — в исходном порядке (не сортируются)', () => {
    const groups = groupByExpenseType(mixedItems, estimate);
    const production = groups.find(g => g.expense_type === 'production')!;
    // Item 100M пришёл раньше item 200M → в группе production он тоже первый.
    expect(production.items[0].amount).toBe(100_000_000);
    expect(production.items[1].amount).toBe(200_000_000);
  });

  it('subtotal_year каждой группы правильно сложен', () => {
    const groups = groupByExpenseType(mixedItems, estimate);
    const prod = groups.find(g => g.expense_type === 'production')!;
    const mgmt = groups.find(g => g.expense_type === 'management')!;
    const rep = groups.find(g => g.expense_type === 'current_repair')!;
    expect(prod.subtotal_year).toBe(300_000_000);
    expect(mgmt.subtotal_year).toBe(50_000_000);
    expect(rep.subtotal_year).toBe(30_000_000);
  });

  it('ИНВАРИАНТ: Σ subtotal_year === totalExpensesYear', () => {
    const groups = groupByExpenseType(mixedItems, estimate);
    const sumSubtotals = groups.reduce((s, g) => s + g.subtotal_year, 0);
    expect(sumSubtotals).toBe(totalExpensesYear(mixedItems, estimate));
    expect(sumSubtotals).toBe(380_000_000);
  });
});

// ───────────────────────────────────────────────────────────────
// Смешение legacy (NULL) + новых items с category_expense_type
// ───────────────────────────────────────────────────────────────
describe('Legacy + новые items — legacy fallback\'ит на production', () => {
  const mixedItems: ExpenseItemWithCategory[] = [
    { amount: 100_000_000, linked_to_staff: false },                                   // legacy → production
    { amount: 50_000_000,  linked_to_staff: false, category_expense_type: 'management' }, // явное management
    { amount: 20_000_000,  linked_to_staff: false, category_expense_type: null },      // NULL → production
  ];

  it('legacy items и NULL items попадают в production; management-item — в свою группу', () => {
    const groups = groupByExpenseType(mixedItems, estimate);
    expect(groups).toHaveLength(2);
    const prod = groups.find(g => g.expense_type === 'production')!;
    const mgmt = groups.find(g => g.expense_type === 'management')!;
    expect(prod.items).toHaveLength(2); // legacy + NULL
    expect(mgmt.items).toHaveLength(1);
    expect(prod.subtotal_year).toBe(120_000_000);
    expect(mgmt.subtotal_year).toBe(50_000_000);
  });
});

// ───────────────────────────────────────────────────────────────
// Пустой input
// ───────────────────────────────────────────────────────────────
describe('Empty items', () => {
  it('пустой массив → пустой groups, shouldRenderGroups=false', () => {
    const groups = groupByExpenseType([], estimate);
    expect(groups).toHaveLength(0);
    expect(shouldRenderGroups(groups)).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────
// linked_to_staff через effectiveAmountYear (согласованность с PR-1 P1 фиксом)
// ───────────────────────────────────────────────────────────────
describe('linked_to_staff корректно учитывается в subtotal', () => {
  it('строка Ish haqi берёт fot_total×12 через effectiveAmountYear', () => {
    const items: ExpenseItemWithCategory[] = [
      { amount: 100_000_000, linked_to_staff: false, category_expense_type: 'production' },
      // Устаревшее amount, но linked_to_staff → берётся fot_total×12
      { amount: 8_700_000_000, linked_to_staff: true, category_expense_type: 'production' },
    ];
    const groups = groupByExpenseType(items, estimate);
    // Subtotal = 100M + 13.43M×12 = 100M + 161.2M = 261.2M
    expect(groups[0].subtotal_year).toBe(100_000_000 + 13_433_333 * 12);
  });
});
