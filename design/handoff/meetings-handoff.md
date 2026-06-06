# Meetings list (resident) — Claude Design handoff

**Source bundle:** https://api.anthropic.com/v1/design/h/nwBwsYPw-1rxKLEJoJRhfA?open_file=screens%2F05-sobraniya.html
**Primary screen:** `screens/05-sobraniya.html` (mounts `<MeetingsScreen activeTab="home" onVote={…} />`)
**Fetched:** 2026-06-06
**Branch:** `feature/meetings-list-handoff`

Single source of truth for the resident **"Собрания" list / overview** page (the
OUTER list, not the inner voting modal — that one ships in §03 / `voting-handoff.md`).
Implementation lives at
[src/frontend/src/pages/ResidentMeetingsPage.tsx](src/frontend/src/pages/ResidentMeetingsPage.tsx).
Admin / manager / director meetings pages are NOT in scope.

## Files in this folder
- `meetings-handoff.md` — this spec
- `meetings-05-sobraniya.html` — raw screen HTML
- `kamizo-meetings.jsx` — `MeetingsScreen`, `MeetingCard`, `QuorumBar`
- `tokens-meetings.css` — full token sheet
- `meetings-README.md` — bundle README

## Visual structure (in render order)

The page now paints its own 16-px sides (full-bleed) — the global
`MobileHeader` is hidden on this route and the page's sticky header takes over.
The voting modal that opens on tap is the existing `MeetingVotingModal`
(handoff §03) — unchanged.

### 1. Sticky header (translucent + blur)
- `position: sticky; top: 0; z-index: 5`
- `padding: calc(env(safe-area-inset-top) + 14px) 16px 14px`
- Background `rgba(244,240,232,0.92)` + `backdrop-filter: blur(14px)` + 1 px bottom hairline
- Eyebrow `Собрания собственников` — 11.5 / 700 / uppercase / `0.04em` / `var(--text-secondary)`
- Title `Голосование` — 24 / 800 / `-0.025em`

### 2. Legal weight note (right under the header)
- `margin: 8px 16px 0`, padding `12px 14px`, radius `var(--radius-md)`
- Background `var(--surface-2)`, 1 px `var(--border-c)`
- 17-px shield icon + 12 / lh 1.45 text:
  > Вес вашего голоса равен площади квартиры (**{user.totalArea} м²**). Решение принимается при кворуме **≥{quorumThreshold}%** площади дома.
- `{user.totalArea}` comes from `useAuthStore().user?.totalArea` (existing field). When it's missing the note collapses the bold to `«не указана»` (with a link to /profile). `{quorumThreshold}` comes from `meeting.votingSettings.quorumPercent` of the first active meeting, default 50.

### 3. Reconsideration requests banner (existing — preserved, restyled)
When `reconsiderationRequests.length > 0`, render the existing banner stack
above the meetings list. The visual is restyled to fit the warm beige
canvas (white surface, amber edge, `Пересмотреть` / `Оставить` buttons) — but
the data wiring stays on `useMeetingReconsiderationStore` exactly as today.

### 4. Meetings feed (`padding: 14px 16px`, vertical gap 12)

Each meeting is one tappable card. Card root:
- Background `var(--surface)`, radius `var(--radius-lg)` (16), shadow `var(--shadow-sm)`, padding 16, overflow hidden, `width: 100%`, `text-align: left`.
- Border: 1 px `var(--border-c)`. **Voting-open variant:** 1.5 px `var(--brand-200)` border (emphasizes the urgent meetings).

Card structure (top → bottom):
- **Status row** (flex, gap 10, space-between):
  - Status pill — 11 / 700 / `0.02em`, padding `4 / 10`, radius 999. The leading pulse dot only renders on `voting_open`.
    | Status (DB)                                                | Pill label (RU)        | Pulse | Fg                       | Bg                          |
    |---|---|---|---|---|
    | `voting_open`                                              | `Идёт голосование`     | ✓     | `var(--brand-dark)`      | `var(--brand-tint)`         |
    | `schedule_poll_open`                                       | `Опрос даты`           |       | `var(--status-info)`     | `var(--status-info-bg)`     |
    | `schedule_confirmed`                                       | `Предстоит`            |       | `var(--status-pending)`  | `var(--status-pending-bg)`  |
    | `voting_closed` / `results_published` / `protocol_generated` / `protocol_approved` | `Завершено` |  | `var(--status-expired)` | `var(--status-expired-bg)`  |
  - Right side: `№{meeting.number}` 12 / `var(--text-muted)` / `var(--font-num)` tabular numerals.
- **Title** — `meeting.agendaItems[0]?.title || "Собрание #{number}"`, 16.5 / 750 / `-0.02em` / lh 1.3, margin-top 12.
- **Date + agenda row** — 12.5 / `var(--text-secondary)` (gap 8): calendar icon (14) + date label + middot + `{N} {пункт/а/ов} повестки`. Date label is derived from the meeting status:
  - `voting_open` → `до {votingClosedAt as DD MMM}` (e.g. `до 28 мая`).
  - `schedule_poll_open` → `опрос до {schedulePollEndsAt as DD MMM}`.
  - `schedule_confirmed` → `{confirmedDateTime as DD MMM, HH:mm}`.
  - Closed family → `{votingClosedAt || protocolGeneratedAt || createdAt}` formatted day-month.
  - Missing date → fallback `«дата не назначена»`.
- **Body block** — depends on status:
  - **Closed family** (`voting_closed` and on): 3-cell result grid (gap 8, margin-top 12). Each cell: padding `8 / 4`, radius `var(--radius-sm)`, bg `var(--surface-sunken)`. Value: 15 / 800 tabular, `{За/Против/Возд.}` aggregated across all agenda items as **average of percentFor / percentAgainst / percentAbstain** rounded to integers. Cell colour: green / red / muted.
  - **Otherwise** (`voting_open` / `schedule_poll_open` / `schedule_confirmed`): the `QuorumBar`.
- **QuorumBar:**
  - Row above the bar: `Кворум · {pct}% площади` (12 / 650 muted, value 800 with `var(--status-active)` colour when threshold is met) on the left; status hint on the right (`Собран` chip when reached, otherwise `нужно {threshold}%` muted).
  - Bar: 8-px height, radius 999, track `var(--surface-sunken)`, fill width `min(pct,100)%` coloured `var(--status-active)` when reached / `var(--brand)` otherwise. A 2-px vertical marker is overlaid at `left: {threshold}%`, colour `var(--text-muted)` opacity 0.5 — the visual "50% line".
  - When the meeting hasn't actually started counting (`quorum.total === 0`), the bar is omitted and a single line `Голосование ещё не началось` 12 / muted is shown instead.
- **CTA footer row** (flex, space-between, margin-top 14):
  - Left text — 11.5 / `var(--text-secondary)`, leading icon. Branching:
    - You already voted on the open meeting → ✓ icon (green) + `Вы проголосовали`.
    - `voting_open` and not voted → clock + `{N} дн/ч осталось` (parsed from `votingClosedAt`). When deadline is past → `Завершено`.
    - Closed family → `Протокол готов` (when `protocolApprovedAt`/`protocolGeneratedAt` exists) / `Итоги опубликованы` otherwise.
    - Default (`schedule_*`) → `Ваш вес: {user.totalArea} м²` (or `Ваш вес не указан` when missing).
  - Right CTA — 13 / 700, chevron icon trailing. Visual depends on status:
    - `voting_open` → solid pill: `var(--brand)` bg, white fg, padding `8 / 14`, radius 999, shadow `var(--sh-brand)`. Label: `Голосовать` (or `Изменить голос` when the user already voted but `meeting.votingSettings.allowRevote` is true).
    - Closed family → text link `Протокол`, colour `var(--brand-dark)`, no bg.
    - Otherwise → text link `Подробнее`, colour `var(--brand-dark)`, no bg.

### 5. Empty state
When `activeMeetings.length === 0`:
- Centred column, 64 × 64 round badge (`var(--surface-sunken)` bg, `var(--text-muted)` colour), 32-px `Vote` icon.
- Title 16 / 700 — `Нет активных собраний`.
- Subtitle 13.5 / `var(--text-secondary)` — `Здесь появятся новые голосования и протоколы вашего дома.`

## Wiring contract — every action gets a real handler

| Action | Real handler |
|---|---|
| Mount | `useMeetingStore.fetchMeetings()` (existing, runs once) + `fetchMyReconsiderationRequests()` initial load |
| Polling | `setInterval(loadReconsiderationRequests, 30_000)` — preserved unchanged; plays `/notification.mp3` on new requests |
| Reconsideration `Пересмотреть` button | `handleRespondToRequest(request)` → `markReconsiderationRequestViewed(request.id)` + `setAllowRevote(true)` + `setSelectedMeetingId(request.meetingId)` + `setShowVotingModal(true)` + `fetchMeetings()` |
| Reconsideration `Оставить` button | `handleIgnoreRequest(requestId)` → `ignoreReconsiderationRequest(requestId)` + reload |
| New-request popup `Открыть` | same as `Пересмотреть` |
| New-request popup `Close (X)` | `setNewRequestAlert(null)` |
| Meeting card tap (anywhere) | `handleOpenMeeting(meeting)` → `setSelectedMeetingId(meeting.id)` + `setShowVotingModal(true)` (existing). The right-hand CTA pill is part of the same button, so a single tap anywhere on the card opens the voting modal. |
| Goal of card tap | always opens the existing **`MeetingVotingModal`** (handoff §03) — never opens an external URL, never invents a detail route. |
| Header eyebrow / title / legal note | static (no action) |
| Quorum bar | derived from `calculateMeetingQuorum(meeting.id)` (existing) |
| Closed-card result cells | derived from `meeting.agendaItems[*].votesFor/votesAgainst/votesAbstain` aggregated to percents (uses `calculateAgendaItemResult(meeting.id, item.id)` for consistency with the inner modal) |
| Time-left label on `voting_open` | parsed locally from `meeting.votingClosedAt`, falls back to `Без срока` |
| `Ваш вес: N м²` | reads `useAuthStore().user?.totalArea` |
| Meeting filter (per building) | preserved: `m.buildingId === user.buildingId` (or no filter when buildingId is unknown) — the resident only ever sees their own building's meetings |
| Loading modal (meeting not yet hydrated) | preserved — when `selectedMeetingId` is set but `meetings.find(...)` returns nothing, show the small loading sheet |

No new endpoints, no new modal: the per-meeting flow is the existing
`MeetingVotingModal`. The list page just opens it.

## Shell + BottomBar
- `/meetings` is added to `isResidentFullBleed` in `Layout.tsx`. Side-effects:
  - `<main>` carries `page-content-full-bleed` (no per-device mobile padding compounding — the page paints its own 16-px sides).
  - The global `MobileHeader` is hidden on this route (the page's own sticky header takes over).
- Warm beige `var(--app-bg)` background, light status bar via the global theme-color — unchanged.
- The `MeetingVotingModal` already registers itself with `useModalPresence(true)` (shipped in §03), so the global BottomBar hides when a card is opened and restores on close. No change here.
- BottomBar stays portaled / fixed as everywhere else; `Главная` remains the fallback active tab on `/meetings`.

## Out of scope
- The voting modal contents (handoff §03 — shipped)
- Admin / manager / director meetings pages
- Reconsideration-request endpoints / data shape
- BottomBar, Layout (apart from the one full-bleed predicate), Sidebar, Home, Chat, Profile, Vehicles, Passes, Rating, Contacts, Announcements
- Overlay-hide registry contract (still `modalStore.useModalPresence`)
- Auth / password / verification
