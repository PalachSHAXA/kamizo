// PR-7b (feat/smeta-pdf-staff-table): unit-тесты таблицы «Штат» в PDF.

import { describe, expect, it } from 'vitest';
import { renderStaffTableHtml, type StaffRow } from '../estimateStaffTable';

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c] || c);

describe('renderStaffTableHtml — базовые сценарии', () => {
  it('пустой массив → пустая строка (секция не рендерится)', () => {
    expect(renderStaffTableHtml([], 'ru', esc)).toBe('');
  });

  it('undefined/null → пустая строка', () => {
    expect(renderStaffTableHtml(undefined, 'ru', esc)).toBe('');
    expect(renderStaffTableHtml(null, 'ru', esc)).toBe('');
  });

  it('одна строка → таблица с 1 <tr> в tbody + tfoot с итогом', () => {
    const staff: StaffRow[] = [
      { title: 'DIREKTOR', units: 1, salary: 1_500_000, monthly: 1_500_000 },
    ];
    const html = renderStaffTableHtml(staff, 'ru', esc);
    expect(html).toContain('<h2>Штат</h2>');
    expect(html).toContain('DIREKTOR');
    expect(html).toContain('1 500 000');
    expect(html).toContain('18 000 000'); // monthly × 12
    expect(html).toContain('Итого ФОТ');
  });

  it('заголовки таблицы: № / Должность / Ед. / Оклад / Сумма/мес / Сумма/год', () => {
    const staff: StaffRow[] = [
      { title: 'X', units: 1, salary: 100, monthly: 100 },
    ];
    const html = renderStaffTableHtml(staff, 'ru', esc);
    expect(html).toContain('№');
    expect(html).toContain('Должность');
    expect(html).toContain('Ед.');
    expect(html).toContain('Оклад');
    expect(html).toContain('Сумма/мес');
    expect(html).toContain('Сумма/год');
  });

  it('узбекская локализация', () => {
    const staff: StaffRow[] = [
      { title: 'X', units: 1, salary: 100, monthly: 100 },
    ];
    const html = renderStaffTableHtml(staff, 'uz', esc);
    expect(html).toContain('Xodimlar');
    expect(html).toContain('Lavozim');
    expect(html).toContain('Jami FOT');
  });
});

describe('BASELINE myhelper 2026-08 — 7 позиций (проверка референсных цифр)', () => {
  // Данные из prod-БД (SELECT ... FROM finance_estimate_staff, 2026-09-10):
  // все 7 позиций units=1. FARROSH с salary=2 000 000 (не 2 позиции по 1M).
  const baselineStaff: StaffRow[] = [
    { title: 'DIREKTOR',      units: 1, salary: 1_500_000, monthly: 1_500_000 },
    { title: 'BUHGALTER',     units: 1, salary: 1_000_000, monthly: 1_000_000 },
    { title: 'FARROSH',       units: 1, salary: 2_000_000, monthly: 2_000_000 },
    { title: 'SANTEXNIK',     units: 1, salary: 1_500_000, monthly: 1_500_000 },
    { title: 'ELEKTRIK',      units: 1, salary: 1_500_000, monthly: 1_500_000 },
    { title: 'RAZNARABOCHIY', units: 1, salary: 1_000_000, monthly: 1_000_000 },
    { title: 'BOGBON',        units: 1, salary: 1_500_000, monthly: 1_500_000 },
  ];

  it('все 7 должностей рендерятся', () => {
    const html = renderStaffTableHtml(baselineStaff, 'ru', esc);
    ['DIREKTOR','BUHGALTER','FARROSH','SANTEXNIK','ELEKTRIK','RAZNARABOCHIY','BOGBON']
      .forEach((title) => expect(html).toContain(title));
  });

  it('годовые суммы: 18M для 1.5M/мес, 12M для 1M/мес, 24M для 2M/мес', () => {
    const html = renderStaffTableHtml(baselineStaff, 'ru', esc);
    expect(html).toContain('18 000 000'); // 1.5M × 12 (DIREKTOR, SANTEXNIK, ELEKTRIK, BOGBON)
    expect(html).toContain('12 000 000'); // 1M × 12 (BUHGALTER, RAZNARABOCHIY)
    expect(html).toContain('24 000 000'); // 2M × 12 (FARROSH)
  });

  it('Итого ФОТ = 10 000 000/мес и 120 000 000/год', () => {
    const html = renderStaffTableHtml(baselineStaff, 'ru', esc);
    expect(html).toContain('10 000 000');
    expect(html).toContain('120 000 000');
    // Убедимся, что итог именно в футере с меткой
    expect(html).toMatch(/Итого ФОТ[\s\S]*?10 000 000[\s\S]*?120 000 000/);
  });

  it('номера строк 1-7 в порядке появления', () => {
    const html = renderStaffTableHtml(baselineStaff, 'ru', esc);
    for (let i = 1; i <= 7; i++) {
      expect(html).toContain(`<td>${i}</td>`);
    }
  });

  it('FARROSH: salary=2 000 000, units=1 (данные из prod-БД)', () => {
    const html = renderStaffTableHtml(baselineStaff, 'ru', esc);
    const idx = html.indexOf('FARROSH');
    const context = html.slice(idx, idx + 400);
    // units=1
    expect(context).toMatch(/>1</);
    // salary=2 000 000
    expect(context).toContain('2 000 000');
  });
});

describe('Edge cases', () => {
  it('missing monthly (0) → строка рендерится с 0', () => {
    const staff: StaffRow[] = [
      { title: 'ZERO', units: 0, salary: 0, monthly: 0 },
    ];
    const html = renderStaffTableHtml(staff, 'ru', esc);
    expect(html).toContain('ZERO');
    // 3× "0" — units, salary, monthly, monthly*12 = 4× "0" (min)
    const zeros = (html.match(/>0</g) || []).length;
    expect(zeros).toBeGreaterThanOrEqual(3);
  });

  it('XSS-guard: title escape', () => {
    const staff: StaffRow[] = [
      { title: '<script>bad</script>', units: 1, salary: 100, monthly: 100 },
    ];
    const html = renderStaffTableHtml(staff, 'ru', esc);
    expect(html).toContain('&lt;script&gt;bad&lt;/script&gt;');
    expect(html).not.toContain('<script>bad');
  });

  it('несколько сотрудников: monthly*12 суммируется корректно', () => {
    const staff: StaffRow[] = [
      { title: 'A', units: 1, salary: 100, monthly: 100 },
      { title: 'B', units: 1, salary: 200, monthly: 200 },
      { title: 'C', units: 1, salary: 300, monthly: 300 },
    ];
    const html = renderStaffTableHtml(staff, 'ru', esc);
    // Total monthly = 600, year = 7200
    expect(html).toMatch(/Итого ФОТ[\s\S]*?600[\s\S]*?7 200/);
  });
});

// fix/smeta-staff-vacation-reserve
describe('vacation-reserve (2 extra rows)', () => {
  it('vacation_days=0 у всех → доп. строк НЕТ (инвариант baseline)', () => {
    const staff: StaffRow[] = [
      { title: 'A', units: 1, salary: 1_000_000, monthly: 1_000_000, vacation_days: 0 },
      { title: 'B', units: 1, salary: 2_000_000, monthly: 2_000_000 }, // undefined
    ];
    const html = renderStaffTableHtml(staff, 'ru', esc);
    expect(html).toContain('Итого ФОТ');
    expect(html).not.toContain('Резерв отпускных');
    expect(html).not.toContain('ФОТ БРУТТО');
  });

  it('vacation_days=21 у всех: строки Резерв + ФОТ БРУТТО с правильными числами', () => {
    // Демо-смета: 6 позиций суммарно 10 500 000/мес окладов.
    const staff: StaffRow[] = [
      { title: 'DIREKTOR',   units: 1, salary: 2_500_000, monthly: 2_500_000, vacation_days: 21 },
      { title: 'BUX',        units: 1, salary: 1_800_000, monthly: 1_800_000, vacation_days: 21 },
      { title: 'ELEKTRIK',   units: 1, salary: 1_500_000, monthly: 1_500_000, vacation_days: 21 },
      { title: 'SANTEXNIK',  units: 1, salary: 1_500_000, monthly: 1_500_000, vacation_days: 21 },
      { title: 'UBORSHIK',   units: 2, salary: 1_000_000, monthly: 2_000_000, vacation_days: 21 },
      { title: 'DVORNIK',    units: 1, salary: 1_200_000, monthly: 1_200_000, vacation_days: 21 },
    ];
    const html = renderStaffTableHtml(staff, 'ru', esc);
    // Резерв = 10 500 000 / 12 = 875 000/мес, 10 500 000/год.
    expect(html).toMatch(/\+ Резерв отпускных[\s\S]*?875 000[\s\S]*?10 500 000/);
    // ФОТ БРУТТО = 11 375 000/мес, 136 500 000/год.
    expect(html).toMatch(/= ФОТ БРУТТО[\s\S]*?11 375 000[\s\S]*?136 500 000/);
    // Итого ФОТ (оклады) остался прежним.
    expect(html).toMatch(/Итого ФОТ[\s\S]*?10 500 000[\s\S]*?126 000 000/);
  });

  it('KPI-инвариант: fot_gross из таблицы штата = fot_gross из compute (formula parity)', () => {
    // Резерв на одну позицию: units*salary*days/(21*12).
    // При days=21 и units=1 salary=1200000 → 1200000/12 = 100 000.
    const staff: StaffRow[] = [
      { title: 'X', units: 1, salary: 1_200_000, monthly: 1_200_000, vacation_days: 21 },
    ];
    const html = renderStaffTableHtml(staff, 'ru', esc);
    // fot_base = 1 200 000; fot_vacation = 100 000; fot_gross = 1 300 000
    expect(html).toMatch(/\+ Резерв отпускных[\s\S]*?100 000/);
    expect(html).toMatch(/= ФОТ БРУТТО[\s\S]*?1 300 000/);
  });

  it('смешанные vacation_days (0 и 21) — считается только у ненулевых', () => {
    const staff: StaffRow[] = [
      { title: 'A', units: 1, salary: 1_200_000, monthly: 1_200_000, vacation_days: 21 }, // резерв 100k
      { title: 'B', units: 1, salary: 1_000_000, monthly: 1_000_000, vacation_days: 0 },  // без резерва
    ];
    const html = renderStaffTableHtml(staff, 'ru', esc);
    // Total base 2 200 000, vacation 100 000, gross 2 300 000.
    expect(html).toMatch(/Итого ФОТ[\s\S]*?2 200 000/);
    expect(html).toMatch(/\+ Резерв отпускных[\s\S]*?100 000/);
    expect(html).toMatch(/= ФОТ БРУТТО[\s\S]*?2 300 000/);
  });

  it('vacation_days=null — не считается (NULL из БД)', () => {
    const staff: StaffRow[] = [
      { title: 'A', units: 1, salary: 1_000_000, monthly: 1_000_000, vacation_days: null },
    ];
    const html = renderStaffTableHtml(staff, 'ru', esc);
    expect(html).not.toContain('Резерв отпускных');
  });

  it('нестандартные vacation_days (например 14): формула units*salary*days/(21*12)', () => {
    // 1 × 2 100 000 × 14 / (21*12) = 116 666.67 → округление → 116 667
    const staff: StaffRow[] = [
      { title: 'A', units: 1, salary: 2_100_000, monthly: 2_100_000, vacation_days: 14 },
    ];
    const html = renderStaffTableHtml(staff, 'ru', esc);
    expect(html).toMatch(/\+ Резерв отпускных[\s\S]*?116 667/);
  });

  it('uz-локализация доп. строк', () => {
    const staff: StaffRow[] = [
      { title: 'X', units: 1, salary: 100, monthly: 100, vacation_days: 21 },
    ];
    const html = renderStaffTableHtml(staff, 'uz', esc);
    expect(html).toContain('Ta\'til zaxirasi');
    expect(html).toContain('FOT BRUTTO');
  });
});
