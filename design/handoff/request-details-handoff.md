# Request details (resident) — Claude Design handoff

**Source bundle:** https://api.anthropic.com/v1/design/h/0jbdm1BbhynjsFYpoHdVBw?open_file=screens%2F02d-detali-zayavki.html
**Primary screen:** `screens/02d-detali-zayavki.html` (mounts `<RequestDetailsSheet open={true} request={…} onClose={…} />` over a dimmed RequestsScreen)
**Fetched:** 2026-06-06
**Branch:** `feature/request-details-handoff`

Single source of truth for the resident **request-details bottom sheet** opened
when tapping a request card on either the home or requests tab. Implementation
lives at [src/frontend/src/pages/resident/components/RequestDetailsModal.tsx](src/frontend/src/pages/resident/components/RequestDetailsModal.tsx).
Executor / manager / director request details are NOT in scope.

> **This is a modal (bottom sheet), not a full page.** It slides up from the
> bottom over the dimmed Requests / Home tab. It already registers with
> `useModalPresence()`, so the global BottomBar hides while it's open and
> restores on close.

## Files in this folder
- `request-details-handoff.md` — this spec
- `request-details-02d-detali-zayavki.html` — raw screen HTML
- `kamizo-request-details.jsx` — `RequestDetailsSheet`, `RDProgress`
- `tokens-request-details.css` — full token sheet
- `request-details-README.md` — bundle README

## Visual structure (in render order)

The sheet is a single column inside a bottom-aligned overlay:
- Backdrop: `position: fixed; inset: 0; z-index: 110` (above the parent's content but below the BottomBar's old z; the BottomBar is hidden by `useModalPresence`). Background `rgba(28,25,23,0.50)` + `backdrop-filter: blur(2px)`. Tap to close.
- Sheet body: `width: 100%; max-height: 92dvh; overflow-y: auto; background: var(--app-bg); border-top-left-radius / border-top-right-radius: var(--radius-xl); box-shadow: 0 -10px 40px rgba(28,25,23,0.25); padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 16px)`. `stopPropagation` on inner clicks.

### 1. Drag handle
38 × 5 px pill, `var(--border-strong)`, padding `10px 0 4px`. Decorative only.

### 2. Status card (outer white surface)
- `margin: 6px 16px 0`, radius `var(--radius-xl)` (22), shadow `var(--shadow-md)`, overflow hidden.
- **Orange gradient header** — padding `18 / 18 / 20`, color `#fff`, background `linear-gradient(135deg, #FB923C, #EA580C)`. Decorative 130-px circle in the top-right at `rgba(255,255,255,0.12)`.
  - 56 × 56 round chip on `rgba(255,255,255,0.22)` with the category icon (27 px).
  - Title 20 / 800 / `-0.02em` = Russian category label (Сантехника / Электрика / Лифт / Уборка / Котельная / Кондиционер / Курьер / Озеленение / Охрана / Мусор / Домофон / Заявка).
  - Sub 14 / 600 / 0.85 opacity / tabular = `#UK-S-{request.number}` (legacy "#" prefix kept).
- **Status title block** — centred padding `20 / 18 / 16`. Title 21 / 800 / `-0.02em`. Subtitle 14 / `var(--text-secondary)` margin-top 6. The pair adapts to status:
  | `request.status` | Title | Subtitle |
  |---|---|---|
  | `new` | Заявка создана | Ожидаем назначения исполнителя |
  | `assigned` / `accepted` | Исполнитель назначен | Назначен: `{executorName}` |
  | `in_progress` | Мастер выполняет работу | `{executorName}` в работе |
  | `pending_approval` | Ждёт вашей приёмки | Подтвердите и оцените работу |
  | `completed` | Работа выполнена | Заявка закрыта |
  | `cancelled` | Заявка отменена | `{cancellationReason || 'Подробности скрыты'}` |
- **1 px divider** `var(--border-c)`.
- **4-step progress** — padding `18 / 14 / 14`.
  - Steps: `Создана / Назначена / Выполняется / Выполнено`, icons: `Check / User / Wrench / Star` (lucide), 21 px stroke 2.1.
  - Each step is a 46 × 46 round badge column with the label below (11 / 600, label colour `var(--text-primary)` when reached else `var(--text-muted)`; active label 750 weight).
  - Badge colours:
    - Active step → bg `var(--brand)`, fg white, with a 5-px halo `box-shadow: 0 0 0 5px rgba(249,115,22,0.16)`.
    - Done (`i < stage`) → bg `var(--brand-tint)`, fg `var(--brand-dark)`.
    - Pending (`i > stage`) → bg `var(--surface-sunken)`, fg `var(--text-muted)`.
  - Connectors between steps: 3-px / radius 999 / margin-top 21. Filled `var(--brand)` for `i < stage`, otherwise `var(--surface-sunken)`.
  - Stage mapping (`stage` is 0..3): `new → 0`, `assigned`/`accepted` → 1, `in_progress` → 2, `pending_approval` → 3, `completed` → 3. `cancelled` shows the stage frozen at whatever progress was reached before cancellation — falls back to 0.
- **Submitted-time row** — clock icon (16) + `Подана: {formatted createdAt}`, 13.5 / 600 / `var(--text-secondary)`, gap 8, margin-top 16. Format: `DD.MM.YYYY HH:MM`.
- **1 px divider** `var(--border-c)`.
- **Action button** — padding 16 around a full-width button:
  - `pending_approval` → solid brand button `Принять работу`, fg `#fff`, padding 14, radius `var(--radius-md)`, shadow `var(--sh-brand)`, fires `onApprove()` (existing — opens the `ApproveModal` in the parent).
  - `new` / `assigned` / `accepted` → outline button (white surface, 1 px `var(--border-c)`, `var(--status-critical)` text) `Отменить заявку`, fires `onCancel()` (existing — opens `CancelRequestModal` in the parent).
  - `in_progress` / `completed` / `cancelled` → no action button rendered (handoff's "Повторить заявку" is NOT shipped — there is no existing reopen endpoint and inventing one is out of scope per the task constraints).

### 3. Details card (white surface)
- `margin: 12px 16px 0`, radius `var(--radius-lg)` (16), shadow `var(--shadow-sm)`, padding 16, vertical gap implied by spacing rules below.
- **Описание eyebrow** 12 / 800 / 0.04em / uppercase / `var(--text-secondary)` + body 14.5 / `var(--text-primary)` / margin-top 6 / lh 1.45. Long descriptions (> 120 chars) line-clamp to 3 lines with an inline `Ещё` / `Свернуть` toggle in `var(--brand-dark)`.
- **Priority row** — margin-top 16. Left: `Приоритет:` 13.5 / 600 / muted. Right: pill 12.5 / 700 / padding `4 / 11` / radius 999, fg+bg per priority:
  | Priority | fg | bg |
  |---|---|---|
  | `low` | `var(--status-expired)` | `var(--status-expired-bg)` |
  | `medium` | `var(--status-pending)` | `var(--status-pending-bg)` |
  | `high` | `var(--brand-dark)` | `var(--brand-tint)` |
  | `urgent` | `var(--status-critical)` | `var(--status-critical-bg)` |
- **Photos** (only when `photos.length > 0`):
  - Eyebrow `Фото ({n})` 12 / 800 / uppercase / `var(--text-secondary)` / margin-top 18.
  - Horizontally scrollable strip (gap 8 / margin-top 8). Each thumb is 72 × 72, radius 12, `overflow: hidden`, 1 px `var(--border-c)`. Image `object-fit: cover`. `<a target="_blank" rel="noopener noreferrer">` so taps open the photo in a new tab (existing behaviour).
- **Your rating** (only `status === 'completed' && rating`):
  - Eyebrow `Ваша оценка` 12 / 800 / uppercase / `var(--text-secondary)` / margin-top 18.
  - 5 stars (24 × 24, `#FBBF24` filled when `star <= rating` else `var(--surface-sunken)` outlined) + `{rating}/5` 16 / 700, gap 4, margin-top 6.
  - Optional `feedback` paragraph in italic muted below (existing behaviour preserved).
- **Executor row** — only when an executor is assigned (`executorName` exists and the request isn't `new` / `cancelled` with no executor):
  - 1 px hairline `var(--hairline)` margin `16 / 0`.
  - 44 × 44 round avatar with initials (first letters of first two words), bg `var(--brand-tint)`, fg `var(--brand-dark)`, font 14 / 800.
  - Name 14.5 / 700 / `-0.01em`. Sub 12.5 / `var(--text-secondary)` = `Мастер · {category label}`.
  - Round phone button 42 × 42, bg `var(--status-active)`, fg `#fff`, icon Phone (18). `<a href="tel:{executorPhone}">` — opens the system dialer. Hidden when `executorPhone` is missing.

### 4. Reschedule
- **Active reschedule banner** (only when `hasActiveReschedule`): margin `12px 16px 0`, padding 12, radius `var(--radius-md)`, bg `#FFF7ED`, 1 px `#FED7AA`, RefreshCw icon + 13 / `#9A3412` text `Ожидается ответ на запрос о переносе`. No action.
- **Reschedule button** (only when `canReschedule`): margin `12px 16px 0`, full-width amber button (`#FEF3C7` bg, `#92400E` fg, 1 px `#FDE68A`, padding 13, radius `var(--radius-md)`, RefreshCw icon + `Перенести на другое время`). Fires `onReschedule()` (existing — opens `RescheduleModal` in the parent).
  - `canReschedule = ['assigned','accepted','in_progress','pending_approval'].includes(status) && executorId && !hasActiveReschedule` (existing logic preserved).

### 5. Close
- Margin `14px 16px calc(env(safe-area-inset-bottom) + 0px)`, transparent text button `Закрыть`, 14 / 650 / `var(--text-secondary)`. Fires `onClose()`.

## Wiring contract — every action gets a real handler

The modal interface (`RequestDetailsModalProps`) is unchanged:
```ts
{
  request: Request,
  onClose: () => void,
  onApprove: () => void,   // parent opens ApproveModal
  onCancel: () => void,    // parent opens CancelRequestModal
  onReschedule: () => void,// parent opens RescheduleModal
  hasActiveReschedule: boolean,
}
```

| Action | Real handler |
|---|---|
| Mount | `useModalPresence()` registered so the global BottomBar hides |
| Backdrop tap | `onClose()` (existing) |
| Bottom `Закрыть` button | `onClose()` (existing) |
| Body click | `stopPropagation` to keep the sheet open |
| Primary action `Принять работу` (`pending_approval`) | `onApprove()` — parent opens the existing `ApproveModal` which calls `approveRequest(id, rating, feedback)` / `rejectRequest(id, reason)` (unchanged) |
| Primary action `Отменить заявку` (`new` / `assigned` / `accepted`) | `onCancel()` — parent opens the existing `CancelRequestModal` which calls `cancelRequest(id, 'resident', reason)` (unchanged) |
| Reschedule button | `onReschedule()` — parent opens the existing `RescheduleModal` which calls `createRescheduleRequest({ requestId, ...data })` (unchanged) |
| Description `Ещё` / `Свернуть` | local `descExpanded` state toggle (existing) |
| Photo tap | `<a href={url} target="_blank" rel="noopener noreferrer">` — opens the photo in a new tab (existing) |
| Phone button on executor row | `<a href={`tel:${executorPhone}`}>` — opens the system dialer. Hidden when phone is missing |
| Active-reschedule banner | display only, no action (existing) |

No new endpoints. The handoff's prototype "Повторить заявку" button on `completed` / `cancelled` is intentionally NOT shipped — there's no existing reopen endpoint, and adding one is out of scope per the task constraints. The sheet's bottom close still lets the user dismiss, and the home/requests tab already has a `Создать заявку` flow that the user can use to file a fresh request.

## Shell + BottomBar

- The modal is rendered from `ResidentDashboard` (and only from there). The parent's mounting condition (`selectedRequest && !showApproveModal && !showCancelModal && !showRescheduleModal`) is unchanged.
- `useModalPresence()` at the top of the body keeps the global BottomBar hidden while the sheet is open and restores it on close (existing behaviour preserved).
- No change to `Layout.tsx` `isResidentFullBleed` predicate — this is a modal layered above whichever resident tab the user came from.
- No change to `Sidebar`, `Home`, `Chat`, `Profile`, `Vehicles`, `Passes`, `Rating`, `Contacts`, `Announcements`, `Meetings`.

## Out of scope
- Executor / manager / director request-details modals (`pages/executor/components/RequestDetailsModal.tsx`)
- `ApproveModal`, `CancelRequestModal`, `RescheduleModal`, `RescheduleResponseModal` — reused unchanged
- `RequestStatusTracker` — replaced inline by the new 4-step progress; not edited
- Reopen / "Повторить заявку" flow — not in the API
- BottomBar, Layout, Sidebar, Home, Chat, Profile, Vehicles, Passes, Rating, Contacts, Announcements, Meetings
- Overlay-hide registry contract (still `modalStore.useModalPresence`)
- Auth / password / verification
