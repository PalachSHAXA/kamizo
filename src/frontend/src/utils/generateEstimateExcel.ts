// Audit P1: was `import ExcelJS from 'exceljs'` at top — pulled the entire
// 916KB ExcelJS bundle into the main chunk on every page load, even for
// residents who never export. Now lazy-imported inside generateEstimateExcel
// so the bundle splits and the heavy code only loads when an admin actually
// clicks Export. Types are imported as `type` (zero runtime cost).
import { saveAs } from 'file-saver';
import type { Fill, Borders, Font, Worksheet } from 'exceljs';

const YELLOW_FILL: Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFF3CD' },
};

const GRAY_FILL: Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF0F0F0' },
};

const THIN_BORDER: Partial<Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};

const FONT_BODY: Partial<Font> = { name: 'Times New Roman', size: 11 };
const FONT_HEADER: Partial<Font> = { name: 'Times New Roman', size: 12, bold: true };
const FONT_TITLE: Partial<Font> = { name: 'Times New Roman', size: 14, bold: true };

// Секции расходов для группировки статей сметы с под-итогом «Жами» —
// как в бумажной смете БСК по ПКМ (Зарплаты / Материалы / Производственные /
// Административные). Ключ секции хранится в поле статьи `section` (v2) либо
// в `category`. Порядок в массиве = порядок групп в выгрузке. Неизвестные
// ключи попадают в 'other'.
const EXPENSE_SECTIONS: Array<{ key: string; ru: string; uz: string }> = [
  { key: 'salary', ru: 'Заработная плата', uz: 'Ish haqi' },
  { key: 'materials', ru: 'Материалы и услуги', uz: 'Materiallar va xizmatlar' },
  { key: 'production', ru: 'Производственные расходы', uz: 'Ishlab chiqarish xarajatlari' },
  { key: 'admin', ru: 'Административные расходы', uz: "Ma'muriy xarajatlar" },
  { key: 'other', ru: 'Прочие расходы', uz: 'Boshqa xarajatlar' },
];
const SECTION_KEYS = new Set(EXPENSE_SECTIONS.map((s) => s.key));

function fmt(value: unknown): number {
  return Number(value) || 0;
}

function formatNum(ws: Worksheet, row: number, cols: number[]) {
  cols.forEach((c) => {
    const cell = ws.getCell(row, c);
    cell.numFmt = '#,##0';
    cell.alignment = { horizontal: 'right', vertical: 'middle' };
  });
}

function applyBorderRow(ws: Worksheet, row: number, from: number, to: number) {
  for (let c = from; c <= to; c++) {
    ws.getCell(row, c).border = THIN_BORDER;
  }
}

function setBodyFont(ws: Worksheet, row: number, from: number, to: number) {
  for (let c = from; c <= to; c++) {
    ws.getCell(row, c).font = { ...FONT_BODY };
  }
}

export async function generateEstimateExcel(
  estimate: Record<string, unknown>,
  estimateItems: Record<string, unknown>[],
  buildings: Array<{ id: string; name: string; totalArea: number; livingArea: number; commonArea?: number; [key: string]: unknown }>,
  language: 'ru' | 'uz',
  // Sprint 4: tenant name for header — раньше было хардкодом "Kamizo".
  // Правая колонка шапки всегда "Kamizo · Управление домом" (это наш SaaS-бренд).
  tenantName?: string
): Promise<void> {
  const t = (ru: string, uz: string) => (language === 'ru' ? ru : uz);
  const uk = tenantName || 'Kamizo';

  // Lazy-load ExcelJS only when this exporter runs (admin export action).
  // See header comment for context.
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();

  // ─── Sheet 1: Смета ───
  // pageSetup + view: без него Preview.app / Numbers / quick-look рисуют
  // весь лист (1 048 576 строк × 16 384 колонки) со всеми линиями сетки,
  // а контент выглядит крошечным в углу. Задаём A4 portrait, fit-to-width,
  // скрываем grid при печати и в UI, оставляем только заполненную зону.
  const ws1 = workbook.addWorksheet(t('Смета', 'Smeta'), {
    pageSetup: {
      paperSize: 9,              // A4
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
      horizontalCentered: true,
      printArea: undefined,      // проставим ниже, когда узнаем последнюю строку
    },
    views: [{
      showGridLines: false,      // Preview/Numbers перестанут рисовать бесконечную сетку
      state: 'frozen',
      ySplit: 0,
    }],
  });

  // 4 колонки как в бумажной смете БСК: статья · тариф 1 м² · план/мес · план/год.
  ws1.getColumn(1).width = 46;   // Наименование статей
  ws1.getColumn(2).width = 15;   // Тариф 1 м² (сум)
  ws1.getColumn(3).width = 17;   // план на месяц
  ws1.getColumn(4).width = 17;   // план на год

  let r = 1;

  // Row 1: УТВЕРЖДАЮ
  ws1.mergeCells(r, 1, r, 4);
  const cellApprove = ws1.getCell(r, 1);
  cellApprove.value = t('УТВЕРЖДАЮ', 'TASDIQLAYMAN');
  cellApprove.font = { ...FONT_HEADER };
  cellApprove.alignment = { horizontal: 'center', vertical: 'middle' };
  r++;

  // Row 2: Директор УК (левая часть) + Kamizo лого-подпись (правая)
  // Слева: "Директор ООО «<tenantName>»" — берётся из tenantStore.
  // Справа: "Kamizo · Управление домом" — фиксированный бренд платформы.
  const cellDirector = ws1.getCell(r, 1);
  ws1.mergeCells(r, 1, r, 3);
  cellDirector.value = t(`Директор ООО «${uk}»`, `MChJ «${uk}» direktori`);
  cellDirector.font = { ...FONT_BODY };
  cellDirector.alignment = { horizontal: 'left', vertical: 'middle' };
  const cellPlatform = ws1.getCell(r, 4);
  cellPlatform.value = t('Kamizo · Управление домом', 'Kamizo · Uy boshqaruvi');
  cellPlatform.font = { ...FONT_BODY, italic: true, color: { argb: 'FF9CA3AF' } };
  cellPlatform.alignment = { horizontal: 'right', vertical: 'middle' };
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
    t('Наименование статей', 'Moddalar nomi'),
    t('Тариф 1 м² (сум)', '1 m² tarifi (so\'m)'),
    t('План на месяц', 'Oylik reja'),
    t('План на год', 'Yillik reja'),
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

  // Площадь для расчёта тарифа 1 м² (снимок из сметы, иначе сумма по домам).
  const areaForTariff = fmt(estimate.total_area) || buildings.reduce((s, b) => s + (b.totalArea || 0), 0);
  // Тариф статьи = план на месяц / площадь. Округляем до целого сум/м² —
  // ровно так на бумажной смете (напр. 3 000 000 / 12836 ≈ 234).
  const tariff = (monthly: number) => (areaForTariff > 0 ? Math.round(monthly / areaForTariff) : 0);

  // Нормализуем месяц/год для статьи: если задан только один — второй выводим.
  const itemMonthly = (it: Record<string, unknown>) => fmt(it.monthly_amount) || Math.round(fmt(it.amount) / 12);
  const itemYearly = (it: Record<string, unknown>) => fmt(it.amount) || itemMonthly(it) * 12;

  // A) ДОХОДЫ
  ws1.getCell(r, 1).value = t('А) ДОХОДЫ:', 'A) DAROMADLAR:');
  ws1.getCell(r, 1).font = { ...FONT_HEADER };
  setBodyFont(ws1, r, 2, 4);
  applyBorderRow(ws1, r, 1, 4);
  r++;

  // Платежи за услуги УК
  const totalAmount = fmt(estimate.total_amount);
  const profitPct = fmt(estimate.uk_profit_percent || estimate.enterprise_profit_percent);
  const enterpriseIncome = Math.round(totalAmount * profitPct / 100);
  const grandTotal = totalAmount + enterpriseIncome;
  const monthlyTotal = Math.round(grandTotal / 12);

  ws1.getCell(r, 1).value = t('Платежи за услуги УК', 'BK xizmatlari uchun to\'lovlar');
  ws1.getCell(r, 2).value = tariff(monthlyTotal);
  ws1.getCell(r, 3).value = monthlyTotal;
  ws1.getCell(r, 4).value = grandTotal;
  setBodyFont(ws1, r, 1, 4);
  applyBorderRow(ws1, r, 1, 4);
  formatNum(ws1, r, [2, 3, 4]);
  r++;

  // Empty row
  applyBorderRow(ws1, r, 1, 4);
  r++;

  // Б) РАСХОДЫ
  ws1.getCell(r, 1).value = t('Б) РАСХОДЫ:', 'B) XARAJATLAR:');
  ws1.getCell(r, 1).font = { ...FONT_HEADER };
  setBodyFont(ws1, r, 2, 4);
  applyBorderRow(ws1, r, 1, 4);
  r++;

  // Ключ секции статьи: поле `section` (v2) → `category` → 'other'.
  const sectionOf = (it: Record<string, unknown>) => {
    const raw = String(it.section ?? it.category ?? '').trim();
    return SECTION_KEYS.has(raw) ? raw : 'other';
  };

  // Расходы, сгруппированные по секциям. Каждая непустая группа выводится
  // строкой-подытогом «… Жами» (серая, жирная) + её статьи под ней.
  EXPENSE_SECTIONS.forEach((section) => {
    const group = estimateItems.filter((it) => sectionOf(it) === section.key);
    if (group.length === 0) return;

    const groupMonthly = group.reduce((s, it) => s + itemMonthly(it), 0);
    const groupYearly = group.reduce((s, it) => s + itemYearly(it), 0);

    // Строка-заголовок группы с подытогом.
    ws1.getCell(r, 1).value = `${t(section.ru, section.uz)} — ${t('Жами', 'Jami')}`;
    ws1.getCell(r, 2).value = tariff(groupMonthly);
    ws1.getCell(r, 3).value = groupMonthly;
    ws1.getCell(r, 4).value = groupYearly;
    for (let c = 1; c <= 4; c++) {
      ws1.getCell(r, c).font = { ...FONT_BODY, bold: true };
      ws1.getCell(r, c).fill = GRAY_FILL;
    }
    applyBorderRow(ws1, r, 1, 4);
    formatNum(ws1, r, [2, 3, 4]);
    r++;

    // Статьи группы.
    group.forEach((item) => {
      const monthly = itemMonthly(item);
      ws1.getCell(r, 1).value = `    ${(item.name as string) || ''}`;
      ws1.getCell(r, 2).value = tariff(monthly);
      ws1.getCell(r, 3).value = monthly;
      ws1.getCell(r, 4).value = itemYearly(item);
      setBodyFont(ws1, r, 1, 4);
      applyBorderRow(ws1, r, 1, 4);
      formatNum(ws1, r, [2, 3, 4]);
      r++;
    });
  });

  // ИТОГО РАСХОДЫ
  const totalMonthlyExpenses = estimateItems.reduce((sum, it) => sum + itemMonthly(it), 0);
  const totalYearlyExpenses = estimateItems.reduce((sum, it) => sum + itemYearly(it), 0);

  ws1.getCell(r, 1).value = t('ИТОГО РАСХОДЫ:', 'JAMI XARAJATLAR:');
  ws1.getCell(r, 1).font = { ...FONT_HEADER };
  ws1.getCell(r, 2).value = tariff(totalMonthlyExpenses);
  ws1.getCell(r, 3).value = totalMonthlyExpenses;
  ws1.getCell(r, 4).value = totalYearlyExpenses;
  ws1.getCell(r, 2).font = { ...FONT_HEADER };
  ws1.getCell(r, 3).font = { ...FONT_HEADER };
  ws1.getCell(r, 4).font = { ...FONT_HEADER };
  applyBorderRow(ws1, r, 1, 4);
  formatNum(ws1, r, [2, 3, 4]);
  r++;

  // Empty row
  r++;

  // ВСЕГО
  ws1.getCell(r, 1).value = t('ВСЕГО:', 'JAMI:');
  ws1.getCell(r, 1).font = { ...FONT_HEADER };
  ws1.getCell(r, 2).value = tariff(monthlyTotal);
  ws1.getCell(r, 3).value = monthlyTotal;
  ws1.getCell(r, 4).value = grandTotal;
  ws1.getCell(r, 2).font = { ...FONT_HEADER };
  ws1.getCell(r, 3).font = { ...FONT_HEADER };
  ws1.getCell(r, 4).font = { ...FONT_HEADER };
  applyBorderRow(ws1, r, 1, 4);
  formatNum(ws1, r, [2, 3, 4]);
  r++;

  // Empty rows
  r += 2;

  // Total area
  const totalAreaValue = fmt(estimate.total_area) || buildings.reduce((s, b) => s + (b.totalArea || 0), 0);
  ws1.getCell(r, 1).value = t('Всего КВ.М. по комплексу:', 'Kompleks bo\'yicha jami KV.M.:');
  ws1.getCell(r, 1).font = { ...FONT_BODY, bold: true };
  ws1.getCell(r, 4).value = totalAreaValue;
  ws1.getCell(r, 4).font = { ...FONT_BODY, bold: true };
  ws1.getCell(r, 4).numFmt = '#,##0.00';
  ws1.getCell(r, 4).alignment = { horizontal: 'right' };
  r++;

  // Cost per sqm
  const ratePerSqm = fmt(estimate.commercial_rate_per_sqm);
  ws1.getCell(r, 1).value = t('Расчётная стоимость 1 кв.м:', 'Hisoblangan 1 kv.m narxi:');
  ws1.getCell(r, 1).font = { ...FONT_BODY, bold: true };
  ws1.getCell(r, 4).value = ratePerSqm;
  ws1.getCell(r, 4).font = { ...FONT_BODY, bold: true };
  ws1.getCell(r, 4).numFmt = '#,##0';
  ws1.getCell(r, 4).alignment = { horizontal: 'right' };
  r++;

  // Basement rate
  const basementRate = fmt(estimate.basement_rate);
  if (basementRate > 0) {
    ws1.getCell(r, 1).value = t('Подвал (за 1 м.кв.):', 'Podval (1 kv.m uchun):');
    ws1.getCell(r, 1).font = { ...FONT_BODY };
    ws1.getCell(r, 4).value = basementRate;
    ws1.getCell(r, 4).font = { ...FONT_BODY };
    ws1.getCell(r, 4).numFmt = '#,##0';
    ws1.getCell(r, 4).alignment = { horizontal: 'right' };
    r++;
  }

  // Parking rate
  const parkingRate = fmt(estimate.parking_rate);
  if (parkingRate > 0) {
    ws1.getCell(r, 1).value = t('Парковка (за место):', 'Avtoturargoh (joy uchun):');
    ws1.getCell(r, 1).font = { ...FONT_BODY };
    ws1.getCell(r, 4).value = parkingRate;
    ws1.getCell(r, 4).font = { ...FONT_BODY };
    ws1.getCell(r, 4).numFmt = '#,##0';
    ws1.getCell(r, 4).alignment = { horizontal: 'right' };
    r++;
  }

  // Commercial rate
  const commercialRate = fmt(estimate.commercial_rate);
  if (commercialRate > 0) {
    ws1.getCell(r, 1).value = t('Коммерческое помещение (за 1 м.кв.):', 'Tijoriy bino (1 kv.m uchun):');
    ws1.getCell(r, 1).font = { ...FONT_BODY };
    ws1.getCell(r, 4).value = commercialRate;
    ws1.getCell(r, 4).font = { ...FONT_BODY };
    ws1.getCell(r, 4).numFmt = '#,##0';
    ws1.getCell(r, 4).alignment = { horizontal: 'right' };
    r++;
  }

  // Enterprise income
  if (profitPct > 0) {
    ws1.getCell(r, 1).value = t(`Доход предприятия (${profitPct}%):`, `Korxona daromadi (${profitPct}%):`);
    ws1.getCell(r, 1).font = { ...FONT_BODY, bold: true };
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

  // Sheet 1 закончен на строке `r-1` (следующий write был бы в r).
  // Устанавливаем print area строго на заполненную зону.
  const ws1LastRow = Math.max(1, r - 1);
  ws1.pageSetup.printArea = `A1:D${ws1LastRow}`;

  // ─── Sheet 2: Площади ───
  const ws2 = workbook.addWorksheet(t('Площади', 'Maydonlar'), {
    pageSetup: {
      paperSize: 9,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
      horizontalCentered: true,
    },
    views: [{ showGridLines: false, state: 'frozen', ySplit: 1 }],
  });

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

  // Print area для ws2 — заполненная зона до строки r2 (включительно с
  // итогами). Без этого Preview.app снова покажет "бесконечный лист".
  ws2.pageSetup.printArea = `A1:D${r2}`;

  // ─── Save ───
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const filename = `smeta_${estimate.period || 'export'}.xlsx`;
  saveAs(blob, filename);
}
