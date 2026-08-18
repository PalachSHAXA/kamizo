// Акт приёма-передачи многоквартирного дома в управление (раздел «Протоколы»).
//
// Один общий шаблон (гибрид): фиксированная структура + условные абзацы по
// галочкам (парковка / нежилые / чек-лист техдокументации) + свободный текст.
// Два формата из одного HTML:
//   - PDF  — window.open + print (паттерн generateFinanceDocs.ts);
//   - DOCX — тот же HTML как Word-файл (application/msword, .doc), Word его
//            открывает и редактирует/пересохраняет в .docx. Проще и надёжнее
//            ручного OOXML, при этом остаётся редактируемым.
import { saveAs } from 'file-saver';
import type { BuildingAct, TechDocKey } from '../types/acts';

type Lang = 'ru' | 'uz';

const TECH_DOC_LABELS: Record<TechDocKey, { ru: string; uz: string }> = {
  tech_passport: { ru: 'Технический паспорт дома', uz: 'Uy texnik pasporti' },
  floor_plans: { ru: 'Поэтажные планы', uz: 'Qavat rejalari' },
  engineering_schemes: { ru: 'Схемы инженерных сетей (водоснабжение, канализация, электро-, тепло-, газоснабжение)', uz: 'Muhandislik tarmoqlari sxemalari' },
  elevator_passports: { ru: 'Паспорта лифтов', uz: 'Liftlar pasportlari' },
  cadastral: { ru: 'Кадастровые документы', uz: 'Kadastr hujjatlari' },
  keys: { ru: 'Ключи от мест общего пользования (МОП)', uz: 'Umumiy foydalanish joylari kalitlari' },
  equipment: { ru: 'Технические средства и оборудование', uz: 'Texnik vositalar va uskunalar' },
};

const STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Times New Roman', Georgia, serif; font-size: 13px; line-height: 1.55; color: #111; padding: 20mm 18mm; }
  .org { text-align: center; font-weight: 700; font-size: 14px; }
  .brand { text-align: center; font-size: 10px; color: #888; margin-bottom: 18px; }
  h1 { font-size: 17px; text-align: center; margin: 8px 0 4px; text-transform: uppercase; }
  .sub { text-align: center; font-size: 12px; color: #555; margin-bottom: 18px; }
  h2 { font-size: 13px; margin: 14px 0 4px; }
  p { margin-bottom: 8px; text-align: justify; }
  ul { margin: 4px 0 10px 22px; }
  li { margin-bottom: 3px; }
  .cond { }
  .signatures { display: flex; justify-content: space-between; margin-top: 42px; gap: 30px; }
  .signatures div { width: 45%; }
  .sig-line { border-bottom: 1px solid #111; margin: 34px 0 4px; }
  .sig-label { font-size: 11px; color: #555; }
  .footer-legal { margin-top: 26px; padding-top: 10px; border-top: 1px solid #ccc; font-size: 9px; color: #666; line-height: 1.5; }
  @media print { body { padding: 15mm; } @page { size: A4; margin: 15mm; } }
`;

function buildActHtml(act: BuildingAct, tenantName: string, language: Lang): string {
  const t = (ru: string, uz: string) => (language === 'ru' ? ru : uz);
  const esc = (s: unknown) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c));
  const num = (n?: number) => (Number(n) || 0).toLocaleString('ru-RU');
  const s = act.snapshot || {};
  const o = act.options || { has_parking: false, has_nonresidential: false, tech_docs: [] };
  const b = act.basis || {};
  const cells = s.cells || { residential: 0, parking: 0, commercial: 0 };

  const techList = (o.tech_docs || [])
    .map((k) => TECH_DOC_LABELS[k])
    .filter(Boolean)
    .map((l) => `<li>${esc(t(l.ru, l.uz))}</li>`)
    .join('');

  const fundsLine = o.funds_amount && o.funds_amount > 0
    ? `<li>${esc(t('Остаток денежных средств', 'Pul mablag\'lari qoldig\'i'))}: ${num(o.funds_amount)} ${t('сум', 'so\'m')}</li>`
    : '';

  const parkingPara = o.has_parking
    ? `<p class="cond">${esc(t(
        'На придомовой территории расположены парковочные места. Порядок их содержания, эксплуатации и оплаты определяется решением общего собрания собственников.',
        'Uy hududida avtoturargoh joylari mavjud. Ularni saqlash, foydalanish va to\'lov tartibi mulkdorlar umumiy yig\'ilishi qarori bilan belgilanadi.',
      ))}</p>`
    : '';

  const nonResPara = o.has_nonresidential
    ? `<p class="cond">${esc(t(
        'Собственники нежилых (коммерческих) помещений обязаны нести расходы на содержание и текущий ремонт общего имущества многоквартирного дома соразмерно своей доле в праве общей собственности, наравне с собственниками жилых помещений (Закон РУз «Об управлении многоквартирными домами», ЗРУ-581).',
        'Noturar (tijoriy) binolar mulkdorlari umumiy mulkni saqlash xarajatlarini o\'z ulushiga mutanosib ravishda, turar joy mulkdorlari bilan teng ko\'tarishlari shart (ORQ-581).',
      ))}</p>`
    : '';

  const freeTextPara = o.free_text && o.free_text.trim()
    ? `<h2>${esc(t('Дополнительные положения', 'Qo\'shimcha qoidalar'))}</h2><p>${esc(o.free_text)}</p>`
    : '';

  const transferor = o.transferor || t('Собственники помещений (уполномоченное лицо)', 'Bino mulkdorlari (vakolatli shaxs)');
  const receiverSig = o.receiver_signatory || t('Председатель совета дома', 'Uy kengashi raisi');

  return `<!DOCTYPE html><html lang="${language}"><head><meta charset="UTF-8">
<title>${esc(t('Акт приёма-передачи', 'Qabul-topshirish dalolatnomasi'))}</title>
<style>${STYLES}</style></head><body>
  <div class="org">${esc(tenantName)}</div>
  <div class="brand">Kamizo · ${esc(t('Управление домом', 'Uy boshqaruvi'))}</div>
  <h1>${esc(t('Акт приёма-передачи многоквартирного дома в управление', 'Ko\'p kvartirali uyni boshqaruvga qabul-topshirish dalolatnomasi'))}</h1>
  <div class="sub">${act.act_number ? `№ ${esc(act.act_number)} ` : ''}${act.act_date ? t('от', '') + ' ' + esc(act.act_date) : ''}</div>

  <h2>${esc(t('Основание', 'Asos'))}</h2>
  <p>
    ${b.meeting_decision_no || b.meeting_decision_date ? esc(t('Решение общего собрания собственников', 'Mulkdorlar umumiy yig\'ilishi qarori')) + ` ${b.meeting_decision_no ? '№ ' + esc(b.meeting_decision_no) : ''} ${b.meeting_decision_date ? t('от', '') + ' ' + esc(b.meeting_decision_date) : ''}; ` : ''}
    ${b.contract_no || b.contract_date ? esc(t('Договор управления', 'Boshqaruv shartnomasi')) + ` ${b.contract_no ? '№ ' + esc(b.contract_no) : ''} ${b.contract_date ? t('от', '') + ' ' + esc(b.contract_date) : ''}; ` : ''}
    ${esc(t('Закон Республики Узбекистан «Об управлении многоквартирными домами» (ЗРУ-581).', 'O\'zbekiston Respublikasining "Ko\'p kvartirali uylarni boshqarish to\'g\'risida"gi qonuni (ORQ-581).'))}
  </p>

  <h2>${esc(t('Стороны', 'Tomonlar'))}</h2>
  <p>
    ${esc(t('Передающая сторона', 'Topshiruvchi tomon'))}: <strong>${esc(transferor)}</strong>.<br>
    ${esc(t('Принимающая сторона (управляющая организация)', 'Qabul qiluvchi tomon (boshqaruv tashkiloti)'))}: <strong>${esc(tenantName)}</strong>.
  </p>

  <h2>${esc(t('Объект', 'Obyekt'))}</h2>
  <p>
    ${esc(t('Адрес', 'Manzil'))}: ${esc(s.address || s.building_name || '—')}.<br>
    ${esc(t('Общая площадь', 'Umumiy maydon'))}: ${num(s.total_area)} м²; ${esc(t('жилая', 'turar'))}: ${num(s.living_area)} м²; ${esc(t('этажей', 'qavatlar'))}: ${esc(s.floors ?? '—')}; ${esc(t('подъездов', 'kirishlar'))}: ${esc(s.entrances ?? '—')}.<br>
    ${esc(t('Ячейки (помещения)', 'Yacheykalar'))}: ${esc(t('жилых', 'turar'))} — ${num(cells.residential)}, ${esc(t('парковочных', 'avtoturargoh'))} — ${num(cells.parking)}, ${esc(t('нежилых', 'noturar'))} — ${num(cells.commercial)}.
  </p>

  <h2>${esc(t('Передаётся', 'Topshiriladi'))}</h2>
  <ul>${techList}${fundsLine || (techList ? '' : `<li>${esc(t('— не указано —', '— ko\'rsatilmagan —'))}</li>`)}</ul>

  ${parkingPara}
  ${nonResPara}
  ${freeTextPara}

  <div class="signatures">
    <div>
      <div class="sig-line"></div>
      <div class="sig-label">${esc(t('Передал', 'Topshirdi'))}: ${esc(receiverSig)}</div>
    </div>
    <div>
      <div class="sig-line"></div>
      <div class="sig-label">${esc(t('Принял', 'Qabul qildi'))}: ${esc(t('Директор', 'Direktor'))} ${esc(tenantName)}</div>
    </div>
  </div>

  <div class="footer-legal">
    ${esc(t(
      'Акт составлен в соответствии с Законом Республики Узбекистан «Об управлении многоквартирными домами» (ЗРУ-581), приказом Министерства юстиции №3501, постановлениями Кабинета Министров №930 и №5152. Сформирован автоматически системой Kamizo.',
      'Dalolatnoma O\'zR "Ko\'p kvartirali uylarni boshqarish to\'g\'risida"gi qonuni (ORQ-581), Adliya vazirligi buyrug\'i №3501, VM qarorlari №930 va №5152 asosida tuzilgan. Kamizo tizimi tomonidan yaratilgan.',
    ))}
  </div>
</body></html>`;
}

export function generateHandoverActPdf(act: BuildingAct, tenantName: string, language: Lang): void {
  const html = buildActHtml(act, tenantName, language);
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 500);
}

export function generateHandoverActDoc(act: BuildingAct, tenantName: string, language: Lang): void {
  const html = buildActHtml(act, tenantName, language);
  const blob = new Blob(['﻿', html], { type: 'application/msword' });
  const name = `act_${act.act_number || act.id}.doc`;
  saveAs(blob, name);
}
