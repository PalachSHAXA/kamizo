/**
 * Генерация HTML-документов для печати: акт сверки и претензионное письмо.
 * Используется паттерн window.open() + document.write() + window.print().
 */

const PRINT_STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    line-height: 1.5;
    color: #111;
    padding: 20mm 15mm;
  }
  h1 { font-size: 18px; text-align: center; margin-bottom: 6px; }
  h2 { font-size: 15px; text-align: center; margin-bottom: 16px; font-weight: 400; color: #555; }
  .header-org { text-align: center; font-weight: 700; font-size: 14px; margin-bottom: 20px; }
  .info-block { margin-bottom: 16px; }
  .info-block p { margin-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; font-size: 12px; }
  th { background: #f5f5f5; font-weight: 600; }
  td.num { text-align: right; }
  .totals { margin-top: 16px; }
  .totals p { margin-bottom: 4px; font-size: 13px; }
  .totals .balance { font-weight: 700; font-size: 14px; }
  .signatures { display: flex; justify-content: space-between; margin-top: 48px; }
  .signatures div { width: 45%; }
  .sig-line { border-bottom: 1px solid #111; margin-top: 40px; margin-bottom: 4px; }
  .sig-label { font-size: 12px; color: #555; }

  .pretension-body { margin: 20px 0; text-align: justify; }
  .pretension-body p { margin-bottom: 12px; text-indent: 2em; }
  .pretension-to { margin-bottom: 20px; }
  .pretension-footer { margin-top: 40px; }
  .pretension-footer .sig-line { width: 200px; }

  @media print {
    body { padding: 15mm; }
    @page { size: A4; margin: 15mm; }
  }
`;

function fmt(n: number): string {
  return n.toLocaleString('ru-RU');
}

function openPrintWindow(html: string): void {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 500);
}

// ─── Акт сверки ──────────────────────────────────────────────

export function generateReconciliationDoc(
  data: {
    apartment: Record<string, unknown>;
    charges: Record<string, unknown>[];
    payments: Record<string, unknown>[];
    totals: { charged: number; paid: number; balance: number };
    claim: Record<string, unknown>;
  },
  tenantName: string,
): void {
  const { apartment, charges, payments, totals, claim } = data;

  // Build combined rows sorted by date
  type Row = { date: string; description: string; charged: number; paid: number };
  const rows: Row[] = [];

  for (const c of charges) {
    rows.push({
      date: String(c.period || ''),
      description: `Начисление за ${c.period || '—'}`,
      charged: Number(c.amount) || 0,
      paid: 0,
    });
  }
  for (const p of payments) {
    rows.push({
      date: String(p.payment_date || ''),
      description: `Оплата (${p.payment_type || 'наличные'})`,
      charged: 0,
      paid: Number(p.amount) || 0,
    });
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));

  let runningBalance = 0;
  const tableRows = rows
    .map((r) => {
      runningBalance += r.charged - r.paid;
      return `
      <tr>
        <td>${r.date}</td>
        <td>${r.description}</td>
        <td class="num">${r.charged ? fmt(r.charged) : ''}</td>
        <td class="num">${r.paid ? fmt(r.paid) : ''}</td>
        <td class="num">${fmt(runningBalance)}</td>
      </tr>`;
    })
    .join('');

  const balanceLabel = totals.balance >= 0 ? 'Баланс' : 'Задолженность';
  const balanceValue = Math.abs(totals.balance);

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Акт сверки</title>
  <style>${PRINT_STYLES}</style>
</head>
<body>
  <div class="header-org">${tenantName}</div>
  <h1>АКТ СВЕРКИ ВЗАИМОРАСЧ\u0401ТОВ</h1>
  <h2>Период: ${claim.period_from || ''} — ${claim.period_to || ''}</h2>

  <div class="info-block">
    <p><strong>Управляющая компания:</strong> ${tenantName}</p>
    <p><strong>Собственник:</strong> ${apartment.owner_name || '—'}</p>
    <p><strong>Адрес:</strong> ${apartment.building_name || ''}, ${apartment.building_address || ''}, кв. ${apartment.apartment_number || apartment.number || ''}</p>
  </div>

  <table>
    <thead>
      <tr>
        <th>Дата</th>
        <th>Описание</th>
        <th>Начислено</th>
        <th>Оплачено</th>
        <th>Баланс</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>

  <div class="totals">
    <p>Итого начислено: <strong>${fmt(totals.charged)} сум</strong></p>
    <p>Итого оплачено: <strong>${fmt(totals.paid)} сум</strong></p>
    <p class="balance">${balanceLabel}: ${fmt(balanceValue)} сум</p>
  </div>

  <div class="signatures">
    <div>
      <div class="sig-line"></div>
      <div class="sig-label">От УК</div>
    </div>
    <div>
      <div class="sig-line"></div>
      <div class="sig-label">Собственник</div>
    </div>
  </div>
</body>
</html>`;

  openPrintWindow(html);
}

// ─── Претензионное письмо ────────────────────────────────────

export function generatePretensionDoc(
  data: {
    apartment: Record<string, unknown>;
    debt: { total: number; first_overdue_period: string };
    claim: Record<string, unknown>;
    generated_date: string;
  },
  tenantName: string,
): void {
  const { apartment, debt, generated_date } = data;

  const deadlineDate = new Date(generated_date);
  deadlineDate.setDate(deadlineDate.getDate() + 14);
  const deadlineStr = deadlineDate.toLocaleDateString('ru-RU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const generatedStr = new Date(generated_date).toLocaleDateString('ru-RU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Претензионное письмо</title>
  <style>${PRINT_STYLES}</style>
</head>
<body>
  <div class="header-org">${tenantName}</div>
  <h1>ПРЕТЕНЗИОННОЕ ПИСЬМО</h1>

  <div class="pretension-to">
    <p><strong>Кому:</strong> ${apartment.owner_name || '—'}, ${apartment.building_address || ''}, кв. ${apartment.apartment_number || apartment.number || ''}</p>
  </div>

  <div class="pretension-body">
    <p>
      Настоящим уведомляем Вас о наличии задолженности по оплате за жилищно-коммунальные услуги
      в размере <strong>${fmt(debt.total)} сум</strong>, образовавшейся начиная с <strong>${debt.first_overdue_period}</strong>.
    </p>
    <p>
      В соответствии с действующим законодательством Республики Узбекистан, собственник жилого помещения
      обязан своевременно и в полном объ\u0451ме вносить плату за содержание жилья и коммунальные услуги.
    </p>
    <p>
      Просим Вас погасить имеющуюся задолженность в полном объ\u0451ме в срок до <strong>${deadlineStr}</strong>.
    </p>
    <p>
      В случае неоплаты задолженности в указанный срок, управляющая компания оставляет за собой право
      обратиться в суд для принудительного взыскания задолженности, а также начисления пени и возмещения
      судебных расходов.
    </p>
  </div>

  <div class="pretension-footer">
    <p>С уважением,</p>
    <p><strong>${tenantName}</strong></p>
    <div class="sig-line"></div>
    <p class="sig-label">Директор</p>
    <br>
    <p>Дата: ${generatedStr}</p>
  </div>
</body>
</html>`;

  openPrintWindow(html);
}
