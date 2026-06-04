# Resident Home — Official Design Reference

This file describes the canonical visual design of the **Resident Home** screen
for the Kamizo PWA. The companion file [`resident-home.png`](./resident-home.png)
is the binary mockup; this markdown is its faithful text description so the
design can be applied without re-loading the image.

**Source of truth rule:** any future change to the Resident Home UI MUST be
compared against this mockup and made to match it as closely as possible
(layout, colors, spacing, radii, positions). The mockup wins over current code.

Target screen file: [`src/frontend/src/pages/resident/design/ResidentHomeDesign.tsx`](../../src/frontend/src/pages/resident/design/ResidentHomeDesign.tsx)

---

## 1. Top-to-bottom layout order

1. **iOS status bar** — system text/icons painted over the brown hero (no
   separate bar; the hero extends behind the safe-area-inset-top).
2. **Hero card** — dark-brown gradient, full-bleed horizontally, rounded only
   at the bottom corners (`border-radius: 0 0 28px 28px`). Contains:
   - top row: hamburger button (left), centered K-tile + "Kamizo Demo"
     wordmark, notification bell (right) with red unread badge
   - greeting `Добрый вечер 👋`
   - resident name (large display)
   - address pill
   - active-requests square chip (right, vertically aligned to address row)
   - city silhouette layer painted behind the lower half of the hero
3. **Carousel** — swipeable card stack ~210px tall, first card is the
   "Завершите регистрацию" teal banner with `ВАЖНО` chip
4. **Dots indicator** — 6 dots, the active one is a wide pill in brand orange
5. **Quick action tiles** — 4 white rounded square cards in one row:
   `Заявка / Пропуск / Оплата / Авто`
   - Пропуск has an orange `1` numeric badge (top-right of icon)
   - Авто has an orange `2` numeric badge
   - Оплата has a small grey lock badge (locked / coming soon)
6. **Approval card** (when applicable) — soft cream tinted card with
   `ЖДЁТ ВАШЕЙ ОЦЕНКИ` label, request title `Замена смесителя · #1840`,
   subtitle `Бахтиёр Р. · работа заняла 45 мин`, then a row of
   `Принять работу` (orange CTA) + `Подробнее` (white outlined button)
7. **Other sections below** — Собрание, Оплата ЖКУ card, Объявления mini,
   PWA install banner (not visible in this crop but part of the screen)
8. **Floating BottomBar** — fixed pill at the bottom containing
   `Главная` / document / `+` (orange FAB, centered) / chat / profile

---

## 2. Color palette (observed)

| Token | Hex | Where |
|---|---|---|
| Hero gradient start | `#4A3B30` | top of dark hero |
| Hero gradient mid   | `#34291F` | 55% stop |
| Hero gradient end   | `#2A2018` | bottom of hero, also the dark surface token |
| Warm white (on dark)| `#F4F0E8` | "Фарход", "Kamizo", address text, greeting |
| Warm orange tint    | `#FDBA74` | menu icon strokes, K-tile letter, active-count digit |
| Brand orange        | `#F97316` | FAB, CTA, dot indicator active |
| Brand orange dark   | `#EA580C` | gradient end of orange |
| City silhouette     | `#000` @ `opacity: 0.42` over brown | buildings |
| Window squares      | `rgba(255, 230, 200, 0.35)` | tiny windows on silhouettes |
| Teal card start     | `#2DD4BF` | "Завершите регистрацию" gradient start |
| Teal card end       | `#0E9488` | gradient end |
| Cream approval bg   | `linear-gradient(135deg, #FFF3EA → #FFE6D2)` | pending approval card |
| Page background     | `#F7F8FA` (= `--app-bg`) | everything below the hero |
| Tile card bg        | `#FFFFFF` (= `--surface`) | quick action tiles |
| Tile icon bg        | `rgba(249,115,22,0.12)` (= `--brand-tint`) | round icon plate inside each tile |
| Status critical bg  | `#EF4444` | unread badge on bell |

---

## 3. Hero — anatomy & metrics

```
┌─────────────────────────────────────────────────┐  ← y=0 of the screen
│   [iOS status bar text painted over brown]      │
│                                                 │
│   [≡]          [K] Kamizo Demo            [🔔²] │  top row, marginBottom: 18
│                                                 │
│                                                 │
│   Добрый вечер 👋                               │  fontSize: 15, color: rgba(244,240,232,0.78)
│                                                 │
│   Фарход                                  ┌───┐ │  fontSize: 48, fontWeight: 800,
│                                           │ 2 │ │   color: #F4F0E8, letterSpacing: -0.04em
│                                           │   │ │  active-count chip:
│   ┌────────────────────────────────┐      │ а │ │   padding: 16/18, minWidth: 88,
│   │ 📍  ул. Навои, 25 · кв. 45     │      │ з │ │   borderRadius: 18,
│   └────────────────────────────────┘      └───┘ │   digit: 34/800 #FDBA74
│                                                 │   label: 11/600 rgba(244,240,232,0.8)
│ [city silhouette rendered across bottom half]   │
└─────────────────────────────────────────────────┘  ← rounded-bottom only: 0 0 28px 28px
```

- **Background**: `linear-gradient(160deg, #4A3B30 0%, #34291F 55%, #2A2018 100%)`,
  plus a radial overlay (rgba 251,146,60,0.5 / 217,119,6,0.18) at `opacity: 0.55`,
  plus the SVG city silhouette layer.
- **Padding**: `calc(env(safe-area-inset-top, 0px) + 12px) 18px 22px`. No
  flat 52px top — it must respect the iOS notch via env().
- **Border radius**: `0 0 28px 28px` (top corners flush with the screen edges).
- **Width**: full viewport — kz-screen wrapper forced `width: 100vw` with
  `marginLeft: calc(50% - 50vw)` to neutralise any inherited horizontal padding.

### Top row controls (44×44 buttons, radius 14)

| Control | Position | Background | Icon |
|---|---|---|---|
| Hamburger (menu) | left | `rgba(244,240,232,0.12)` + 1px border `rgba(244,240,232,0.14)` | 3 stacked orange `#FDBA74` bars (22w × 3h, second 15w) |
| K + Kamizo (centered) | absolute `left: 50%; transform: translate(-50%, -50%)` | K tile: 34×34, radius 10, `rgba(249,115,22,0.22)` + border `rgba(249,115,22,0.4)`, text `#FDBA74` 18/800; wordmark: 19/700, `#F4F0E8` | — |
| Bell | right | same as menu | lucide-Bell 20px, `#F4F0E8` |
| Bell unread badge | top-right of bell | `#EF4444` (status critical) | 10/800 white text, 2px brown border |

### Greeting / name / address / active-count column

- Greeting: time-of-day aware (`Доброе утро/день/вечер` / `Доброй ночи`),
  `fontSize: 15`, `fontWeight: 600`, color `rgba(244,240,232,0.78)`.
- Name: `fontSize: 48`, `fontWeight: 800`, `letterSpacing: -0.04em`,
  `lineHeight: 1`, `color: #F4F0E8`, `marginTop: 6`.
- Address pill: `padding: 9px 14px`, `borderRadius: 14`,
  `background: rgba(244,240,232,0.12)`, border `rgba(244,240,232,0.14)`,
  `fontSize: 13.5`, `fontWeight: 600`, `color: #F4F0E8`, `backdrop-filter: blur(8px)`.
  Pin icon `#FB923C`, size 15.
- Active-count card (right edge of the bottom row):
  `padding: 16px 18px`, `borderRadius: 18`, `minWidth: 88`,
  `background: rgba(249,115,22,0.22)`, border `rgba(249,115,22,0.4)`,
  `backdrop-filter: blur(6px)`; digit 34/800 `#FDBA74`; sub-label two lines
  `активные / заявки`, 11/600, `rgba(244,240,232,0.8)`.

### City silhouette layer

Painted with a single inline SVG, `viewBox="0 0 400 140"`,
`preserveAspectRatio="none"`, positioned `bottom: 0`, `width: 100%`,
`height: 62%`, `opacity: 0.42`, `pointer-events: none`. Ten rectangular
buildings of varying heights, each given a programmatic grid of tiny window
rectangles (5×5, alpha 0.35 warm white).

---

## 4. Carousel section

- Wrapper padding: `0 16px`, margin-top above: `18`.
- Stack height: **210**.
- Card border-radius: `26`.
- First card when `needsRegistration === true`: teal
  `linear-gradient(150deg, #2DD4BF 0%, #0E9488 100%)`, badge `Важно`
  (uppercase), title `Завершите регистрацию`, sub `Не заполнено: пароль`,
  CTA pill `Заполнить →`, faint check silhouette decoration.
- Decorative shapes: a `150×150` circle `rgba(255,255,255,0.1)` at `top: -50, right: -40`,
  and a silhouette glyph (people / qr / star / phone / car / check) at 0.16 opacity.
- Title: 26/800, letterSpacing -0.025em.
- Subtitle: 13.5/normal, opacity 0.88, `marginTop: 8`.
- CTA pill: `rgba(255,255,255,0.22)` + `backdrop-filter: blur(10px)`,
  `padding: 10px 18px`, `borderRadius: 14`, 14/700.
- Shadow on active card: `0 18px 44px -10px ${cardShadowColor}`.

## 5. Dots indicator

- Centered row, `gap: 6`, `marginTop: 14`.
- Inactive dot: `width: 7, height: 7, borderRadius: 4, background: #D6D3D1 (--stone-300)`.
- Active dot: `width: 22, height: 7, background: #F97316 (--brand-500)`.

## 6. Quick action tiles (4-up)

- `display: grid; grid-template-columns: repeat(4, 1fr); gap: 10`.
- Tile: `background: #FFFFFF`, `border: 1px solid rgba(28,25,23,0.08)`,
  `borderRadius: 20`, `padding: 14px 8px`, `boxShadow: 0 4px 14px rgba(28,25,23,0.06)`.
- Icon plate: 46×46 circle, `background: rgba(249,115,22,0.12)`, color `#EA580C`.
- Label: 12.5/650, `color: #111827` (`--text-primary`).
- Badge (e.g. Пропуск=1, Авто=2): orange circle at top: -4, right: -6,
  `minWidth: 20, height: 20, padding: 0 6, background: #F97316`, white text 11/800,
  `border: 2px solid #FFFFFF`, `boxShadow: 0 2px 6px rgba(249,115,22,0.4)`.
- Lock badge (Оплата): same size, `background: #FFFFFF`, lock icon 11px,
  grey color `#9CA3AF`.

## 7. Approval card (pending rating)

- Outer: `background: linear-gradient(135deg, #FFF3EA → #FFE6D2)`,
  `border: 1px solid #FED7AA (--brand-200)`, `borderRadius: 20`, `padding: 16`,
  shadow `0 4px 14px rgba(28,25,23,0.06)`.
- Avatar tile: 44×44 white circle, radius 13, check icon 22/2.4 stroke,
  ring shadow `0 0 0 4px rgba(249,115,22,0.12)`.
- Eyebrow: `ЖДЁТ ВАШЕЙ ОЦЕНКИ` 11.5/800 uppercase, `color: #EA580C`.
- Title: 16/700 `color: #111827`, format `Замена смесителя · #1840`.
- Subtitle: 13 `#6B7280`, format `Бахтиёр Р. · работа заняла 45 мин`.
- Primary CTA: full-flex, 12px padding, radius 14, `background: #F97316`,
  white text 14/700, shadow `0 8px 22px rgba(249,115,22,0.35)`.
- Secondary CTA: white bg, `border: 1px solid rgba(28,25,23,0.08)`,
  text `#111827` 14/650, padding 12/16.

## 8. Floating BottomBar (TabBar)

- Outer wrapper: `position: fixed; bottom: 0; left: 0; right: 0; z-index: 40;
  padding: 0 14px env(safe-area-inset-bottom, 0px); pointer-events: none`.
- **No extra `+14px` bottom offset.** Pill sits directly on top of the iOS
  home-indicator safe area.
- **No painted wash strip** behind the safe-area-inset-bottom — the page bg
  shows through.
- Pill: `max-width: 480; margin: 0 auto`, `background: rgba(255,255,255,0.92)`,
  `backdrop-filter: blur(16px) saturate(180%)`, border `rgba(255,255,255,0.7)`,
  `borderRadius: 26`, shadow `0 10px 30px rgba(28,25,23,0.14), 0 2px 6px rgba(28,25,23,0.06)`,
  `padding: 8px 10px`.
- Items (left → right): `Главная`, document, `+` (FAB, centered),
  chat, profile.
- Active item: orange tinted pill `background: rgba(249,115,22,0.12)`,
  text `#EA580C`, padding `9px 15px`, label visible.
- Inactive items: 9px 11px, only icon, color `#9CA3AF` (`--text-muted`).
- FAB: 52×52 circle, `linear-gradient(135deg, #FB923C, #EA580C)`,
  shadow `0 6px 16px rgba(249,115,22,0.45)`, plus icon 25/2.6 stroke.

---

## 9. Spacing rhythm (from hero down)

| From → To | Value |
|---|---|
| safe-area-inset-top → menu/Kamizo/bell row | 12 |
| top row → greeting row | marginBottom 18 |
| greeting → name | marginTop 6 |
| name → address pill | marginTop 16 |
| hero → carousel | section marginTop 18 |
| carousel → dots | 14 |
| dots → quick tiles | section marginTop 16 (≈) |
| quick tiles → approval | section marginTop 16 |
| approval → next section | section marginTop 16 |
| last content → BottomBar | hero wrapper has `padding-bottom: 110` |

---

## 10. PWA / system chrome

- `apple-mobile-web-app-status-bar-style: black-translucent` (in
  [`index.html`](../../src/frontend/index.html)) — web view extends behind
  the iOS status bar.
- `theme-color: #34291F` (matches the hero brown) — tints Android Chrome bar
  and PWA chrome to the same brown.
- `viewport-fit=cover` — required for `env(safe-area-inset-*)` to return real values.
- The hero card itself is the only brown surface in the screen; `html`/`body`
  background must remain `var(--app-bg) = #F7F8FA`.

---

## 11. Image file

The binary mockup must live next to this file at
[`resident-home.png`](./resident-home.png). Save it from the message thread
("Save image as…") if missing. This markdown stays authoritative if the PNG
isn't present — every visual decision is recorded above.
