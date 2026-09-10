// PR-7b (feat/smeta-pdf-staff-table): построчная таблица «Штат» для PDF.
//
// Источник данных — estimate.staff (массив из GET /api/finance/estimates/:id).
// Каждая строка: { title, units, salary, monthly, vacation_days? }.
// Расширенные поля из PR-7 (employment_type, staff_category…) в таблице
// НЕ показываются — только базовые 6 колонок, как в референсном smeta2.pdf.
//
// fix/smeta-staff-vacation-reserve: добавлены две дополнительные строки
// tfoot'а, показывающие резерв отпускных и полный ФОТ БРУТТО — чтобы
// сумма из таблицы штата явно сходилась с KPI-блоком «ФОТ (БРУТТО)»
// (compute.ts: fot_gross = fot_base + fot_vacation). Строки появляются
// ТОЛЬКО если Σ vacation_reserve > 0. Если у всех сотрудников vacation_days=0
// или NULL — таблица рендерится ровно так же, как в PR-7b (для baseline
// с нулевым резервом — SHA-инвариант сохраняется).
//
// Формула из compute.ts:49 (WORK_DAYS_PER_MONTH=21):
//   vacationMonthly(units, salary, days) = units * salary * days / (21 * 12)
// При days=21 упрощается до units * salary / 12 — ровно 1 доп. оклад/год.

export interface StaffRow {
  title: string;
  units: number;
  salary: number;
  monthly: number;
  vacation_days?: number | null;
}

const WORK_DAYS_PER_MONTH = 21;

/** Месячный резерв отпускных одной позиции по формуле compute.ts. */
function vacationMonthlyOf(row: StaffRow): number {
  const units = Number(row.units) || 0;
  const salary = Number(row.salary) || 0;
  const days = Number(row.vacation_days) || 0;
  if (units <= 0 || salary <= 0 || days <= 0) return 0;
  return (units * salary * days) / (WORK_DAYS_PER_MONTH * 12);
}

const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)).replace(/ /g, ' ');

/** Возвращает HTML-таблицу «Штат» или пустую строку если staff пуст. */
export function renderStaffTableHtml(
  staff: StaffRow[] | undefined | null,
  lang: 'ru' | 'uz',
  escape: (s: string) => string,
): string {
  if (!staff || staff.length === 0) return '';

  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);
  const totalMonthly = staff.reduce((s, r) => s + (Number(r.monthly) || 0), 0);
  const totalYear = totalMonthly * 12;
  const totalVacationMonthly = staff.reduce((s, r) => s + vacationMonthlyOf(r), 0);
  const totalVacationYear = totalVacationMonthly * 12;
  const fotGrossMonthly = totalMonthly + totalVacationMonthly;
  const fotGrossYear = fotGrossMonthly * 12;

  const rows = staff.map((s, i) => {
    const monthly = Number(s.monthly) || 0;
    const year = monthly * 12;
    return `<tr>
      <td>${i + 1}</td>
      <td>${escape(s.title || '')}</td>
      <td class="num">${fmt(Number(s.units) || 0)}</td>
      <td class="num">${fmt(Number(s.salary) || 0)}</td>
      <td class="num">${fmt(monthly)}</td>
      <td class="num">${fmt(year)}</td>
    </tr>`;
  }).join('');

  // Доп. строки — только если резерв реально есть у хотя бы одной позиции.
  // При totalVacationMonthly=0 taблица идентична PR-7b (инвариант baseline
  // при vacation_days=0/NULL у всех).
  const extraRows = totalVacationMonthly > 0
    ? `
      <tr>
        <td colspan="4">${t('+ Резерв отпускных', '+ Ta\'til zaxirasi')}</td>
        <td class="num">${fmt(totalVacationMonthly)}</td>
        <td class="num">${fmt(totalVacationYear)}</td>
      </tr>
      <tr>
        <td colspan="4"><b>${t('= ФОТ БРУТТО', '= FOT BRUTTO')}</b></td>
        <td class="num"><b>${fmt(fotGrossMonthly)}</b></td>
        <td class="num"><b>${fmt(fotGrossYear)}</b></td>
      </tr>`
    : '';

  return `
    <h2>${t('Штат', 'Xodimlar')}</h2>
    <table>
      <thead><tr>
        <th style="width:6%">${t('№', '№')}</th>
        <th>${t('Должность', 'Lavozim')}</th>
        <th style="width:8%; text-align:right">${t('Ед.', 'Birlik')}</th>
        <th style="width:16%; text-align:right">${t('Оклад', 'Oylik')}</th>
        <th style="width:16%; text-align:right">${t('Сумма/мес', 'Oy')}</th>
        <th style="width:16%; text-align:right">${t('Сумма/год', 'Yil')}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr>
        <td colspan="4">${t('Итого ФОТ', 'Jami FOT')}</td>
        <td class="num">${fmt(totalMonthly)}</td>
        <td class="num">${fmt(totalYear)}</td>
      </tr>${extraRows}</tfoot>
    </table>
  `;
}
