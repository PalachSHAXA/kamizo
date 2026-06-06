# Useful contacts / partners (resident) — Claude Design handoff

**Source bundle:** https://api.anthropic.com/v1/design/h/5urIH-P0PUnzRJ4U8Fjosw?open_file=screens%2F08-kontakty.html
**Primary screen:** `screens/08-kontakty.html` (mounts `<ContactsScreen activeTab="home" />`)
**Fetched:** 2026-06-06
**Branch:** `feature/contacts-handoff`

Single source of truth for the resident "Полезные контакты" page. Implementation
lives at [src/frontend/src/pages/ResidentUsefulContactsPage.tsx](src/frontend/src/pages/ResidentUsefulContactsPage.tsx).
Admin / manager / advertiser pages are NOT in scope.

## Files in this folder
- `contacts-handoff.md` — this spec
- `contacts-08-kontakty.html` — raw screen HTML
- `kamizo-contacts.jsx` — the `ContactsScreen` component, top to bottom
- `tokens-contacts.css` — full token sheet

## Visual structure (in render order)

### 1. Sticky header (translucent + blur)
- `position: sticky; top: 0; z-index: 5`
- Background `rgba(244,240,232,0.92)` + `backdrop-filter: blur(14px)`
- Title block: padding `52px 16px 10px`, eyebrow `Сервисы рядом с домом` 11.5/700/uppercase/`var(--text-secondary)`, title `Полезное рядом` 24/800/`-0.025em`
- Category chips: padding `0 16px 12px`, horizontal scroll, 8 px gap. Each chip: padding `8px 15px`, `border-radius: 999`. Active chip: `background: var(--ink)`, `color: var(--text-on-dark)`. Inactive: `background: var(--surface-sunken)`, `color: var(--text-secondary)`. 13 / 650 weight.
- Chip set: `Все · Чистота · Для дома · Еда · Здоровье` (handoff). The implementation maps these to the real category list returned by `GET /api/ads/categories`.

### 2. Body (`padding: 14px 16px`)

#### 2a. Emergency compact strip
Single horizontal scrollable row, gap 8, marginBottom 18. Each tile:
- `flex: 1 0 auto; min-width: 76; padding: 11px 8px; border-radius: var(--radius-md)`
- White surface, 1 px `var(--border-c)`, `var(--shadow-sm)`
- Stacked column: 30 × 30 icon box `border-radius: 9`, `var(--status-critical-bg)` bg + `var(--status-critical)` fg, then 11.5/650 label, then 12/800 number in `var(--status-critical)` `var(--font-num)`.

Hard-coded contacts (UZ-national emergency numbers, not from API):
| Label (RU) | Label (UZ) | Tel | Icon |
|---|---|---|---|
| Полиция | Politsiya | 102 | Shield |
| Пожарная | Oʻt oʻchirish | 101 | Flame |
| Скорая | Tez yordam | 103 | HeartPulse |
| Газ | Gaz | 104 | Zap |

Each tile is an `<a href="tel:{number}">` so the tap launches the dialer.

#### 2b. Partner promo cards
Column with gap 12. The first ad whose `badges.recommended` (or `badges.hot` fallback) is set is rendered as the **featured** card; everything else as **regular** rows. If no recommended ad exists, the first ad in the filtered list is featured by default.

**Featured card** — full-bleed gradient (per-ad `grad`, fallback to `linear-gradient(140deg, #FB923C, #EA580C)`), white text, padding 18, radius `var(--radius-xl)`, drop-shadow.
- Decorative circle top-right + faint star silhouette behind content
- Pill `Партнёр дома` 10.5/800/uppercase, white-tint bg
- Name 23/800, tagline 13.5 / 0.9 opacity, promo 17/800, note 12.5 / 0.88
- Action row: `Связаться` button (1-flex, white bg, gradient-matched fg, padding 12, radius `var(--radius-md)`, phone icon) + inline `★ {rating}` 13/700

**Regular row** — `padding: 14`, gap 13, white surface, `var(--radius-lg)`, 1 px border, `var(--shadow-sm)`.
- 52 × 52 gradient icon box (radius 15), white icon (per-category lucide)
- Middle column: 15.5/750 name + inline `★ rating` 11.5/700 muted, 12.5 tagline muted, brand-tint pill `promo` 11.5/800 (margin-top 8)
- Trailing 44 × 44 round phone button: `var(--brand)` bg + `var(--sh-brand)` shadow

#### 2c. "Стать партнёром" CTA card
- `border-radius: var(--radius-lg)`, `1.5px dashed var(--border-strong)`, `background: var(--surface-2)`, padding 16, centred
- Title 14/700 `Здесь может быть ваш сервис`
- Sub 12.5 muted: `Размещайте предложения для жителей дома — химчистка, доставка, ремонт`
- Pill button `Стать партнёром`: 10 / 20 padding, 999 radius, `var(--surface)` bg, 1 px `var(--border-strong)`, `var(--brand-dark)` fg, 13 / 700

## Wiring contract — every action gets a real handler

| Action | Real handler |
|---|---|
| Mount | `fetch('/api/ads/categories')` + `fetch('/api/ads')` + `fetch('/api/banners?placement=useful-contacts')` (existing) |
| Category chip tap | `setSelectedCategoryId(id)` — filters the rendered ads by `ad.category_id === id` |
| Emergency tile tap | `<a href="tel:{number}">` — opens the system dialer with the UZ emergency number |
| Featured card `Связаться` | `<a href="tel:{ad.phone}">` — opens the dialer with the ad's phone number |
| Featured card body tap (anywhere outside the button) | `fetchAdDetails(ad.id)` → opens the existing detail view (registered with `useModalPresence` while open) |
| Regular row tap | `fetchAdDetails(ad.id)` → opens detail view |
| Regular row 44 × 44 phone button | `<a href="tel:{ad.phone}">` — opens dialer (stops propagation so the detail view doesn't open underneath) |
| Detail view → `Позвонить` | existing `<a href="tel:{ad.phone}">` (preserved) |
| Detail view → social icons (Telegram, Instagram, FB, web, phone2) | existing `<a target="_blank">` handlers (preserved) |
| Detail view → `Получить купон` | existing `getCoupon()` → `POST /api/ads/{id}/get-coupon` (preserved) |
| Detail view → `Скопировать код` | existing `copyCode()` → `navigator.clipboard.writeText(userCoupon.code)` + success toast (preserved) |
| Detail view → Back / browser back | existing `setSelectedAd(null)` + `useBackGuard` (preserved) |
| Footer `Стать партнёром` | `<a href="mailto:partners@kamizo.uz?subject=Заявка%20на%20партнёрство&body=…">` so the system mail composer opens. Tenant-specific email override comes from `config.tenant.contact_email` when present; otherwise the platform-wide `partners@kamizo.uz` fallback. |
| Detail view modal-presence | `useModalPresence(!!selectedAd)` registered at the top of the component so the global BottomBar hides while the detail view is open |

## Shell + BottomBar
- `/useful-contacts` is added to `isResidentFullBleed` in `Layout.tsx`. Side-effects: `<main>` carries `page-content-full-bleed` (no per-device mobile padding compounding), AND the global `MobileHeader` is hidden on this route (the page's own sticky header takes over).
- Warm beige `var(--app-bg)` background, light status bar via the global theme-color — unchanged.
- `useModalPresence(!!selectedAd)` keeps the BottomBar hidden while the detail view is open and restores it on close.

## Out of scope
- Admin / manager / advertiser ad-management pages
- Banners API contract (`/api/banners`) — still loaded but rendered as the existing tenant-branded banner above the partner list
- BottomBar, Layout (apart from the one full-bleed predicate), Sidebar, Home, Chat, Profile, Vehicles, Passes, Rating
- Overlay-hide registry contract (still `modalStore.useModalPresence`)
- Auth / password / verification
