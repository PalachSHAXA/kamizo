// PR-5 (feat/smeta-revenue-sources) блок G: unit-тесты хелперов доходов.

import { describe, expect, it } from 'vitest';
import {
  normalizeSourceType,
  sourceTypeLabel,
  sumRevenueSources,
  sumCommonPropertyIncome,
  renderRevenueSourceRowsHtml,
  type RevenueSource,
} from '../estimateRevenueSources';

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c] || c);
const fmt = (n: number) => String(Math.round(n));

describe('normalizeSourceType', () => {
  it('пропускает известные типы', () => {
    expect(normalizeSourceType('commercial')).toBe('commercial');
    expect(normalizeSourceType('parking')).toBe('parking');
    expect(normalizeSourceType('common_property_rent')).toBe('common_property_rent');
    expect(normalizeSourceType('other')).toBe('other');
  });

  it('нормализует регистр и trim', () => {
    expect(normalizeSourceType('  COMMERCIAL  ')).toBe('commercial');
    expect(normalizeSourceType('Common_Property_Rent')).toBe('common_property_rent');
  });

  it('NULL/undefined/пусто → other (fallback)', () => {
    expect(normalizeSourceType(null)).toBe('other');
    expect(normalizeSourceType(undefined)).toBe('other');
    expect(normalizeSourceType('')).toBe('other');
  });

  it('неизвестный тип → other (defensive)', () => {
    expect(normalizeSourceType('bogus_type')).toBe('other');
    expect(normalizeSourceType(42)).toBe('other');
  });
});

describe('sourceTypeLabel', () => {
  it('русские ярлыки', () => {
    expect(sourceTypeLabel('commercial', 'ru')).toBe('Аренда коммерческих');
    expect(sourceTypeLabel('parking', 'ru')).toBe('Парковка');
    expect(sourceTypeLabel('common_property_rent', 'ru')).toBe('Аренда общего имущества');
    expect(sourceTypeLabel('other', 'ru')).toBe('Прочее');
  });

  it('узбекские ярлыки', () => {
    expect(sourceTypeLabel('commercial', 'uz')).toBe('Tijoriy ijara');
    expect(sourceTypeLabel('common_property_rent', 'uz')).toBe('Umumiy mulk ijarasi');
  });

  it('неизвестный тип → метка для other', () => {
    expect(sourceTypeLabel('bogus', 'ru')).toBe('Прочее');
  });
});

describe('sumRevenueSources', () => {
  it('пустой массив → 0', () => {
    expect(sumRevenueSources([])).toBe(0);
  });

  it('undefined/null → 0 (baseline: revenue_sources отсутствует)', () => {
    expect(sumRevenueSources(undefined)).toBe(0);
    expect(sumRevenueSources(null)).toBe(0);
  });

  it('сумма нескольких amounts', () => {
    const s: RevenueSource[] = [
      { source_type: 'commercial', amount: 1_000_000 },
      { source_type: 'parking', amount: 500_000 },
      { source_type: 'telecom', amount: 300_000 },
    ];
    expect(sumRevenueSources(s)).toBe(1_800_000);
  });

  it('NaN в amount → трактуется как 0 (defensive)', () => {
    const s: RevenueSource[] = [
      { source_type: 'commercial', amount: NaN },
      { source_type: 'parking', amount: 500_000 },
    ];
    expect(sumRevenueSources(s)).toBe(500_000);
  });
});

describe('sumCommonPropertyIncome — legal_classification=1 отдельно', () => {
  it('считает только те, где legal_classification=1/true', () => {
    const s: RevenueSource[] = [
      { source_type: 'commercial', amount: 1_000_000, legal_classification: 0 },
      { source_type: 'basement', amount: 500_000, legal_classification: 1 },
      { source_type: 'telecom', amount: 300_000, legal_classification: true },
      { source_type: 'other', amount: 100_000 }, // legal_classification undefined
    ];
    // Только basement + telecom = 800_000
    expect(sumCommonPropertyIncome(s)).toBe(800_000);
  });

  it('никаких помеченных → 0', () => {
    const s: RevenueSource[] = [
      { source_type: 'commercial', amount: 1_000_000, legal_classification: 0 },
    ];
    expect(sumCommonPropertyIncome(s)).toBe(0);
  });

  it('пустой массив → 0', () => {
    expect(sumCommonPropertyIncome([])).toBe(0);
    expect(sumCommonPropertyIncome(undefined)).toBe(0);
  });
});

describe('renderRevenueSourceRowsHtml — HTML рендер', () => {
  it('BASELINE: пустой массив → пустая строка (никаких <tr>)', () => {
    expect(renderRevenueSourceRowsHtml([], 0, 'ru', esc, fmt)).toBe('');
    expect(renderRevenueSourceRowsHtml(undefined, 0, 'ru', esc, fmt)).toBe('');
    expect(renderRevenueSourceRowsHtml(null, 0, 'ru', esc, fmt)).toBe('');
  });

  it('один источник — 1 <tr> с правильным индексом', () => {
    const s: RevenueSource[] = [
      { source_type: 'commercial', description: 'Кофейня 1 этаж', amount: 5_000_000 },
    ];
    const html = renderRevenueSourceRowsHtml(s, 3, 'ru', esc, fmt); // startIndex=3 → номер 4
    expect(html).toContain('<td>4</td>');
    expect(html).toContain('Аренда коммерческих');
    expect(html).toContain('Кофейня 1 этаж');
    expect(html).toContain('5000000');
  });

  it('meta показывается: contract_ref + period + legal_classification', () => {
    const s: RevenueSource[] = [
      {
        source_type: 'basement',
        amount: 2_000_000,
        contract_ref: 'КМ-42',
        period: 'Q3 2026',
        legal_classification: 1,
      },
    ];
    const html = renderRevenueSourceRowsHtml(s, 0, 'ru', esc, fmt);
    expect(html).toContain('№ КМ-42');
    expect(html).toContain('Q3 2026');
    expect(html).toContain('общее имущество');
    expect(html).toContain('<small');
  });

  it('без meta → <small> не рендерится', () => {
    const s: RevenueSource[] = [{ source_type: 'other', amount: 100_000 }];
    const html = renderRevenueSourceRowsHtml(s, 0, 'ru', esc, fmt);
    expect(html).not.toContain('<small');
  });

  it('escape применяется для description (XSS-guard)', () => {
    const s: RevenueSource[] = [
      { source_type: 'other', description: '<script>bad</script>', amount: 1000 },
    ];
    const html = renderRevenueSourceRowsHtml(s, 0, 'ru', esc, fmt);
    expect(html).toContain('&lt;script&gt;bad&lt;/script&gt;');
    expect(html).not.toContain('<script>bad');
  });

  it('несколько строк — индексы возрастают', () => {
    const s: RevenueSource[] = [
      { source_type: 'commercial', amount: 1000 },
      { source_type: 'parking', amount: 2000 },
      { source_type: 'telecom', amount: 3000 },
    ];
    const html = renderRevenueSourceRowsHtml(s, 0, 'ru', esc, fmt);
    expect(html).toContain('<td>1</td>');
    expect(html).toContain('<td>2</td>');
    expect(html).toContain('<td>3</td>');
  });

  it('узбекская локализация меток', () => {
    const s: RevenueSource[] = [
      { source_type: 'commercial', amount: 1000, legal_classification: 1 },
    ];
    const html = renderRevenueSourceRowsHtml(s, 0, 'uz', esc, fmt);
    expect(html).toContain('Tijoriy ijara');
    expect(html).toContain('umumiy mulk');
  });
});
