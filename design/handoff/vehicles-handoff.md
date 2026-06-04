# Vehicles (Авто) page — Claude Design handoff

**Source:** https://api.anthropic.com/v1/design/h/AIwVkQyjtG6zhZbhPP7ULg?open_file=screens%2F05-transport.html
**Bundle:** [`README-handoff.md`](./README-handoff.md) (`kamizo-handoff.tar.gz`, 4 355 072 B, fetched 2026-06-04)
**Target file:** [`screens/05-transport.html`](./vehicles-05-transport.html) → React component → [`src/frontend/src/pages/ResidentVehiclesPage.tsx`](../../src/frontend/src/pages/ResidentVehiclesPage.tsx)

This is the **single source of truth** for the Vehicles page. Supersedes the older light-header revert in `recovery/jun4-ui` — that branch is for history only and must NOT be merged for Vehicles.

Companion raw files saved here for reproducibility:

| File | Purpose |
|---|---|
| [`vehicles-05-transport.html`](./vehicles-05-transport.html) | The HTML entry point Claude Design exported (loads the JSX bundle) |
| [`kamizo-vehicles.jsx`](./kamizo-vehicles.jsx) | The actual VehiclesScreen JSX prototype (604 lines) — primary spec |
| [`tokens.css`](./tokens.css) | Design tokens (brand, amber, stone, ink, surfaces, shadows) |
| [`README-handoff.md`](./README-handoff.md) | Anthropic's handoff README ("read this first") |

---

## 1. Overall structure

```
ResidentVehiclesPage
├── HERO (dark, full-bleed)
│   ├── Top bar
│   │   ├── ≡ menu button (left, dark glass, orange icon)
│   │   ├── "ГАРАЖ · ДОМ 12А" eyebrow label (centered, uppercase, 16 % tracking)
│   │   └── 🔔 bell button with orange dot (right, dark glass)
│   ├── tab === 'garage' && cars.length > 0
│   │   ├── <CoveredCar /> SVG silhouette of car under cover
│   │   ├── "ОСНОВНОЙ АВТОМОБИЛЬ" eyebrow (#FB923C, 14 % tracking)
│   │   ├── PlateHero (typographic plate, orange letters, 44 px)
│   │   ├── "{brand} {model}" + "{year} · {color}" meta row
│   │   └── parking-status row: green dot + "На парковке · сегодня, 09:14"
│   ├── tab === 'garage' && cars.length === 0
│   │   ├── <CoveredCar /> silhouette
│   │   ├── orange CTA "+ Добавить авто" (brand bg, 22 px brand-shadow)
│   │   └── "В гараже пока пусто — добавьте первое авто" caption
│   ├── tab === 'search'
│   │   ├── "НАЙТИ ВЛАДЕЛЬЦА" eyebrow (#FB923C)
│   │   ├── h1 24/700 "Чьё это авто во дворе?"
│   │   └── 13 px subtitle "Введите номер — найдём соседа среди жителей вашего дома."
│   ├── Toggle capsule (rounded-full, black/50 bg, 1 px stone border)
│   │   ├── "Мой гараж {count}" (active: ivory bg / ink text + ink badge w/ orange count)
│   │   └── "🔍 Поиск" (active: orange bg / ink text)
│   └── Hero bottom curve into light body — 24 px tall light tile w/ 24 px top radius
├── BODY (light, --bg/--app-bg)
│   ├── tab === 'garage'
│   │   ├── Section label "ВСЕ АВТОМОБИЛИ · {n}" + "+ Добавить" amber link
│   │   ├── Each car card (white, 18 px radius, --sh-1)
│   │   │   ├── Plate ribbon: 1.5 px ink border, fNum 22/800, region dim, UZ flag column
│   │   │   └── Meta row: "{brand} {model}" + [ОСНОВНОЙ amber chip] | year · color · lastSeen | ⋮ button
│   │   └── Dashed "+ Добавить ещё одно авто" tile (border-strong dashed, --text-2)
│   └── tab === 'search'
│       ├── White card (22 px radius, --sh-1)
│       │   ├── PlateBigInput (340 px max, 2.5 px ink border, fNum 28/700, UZ flag right)
│       │   ├── 12 px caption "Введите любую часть номера"
│       │   └── Brand-orange "🔍 Найти владельца" CTA (12 px radius, --sh-amber)
│       ├── "НЕДАВНИЕ ПОИСКИ" eyebrow
│       ├── Recent searches card (white, 16 px radius, --sh-1)
│       │   └── Rows: "01 A 728 BB" + [Найдено / Не найдено chip] + "2 дня назад"
│       └── Amber hint card (--amber-50 bg + --amber-200 border, 14 px radius)
│           └── ℹ + "Поиск работает только среди машин жителей. Если авто не найдено — обратитесь на пост охраны."
└── TabBar (global resident bottom bar)
```

## 2. Tokens used (see [`tokens.css`](./tokens.css))

| Token | Value | Where |
|---|---|---|
| `--brand` / `--brand-500` | `#F97316` | "+ Добавить авто" CTA, orange flag stripe |
| `--brand-light` / `#FB923C` | `#FB923C` | menu icon strokes, plate letter accents, search-toggle active, bell dot, eyebrow labels |
| `--brand-dark` / `--amber-700` | `#C2410C` | "Добавить" link in section header |
| `--amber-50` | `#FFF3EA` | hint card bg |
| `--amber-100` | `#FFE6D2` | "ОСНОВНОЙ" pill bg |
| `--amber-200` | `#FED7AA` | hint card border |
| `--amber-600` | `#EA580C` | "Найти владельца" CTA bg |
| `--amber-800` | `#9A3412` | "ОСНОВНОЙ" pill text, hint card text |
| `--bg` / `--app-bg` | `#F4F0E8` | light body bg, hero bottom-curve tile |
| `--surface` | `#FFFFFF` | car cards, search white card, recent-searches card |
| `--ink` / `#1C1917` | `#1C1917` | dark hero secondary stop, plate borders, primary text |
| `#0C0A09` | `#0C0A09` | dark hero terminal stop |
| `--stone-100` | `#F4F0E8` | inactive ⋮ button bg, "Не найдено" chip bg |
| `--stone-300` | `#D8CFBE` | dashed border for "+ Добавить ещё" |
| `--stone-400` | `#A8A29E` | dim region label inside plate |
| `--text-2` | `#6F6A62` | secondary text (⋮ icon color, dashed-tile label) |
| `--text-3` | `#A8A29E` | tertiary (year · color, eyebrow labels) |
| `--hairline` | (warm 0.06) | divider inside recent-searches list |
| `--sh-1` | (warm card shadow) | car cards, recent-searches card, search white card |
| `--sh-amber` | (orange CTA shadow) | "Найти владельца" CTA |
| `--success` / `#16A34A` | `#16A34A` | "Найдено" pill text |
| `--success-bg` / `#DCFCE7` | `#DCFCE7` | "Найдено" pill bg |
| `--font-num` (`Inter Tight`, monospace) | — | every plate digit, recent-search row plate |
| Status green dot `#22C55E` | inline | "На парковке" indicator |

## 3. Hero spec (per [`kamizo-vehicles.jsx`](./kamizo-vehicles.jsx) lines 258–419)

```ts
background: 'radial-gradient(110% 80% at 80% 0%, rgba(217,119,6,0.22) 0%, transparent 55%), linear-gradient(180deg, #1C1917 0%, #0C0A09 100%)'
padding: '54px 0 0'   // handoff value; in PWA we use 'calc(14px + env(safe-area-inset-top)) 0 0' so the bar sits below the notch
borderRadius: 0       // bottom shape comes from the 24 px light tile, not the hero corner
text color: '#FAFAF9'
```

- **Top bar**: padding `0 16px 8px`. Menu button 40 × 40 / 12 px radius / `rgba(250,250,249,0.08)` bg / `1px rgba(250,250,249,0.1)` border. Bell mirrors the menu, has an 8 × 8 orange dot at `top:5, right:5` w/ 1.5 px `#1C1917` border. Center label is 11 px / 700 / 16 % tracking / uppercase / `rgba(250,250,249,0.5)`.
- **Hero plate** (`PlateHero` lines 241–256): inline-flex baseline gap 10, fontFamily `var(--font-num, "Inter Tight", monospace)`, color `#FAFAF9`, fontSize 44, weight 800, letterSpacing `-0.02em`. Region span: opacity 0.5, fontSize 24, weight 700, tracking 4 %. Letters wrap in `#FB923C`. Digits warm white.
- **Meta row** (lines 327–334): brand 21 / 700 / `-0.02em`, year+color 13 / `rgba(250,250,249,0.5)`. 6 × 6 green `#22C55E` dot + 12 / `rgba(250,250,249,0.55)` "На парковке · {lastSeen}".
- **Empty state** (lines 340–357): `+` icon 20 + "Добавить авто", 17 / 750, padding 15 × 40, radius 16, brand bg, shadow `0 8px 22px rgba(249,115,22,0.4)`.
- **Search heading** (lines 359–374): eyebrow 11 / 700 / 14 % tracking `#FB923C`, h1 24 / 700 / `-0.02em` "Чьё это авто во дворе?", subtitle 13 / `rgba(250,250,249,0.55)`.
- **Toggle capsule** (lines 376–416): wraps in `0 16px` margin, padding 4, bg `rgba(0,0,0,0.5)`, border `1px rgba(250,250,249,0.08)`, radius 999, 2-col grid, backdrop-filter blur 10.
  - Garage active: bg `#FAFAF9`, text `#1C1917`, count chip bg `#1C1917`, count text `#FB923C`.
  - Garage idle: text `rgba(250,250,249,0.7)`, chip bg `rgba(250,250,249,0.15)`.
  - Search active: bg `#FB923C`, text `#1C1917`.
- **Bottom curve**: `<div style={{ height: 24, marginTop: 18, background: 'var(--bg, #F5F5F4)', borderRadius: '24px 24px 0 0' }} />` — transitions hero into light body. Use `--app-bg` (`#F4F0E8`) in our tokens.

## 4. Light body — Garage (lines 425–516)

- Section header: "ВСЕ АВТОМОБИЛИ · {count}" 11 / 700 / 14 % tracking + amber `+ Добавить` link.
- Car card: `#fff` / 18 px radius / 1 px `--border` / `--sh-1`, flex column, gap 12, padding 14.
  - **Plate ribbon**: linear-gradient `#FAFAF9 → #F5F5F4`, 1.5 px `#1C1917` border, 10 px radius, padding `10px 12px`. Plate text fNum 22 / 800 / 6 % tracking / `#1C1917`. Region dim (`--text-3`). UZ flag column on the right: 22 × 16 px tricolour (`#1EB4E2` / `#CE1126` / `#1A9847`) + "UZ" 9 / 800 below.
  - **Meta row**: brand+model 15 / 700, [ОСНОВНОЙ chip 10 / 800 / amber], second line 12 / `--text-3` "{year} · {color} · {lastSeen}", ⋮ button 32 × 32 round `--stone-100` bg.
- Dashed "+ Добавить ещё одно авто" tile: bg transparent, 1.5 px dashed `--stone-300` border, 18 px radius, padding `18px 16px`, `--text-2` text.

## 5. Light body — Search (lines 518–595)

- **White search card**: 22 px radius, 1 px `--border`, `--sh-1`, padding `20px 16px`, flex column gap 10, center.
  - `<PlateBigInput />` (max-width 340): white bg, 2.5 px `#1C1917` border, 12 px radius, fNum 28 / 700 / 4 % tracking. Region column 64 px wide (label dim). Centre cell renders 3 spans (letter / digits / letter) spaced-around. Right cell 56 px wide with 2.5 px left border, 32 × 26 px flag block + "UZ" 13 / 800.
  - 12 px caption "Введите любую часть номера" `--text-3`.
  - CTA "🔍 Найти владельца": padding `13 16`, 12 px radius, `--amber-600` bg, 14.5 / 700, `--sh-amber`.
- **Recent searches** card: 16 px radius, 1 px `--border`, `--sh-1`, divided by 1 px `--hairline`. Each row: fNum 15 / 800 / 4 % tracking plate, [Найдено `--success` / Не найдено `--text-3` chip 10.5 / 700], 11.5 / `--text-3` relative time.
- **Hint card**: `--amber-50` bg, 1 px `--amber-200` border, 14 px radius, padding `12 14`, flex gap 10. 28 × 28 ℹ tile (`#fff` bg, `--amber-700` icon, 8 px radius). Body 12 / `--amber-800` / line-height 1.45.

## 6. Notes for the React port

- The handoff is **the visual reference**, not the React code we ship. Keep our existing store hooks (`useVehicleStore`, `searchVehiclesByPlate`), plate utilities (`parsePlateNumber`, `formatPlateDisplay`), modal flows (add/edit/delete), and tap-target rules. Replace only the presentation.
- `<TabBar>` in the handoff is the global resident BottomBar — we already render that via `ResidentHomeDesign`/Layout and on the Vehicles route we keep the global BottomBar.
- The hero uses `padding: '54px 0 0'` for the design canvas; on real iOS PWA we substitute `calc(14px + env(safe-area-inset-top)) 0 0` so the controls sit below the notch.
- `<CoveredCar />` was originally an `<img>` to `kamizo-car-cover.png`. We render the inline-SVG variant `<CoveredCarSVG />` (lines 134–193 of the JSX) so no asset is needed.
- Replace `lucide-react` Plus/Search/etc. with the same lucide imports — they map 1:1 visually to handoff icons.
- Layout: keep the existing `isResidentVehicles → isResidentFullBleed` branch in `src/frontend/src/components/layout/Layout.tsx` so MobileHeader is hidden on `/vehicles` and the hero owns the top.
