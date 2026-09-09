// PR-6 (feat/smeta-building-passport) блок A: unit-тесты паспорт-хелпера.
// Ключевой инвариант: если у здания все 3 НОВЫЕ поля (parking_area /
// basement_area / technical_rooms_area) = NULL/0 → секция не рендерится →
// baseline PDF идентичен.

import { describe, expect, it } from 'vitest';
import {
  hasExtendedPassportData,
  renderBuildingPassportHtml,
  type BuildingPassportFields,
} from '../estimateBuildingPassport';

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c] || c);

describe('hasExtendedPassportData — триггер новой секции', () => {
  it('null/undefined building → false', () => {
    expect(hasExtendedPassportData(null)).toBe(false);
    expect(hasExtendedPassportData(undefined)).toBe(false);
  });

  it('BASELINE: все 3 новых поля NULL → false (секция не рендерится)', () => {
    const b: BuildingPassportFields = {
      address: 'ул. Юнусота, дом 8-А',
      floors: 9,
      apartments_count: 168,
      total_area: 7330,
      year_built: 2019,
      heating_type: 'central',
      // parking_area, basement_area, technical_rooms_area — undefined
    };
    expect(hasExtendedPassportData(b)).toBe(false);
  });

  it('BASELINE: все 3 новых поля явно null → false', () => {
    const b: BuildingPassportFields = {
      floors: 9,
      parking_area: null,
      basement_area: null,
      technical_rooms_area: null,
    };
    expect(hasExtendedPassportData(b)).toBe(false);
  });

  it('BASELINE: все 3 новых поля = 0 → false (0 не считаем данными)', () => {
    const b: BuildingPassportFields = {
      parking_area: 0,
      basement_area: 0,
      technical_rooms_area: 0,
    };
    expect(hasExtendedPassportData(b)).toBe(false);
  });

  it('только parking_area > 0 → true', () => {
    expect(hasExtendedPassportData({ parking_area: 500 })).toBe(true);
  });

  it('только basement_area > 0 → true', () => {
    expect(hasExtendedPassportData({ basement_area: 1200 })).toBe(true);
  });

  it('только technical_rooms_area > 0 → true', () => {
    expect(hasExtendedPassportData({ technical_rooms_area: 80 })).toBe(true);
  });

  it('несколько заполнено — true', () => {
    expect(hasExtendedPassportData({ parking_area: 500, basement_area: 1200 })).toBe(true);
  });
});

describe('renderBuildingPassportHtml — рендер секции', () => {
  it('BASELINE: пустой building → пустая строка (никакой секции в PDF)', () => {
    expect(renderBuildingPassportHtml(null, 'ru', esc)).toBe('');
    expect(renderBuildingPassportHtml(undefined, 'ru', esc)).toBe('');
    expect(renderBuildingPassportHtml({}, 'ru', esc)).toBe('');
  });

  it('BASELINE: только legacy fields (без новых) → пустая строка', () => {
    // Даже если у здания заполнены address/floors/apartments_count — если
    // новых полей нет, секция не показывается. Это критично для baseline
    // PDF SHA256-инварианта.
    const b: BuildingPassportFields = {
      address: 'ул. Юнусота, дом 8-А',
      floors: 9,
      apartments_count: 168,
      total_area: 7330,
      year_built: 2019,
    };
    expect(renderBuildingPassportHtml(b, 'ru', esc)).toBe('');
  });

  it('parking_area заполнено → секция «Паспорт МКД» с адресом + всеми полями', () => {
    const b: BuildingPassportFields = {
      address: 'ул. Юнусота, дом 8-А',
      floors: 9,
      parking_area: 500,
      apartments_count: 168,
    };
    const html = renderBuildingPassportHtml(b, 'ru', esc);
    expect(html).toContain('Паспорт МКД');
    expect(html).toContain('ул. Юнусота, дом 8-А');
    expect(html).toContain('Этажей');
    expect(html).toContain('9');
    expect(html).toContain('Площадь парковки, м²');
    expect(html).toContain('500');
    expect(html).toContain('Квартир');
    expect(html).toContain('168');
  });

  it('только новые поля (без legacy) → секция с ними и заголовком', () => {
    const b: BuildingPassportFields = {
      basement_area: 1200,
      technical_rooms_area: 80,
    };
    const html = renderBuildingPassportHtml(b, 'ru', esc);
    expect(html).toContain('Паспорт МКД');
    expect(html).toContain('Площадь подвала, м²');
    expect(html).toContain('1 200');
    expect(html).toContain('Тех. помещения, м²');
    expect(html).toContain('80');
  });

  it('узбекская локализация', () => {
    const b: BuildingPassportFields = { parking_area: 500, address: 'Yunusota' };
    const html = renderBuildingPassportHtml(b, 'uz', esc);
    expect(html).toContain('MKD pasporti');
    expect(html).toContain('Manzil');
    expect(html).toContain('Avtoturargoh maydoni, m²');
  });

  it('XSS-guard: address escape применяется', () => {
    const b: BuildingPassportFields = {
      address: '<script>bad</script>',
      parking_area: 100,
    };
    const html = renderBuildingPassportHtml(b, 'ru', esc);
    expect(html).toContain('&lt;script&gt;bad&lt;/script&gt;');
    expect(html).not.toContain('<script>bad');
  });

  it('нулевые/пустые значения не попадают в строки (не показываем "0")', () => {
    const b: BuildingPassportFields = {
      floors: 0,               // пусто (мы не знаем)
      elevator_count: 0,       // нет лифтов
      apartments_count: 168,   // задано
      parking_area: 500,       // триггер секции
    };
    const html = renderBuildingPassportHtml(b, 'ru', esc);
    // Секция есть (parking_area > 0)
    expect(html).toContain('Паспорт МКД');
    // Квартир заполнены — есть
    expect(html).toContain('168');
    // Этажей = 0 — не должно быть строки «Этажей: 0»
    expect(html).not.toContain('Этажей');
    // Лифтов = 0 — не должно быть строки «Лифтов: 0»
    expect(html).not.toContain('Лифтов');
  });
});
