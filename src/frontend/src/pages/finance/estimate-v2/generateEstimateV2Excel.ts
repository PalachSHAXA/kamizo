// Детальная Excel-выгрузка сметы v2 (мастер /finance/estimates/v2/new).
//
// Повторяет раскладку богатого PDF-превью «Смета расходов»: шапка-бренд →
// ОБЪЕКТ → расчётные показатели (KPI) → ШТАТ → ДОХОДЫ → РАСХОДЫ
// (Зарплата / Производственные / Периодические) → Итоговый расчёт с формулой
// → подписи → легал-футер.
//
// ВАЖНО: цифры берём ГОТОВЫЕ из result (EstimateResultV2) — те же, что видит
// директор на экране. НЕ пересчитываем по чужой (старой) модели.
//
// ExcelJS импортируется лениво (900KB-бандл не должен попасть в main-чанк).
import { saveAs } from 'file-saver';
import type { Fill, Borders, Font, Worksheet } from 'exceljs';
import type {
  EstimateModelV2,
  EstimateResultV2,
  ExpenseLineV2,
  IncomeStreamV2,
} from '../../../services/api/finance-v2';

const YELLOW_FILL: Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
const GRAY_FILL: Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
const GREEN_FILL: Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F4EA' } };
const BLUE_FILL: Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1FB' } };
const THIN_BORDER: Partial<Borders> = {
  top: { style: 'thin' }, left: { style: 'thin' },
  bottom: { style: 'thin' }, right: { style: 'thin' },
};
const FONT_BODY: Partial<Font> = { name: 'Times New Roman', size: 11 };
const FONT_SMALL: Partial<Font> = { name: 'Times New Roman', size: 9, color: { argb: 'FF6B7280' } };
const FONT_HEADER: Partial<Font> = { name: 'Times New Roman', size: 12, bold: true };
const FONT_TITLE: Partial<Font> = { name: 'Times New Roman', size: 15, bold: true };

// Секции расходов v2 (production | periodic) + виртуальная salary (штат).
const RASXOD_GROUPS: Array<{ key: 'salary' | 'production' | 'periodic'; ru: string; uz: string }> = [
  { key: 'salary', ru: 'Заработная плата (с налогом)', uz: 'Ish haqi (soliq bilan)' },
  { key: 'production', ru: 'Производственные расходы', uz: 'Ishlab chiqarish xarajatlari' },
  { key: 'periodic', ru: 'Периодические расходы', uz: 'Davriy xarajatlar' },
];

const INCOME_LABELS: Record<string, { ru: string; uz: string }> = {
  commercial: { ru: 'Коммерческие помещения', uz: 'Tijoriy binolar' },
  basement: { ru: 'Подвал', uz: 'Podval' },
  parking: { ru: 'Парковка', uz: 'Avtoturargoh' },
  telecom: { ru: 'Телеком', uz: 'Telekom' },
  advertising: { ru: 'Реклама / провайдеры', uz: 'Reklama / provayderlar' },
  other: { ru: 'Прочие доходы', uz: 'Boshqa daromadlar' },
};

interface ExpenseRow {
  name: string;
  monthly: number;
  section: 'salary' | 'production' | 'periodic';
}

export interface EstimateV2ExcelInput {
  period: string;                  // YYYY-MM
  title?: string;
  status?: string;
  model: EstimateModelV2;
  profitPercent: number;           // 9 → 9%
  payrollTaxRate: number;          // 0.24
  building: {
    name: string;
    address?: string;
    totalArea: number;
    livingArea: number;
    floors?: number;
    entrances?: number;
    apartments?: number;
    hasElevator?: boolean;
  };
  staff: EstimateResultV2['staff_lines'];  // {title, units, salary, monthly}
  vacationReserve?: number;                // резерв отпускных/мес (в ФОТ)
  payrollTax: number;
  expenses: ExpenseLineV2[];
  incomes: IncomeStreamV2[];
  result: EstimateResultV2;
  // Пер-домовая разбивка (смета на ЖК): по листу на каждый дом.
  complexBuildings?: Array<{
    building_id: string; name: string; residential_area: number; share: number;
    self_expense: number; self_cost_resident: number; base_per_m2: number;
    with_profit_per_m2: number; telecom_comp_per_m2: number; tariff_resident: number;
    tariff_effective: number; vat_per_m2: number; tariff_with_vat: number;
  }>;
  complexFotTotal?: number;        // ФОТ (итого) для разложения linked_to_staff строки
  branchName?: string;             // имя ЖК
  language: 'ru' | 'uz';
  tenantName?: string;
}

export async function generateEstimateV2Excel(input: EstimateV2ExcelInput): Promise<void> {
  const { language, result, building } = input;
  const t = (ru: string, uz: string) => (language === 'ru' ? ru : uz);
  const uk = input.tenantName || 'Kamizo';
  const num = (v: unknown) => Number(v) || 0;
  const year = input.period ? input.period.slice(0, 4) : String(new Date().getFullYear());

  // Площадь для тарифа: сначала жилая (тариф считается на жилую), затем общая,
  // затем восстановление из расчёта бэкенда (base = себестоимость / площадь).
  const derivedArea = num(result.base_per_m2) > 0
    ? num(result.self_cost_resident) / num(result.base_per_m2)
    : 0;
  const tariffArea = num(building.livingArea) > 0
    ? num(building.livingArea)
    : (num(building.totalArea) > 0 ? num(building.totalArea) : derivedArea);
  const tariff = (monthly: number) => (tariffArea > 0 ? Math.round(monthly / tariffArea) : 0);

  // ── Строки расходов по группам ────────────────────────────────────
  const rows: ExpenseRow[] = [];
  (input.staff || []).forEach((s) => {
    if (num(s.monthly) === 0 && !s.title) return;
    rows.push({ name: s.title || t('Сотрудник', 'Xodim'), monthly: num(s.monthly), section: 'salary' });
  });
  if (num(input.vacationReserve) > 0) {
    rows.push({ name: t('Резерв отпускных', "Ta'til rezervi"), monthly: num(input.vacationReserve), section: 'salary' });
  }
  if (num(input.payrollTax) > 0) {
    rows.push({ name: t('Соцналог + НДФЛ (ЕСП)', 'Soliq + NDFL (ESP)'), monthly: num(input.payrollTax), section: 'salary' });
  }
  (input.expenses || []).forEach((e) => {
    if (e.linked_to_staff) return; // агрегат ФОТ уже разложен на строки штата
    rows.push({ name: e.name || '', monthly: num(e.monthly), section: (e.section as 'production' | 'periodic') || 'production' });
  });

  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();

  // ── Смета на ЖК: сводный лист + по листу на каждый дом ──────────────
  if (input.complexBuildings && input.complexBuildings.length > 0) {
    const cbs = input.complexBuildings;
    const fotTotal = num(input.complexFotTotal);
    const nf = (w: Worksheet, row: number, cols: number[]) => cols.forEach((c) => {
      w.getCell(row, c).numFmt = '#,##0'; w.getCell(row, c).alignment = { horizontal: 'right' };
    });
    const safe = (s: string) => s.replace(/[\\/?*[\]:]/g, '-').slice(0, 24);

    // Сводный лист
    const sum = workbook.addWorksheet(t('Сводка ЖК', 'JK'), {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } },
      views: [{ showGridLines: false }],
    });
    sum.getColumn(1).width = 36; sum.getColumn(2).width = 14; sum.getColumn(3).width = 16; sum.getColumn(4).width = 16;
    let sr = 1;
    sum.mergeCells(sr, 1, sr, 4);
    sum.getCell(sr, 1).value = `${uk}${input.branchName ? ' · ' + input.branchName : ''} — ${t('смета на ЖК', 'JK smeta')} ${year}`;
    sum.getCell(sr, 1).font = { ...FONT_TITLE }; sum.getCell(sr, 1).alignment = { horizontal: 'center' }; sr += 2;
    [t('Дом', 'Uy'), t('Жил. м²', 'm²'), t('Расход/мес', 'Xarajat'), t('⭐ Тариф сум/м²', 'Tarif')].forEach((h, i) => {
      const c = sum.getCell(sr, i + 1); c.value = h; c.font = { ...FONT_HEADER, size: 10 }; c.fill = YELLOW_FILL; c.border = THIN_BORDER; c.alignment = { horizontal: i === 0 ? 'left' : 'right' };
    }); sr++;
    for (const b of cbs) {
      sum.getCell(sr, 1).value = b.name; sum.getCell(sr, 2).value = Math.round(b.residential_area * 100) / 100;
      sum.getCell(sr, 3).value = b.self_expense; sum.getCell(sr, 4).value = b.tariff_effective;
      for (let c = 1; c <= 4; c++) sum.getCell(sr, c).border = THIN_BORDER;
      sum.getCell(sr, 2).numFmt = '#,##0.00'; nf(sum, sr, [3, 4]); sum.getCell(sr, 4).font = { ...FONT_BODY, bold: true }; sr++;
    }
    sr += 1;

    // ── Штат ЖК (общий на весь объект) ──
    const staffList = (input.staff || []).filter((s) => s.title || num(s.monthly) > 0);
    if (staffList.length > 0) {
      sum.getCell(sr, 1).value = t('ШТАТ ЖК (общий на весь объект)', 'JK shtati (umumiy)');
      sum.getCell(sr, 1).font = { ...FONT_HEADER }; sr++;
      [t('Должность', 'Lavozim'), t('Ед.', 'Birlik'), t('Оклад', 'Oylik'), t('Сумма/мес', 'Oy')].forEach((h, i) => {
        const c = sum.getCell(sr, i + 1); c.value = h; c.font = { ...FONT_HEADER, size: 10 }; c.fill = YELLOW_FILL; c.border = THIN_BORDER; c.alignment = { horizontal: i === 0 ? 'left' : 'right' };
      }); sr++;
      for (const s of staffList) {
        sum.getCell(sr, 1).value = s.title || '';
        sum.getCell(sr, 2).value = num(s.units);
        sum.getCell(sr, 3).value = num(s.salary);
        sum.getCell(sr, 4).value = num(s.monthly);
        for (let c = 1; c <= 4; c++) sum.getCell(sr, c).border = THIN_BORDER;
        sum.getCell(sr, 2).alignment = { horizontal: 'center' }; nf(sum, sr, [3, 4]); sr++;
      }
      if (num(input.vacationReserve) > 0) {
        sum.getCell(sr, 1).value = t('Резерв отпускных', "Ta'til rezervi"); sum.getCell(sr, 4).value = num(input.vacationReserve);
        for (let c = 1; c <= 4; c++) sum.getCell(sr, c).border = THIN_BORDER; nf(sum, sr, [4]); sr++;
      }
      if (num(input.payrollTax) > 0) {
        sum.getCell(sr, 1).value = t('Соцналог + НДФЛ (ЕСП)', 'Soliq + NDFL'); sum.getCell(sr, 4).value = num(input.payrollTax);
        for (let c = 1; c <= 4; c++) sum.getCell(sr, c).border = THIN_BORDER; nf(sum, sr, [4]); sr++;
      }
      sum.getCell(sr, 1).value = t('ФОТ (итого, на весь ЖК)', 'FOT jami'); sum.getCell(sr, 1).font = { ...FONT_HEADER };
      sum.getCell(sr, 4).value = num(input.complexFotTotal); sum.getCell(sr, 4).font = { ...FONT_HEADER };
      for (let c = 1; c <= 4; c++) sum.getCell(sr, c).border = THIN_BORDER; nf(sum, sr, [4]); sr++;
      sum.mergeCells(sr, 1, sr, 4);
      sum.getCell(sr, 1).value = t('ФОТ делится между домами по жилой площади (см. строку «Расходы по зарплате» в листе каждого дома).', 'FOT uylar bo\'yicha maydonga qarab taqsimlanadi.');
      sum.getCell(sr, 1).font = { ...FONT_SMALL }; sr++;
    }

    sum.pageSetup.printArea = `A1:D${sr - 1}`;

    // Лист на каждый дом
    cbs.forEach((b, idx) => {
      const area = b.residential_area || 0;
      const pt = (m: number) => (area > 0 ? Math.round(m / area) : 0);
      const brows: Array<{ name: string; monthly: number; section: 'salary' | 'production' | 'periodic' }> = [];
      (input.expenses || []).forEach((e) => {
        const base = e.linked_to_staff ? fotTotal : num(e.monthly);
        let amt = 0;
        if (e.building_id === b.building_id) amt = base;
        else if (!e.building_id) amt = base * (b.share || 0);
        if (amt <= 0) return;
        const sec = (e.linked_to_staff ? 'salary' : ((e.section as any) || 'production')) as 'salary' | 'production' | 'periodic';
        brows.push({ name: (e.linked_to_staff ? t('Зарплата (ФОТ+налог)', 'Ish haqi') : (e.name || '')) + (e.building_id ? ` [${t('адрес', 'manzil')}]` : ''), monthly: amt, section: sec });
      });
      const wsb = workbook.addWorksheet(`${safe(b.name || 'Дом')}·${idx + 1}`, {
        pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 }, horizontalCentered: true },
        views: [{ showGridLines: false }],
      });
      wsb.getColumn(1).width = 46; wsb.getColumn(2).width = 15; wsb.getColumn(3).width = 17; wsb.getColumn(4).width = 17;
      let br = 1;
      wsb.mergeCells(br, 1, br, 4); wsb.getCell(br, 1).value = uk; wsb.getCell(br, 1).font = { ...FONT_HEADER }; wsb.getCell(br, 1).alignment = { horizontal: 'center' }; br++;
      wsb.mergeCells(br, 1, br, 4); wsb.getCell(br, 1).value = `${input.branchName ? input.branchName + ' · ' : ''}${b.name}`; wsb.getCell(br, 1).font = { ...FONT_TITLE }; wsb.getCell(br, 1).alignment = { horizontal: 'center' }; br++;
      wsb.mergeCells(br, 1, br, 4); wsb.getCell(br, 1).value = `${t('Жилая площадь', 'Turar maydon')}: ${Math.round(area * 100) / 100} м²`; wsb.getCell(br, 1).font = { ...FONT_SMALL }; wsb.getCell(br, 1).alignment = { horizontal: 'center' }; br += 2;
      [t('Статья', 'Modda'), t('Тариф 1 м²', '1 m²'), t('Сумма/мес', 'Oy'), t('Сумма/год', 'Yil')].forEach((h, i) => {
        const c = wsb.getCell(br, i + 1); c.value = h; c.font = { ...FONT_HEADER, size: 10 }; c.fill = YELLOW_FILL; c.border = THIN_BORDER; c.alignment = { horizontal: 'center' };
      }); br++;
      const groups: Array<{ k: 'salary' | 'production' | 'periodic'; ru: string; uz: string }> = [
        { k: 'salary', ru: 'Зарплата', uz: 'Ish haqi' },
        { k: 'production', ru: 'Производственные', uz: 'Ishlab chiqarish' },
        { k: 'periodic', ru: 'Периодические', uz: 'Davriy' },
      ];
      for (const g of groups) {
        const gr = brows.filter((x) => x.section === g.k); if (!gr.length) continue;
        const gm = gr.reduce((s, x) => s + x.monthly, 0);
        wsb.getCell(br, 1).value = `${t(g.ru, g.uz)} — ${t('Жами', 'Jami')}`; wsb.getCell(br, 2).value = pt(gm); wsb.getCell(br, 3).value = gm; wsb.getCell(br, 4).value = gm * 12;
        for (let c = 1; c <= 4; c++) { wsb.getCell(br, c).font = { ...FONT_BODY, bold: true }; wsb.getCell(br, c).fill = GRAY_FILL; wsb.getCell(br, c).border = THIN_BORDER; }
        nf(wsb, br, [2, 3, 4]); br++;
        for (const x of gr) {
          wsb.getCell(br, 1).value = '    ' + x.name; wsb.getCell(br, 2).value = pt(x.monthly); wsb.getCell(br, 3).value = x.monthly; wsb.getCell(br, 4).value = x.monthly * 12;
          for (let c = 1; c <= 4; c++) { wsb.getCell(br, c).font = { ...FONT_BODY }; wsb.getCell(br, c).border = THIN_BORDER; }
          nf(wsb, br, [2, 3, 4]); br++;
        }
      }
      wsb.getCell(br, 1).value = t('ИТОГО РАСХОДЫ', 'JAMI'); wsb.getCell(br, 1).font = { ...FONT_HEADER };
      wsb.getCell(br, 2).value = pt(b.self_expense); wsb.getCell(br, 3).value = b.self_expense; wsb.getCell(br, 4).value = b.self_expense * 12;
      for (let c = 2; c <= 4; c++) wsb.getCell(br, c).font = { ...FONT_HEADER }; for (let c = 1; c <= 4; c++) wsb.getCell(br, c).border = THIN_BORDER;
      nf(wsb, br, [2, 3, 4]); br += 2;
      const cr = (ru: string, uz: string, val: number, suf: string, bold?: boolean, fill?: Fill) => {
        wsb.getCell(br, 1).value = t(ru, uz); wsb.getCell(br, 1).font = { ...FONT_BODY, bold };
        wsb.getCell(br, 3).value = suf; wsb.getCell(br, 3).font = { ...FONT_SMALL }; wsb.getCell(br, 3).alignment = { horizontal: 'right' };
        wsb.getCell(br, 4).value = val; wsb.getCell(br, 4).numFmt = '#,##0'; wsb.getCell(br, 4).alignment = { horizontal: 'right' }; wsb.getCell(br, 4).font = { ...FONT_BODY, bold };
        if (fill) for (let c = 1; c <= 4; c++) wsb.getCell(br, c).fill = fill; br++;
      };
      cr('Себестоимость (жители)', 'Tannarx', b.self_cost_resident, t('сум/мес', "so'm/oy"));
      cr('База / м²', 'Baza', b.base_per_m2, t('сум/м²', "so'm/m²"));
      cr('С прибылью / м²', 'Foyda', b.with_profit_per_m2, t('сум/м²', "so'm/m²"));
      if (b.telecom_comp_per_m2 > 0) cr('Компенсация телеком / м²', 'Telekom', b.telecom_comp_per_m2, t('сум/м²', "so'm/m²"));
      cr('⭐ ТАРИФ ЖИТЕЛЮ', '⭐ TARIF', b.tariff_effective, t('сум/м²/мес', "so'm/m²/oy"), true, YELLOW_FILL);
      if (b.vat_per_m2 > 0) { cr('в т.ч. НДС', 'QQS', b.vat_per_m2, t('сум/м²', "so'm/m²")); cr('⭐ С НДС', 'QQS bilan', b.tariff_with_vat, t('сум/м²', "so'm/m²"), true); }
      br += 2;
      wsb.getCell(br, 1).value = t('Директор _____________ / Гл. бухгалтер _____________', 'Direktor / Bosh hisobchi');
      wsb.getCell(br, 1).font = { ...FONT_BODY };
      wsb.pageSetup.printArea = `A1:D${br}`;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `smeta_JK_${input.period || 'export'}.xlsx`);
    return;
  }

  const ws = workbook.addWorksheet(t('Смета', 'Smeta'), {
    pageSetup: {
      paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
      horizontalCentered: true,
    },
    views: [{ showGridLines: false }],
  });

  // 5 колонок. Суммы (мес/год) всегда в col4/col5, чтобы таблицы совпадали.
  ws.getColumn(1).width = 44;  // Наименование / Должность / label
  ws.getColumn(2).width = 13;  // Тариф 1 м² / Ед.
  ws.getColumn(3).width = 15;  // Оклад / примечание
  ws.getColumn(4).width = 17;  // План/мес · Сумма/мес
  ws.getColumn(5).width = 17;  // План/год · Сумма/год

  let r = 1;
  const numFmt = (row: number, cols: number[]) => cols.forEach((c) => {
    ws.getCell(row, c).numFmt = '#,##0';
    ws.getCell(row, c).alignment = { horizontal: 'right', vertical: 'middle' };
  });
  const border = (row: number, from = 1, to = 5) => {
    for (let c = from; c <= to; c++) ws.getCell(row, c).border = THIN_BORDER;
  };
  const bodyFont = (row: number, from = 1, to = 5) => {
    for (let c = from; c <= to; c++) ws.getCell(row, c).font = { ...FONT_BODY };
  };

  // ── Шапка-бренд ───────────────────────────────────────────────────
  ws.mergeCells(r, 1, r, 3);
  ws.getCell(r, 1).value = t('Управляющая организация', 'Boshqaruv tashkiloti');
  ws.getCell(r, 1).font = { ...FONT_SMALL };
  ws.getCell(r, 4).value = 'Kamizo';
  ws.getCell(r, 4).font = { ...FONT_HEADER };
  ws.getCell(r, 4).alignment = { horizontal: 'right' };
  ws.mergeCells(r, 4, r, 5);
  r++;
  ws.mergeCells(r, 1, r, 3);
  ws.getCell(r, 1).value = uk;
  ws.getCell(r, 1).font = { ...FONT_HEADER };
  ws.getCell(r, 4).value = t('Управление домом · kamizo.uz', 'Uy boshqaruvi · kamizo.uz');
  ws.getCell(r, 4).font = { ...FONT_SMALL };
  ws.getCell(r, 4).alignment = { horizontal: 'right' };
  ws.mergeCells(r, 4, r, 5);
  r += 2;

  // ── Заголовок документа ───────────────────────────────────────────
  ws.mergeCells(r, 1, r, 5);
  ws.getCell(r, 1).value = input.title || t(`СМЕТА РАСХОДОВ НА ${year} ГОД`, `${year} YILGI XARAJATLAR SMETASI`);
  ws.getCell(r, 1).font = { ...FONT_TITLE };
  ws.getCell(r, 1).alignment = { horizontal: 'center' };
  r++;
  ws.mergeCells(r, 1, r, 5);
  ws.getCell(r, 1).value = `${t('Период', 'Davr')}: ${year} · ${t('Статус', 'Holat')}: ${input.status || 'draft'}`;
  ws.getCell(r, 1).font = { ...FONT_SMALL };
  ws.getCell(r, 1).alignment = { horizontal: 'center' };
  r += 2;

  // ── Блок ОБЪЕКТ ───────────────────────────────────────────────────
  ws.getCell(r, 1).value = t('ОБЪЕКТ', 'OBYEKT');
  ws.getCell(r, 1).font = { ...FONT_SMALL, bold: true };
  r++;
  ws.mergeCells(r, 1, r, 5);
  ws.getCell(r, 1).value = building.name || '';
  ws.getCell(r, 1).font = { ...FONT_HEADER };
  r++;
  if (building.address) {
    ws.mergeCells(r, 1, r, 5);
    ws.getCell(r, 1).value = building.address;
    ws.getCell(r, 1).font = { ...FONT_BODY };
    r++;
  }
  ws.mergeCells(r, 1, r, 5);
  ws.getCell(r, 1).value =
    `${t('Общая площадь', 'Umumiy maydon')}: ${num(building.totalArea).toLocaleString('ru-RU')} м²   ·   ` +
    `${t('Жилая', 'Turar')}: ${num(building.livingArea).toLocaleString('ru-RU')} м²   ·   ` +
    `${t('Подъездов', "Kirish")}: ${num(building.entrances)}   ·   ` +
    `${t('Квартир', 'Xonadon')}: ${num(building.apartments)}   ·   ` +
    `${t('Лифт', 'Lift')}: ${building.hasElevator ? t('есть', 'bor') : t('нет', "yo'q")}`;
  ws.getCell(r, 1).font = { ...FONT_SMALL };
  r++;
  ws.mergeCells(r, 1, r, 5);
  ws.getCell(r, 1).value =
    `${t('Модель', 'Model')}: ${input.model}   ·   ` +
    `${t('Прибыль УК', 'BT foydasi')}: ${input.profitPercent}%   ·   ` +
    `${t('Налог на ФОТ', "FOT solig'i")}: ${(input.payrollTaxRate * 100).toFixed(1)}%`;
  ws.getCell(r, 1).font = { ...FONT_SMALL };
  r += 2;

  // ── Расчётные показатели (KPI) ────────────────────────────────────
  ws.getCell(r, 1).value = t('РАСЧЁТНЫЕ ПОКАЗАТЕЛИ', 'HISOB KO\'RSATKICHLARI');
  ws.getCell(r, 1).font = { ...FONT_HEADER };
  r++;
  const kpis: Array<[string, string, number, boolean?]> = [
    [t('ФОТ (брутто)', 'FOT (yalpi)'), '', num(result.fot_gross)],
    [t('Налог на ФОТ', "FOT solig'i"), '', num(result.payroll_tax)],
    [t('ФОТ (итого)', 'FOT jami'), '', num(result.fot_total)],
    [t('% прибыли УК', 'BT foyda %'), '%', input.profitPercent],
    [t('Себестоимость (жилые)', 'Tannarx (turar)'), t('сум/мес', "so'm/oy"), num(result.self_cost_resident)],
    [t('⭐ Тариф жилых', '⭐ Turar tarif'), t('сум/м²', "so'm/m²"), num(result.tariff_resident), true],
    ...(num(result.resident_saving_per_m2) > 0
      ? [[t('💚 Экономия жителям (доходы УК)', '💚 Aholiga tejamkorlik'), t('сум/м²', "so'm/m²"), num(result.resident_saving_per_m2)]] as Array<[string, string, number, boolean?]>
      : []),
    ...(num(result.vat_per_m2) > 0
      ? [
          [t('в т.ч. НДС', 'shu jumladan QQS'), t('сум/м²', "so'm/m²"), num(result.vat_per_m2)],
          [t('⭐ Тариф с НДС', '⭐ QQS bilan tarif'), t('сум/м²', "so'm/m²"), num(result.tariff_with_vat), true],
        ] as Array<[string, string, number, boolean?]>
      : []),
    [t('Годовые расходы', 'Yillik xarajat'), t('сум', "so'm"), num(result.umumiy_year)],
    [t('Годовой доход', 'Yillik daromad'), t('сум', "so'm"), num(result.jami_tushum_year)],
    [t('Разрыв (год)', 'Yillik farq'), t('сум', "so'm"), num(result.deficit_year)],
  ];
  kpis.forEach(([label, suffix, value, star]) => {
    ws.getCell(r, 1).value = label;
    ws.getCell(r, 1).font = { ...FONT_BODY, bold: !!star };
    ws.getCell(r, 3).value = suffix;
    ws.getCell(r, 3).font = { ...FONT_SMALL };
    ws.getCell(r, 3).alignment = { horizontal: 'right' };
    ws.getCell(r, 5).value = value;
    ws.getCell(r, 5).numFmt = suffix === '%' ? '0"%"' : '#,##0';
    ws.getCell(r, 5).font = { ...FONT_BODY, bold: !!star };
    ws.getCell(r, 5).alignment = { horizontal: 'right' };
    if (star) for (let c = 1; c <= 5; c++) ws.getCell(r, c).fill = YELLOW_FILL;
    r++;
  });
  r++;

  // ── ШТАТ ──────────────────────────────────────────────────────────
  const staff = (input.staff || []).filter((s) => s.title || num(s.monthly) > 0);
  if (staff.length > 0) {
    ws.getCell(r, 1).value = t('ШТАТ', 'SHTAT');
    ws.getCell(r, 1).font = { ...FONT_HEADER };
    r++;
    [t('Должность', 'Lavozim'), t('Ед.', 'Birlik'), t('Оклад', 'Oylik'), t('Сумма/мес', 'Oylik summa'), t('Сумма/год', 'Yillik summa')]
      .forEach((h, i) => {
        const cell = ws.getCell(r, i + 1);
        cell.value = h;
        cell.font = { ...FONT_HEADER, size: 10 };
        cell.fill = YELLOW_FILL;
        cell.border = THIN_BORDER;
        cell.alignment = { horizontal: i === 0 ? 'left' : 'center', vertical: 'middle', wrapText: true };
      });
    r++;
    staff.forEach((s) => {
      ws.getCell(r, 1).value = s.title || '';
      ws.getCell(r, 2).value = num(s.units);
      ws.getCell(r, 3).value = num(s.salary);
      ws.getCell(r, 4).value = num(s.monthly);
      ws.getCell(r, 5).value = num(s.monthly) * 12;
      bodyFont(r);
      border(r);
      ws.getCell(r, 2).alignment = { horizontal: 'center' };
      numFmt(r, [3, 4, 5]);
      r++;
    });
    ws.getCell(r, 1).value = t('Итого ФОТ (без налога)', 'Jami FOT (soliqsiz)');
    ws.getCell(r, 1).font = { ...FONT_HEADER };
    ws.getCell(r, 4).value = num(result.fot_gross);
    ws.getCell(r, 5).value = num(result.fot_gross) * 12;
    for (let c = 4; c <= 5; c++) ws.getCell(r, c).font = { ...FONT_HEADER };
    border(r);
    numFmt(r, [4, 5]);
    r += 2;
  }

  // ── Заголовок таблицы РАСХОДЫ (с тарифом 1 м²) ────────────────────
  const rasxodHeader = () => {
    [t('Наименование статей', 'Moddalar nomi'), t('Тариф 1 м²', '1 m² tarifi'), '', t('План на месяц', 'Oylik reja'), t('План на год', 'Yillik reja')]
      .forEach((h, i) => {
        const cell = ws.getCell(r, i + 1);
        cell.value = h;
        cell.font = { ...FONT_HEADER, size: 10 };
        cell.fill = YELLOW_FILL;
        cell.border = THIN_BORDER;
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      });
    r++;
  };

  ws.getCell(r, 1).value = t('РАСХОДЫ', 'XARAJATLAR');
  ws.getCell(r, 1).font = { ...FONT_HEADER };
  r++;
  rasxodHeader();

  RASXOD_GROUPS.forEach((group) => {
    const groupRows = rows.filter((x) => x.section === group.key);
    if (groupRows.length === 0) return;
    const groupMonthly = groupRows.reduce((s, x) => s + x.monthly, 0);

    ws.getCell(r, 1).value = `${t(group.ru, group.uz)} — ${t('Жами', 'Jami')}`;
    ws.getCell(r, 2).value = tariff(groupMonthly);
    ws.getCell(r, 4).value = groupMonthly;
    ws.getCell(r, 5).value = groupMonthly * 12;
    for (let c = 1; c <= 5; c++) {
      ws.getCell(r, c).font = { ...FONT_BODY, bold: true };
      ws.getCell(r, c).fill = GRAY_FILL;
    }
    border(r);
    numFmt(r, [2, 4, 5]);
    r++;

    groupRows.forEach((x) => {
      ws.getCell(r, 1).value = `    ${x.name}`;
      ws.getCell(r, 2).value = tariff(x.monthly);
      ws.getCell(r, 4).value = x.monthly;
      ws.getCell(r, 5).value = x.monthly * 12;
      bodyFont(r);
      border(r);
      numFmt(r, [2, 4, 5]);
      r++;
    });
  });

  const totalExpMonthly = num(result.total_expenses) || rows.reduce((s, x) => s + x.monthly, 0);
  ws.getCell(r, 1).value = t('ИТОГО РАСХОДЫ', 'JAMI XARAJATLAR');
  ws.getCell(r, 1).font = { ...FONT_HEADER };
  ws.getCell(r, 2).value = tariff(totalExpMonthly);
  ws.getCell(r, 4).value = totalExpMonthly;
  ws.getCell(r, 5).value = totalExpMonthly * 12;
  for (const c of [2, 4, 5]) ws.getCell(r, c).font = { ...FONT_HEADER };
  border(r);
  numFmt(r, [2, 4, 5]);
  r += 2;

  // ── ДОХОДЫ ────────────────────────────────────────────────────────
  const incomes = (input.incomes || []).filter((i) => num(i.monthly) !== 0);
  const extraYear = incomes.reduce((s, i) => s + num(i.monthly) * 12, 0);
  const totalIncomeYear = num(result.jami_tushum_year) || totalExpMonthly * 12;
  const residentYear = Math.max(0, totalIncomeYear - extraYear);

  ws.getCell(r, 1).value = t('ДОХОДЫ', 'DAROMADLAR');
  ws.getCell(r, 1).font = { ...FONT_HEADER };
  r++;
  [t('Источник дохода', 'Daromad manbai'), '', '', t('Сумма/мес', 'Oylik'), t('Сумма/год', 'Yillik')]
    .forEach((h, i) => {
      if (!h) return;
      const cell = ws.getCell(r, i + 1);
      cell.value = h;
      cell.font = { ...FONT_HEADER, size: 10 };
      cell.fill = YELLOW_FILL;
      cell.border = THIN_BORDER;
      cell.alignment = { horizontal: i === 0 ? 'left' : 'center', vertical: 'middle' };
    });
  border(r);
  r++;

  ws.getCell(r, 1).value = `${t('Платежи за услуги УК (жители)', "BK xizmatlari (aholi)")}`;
  ws.getCell(r, 4).value = Math.round(residentYear / 12);
  ws.getCell(r, 5).value = residentYear;
  bodyFont(r);
  border(r);
  numFmt(r, [4, 5]);
  r++;

  incomes.forEach((inc) => {
    const lbl = INCOME_LABELS[inc.type] || INCOME_LABELS.other;
    ws.getCell(r, 1).value = t(lbl.ru, lbl.uz);
    ws.getCell(r, 4).value = num(inc.monthly);
    ws.getCell(r, 5).value = num(inc.monthly) * 12;
    bodyFont(r);
    border(r);
    numFmt(r, [4, 5]);
    r++;
  });

  ws.getCell(r, 1).value = t('ЖАМИ ТУШУМ (Итого доходов)', 'JAMI TUSHUM');
  ws.getCell(r, 1).font = { ...FONT_HEADER };
  ws.getCell(r, 4).value = Math.round(totalIncomeYear / 12);
  ws.getCell(r, 5).value = totalIncomeYear;
  for (const c of [4, 5]) ws.getCell(r, c).font = { ...FONT_HEADER };
  border(r);
  numFmt(r, [4, 5]);
  r += 2;

  // ── Итоговый расчёт ───────────────────────────────────────────────
  ws.getCell(r, 1).value = t('ИТОГОВЫЙ РАСЧЁТ', 'YAKUNIY HISOB');
  ws.getCell(r, 1).font = { ...FONT_HEADER };
  r++;

  const fotYear = num(result.fot_total) * 12;
  const otherYear = Math.max(0, num(result.umumiy_year) - fotYear);
  const finalRow = (labelRu: string, labelUz: string, value: number, opts?: { bold?: boolean; fill?: Fill; neg?: boolean; pct?: boolean }) => {
    ws.getCell(r, 1).value = t(labelRu, labelUz);
    ws.getCell(r, 1).font = { ...FONT_BODY, bold: opts?.bold };
    ws.getCell(r, 5).value = value;
    ws.getCell(r, 5).numFmt = opts?.pct ? '0"%"' : '#,##0';
    ws.getCell(r, 5).alignment = { horizontal: 'right' };
    ws.getCell(r, 5).font = { ...FONT_BODY, bold: opts?.bold, color: opts?.neg && value < 0 ? { argb: 'FFDC2626' } : undefined };
    if (opts?.fill) for (let c = 1; c <= 5; c++) ws.getCell(r, c).fill = opts.fill;
    r++;
  };
  finalRow('Рентабельность (прибыль УК)', 'Rentabellik (BT foydasi)', input.profitPercent, { pct: true });
  finalRow('Всего доходов (год)', 'Jami daromad (yil)', totalIncomeYear);
  finalRow('   в т.ч. ФОТ + налог (год)', "   sh.j. FOT + soliq (yil)", fotYear);
  finalRow('   в т.ч. производств. + периодич. (год)', '   sh.j. ishlab chiq. + davriy (yil)', otherYear);
  finalRow('Всего расходов (год)', 'Jami xarajat (yil)', num(result.umumiy_year), { bold: true });
  finalRow('Разница · Дефицит (доходы − расходы)', 'Farq · Defitsit', num(result.deficit_year), { bold: true, neg: true, fill: GREEN_FILL });
  r++;

  // Формула тарифа
  ws.mergeCells(r, 1, r, 5);
  ws.getCell(r, 1).value = t(
    'Вз = (∑Расходов − ∑Доходов) / (жилая площадь × 12)',
    'Vz = (∑Xarajat − ∑Daromad) / (turar maydon × 12)',
  );
  ws.getCell(r, 1).font = { ...FONT_BODY, italic: true };
  for (let c = 1; c <= 5; c++) ws.getCell(r, c).fill = BLUE_FILL;
  r++;
  ws.mergeCells(r, 1, r, 5);
  ws.getCell(r, 1).value = t(
    'Базовая формула: расходы за вычетом доходов, отнесённые на жилую площадь за год.',
    'Asosiy formula: daromad chegirilgan xarajatlar, yillik turar maydonga taqsimlanadi.',
  );
  ws.getCell(r, 1).font = { ...FONT_SMALL, italic: true };
  r += 2;

  // Всего КВ.М
  ws.getCell(r, 1).value = t('Всего КВ.М. (жилая, база тарифа):', 'Jami KV.M. (turar):');
  ws.getCell(r, 1).font = { ...FONT_BODY, bold: true };
  ws.getCell(r, 5).value = Math.round(tariffArea * 100) / 100;
  ws.getCell(r, 5).numFmt = '#,##0.00';
  ws.getCell(r, 5).font = { ...FONT_BODY, bold: true };
  ws.getCell(r, 5).alignment = { horizontal: 'right' };
  r += 2;

  // ── Подписи ───────────────────────────────────────────────────────
  ws.getCell(r, 1).value = t('Директор УК', 'BT direktori');
  ws.getCell(r, 4).value = t('Гл. бухгалтер', 'Bosh hisobchi');
  ws.getCell(r, 4).alignment = { horizontal: 'left' };
  bodyFont(r);
  r++;
  ws.getCell(r, 1).value = '______________________';
  ws.getCell(r, 4).value = '______________________';
  bodyFont(r);
  r += 2;

  // ── Легал-футер ───────────────────────────────────────────────────
  ws.mergeCells(r, 1, r + 2, 5);
  ws.getCell(r, 1).value = t(
    'Смета составлена в соответствии с Законом Республики Узбекистан «Об управлении многоквартирными домами» (ЗРУ-581), приказом Министерства юстиции №3501 (минимальные тарифы), а также постановлениями Кабинета Министров №930 и №5152. Документ подлежит утверждению общим собранием собственников. Сформирован автоматически системой Kamizo.',
    'Smeta O\'zR "Ko\'p kvartirali uylarni boshqarish to\'g\'risida"gi qonuni (ORQ-581), Adliya vazirligi buyrug\'i №3501 va VM qarorlari №930, №5152 asosida tuzilgan. Hujjat egalarning umumiy yig\'ilishida tasdiqlanadi. Kamizo tomonidan yaratilgan.',
  );
  ws.getCell(r, 1).font = { ...FONT_SMALL };
  ws.getCell(r, 1).alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
  r += 3;

  ws.pageSetup.printArea = `A1:E${Math.max(1, r)}`;

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  saveAs(blob, `smeta_${input.period || 'export'}.xlsx`);
}
