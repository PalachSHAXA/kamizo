# Sidebar / drawer (resident) — Claude Design handoff

**Source bundle:** https://api.anthropic.com/v1/design/h/AvDhWAmGxCW_QHFqiMuImg?open_file=screens%2F11-sidebar.html
**Primary screen:** `screens/11-sidebar.html` (mounts `<SidebarDrawer open={true} onClose={…} />` overlaying a dimmed Home)
**Fetched:** 2026-06-05
**Branch:** `feature/sidebar-handoff`

Single source of truth for the resident drawer. Implementation lives at
[src/frontend/src/components/layout/Sidebar.tsx](src/frontend/src/components/layout/Sidebar.tsx).
Staff drawers (admin / manager / director / executor / security / super-admin)
are NOT touched by this handoff — only the resident / tenant /
commercial_owner branch renders the new design.

## Files in this folder
- `sidebar-handoff.md` — this spec
- `sidebar-11-sidebar.html` — raw screen HTML (loader for the component below)
- `kamizo-sidebar.jsx` — the `SidebarDrawer` component, top-to-bottom
- `tokens-sidebar.css` — full token sheet

## Visual structure (in render order)

### 1. Backdrop
Full-viewport. `position: absolute; inset: 0`. `background: rgba(28,25,23,0.45)` + `backdropFilter: blur(2px)`. Tap to close.

### 2. Drawer
- Width 326 px, full height, anchored to the left edge.
- Background `var(--app-bg)` (warm beige #F4F0E8).
- Slide-in via `transform: translateX(0/-100%)` with `0.28s var(--ease-emphasized)`.
- Box shadow `0 0 50px rgba(28,25,23,0.22)`.
- Flex column, `overflow: hidden`.

### 3. Dark stone header
- `padding: 52px 18px 20px`, background `var(--dark-surface)` (#2A2018), color `var(--text-on-dark)`.
- Orange radial overlay top-right at 18 % opacity.
- Row: building tile (50 × 50, brand gradient, white IBuilding icon), name block, close X (32 × 32 glass circle).
  - Name block: 10.5 px uppercase **ТСЖ «{tenantName}»** in `#FDBA74`, then 17 px / 800 / `-0.02em` **Дом {building} · Кв. {apartment}** in white.
- Stats strip (marginTop 16): three equal cells with `1 px solid rgba(244,240,232,0.12)` dividers. Value 19 px / 800, label 10.5 px muted. Cells: `{totalArea} м² площадь`, `{vehicleCount} авто`, `{ukRating} рейтинг УК`.

### 4. Body
Scrollable, `padding: 16px 16px 12px`.

#### "БЫСТРЫЙ ДОСТУП" section
Uppercase 10.5 / 800 / `0.06em` letterspacing label in `var(--text-secondary)`.
2-col grid, `gap: 10`. Each tile:
- White surface, 1 px `var(--border-c)`, `var(--radius-lg)`, `var(--shadow-sm)`, padding 13, left-aligned column.
- Icon box 40 × 40, `borderRadius: 12`, per-tile fg + bg.
- Label 14 / 700, optional pulsing dot 6 × 6.
- Sublabel 11.5 in `var(--text-secondary)`.

| # | Icon | Label | Sub | Colors (fg / bg) |
|---|---|---|---|---|
| 1 | IDoc / FileText | Заявки | `{activeRequestCount} в работе` | `#EA580C` / `var(--brand-tint)` |
| 2 | IUsers / Vote | Собрания | `голосование` (+ pulsing dot when active) | `#0E9AAB` / `rgba(14,154,171,0.12)` |
| 3 | IQR / QrCode | Пропуска | `{activePassCount} активный` | `#15A06E` / `var(--status-active-bg)` |
| 4 | ICar / Car | Транспорт | `{vehicleCount} авто` | `#6366F1` / `rgba(99,102,241,0.12)` |

#### "ЕЩЁ" section
Uppercase label, then a single white card (1 px border, `var(--radius-lg)`, `var(--shadow-sm)`, `overflow: hidden`) holding 7 rows.

Each row: 32 × 32 icon box (`borderRadius: 9`, `var(--surface-sunken)` bg, `var(--text-secondary)` fg), label 14 / 650 / `-0.01em`, optional sub 11.5, trailing badge **or** `IChevronR`. `1 px var(--hairline)` separator between rows.

| # | Icon | Label | Sub / badge |
|---|---|---|---|
| 1 | Megaphone | Объявления | brand badge with `{unreadAnnouncementCount}` |
| 2 | CreditCard | Оплата | `{formattedBalance}` (e.g. "312 400 сум") + chevron |
| 3 | Star | Оценить сотрудников | chevron |
| 4 | Phone | Полезные контакты | chevron |
| 5 | Send | Чат с УК | pulsing `var(--status-active)` dot when unread > 0, then chevron |
| 6 | ScrollText / FileText | Договор | `№ {contractNumber}` + chevron |
| 7 | Globe | Язык | `Русский` / `O'zbekcha` + chevron |

### 5. Footer profile card
- `padding: 10px 16px 26px`, `background: var(--surface-2)`, `borderTop: 1 px var(--border-c)`.
- Inner card: white, 1 px border, `var(--radius-lg)`, `var(--shadow-sm)`, `padding: 10 12`.
- Avatar 42 × 42 brand gradient circle with two-letter initials.
- Name 14 / 750 / `-0.01em`, then a "Верифицирован" pill (`var(--status-active)`, 11 / 700, check icon) when `user.contractSignedAt` is set.
- Logout button 38 × 38, `var(--status-critical-bg)`, `var(--status-critical)` icon. Opens the existing logout confirm flow.

## Wiring contract — every row gets a real destination

Resident roles only (`resident` / `tenant` / `commercial_owner`). Every button is a real Link / handler — nothing dead, nothing stubbed. Where the handoff sub-text references data (counts, balance, contract #), the value comes from real stores; if a value isn't available, render `—` rather than a fake number.

| Row | Real destination |
|---|---|
| Close X (header) | `onClose()` |
| Заявки tile | `navigate('/?tab=requests')` (resident home requests tab) |
| Собрания tile | `navigate('/meetings')` |
| Пропуска tile | `navigate('/guest-access')` |
| Транспорт tile | `navigate('/vehicles')` |
| Объявления | `navigate('/announcements')` |
| Оплата | `navigate('/finance/charges')` |
| Оценить сотрудников | `navigate('/rate-employees')` |
| Полезные контакты | `navigate('/useful-contacts')` |
| Чат с УК | `navigate('/chat')` |
| Договор | `navigate('/contract')` |
| Язык | `navigate('/profile')` (profile page hosts the language toggle) |
| Footer card body | `navigate('/profile')` |
| Footer logout button | open the existing `ConfirmDialog` → `onLogout()` (no auth change) |
| Backdrop tap / Escape | `onClose()` |

Items intentionally NOT in this drawer (handoff omits them): Marketplace, "Мой профиль" as its own row (now covered by the footer card), Trainings (already excluded for residents in old drawer). If a feature is locked for the tenant, the row routes through the existing `FeatureLockedModal` instead of navigating — same lock pattern the staff drawer uses today.

## Shell + BottomBar
- The component is portaled to `document.body` (already true in the existing implementation) so transformed ancestors can't break the fixed positioning.
- `useModalPresence(isOpen)` is already wired at the top of `Sidebar` — keeps the global BottomBar hidden while the drawer is open, restores on close / backdrop / route change / Escape / swipe-to-dismiss. Do not change that.
- Swipe-to-close on the drawer panel (already implemented) stays in place.

## Out of scope
- Staff drawers (admin / manager / director / executor / security / super-admin / marketplace_manager / advertiser) — untouched. They keep the existing role-aware list layout.
- BottomBar, Home, Chat, Profile content, auth, password, overlay-hide registry.
