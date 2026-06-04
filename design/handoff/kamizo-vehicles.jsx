// kamizo-vehicles.jsx — Vehicles redesign · "Garage" direction
//
// Visual shift from previous version:
//   • Dark hero panel with the user's primary plate as the centerpiece
//   • Switcher moves into the hero, becomes a "Гараж · Поиск" pill duo on dark
//   • My-cars list rendered as horizontal scroll of plate-tiles below hero
//   • Search panel (when active) replaces the list with a giant centered plate input
//   • Numbers and meta info treated typographically — no decorative car icons in cards
//
// Same functionality:
//   • Tab switch: my cars / search
//   • Plate input for search
//   • List of user's cars + "find owner" affordance

function PlateBigInput({ region = '01', l1 = 'A', digits = '123', l2 = 'BC', dark = false }) {
  const fg = dark ? '#FAFAF9' : '#1C1917';
  const dim = dark ? 'rgba(250,250,249,0.35)' : 'var(--stone-400)';
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'stretch',
      background: dark ? '#0C0A09' : '#fff',
      border: `2.5px solid ${fg}`,
      borderRadius: 12, overflow: 'hidden',
      fontFamily: 'var(--font-num, "Inter Tight", monospace)',
      fontSize: 28, fontWeight: 700, letterSpacing: '0.04em',
      width: '100%', maxWidth: 340,
    }}>
      <div style={{ minWidth: 64, padding: '14px 8px', display: 'grid', placeItems: 'center', color: dim }}>{region}</div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '14px 10px', color: dim }}>
        <span>{l1}</span><span>{digits}</span><span>{l2}</span>
      </div>
      <div style={{
        width: 56, padding: '6px 0', borderLeft: `2.5px solid ${fg}`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
        background: dark ? '#0C0A09' : '#fff',
      }}>
        <div style={{ width: 32, height: 26, borderRadius: 3, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 0 0 1px rgba(255,255,255,0.15)' }}>
          <div style={{ flex: 1, background: '#1EB4E2' }} />
          <div style={{ height: 2, background: '#fff' }} />
          <div style={{ flex: 1, background: '#CE1126' }} />
          <div style={{ height: 2, background: '#fff' }} />
          <div style={{ flex: 1, background: '#1A9847' }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 800, color: fg, letterSpacing: '0.04em' }}>UZ</span>
      </div>
    </div>
  );
}

// Uncovered car silhouette — clean technical side view (car-configurator style).
function CarSilhouette() {
  return (
    <svg viewBox="0 0 360 150" style={{ width: 290, height: 121 }}>
      <defs>
        <linearGradient id="kzCarBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#ECECEC" />
        </linearGradient>
      </defs>
      {/* ground shadow */}
      <ellipse cx="180" cy="134" rx="158" ry="8" fill="rgba(0,0,0,0.4)" />

      {/* lower body / rocker */}
      <path fill="#E2E2E2" d="M30 112 L330 112 L322 122 L38 122 Z" />

      {/* main body — long hood, low roofline, defined trunk */}
      <path fill="url(#kzCarBody)" d="
        M22 110
        C18 100 20 92 32 90
        L66 86
        L96 60
        C104 53 114 49 126 48
        L214 48
        C226 49 236 53 244 62
        L266 86
        L320 92
        C332 94 338 100 338 110
        L338 112 L22 112 Z" />

      {/* roof line accent */}
      <path fill="none" stroke="#D5D5D5" strokeWidth="1.5" d="M96 60 L266 86" />

      {/* windows (light gray glass) with pillar */}
      <path fill="#CCCCCC" d="M104 62 C110 56 118 53 128 53 L166 53 L166 78 L86 78 Z" />
      <path fill="#CCCCCC" d="M172 53 L210 53 C220 54 228 58 234 65 L246 80 L172 80 Z" />
      {/* B-pillar */}
      <rect x="166" y="53" width="6" height="27" fill="#FFFFFF" />

      {/* door panel seams */}
      <g stroke="#D0D0D0" strokeWidth="1.4" strokeLinecap="round">
        <path d="M169 82 L169 110" />
        <path d="M96 88 L96 110" />
        <path d="M250 86 L250 110" />
      </g>
      {/* door handles */}
      <rect x="120" y="86" width="14" height="3.5" rx="1.75" fill="#CFCFCF" />
      <rect x="200" y="86" width="14" height="3.5" rx="1.75" fill="#CFCFCF" />

      {/* side mirror */}
      <path fill="#FFFFFF" d="M96 64 L88 60 C85 59 83 61 84 64 L88 70 Z" />

      {/* headlight + taillight hints */}
      <path fill="#D9D9D9" d="M22 96 L34 95 L34 102 L23 102 Z" />
      <path fill="#E8B4B0" d="M338 98 L328 97 L328 104 L338 104 Z" />

      {/* wheel arches */}
      <path fill="#1C1917" d="M64 112 A34 34 0 0 1 132 112 Z" />
      <path fill="#1C1917" d="M236 112 A34 34 0 0 1 304 112 Z" />

      {/* alloy wheels with spokes */}
      {[98, 270].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="112" r="27" fill="#333333" />
          <circle cx={cx} cy="112" r="26" fill="none" stroke="#1C1917" strokeWidth="2" />
          <circle cx={cx} cy="112" r="17" fill="#4A4A4A" />
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <rect key={a} x={cx - 1.6} y="112" width="3.2" height="16"
              fill="#2A2A2A" transform={`rotate(${a} ${cx} 112)`} rx="1.6" />
          ))}
          <circle cx={cx} cy="112" r="5.5" fill="#333333" stroke="#5A5A5A" strokeWidth="1.5" />
        </g>
      ))}
    </svg>
  );
}

// Covered-car hero — user photo of a car under a white cover, bg knocked out.
function CoveredCar() {
  return (
    <img src="kamizo-car-cover.png" alt="Авто под чехлом" style={{ width: 300, height: 'auto', display: 'block', filter: 'drop-shadow(0 14px 26px rgba(0,0,0,0.45))' }} />
  );
}

function CoveredCarSVG() {
  return (
    <svg viewBox="0 0 360 168" style={{ width: 296, height: 138 }}>
      <defs>
        <linearGradient id="kzDrape" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.55" stopColor="#ECECEC" />
          <stop offset="1" stopColor="#C6C6C6" />
        </linearGradient>
        <radialGradient id="kzDrapeGlow" cx="0.42" cy="0.28" r="0.75">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.7" stopColor="#E6E6E6" />
          <stop offset="1" stopColor="#CFCFCF" />
        </radialGradient>
      </defs>

      {/* floor shadow */}
      <ellipse cx="182" cy="150" rx="166" ry="11" fill="rgba(0,0,0,0.55)" />

      {/* single continuous cloth: domed cabin → long hood → tail, skirts to the floor both ends */}
      <path fill="url(#kzDrapeGlow)" d="
        M14 150
        C8 132 12 116 28 110
        L74 96
        C86 70 108 56 136 51
        C156 48 180 47 202 50
        C236 55 262 70 280 92
        L322 104
        C342 110 350 126 346 146
        C345 150 341 151 338 150
        L300 150
        C292 150 286 150 280 150
        L86 150
        C70 150 30 150 14 150 Z" />

      {/* broad soft sheen over the roof of the hidden car */}
      <path fill="#FFFFFF" opacity="0.7" d="
        M96 78 C118 58 146 50 176 51 C160 70 124 84 88 96 C90 88 92 82 96 78 Z" />
      {/* faint hood sheen */}
      <path fill="#FFFFFF" opacity="0.4" d="M30 116 C48 106 68 101 88 100 C72 110 50 118 30 124 Z" />

      {/* creases radiating down the fabric (reveal the form, no hard edges) */}
      <g stroke="#C2C2C2" strokeWidth="2.4" fill="none" opacity="0.65" strokeLinecap="round">
        <path d="M118 92 C122 112 120 132 118 148" />
        <path d="M186 84 C188 108 188 130 188 148" />
        <path d="M256 102 C262 122 264 136 262 148" />
        <path d="M60 116 C58 130 56 140 54 148" />
        <path d="M312 116 C316 130 318 140 320 148" />
      </g>
      {/* subtle highlight creases */}
      <g stroke="#FFFFFF" strokeWidth="1.6" fill="none" opacity="0.55" strokeLinecap="round">
        <path d="M152 84 C154 106 154 128 154 148" />
        <path d="M222 90 C226 112 228 132 226 148" />
      </g>

      {/* hem shading where cloth meets floor */}
      <path fill="#B9B9B9" opacity="0.5" d="M20 146 C120 152 260 152 340 146 L340 150 L20 150 Z" />
    </svg>
  );
}

function CoveredCarOld() {
  return (
    <svg viewBox="0 0 320 170" style={{ width: 280, height: 150 }}>
      <defs>
        <linearGradient id="kzCover" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.55" stopColor="#F1ECE3" />
          <stop offset="1" stopColor="#D9D2C6" />
        </linearGradient>
        <radialGradient id="kzCoverSh" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="rgba(0,0,0,0.35)" />
          <stop offset="1" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
      </defs>
      {/* ground shadow */}
      <ellipse cx="160" cy="152" rx="140" ry="15" fill="url(#kzCoverSh)" />
      {/* draped sedan: low nose (right) → cabin bump → longer trunk (left), skirt with folds */}
      <path fill="url(#kzCover)" d="
        M22 150
        C18 128 22 116 34 112
        L60 104
        C70 86 88 74 112 68
        C128 52 150 46 178 47
        C210 48 236 58 252 76
        C262 88 276 92 288 100
        C300 108 302 122 298 140
        C297 147 291 149 286 145 L281 138 L274 148 C272 150 268 150 266 147 L260 139
        C232 150 120 152 86 145
        L80 149 C78 151 74 151 72 148 L66 140
        L59 149 C57 151 53 151 51 148 L45 140
        L38 149 C36 151 32 151 30 148 Z" />
      {/* windscreen/roof highlight */}
      <path d="M118 70 C140 54 160 49 180 50 C168 64 142 72 110 80 C112 76 114 73 118 70 Z" fill="#FFFFFF" opacity="0.75" />
      <path d="M186 50 C214 52 236 62 250 78 C228 66 204 60 184 60 Z" fill="#FFFFFF" opacity="0.5" />
      {/* hanging fold shadow lines */}
      <g stroke="#C9C1B3" strokeWidth="2" fill="none" opacity="0.65" strokeLinecap="round">
        <path d="M96 100 C100 116 98 130 96 142" />
        <path d="M150 86 C152 106 152 124 152 142" />
        <path d="M210 90 C214 110 216 126 216 140" />
        <path d="M256 96 C262 112 264 124 262 138" />
      </g>
    </svg>
  );
}

// Hero plate — typographic, no border, used as a focal "object" inside hero panel.
function PlateHero({ region, l1, digits, l2 }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'baseline', gap: 10,
      fontFamily: 'var(--font-num, "Inter Tight", monospace)',
      color: '#FAFAF9',
      fontSize: 44, fontWeight: 800, letterSpacing: '-0.02em',
      lineHeight: 1,
    }}>
      <span style={{ opacity: 0.5, fontSize: 24, fontWeight: 700, letterSpacing: '0.04em', alignSelf: 'center' }}>{region}</span>
      <span style={{ color: '#FB923C' }}>{l1}</span>
      <span>{digits}</span>
      <span style={{ color: '#FB923C' }}>{l2}</span>
    </div>
  );
}

function VehiclesScreen({ activeTab = 'home', onTabChange, onMenu }) {
  const [tab, setTab] = React.useState('garage');

  const cars = [
    { id: 'v1', brand: 'Kia', model: 'K5', year: 2022, color: 'Чёрный',
      plate: { region: '01', l1: 'B', digits: '333', l2: 'BA' }, primary: true,
      lastSeen: 'сегодня, 09:14' },
    { id: 'v2', brand: 'Chevrolet', model: 'Cobalt', year: 2021, color: 'Белый',
      plate: { region: '01', l1: 'A', digits: '728', l2: 'BB' },
      lastSeen: 'вчера, 21:40' },
  ];

  const primary = cars.find(c => c.primary) || cars[0];

  return (
    <div className="kz-screen" style={{ minHeight: '100%', background: '#0C0A09', paddingBottom: 110, color: '#FAFAF9' }}>

      {/* ═══════════ HERO (dark) ═══════════ */}
      <div style={{
        position: 'relative',
        background: 'radial-gradient(110% 80% at 80% 0%, rgba(217,119,6,0.22) 0%, transparent 55%), linear-gradient(180deg, #1C1917 0%, #0C0A09 100%)',
        padding: '54px 0 0',
        overflow: 'hidden',
      }}>
        {/* Garage glow only — grid texture removed */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0, pointerEvents: 'none',
        }} />

        {/* Top bar */}
        <div style={{
          position: 'relative',
          padding: '0 16px 8px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <button onClick={onMenu} style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'rgba(250,250,249,0.08)', border: '1px solid rgba(250,250,249,0.1)',
            display: 'grid', placeItems: 'center', color: '#FAFAF9', cursor: 'pointer',
          }} aria-label="Меню">
            <svg width="20" height="14" viewBox="0 0 20 14">
              <rect y="0" width="20" height="2.5" rx="1.25" fill="#FB923C" />
              <rect y="5.75" width="14" height="2.5" rx="1.25" fill="#FB923C" />
              <rect y="11.5" width="20" height="2.5" rx="1.25" fill="#FB923C" />
            </svg>
          </button>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase',
            color: 'rgba(250,250,249,0.5)',
          }}>Гараж · Дом 12А</div>
          <button style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'rgba(250,250,249,0.08)', border: '1px solid rgba(250,250,249,0.1)',
            display: 'grid', placeItems: 'center', color: '#FAFAF9', cursor: 'pointer', position: 'relative',
          }} aria-label="Уведомления">
            <IBell size={19} />
            <span style={{ position: 'absolute', top: 5, right: 5, width: 8, height: 8, borderRadius: 999, background: '#FB923C', border: '1.5px solid #1C1917' }} />
          </button>
        </div>

        {/* Hero (only in garage tab): filled → car silhouette + plate; empty → covered car + add */}
        {tab === 'garage' && cars.length > 0 && (
          <div style={{ position: 'relative', padding: '8px 22px 18px' }}>
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <CoveredCar />
            </div>
            <div style={{ position: 'relative', marginTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: '#FB923C', textTransform: 'uppercase', marginBottom: 10 }}>Основной автомобиль</div>
              <PlateHero {...primary.plate} />
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 16, whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em' }}>{primary.brand} {primary.model}</span>
                <span style={{ fontSize: 13, color: 'rgba(250,250,249,0.5)' }}>{primary.year} · {primary.color}</span>
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(250,250,249,0.55)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: '#22C55E' }} />
                На парковке · {primary.lastSeen}
              </div>
            </div>
          </div>
        )}

        {/* Empty garage state */}
        {tab === 'garage' && cars.length === 0 && (
          <div style={{ position: 'relative', padding: '24px 22px 18px' }}>
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 4, paddingBottom: 6 }}>
              <CoveredCar />
              <button style={{
                marginTop: 18, padding: '15px 40px', borderRadius: 16, border: 'none', cursor: 'pointer',
                background: 'var(--brand)', color: '#fff', fontSize: 17, fontWeight: 750, letterSpacing: '-0.01em',
                boxShadow: '0 8px 22px rgba(249,115,22,0.4)',
                display: 'inline-flex', alignItems: 'center', gap: 9,
              }}>
                <IPlus size={20} stroke={2.6} /> Добавить авто
              </button>
              <div style={{ marginTop: 12, fontSize: 12.5, color: 'rgba(250,250,249,0.5)' }}>
                В гараже пока пусто — добавьте первое авто
              </div>
            </div>
          </div>
        )}

        {tab === 'search' && (
          <div style={{ position: 'relative', padding: '32px 22px 24px', textAlign: 'left' }}>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.14em',
              color: '#FB923C', textTransform: 'uppercase', marginBottom: 8,
            }}>
              Найти владельца
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', textWrap: 'pretty', maxWidth: 280 }}>
              Чьё это авто во дворе?
            </div>
            <div style={{ fontSize: 13, color: 'rgba(250,250,249,0.55)', marginTop: 6, maxWidth: 290 }}>
              Введите номер — найдём соседа среди жителей вашего дома.
            </div>
          </div>
        )}

        {/* In-hero switcher capsule */}
        <div style={{
          position: 'relative',
          margin: '0 16px',
          padding: 4,
          background: 'rgba(0,0,0,0.5)',
          border: '1px solid rgba(250,250,249,0.08)',
          borderRadius: 999,
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          backdropFilter: 'blur(10px)',
        }}>
          <button onClick={() => setTab('garage')} style={{
            padding: '11px 12px', borderRadius: 999,
            background: tab === 'garage' ? '#FAFAF9' : 'transparent',
            color: tab === 'garage' ? '#1C1917' : 'rgba(250,250,249,0.7)',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            fontSize: 13.5, fontWeight: 700, letterSpacing: '-0.01em',
          }}>
            Мой гараж
            <span style={{
              minWidth: 20, height: 20, padding: '0 6px',
              borderRadius: 999,
              background: tab === 'garage' ? '#1C1917' : 'rgba(250,250,249,0.15)',
              color: tab === 'garage' ? '#FB923C' : 'rgba(250,250,249,0.7)',
              fontSize: 11, fontWeight: 800,
              display: 'grid', placeItems: 'center',
            }}>{cars.length}</span>
          </button>
          <button onClick={() => setTab('search')} style={{
            padding: '11px 12px', borderRadius: 999,
            background: tab === 'search' ? '#FB923C' : 'transparent',
            color: tab === 'search' ? '#1C1917' : 'rgba(250,250,249,0.7)',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            fontSize: 13.5, fontWeight: 700, letterSpacing: '-0.01em',
          }}>
            <ISearch size={14} stroke={2.4} />
            Поиск
          </button>
        </div>

        {/* hero bottom curve into light */}
        <div style={{ height: 24, marginTop: 18, background: 'var(--bg, #F5F5F4)', borderRadius: '24px 24px 0 0' }} />
      </div>

      {/* ═══════════ BODY (light) ═══════════ */}
      <div style={{ background: 'var(--bg, #F5F5F4)', color: 'var(--text, #1C1917)', padding: '4px 16px 0' }}>

        {tab === 'garage' && (
          <>
            {/* Quick row of cars (horizontal) */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 4px 10px',
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--text-3)', textTransform: 'uppercase' }}>
                Все автомобили · {cars.length}
              </span>
              <button style={{
                fontSize: 13, fontWeight: 650, color: 'var(--amber-700)',
                background: 'transparent', border: 'none', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                <IPlus size={14} stroke={2.4} /> Добавить
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {cars.map(c => (
                <div key={c.id} style={{
                  background: '#fff', borderRadius: 18, padding: 14,
                  border: '1px solid var(--border)',
                  boxShadow: 'var(--sh-1)',
                  display: 'flex', flexDirection: 'column', gap: 12,
                }}>
                  {/* Plate ribbon — big, the dominant element */}
                  <div style={{
                    background: 'linear-gradient(180deg, #FAFAF9 0%, #F5F5F4 100%)',
                    border: '1.5px solid #1C1917',
                    borderRadius: 10,
                    padding: '10px 12px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    fontFamily: 'var(--font-num, "Inter Tight", monospace)',
                    fontSize: 22, fontWeight: 800, letterSpacing: '0.06em',
                    color: '#1C1917',
                  }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ color: 'var(--text-3)' }}>{c.plate.region}</span>
                      <span>{c.plate.l1}</span>
                      <span>{c.plate.digits}</span>
                      <span>{c.plate.l2}</span>
                    </span>
                    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                      <span style={{ width: 22, height: 16, borderRadius: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <span style={{ flex: 1, background: '#1EB4E2' }} />
                        <span style={{ flex: 1, background: '#CE1126' }} />
                        <span style={{ flex: 1, background: '#1A9847' }} />
                      </span>
                      <span style={{ fontSize: 9, fontWeight: 800 }}>UZ</span>
                    </span>
                  </div>

                  {/* meta row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>
                        {c.brand} {c.model}
                        {c.primary && <span style={{
                          marginLeft: 8, fontSize: 10, fontWeight: 800, letterSpacing: '0.04em',
                          color: 'var(--amber-800)', background: 'var(--amber-100)',
                          padding: '2px 7px', borderRadius: 999, textTransform: 'uppercase',
                          verticalAlign: 'middle',
                        }}>основной</span>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                        {c.year} · {c.color} · {c.lastSeen}
                      </div>
                    </div>
                    <button style={{
                      width: 32, height: 32, borderRadius: 999,
                      background: 'var(--stone-100)', border: 'none', cursor: 'pointer',
                      color: 'var(--text-2)', display: 'grid', placeItems: 'center',
                    }} aria-label="Действия">
                      <IDots size={16} />
                    </button>
                  </div>
                </div>
              ))}

              <button style={{
                background: 'transparent', border: '1.5px dashed var(--stone-300)',
                borderRadius: 18, padding: '18px 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                color: 'var(--text-2)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}>
                <IPlus size={16} stroke={2.4} /> Добавить ещё одно авто
              </button>
            </div>
          </>
        )}

        {tab === 'search' && (
          <>
            {/* Big plate input as the focal block */}
            <div style={{
              background: '#fff', borderRadius: 22,
              border: '1px solid var(--border)', boxShadow: 'var(--sh-1)',
              padding: '20px 16px',
              marginTop: 14,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
            }}>
              <PlateBigInput />
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                Введите любую часть номера
              </div>
              <button style={{
                marginTop: 4, width: '100%',
                padding: '13px 16px', borderRadius: 12,
                background: 'var(--amber-600)', color: '#fff', border: 'none',
                fontSize: 14.5, fontWeight: 700, letterSpacing: '-0.01em',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                cursor: 'pointer', boxShadow: 'var(--sh-amber)',
              }}>
                <ISearch size={16} stroke={2.4} /> Найти владельца
              </button>
            </div>

            {/* Recent searches */}
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--text-3)', textTransform: 'uppercase', padding: '0 4px 8px' }}>
                Недавние поиски
              </div>
              <div style={{ background: '#fff', borderRadius: 16, border: '1px solid var(--border)', boxShadow: 'var(--sh-1)', overflow: 'hidden' }}>
                {[
                  { plate: { region: '01', l1: 'A', digits: '728', l2: 'BB' }, when: '2 дня назад', match: 'Найдено' },
                  { plate: { region: '01', l1: 'C', digits: '450', l2: 'KZ' }, when: '5 дней назад', match: 'Не найдено' },
                ].map((r, i) => (
                  <button key={i} style={{
                    width: '100%',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    padding: '12px 14px',
                    background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                    borderBottom: i === 0 ? '1px solid var(--hairline)' : 'none',
                  }}>
                    <span style={{
                      fontFamily: 'var(--font-num, "Inter Tight", monospace)',
                      fontSize: 15, fontWeight: 800, letterSpacing: '0.04em', color: 'var(--text)',
                    }}>
                      {r.plate.region} {r.plate.l1} {r.plate.digits} {r.plate.l2}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontSize: 10.5, fontWeight: 700, letterSpacing: '0.02em',
                        padding: '3px 8px', borderRadius: 999,
                        background: r.match === 'Найдено' ? 'var(--success-bg, #DCFCE7)' : 'var(--stone-100)',
                        color: r.match === 'Найдено' ? 'var(--success, #16A34A)' : 'var(--text-3)',
                      }}>{r.match}</span>
                      <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{r.when}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Hint */}
            <div style={{
              marginTop: 14, padding: '12px 14px',
              background: 'var(--amber-50)', borderRadius: 14,
              border: '1px solid var(--amber-200)',
              display: 'flex', alignItems: 'flex-start', gap: 10,
            }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: '#fff', color: 'var(--amber-700)', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
                <IInfo size={14} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--amber-800)', lineHeight: 1.45 }}>
                Поиск работает только среди машин жителей. Если авто не найдено — обратитесь на пост охраны.
              </div>
            </div>
          </>
        )}
      </div>

      <TabBar active={activeTab} onChange={onTabChange} />
    </div>
  );
}

Object.assign(window, { VehiclesScreen, PlateBigInput, PlateHero });
