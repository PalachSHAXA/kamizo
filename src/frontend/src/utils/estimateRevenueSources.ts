// PR-5 (feat/smeta-revenue-sources) блок G: расширение секции «Доходы»
// в PDF детализированным списком источников (revenue_sources).
//
// Backend возвращает `estimate.revenue_sources` — массив строк из
// одноимённой таблицы (миграция 083). Frontend отрисовывает их в той же
// таблице доходов, что и legacy income-items, ниже — с дополнительными
// колонками: source_type (человекочитаемый), описание, № договора,
// метка «общее имущество» (legal_classification=1).
//
// Baseline-инвариант: если estimate.revenue_sources пуст или отсутствует
// → helper возвращает пустые массивы/строки → PDF рендерится идентично
// предыдущему (доказано SHA256 против 4 предыдущих деплоев).

export type RevenueSourceType =
  | 'commercial'
  | 'parking'
  | 'basement'
  | 'telecom'
  | 'advertising'
  | 'common_property_rent'
  | 'other';

export interface RevenueSource {
  id?: string;
  estimate_id?: string;
  source_type: RevenueSourceType | string;
  description?: string | null;
  amount: number;
  contract_ref?: string | null;
  period?: string | null;
  legal_classification?: number | boolean | null; // 1/true = доход от общего имущества
  sort_order?: number | null;
}

const KNOWN_TYPES: readonly RevenueSourceType[] = [
  'commercial', 'parking', 'basement', 'telecom', 'advertising',
  'common_property_rent', 'other',
];

/** Нормализация unknown → 'other' (defensive против устаревших/битых значений). */
export function normalizeSourceType(raw: unknown): RevenueSourceType {
  const s = String(raw ?? '').trim().toLowerCase() as RevenueSourceType;
  return (KNOWN_TYPES as readonly string[]).includes(s) ? s : 'other';
}

/** Человекочитаемый ярлык типа источника. */
export function sourceTypeLabel(type: RevenueSourceType | string, lang: 'ru' | 'uz'): string {
  const t = normalizeSourceType(type);
  const map: Record<RevenueSourceType, { ru: string; uz: string }> = {
    commercial:           { ru: 'Аренда коммерческих',       uz: 'Tijoriy ijara' },
    parking:              { ru: 'Парковка',                  uz: 'Avtoturargoh' },
    basement:             { ru: 'Аренда подвалов',           uz: 'Podval ijarasi' },
    telecom:              { ru: 'Аренда крыши / телеком',    uz: 'Tom ijarasi / telekom' },
    advertising:          { ru: 'Реклама',                   uz: 'Reklama' },
    common_property_rent: { ru: 'Аренда общего имущества',   uz: 'Umumiy mulk ijarasi' },
    other:                { ru: 'Прочее',                    uz: 'Boshqa' },
  };
  return map[t][lang];
}

/** Суммирует amount по массиву источников. Пустой массив → 0, без NaN. */
export function sumRevenueSources(sources: RevenueSource[] | undefined | null): number {
  if (!sources || sources.length === 0) return 0;
  return sources.reduce((s, r) => s + (Number(r.amount) || 0), 0);
}

/** Отдельно суммируем только те, что помечены как «общее имущество».
 *  Понадобится в Часть-5 (правильная формула тарифа) — этот PR флаг
 *  только сохраняет и подсвечивает, формулу тарифа не трогает. */
export function sumCommonPropertyIncome(sources: RevenueSource[] | undefined | null): number {
  if (!sources || sources.length === 0) return 0;
  return sources
    .filter(r => Boolean(r.legal_classification))
    .reduce((s, r) => s + (Number(r.amount) || 0), 0);
}

/** Возвращает HTML-строку с <tr>-рядами для incomes-таблицы PDF.
 *  Пустой массив → '' (без изменений в рендере). */
export function renderRevenueSourceRowsHtml(
  sources: RevenueSource[] | undefined | null,
  startIndex: number,
  lang: 'ru' | 'uz',
  escape: (s: string) => string,
  fmt: (n: number) => string,
): string {
  if (!sources || sources.length === 0) return '';
  return sources.map((r, i) => {
    const idx = startIndex + i;
    const label = sourceTypeLabel(r.source_type, lang);
    const desc = r.description ? ` — ${r.description}` : '';
    const meta: string[] = [];
    if (r.contract_ref) {
      meta.push(lang === 'ru' ? `№ ${r.contract_ref}` : `№ ${r.contract_ref}`);
    }
    if (r.period) {
      meta.push(r.period);
    }
    if (r.legal_classification) {
      meta.push(lang === 'ru' ? 'общее имущество' : 'umumiy mulk');
    }
    const metaHtml = meta.length > 0
      ? ` <small style="color:#888">[${escape(meta.join(', '))}]</small>`
      : '';
    return `<tr>
      <td>${idx + 1}</td>
      <td>${escape(label)}${escape(desc)}${metaHtml}</td>
      <td class="num">${fmt(Number(r.amount) || 0)}</td>
    </tr>`;
  }).join('');
}
