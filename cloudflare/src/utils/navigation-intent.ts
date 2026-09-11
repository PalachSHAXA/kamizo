export type NavigationIntent =
  | 'rental_publish'
  | 'rental_browse'
  | 'useful_contacts'
  | 'marketplace'
  | 'vehicle_owner'
  | 'guest_pass'
  | 'qr_scan'
  | 'vehicle_menu'
  | 'pass_menu'
  | 'rental_menu'
  | 'parking_issue'
  | 'barrier_issue'
  | 'resident_proposal'
  | 'assistant_help';

export interface NavigationMatch {
  intent: NavigationIntent;
  path: string;
  requiredFeature?: string;
  restrictedRoles?: string[];
}

const MATCHES: Record<NavigationIntent, Omit<NavigationMatch, 'intent'>> = {
  rental_publish: {
    path: '/apartment-rentals/create',
    requiredFeature: 'rental_listings',
  },
  rental_browse: { path: '/apartment-rentals', requiredFeature: 'rental_listings' },
  useful_contacts: { path: '/useful-contacts' },
  marketplace: { path: '/marketplace', requiredFeature: 'marketplace' },
  vehicle_owner: {
    path: '/vehicle-search',
    requiredFeature: 'vehicles',
    restrictedRoles: ['admin', 'manager', 'director', 'security', 'executor'],
  },
  guest_pass: {
    path: '/guest-access',
    requiredFeature: 'qr',
  },
  qr_scan: {
    path: '/qr-scanner',
    requiredFeature: 'qr',
    restrictedRoles: ['security'],
  },
  vehicle_menu: { path: '/vehicles', requiredFeature: 'vehicles' },
  pass_menu: { path: '/guest-access', requiredFeature: 'qr' },
  rental_menu: { path: '/apartment-rentals', requiredFeature: 'rental_listings' },
  parking_issue: { path: '/chat' },
  barrier_issue: { path: '/chat' },
  resident_proposal: { path: '/chat' },
  assistant_help: { path: '/' },
};

function normalize(raw: string): string {
  return raw
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .replace(/[ʻʼ’`]/g, "'")
    .replace(/[^a-zа-я0-9қғҳў'\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function has(text: string, terms: string[]): boolean {
  return terms.some(term => text.includes(term));
}

function editDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diagonal = above;
    }
  }
  return previous[b.length];
}

function hasApprox(text: string, terms: string[]): boolean {
  if (has(text, terms)) return true;
  const tokens = text.split(' ').filter(Boolean);
  return terms.some(term => {
    if (term.includes(' ') || term.length < 5) return false;
    const maxDistance = term.length >= 7 ? 2 : 1;
    return tokens.some(token => {
      if (Math.abs(token.length - term.length) > maxDistance) return false;
      return editDistance(token, term) <= maxDistance;
    });
  });
}

/**
 * High-precision navigation intent classifier. Generic nouns such as
 * "машина" or "квартира" never fire without an explicit action.
 */
export function classifyNavigationIntent(raw: string): NavigationMatch | null {
  if (!raw || raw.length > 1200 || /https?:\/\/|www\.|t\.me\//i.test(raw)) return null;
  const text = normalize(raw);
  if (!text) return null;
  const shortMessage = text.split(' ').length <= 3;

  const proposal = has(text, ['предлагаю', 'предложение', 'идея', 'таклиф', 'таклиф қиламан']);
  const sharedArea = has(text, ['шлагбаум', 'парков', 'двор', 'камера', 'кириш', 'ҳовли', 'тўсиқ']);
  if (proposal && sharedArea) return { intent: 'resident_proposal', ...MATCHES.resident_proposal };

  const barrier = hasApprox(text, ['шлагбаум', 'ворота', 'охрана', 'qorovul'])
    || has(text, ['қўриқ', 'курик', 'кириш дарвоза']);
  const accessProblem = has(text, [
    'не дозвон', 'не отвечает', 'открыть', 'откройте', 'пропустить', 'въезд',
    'жавоб бер', 'очиб юбор', 'киритиб юбор', 'телефонга жавоб',
  ]);
  if (barrier && accessProblem) return { intent: 'barrier_issue', ...MATCHES.barrier_issue };

  const parking = has(text, ['парков', 'припарков', 'стоян', 'машину убрат', 'убрать машину', 'посторонн', 'авто во двор', 'машина мешает']);
  const parkingUz = has(text, ['парковка', 'машинани олиб', 'машина халақит', 'бегона машина', 'нотугри куй', 'нотўғри қўй']);
  if (parking || parkingUz) return { intent: 'parking_issue', ...MATCHES.parking_issue };

  const apartment = hasApprox(text, ['квартира', 'квартиру', 'жилье', 'kvartira', 'xonadon'])
    || has(text, ['квартир', 'уй ', 'хонадон']);
  const rental = hasApprox(text, ['аренда', 'снять', 'сниму', 'сдаю', 'сдам', 'сдать', 'ijara', 'ижара']) || has(text, ['аренд']);
  const publish = hasApprox(text, ['сдаю', 'сдам', 'сдать', 'разместить', 'опубликовать'])
    || has(text, ['размест', 'опубликов', 'ijaraga ber', "e'lon joyla", 'elon joyla', 'ижарага бер', 'жойлаш', 'бераман']);
  if (apartment && rental && publish) return { intent: 'rental_publish', ...MATCHES.rental_publish };

  const browse = hasApprox(text, ['сниму', 'снять', 'ищу', 'найти', 'посмотреть', 'qidir'])
    || has(text, ['ijaraga ol', "ko'rmoq", 'kormoq', 'қидир', 'ижарага ол', 'кўрмоқ']);
  if (apartment && rental && browse) return { intent: 'rental_browse', ...MATCHES.rental_browse };

  const qr = hasApprox(text, ['пропуск', 'ruxsat', 'ruxsatnoma']) || has(text, ['qr', 'куар', 'кьюар', 'рухсат', 'рухсатнома']);
  const scan = hasApprox(text, ['проверить', 'проверка', 'сканировать', 'сканер', 'tekshir'])
    || has(text, ['сканир', 'впустить', 'scan', 'текшир', 'сканлаш']);
  if (qr && scan) return { intent: 'qr_scan', ...MATCHES.qr_scan };

  const createPass = hasApprox(text, ['оформить', 'создать', 'сделать', 'заказать', 'пропустить', 'впустить', 'yarat'])
    || has(text, ['rasmiylashtir', 'ярат', 'расмийлаштир', 'ўтказ', 'кирит']);
  const visitor = hasApprox(text, ['гость', 'гостя', 'курьер', 'mehmon', 'kuryer'])
    || has(text, ['гост', 'доставк', 'меҳмон', 'курьер']);
  const accessAction = hasApprox(text, ['пропустить', 'впустить'])
    || has(text, ["o'tkaz", 'otkaz', 'kirit', 'ўтказ', 'кирит']);
  if (visitor && createPass && (qr || accessAction)) {
    return { intent: 'guest_pass', ...MATCHES.guest_pass };
  }
  if (shortMessage && qr) return { intent: 'pass_menu', ...MATCHES.pass_menu };

  const vehicle = hasApprox(text, ['машина', 'автомобиль', 'mashina'])
    || has(text, ['машин', 'авто', 'автомоб', 'avto', 'ulov', 'улов']);
  const owner = hasApprox(text, ['владелец', 'хозяин', 'egasi', 'kimniki'])
    || has(text, ['чья', 'чя', 'чей', 'владел', 'эгаси', 'кимники']);
  const plate = hasApprox(text, ['номер', 'госномер', 'raqam'])
    || has(text, ['рақам'])
    || /\b\d{2}[a-zа-я]\d{3}[a-zа-я]{2}\b/i.test(text);
  const directOwnerQuestion = has(text, ['чья машина', 'чей автомобиль', 'mashina kimniki', 'машина кимники', 'автомобиль эгаси']);
  if (vehicle && owner && (plate || directOwnerQuestion)) {
    return { intent: 'vehicle_owner', ...MATCHES.vehicle_owner };
  }
  if (shortMessage && vehicle) return { intent: 'vehicle_menu', ...MATCHES.vehicle_menu };

  const dryCleaning = hasApprox(text, ['химчистка', 'химчистку'])
    || has(text, ['химчист', 'хим чист', 'kimyoviy tozal', 'кимёвий тозалаш', 'кимевий тозалаш']);
  const serviceSearch = hasApprox(text, ['нужно', 'нужна', 'ищу', 'найти', 'заказать', 'kerak', 'qidir'])
    || has(text, ['нужн', 'где', 'qayer', 'керак', 'қидир', 'қаер']);
  const homeService = hasApprox(text, ['услуга', 'мастер', 'сантехник', 'электрик', 'ковер', 'мебель', 'xizmat', 'usta', 'gilam'])
    || has(text, ['услуг', 'ковёр', 'мебел', 'хизмат', 'уста', 'гилам']);
  const activeProblem = has(text, ['течет', 'течёт', 'прорв', 'сломал', 'сломано', 'не работает', 'авари', 'oqyap', 'buzil']);
  if (!activeProblem && ((dryCleaning && (serviceSearch || shortMessage)) || (homeService && serviceSearch))) {
    return { intent: 'useful_contacts', ...MATCHES.useful_contacts };
  }

  const market = has(text, ['маркет ук', 'маркет kamizo', 'kamizo market', 'bk market', 'бк маркет', 'бк маркети']);
  const shopping = has(text, ['открыть', 'купить', 'заказать', 'товар', 'och', 'sotib ol', 'buyurtma', 'mahsulot', 'сотиб ол', 'буюртма', 'маҳсулот']);
  if (market && shopping) return { intent: 'marketplace', ...MATCHES.marketplace };

  const buySomething = has(text, ['где купить', 'где заказать', 'хочу купить', 'нужно купить', 'найти товар', 'qayerdan sotib', 'mahsulot kerak', 'қаердан сотиб', 'маҳсулот керак']);
  const fuzzyBuy = has(text, ['где ', 'хочу ', 'нужно ']) && hasApprox(text, ['купить', 'заказать']);
  const product = hasApprox(text, ['товар', 'лампочка', 'фильтр', 'материал', 'средство', 'инструмент', 'краска', 'mahsulot'])
    || has(text, ['маҳсулот', 'лампочка', 'фильтр']);
  const directBuy = product && (
    hasApprox(text, ['купить', 'заказать', 'найти'])
    || has(text, ['sotib', 'сотиб', 'buyurtma', 'буюртма'])
  );
  if (buySomething || fuzzyBuy || directBuy) return { intent: 'marketplace', ...MATCHES.marketplace };

  if (shortMessage && apartment) return { intent: 'rental_menu', ...MATCHES.rental_menu };

  const help = has(text, [
    'что умеет бот', 'помоги kamizo', 'помоги бот', 'где это в приложении',
    'как это сделать в kamizo', 'bot nima qiladi', 'kamizoda qayerda',
  ]);
  if (help) return { intent: 'assistant_help', ...MATCHES.assistant_help };

  return null;
}
