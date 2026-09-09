// Default values for new-estimate creation (TARIFF_CALCULATED model).
//
// Зеркало cloudflare/src/lib/estimate/constants.ts — единый источник истины
// для двух налоговых/маржинальных дефолтов. Прямой импорт из cloudflare/
// невозможен (tsconfig.app.json фронта включает только `src`), поэтому
// значения продублированы. Тесты в обоих стеках проверяют, что числа не
// разошлись — см. `__tests__/estimateDefaults.test.ts` (frontend) и
// `cloudflare/src/lib/estimate/__tests__/compute.test.ts` (backend).
//
// ⚠️ При изменении значения обновить ОБА файла и обновить тесты.

/**
 * Ставка налога на ФОТ по умолчанию для новой сметы (небюджетная УК).
 * = 12% НДФЛ + 12% социальный налог = 24%. Актуально на 2026-09-09.
 * Для бюджетных УК (соцналог 25%) переопределить вручную в визарде.
 */
export const DEFAULT_PAYROLL_TAX_RATE = 0.24;

/**
 * Процент прибыли УК по умолчанию для новой сметы. 7% — рыночный ориентир;
 * регуляторный потолок в открытых НПА РУз не подтверждён.
 */
export const DEFAULT_UK_PROFIT_PERCENT = 7;
