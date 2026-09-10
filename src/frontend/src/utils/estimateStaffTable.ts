// PR-7b (feat/smeta-pdf-staff-table): построчная таблица «Штат» для PDF.
//
// Источник данных — estimate.staff (массив из GET /api/finance/estimates/:id,
// добавлен в PR-7b на backend'е). Каждая строка: { title, units, salary,
// monthly }. Расширенные поля из PR-7 (employment_type, staff_category…)
// в этой таблице НЕ показываются — только базовые 6 колонок, как в
// референсном smeta2.pdf.
//
// Baseline: смета с пустым staff-массивом → helper возвращает '' →
// секция не рендерится (как было до этого PR). После деплоя baseline
// myhelper (7 сотрудников) получит новую секцию — SHA256 baseline PDF
// закономерно изменится (это единственный из 10 PR, который меняет
// baseline PDF по замыслу).

export interface StaffRow {
  title: string;
  units: number;
  salary: number;
  monthly: number;
}

const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)).replace(/\u00A0/g, ' ');

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
      </tr></tfoot>
    </table>
  `;
}
