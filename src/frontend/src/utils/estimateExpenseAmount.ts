// P1 fix (fix/smeta-p1-annual-mismatch): согласование верхнего KPI «Годовые
// расходы» и итога детализации в PDF сметы.
//
// Проблема: у строки расхода с `linked_to_staff=true` в БД поле `amount`
// хранит «замороженное» значение = old_monthly × 12 (то, что было в БД на
// момент последнего сохранения статей). Расчётный движок `compute.ts` при
// материализации `umumiy_year` подменяет `monthly` этой строки на `fot_total`
// (см. compute.ts:196-204 `computeExpenses`). PDF-детализация до этого фикса
// читала сырое `amount` — отсюда рассинхрон 959M vs 8.82B на baseline
// (реальная prod-запись myhelper 2026-08).
//
// Этот хелпер — единственный источник истины для «годовой суммы строки
// расхода как она должна отобразиться пользователю». Использовать везде,
// где отображается годовая сумма (PDF, экспорты, отчёты).
//
// Фикс презентационный. БД оставлена как есть — при следующем сохранении
// статей backend вычислит monthly*12 заново, и рассинхрон между
// сохранённым `amount` и живым `fot_total` копится ровно до следующего save
// (регенерация раз в месяц/квартал — приемлемо для эволюции). Backend-fix
// (запись `amount = fot_total × 12` для linked_to_staff строк) отдельно —
// вне scope этого PR, чтобы не расширять blast radius.

export interface ExpenseItemLike {
  amount?: number;
  monthly_amount?: number;
  linked_to_staff?: number | boolean;
}

export interface EstimateSummaryLike {
  fot_total?: number;
}

/**
 * Годовая сумма расхода для отображения в UI/PDF.
 *
 * Правило: если строка привязана к штату (`linked_to_staff=true`), берём
 * «живой» ФОТ из сметы (`estimate.fot_total × 12`); иначе — сохранённое
 * годовое значение `amount`.
 *
 * Возвращает целое число сум (JS number). Не округляет — округление
 * делает вызывающий (обычно fmt() в PDF).
 */
export function effectiveAmountYear(
  item: ExpenseItemLike,
  estimate: EstimateSummaryLike,
): number {
  const linked = Boolean(item.linked_to_staff);
  if (linked) {
    return Number(estimate.fot_total || 0) * 12;
  }
  return Number(item.amount || 0);
}

/**
 * Сумма годовых расходов с учётом подстановки ФОТ для linked_to_staff строк.
 *
 * Эта функция — источник истины для верхнего KPI «Себестоимость год» и
 * итога детализации; обе цифры считаются одним и тем же алгоритмом,
 * поэтому расходятся не могут.
 */
export function totalExpensesYear(
  items: ExpenseItemLike[],
  estimate: EstimateSummaryLike,
): number {
  return items.reduce((sum, item) => sum + effectiveAmountYear(item, estimate), 0);
}
