// PR-2 (feat/smeta-expense-categories) блок F: группировка статей расходов
// по expense_type для PDF-раскладки.
//
// Каждая статья `finance_estimate_items` может ссылаться на
// `expense_categories` через `category_id`. Backend LEFT JOIN'ит справочник
// и возвращает `category_expense_type` в ответе. Frontend читает это поле
// и группирует расходы в PDF.
//
// baseline-совместимость: статьи с `category_id = NULL` (все существующие
// items до применения миграции 081) → `category_expense_type = undefined` →
// fallback на 'production'. Если у сметы все items falls в одну группу
// (нет ни одной привязанной к non-production категории), PDF рендерит
// таблицу плоско, БЕЗ группировки — идентично поведению до этого PR.
//
// Тесты: __tests__/estimateExpenseGrouping.test.ts.

import { effectiveAmountYear, type ExpenseItemLike, type EstimateSummaryLike } from './estimateExpenseAmount';

/** Расширяем ExpenseItemLike полями, которые бэкенд заджоинил из
 *  expense_categories. Все поля опциональны — на legacy items они undefined. */
export interface ExpenseItemWithCategory extends ExpenseItemLike {
  category_expense_type?: string | null;
  category_name_ru?: string | null;
  category_name_uz?: string | null;
  category_is_mandatory?: number | boolean | null;
}

/** Каноническое значение expense_type — если пусто, fallback на 'production'
 *  (сохраняет baseline-поведение до применения справочника). */
export type ExpenseTypeKey =
  | 'production'
  | 'management'
  | 'current_repair'
  | 'capital_repair'
  | 'other';

const KNOWN_TYPES: readonly ExpenseTypeKey[] = [
  'production',
  'management',
  'current_repair',
  'capital_repair',
  'other',
];

/** Приводит поле бэкенда к канонич. ключу. NULL/пусто/неизвестное → 'production'. */
export function normalizeExpenseType(raw: unknown): ExpenseTypeKey {
  const s = String(raw ?? '').trim().toLowerCase();
  return (KNOWN_TYPES as readonly string[]).includes(s)
    ? (s as ExpenseTypeKey)
    : 'production';
}

/** Локализованный ярлык категории для PDF-хедера группы. */
export function expenseTypeLabel(type: ExpenseTypeKey, lang: 'ru' | 'uz'): string {
  const map: Record<ExpenseTypeKey, { ru: string; uz: string }> = {
    production:     { ru: 'Производственные',     uz: 'Ishlab chiqarish' },
    management:     { ru: 'Управленческие',        uz: 'Boshqaruv xarajatlari' },
    current_repair: { ru: 'Текущий ремонт',        uz: 'Joriy ta\'mir' },
    capital_repair: { ru: 'Капитальный ремонт',    uz: 'Kapital ta\'mir' },
    other:          { ru: 'Прочие',                uz: 'Boshqa' },
  };
  return map[type][lang];
}

export interface ExpenseGroup {
  expense_type: ExpenseTypeKey;
  items: ExpenseItemWithCategory[];
  subtotal_year: number;
}

/**
 * Группирует items по expense_type, считает суммарную годовую сумму на
 * каждую группу (через effectiveAmountYear — тот же helper, что для
 * итога детализации PDF; гарантирует, что sum(subtotals) === totalExpensesYear).
 *
 * Порядок групп — исходный порядок появления в items (стабильный, не
 * отсортированный по алфавиту): если первый item — production, потом
 * current_repair, потом ещё раз production — группы в порядке
 * [production, current_repair] с items распределёнными по type.
 * Внутри группы items идут в исходном порядке — не переставляются.
 */
export function groupByExpenseType(
  items: ExpenseItemWithCategory[],
  estimate: EstimateSummaryLike,
): ExpenseGroup[] {
  const groupMap = new Map<ExpenseTypeKey, ExpenseGroup>();
  const orderedTypes: ExpenseTypeKey[] = [];

  for (const item of items) {
    const type = normalizeExpenseType(item.category_expense_type);
    let group = groupMap.get(type);
    if (!group) {
      group = { expense_type: type, items: [], subtotal_year: 0 };
      groupMap.set(type, group);
      orderedTypes.push(type);
    }
    group.items.push(item);
    group.subtotal_year += effectiveAmountYear(item, estimate);
  }

  return orderedTypes.map(t => groupMap.get(t)!);
}

/**
 * Правило рендеринга: PDF показывает группы (с заголовками и подытогами)
 * только если действительно есть ≥2 разных expense_type. Иначе — плоский
 * рендер без заголовков (baseline-совместимость: до миграции все items
 * fallback'ят в одну группу 'production' → render как раньше).
 */
export function shouldRenderGroups(groups: ExpenseGroup[]): boolean {
  return groups.length >= 2;
}
