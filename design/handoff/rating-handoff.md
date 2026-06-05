# Rate employees (resident) — Claude Design handoff

**Source bundle:** https://api.anthropic.com/v1/design/h/uzZ4XIE2BbDVxO2-QuGL0w?open_file=screens%2F09-ocenka.html
**Primary screen:** `screens/09-ocenka.html` (mounts `<RateScreen activeTab="home" />`)
**Fetched:** 2026-06-05
**Branch:** `feature/rating-handoff`

Single source of truth for the resident "Оценка сотрудников" page. Implementation
lives at [src/frontend/src/pages/ResidentRateEmployeesPage.tsx](src/frontend/src/pages/ResidentRateEmployeesPage.tsx).
Staff / admin / manager rating surfaces are NOT in scope.

## Files in this folder
- `rating-handoff.md` — this spec
- `rating-09-ocenka.html` — raw screen HTML
- `kamizo-rating.jsx` — the `RateScreen` + `StarRow` components, top to bottom
- `tokens-rating.css` — full token sheet

## Visual structure (in render order)

### 1. Sticky header (translucent + blur)
- `position: sticky; top: 0; z-index: 5`
- `padding: 54px 20px 12px` (54 px clears the iOS status-bar zone)
- Translucent fill `rgba(245,245,244,0.92)` + `backdrop-filter: blur(14px)` + 1 px bottom hairline
- Eyebrow `Оценка сотрудников` 11 / 600 / uppercase / `var(--text-3)`
- Title `Спасибо, что делитесь` 22 / 700 / `-0.02em`

### 2. Body (`padding: 14px 16px`)

#### 2a. Horizontally-scrolling employee row
- `display: flex; overflow-x: auto; gap: 10; padding: 4px 4px 12px; margin: -4px -4px 0`
- Each chip is 110 px wide column: 50 × 50 round avatar (brand gradient when selected, stone-200 when not, initials in white), name 12 / 650 truncated, role 10.5 / `var(--text-3)`. Selected chip: white surface, 1.5 px `var(--amber-500)` border, `var(--sh-2)` shadow. Already-rated chips show a green check badge (16 × 16 circle, top-right corner, `var(--success)` bg, white check).

#### 2b. Selected-employee card
White surface, 1 px border, `var(--sh-2)` shadow, 18 px radius, padding 18.
- Header row: 56 × 56 brand-gradient avatar with initials, then name 17 / 700 / `-0.02em`, role 12.5 muted, then a 12 / 600 amber row "⭐ {avg} · {count} оценок".
- "Last job" pill: stone-100 bg, 10 px radius, padding 10/12, 12.5 muted text — "Последняя работа: {summary}".
- "Как прошло?" prompt centred 14 / 650, then a 5-star row (size 36, gap 10, `#F59E0B` filled / `#D6D3D1` empty), then a 12.5 / 600 amber word-rating below ("Очень плохо" / "Плохо" / "Нормально" / "Хорошо" / "Отлично").
- When `rating > 0`:
  - "Что особенно понравилось?" label + chip cloud (6 tags from the handoff: Быстро, Вежливый, Профессионально, Чисто, Пунктуально, Помог с лишним). Selected chip: `var(--amber-100)` bg, `var(--amber-400)` border, `var(--amber-800)` text, leading check icon. Unselected: white + `var(--border)`.
  - Comment textarea: full width, min-height 70, 1 px border, 12 px radius, `var(--stone-50)` bg.
  - Submit button: full width, amber-600 bg with `var(--sh-amber)` glow, "Отправить отзыв" + send icon, 14.5 / 650.
  - Anonymity disclaimer below, 11.5 muted, centred.

## Wiring contract — every action gets a real handler

The handoff design is single-axis (one star rating) + tags + comment. The existing
backend stores three axes (`quality`, `speed`, `politeness`) + `comment`. To
preserve the API schema without inventing endpoints, the single star rating is
mirrored to all three axes on submit; selected tag labels are prepended to the
comment in brackets so they survive the round trip (e.g. `[Быстро][Вежливый] {user comment}`).

| Action | Real handler |
|---|---|
| Mount | `fetchExecutors()` + `fetchRequests()` (existing stores) + `GET /api/ratings` to populate `ratedExecutorIds` |
| Header eyebrow / title | static (no action) |
| Employee chip tap | `setSelectedExecutor(e)` + reset `rating` / `tags` / `comment`; if the chip is an already-rated executor we keep the chip's green check badge |
| Selected card avatar / name / role / avg | derived from `Executor.name` / `specialization` (via `SPECIALIZATION_LABELS`) / `Executor.rating` / `Executor.completedCount` |
| "Last job" line | last completed request for this resident that this executor handled, from `useRequestStore` |
| Star tap | `setRating(n)` (1-5) |
| Tag chip tap | `toggleTag(id)` (multi-select) |
| Comment input | `setComment(text)` |
| **Отправить отзыв** | `POST /api/ratings` with body `{ executor_id, quality: rating, speed: rating, politeness: rating, comment: "[tag1][tag2] " + comment }` then add to `ratedExecutorIds` + toast on error (existing `useToastStore.addToast('error', …)`). On success, the chip moves to "rated" state via the same `ratedExecutorIds` Set. |
| "Оценить УК отдельно" link (added) | opens the existing UK rating UI in a `<Modal>` (the shared `common/Modal` already calls `useModalPresence` so the BottomBar hides while it's open). Uses `ukRatingsApi.submitRating` / `getMyRating` — unchanged. |

Empty state: when there are no executors who have completed ≥1 request for this
resident, the employee row collapses to "Пока некого оценивать" message in the
selected card area; submit button is hidden until a chip is selected and stars
> 0.

## Shell + BottomBar
- `/rate-employees` is added to `isResidentFullBleed` in `Layout.tsx` so `<main>`
  carries `page-content-full-bleed`. No mobile per-device auto-padding compounding.
- Page renders its own sticky header — the global `MobileHeader` is hidden on
  this route via the same `isResidentFullBleed` switch in `Layout.tsx:367`.
- Warm beige `var(--app-bg)` background, light status bar via global theme-color.
- The UK rating Modal opens through `common/Modal` which is already wired to
  `useModalPresence` (since `feature/hide-bottombar-on-overlays`) — the BottomBar
  hides while it's open, restores on close.
- BottomBar itself stays portaled / fixed as everywhere else.

## Out of scope
- Staff / admin / manager rating pages
- UK rating data shape (still `ukRatingsApi`)
- BottomBar, Layout (apart from the one full-bleed predicate), Sidebar, Home,
  Chat, Profile, Vehicles, Passes
- Overlay-hide registry contract (still `modalStore.useModalPresence`)
- Auth / password / verification
