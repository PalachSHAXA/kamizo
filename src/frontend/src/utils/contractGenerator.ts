import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import QRCode from 'qrcode';
import type { User } from '../types';

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

// Cross-browser file download that works in Safari iOS
function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);

  // For iOS Safari, we need to open in new tab
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  if (isIOS || isSafari) {
    // For Safari/iOS - open blob URL directly which allows user to save
    const newWindow = window.open(url, '_blank');
    if (!newWindow) {
      // If popup blocked, fallback to direct navigation
      window.location.href = url;
    }
    // Clean up after a delay
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } else {
    // Standard download for other browsers
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Clean up
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }
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
  _language: 'ru' | 'uz' = 'ru'
): Promise<void> {
  // Get fixed contract date
  const contractDate = getContractDate(user);

  // Generate UK company QR code
  const ukQrCodeDataUrl = await generateUKQRCode();

  // Fetch the template file
  const response = await fetch(templateUrl);
  const arrayBuffer = await response.arrayBuffer();

  // Load the template with PizZip
  const zip = new PizZip(arrayBuffer);

  // Create docxtemplater instance FIRST to replace text placeholders
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  // Format area (KVM) - square meters from user's totalArea
  const area = user.totalArea || (user as any).total_area;
  const kvm = area && area !== 'undefined' ? String(area) : '_____';

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
    console.log('Signatures section with QR codes added to document');
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
