// PR-3 (feat/smeta-item-formulas) блок B: расшифровка формулы расхода
// для отображения в PDF под названием статьи.
//
// Формат: «144 м² × 1 000 000 сум × 1/мес» — показывает пользователю,
// откуда получилась сумма monthly. Не заменяет расчёт (backend хранит
// monthly и amount как источник истины), только документирует.
//
// Правило рендера:
//   - Все три поля (quantity, unit_price, frequency_per_month) должны
//     быть непустыми и > 0. Иначе — расшифровка не рендерится (item
//     оформляется плоско как раньше → baseline-совместимость).
//   - qty_unit опционален; если пуст — просто число без единицы.
//   - source_price_ref рендерится отдельной строкой ниже, если задан.
//   - formula_notes — свободный текст, тоже отдельной строкой.

export interface FormulaFieldsLike {
  quantity?: number | null;
  qty_unit?: string | null;
  unit_price?: number | null;
  frequency_per_month?: number | null;
  source_price_ref?: string | null;
  formula_notes?: string | null;
}

// Intl в Node/браузере вставляет NBSP (U+00A0) как разделитель тысяч.
// В PDF это визуально идентично обычному пробелу, но осложняет
// unit-тесты. Нормализуем в обычный пробел для стабильности вывода.
const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)).replace(/ /g, ' ');

/** Числа-дроби для frequency: 0.0833 → «раз/год», 0.5 → «раз/2мес», 1 → «раз/мес». */
function frequencyLabel(f: number, lang: 'ru' | 'uz'): string {
  const ru = lang === 'ru';
  if (Math.abs(f - 1) < 0.01) return ru ? 'раз/мес' : 'oyda 1 marta';
  if (Math.abs(f - 0.5) < 0.01) return ru ? 'раз/2 мес' : '2 oyda 1 marta';
  if (Math.abs(f - 1 / 12) < 0.01) return ru ? 'раз/год' : 'yilda 1 marta';
  if (Math.abs(f - 4.33) < 0.05) return ru ? 'раз/нед' : 'haftada 1 marta';
  // Дробное: показать как "×N/мес" — универсально
  const rounded = Math.round(f * 100) / 100;
  return ru ? `${rounded}/мес` : `${rounded}/oy`;
}

/**
 * Возвращает готовый inline-текст «Q [unit] × P × freq» для PDF, либо
 * null если недостаточно данных. Только чистый текст — форматирование
 * HTML — забота вызывающего.
 */
export function buildFormulaText(
  item: FormulaFieldsLike,
  lang: 'ru' | 'uz',
): string | null {
  const q = Number(item.quantity ?? 0);
  const p = Number(item.unit_price ?? 0);
  const f = Number(item.frequency_per_month ?? 0);
  if (!(q > 0) || !(p > 0) || !(f > 0)) return null;
  const unit = item.qty_unit ? ` ${item.qty_unit}` : '';
  return `${fmt(q)}${unit} × ${fmt(p)} × ${frequencyLabel(f, lang)}`;
}

/**
 * Возвращает список дополнительных строк описания (source_price_ref,
 * formula_notes) в порядке рендера. Пустые пропущены.
 */
export function buildFormulaMeta(
  item: FormulaFieldsLike,
  lang: 'ru' | 'uz',
): string[] {
  const lines: string[] = [];
  if (item.source_price_ref) {
    lines.push(lang === 'ru'
      ? `Источник: ${item.source_price_ref}`
      : `Manba: ${item.source_price_ref}`);
  }
  if (item.formula_notes) {
    lines.push(item.formula_notes);
  }
  return lines;
}

/**
 * ЕДИНАЯ точка для PDF-рендера — возвращает готовый HTML-фрагмент
 * (маленький серый текст под названием), либо пустую строку.
 * Caller уже сделал escape для родительского контекста.
 */
export function renderFormulaBreakdownHtml(
  item: FormulaFieldsLike,
  lang: 'ru' | 'uz',
  escape: (s: string) => string,
): string {
  const formulaText = buildFormulaText(item, lang);
  const metaLines = buildFormulaMeta(item, lang);
  if (!formulaText && metaLines.length === 0) return '';
  const parts: string[] = [];
  if (formulaText) {
    parts.push(`<div style="font-size:8pt; color:#666; margin-top:1mm;">${escape(formulaText)}</div>`);
  }
  for (const m of metaLines) {
    parts.push(`<div style="font-size:8pt; color:#888; font-style:italic; margin-top:0.5mm;">${escape(m)}</div>`);
  }
  return parts.join('');
}
