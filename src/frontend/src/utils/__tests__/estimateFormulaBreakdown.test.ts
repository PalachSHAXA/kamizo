// PR-3 (feat/smeta-item-formulas) блок B: unit-тесты formula-расшифровки.
// Проверяем:
//   - Все три поля заполнены → рендерится текст
//   - Хоть одно пусто → NULL/пустая строка (baseline-совместимость: legacy
//     items без formula-полей рендерятся плоско)
//   - Частота корректно локализуется (месяц/год/неделя)
//   - source_price_ref и formula_notes рендерятся отдельными meta-строками

import { describe, expect, it } from 'vitest';
import {
  buildFormulaText,
  buildFormulaMeta,
  renderFormulaBreakdownHtml,
  type FormulaFieldsLike,
} from '../estimateFormulaBreakdown';

const noop = (s: string) => s; // trivial escape для тестов

describe('buildFormulaText — все три поля', () => {
  it('стандарт: 144 м² × 1 000 000 × ежемесячно', () => {
    const item: FormulaFieldsLike = {
      quantity: 144, qty_unit: 'м²', unit_price: 1_000_000, frequency_per_month: 1,
    };
    expect(buildFormulaText(item, 'ru')).toBe('144 м² × 1 000 000 × раз/мес');
  });

  it('без qty_unit — просто число', () => {
    const item: FormulaFieldsLike = {
      quantity: 12, unit_price: 500_000, frequency_per_month: 1,
    };
    expect(buildFormulaText(item, 'ru')).toBe('12 × 500 000 × раз/мес');
  });

  it('раз/год: frequency_per_month ≈ 1/12', () => {
    const item: FormulaFieldsLike = {
      quantity: 1, qty_unit: 'услуга', unit_price: 10_000_000, frequency_per_month: 1 / 12,
    };
    expect(buildFormulaText(item, 'ru')).toBe('1 услуга × 10 000 000 × раз/год');
  });

  it('раз в 2 месяца: 0.5', () => {
    const item: FormulaFieldsLike = {
      quantity: 1, qty_unit: 'услуга', unit_price: 5_000_000, frequency_per_month: 0.5,
    };
    expect(buildFormulaText(item, 'ru')).toBe('1 услуга × 5 000 000 × раз/2 мес');
  });

  it('еженедельно: ≈ 4.33 раз/мес', () => {
    const item: FormulaFieldsLike = {
      quantity: 1, unit_price: 200_000, frequency_per_month: 4.33,
    };
    expect(buildFormulaText(item, 'ru')).toBe('1 × 200 000 × раз/нед');
  });

  it('нестандартная частота — рендерится как ×N/мес', () => {
    const item: FormulaFieldsLike = {
      quantity: 1, unit_price: 100_000, frequency_per_month: 2.5,
    };
    expect(buildFormulaText(item, 'ru')).toBe('1 × 100 000 × 2.5/мес');
  });

  it('узбекская локализация', () => {
    const item: FormulaFieldsLike = {
      quantity: 5, qty_unit: 'shtuk', unit_price: 1_000, frequency_per_month: 1,
    };
    expect(buildFormulaText(item, 'uz')).toBe('5 shtuk × 1 000 × oyda 1 marta');
  });
});

describe('buildFormulaText — недостаточно данных → null (baseline-совместимость)', () => {
  it('нет quantity → null', () => {
    expect(buildFormulaText({ unit_price: 1000, frequency_per_month: 1 }, 'ru')).toBeNull();
  });

  it('нет unit_price → null', () => {
    expect(buildFormulaText({ quantity: 10, frequency_per_month: 1 }, 'ru')).toBeNull();
  });

  it('нет frequency_per_month → null', () => {
    expect(buildFormulaText({ quantity: 10, unit_price: 1000 }, 'ru')).toBeNull();
  });

  it('пустой объект → null', () => {
    expect(buildFormulaText({}, 'ru')).toBeNull();
  });

  it('всё NULL → null', () => {
    expect(buildFormulaText({ quantity: null, unit_price: null, frequency_per_month: null }, 'ru')).toBeNull();
  });

  it('quantity=0 → null (guard от отрицательного/нулевого)', () => {
    expect(buildFormulaText({ quantity: 0, unit_price: 100, frequency_per_month: 1 }, 'ru')).toBeNull();
  });
});

describe('buildFormulaMeta — source_price_ref + formula_notes', () => {
  it('пустой объект → []', () => {
    expect(buildFormulaMeta({}, 'ru')).toEqual([]);
  });

  it('только source_price_ref', () => {
    const item: FormulaFieldsLike = { source_price_ref: '№ договора КМ-42' };
    expect(buildFormulaMeta(item, 'ru')).toEqual(['Источник: № договора КМ-42']);
  });

  it('только formula_notes', () => {
    const item: FormulaFieldsLike = { formula_notes: 'Учтён сезонный коэффициент' };
    expect(buildFormulaMeta(item, 'ru')).toEqual(['Учтён сезонный коэффициент']);
  });

  it('оба заполнены — порядок: source → notes', () => {
    const item: FormulaFieldsLike = {
      source_price_ref: 'Прайс поставщика X',
      formula_notes: 'Скидка 5% учтена',
    };
    expect(buildFormulaMeta(item, 'ru')).toEqual([
      'Источник: Прайс поставщика X',
      'Скидка 5% учтена',
    ]);
  });

  it('узбекский префикс для source', () => {
    const item: FormulaFieldsLike = { source_price_ref: '№ shartnoma' };
    expect(buildFormulaMeta(item, 'uz')).toEqual(['Manba: № shartnoma']);
  });
});

describe('renderFormulaBreakdownHtml — интеграция', () => {
  it('BASELINE: пустой item → пустая строка (никакого HTML в PDF)', () => {
    expect(renderFormulaBreakdownHtml({}, 'ru', noop)).toBe('');
  });

  it('BASELINE: item только с amount (legacy) → пустая строка', () => {
    // Симулирует запись из baseline myhelper — все formula-поля NULL.
    const item: FormulaFieldsLike = {
      quantity: null, qty_unit: null, unit_price: null,
      frequency_per_month: null, source_price_ref: null, formula_notes: null,
    };
    expect(renderFormulaBreakdownHtml(item, 'ru', noop)).toBe('');
  });

  it('Только formula (без source/notes) → одна div', () => {
    const item: FormulaFieldsLike = {
      quantity: 144, qty_unit: 'м²', unit_price: 1_000_000, frequency_per_month: 1,
    };
    const html = renderFormulaBreakdownHtml(item, 'ru', noop);
    expect(html).toContain('144 м² × 1 000 000 × раз/мес');
    expect(html).toContain('font-size:8pt');
    expect(html).not.toContain('Источник:');
  });

  it('Только source (без formula) → тоже рендерится (meta без formula)', () => {
    const item: FormulaFieldsLike = { source_price_ref: '№ 42' };
    const html = renderFormulaBreakdownHtml(item, 'ru', noop);
    expect(html).toContain('Источник: № 42');
    expect(html).not.toContain('×'); // нет formula-строки
  });

  it('Formula + source + notes — все три блока', () => {
    const item: FormulaFieldsLike = {
      quantity: 5, unit_price: 100_000, frequency_per_month: 1,
      source_price_ref: 'Прайс',
      formula_notes: 'Скидка',
    };
    const html = renderFormulaBreakdownHtml(item, 'ru', noop);
    expect(html).toContain('5 × 100 000 × раз/мес');
    expect(html).toContain('Источник: Прайс');
    expect(html).toContain('Скидка');
  });

  it('escape-функция вызывается для user-текста (XSS-guard)', () => {
    const escape = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const item: FormulaFieldsLike = {
      quantity: 1, unit_price: 1000, frequency_per_month: 1,
      source_price_ref: '<script>bad</script>',
    };
    const html = renderFormulaBreakdownHtml(item, 'ru', escape);
    expect(html).toContain('&lt;script&gt;bad&lt;/script&gt;');
    expect(html).not.toContain('<script>bad</script>');
  });
});
