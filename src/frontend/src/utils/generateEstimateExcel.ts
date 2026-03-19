import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

const YELLOW_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFF3CD' },
};

const GRAY_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF0F0F0' },
};

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};

const FONT_BODY: Partial<ExcelJS.Font> = { name: 'Times New Roman', size: 11 };
const FONT_HEADER: Partial<ExcelJS.Font> = { name: 'Times New Roman', size: 12, bold: true };
const FONT_TITLE: Partial<ExcelJS.Font> = { name: 'Times New Roman', size: 14, bold: true };

function fmt(value: unknown): number {
  return Number(value) || 0;
}

function formatNum(ws: ExcelJS.Worksheet, row: number, cols: number[]) {
  cols.forEach((c) => {
    const cell = ws.getCell(row, c);
    cell.numFmt = '#,##0';
    cell.alignment = { horizontal: 'right', vertical: 'middle' };
  });
}

function applyBorderRow(ws: ExcelJS.Worksheet, row: number, from: number, to: number) {
  for (let c = from; c <= to; c++) {
    ws.getCell(row, c).border = THIN_BORDER;
  }
}

function setBodyFont(ws: ExcelJS.Worksheet, row: number, from: number, to: number) {
  for (let c = from; c <= to; c++) {
    ws.getCell(row, c).font = { ...FONT_BODY };
  }
}

export async function generateEstimateExcel(
  estimate: Record<string, unknown>,
  estimateItems: Record<string, unknown>[],
  buildings: Array<{ id: string; name: string; totalArea: number; livingArea: number; commonArea?: number; [key: string]: unknown }>,
  language: 'ru' | 'uz'
): Promise<void> {
  const t = (ru: string, uz: string) => (language === 'ru' ? ru : uz);

  const workbook = new ExcelJS.Workbook();

  // ─── Sheet 1: Смета ───
  const ws1 = workbook.addWorksheet(t('Смета', 'Smeta'));

  ws1.getColumn(1).width = 7;
  ws1.getColumn(2).width = 50;
  ws1.getColumn(3).width = 18;
  ws1.getColumn(4).width = 18;

  let r = 1;

  // Row 1: УТВЕРЖДАЮ
  ws1.mergeCells(r, 1, r, 4);
  const cellApprove = ws1.getCell(r, 1);
  cellApprove.value = t('УТВЕРЖДАЮ', 'TASDIQLAYMAN');
  cellApprove.font = { ...FONT_HEADER };
  cellApprove.alignment = { horizontal: 'center', vertical: 'middle' };
  r++;

  // Row 2: Директор
  ws1.mergeCells(r, 1, r, 4);
  const cellDirector = ws1.getCell(r, 1);
  cellDirector.value = t('Директор ООО «Kamizo»', 'MChJ «Kamizo» direktori');
  cellDirector.font = { ...FONT_BODY };
  cellDirector.alignment = { horizontal: 'center', vertical: 'middle' };
  r++;

  // Row 3: ___
  ws1.mergeCells(r, 1, r, 4);
  const cellLine = ws1.getCell(r, 1);
  cellLine.value = '_______________';
  cellLine.font = { ...FONT_BODY };
  cellLine.alignment = { horizontal: 'center', vertical: 'middle' };
  r++;

  // Row 4: date
  ws1.mergeCells(r, 1, r, 4);
  const cellDate = ws1.getCell(r, 1);
  const effectiveDate = (estimate.effective_date as string) || (estimate.period as string) || new Date().toISOString().slice(0, 10);
  cellDate.value = effectiveDate;
  cellDate.font = { ...FONT_BODY };
  cellDate.alignment = { horizontal: 'center', vertical: 'middle' };
  r++;

  // Row 5: empty
  r++;

  // Row 6: Title
  ws1.mergeCells(r, 1, r, 4);
  const cellTitle = ws1.getCell(r, 1);
  cellTitle.value = t('Смета доходов и расходов', 'Daromad va xarajatlar smetasi');
  cellTitle.font = { ...FONT_TITLE };
  cellTitle.alignment = { horizontal: 'center', vertical: 'middle' };
  r++;

  // Row 7: period
  const period = (estimate.period as string) || '';
  const year = period ? period.slice(0, 4) : new Date().getFullYear().toString();
  ws1.mergeCells(r, 1, r, 4);
  const cellPeriod = ws1.getCell(r, 1);
  cellPeriod.value = t(`за ${year} год`, `${year} yil uchun`);
  cellPeriod.font = { ...FONT_BODY };
  cellPeriod.alignment = { horizontal: 'center', vertical: 'middle' };
  r++;

  // Row 8: empty
  r++;

  // Row 9: Table headers
  const headers = [
    t('Т/р', 'T/r'),
    t('Наименование работ или услуг', 'Ish yoki xizmatlar nomi'),
    t('В месяц', 'Oylik'),
    t('В год (12 мес.)', 'Yillik (12 oy)'),
  ];
  headers.forEach((h, i) => {
    const cell = ws1.getCell(r, i + 1);
    cell.value = h;
    cell.font = { ...FONT_HEADER };
    cell.fill = YELLOW_FILL;
    cell.border = THIN_BORDER;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  r++;

  // Row 10: column numbers
  ['1', '2', '3', '4'].forEach((n, i) => {
    const cell = ws1.getCell(r, i + 1);
    cell.value = n;
    cell.font = { name: 'Times New Roman', size: 9 };
    cell.fill = GRAY_FILL;
    cell.border = THIN_BORDER;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  r++;

  // A) ДОХОДЫ
  ws1.mergeCells(r, 1, r, 2);
  const cellIncome = ws1.getCell(r, 1);
  cellIncome.value = t('А) ДОХОДЫ:', 'A) DAROMADLAR:');
  cellIncome.font = { ...FONT_HEADER };
  setBodyFont(ws1, r, 3, 4);
  applyBorderRow(ws1, r, 1, 4);
  r++;

  // Платежи за услуги УК
  const totalAmount = fmt(estimate.total_amount);
  const profitPct = fmt(estimate.uk_profit_percent || estimate.enterprise_profit_percent);
  const enterpriseIncome = Math.round(totalAmount * profitPct / 100);
  const grandTotal = totalAmount + enterpriseIncome;
  const monthlyTotal = Math.round(grandTotal / 12);

  ws1.getCell(r, 1).value = '';
  ws1.getCell(r, 2).value = t('Платежи за услуги УК', 'BK xizmatlari uchun to\'lovlar');
  ws1.getCell(r, 3).value = monthlyTotal;
  ws1.getCell(r, 4).value = grandTotal;
  setBodyFont(ws1, r, 1, 4);
  applyBorderRow(ws1, r, 1, 4);
  formatNum(ws1, r, [3, 4]);
  r++;

  // Empty row
  applyBorderRow(ws1, r, 1, 4);
  r++;

  // Б) РАСХОДЫ
  ws1.mergeCells(r, 1, r, 2);
  const cellExpense = ws1.getCell(r, 1);
  cellExpense.value = t('Б) РАСХОДЫ:', 'B) XARAJATLAR:');
  cellExpense.font = { ...FONT_HEADER };
  setBodyFont(ws1, r, 3, 4);
  applyBorderRow(ws1, r, 1, 4);
  r++;

  // Each expense item
  estimateItems.forEach((item, idx) => {
    ws1.getCell(r, 1).value = idx + 1;
    ws1.getCell(r, 2).value = (item.name as string) || '';
    const monthly = fmt(item.monthly_amount) || Math.round(fmt(item.amount) / 12);
    ws1.getCell(r, 3).value = monthly;
    ws1.getCell(r, 4).value = fmt(item.amount);
    setBodyFont(ws1, r, 1, 4);
    applyBorderRow(ws1, r, 1, 4);
    ws1.getCell(r, 1).alignment = { horizontal: 'center', vertical: 'middle' };
    formatNum(ws1, r, [3, 4]);
    r++;
  });

  // ИТОГО РАСХОДЫ
  const totalMonthlyExpenses = estimateItems.reduce(
    (sum, it) => sum + (fmt(it.monthly_amount) || Math.round(fmt(it.amount) / 12)),
    0,
  );
  const totalYearlyExpenses = estimateItems.reduce((sum, it) => sum + fmt(it.amount), 0);

  ws1.getCell(r, 1).value = '';
  ws1.getCell(r, 2).value = t('ИТОГО РАСХОДЫ:', 'JAMI XARAJATLAR:');
  ws1.getCell(r, 2).font = { ...FONT_HEADER };
  ws1.getCell(r, 3).value = totalMonthlyExpenses;
  ws1.getCell(r, 4).value = totalYearlyExpenses;
  ws1.getCell(r, 3).font = { ...FONT_HEADER };
  ws1.getCell(r, 4).font = { ...FONT_HEADER };
  applyBorderRow(ws1, r, 1, 4);
  formatNum(ws1, r, [3, 4]);
  r++;

  // Empty row
  r++;

  // ВСЕГО
  ws1.getCell(r, 2).value = t('ВСЕГО:', 'JAMI:');
  ws1.getCell(r, 2).font = { ...FONT_HEADER };
  ws1.getCell(r, 3).value = monthlyTotal;
  ws1.getCell(r, 4).value = grandTotal;
  ws1.getCell(r, 3).font = { ...FONT_HEADER };
  ws1.getCell(r, 4).font = { ...FONT_HEADER };
  applyBorderRow(ws1, r, 1, 4);
  formatNum(ws1, r, [3, 4]);
  r++;

  // Empty rows
  r += 2;

  // Total area
  const totalAreaValue = fmt(estimate.total_area) || buildings.reduce((s, b) => s + (b.totalArea || 0), 0);
  ws1.getCell(r, 2).value = t('Всего КВ.М. по комплексу:', 'Kompleks bo\'yicha jami KV.M.:');
  ws1.getCell(r, 2).font = { ...FONT_BODY, bold: true };
  ws1.getCell(r, 4).value = totalAreaValue;
  ws1.getCell(r, 4).font = { ...FONT_BODY, bold: true };
  ws1.getCell(r, 4).numFmt = '#,##0.00';
  ws1.getCell(r, 4).alignment = { horizontal: 'right' };
  r++;

  // Cost per sqm
  const ratePerSqm = fmt(estimate.commercial_rate_per_sqm);
  ws1.getCell(r, 2).value = t('Расчётная стоимость 1 кв.м:', 'Hisoblangan 1 kv.m narxi:');
  ws1.getCell(r, 2).font = { ...FONT_BODY, bold: true };
  ws1.getCell(r, 4).value = ratePerSqm;
  ws1.getCell(r, 4).font = { ...FONT_BODY, bold: true };
  ws1.getCell(r, 4).numFmt = '#,##0';
  ws1.getCell(r, 4).alignment = { horizontal: 'right' };
  r++;

  // Basement rate
  const basementRate = fmt(estimate.basement_rate);
  if (basementRate > 0) {
    ws1.getCell(r, 2).value = t('Подвал (за 1 м.кв.):', 'Podval (1 kv.m uchun):');
    ws1.getCell(r, 2).font = { ...FONT_BODY };
    ws1.getCell(r, 4).value = basementRate;
    ws1.getCell(r, 4).font = { ...FONT_BODY };
    ws1.getCell(r, 4).numFmt = '#,##0';
    ws1.getCell(r, 4).alignment = { horizontal: 'right' };
    r++;
  }

  // Parking rate
  const parkingRate = fmt(estimate.parking_rate);
  if (parkingRate > 0) {
    ws1.getCell(r, 2).value = t('Парковка (за место):', 'Avtoturargoh (joy uchun):');
    ws1.getCell(r, 2).font = { ...FONT_BODY };
    ws1.getCell(r, 4).value = parkingRate;
    ws1.getCell(r, 4).font = { ...FONT_BODY };
    ws1.getCell(r, 4).numFmt = '#,##0';
    ws1.getCell(r, 4).alignment = { horizontal: 'right' };
    r++;
  }

  // Commercial rate
  const commercialRate = fmt(estimate.commercial_rate);
  if (commercialRate > 0) {
    ws1.getCell(r, 2).value = t('Коммерческое помещение (за 1 м.кв.):', 'Tijoriy bino (1 kv.m uchun):');
    ws1.getCell(r, 2).font = { ...FONT_BODY };
    ws1.getCell(r, 4).value = commercialRate;
    ws1.getCell(r, 4).font = { ...FONT_BODY };
    ws1.getCell(r, 4).numFmt = '#,##0';
    ws1.getCell(r, 4).alignment = { horizontal: 'right' };
    r++;
  }

  // Enterprise income
  if (profitPct > 0) {
    ws1.getCell(r, 2).value = t(`Доход предприятия (${profitPct}%):`, `Korxona daromadi (${profitPct}%):`);
    ws1.getCell(r, 2).font = { ...FONT_BODY, bold: true };
    ws1.getCell(r, 4).value = enterpriseIncome;
    ws1.getCell(r, 4).font = { ...FONT_BODY, bold: true };
    ws1.getCell(r, 4).numFmt = '#,##0';
    ws1.getCell(r, 4).alignment = { horizontal: 'right' };
    r++;
  }

  // Signature line
  r += 2;
  ws1.mergeCells(r, 1, r, 4);
  const cellSign = ws1.getCell(r, 1);
  cellSign.value = t(
    'Директор _____________ / Главный бухгалтер _____________',
    'Direktor _____________ / Bosh hisobchi _____________',
  );
  cellSign.font = { ...FONT_BODY };
  cellSign.alignment = { horizontal: 'center', vertical: 'middle' };

  // ─── Sheet 2: Площади ───
  const ws2 = workbook.addWorksheet(t('Площади', 'Maydonlar'));

  ws2.getColumn(1).width = 30;
  ws2.getColumn(2).width = 18;
  ws2.getColumn(3).width = 18;
  ws2.getColumn(4).width = 18;

  // Headers
  const areaHeaders = [
    t('Дом', 'Uy'),
    t('Жилой (кв.м)', 'Turar joy (kv.m)'),
    t('Не жилой (кв.м)', 'Noturar joy (kv.m)'),
    t('Итого (кв.м)', 'Jami (kv.m)'),
  ];
  areaHeaders.forEach((h, i) => {
    const cell = ws2.getCell(1, i + 1);
    cell.value = h;
    cell.font = { ...FONT_HEADER };
    cell.fill = YELLOW_FILL;
    cell.border = THIN_BORDER;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });

  let r2 = 2;
  let sumLiving = 0;
  let sumNonLiving = 0;
  let sumTotal = 0;

  buildings.forEach((b) => {
    const living = b.livingArea || 0;
    const total = b.totalArea || 0;
    const nonLiving = total - living;

    sumLiving += living;
    sumNonLiving += nonLiving;
    sumTotal += total;

    ws2.getCell(r2, 1).value = b.name || '';
    ws2.getCell(r2, 2).value = living;
    ws2.getCell(r2, 3).value = nonLiving;
    ws2.getCell(r2, 4).value = total;

    for (let c = 1; c <= 4; c++) {
      ws2.getCell(r2, c).font = { ...FONT_BODY };
      ws2.getCell(r2, c).border = THIN_BORDER;
    }
    ws2.getCell(r2, 2).numFmt = '#,##0.00';
    ws2.getCell(r2, 3).numFmt = '#,##0.00';
    ws2.getCell(r2, 4).numFmt = '#,##0.00';
    ws2.getCell(r2, 2).alignment = { horizontal: 'right' };
    ws2.getCell(r2, 3).alignment = { horizontal: 'right' };
    ws2.getCell(r2, 4).alignment = { horizontal: 'right' };

    r2++;
  });

  // Footer totals
  ws2.getCell(r2, 1).value = t('Итого:', 'Jami:');
  ws2.getCell(r2, 1).font = { ...FONT_HEADER };
  ws2.getCell(r2, 2).value = sumLiving;
  ws2.getCell(r2, 3).value = sumNonLiving;
  ws2.getCell(r2, 4).value = sumTotal;

  for (let c = 1; c <= 4; c++) {
    ws2.getCell(r2, c).border = THIN_BORDER;
    if (c > 1) {
      ws2.getCell(r2, c).font = { ...FONT_HEADER };
      ws2.getCell(r2, c).numFmt = '#,##0.00';
      ws2.getCell(r2, c).alignment = { horizontal: 'right' };
    }
  }

  // ─── Save ───
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const filename = `smeta_${estimate.period || 'export'}.xlsx`;
  saveAs(blob, filename);
}
