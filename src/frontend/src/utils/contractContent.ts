// Structured contract content for the resident contract.
//
// The same content is rendered in three places: the in-page accordion on
// ResidentContractPage (condensed 4 sections), the full <ContractPreview>
// component (HTML, with `<strong>`/`<em>` styling), and the new text PDF
// produced by generateContractPdf. To keep the three in sync without
// forcing all callers to share a single visual structure, this module
// exports a typed, role-agnostic data shape that callers render however
// they need (HTML elements, accordion bodies, PDF blocks).
//
// User-bound values (name, address, area, dates) are bound here so
// downstream renderers only need to walk a static block tree. Markup
// like `<strong>` is dropped — the PDF renderer can't honour inline
// HTML, and the few places we want bold (subheadings) get their own
// `list-heading` block kind.

import type { User } from '../types';

const MONTHS_RU = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
] as const;

const MONTHS_UZ = [
  'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
] as const;

function formatLongDate(dateStr: string | undefined, lang: 'ru' | 'uz'): string {
  if (!dateStr) return '___';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '___';
  const day = String(d.getDate()).padStart(2, '0');
  const month = (lang === 'uz' ? MONTHS_UZ : MONTHS_RU)[d.getMonth()];
  return `${day} ${month} ${d.getFullYear()}`;
}

// Coerce a user field that might be undefined / 'undefined' (legacy string
// for unset values from the SQLite layer) into a safe display value.
function safe(v: unknown, fallback = '___'): string {
  if (v === null || v === undefined) return fallback;
  const s = String(v).trim();
  if (!s || s === 'undefined' || s === 'null') return fallback;
  return s;
}

export type ContractBlock =
  | { kind: 'paragraph'; text: string }
  /** Bold one-line lead-in, e.g. "3.1. Управляющая компания обязана:". */
  | { kind: 'list-heading'; text: string }
  /** Bulleted list — each item rendered with "• " prefix in the PDF. */
  | { kind: 'list'; items: string[] };

export interface ContractSection {
  /** Centred bold heading, e.g. "1. ОБЩИЕ ПОЛОЖЕНИЯ". */
  heading: string;
  blocks: ContractBlock[];
}

export interface RequisitesParty {
  /** Bold caption — "УК: ООО «KAMIZO»" / "СОБСТВЕННИК:". */
  caption: string;
  /** Free lines under the caption (address, account, phone, etc.). */
  lines: string[];
  /** Data string encoded into the side QR. Generated separately. */
  qrPayload: string;
}

export interface ContractContent {
  /** Two-line centred title block — "ДОГОВОР УПРАВЛЕНИЯ" / "МНОГОКВАРТИРНЫМ ДОМОМ". */
  title: string[];
  /** Sub-line under the title — "«15 января 2026» г. Ташкент". */
  cityDate: string;
  /** Preamble paragraph identifying the parties. */
  preamble: string;
  sections: ContractSection[];
  /** "РЕКВИЗИТЫ И ПОДПИСИ СТОРОН" block heading. */
  requisitesHeading: string;
  uk: RequisitesParty;
  owner: RequisitesParty;
  /** True when contractSignedAt is set — drives the "Подписано электронно" stamp under the owner card. */
  signed: boolean;
  signedStamp: string;
}

const UK_QR_DATA = `ООО "KAMIZO"
ИНН: 307928888
МФО: 01071
Р/С: 20208000805307918001
Банк: Ориент Финанс ЧАКБ
Адрес: г. Ташкент, Яшнобадский р-н, ул. Махтумкули, 93/3`;

/**
 * Build the structured contract for a given resident + language. Pure
 * function — no React, no DOM, no fetch — so it's safe to call from PDF
 * generation, server-side templates, or unit tests.
 */
export function getContractContent(user: User, lang: 'ru' | 'uz'): ContractContent {
  const name = safe(user.name);
  const phone = safe(user.phone);
  const login = safe(user.login);
  const address = safe(user.address);
  const apartment = safe(user.apartment, '');
  const area = safe(user.totalArea ?? (user as unknown as Record<string, unknown>).total_area);
  const date = formatLongDate(user.contractSignedAt || user.createdAt, lang);

  const fullAddress = apartment ? `${address}, кв. ${apartment}` : address;

  const ownerQrPayload = [
    `Собственник: ${name}`,
    `Адрес: ${fullAddress}`,
    `Тел: ${phone}`,
    `Л/С: ${login}`,
  ].join('\n');

  return {
    title: ['ДОГОВОР УПРАВЛЕНИЯ', 'МНОГОКВАРТИРНЫМ ДОМОМ'],
    cityDate: `«${date}» г. Ташкент`,
    preamble:
      `Собственник жилого помещения ${name} (общая площадь ${area} кв.м.), ` +
      `проживающий(ая) по адресу: ${fullAddress} (далее — Собственник) ` +
      `и УК "KAMIZO" в лице директора DJULIYEV JAXONGIR XABIBULLAYEVICH, ` +
      `действующей на основании Устава, именуемый в дальнейшем Управляющая компания, ` +
      `заключили настоящий договор управления (нежилых) жилых помещений ` +
      `многоквартирном доме о нижеследующем:`,
    sections: [
      {
        heading: '1. ОБЩИЕ ПОЛОЖЕНИЯ',
        blocks: [
          { kind: 'paragraph', text:
            `1.1. Настоящий договор заключен на основании ПРОТОКОЛА Собрания собственников ` +
            `жилых помещений в многоквартирном доме №${apartment || '___'} от «${date}».` },
          { kind: 'paragraph', text:
            '1.2. При выполнении условий настоящего Договора, Стороны руководствуются Конституцией РУз, ' +
            'Гражданским и Жилищным кодексом РУз, Законом Республики Узбекистан "Об управлении ' +
            'многоквартирными домами", Положением о порядке использования нежилых помещений в ' +
            'многоквартирных домах (Приложение №2 к Постановлению КМ РУз от 24.01.2000г №22), ' +
            'Постановления Кабинета Министров РУз. №5 от 04.01.2019г. «О дополнительных мерах по ' +
            'совершенствованию управления жилищно-коммунальной инфраструктурой г. Ташкента», ' +
            'иными положениями действующего законодательства и условиями настоящего договора.' },
        ],
      },
      {
        heading: '2. ПРЕДМЕТ ДОГОВОРА',
        blocks: [
          { kind: 'paragraph', text:
            '2.1. Цель настоящего Договора — обеспечение благоприятных и безопасных условий ' +
            'проживания граждан, сохранение и улучшение технического состояния общего имущества.' },
          { kind: 'paragraph', text:
            '2.2. Управляющая компания обязуется оказывать услуги и выполнять работы по надлежащему ' +
            'управлению, содержанию и ремонту общего имущества в Многоквартирном доме, осуществлять ' +
            'иную направленную на достижение целей управления Многоквартирным домом деятельность. ' +
            'Вопросы оказания дополнительных услуг регулируются отдельным договором.' },
          { kind: 'paragraph', text:
            '2.3. Границей эксплуатационной ответственности между общедомовым оборудованием и квартирой ' +
            'является: на системах горячего и холодного водоснабжения — отсекающая арматура (первый ' +
            'вентиль); на системах канализации — плоскость раструба тройника; по электрооборудованию — ' +
            'отходящий от аппарата защиты провод квартирной электросети; по строительным конструкциям — ' +
            'внутренняя поверхность стен квартиры, оконные заполнения и входная дверь в квартиру.' },
        ],
      },
      {
        heading: '3. ПРАВА И ОБЯЗАННОСТИ СТОРОН',
        blocks: [
          { kind: 'list-heading', text: '3.1. Управляющая компания обязана:' },
          { kind: 'list', items: [
            'Осуществлять управление общим имуществом в соответствии с условиями настоящего Договора и действующим законодательством',
            'Осуществлять начисление Собственникам плату за содержание и ремонт общего имущества',
            'Организовать аварийно-диспетчерское обслуживание Многоквартирного дома, устранять аварии',
            'Информировать Собственников об изменении размера платы за помещение',
            'По требованию Собственников производить сверку платы за содержание и ремонт',
            'Представлять Собственникам ежеквартальный отчет о выполнении Договора',
          ] },
          { kind: 'list-heading', text: '3.2. Управляющая компания вправе:' },
          { kind: 'list', items: [
            'Самостоятельно определять порядок и способ выполнения своих обязательств',
            'Привлекать для выполнения работ сторонние организации',
            'Взыскивать с виновных сумму задолженности и ущерба',
            'Производить осмотры инженерного оборудования',
          ] },
          { kind: 'list-heading', text: '3.3. Собственник обязан:' },
          { kind: 'list', items: [
            'Своевременно и полностью вносить плату за услуги Управляющей компании',
            'Согласовывать намерения о перепланировке помещений',
            'Не производить перенос и замену внутренних инженерных сетей без согласования',
            'Не допускать выполнение работ, приводящих к порче общего имущества',
            'Не создавать повышенный шум с 22:00 до 8:00',
            'Обеспечить доступ представителей Управляющей компании для осмотра',
          ] },
          { kind: 'list-heading', text: '3.4. Собственник имеет право:' },
          { kind: 'list', items: [
            'Осуществлять контроль над выполнением обязательств Управляющей компании',
            'Требовать представления отчета о выполнении услуг',
          ] },
        ],
      },
      {
        heading: '4. РАЗМЕР ПЛАТЫ И ПОРЯДОК ВНЕСЕНИЯ',
        blocks: [
          { kind: 'paragraph', text:
            '4.1. Размер платы за услуги устанавливается пропорционально занимаемому Собственником ' +
            'помещению, согласно ст. 132–134 ЖК РУз.' },
          { kind: 'paragraph', text:
            '4.2. Размер платы Собственника состоит из: стоимости услуг по управлению; стоимости ' +
            'работ по содержанию общего имущества; стоимости работ по текущему ремонту.' },
          { kind: 'paragraph', text:
            '4.3. Плата вносится ежемесячно до 10 (десятого) числа месяца, следующего за расчетным.' },
          { kind: 'paragraph', text:
            '4.4. При просрочке более 3-х месяцев вопрос передается в Третейский или Гражданский Суд. ' +
            'Пени составляют 0,1% за каждый день просрочки, но не более 50% от общей суммы долга.' },
        ],
      },
      {
        heading: '5. ОТВЕТСТВЕННОСТЬ СТОРОН',
        blocks: [
          { kind: 'paragraph', text:
            '5.1. За неисполнение или ненадлежащее исполнение настоящего Договора Стороны несут ' +
            'ответственность в соответствии с действующим законодательством Республики Узбекистан.' },
          { kind: 'paragraph', text:
            '5.2. Управляющая компания несет ответственность за ущерб, причинённый имуществу ' +
            'Собственников в результате её действий или бездействий.' },
        ],
      },
      {
        heading: '6. ПОРЯДОК ИЗМЕНЕНИЯ И РАСТОРЖЕНИЯ ДОГОВОРА',
        blocks: [
          { kind: 'paragraph', text:
            '6.1. Изменение и расторжение договора осуществляются в порядке, предусмотренном ' +
            'гражданским законодательством.' },
          { kind: 'paragraph', text:
            '6.2. Настоящий Договор может быть расторгнут: по соглашению сторон; в судебном порядке; ' +
            'в связи с окончанием срока действия и письменным уведомлением за 30 дней; вследствие ' +
            'форс-мажора.' },
        ],
      },
      {
        heading: '7. ОСОБЫЕ УСЛОВИЯ',
        blocks: [
          { kind: 'paragraph', text:
            'Все споры, возникшие из Договора, разрешаются путем переговоров. При недостижении ' +
            'согласия — в судебном порядке.' },
        ],
      },
      {
        heading: '8. ФОРС-МАЖОР',
        blocks: [
          { kind: 'paragraph', text:
            'Управляющая компания не несет ответственность, если надлежащее исполнение оказалось ' +
            'невозможным вследствие непреодолимой силы (чрезвычайных и непредотвратимых обстоятельств).' },
        ],
      },
      {
        heading: '9. СРОК ДЕЙСТВИЯ ДОГОВОРА',
        blocks: [
          { kind: 'paragraph', text:
            '9.1. Настоящий Договор вступает в силу c момента заключения на основании протокола собрания.' },
          { kind: 'paragraph', text:
            '9.2. При отсутствии заявлений о прекращении за 30 дней до окончания срока, договор ' +
            'продлевается на следующий календарный год.' },
          { kind: 'paragraph', text:
            '9.3. Настоящий Договор составлен в двух экземплярах по одному для каждой из Сторон. ' +
            'Оба экземпляра имеют одинаковую юридическую силу.' },
        ],
      },
    ],
    requisitesHeading: 'РЕКВИЗИТЫ И ПОДПИСИ СТОРОН',
    uk: {
      caption: 'УК: ООО "KAMIZO"',
      lines: [
        'г. Ташкент, Яшнобадский район,',
        'ул. Махтумкули, дом 93/3',
        'Банк: «Ориент Финанс» ЧАКБ',
        'Р/С: 20208000805307918001',
        'ИНН: 307928888  МФО: 01071',
      ],
      qrPayload: UK_QR_DATA,
    },
    owner: {
      caption: 'СОБСТВЕННИК:',
      lines: [
        name,
        `Адрес: ${fullAddress}`,
        `Тел: ${phone}`,
        `Л/С: ${login}`,
      ],
      qrPayload: ownerQrPayload,
    },
    signed: !!user.contractSignedAt,
    signedStamp: lang === 'uz' ? '✓ Elektron imzolangan' : '✓ Подписано электронно',
  };
}
