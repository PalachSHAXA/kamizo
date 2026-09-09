// PR-1 (feat/smeta-legal-rates): unit-тесты lookup'а legal_rates.
//
// Изолированы через минимальный стаб `RateLookupEnv` — не требуют реальной
// D1 или sqlite. Логика ветвления во времени и fallback-на-константу
// проверяется на уровне модуля legal-rates.ts.

import { describe, expect, it } from 'vitest';
import {
  getCurrentRate,
  getPayrollTaxRate,
  RATE_TYPE_PAYROLL_TAX,
  type RateLookupEnv,
} from '../legal-rates';
import { DEFAULT_PAYROLL_TAX_RATE } from '../constants';

interface LegalRateRow {
  rate_type: string;
  rate_value: number;
  effective_from: string;      // 'YYYY-MM-DD'
  effective_to: string | null;
}

/**
 * Минимальный стаб D1: имитирует SELECT из legal_rates по (rate_type,
 * asOfDate). Возвращает подходящую строку с наибольшим effective_from,
 * либо null. Позволяет тестировать логику без реальной БД.
 */
function stubDb(rows: LegalRateRow[]): RateLookupEnv {
  return {
    DB: {
      prepare: (_query: string) => ({
        bind: (rateType: unknown, at1: unknown, _at2: unknown) => ({
          first: async () => {
            const rt = String(rateType);
            const at = String(at1);
            const match = rows
              .filter(r => r.rate_type === rt)
              .filter(r => r.effective_from <= at)
              .filter(r => r.effective_to === null || r.effective_to >= at)
              .sort((a, b) => b.effective_from.localeCompare(a.effective_from));
            return match[0] ? { rate_value: match[0].rate_value } : null;
          },
        }),
      }),
    },
  };
}

describe('getCurrentRate — базовые сценарии', () => {
  it('возвращает 0.24 для payroll_tax на дату после effective_from', async () => {
    const env = stubDb([
      { rate_type: 'payroll_tax', rate_value: 0.24, effective_from: '2026-09-09', effective_to: null },
    ]);
    expect(await getCurrentRate(env, RATE_TYPE_PAYROLL_TAX, '2026-11-15')).toBe(0.24);
  });

  it('возвращает 0.24 ровно на дату effective_from (граничный случай)', async () => {
    const env = stubDb([
      { rate_type: 'payroll_tax', rate_value: 0.24, effective_from: '2026-09-09', effective_to: null },
    ]);
    expect(await getCurrentRate(env, RATE_TYPE_PAYROLL_TAX, '2026-09-09')).toBe(0.24);
  });

  it('возвращает null для даты в прошлом (до самого старого effective_from)', async () => {
    // Смета за август 2026, а правило вступило в силу 9 сентября 2026 →
    // на 2026-08-01 нет действующего правила, вызывающий должен упасть
    // в JS-fallback.
    const env = stubDb([
      { rate_type: 'payroll_tax', rate_value: 0.24, effective_from: '2026-09-09', effective_to: null },
    ]);
    expect(await getCurrentRate(env, RATE_TYPE_PAYROLL_TAX, '2026-08-01')).toBeNull();
  });

  it('возвращает null для пустой таблицы (нет ни одной записи)', async () => {
    const env = stubDb([]);
    expect(await getCurrentRate(env, RATE_TYPE_PAYROLL_TAX, '2026-09-09')).toBeNull();
  });

  it('возвращает null для неизвестного rate_type', async () => {
    const env = stubDb([
      { rate_type: 'payroll_tax', rate_value: 0.24, effective_from: '2026-09-09', effective_to: null },
    ]);
    expect(await getCurrentRate(env, 'vat', '2026-09-09')).toBeNull();
  });
});

describe('getCurrentRate — временная логика (будущие правила не подхватываются)', () => {
  it('если завтра добавили правило с effective_from = будущая дата, сегодня всё ещё старая ставка', async () => {
    // Смоделируем: старое правило 0.24 с 2026-09-09; новое правило 0.28
    // с 2027-01-01 (гипотетически, если налоги поднимут). Сегодня
    // (2026-11-15) должно вернуться 0.24, не 0.28.
    const env = stubDb([
      { rate_type: 'payroll_tax', rate_value: 0.24, effective_from: '2026-09-09', effective_to: '2026-12-31' },
      { rate_type: 'payroll_tax', rate_value: 0.28, effective_from: '2027-01-01', effective_to: null },
    ]);
    expect(await getCurrentRate(env, RATE_TYPE_PAYROLL_TAX, '2026-11-15')).toBe(0.24);
    // А после наступления даты — новая ставка
    expect(await getCurrentRate(env, RATE_TYPE_PAYROLL_TAX, '2027-01-15')).toBe(0.28);
    // На дату перехода (первый день нового правила) — новое правило
    expect(await getCurrentRate(env, RATE_TYPE_PAYROLL_TAX, '2027-01-01')).toBe(0.28);
  });

  it('правило с effective_to возвращается только внутри диапазона', async () => {
    const env = stubDb([
      { rate_type: 'payroll_tax', rate_value: 0.20, effective_from: '2024-01-01', effective_to: '2025-12-31' },
    ]);
    // До диапазона — null
    expect(await getCurrentRate(env, RATE_TYPE_PAYROLL_TAX, '2023-06-15')).toBeNull();
    // Внутри — 0.20
    expect(await getCurrentRate(env, RATE_TYPE_PAYROLL_TAX, '2025-06-15')).toBe(0.20);
    // На дату effective_to (включительно) — ещё 0.20
    expect(await getCurrentRate(env, RATE_TYPE_PAYROLL_TAX, '2025-12-31')).toBe(0.20);
    // После effective_to — null
    expect(await getCurrentRate(env, RATE_TYPE_PAYROLL_TAX, '2026-01-01')).toBeNull();
  });
});

describe('getCurrentRate — нормализация asOfDate', () => {
  it('получает период сметы вида YYYY-MM и добавляет "-01"', async () => {
    const env = stubDb([
      { rate_type: 'payroll_tax', rate_value: 0.24, effective_from: '2026-09-09', effective_to: null },
    ]);
    // '2026-11' → '2026-11-01' → после 2026-09-09 → возвращает 0.24
    expect(await getCurrentRate(env, RATE_TYPE_PAYROLL_TAX, '2026-11')).toBe(0.24);
    // '2026-08' → '2026-08-01' → до 2026-09-09 → null
    expect(await getCurrentRate(env, RATE_TYPE_PAYROLL_TAX, '2026-08')).toBeNull();
  });

  it('undefined/пустая дата → сегодня (используется Date.now)', async () => {
    // Правило вступило вчера — сегодня должно матчиться
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
    const env = stubDb([
      { rate_type: 'payroll_tax', rate_value: 0.24, effective_from: yesterday, effective_to: null },
    ]);
    expect(await getCurrentRate(env, RATE_TYPE_PAYROLL_TAX)).toBe(0.24);
    expect(await getCurrentRate(env, RATE_TYPE_PAYROLL_TAX, '')).toBe(0.24);
  });
});

describe('getPayrollTaxRate — обёртка с fallback на константу', () => {
  it('возвращает ставку из legal_rates когда найдено правило', async () => {
    const env = stubDb([
      { rate_type: 'payroll_tax', rate_value: 0.24, effective_from: '2026-09-09', effective_to: null },
    ]);
    expect(await getPayrollTaxRate(env, '2026-10-15')).toBe(0.24);
  });

  it('fallback на DEFAULT_PAYROLL_TAX_RATE когда правило не найдено (asOfDate в прошлом)', async () => {
    const env = stubDb([
      { rate_type: 'payroll_tax', rate_value: 0.24, effective_from: '2026-09-09', effective_to: null },
    ]);
    // 2026-08-01 — до вступления правила в силу
    expect(await getPayrollTaxRate(env, '2026-08-01')).toBe(DEFAULT_PAYROLL_TAX_RATE);
  });

  it('fallback на DEFAULT_PAYROLL_TAX_RATE когда legal_rates пуста', async () => {
    const env = stubDb([]);
    expect(await getPayrollTaxRate(env, '2026-11-15')).toBe(DEFAULT_PAYROLL_TAX_RATE);
  });

  it('fallback === текущему значению константы (регресс: если константа изменится, тест напомнит)', async () => {
    const env = stubDb([]);
    const rate = await getPayrollTaxRate(env);
    expect(rate).toBe(DEFAULT_PAYROLL_TAX_RATE);
    expect(rate).toBe(0.24); // явно, чтобы падало при drift
  });
});

describe('getCurrentRate — некорректные значения в БД (defensive)', () => {
  it('rate_value = NaN/строка → возвращает null (не подставляет мусор в расчёт)', async () => {
    const brokenEnv: RateLookupEnv = {
      DB: {
        prepare: (_q: string) => ({
          bind: (..._args: unknown[]) => ({
            first: async () => ({ rate_value: 'not-a-number' }),
          }),
        }),
      },
    };
    expect(await getCurrentRate(brokenEnv, RATE_TYPE_PAYROLL_TAX, '2026-11-15')).toBeNull();
  });

  it('getPayrollTaxRate при NaN возвращает fallback-константу', async () => {
    const brokenEnv: RateLookupEnv = {
      DB: {
        prepare: (_q: string) => ({
          bind: (..._args: unknown[]) => ({
            first: async () => ({ rate_value: NaN }),
          }),
        }),
      },
    };
    expect(await getPayrollTaxRate(brokenEnv, '2026-11-15')).toBe(DEFAULT_PAYROLL_TAX_RATE);
  });
});
