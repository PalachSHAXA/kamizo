// kamizo-silhouettes.jsx — large faint thematic SVG silhouettes for card backgrounds
// Each fills its container; positioned bottom-right inside swipe cards, white @ low opacity.

function Silhouette({ kind, color = '#fff', opacity = 0.14 }) {
  const common = { fill: color, opacity };
  const wrap = {
    position: 'absolute', right: -6, bottom: -10,
    width: 180, height: 180, pointerEvents: 'none',
  };

  const svg = (children, vb = '0 0 100 100') => (
    <svg viewBox={vb} style={wrap}>{children}</svg>
  );

  switch (kind) {
    case 'people': // crowd of people — собрание/голосование
      return svg(<g {...common}>
        <circle cx="28" cy="34" r="11"/><path d="M10 78c0-12 8-20 18-20s18 8 18 20z"/>
        <circle cx="60" cy="30" r="13"/><path d="M38 80c0-14 10-23 22-23s22 9 22 23z"/>
        <circle cx="86" cy="36" r="9"/><path d="M72 78c0-10 6-16 14-16s14 6 14 16z"/>
      </g>);
    case 'qr': // QR code
      return svg(<g {...common}>
        <rect x="6" y="6" width="26" height="26" rx="3"/><rect x="14" y="14" width="10" height="10" rx="1" fill="none"/>
        <rect x="68" y="6" width="26" height="26" rx="3"/>
        <rect x="6" y="68" width="26" height="26" rx="3"/>
        <rect x="44" y="6" width="8" height="8"/><rect x="44" y="20" width="8" height="8"/>
        <rect x="68" y="44" width="8" height="8"/><rect x="86" y="44" width="8" height="8"/>
        <rect x="44" y="44" width="8" height="8"/><rect x="44" y="68" width="8" height="8"/>
        <rect x="44" y="86" width="8" height="8"/><rect x="68" y="68" width="12" height="12"/>
        <rect x="86" y="86" width="8" height="8"/>
      </g>);
    case 'star': // оценка
      return svg(<path {...common} d="M50 8l12 26 28 3-21 19 6 28-25-15-25 15 6-28L20 37l28-3z"/>);
    case 'phone': // полезные контакты — телефонная трубка
      return svg(<path {...common} d="M30 18c-6 0-10 4-10 9 0 28 26 54 54 54 5 0 9-4 9-10v-9c0-3-2-5-5-6l-13-3c-3-1-6 0-7 3l-3 6c-10-5-18-13-23-23l6-3c3-1 4-4 3-7l-3-13c-1-3-3-5-6-5z"/>);
    case 'car': // найти авто
      return svg(<g {...common}>
        <path d="M14 56l8-22c1-4 5-7 9-7h38c4 0 8 3 9 7l8 22z"/>
        <rect x="6" y="54" width="88" height="26" rx="6"/>
        <circle cx="28" cy="80" r="7" fill="#000" opacity="0.25"/><circle cx="72" cy="80" r="7" fill="#000" opacity="0.25"/>
      </g>);
    case 'check': // онбординг / заявка готова
      return svg(<g {...common}>
        <rect x="22" y="10" width="56" height="78" rx="8"/>
        <rect x="34" y="4" width="32" height="14" rx="5" fill="#000" opacity="0.18"/>
        <path d="M36 44l8 8 18-18" stroke={color} strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={opacity}/>
      </g>);
    case 'drop': // заявка протечка
      return svg(<path {...common} d="M50 8s30 30 30 50a30 30 0 11-60 0C20 38 50 8 50 8z"/>);
    case 'wrench': // услуги
      return svg(<path {...common} d="M62 16a18 18 0 0021 24L62 61 39 84a9 9 0 01-13-13l23-23-21-21a18 18 0 0134-11z"/>);
    case 'coins': // оплата — стопка монет
      return svg(<g {...common}>
        <ellipse cx="40" cy="30" rx="26" ry="9"/>
        <path d="M14 30v10c0 5 12 9 26 9s26-4 26-9V30c0 5-12 9-26 9s-26-4-26-9z"/>
        <ellipse cx="62" cy="58" rx="26" ry="9"/>
        <path d="M36 58v10c0 5 12 9 26 9s26-4 26-9V58c0 5-12 9-26 9s-26-4-26-9z"/>
      </g>);
    default:
      return null;
  }
}

Object.assign(window, { Silhouette });
