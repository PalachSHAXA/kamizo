import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import QRCode from 'qrcode';
import type { User } from '../types';
import { API_URL } from '../services/api/client';
// v130 — use the shared cross-platform download helper. The previous
// inline downloadBlob() handled iOS Safari (PWA) but not Capacitor iOS
// (WKWebView), so contracts generated inside the iOS native app went
// nowhere visible. downloadFile.ts routes Capacitor → @capacitor/filesystem
// → Documents/ (Files app exposes it), Android → same, PWA → anchor or
// open-in-new-tab for iOS Safari. Single helper, every platform handled.
import { downloadBlob as saveBlob } from './downloadFile';

// Import the template as a URL
import templateUrl from '../assets/dogovor.docx?url';

// UK Company details for QR code
const UK_COMPANY = {
  name: 'OOO KAMIZO',
  address: 'г. Ташкент, Яшнобадский район, ул. Махтумкули, дом 93/3',
  bank: '«Ориент Финанс» ЧАКБ Миробад филиал',
  account: '20208000805307918001',
  inn: '307928888',
  oked: '81100',
  mfo: '01071',
};

// v130 — thin wrapper around the shared helper so existing call sites
// in this file keep their old signature (blob, fileName) without
// passing an options object. Toast is suppressed because contract
// generation may bundle the .docx alongside other artifacts and the
// caller surfaces its own status messaging.
async function downloadBlob(blob: Blob, fileName: string): Promise<void> {
  await saveBlob(blob, { filename: fileName, silent: true });
}

const MONTHS_RU: Record<number, string> = {
  0: 'января', 1: 'февраля', 2: 'марта', 3: 'апреля', 4: 'мая', 5: 'июня',
  6: 'июля', 7: 'августа', 8: 'сентября', 9: 'октября', 10: 'ноября', 11: 'декабря'
};

// Get contract date - use user's contractSignedAt or createdAt, NOT current date
function getContractDate(user: User): { day: string; month: string; year: string } {
  const dateStr = user.contractSignedAt || user.createdAt;
  const date = dateStr ? new Date(dateStr) : new Date();

  return {
    day: date.getDate().toString().padStart(2, '0'),
    month: MONTHS_RU[date.getMonth()],
    year: date.getFullYear().toString(),
  };
}

// Convert base64 data URL to binary array
function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1];
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Generate unique ID for DOCX relationships - use numbers to avoid conflicts
let docxIdCounter = 100;
function generateDocxId(): string {
  return String(docxIdCounter++);
}

// Generate QR code for UK company
async function generateUKQRCode(): Promise<string> {
  const ukData = [
    `Компания: ${UK_COMPANY.name}`,
    `Адрес: ${UK_COMPANY.address}`,
    `Банк: ${UK_COMPANY.bank}`,
    `Р/С: ${UK_COMPANY.account}`,
    `ИНН: ${UK_COMPANY.inn}`,
    `ОКЭД: ${UK_COMPANY.oked}`,
    `МФО: ${UK_COMPANY.mfo}`,
  ].join('\n');

  return await QRCode.toDataURL(ukData, {
    width: 200,
    margin: 2,
    color: { dark: '#1f2937', light: '#ffffff' },
  });
}

export async function generateContractDocx(
  user: User,
  residentQrCodeDataUrl: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _language: 'ru' | 'uz' = 'ru'
): Promise<void> {
  // Get fixed contract date
  const contractDate = getContractDate(user);

  // Generate UK company QR code
  const ukQrCodeDataUrl = await generateUKQRCode();

  // Fetch the template: try tenant's custom template first, fallback to default.
  // Use the absolute API_URL — relative '/api/...' would resolve to
  // capacitor://localhost / https://localhost in the native shell.
  let arrayBuffer: ArrayBuffer;
  try {
    const token = localStorage.getItem('auth_token');
    const customResponse = await fetch(`${API_URL}/api/contract/template`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    });
    if (customResponse.ok) {
      arrayBuffer = await customResponse.arrayBuffer();
    } else {
      throw new Error('No custom template');
    }
  } catch {
    const response = await fetch(templateUrl);
    arrayBuffer = await response.arrayBuffer();
  }

  // Load the template with PizZip
  const zip = new PizZip(arrayBuffer);

  // Create docxtemplater instance FIRST to replace text placeholders
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  // Format area (KVM) - square meters from user's totalArea
  const area = user.totalArea || (user as unknown as Record<string, unknown>).total_area;
  const kvm = (area != null && area !== '' && area !== 'undefined') ? String(area) : '_____';

  // Build full address
  const safeAddress = user.address && user.address !== 'undefined' ? user.address : '';
  const safeBuilding = user.building && user.building !== 'undefined' ? user.building : '';
  const safeApartment = user.apartment && user.apartment !== 'undefined' ? user.apartment : '';

  let fullAddress = safeAddress;
  if (safeBuilding && !fullAddress.includes(safeBuilding)) {
    fullAddress += fullAddress ? `, д. ${safeBuilding}` : `д. ${safeBuilding}`;
  }
  if (safeApartment && !fullAddress.includes(safeApartment)) {
    fullAddress += fullAddress ? `, кв. ${safeApartment}` : `кв. ${safeApartment}`;
  }

  const safeName = user.name && user.name !== 'undefined' ? user.name : '_____';
  const safePhone = user.phone && user.phone !== 'undefined' ? user.phone : '_____';

  // Render text placeholders
  doc.render({
    DAY: contractDate.day,
    month: contractDate.month,
    mont: contractDate.month,
    Year: contractDate.year,
    NAME: safeName,
    ADRESS: fullAddress || '_____',
    DOM: safeBuilding || '_____',
    KVARTIRA: safeApartment || '_____',
    KVM: kvm,
    PHONE: safePhone,
  });

  // Get the rendered ZIP from docxtemplater
  const renderedZip = doc.getZip();

  // Add both QR code images
  const ukImageId = 'rId' + generateDocxId();
  const residentImageId = 'rId' + generateDocxId();
  const ukImageName = 'qrcode_uk.png';
  const residentImageName = 'qrcode_resident.png';

  // Add UK QR code image
  if (ukQrCodeDataUrl) {
    const ukImageBytes = dataUrlToUint8Array(ukQrCodeDataUrl);
    renderedZip.file(`word/media/${ukImageName}`, ukImageBytes);
  }

  // Add Resident QR code image
  if (residentQrCodeDataUrl && residentQrCodeDataUrl.startsWith('data:image')) {
    const residentImageBytes = dataUrlToUint8Array(residentQrCodeDataUrl);
    renderedZip.file(`word/media/${residentImageName}`, residentImageBytes);
  }

  // Update [Content_Types].xml
  const contentTypesFile = renderedZip.file('[Content_Types].xml');
  if (contentTypesFile) {
    let contentTypes = contentTypesFile.asText();
    if (!contentTypes.includes('image/png')) {
      contentTypes = contentTypes.replace(
        '</Types>',
        '<Default Extension="png" ContentType="image/png"/></Types>'
      );
      renderedZip.file('[Content_Types].xml', contentTypes);
    }
  }

  // Update word/_rels/document.xml.rels - add both relationships
  const relsFile = renderedZip.file('word/_rels/document.xml.rels');
  if (relsFile) {
    let rels = relsFile.asText();
    const ukRel = `<Relationship Id="${ukImageId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${ukImageName}"/>`;
    const residentRel = `<Relationship Id="${residentImageId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${residentImageName}"/>`;
    rels = rels.replace('</Relationships>', ukRel + residentRel + '</Relationships>');
    renderedZip.file('word/_rels/document.xml.rels', rels);
  }

  // Add signature section with two QR codes to document.xml
  const documentXml = renderedZip.file('word/document.xml');
  if (documentXml) {
    let content = documentXml.asText();

    // QR code image XML helper - 1.3cm x 1.3cm = ~495300 EMUs
    const createQrImageXml = (imageId: string, imageName: string, docPrId: number) =>
      `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="495300" cy="495300"/><wp:docPr id="${docPrId}" name="QR Code"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="${imageName}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${imageId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="495300" cy="495300"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;

    const ukQrXml = createQrImageXml(ukImageId, ukImageName, 998);
    const residentQrXml = createQrImageXml(residentImageId, residentImageName, 999);

    // Compact layout for landscape half-page
    // Font 15 half-points = 7.5pt, more readable with separate lines
    const signaturesSection = `
<w:p><w:pPr><w:spacing w:before="80"/><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="16"/><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="16"/><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr><w:t>РЕКВИЗИТЫ И ПОДПИСИ СТОРОН</w:t></w:r></w:p>
<w:tbl>
  <w:tblPr><w:tblW w:w="7200" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders><w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tblBorders></w:tblPr>
  <w:tblGrid><w:gridCol w:w="3600"/><w:gridCol w:w="3600"/></w:tblGrid>
  <w:tr>
    <w:tc>
      <w:tcPr><w:tcW w:w="3600" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr>
      <w:p><w:pPr><w:spacing w:after="0" w:line="200" w:lineRule="exact"/><w:rPr><w:sz w:val="15"/><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="15"/><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr><w:t>УК: ${UK_COMPANY.name}</w:t></w:r></w:p>
      <w:p><w:pPr><w:spacing w:after="0" w:line="200" w:lineRule="exact"/><w:rPr><w:sz w:val="15"/><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr></w:pPr><w:r><w:rPr><w:sz w:val="15"/><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr><w:t>${UK_COMPANY.address}</w:t></w:r></w:p>
      <w:p><w:pPr><w:spacing w:after="0" w:line="200" w:lineRule="exact"/><w:rPr><w:sz w:val="15"/><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr></w:pPr><w:r><w:rPr><w:sz w:val="15"/><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr><w:t>Банк: ${UK_COMPANY.bank}</w:t></w:r></w:p>
      <w:p><w:pPr><w:spacing w:after="0" w:line="200" w:lineRule="exact"/><w:rPr><w:sz w:val="15"/><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr></w:pPr><w:r><w:rPr><w:sz w:val="15"/><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr><w:t>Р/С: ${UK_COMPANY.account}</w:t></w:r></w:p>
      <w:p><w:pPr><w:spacing w:after="0" w:line="200" w:lineRule="exact"/><w:rPr><w:sz w:val="15"/><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr></w:pPr><w:r><w:rPr><w:sz w:val="15"/><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr><w:t>ИНН: ${UK_COMPANY.inn} МФО: ${UK_COMPANY.mfo}</w:t></w:r></w:p>
      <w:p><w:pPr><w:spacing w:before="40"/><w:jc w:val="center"/></w:pPr>${ukQrXml}</w:p>
    </w:tc>
    <w:tc>
      <w:tcPr><w:tcW w:w="3600" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr>
      <w:p><w:pPr><w:spacing w:after="0" w:line="200" w:lineRule="exact"/><w:rPr><w:sz w:val="15"/><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="15"/><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr><w:t>СОБСТВЕННИК:</w:t></w:r></w:p>
      <w:p><w:pPr><w:spacing w:after="0" w:line="200" w:lineRule="exact"/><w:rPr><w:sz w:val="15"/><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr></w:pPr><w:r><w:rPr><w:sz w:val="15"/><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr><w:t>${safeName}</w:t></w:r></w:p>
      <w:p><w:pPr><w:spacing w:after="0" w:line="200" w:lineRule="exact"/><w:rPr><w:sz w:val="15"/><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr></w:pPr><w:r><w:rPr><w:sz w:val="15"/><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr><w:t>Адрес: ${fullAddress || '_____'}</w:t></w:r></w:p>
      <w:p><w:pPr><w:spacing w:after="0" w:line="200" w:lineRule="exact"/><w:rPr><w:sz w:val="15"/><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr></w:pPr><w:r><w:rPr><w:sz w:val="15"/><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr><w:t>Тел: ${safePhone}</w:t></w:r></w:p>
      <w:p><w:pPr><w:spacing w:after="0" w:line="200" w:lineRule="exact"/><w:rPr><w:sz w:val="15"/><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr></w:pPr><w:r><w:rPr><w:sz w:val="15"/><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr><w:t>Л/С: ${user.login || '_____'}</w:t></w:r></w:p>
      <w:p><w:pPr><w:spacing w:before="40"/><w:jc w:val="center"/></w:pPr>${residentQrXml}</w:p>
    </w:tc>
  </w:tr>
</w:tbl>
`;

    // Find the last sectPr (section properties) - signatures should go before it
    const sectPrMatch = content.match(/<w:sectPr[^>]*>[\s\S]*?<\/w:sectPr>/);

    if (sectPrMatch) {
      // Insert before sectPr
      content = content.replace(sectPrMatch[0], signaturesSection + sectPrMatch[0]);
    } else {
      // Insert before </w:body>
      content = content.replace('</w:body>', signaturesSection + '</w:body>');
    }

    renderedZip.file('word/document.xml', content);
  }

  // Generate the output blob from the modified ZIP
  const blob = renderedZip.generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

  // Save the file
  const fileName = `Договор_${user.name?.replace(/\s+/g, '_') || 'resident'}.docx`;
  downloadBlob(blob, fileName);
}

// ─────────────────────────────────────────────────────────────────────────
// PDF generation
//
// The §14-dogovor handoff calls the download button "Скачать PDF". This
// produces a REAL text PDF — selectable text, crisp at any zoom, no
// rasterisation — from the canonical contract data (utils/contractContent
// → getContractContent), drawn via jsPDF's text API.
//
// Cyrillic support: jsPDF's built-in PostScript-14 fonts are WinANSI and
// cannot render Cyrillic. We embed Roboto Regular + Medium TTFs (SIL OFL,
// Cyrillic + Latin support) via addFileToVFS + addFont. The fonts ship
// as plain TTF assets that Vite hashes and serves with long cache
// headers; both jsPDF and the fonts are loaded lazily so a resident who
// never taps download pays nothing on initial load.
//
// Page break safety: each logical block (paragraph, list item, list,
// requisites column) is measured BEFORE drawing, and a new page is
// added when the block won't fit. Section headings carry a "widow
// guard" — they require the heading + at least the next block's first
// line to fit together, otherwise the heading is pushed to the next
// page. No line is ever cut across a page boundary.
// ─────────────────────────────────────────────────────────────────────────

// Vite resolves these to hashed asset URLs at build time. The TTFs are
// transferred only when generateContractPdf is invoked.
import robotoRegularUrl from '../assets/fonts/Roboto-Regular.ttf?url';
import robotoMediumUrl from '../assets/fonts/Roboto-Medium.ttf?url';
import { getContractContent } from './contractContent';
import type { ContractBlock, RequisitesParty } from './contractContent';
import { generateQRCode } from '../components/LazyQRCode';

// ArrayBuffer → base64. Used to feed binary TTF bytes into jsPDF's
// addFileToVFS, which expects a base64 string. We chunk through
// String.fromCharCode in 8 KB windows to avoid stack overflow on big
// fonts (Roboto Regular is ~500 KB, well past the safe single-call size).
function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
  }
  return btoa(binary);
}

async function fetchTtfBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch font: ${url} (${res.status})`);
  return arrayBufferToBase64(await res.arrayBuffer());
}

/**
 * Generate and download a real text PDF of the resident's contract.
 *
 * @param user      Authenticated resident (parties, address, area, dates).
 * @param language  'ru' (default) | 'uz'.
 * @param fileName  Final download filename, e.g. `Kamizo-dogovor-45.pdf`.
 */
export async function generateContractPdf(
  user: User,
  language: 'ru' | 'uz',
  fileName: string,
): Promise<void> {
  // Lazy-load jsPDF and both Roboto weights in parallel. The fonts
  // dominate the wait (~500 KB raw / ~85 KB gzipped each) but the parallel
  // fetch means total wall-clock is one font round trip, not three.
  const [{ default: jsPDFCtor }, regularB64, mediumB64] = await Promise.all([
    import('jspdf'),
    fetchTtfBase64(robotoRegularUrl),
    fetchTtfBase64(robotoMediumUrl),
  ]);

  const pdf = new jsPDFCtor({ orientation: 'p', unit: 'mm', format: 'a4' });

  // Register both font weights and pick Regular as default.
  pdf.addFileToVFS('Roboto-Regular.ttf', regularB64);
  pdf.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
  pdf.addFileToVFS('Roboto-Medium.ttf', mediumB64);
  pdf.addFont('Roboto-Medium.ttf', 'Roboto', 'bold');
  pdf.setFont('Roboto', 'normal');

  // Page geometry. A4 portrait = 210 × 297 mm; 18 mm margins all round
  // leaves a 174 × 261 mm text column — comfortable for a contract.
  const PAGE_W = pdf.internal.pageSize.getWidth();
  const PAGE_H = pdf.internal.pageSize.getHeight();
  const MARGIN = 18;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  const TOP = MARGIN;
  const BOTTOM = PAGE_H - MARGIN;

  // Type scale (pt). jsPDF's setFontSize takes pt; line gap empirically
  // chosen for readability without crowding.
  const FS_TITLE = 14;     // ДОГОВОР УПРАВЛЕНИЯ
  const FS_HEADING = 11;   // 1. ОБЩИЕ ПОЛОЖЕНИЯ
  const FS_BODY = 10;      // paragraph & list body
  const FS_SMALL = 8.5;    // requisites lines + city/date

  // Line height = font size × 1.35 mm (approx 1.35 × pt → mm conversion);
  // jsPDF uses pt internally; 1pt ≈ 0.3528 mm. Use a unified mm value.
  const lineH = (fs: number) => fs * 0.3528 * 1.35;

  // Block-spacing constants — vertical gap AFTER each kind of block.
  const GAP_AFTER_TITLE = 4;
  const GAP_AFTER_CITYDATE = 5;
  const GAP_AFTER_PREAMBLE = 5;
  const GAP_AFTER_HEADING = 1.5;
  const GAP_AFTER_PARAGRAPH = 1.8;
  const GAP_AFTER_LIST_HEADING = 1;
  const GAP_AFTER_LIST = 2;
  const GAP_BEFORE_SECTION = 3;
  const GAP_BEFORE_REQUISITES = 6;
  const GAP_AFTER_REQ_CAPTION = 2;
  const REQ_GUTTER = 6;       // mm between UK and Собственник columns
  const QR_SIZE_MM = 28;      // requisites QR side length

  let y = TOP;

  /** Add a new page and reset cursor to the top margin. */
  const newPage = () => {
    pdf.addPage();
    y = TOP;
  };

  /** Ensure the next `needed` mm fit on the current page — else page-break. */
  const ensureSpace = (needed: number) => {
    if (y + needed > BOTTOM) newPage();
  };

  // ── drawing primitives ─────────────────────────────────────────────────
  const drawCentred = (text: string, fs: number, weight: 'normal' | 'bold') => {
    pdf.setFont('Roboto', weight);
    pdf.setFontSize(fs);
    pdf.text(text, PAGE_W / 2, y, { align: 'center', baseline: 'top' });
    y += lineH(fs);
  };

  /** Draw a justified-left paragraph that wraps to CONTENT_W. Page-break safe. */
  const drawParagraph = (text: string, fs: number, weight: 'normal' | 'bold', indent = 0) => {
    pdf.setFont('Roboto', weight);
    pdf.setFontSize(fs);
    const wrap = CONTENT_W - indent;
    const lines = pdf.splitTextToSize(text, wrap) as string[];
    const h = lineH(fs);
    for (const line of lines) {
      ensureSpace(h);
      pdf.text(line, MARGIN + indent, y, { baseline: 'top' });
      y += h;
    }
  };

  /** Draw a bulleted item with hanging-indent for wrapped lines. */
  const drawBullet = (text: string, fs: number) => {
    pdf.setFont('Roboto', 'normal');
    pdf.setFontSize(fs);
    const bullet = '•  ';
    const bulletW = pdf.getTextWidth(bullet);
    const wrap = CONTENT_W - bulletW;
    const lines = pdf.splitTextToSize(text, wrap) as string[];
    const h = lineH(fs);
    ensureSpace(h);
    pdf.text(bullet + lines[0], MARGIN, y, { baseline: 'top' });
    y += h;
    for (let i = 1; i < lines.length; i++) {
      ensureSpace(h);
      pdf.text(lines[i], MARGIN + bulletW, y, { baseline: 'top' });
      y += h;
    }
  };

  /** Embed a QR image at (x, y) with size SxS mm. */
  const drawQrAt = (dataUrl: string, x: number, qrY: number, size: number) => {
    pdf.addImage(dataUrl, 'PNG', x, qrY, size, size, undefined, 'FAST');
  };

  // ── 1. Title + city/date ───────────────────────────────────────────────
  const content = getContractContent(user, language);
  for (const line of content.title) drawCentred(line, FS_TITLE, 'bold');
  y += GAP_AFTER_TITLE;
  drawCentred(content.cityDate, FS_SMALL, 'normal');
  y += GAP_AFTER_CITYDATE;

  // ── 2. Preamble ────────────────────────────────────────────────────────
  drawParagraph(content.preamble, FS_BODY, 'normal');
  y += GAP_AFTER_PREAMBLE;

  // ── 3. Numbered sections ───────────────────────────────────────────────
  const drawBlock = (b: ContractBlock) => {
    if (b.kind === 'paragraph') {
      drawParagraph(b.text, FS_BODY, 'normal');
      y += GAP_AFTER_PARAGRAPH;
    } else if (b.kind === 'list-heading') {
      // Widow guard: keep the bold lead-in with at least the first list
      // line. Estimate ~1 line of heading + 1 line of next item.
      ensureSpace(lineH(FS_BODY) * 2);
      drawParagraph(b.text, FS_BODY, 'bold');
      y += GAP_AFTER_LIST_HEADING;
    } else {
      for (const item of b.items) drawBullet(item, FS_BODY);
      y += GAP_AFTER_LIST;
    }
  };

  for (const section of content.sections) {
    y += GAP_BEFORE_SECTION;
    // Section-heading widow guard: heading + at least one body line.
    ensureSpace(lineH(FS_HEADING) + lineH(FS_BODY));
    drawCentred(section.heading, FS_HEADING, 'bold');
    y += GAP_AFTER_HEADING;
    for (const block of section.blocks) drawBlock(block);
  }

  // ── 4. Requisites + QR codes ───────────────────────────────────────────
  // Generate both QR codes in parallel — they aren't user-input dependent
  // beyond the content payload, so we can do this concurrently with the
  // PDF layout that's already complete.
  const qrOpts = { width: 200, margin: 1, errorCorrectionLevel: 'M' as const,
                   color: { dark: '#1f2937', light: '#ffffff' } };
  const [ukQr, ownerQr] = await Promise.all([
    generateQRCode(content.uk.qrPayload, qrOpts),
    generateQRCode(content.owner.qrPayload, qrOpts),
  ]);

  // Compute requisites block height so the whole block stays on one page
  // when possible (a contract's signature requisites should never split).
  const colW = (CONTENT_W - REQ_GUTTER) / 2;
  const drawColumn = (party: RequisitesParty, qr: string, xOffset: number, baseY: number): number => {
    let cy = baseY;
    pdf.setFont('Roboto', 'bold');
    pdf.setFontSize(FS_BODY);
    pdf.text(party.caption, MARGIN + xOffset, cy, { baseline: 'top' });
    cy += lineH(FS_BODY) + GAP_AFTER_REQ_CAPTION;
    pdf.setFont('Roboto', 'normal');
    pdf.setFontSize(FS_SMALL);
    for (const line of party.lines) {
      const wrapped = pdf.splitTextToSize(line, colW) as string[];
      for (const wl of wrapped) {
        pdf.text(wl, MARGIN + xOffset, cy, { baseline: 'top' });
        cy += lineH(FS_SMALL);
      }
    }
    cy += 2;
    drawQrAt(qr, MARGIN + xOffset + (colW - QR_SIZE_MM) / 2, cy, QR_SIZE_MM);
    cy += QR_SIZE_MM;
    return cy;
  };

  // Reserve worst-case height for the heading + a column. If it doesn't
  // fit, page-break first so the signature block opens fresh.
  const estReqHeight =
    lineH(FS_HEADING) + GAP_AFTER_HEADING +
    lineH(FS_BODY) + GAP_AFTER_REQ_CAPTION +
    lineH(FS_SMALL) * 6 + 2 + QR_SIZE_MM + 4;
  y += GAP_BEFORE_REQUISITES;
  ensureSpace(estReqHeight);

  drawCentred(content.requisitesHeading, FS_HEADING, 'bold');
  y += GAP_AFTER_HEADING;

  const colBaseY = y;
  const ukEndY = drawColumn(content.uk, ukQr, 0, colBaseY);
  const ownerEndY = drawColumn(content.owner, ownerQr, colW + REQ_GUTTER, colBaseY);
  y = Math.max(ukEndY, ownerEndY);

  // ── 5. "Подписано электронно" stamp under the owner column ─────────────
  if (content.signed) {
    pdf.setFont('Roboto', 'bold');
    pdf.setFontSize(FS_SMALL);
    pdf.setTextColor(22, 163, 74); // tailwind green-600
    const stampX = MARGIN + colW + REQ_GUTTER + colW / 2;
    pdf.text(content.signedStamp, stampX, y + 2, { align: 'center', baseline: 'top' });
    pdf.setTextColor(0, 0, 0);
  }

  // ── Save ───────────────────────────────────────────────────────────────
  downloadBlob(pdf.output('blob'), fileName);
}
