import type { FactReportPayload } from '../services/api/finance-v2';
import type { UkReportType, WorksPreviewPayload } from '../services/api/ukReports';
import robotoRegularUrl from '../assets/fonts/Roboto-Regular.ttf?url';
import robotoMediumUrl from '../assets/fonts/Roboto-Medium.ttf?url';

export type UkReportPreview = FactReportPayload | WorksPreviewPayload;

export interface UkReportPdfOptions {
  type: UkReportType;
  preview: UkReportPreview;
  ukName: string;
  buildingName: string;
  periodLabel: string;
  language: 'ru' | 'uz';
}

function isFinancialPreview(preview: UkReportPreview): preview is FactReportPayload {
  return 'rows' in preview;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(index, index + 0x8000)));
  }
  return btoa(binary);
}

async function fetchFont(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch PDF font (${response.status})`);
  return arrayBufferToBase64(await response.arrayBuffer());
}

function safeFilenamePart(value: string): string {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80) || 'report';
}

export async function generateUkReportPdf(options: UkReportPdfOptions): Promise<{ blob: Blob; filename: string }> {
  const [{ default: JsPdf }, regularFont, mediumFont] = await Promise.all([
    import('jspdf'),
    fetchFont(robotoRegularUrl),
    fetchFont(robotoMediumUrl),
  ]);
  const pdf = new JsPdf({ orientation: 'p', unit: 'mm', format: 'a4' });
  pdf.addFileToVFS('Roboto-Regular.ttf', regularFont);
  pdf.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
  pdf.addFileToVFS('Roboto-Medium.ttf', mediumFont);
  pdf.addFont('Roboto-Medium.ttf', 'Roboto', 'bold');

  const isRu = options.language === 'ru';
  const title = options.type === 'financial'
    ? (isRu ? 'Финансовый отчёт' : 'Moliyaviy hisobot')
    : (isRu ? 'Отчёт о выполненных работах' : 'Bajarilgan ishlar hisoboti');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  const bottom = pageHeight - 16;
  const lineHeight = 4.8;
  let y = margin;

  const addPage = () => {
    pdf.addPage();
    y = margin;
  };
  const ensureSpace = (height: number) => {
    if (y + height > bottom) addPage();
  };
  const text = (value: string, size = 9, bold = false, gap = 1) => {
    pdf.setFont('Roboto', bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(value || '—', contentWidth) as string[];
    for (const line of lines) {
      ensureSpace(lineHeight);
      pdf.text(line, margin, y, { baseline: 'top' });
      y += lineHeight;
    }
    y += gap;
  };
  const section = (value: string) => {
    ensureSpace(10);
    y += 2;
    text(value, 11, true, 2);
  };
  const money = (value: number) => `${new Intl.NumberFormat(isRu ? 'ru-RU' : 'uz-UZ').format(value || 0)} ${isRu ? 'сум' : 'so‘m'}`;
  const drawTableRow = (cells: string[], widths: number[], bold = false) => {
    pdf.setFont('Roboto', bold ? 'bold' : 'normal');
    pdf.setFontSize(7.5);
    const wrapped = cells.map((cell, index) => pdf.splitTextToSize(cell || '—', widths[index] - 3) as string[]);
    const height = Math.max(...wrapped.map(lines => lines.length)) * 3.8 + 3;
    ensureSpace(height);
    let x = margin;
    wrapped.forEach((lines, index) => {
      pdf.rect(x, y, widths[index], height);
      pdf.text(lines, x + 1.5, y + 1.5, { baseline: 'top' });
      x += widths[index];
    });
    y += height;
  };

  pdf.setTextColor(35, 31, 28);
  text(title, 17, true, 2);
  text(`${isRu ? 'Управляющая компания' : 'Boshqaruv kompaniyasi'}: ${options.ukName}`, 9);
  text(`${isRu ? 'Дом' : 'Uy'}: ${options.buildingName}`, 9);
  text(`${isRu ? 'Период' : 'Davr'}: ${options.periodLabel}`, 9, false, 3);

  if (isFinancialPreview(options.preview)) {
    const preview = options.preview;
    section(isRu ? 'Основные показатели' : 'Asosiy ko‘rsatkichlar');
    text(`${isRu ? 'Начислено' : 'Hisoblandi'}: ${money(preview.totals.accrued)}`);
    text(`${isRu ? 'Оплачено' : 'To‘landi'}: ${money(preview.totals.paid)}`);
    text(`${isRu ? 'Задолженность' : 'Qarzdorlik'}: ${money(preview.totals.arrears)}`);
    text(`${isRu ? 'Фактический доход УК' : 'BKning amaldagi daromadi'}: ${money(preview.uk_income_fact)}`);
    section(isRu ? 'Финансовые показатели по статьям' : 'Moddalar bo‘yicha moliyaviy ko‘rsatkichlar');
    drawTableRow(
      isRu ? ['Статья', 'Долг на начало', 'Начислено', 'Оплачено', 'Долг'] : ['Modda', 'Boshlang‘ich qarz', 'Hisoblandi', 'To‘landi', 'Qarz'],
      [62, 31, 31, 31, 25],
      true,
    );
    for (const row of preview.rows) {
      drawTableRow([row.name, money(row.prior_debt), money(row.accrued), money(row.paid), money(row.arrears)], [62, 31, 31, 31, 25]);
    }
    drawTableRow(
      [isRu ? 'Итого' : 'Jami', money(preview.totals.prior_debt), money(preview.totals.accrued), money(preview.totals.paid), money(preview.totals.arrears)],
      [62, 31, 31, 31, 25],
      true,
    );
  } else {
    const preview = options.preview;
    section(isRu ? 'Итоги периода' : 'Davr yakunlari');
    text(`${isRu ? 'Получено заявок' : 'Qabul qilingan arizalar'}: ${preview.summary.requests_received}`);
    text(`${isRu ? 'Выполнено заявок' : 'Bajarilgan arizalar'}: ${preview.summary.requests_completed}`);
    text(`${isRu ? 'Отменено заявок' : 'Bekor qilingan arizalar'}: ${preview.summary.requests_cancelled}`);
    text(`${isRu ? 'Выполнено плановых работ' : 'Bajarilgan rejali ishlar'}: ${preview.summary.work_orders_completed}`);
    section(isRu ? 'Выполненные заявки' : 'Bajarilgan arizalar');
    if (preview.completed_requests.length === 0) text(isRu ? 'За выбранный период выполненных заявок нет.' : 'Tanlangan davrda bajarilgan arizalar yo‘q.');
    for (const item of preview.completed_requests) {
      text(`• ${item.number ? `${item.number} · ` : ''}${item.title} · ${new Date(item.completed_at).toLocaleDateString(isRu ? 'ru-RU' : 'uz-UZ')}`, 9);
    }
    section(isRu ? 'Плановые работы' : 'Rejali ishlar');
    if (preview.completed_work_orders.length === 0) text(isRu ? 'За выбранный период плановых работ нет.' : 'Tanlangan davrda rejali ishlar yo‘q.');
    for (const item of preview.completed_work_orders) {
      text(`• ${item.number ? `${item.number} · ` : ''}${item.title} · ${new Date(item.completed_at).toLocaleDateString(isRu ? 'ru-RU' : 'uz-UZ')}`, 9);
    }
  }

  ensureSpace(12);
  y += 5;
  pdf.setDrawColor(214, 211, 209);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 3;
  text(`${isRu ? 'Сформировано в Kamizo' : 'Kamizo’da shakllantirildi'}: ${new Date().toLocaleString(isRu ? 'ru-RU' : 'uz-UZ')}`, 7.5);

  const typePart = options.type === 'financial' ? 'financial' : 'completed-works';
  return {
    blob: pdf.output('blob'),
    filename: `${typePart}_${safeFilenamePart(options.buildingName)}_${safeFilenamePart(options.periodLabel)}.pdf`,
  };
}
