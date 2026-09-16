// PR-6 (feat/smeta-building-passport) блок A: unit-тесты паспорт-хелпера.
// PR-11 расширил триггер до 6 полей: + trees_area / playground_area /
// sports_ground_area.
//
// Ключевой инвариант: если у здания ВСЕ 6 триггер-полей = NULL/0 → секция
// не рендерится → baseline PDF идентичен.

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

  it('BASELINE: все 6 триггер-полей NULL → false (секция не рендерится)', () => {
    const b: BuildingPassportFields = {
      address: 'ул. Юнусота, дом 8-А',
      floors: 9,
      apartments_count: 168,
      total_area: 7330,
      year_built: 2019,
      heating_type: 'central',
      // все 6 триггер-полей undefined
    };
    expect(hasExtendedPassportData(b)).toBe(false);
  });

  it('BASELINE: все 6 триггер-полей явно null → false', () => {
    const b: BuildingPassportFields = {
      floors: 9,
      parking_area: null,
      basement_area: null,
      technical_rooms_area: null,
      trees_area: null,
      playground_area: null,
      sports_ground_area: null,
    };
    expect(hasExtendedPassportData(b)).toBe(false);
  });

  it('BASELINE: все 6 триггер-полей = 0 → false (0 не считаем данными)', () => {
    const b: BuildingPassportFields = {
      parking_area: 0,
      basement_area: 0,
      technical_rooms_area: 0,
      trees_area: 0,
      playground_area: 0,
      sports_ground_area: 0,
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

  it('PR-11: только trees_area > 0 → true', () => {
    expect(hasExtendedPassportData({ trees_area: 340 })).toBe(true);
  });

  it('PR-11: только playground_area > 0 → true', () => {
    expect(hasExtendedPassportData({ playground_area: 120 })).toBe(true);
  });

  it('PR-11: только sports_ground_area > 0 → true', () => {
    expect(hasExtendedPassportData({ sports_ground_area: 250 })).toBe(true);
  });

  it('несколько заполнено — true', () => {
    expect(hasExtendedPassportData({ parking_area: 500, basement_area: 1200 })).toBe(true);
  });

  it('PR-11 + PR-6 смешанные — true', () => {
    expect(hasExtendedPassportData({ trees_area: 340, technical_rooms_area: 80 })).toBe(true);
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

  // ── PR-11 secondary rows ─────────────────────────────────────────────
  it('PR-11: только детская площадка → секция + одна строка «Детская», без спорт/деревьев', () => {
    const b: BuildingPassportFields = {
      address: 'Демо-дом',
      playground_area: 120,
      // trees_area, sports_ground_area — не заданы
    };
    const html = renderBuildingPassportHtml(b, 'ru', esc);
    expect(html).toContain('Паспорт МКД');
    expect(html).toContain('Детская площадка, м²');
    expect(html).toContain('120');
    // Спортплощадка и озеленение НЕ рендерятся — их полей нет
    expect(html).not.toContain('Спортплощадка');
    expect(html).not.toContain('Озеленения');
  });

  it('PR-11: заполнены все три новых поля — все три строки рендерятся + PR-6-поля скрыты (null)', () => {
    const b: BuildingPassportFields = {
      trees_area: 340,
      playground_area: 120,
      sports_ground_area: 250,
      // parking/basement/tech — null
    };
    const html = renderBuildingPassportHtml(b, 'ru', esc);
    expect(html).toContain('Площадь озеленения, м²');
    expect(html).toContain('340');
    expect(html).toContain('Детская площадка, м²');
    expect(html).toContain('120');
    expect(html).toContain('Спортплощадка, м²');
    expect(html).toContain('250');
    // PR-6-поля НЕ должны появиться (null)
    expect(html).not.toContain('парковки');
    expect(html).not.toContain('подвала');
    expect(html).not.toContain('Тех. помещения');
  });

  it('PR-11: playground_area = 0, sports_ground_area заполнен → только спорт', () => {
    const b: BuildingPassportFields = {
      playground_area: 0,       // 0 не рендерим
      sports_ground_area: 250,  // триггер + рендер
    };
    const html = renderBuildingPassportHtml(b, 'ru', esc);
    expect(html).toContain('Спортплощадка, м²');
    expect(html).toContain('250');
    expect(html).not.toContain('Детская площадка');
  });

  it('PR-11: узбекская локализация trees/playground/sports', () => {
    const b: BuildingPassportFields = {
      trees_area: 340,
      playground_area: 120,
      sports_ground_area: 250,
    };
    const html = renderBuildingPassportHtml(b, 'uz', esc);
    expect(html).toContain('MKD pasporti');
    // Апостроф в узбекских лейблах экранируется через esc() → &#39; в HTML
    expect(html).toContain('Ko&#39;kalamzorlashtirish, m²');
    expect(html).toContain('Bolalar maydonchasi, m²');
    expect(html).toContain('Sport maydonchasi, m²');
  });

  it('PR-11: порядок строк — parking → basement → tech → trees → playground → sports (для SHA256-инвариантности)', () => {
    const b: BuildingPassportFields = {
      parking_area: 100,
      basement_area: 200,
      technical_rooms_area: 50,
      trees_area: 340,
      playground_area: 120,
      sports_ground_area: 250,
    };
    const html = renderBuildingPassportHtml(b, 'ru', esc);
    const iParking = html.indexOf('Площадь парковки');
    const iBasement = html.indexOf('Площадь подвала');
    const iTech = html.indexOf('Тех. помещения');
    const iTrees = html.indexOf('Площадь озеленения');
    const iPlay = html.indexOf('Детская площадка');
    const iSports = html.indexOf('Спортплощадка');
    expect(iParking).toBeLessThan(iBasement);
    expect(iBasement).toBeLessThan(iTech);
    expect(iTech).toBeLessThan(iTrees);
    expect(iTrees).toBeLessThan(iPlay);
    expect(iPlay).toBeLessThan(iSports);
  });
});
