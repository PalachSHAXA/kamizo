# Passes / guest access (resident) — Claude Design handoff

**Source bundle:** https://api.anthropic.com/v1/design/h/5RAuaSeM8hgmB_-V-Zg2SA?open_file=screens%2F06-propuska.html
**Primary screen:** `screens/06-propuska.html` (mounts `<GuestAccessScreen activeTab="home" />`)
**Fetched:** 2026-06-05
**Branch:** `feature/passes-handoff`

Single source of truth for the resident passes / guest-access screen. Implementation lives at
[src/frontend/src/pages/ResidentGuestAccessPage.tsx](src/frontend/src/pages/ResidentGuestAccessPage.tsx)
with helpers in [src/frontend/src/pages/guest-access/](src/frontend/src/pages/guest-access/).
Manager / admin / security guest-access surfaces are NOT in scope — only the resident page.

## Files in this folder
- `passes-handoff.md` — this spec
- `passes-06-propuska.html` — raw screen HTML
- `kamizo-passes.jsx` — the `GuestAccessScreen` component, top to bottom
- `tokens-passes.css` — full token sheet

## Visual structure (in render order)

### 1. Sticky header
- `position: sticky; top: 0; z-index: 5`
- `padding: 52px 16px 12px` (52 px clears the iOS status-bar zone)
- Translucent fill `rgba(244,240,232,0.92)` + `backdrop-filter: blur(14px)`
- Flex row: name block (eyebrow `QR-доступ` 11.5/700/uppercase + title `Пропуска` 24/800/-0.025em) + right-side history button (40×40, surface bg, 12 px radius, `IHistory` 18 px).

### 2. Body (`padding: 14px 16px`)

#### 2a. Ticket hero — shown when there's a current/most-recent pass to feature
Drop-shadow `0 16px 32px rgba(28,25,23,0.22)`. Card itself: brown gradient `linear-gradient(160deg, #4A3B30 0%, #2A2018 100%)`, `var(--radius-xl)`, `color: var(--text-on-dark)`.

Notches: two 18 × 18 circles `background: var(--app-bg)`, positioned at `left: -9`, `right: -9`, `top: 58%`, `z-index: 2` (carve the ticket sides).

Top section `padding: 18px 18px 0`:
- Orange radial overlay (40 % opacity, top-right).
- Status pill on the left: pulsing 6 px dot + uppercase label. Color depends on `code.status`:
  - `active` → `#86EFAC` on `rgba(34,197,94,0.18)`, dot `#22C55E`
  - `used`   → `#93C5FD` on `rgba(59,130,246,0.18)`, dot `#3B82F6`
  - `expired` / `revoked` → `#FCA5A5` on `rgba(226,72,61,0.18)`, dot `#E2483D`
- Time-left text on the right (12 / 600 / `rgba(244,240,232,0.7)`): `действует ещё N ч` / `использован` / `истёк` / `отозван`.
- Row: 7 px-padded white QR holder with `borderRadius: 14` (the real QR canvas / SVG, 108 px) + meta block (`Гость / Курьер / Такси / …` eyebrow, visitor name 19/800/-0.02em, sub-meta "Подъезд + двор\nИспользовано: x из y").

Perforation: `borderTop: 2px dashed rgba(244,240,232,0.22); margin: 0 14px`.

Actions grid `padding: 14`, 3 equal columns:
1. **Поделиться** — `IShare`, opens `navigator.share` with the QR + pass text (falls back to clipboard if Share API unavailable).
2. **Код** — `ICopy`, copies `qrToken` to clipboard.
3. **Отозвать** — `IClose`, danger variant (`rgba(226,72,61,0.18)` bg, `#FCA5A5` fg), opens the existing `ConfirmDialog`. Disabled (greyed) when status ≠ `active`.

### 2b. "Создать пропуск" 2-col grid
Uppercase 11 / 800 label `padding: 20px 2px 10px`. Then `grid-template-columns: 1fr 1fr; gap: 10`. Each tile:
- White surface, `var(--border-c)` border, `var(--radius-lg)`, `var(--shadow-sm)`, padding 14
- Icon box 40 × 40, `borderRadius: 12`, `var(--brand-tint)` bg, `var(--brand-dark)` fg
- Title 14.5 / 700 + sub 11.5 muted

Tiles in handoff order:
| Tile | Icon | Sub | Preset |
|---|---|---|---|
| Гость | `User` | до 24 ч | `{ visitor: 'guest', access: 'day' }` |
| Такси | `Car` | 1 проезд | `{ visitor: 'taxi', access: 'single_use' }` |
| Доставка | `Package` | на 2 ч | `{ visitor: 'courier', access: 'single_use' }` |
| Мастер | `Wrench` | по визиту | `{ visitor: 'other', access: 'day' }` |

Each tile click sets the preset and opens the existing `CreatePassForm` sheet.

### 2c. "Недавние" list
Uppercase 11 / 800 label `padding: 20px 2px 10px`. White card, `var(--radius-lg)`, 1 px border, `var(--shadow-sm)`, `overflow: hidden`. Each row:
- `padding: 13px 15px`, flex row gap 12, `1px solid var(--hairline)` between rows.
- 36 × 36 icon box `borderRadius: 10`, `var(--surface-sunken)` bg, `var(--text-secondary)` fg, `IQR` 17. Greyscale when expired.
- Two-line text: name (14 / 650) + `{type} · {when}` (11.5 muted).
- Trailing status pill (10.5 / 700, 3 × 9 padding, 999 radius):
  - `used` → `var(--status-info)` on `var(--status-info-bg)` — "Использован"
  - `expired` → `var(--status-expired)` on `var(--status-expired-bg)` — "Истёк"
  - `revoked` → `var(--status-critical)` on `var(--status-critical-bg)` — "Отозван"

Whole row tappable → opens the existing `QRCodeDisplay` modal for that code.

## Wiring contract — every action gets a real handler

| Action | Real handler / store call |
|---|---|
| Header History (40 × 40 button) | toggle `showHistorySheet` — same state as today (collapses recent-list to the archive view) |
| Hero status pill / time-left | derived from `code.status` + `code.validUntil` (no fetch, just memo) |
| Hero QR | `generateQRCodeCanvas(canvasRef.current, code.qrToken, …)` (existing utility used by `LatestPassHero`) |
| Hero "Поделиться" | `navigator.share({ files, text })` with combined pass image + text; clipboard fallback (existing flow in `QRCodeDisplay` reused) |
| Hero "Код" | `navigator.clipboard.writeText(code.qrToken)` + success toast (existing flow) |
| Hero "Отозвать" | `setShowRevokeConfirm(code)` → existing `ConfirmDialog` → `revokeGuestAccessCode(code.id, user.id, user.name, user.role, reason)` |
| Quick-create tile click | `setCreatePreset({ visitor, access })` + `setShowCreateForm(true)` — sheet opens via the existing `CreatePassForm` |
| Recent-list row tap | `setSelectedCode(code)` → existing `QRCodeDisplay` modal |
| Modal-presence | `useModalPresence(true)` inside `CreatePassForm` and `QRCodeDisplay` so the global BottomBar hides while either is open — the registry from `feature/hide-bottombar-on-overlays` |

Intentionally NOT in this handoff: a "Создать с нуля" path bypassing the 4 tiles (the existing form covers it from the tile presets), the manager / admin / security guest-access surfaces.

## Shell + BottomBar
- Page renders inside the global `Layout` with the shared `MobileHeader` (hidden on this route only if the user wants — for now we keep the global header AND a sticky in-page header per the handoff; the handoff's header is content-level, not a chrome strip, so they don't visually fight).
- `/guest-access` is added to `isResidentFullBleed` so `<main>` carries the `page-content-full-bleed` modifier and the page sees the raw 16 px the design specifies (no compounding from the per-device mobile auto-padding fix shipped in `fix/profile-width`).
- BottomBar stays portaled / fixed as it is everywhere else; `useModalPresence` in the create sheet + QR modal hides it while either is open.
- Warm beige `var(--app-bg)` background, light status bar via the global `theme-color = #F4F0E8` — unchanged.

## Out of scope
- Manager / admin / security guest-access pages
- BottomBar, Layout, Sidebar, Home, Chat, Profile, Vehicles
- Auth / password / verification
- Overlay-hide registry contract (still `modalStore.useModalPresence`)
