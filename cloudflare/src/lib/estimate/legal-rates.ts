// PR-1 (feat/smeta-legal-rates) блок D из docs/smeta-architecture-proposal.md.
//
// Data-driven-lookup действующих ставок из таблицы legal_rates
// (миграция 080). Заменяет статичную константу DEFAULT_PAYROLL_TAX_RATE
// (см. lib/estimate/constants.ts) в местах, где нужен ДЕФОЛТ для новой
// или ретроспективно-безфильдовой сметы.
//
// НЕ переопределяет сохранённое значение на существующей смете:
//   - При SELECT сметы (loadEstimateInput в routes/finance-v2.ts) —
//     если `row.payroll_tax_rate` не NULL, движок использует его.
//     Lookup вызывается только когда поле пустое (крайне редко).
//   - При POST новой сметы — если body.payroll_tax_rate не задан
//     пользователем, дефолт приходит из legal_rates на период сметы.

import { DEFAULT_PAYROLL_TAX_RATE } from './constants';

/** Известные ключи rate_type. Держим как строковые константы, а не enum
 *  — SQLite всё равно хранит TEXT, а enum усложнит расширение из миграций. */
export const RATE_TYPE_PAYROLL_TAX = 'payroll_tax';

/** Минимальный интерфейс D1-биндинга, нужный этому модулю. Позволяет
 *  тестировать через stub без реальной БД. */
export interface RateLookupEnv {
  DB: {
    prepare: (query: string) => {
      bind: (...args: unknown[]) => {
        first: () => Promise<Record<string, unknown> | null>;
      };
    };
  };
}

/** Формат даты ISO 'YYYY-MM-DD'. Если получен `YYYY-MM` (период смет),
 *  дополняем '-01'. Пустая/NULL строка → сегодня. */
function normalizeAsOf(input?: string | null): string {
  if (!input) return new Date().toISOString().slice(0, 10);
  const s = String(input);
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  return s.slice(0, 10);
}

/**
 * Поиск действующей на дату `asOfDate` legal-ставки по её типу.
 *
 * Возвращает `null`, если правило не найдено (asOfDate раньше самого
 * старого `effective_from` или в этом типе нет записей вовсе). Fallback
 * на JS-константу — забота вызывающего.
 *
 * Пример: смета 2026-11-15 → getCurrentRate(env, 'payroll_tax', '2026-11-15')
 *   → SELECT rate_value FROM legal_rates
 *     WHERE rate_type='payroll_tax' AND effective_from<='2026-11-15'
 *       AND (effective_to IS NULL OR effective_to>='2026-11-15')
 *     ORDER BY effective_from DESC LIMIT 1
 *   Если правило одно (сид 080 с effective_from=2026-09-09) — вернёт 0.24.
 *   Если смета за август (asOfDate < effective_from) — null, fallback.
 */
export async function getCurrentRate(
  env: RateLookupEnv,
  rateType: string,
  asOfDate?: string,
): Promise<number | null> {
  const at = normalizeAsOf(asOfDate);
  const row = await env.DB.prepare(
    `SELECT rate_value FROM legal_rates
     WHERE rate_type = ?
       AND effective_from <= ?
       AND (effective_to IS NULL OR effective_to >= ?)
     ORDER BY effective_from DESC
     LIMIT 1`,
  ).bind(rateType, at, at).first();
  if (!row) return null;
  const v = Number((row as { rate_value?: unknown }).rate_value);
  return Number.isFinite(v) ? v : null;
}

/**
 * Удобная обёртка для самого частого случая: ставка налога на ФОТ.
 * Fallback на DEFAULT_PAYROLL_TAX_RATE если правило не найдено — гарантирует,
 * что пустая таблица legal_rates не сломает систему.
 */
export async function getPayrollTaxRate(
  env: RateLookupEnv,
  asOfDate?: string,
): Promise<number> {
  const rate = await getCurrentRate(env, RATE_TYPE_PAYROLL_TAX, asOfDate);
  return rate ?? DEFAULT_PAYROLL_TAX_RATE;
}
