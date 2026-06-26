// kamizo-admin-data.jsx — data model + shared bits for the УК operator inbox.
// Realistic Tashkent ЖК context. FOUNDATION tokens, RU strings.

// ── role badge ──
const ROLE_TONES = {
  owner:  { label: 'Собственник', bg: 'var(--brand-tint)',        fg: 'var(--brand-dark)',     bd: 'var(--brand-200)' },
  tenant: { label: 'Арендатор',   bg: 'var(--status-info-bg)',    fg: 'var(--status-info)',    bd: 'rgba(47,119,194,0.22)' },
  member: { label: 'Житель',      bg: 'var(--surface-sunken)',    fg: 'var(--text-secondary)', bd: 'var(--border-c)' },
};
function RoleBadge({ role, size = 'sm' }) {
  const t = ROLE_TONES[role] || ROLE_TONES.member;
  const big = size === 'md';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', flex: '0 0 auto',
      padding: big ? '3px 9px' : '2px 7px', borderRadius: 999,
      background: t.bg, color: t.fg, border: `1px solid ${t.bd}`,
      fontSize: big ? 11.5 : 10.5, fontWeight: 700, letterSpacing: '-0.01em', whiteSpace: 'nowrap',
    }}>{t.label}</span>
  );
}

// priority / status tag on a conversation
const TAG_TONES = {
  critical: { fg: 'var(--status-critical)', bg: 'var(--status-critical-bg)' },
  info:     { fg: 'var(--status-info)',      bg: 'var(--status-info-bg)' },
  active:   { fg: 'var(--status-active)',    bg: 'var(--status-active-bg)' },
  pending:  { fg: 'var(--status-pending)',   bg: 'var(--status-pending-bg)' },
};
function Tag({ tone = 'info', children }) {
  const t = TAG_TONES[tone] || TAG_TONES.info;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, flex: '0 0 auto',
      padding: '2px 7px', borderRadius: 6, background: t.bg, color: t.fg,
      fontSize: 10, fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase',
    }}>{children}</span>
  );
}

// avatar with deterministic warm color
const AV_COLORS = [
  ['#FB923C', '#EA580C'], ['#60A5FA', '#2563EB'], ['#34D399', '#059669'],
  ['#F472B6', '#DB2777'], ['#A78BFA', '#7C3AED'], ['#FBBF24', '#D97706'],
  ['#22D3EE', '#0891B2'],
];
function avatarColor(seed) {
  let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AV_COLORS[h % AV_COLORS.length];
}
function initials(name) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase();
}
function Avatar({ name, size = 44, ring }) {
  const [a, b] = avatarColor(name);
  return (
    <div style={{
      width: size, height: size, borderRadius: 999, flex: '0 0 auto',
      background: `linear-gradient(135deg, ${a}, ${b})`, color: '#fff',
      fontWeight: 800, fontSize: size * 0.36, display: 'grid', placeItems: 'center',
      letterSpacing: '0.01em', boxShadow: ring ? `0 0 0 3px ${ring}` : 'none',
    }}>{initials(name)}</div>
  );
}

// ── operators (multi-operator thread) ──
const OPERATORS = {
  dina:   { name: 'Дина',   role: 'Диспетчер', color: '#7C3AED' },
  rustam: { name: 'Рустам', role: 'Мастер',    color: '#0891B2' },
  you:    { name: 'Вы',     role: 'Оператор',  color: 'var(--brand-dark)' },
};

// ── quick reply templates (editable in settings) ──
const QUICK_TEMPLATES = [
  { id: 'accepted', label: 'Заявка принята ✅', text: 'Ваша заявка принята в работу. Передаём мастеру — сообщим время визита в течение часа.' },
  { id: 'enroute',  label: 'Мастер выехал 🚗',  text: 'Мастер уже выехал к вам. Будет в течение 30–40 минут, перезвонит за 10 минут до приезда.' },
  { id: 'solved',   label: 'Проблема решена 🎉', text: 'Работы завершены, заявку закрываем. Если что-то осталось — напишите, вернёмся.' },
  { id: 'clarify',  label: 'Уточните, пожалуйста 🤔', text: 'Подскажите, пожалуйста, номер квартиры и удобное время визита мастера?' },
  { id: 'payment',  label: 'По оплате 💳',       text: 'Квитанция за этот месяц сформирована в разделе «Финансы». Оплатить можно картой прямо в приложении.' },
];

// photo tile gradients (no real assets)
const ADMIN_PHOTOS = {
  leak:   { grad: 'linear-gradient(150deg,#5B7B8C,#2E3F49 60%,#46627A)', label: 'IMG_4471.jpg · 1.9 МБ' },
  door:   { grad: 'linear-gradient(150deg,#7A6E5B,#3A332600 0%,#564A36)', label: 'IMG_088.jpg · 1.2 МБ' },
  meter:  { grad: 'linear-gradient(150deg,#516B57,#27331f 60%,#44563f)', label: 'IMG_5510.jpg · 2.4 МБ' },
};

// ── conversations (resident inbox) ──
// branch = филиал, house = дом. unread sorts to top. msgs newest-last.
const CONVERSATIONS = [
  {
    id: 'c1', name: 'Азиз Каримов', role: 'owner', branch: 'sergeli', house: 'Янги Сергели, 12',
    apt: 'кв. 48', phone: '+998 90 123-45-67', time: '11:24', unread: 2,
    tag: { tone: 'critical', label: 'Авария' },
    preview: 'Кран перекрыл, спасибо. Жду мастера к 12.',
    requests: [{ id: '#UK-S-1042', title: 'Протечка под раковиной', status: 'В работе', state: 'active' }],
    msgs: [
      { id: 1, kind: 'date', label: 'Сегодня' },
      { id: 2, from: 'resident', time: '11:02', text: 'Здравствуйте! Под кухонной раковиной течёт — уже натекла лужа на полу. Прикладываю фото.' },
      { id: 3, from: 'resident', time: '11:02', photo: 'leak' },
      { id: 4, from: 'operator', op: 'dina', time: '11:06', text: 'Добрый день, Азиз! Приняли, это аварийная ситуация. Перекройте, пожалуйста, кран под мойкой, если есть доступ — назначаем сантехника.',
        request: { id: '#UK-S-1042', title: 'Протечка под раковиной', status: 'Создана', state: 'active' } },
      { id: 5, from: 'operator', op: 'dina', time: '11:07', kind: 'note', text: 'Дом старый, стояк 1987 г. Если течь со стояка — заявка в аварийную бригаду, не к штатному сантехнику.' },
      { id: 6, from: 'resident', time: '11:24', text: 'Кран перекрыл, спасибо. Жду мастера к 12.' },
    ],
  },
  {
    id: 'c2', name: 'Малика Усманова', role: 'tenant', branch: 'sergeli', house: 'Янги Сергели, 12',
    apt: 'кв. 13', phone: '+998 93 555-21-09', time: '10:48', unread: 1,
    tag: { tone: 'info', label: 'Оплата' },
    preview: 'А можно квитанцию за май продублировать?',
    requests: [],
    msgs: [
      { id: 1, kind: 'date', label: 'Сегодня' },
      { id: 2, from: 'resident', time: '10:46', text: 'Добрый день! Не приходит квитанция за май, в приложении пусто.' },
      { id: 3, from: 'resident', time: '10:48', text: 'А можно квитанцию за май продублировать?' },
    ],
  },
  {
    id: 'c3', name: 'Жасур Рахимов', role: 'member', branch: 'yunusabad', house: 'Юнусабад, 7А',
    apt: 'кв. 102', phone: '+998 97 700-14-22', time: '09:31', unread: 0,
    preview: 'Вы: Мастер подтвердил, будет завтra в окне 10–12.',
    requests: [{ id: '#UK-1838', title: 'Не работает домофон', status: 'В работе', state: 'active' }],
    msgs: [
      { id: 1, kind: 'date', label: 'Сегодня' },
      { id: 2, from: 'resident', time: '09:10', text: 'Не работает домофон у 3-го подъезда, не открывает ключом.' },
      { id: 3, from: 'resident', time: '09:11', photo: 'door' },
      { id: 4, from: 'operator', op: 'you', time: '09:31', text: 'Принято, оформил заявку. Мастер подтвердил, будет завтра в окне 10–12.',
        request: { id: '#UK-1838', title: 'Не работает домофон', status: 'Назначен мастер', state: 'active' } },
    ],
  },
  {
    id: 'c4', name: 'Олег Петров', role: 'owner', branch: 'yunusabad', house: 'Юнусабад, 7А',
    apt: 'кв. 56', phone: '+998 90 808-00-11', time: 'Вчера', unread: 0,
    preview: 'Спасибо большое, всё работает 🙏',
    requests: [{ id: '#UK-1799', title: 'Замена лампы в подъезде', status: 'Завершено', state: 'closed' }],
    msgs: [
      { id: 1, kind: 'date', label: 'Вчера' },
      { id: 2, from: 'resident', time: '16:20', text: 'Перегорела лампа на 4 этаже, темно совсем.' },
      { id: 3, from: 'operator', op: 'rustam', time: '18:05', text: 'Заменил, проверил — горит. Закрываю заявку.',
        request: { id: '#UK-1799', title: 'Замена лампы в подъезде', status: 'Завершено', state: 'closed' } },
      { id: 4, from: 'resident', time: '18:40', text: 'Спасибо большое, всё работает 🙏' },
    ],
  },
  {
    id: 'c5', name: 'Нодира Юлдашева', role: 'tenant', branch: 'sergeli', house: 'Янги Сергели, 9', 
    apt: 'кв. 71', phone: '+998 94 311-77-50', time: 'Вчера', unread: 0,
    preview: 'Вы: Передал показания в бухгалтерию, спасибо.',
    requests: [],
    msgs: [
      { id: 1, kind: 'date', label: 'Вчера' },
      { id: 2, from: 'resident', time: '12:00', text: 'Показания счётчика воды: 0148 холодная, 0096 горячая.' },
      { id: 3, from: 'resident', time: '12:00', photo: 'meter' },
      { id: 4, from: 'operator', op: 'you', time: '12:14', text: 'Передал показания в бухгалтерию, спасибо.' },
    ],
  },
  {
    id: 'c6', name: 'Тимур Сафаров', role: 'member', branch: 'yunusabad', house: 'Юнусабад, 7Б',
    apt: 'кв. 24', phone: '+998 99 120-30-40', time: 'Пн', unread: 0,
    preview: 'Понял, спасибо за разъяснение.',
    requests: [],
    msgs: [
      { id: 1, kind: 'date', label: 'Понедельник' },
      { id: 2, from: 'resident', time: '14:02', text: 'Подскажите, когда в этом месяце вывоз крупногабаритного мусора?' },
      { id: 3, from: 'operator', op: 'dina', time: '14:20', text: 'Каждую вторую субботу месяца, ближайший — 21 июня, площадка у 2-го подъезда.' },
      { id: 4, from: 'resident', time: '14:25', text: 'Понял, спасибо за разъяснение.' },
    ],
  },
];

const BRANCHES = [
  { id: 'all', label: 'Все филиалы' },
  { id: 'sergeli', label: 'Сергели' },
  { id: 'yunusabad', label: 'Юнусабад' },
];

Object.assign(window, {
  RoleBadge, Tag, Avatar, initials, avatarColor,
  OPERATORS, QUICK_TEMPLATES, ADMIN_PHOTOS, CONVERSATIONS, BRANCHES,
});
