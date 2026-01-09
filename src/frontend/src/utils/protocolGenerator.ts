import PizZip from 'pizzip';
import QRCode from 'qrcode';

interface VoteResult {
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  percentFor: number;
  percentAgainst: number;
  percentAbstain: number;
}

interface AgendaItem {
  id: string;
  item_order: number;
  title: string;
  description?: string;
  votes_for_area: number;
  votes_against_area: number;
  votes_abstain_area: number;
  decision?: 'approved' | 'rejected' | 'no_quorum';
}

interface VoteRecord {
  voter_id: string;
  voter_name: string;
  apartment_number: string;
  vote_weight: number;
  voted_at: string;
  choice?: 'for' | 'against' | 'abstain';
  qr_code?: string; // QR code for signature
  comment?: string; // Комментарий/обоснование голоса
}

interface Meeting {
  id: string;
  number: number;
  building_id: string;
  buildingAddress?: string;
  building_address?: string;
  description?: string;
  format: 'online' | 'offline' | 'hybrid';
  status: string;
  confirmed_date_time?: string;
  location?: string;
  total_area: number;
  voted_area: number;
  total_eligible_count: number;
  participated_count: number;
  quorum_percent: number;
  participation_percent: number;
  quorum_reached: number;
  voting_opened_at?: string;
  voting_closed_at?: string;
  organizer_name?: string;
}

interface ProtocolData {
  meeting: Meeting;
  agendaItems: AgendaItem[];
  voteRecords: VoteRecord[];
  votesByItem: Record<string, VoteRecord[]>;
  protocolHash?: string;
}

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

// Cross-browser file download
function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  if (isIOS || isSafari) {
    const newWindow = window.open(url, '_blank');
    if (!newWindow) {
      window.location.href = url;
    }
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } else {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }
}

const MONTHS_RU: Record<number, string> = {
  0: 'января', 1: 'февраля', 2: 'марта', 3: 'апреля', 4: 'мая', 5: 'июня',
  6: 'июля', 7: 'августа', 8: 'сентября', 9: 'октября', 10: 'ноября', 11: 'декабря'
};

function formatDateRu(dateStr: string | undefined): string {
  if (!dateStr) return '___';
  const date = new Date(dateStr);
  return `${date.getDate()} ${MONTHS_RU[date.getMonth()]} ${date.getFullYear()}`;
}

function formatTimeRu(dateStr: string | undefined): string {
  if (!dateStr) return '___';
  const date = new Date(dateStr);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Calculate vote result for an agenda item
function calculateVoteResult(item: AgendaItem, _totalArea: number): VoteResult {
  const votedArea = item.votes_for_area + item.votes_against_area + item.votes_abstain_area;
  return {
    votesFor: item.votes_for_area,
    votesAgainst: item.votes_against_area,
    votesAbstain: item.votes_abstain_area,
    percentFor: votedArea > 0 ? (item.votes_for_area / votedArea) * 100 : 0,
    percentAgainst: votedArea > 0 ? (item.votes_against_area / votedArea) * 100 : 0,
    percentAbstain: votedArea > 0 ? (item.votes_abstain_area / votedArea) * 100 : 0,
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

// Generate UK company QR code
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
    width: 150,
    margin: 1,
    color: { dark: '#1f2937', light: '#ffffff' },
  });
}

// Generate voter signature QR code
async function generateVoterQRCode(voter: VoteRecord, meetingNumber: number, buildingAddress: string): Promise<string> {
  const voterData = [
    `ЭЛЕКТРОННАЯ ПОДПИСЬ`,
    `Протокол: ${meetingNumber}`,
    `ФИО: ${voter.voter_name}`,
    `Квартира: ${voter.apartment_number || '-'}`,
    `Площадь: ${voter.vote_weight?.toFixed(2) || '-'} кв.м`,
    `Голос: ${voter.choice === 'for' ? 'ЗА' : voter.choice === 'against' ? 'ПРОТИВ' : 'ВОЗДЕРЖАЛСЯ'}`,
    `Дата: ${new Date(voter.voted_at).toLocaleString('ru-RU')}`,
    `Адрес: ${buildingAddress}`,
  ].join('\n');

  return await QRCode.toDataURL(voterData, {
    width: 80,
    margin: 1,
    color: { dark: '#1f2937', light: '#ffffff' },
  });
}

// Generate a table row XML for voting results
function generateVotingTableXml(result: VoteResult): string {
  return `
<w:tbl>
  <w:tblPr>
    <w:tblW w:w="9000" w:type="dxa"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="4" w:color="000000"/>
      <w:left w:val="single" w:sz="4" w:color="000000"/>
      <w:bottom w:val="single" w:sz="4" w:color="000000"/>
      <w:right w:val="single" w:sz="4" w:color="000000"/>
      <w:insideH w:val="single" w:sz="4" w:color="000000"/>
      <w:insideV w:val="single" w:sz="4" w:color="000000"/>
    </w:tblBorders>
    <w:jc w:val="center"/>
  </w:tblPr>
  <w:tblGrid>
    <w:gridCol w:w="3000"/>
    <w:gridCol w:w="3000"/>
    <w:gridCol w:w="3000"/>
  </w:tblGrid>
  <w:tr>
    <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/><w:shd w:val="clear" w:fill="E7E6E6"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="20"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="20"/></w:rPr><w:t>ЗА</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/><w:shd w:val="clear" w:fill="E7E6E6"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="20"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="20"/></w:rPr><w:t>ПРОТИВ</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/><w:shd w:val="clear" w:fill="E7E6E6"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="20"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="20"/></w:rPr><w:t>ВОЗДЕРЖАЛИСЬ</w:t></w:r></w:p>
    </w:tc>
  </w:tr>
  <w:tr>
    <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="20"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t>${result.votesFor.toFixed(2)} кв.м</w:t></w:r></w:p>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="20"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t>(${result.percentFor.toFixed(1)}%)</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="20"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t>${result.votesAgainst.toFixed(2)} кв.м</w:t></w:r></w:p>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="20"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t>(${result.percentAgainst.toFixed(1)}%)</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="20"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t>${result.votesAbstain.toFixed(2)} кв.м</w:t></w:r></w:p>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="20"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t>(${result.percentAbstain.toFixed(1)}%)</w:t></w:r></w:p>
    </w:tc>
  </w:tr>
</w:tbl>`;
}

// Generate voter list table for appendix with QR signatures
function generateVoterListTableXml(voteRecords: VoteRecord[], voterImageIds: Map<string, string>): string {
  let tableXml = `
<w:tbl>
  <w:tblPr>
    <w:tblW w:w="9500" w:type="dxa"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="4" w:color="000000"/>
      <w:left w:val="single" w:sz="4" w:color="000000"/>
      <w:bottom w:val="single" w:sz="4" w:color="000000"/>
      <w:right w:val="single" w:sz="4" w:color="000000"/>
      <w:insideH w:val="single" w:sz="4" w:color="000000"/>
      <w:insideV w:val="single" w:sz="4" w:color="000000"/>
    </w:tblBorders>
  </w:tblPr>
  <w:tblGrid>
    <w:gridCol w:w="500"/>
    <w:gridCol w:w="2800"/>
    <w:gridCol w:w="800"/>
    <w:gridCol w:w="1200"/>
    <w:gridCol w:w="1400"/>
    <w:gridCol w:w="1400"/>
    <w:gridCol w:w="1400"/>
  </w:tblGrid>
  <w:tr>
    <w:tc><w:tcPr><w:tcW w:w="500" w:type="dxa"/><w:shd w:val="clear" w:fill="E7E6E6"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>№</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="2800" w:type="dxa"/><w:shd w:val="clear" w:fill="E7E6E6"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>ФИО собственника</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="800" w:type="dxa"/><w:shd w:val="clear" w:fill="E7E6E6"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>Кв.</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1200" w:type="dxa"/><w:shd w:val="clear" w:fill="E7E6E6"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>Площадь</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1400" w:type="dxa"/><w:shd w:val="clear" w:fill="E7E6E6"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>Дата</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1400" w:type="dxa"/><w:shd w:val="clear" w:fill="E7E6E6"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>Голос</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1400" w:type="dxa"/><w:shd w:val="clear" w:fill="E7E6E6"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>Э-подпись</w:t></w:r></w:p>
    </w:tc>
  </w:tr>`;

  voteRecords.forEach((record, idx) => {
    const votedDate = new Date(record.voted_at);
    const choiceText = record.choice === 'for' ? 'ЗА' : record.choice === 'against' ? 'ПРОТИВ' : 'ВОЗДЕРЖ.';
    const imageId = voterImageIds.get(record.voter_id);

    // QR code image XML - inline (wp:inline) 1.5cm x 1.5cm = 600000 EMUs for table cell
    const qrImageXml = imageId ? `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="600000" cy="600000"/><wp:docPr id="${1000 + idx}" name="QR Signature ${idx}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="voter_qr_${idx}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${imageId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="600000" cy="600000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>` : '<w:r><w:t>✓</w:t></w:r>';

    tableXml += `
  <w:tr>
    <w:tc><w:tcPr><w:tcW w:w="500" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${idx + 1}</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="2800" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${escapeXml(record.voter_name)}</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="800" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${record.apartment_number || '-'}</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1200" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${record.vote_weight?.toFixed(2) || '-'}</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1400" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${votedDate.toLocaleDateString('ru-RU')}</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1400" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${choiceText}</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1400" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/></w:pPr>${qrImageXml}</w:p>
    </w:tc>
  </w:tr>`;
  });

  tableXml += `</w:tbl>`;
  return tableXml;
}

// Generate votes by item table with optional comments
function generateVotesByItemTableXml(_agendaItem: AgendaItem, votes: VoteRecord[]): string {
  if (!votes || votes.length === 0) {
    return '';
  }

  // Check if any vote has a comment
  const hasComments = votes.some(v => v.comment && v.comment.trim().length > 0);

  let tableXml = `
<w:p><w:pPr><w:spacing w:before="100"/><w:rPr><w:i/><w:sz w:val="18"/></w:rPr></w:pPr>
<w:r><w:rPr><w:i/><w:sz w:val="18"/></w:rPr><w:t>Голоса участников:</w:t></w:r></w:p>
<w:tbl>
  <w:tblPr>
    <w:tblW w:w="${hasComments ? '10500' : '9000'}" w:type="dxa"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="4" w:color="000000"/>
      <w:left w:val="single" w:sz="4" w:color="000000"/>
      <w:bottom w:val="single" w:sz="4" w:color="000000"/>
      <w:right w:val="single" w:sz="4" w:color="000000"/>
      <w:insideH w:val="single" w:sz="4" w:color="000000"/>
      <w:insideV w:val="single" w:sz="4" w:color="000000"/>
    </w:tblBorders>
    <w:jc w:val="center"/>
  </w:tblPr>
  <w:tblGrid>
    <w:gridCol w:w="500"/>
    <w:gridCol w:w="${hasComments ? '2500' : '3500'}"/>
    <w:gridCol w:w="800"/>
    <w:gridCol w:w="1200"/>
    <w:gridCol w:w="1500"/>
    ${hasComments ? '<w:gridCol w:w="4000"/>' : ''}
  </w:tblGrid>
  <w:tr>
    <w:tc><w:tcPr><w:tcW w:w="500" w:type="dxa"/><w:shd w:val="clear" w:fill="E7E6E6"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>№</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="${hasComments ? '2500' : '3500'}" w:type="dxa"/><w:shd w:val="clear" w:fill="E7E6E6"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>ФИО</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="800" w:type="dxa"/><w:shd w:val="clear" w:fill="E7E6E6"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>Кв.</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1200" w:type="dxa"/><w:shd w:val="clear" w:fill="E7E6E6"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>Площадь</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1500" w:type="dxa"/><w:shd w:val="clear" w:fill="E7E6E6"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>Голос</w:t></w:r></w:p>
    </w:tc>
    ${hasComments ? `<w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/><w:shd w:val="clear" w:fill="E7E6E6"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>Обоснование</w:t></w:r></w:p>
    </w:tc>` : ''}
  </w:tr>`;

  votes.forEach((v, idx) => {
    const choiceText = v.choice === 'for' ? 'ЗА' : v.choice === 'against' ? 'ПРОТИВ' : 'ВОЗДЕРЖАЛСЯ';
    const commentText = v.comment?.trim() || '';
    tableXml += `
  <w:tr>
    <w:tc><w:tcPr><w:tcW w:w="500" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${idx + 1}</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="${hasComments ? '2500' : '3500'}" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${escapeXml(v.voter_name)}</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="800" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${v.apartment_number || '-'}</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1200" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${v.vote_weight?.toFixed(2) || '-'}</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1500" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${choiceText}</w:t></w:r></w:p>
    </w:tc>
    ${hasComments ? `<w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:rPr><w:sz w:val="14"/><w:i/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="14"/><w:i/></w:rPr><w:t>${escapeXml(commentText)}</w:t></w:r></w:p>
    </w:tc>` : ''}
  </w:tr>`;
  });

  tableXml += `</w:tbl>`;
  return tableXml;
}

export async function generateProtocolDocx(data: ProtocolData): Promise<void> {
  const { meeting, agendaItems, voteRecords, votesByItem } = data;

  const address = meeting.buildingAddress || meeting.building_address || 'Адрес не указан';
  const meetingDate = formatDateRu(meeting.confirmed_date_time || meeting.voting_opened_at);
  const meetingTime = formatTimeRu(meeting.confirmed_date_time || meeting.voting_opened_at);
  const location = meeting.location || address;
  const format = meeting.format === 'online' ? 'заочной' : meeting.format === 'hybrid' ? 'очно-заочной' : 'очной';

  // Generate UK company QR code
  const ukQrCodeDataUrl = await generateUKQRCode();

  // Generate QR codes for each voter
  const voterQRCodes = new Map<string, string>();
  const voterImageIds = new Map<string, string>();

  for (let i = 0; i < voteRecords.length; i++) {
    const voter = voteRecords[i];
    const qrCode = await generateVoterQRCode(voter, meeting.number, address);
    voterQRCodes.set(voter.voter_id, qrCode);
    voterImageIds.set(voter.voter_id, `rId${200 + i}`);
  }

  // Generate agenda items content
  let agendaItemsXml = '';

  // First question is always election of chairman and secretary
  agendaItemsXml += `
<w:p><w:pPr><w:spacing w:before="200" w:after="100"/><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:pPr>
<w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>1. Избрание Председателя и Секретаря собрания</w:t></w:r></w:p>
<w:p><w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
<w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>СЛУШАЛИ: Предложение об избрании Председателя и Секретаря собрания из числа присутствующих собственников помещений.</w:t></w:r></w:p>
<w:p><w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
<w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>ПРЕДЛОЖЕНО: Избрать Председателем собрания представителя УК, Секретарём - ${meeting.organizer_name || 'представителя УК'}.</w:t></w:r></w:p>
<w:p><w:pPr><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:pPr>
<w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>ГОЛОСОВАЛИ:</w:t></w:r></w:p>
${generateVotingTableXml({
  votesFor: meeting.voted_area,
  votesAgainst: 0,
  votesAbstain: 0,
  percentFor: 100,
  percentAgainst: 0,
  percentAbstain: 0,
})}
<w:p><w:pPr><w:spacing w:before="100"/><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:pPr>
<w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>РЕШЕНИЕ: Избрать Председателя и Секретаря собрания. Решение принято.</w:t></w:r></w:p>
`;

  // Add actual agenda items
  agendaItems.forEach((item, idx) => {
    const result = calculateVoteResult(item, meeting.total_area);
    const itemNumber = idx + 2; // +2 because first is election of chairman
    const isApproved = result.percentFor > 50;
    const itemVotes = votesByItem[item.id] || [];

    agendaItemsXml += `
<w:p><w:pPr><w:spacing w:before="300" w:after="100"/><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:pPr>
<w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>${itemNumber}. ${escapeXml(item.title)}</w:t></w:r></w:p>
${item.description ? `<w:p><w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
<w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>СЛУШАЛИ: ${escapeXml(item.description)}</w:t></w:r></w:p>` : ''}
<w:p><w:pPr><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:pPr>
<w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>ГОЛОСОВАЛИ:</w:t></w:r></w:p>
${generateVotingTableXml(result)}
${generateVotesByItemTableXml(item, itemVotes)}
<w:p><w:pPr><w:spacing w:before="100"/><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:pPr>
<w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>РЕШЕНИЕ: ${isApproved ? 'Решение принято.' : 'Решение не принято.'}</w:t></w:r></w:p>
`;
  });

  // UK QR code image XML for signatures section
  const ukQrImageXml = `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="900000" cy="900000"/><wp:docPr id="999" name="UK QR Code"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="uk_qr.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId100" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="900000" cy="900000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;

  // Build the complete document.xml content
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    <!-- Header -->
    <w:p><w:pPr><w:jc w:val="right"/><w:rPr><w:i/><w:sz w:val="20"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:i/><w:sz w:val="20"/></w:rPr><w:t>Закон РУз «Об управлении многоквартирными домами»</w:t></w:r></w:p>

    <!-- Title -->
    <w:p><w:pPr><w:spacing w:before="400" w:after="200"/><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>ПРОТОКОЛ № ${meeting.number}/${new Date().getFullYear()}</w:t></w:r></w:p>

    <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>общего собрания собственников помещений</w:t></w:r></w:p>

    <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>многоквартирного дома по адресу:</w:t></w:r></w:p>

    <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>${escapeXml(address)}</w:t></w:r></w:p>

    <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>проведённого в форме ${format} голосования</w:t></w:r></w:p>

    <!-- Meeting Info -->
    <w:p><w:pPr><w:spacing w:before="200"/><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>Дата проведения: </w:t></w:r>
    <w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>${meetingDate}</w:t></w:r></w:p>

    <w:p><w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>Время: </w:t></w:r>
    <w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>${meetingTime}</w:t></w:r></w:p>

    <w:p><w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>Место проведения: </w:t></w:r>
    <w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>${escapeXml(location)}</w:t></w:r></w:p>

    <!-- Quorum Info -->
    <w:p><w:pPr><w:spacing w:before="200"/><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>КВОРУМ:</w:t></w:r></w:p>

    <w:p><w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>Общая площадь помещений в доме: ${meeting.total_area.toFixed(2)} кв.м</w:t></w:r></w:p>

    <w:p><w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>Площадь помещений проголосовавших собственников: ${meeting.voted_area.toFixed(2)} кв.м</w:t></w:r></w:p>

    <w:p><w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>Процент участия: ${meeting.participation_percent.toFixed(1)}%</w:t></w:r></w:p>

    <w:p><w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>Количество проголосовавших: ${meeting.participated_count} из ${meeting.total_eligible_count} собственников</w:t></w:r></w:p>

    <w:p><w:pPr><w:rPr><w:b/><w:sz w:val="22"/><w:color w:val="${meeting.quorum_reached ? '008000' : 'FF0000'}"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="22"/><w:color w:val="${meeting.quorum_reached ? '008000' : 'FF0000'}"/></w:rPr><w:t>Кворум ${meeting.quorum_reached ? 'ИМЕЕТСЯ' : 'ОТСУТСТВУЕТ'} (требуется ${meeting.quorum_percent}%)</w:t></w:r></w:p>

    <!-- Agenda -->
    <w:p><w:pPr><w:spacing w:before="300" w:after="100"/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>ПОВЕСТКА ДНЯ:</w:t></w:r></w:p>

    <w:p><w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>1. Избрание Председателя и Секретаря собрания</w:t></w:r></w:p>
    ${agendaItems.map((item, idx) => `
    <w:p><w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>${idx + 2}. ${escapeXml(item.title)}</w:t></w:r></w:p>`).join('')}

    <!-- Agenda Items Content -->
    ${agendaItemsXml}

    <!-- UK QR Code Signature -->
    <w:p><w:pPr><w:spacing w:before="400"/><w:jc w:val="center"/></w:pPr>${ukQrImageXml}</w:p>
    <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="20"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="20"/></w:rPr><w:t>Управляющая компания</w:t></w:r></w:p>
    <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="18"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>${UK_COMPANY.name}</w:t></w:r></w:p>

    <!-- Appendix - Page Break -->
    <w:p><w:r><w:br w:type="page"/></w:r></w:p>

    <!-- Appendix Header -->
    <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>ПРИЛОЖЕНИЕ № 1</w:t></w:r></w:p>

    <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>к Протоколу № ${meeting.number}/${new Date().getFullYear()}</w:t></w:r></w:p>

    <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>РЕЕСТР УЧАСТНИКОВ ГОЛОСОВАНИЯ С ЭЛЕКТРОННЫМИ ПОДПИСЯМИ</w:t></w:r></w:p>

    <w:p><w:pPr><w:spacing w:before="200"/></w:pPr></w:p>

    ${generateVoterListTableXml(voteRecords, voterImageIds)}

    <!-- Footer -->
    <w:p><w:pPr><w:spacing w:before="300"/><w:rPr><w:i/><w:sz w:val="18"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:i/><w:sz w:val="18"/></w:rPr><w:t>Протокол сформирован автоматически системой УК «KAMIZO»</w:t></w:r></w:p>

    <w:p><w:pPr><w:rPr><w:i/><w:sz w:val="18"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:i/><w:sz w:val="18"/></w:rPr><w:t>Дата формирования: ${new Date().toLocaleString('ru-RU')}</w:t></w:r></w:p>

    ${data.protocolHash ? `<w:p><w:pPr><w:rPr><w:i/><w:sz w:val="18"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:i/><w:sz w:val="18"/></w:rPr><w:t>Хеш документа: ${data.protocolHash}</w:t></w:r></w:p>` : ''}

    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1701"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  // Create minimal DOCX structure
  const zip = new PizZip();

  // Add UK QR code image
  const ukImageBytes = dataUrlToUint8Array(ukQrCodeDataUrl);
  zip.file('word/media/uk_qr.png', ukImageBytes);

  // Add voter QR code images
  for (const [voterId, qrCode] of voterQRCodes) {
    const imageBytes = dataUrlToUint8Array(qrCode);
    const idx = voteRecords.findIndex(v => v.voter_id === voterId);
    zip.file(`word/media/voter_qr_${idx}.png`, imageBytes);
  }

  // Build relationships for all images
  let relsContent = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId100" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/uk_qr.png"/>`;

  for (let i = 0; i < voteRecords.length; i++) {
    relsContent += `
  <Relationship Id="rId${200 + i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/voter_qr_${i}.png"/>`;
  }
  relsContent += `
</Relationships>`;

  // Add required files
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

  zip.file('word/_rels/document.xml.rels', relsContent);
  zip.file('word/document.xml', documentXml);

  // Generate blob
  const blob = zip.generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

  // Download
  const fileName = `Протокол_${meeting.number}_${address.replace(/[^a-zA-Zа-яА-ЯёЁ0-9]/g, '_')}.docx`;
  downloadBlob(blob, fileName);
}
