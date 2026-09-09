// P4/P5 fix (fix/smeta-p4-p5-config): зеркальные регрессионные тесты на
// фронтовые константы. Если backend и frontend разъедутся (кто-то поменяет
// одну сторону, забыв про другую) — оба теста упадут и покажут это явно.
//
// Зеркальный тест на бэке: cloudflare/src/lib/estimate/__tests__/constants.test.ts

import { describe, expect, it } from 'vitest';
import { DEFAULT_PAYROLL_TAX_RATE, DEFAULT_UK_PROFIT_PERCENT } from '../estimateDefaults';

describe('P4/P5 defaults — frontend constants', () => {
  it('DEFAULT_PAYROLL_TAX_RATE === 0.24 (12% НДФЛ + 12% соцналог)', () => {
    expect(DEFAULT_PAYROLL_TAX_RATE).toBe(0.24);
  });

  it('DEFAULT_UK_PROFIT_PERCENT === 7 (рыночный ориентир)', () => {
    expect(DEFAULT_UK_PROFIT_PERCENT).toBe(7);
  });

  it('константы имеют правильные типы (number, не string)', () => {
    expect(typeof DEFAULT_PAYROLL_TAX_RATE).toBe('number');
    expect(typeof DEFAULT_UK_PROFIT_PERCENT).toBe('number');
  });

  it('значения — конечные, положительные, в разумных диапазонах', () => {
    expect(DEFAULT_PAYROLL_TAX_RATE).toBeGreaterThan(0);
    expect(DEFAULT_PAYROLL_TAX_RATE).toBeLessThan(1); // 24% как доля, не процент
    expect(DEFAULT_UK_PROFIT_PERCENT).toBeGreaterThan(0);
    expect(DEFAULT_UK_PROFIT_PERCENT).toBeLessThan(100); // 7 как процент, не доля
  });

  it('SANITY — payroll как доля (0..1), profit как процент (0..100). Не перепутаны.', () => {
    // Если кто-то случайно поменяет местами (0.07 для profit, 24 для tax),
    // расчёт сломается. Явный контракт: payroll = доля, profit = процент.
    expect(DEFAULT_PAYROLL_TAX_RATE).toBeLessThan(1);       // доля
    expect(DEFAULT_UK_PROFIT_PERCENT).toBeGreaterThanOrEqual(1); // процент
  });
});
