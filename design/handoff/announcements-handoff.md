# Announcements (resident) — Claude Design handoff

**Source bundle:** https://api.anthropic.com/v1/design/h/-Nk0CDevtQnJl7gpna5ayw?open_file=screens%2F06-obyavleniya.html
**Primary screen:** `screens/06-obyavleniya.html` (mounts `<AnnouncementsScreen activeTab="home" />`)
**Fetched:** 2026-06-06
**Branch:** `feature/announcements-handoff`

Single source of truth for the resident "Объявления" page. Implementation
lives at [src/frontend/src/pages/ResidentAnnouncementsPage.tsx](src/frontend/src/pages/ResidentAnnouncementsPage.tsx).
Admin / manager / employee announcement surfaces are NOT in scope.

## Files in this folder
- `announcements-handoff.md` — this spec
- `announcements-06-obyavleniya.html` — raw screen HTML
- `kamizo-announcements.jsx` — the `AnnouncementsScreen` component, top to bottom
- `tokens-announcements.css` — full token sheet

## Visual structure (in render order)

### 1. Sticky header (translucent + blur)
- `position: sticky; top: 0; z-index: 5`
- Background `rgba(244,240,232,0.92)` + `backdrop-filter: blur(14px)` + 1 px bottom hairline
- `padding: calc(env(safe-area-inset-top) + 14px) 16px 12px`
- Eyebrow: building name (e.g. `Дом 12А`) — 11.5 / 700 / uppercase / `0.04em` / `var(--text-secondary)`. Falls back to the tenant's `name` if no building label is available; otherwise hides.
- Title `Объявления` — 24 / 800 / `-0.025em`
- Filter chips (single row, gap 8, margin-top 12): pill, padding `7px 14px`, radius 999, font 13 / 650.
  - Active: `background: var(--ink)`, `color: var(--text-on-dark)`, 1 px `var(--ink)` border.
  - Inactive: `background: var(--surface)`, `color: var(--text-secondary)`, 1 px `var(--border-c)` border.
  - Set: `Все · {count}`, `Непрочитанные · {unreadCount}`

### 2. Feed (`padding: 14px 16px`, vertical gap 12)

Each announcement is one card. Card root:
- Radius `var(--radius-lg)` (16 px), shadow `var(--shadow-sm)`, overflow hidden.
- Unread bg `var(--brand-tint)` + 1 px `var(--brand-200)` border. Read bg `var(--surface)` + 1 px `var(--border-c)` border, opacity 0.92.
- Urgent variant overrides the border with `var(--status-critical-bg)` and prepends a 4-px solid `var(--status-critical)` stripe at the very top of the card.

In-card structure (top → bottom):
- **Cover (optional)** — 96 × full-width gradient strip with a centred 42-px white-tinted lucide icon. Used for urgent / themed announcements (e.g. electricity outage → bolt, planting → tree).
- **Header row** (inside the tap button, gap 8, align center):
  - Urgent only: `Важно` pill — 9.5 / 800 / uppercase / `0.04em`, `var(--status-critical)` fg on `var(--status-critical-bg)` bg, padding `2 / 7`, radius 999.
  - Category pill — 10.5 / 700 / `0.02em`, padding `3 / 9`, radius 999. Foreground + background are derived from `priority`:
    | priority | fg | bg |
    |---|---|---|
    | `urgent` | `var(--status-critical)` | `var(--status-critical-bg)` |
    | `important` | `var(--status-info)` | `var(--status-info-bg)` |
    | `normal` | `var(--status-active)` | `var(--status-active-bg)` |
  - Relative date (right-aligned via `marginLeft: auto`) — 11.5 / `var(--text-muted)`.
  - Unread only: 8 × 8 circle, `var(--brand)` bg (the brand-orange dot).
- **Title** — 16 / 700 / `-0.015em` / lh 1.3, marginTop 9.
- **Body / preview** — 13.5 / 1.45 / `var(--text-secondary)`. Collapsed: `-webkit-line-clamp: 2` on `announcement.content`. Expanded: full `content` text.
- **Attachments (when expanded only)**:
  - Image attachments: horizontal scrollable strip, 128 px tall thumbnails, opens in new tab. Click `stopPropagation` so the parent toggle doesn't fire.
  - Non-image attachments: row of pills — 1.5-px file icon, name + size, trailing download chevron. Clicks `stopPropagation` and uses `<a download={name}>`.
- **Footer row** (marginTop 11, font 11.5 / `var(--text-muted)`):
  - Author name on the left.
  - `Читать` / `Свернуть` toggle on the right — 11.5 / 650 / `var(--brand-dark)` + chevron-down icon. When expanded, the chevron rotates 180°.

### 3. Empty state
When the active filter has no items:
- 72 × 72 round badge with `var(--surface-sunken)` bg + 32 px megaphone icon in `var(--text-muted)`.
- Title 16 / 700 — `Всё прочитано` when filter = `unread`, otherwise `Объявлений пока нет`.
- Subtitle 13.5 / `var(--text-secondary)` — `Новых объявлений нет` / `Новые объявления появятся здесь`.

## Wiring contract — every action gets a real handler

| Action | Real handler |
|---|---|
| Mount | `fetchAnnouncements()` (existing `useAnnouncementStore`) |
| Personalised filter | `getAnnouncementsForResidents(login, buildingId, entrance, floor, branch, apartment)` — preserves existing targeting (building / entrance / floor / branch / custom logins) |
| Filter chip tap | `setFilter('all' \| 'unread')` + sets `userPickedFilter = true` (disables auto-switch) |
| Auto-switch to `unread` | one-shot on first data arrival when `unreadCount > 0` and the user hasn't picked a chip yet (preserved from previous implementation) |
| Card tap | `handleExpand(announcement)` — toggles `expandedId` AND, if currently unread, calls `markAnnouncementAsViewed(announcement.id, user.id)` (existing) |
| Image attachment tap | `<a href={url} target="_blank" rel="noopener noreferrer">` — opens the data-URL / external URL in a new tab. `e.stopPropagation()` so the card toggle doesn't fire. |
| File attachment tap | `<a href={url} download={name} target="_blank" rel="noopener noreferrer">` — system download. `e.stopPropagation()`. |
| `Читать` / `Свернуть` toggle | same as card tap (`handleExpand`) — the row is one big button. |

No new endpoints. No detail modal — expansion is in-card (matches the handoff). The
existing `useModalPresence` registry is untouched: there is no overlay to register.

### Field mapping

| Handoff field | Store field |
|---|---|
| `id` | `Announcement.id` |
| `urgent` flag | `priority === 'urgent'` |
| `cat` (category pill text) | derived from `priority`: `urgent → Срочно / Shoshilinch`, `important → Важно / Muhim`, `normal → Информация / Maʼlumot` |
| `catFg` / `catBg` | priority → CSS-variable pair (see table above) |
| `title` | `Announcement.title` |
| `author` | `formatName(Announcement.authorName)` |
| `date` | `formatRelativeDate(Announcement.createdAt, lang)` — re-uses the existing helper from `formatName` neighbour module if present; otherwise the page formats with `Intl.RelativeTimeFormat` |
| `preview` / `body` | `Announcement.content` (we do not have separate preview text; line-clamp gives the preview effect) |
| `cover` / `coverIcon` | NOT supported by the API — covers are only rendered for the `urgent` priority using a brand-critical gradient + `AlertTriangle` icon. Other priorities omit the cover. This keeps the layout faithful while staying within the existing schema. |
| `attach` | `Announcement.attachments[]` (existing) |

## Shell + BottomBar
- `/announcements` is added to `isResidentFullBleed` in `Layout.tsx`. Side-effects:
  - `<main>` carries `page-content-full-bleed` (no per-device mobile padding compounding — the page paints its own 16-px sides).
  - The global `MobileHeader` is hidden on this route (the page's own sticky header takes over).
- Warm beige `var(--app-bg)` background, light status bar via the global theme-color — unchanged.
- No overlay / modal opens on this page — `useModalPresence` is not used here.
- BottomBar stays portaled / fixed as everywhere else; `Главная` remains the fallback active tab (unchanged BottomBar behaviour — this route doesn't appear in the bar yet).

## Out of scope
- Admin / manager / employee announcement composition pages
- Push-notification delivery contract (still server-side)
- BottomBar, Layout (apart from the one full-bleed predicate), Sidebar, Home,
  Chat, Profile, Vehicles, Passes, Rating, Contacts
- Overlay-hide registry contract (still `modalStore.useModalPresence`)
- Auth / password / verification
