# Voting / Голосование (resident) — Claude Design handoff

**Source bundle:** https://api.anthropic.com/v1/design/h/8bULIAeRfEbMdpuKD32o3w?open_file=screens%2F03-golosovanie.html
**Primary screen:** `screens/03-golosovanie.html` (mounts `<VotingScreen onClose={() => {}} />`)
**Fetched:** 2026-06-06
**Branch:** `feature/voting-handoff`

Single source of truth for the resident **per-meeting voting flow** opened from the
"Собрания" list. Implementation lives at
[src/frontend/src/pages/meetings/MeetingVotingModal.tsx](src/frontend/src/pages/meetings/MeetingVotingModal.tsx).
The list page itself ([ResidentMeetingsPage.tsx](src/frontend/src/pages/ResidentMeetingsPage.tsx))
is NOT in this scope — it owns the list of cards + the reconsideration banner +
the new-request popup, all unchanged.

> ⚠️  **Intent from chat1:** the user EXPLICITLY retracted the OTP card that
> appears in the prototype (chat1 around `OTP-голосование — в коде сейчас
> QRSignatureModal, а не OTP. Это была фантазия моего мокапа, отзываю`). The
> implementation MUST keep using the existing `QRSignatureModal` flow — we do
> NOT bring in an OTP modal even though the prototype shows one.

## Files in this folder
- `voting-handoff.md` — this spec
- `voting-03-golosovanie.html` — raw screen HTML
- `kamizo-voting.jsx` — `VotingScreen`, `VoteHero`, `AgendaItem`, `VoteSummaryBar`, `OTPModal` (retracted), post-vote summary
- `tokens-voting.css` — full token sheet
- `voting-README.md` — bundle README (Claude Design's "read me first")

## Visual structure (in render order)

The voting modal is a **full-screen overlay** (not a centered modal) — it owns
the whole viewport while open and is registered with `useModalPresence(true)`
so the global BottomBar hides.

### 1. Sticky topbar (translucent + blur)
- `position: sticky; top: 0; z-index: 5`
- `padding: calc(env(safe-area-inset-top) + 14px) 16px 12px`
- `background: rgba(245,245,244,0.85)` + `backdrop-filter: blur(10px)` + 1 px bottom hairline
- Three slots: back button (36 × 36 round, white, 1 px border, chevron-left icon) → centred title `Голосование` 14 / 650 → info button (36 × 36, same chrome, info icon) for "Как считают голоса" sheet. Title can also be `Собрание #{number}` when the page is opened from a `protocol_approved` meeting.

### 2. Hero card (dark amber-stone gradient)
Rendered for every status except `schedule_poll_open`. Box:
- `margin: 14px 16px 0`, radius 22, padding 18, color `#fff`
- Background `linear-gradient(155deg, #92400E 0%, #44403C 100%)`
- Shadow `0 14px 36px -10px rgba(68,64,60,0.5)`
- Two decorative amber blurs (top-right + bottom-right)

Header row: amber `Идёт` status chip (pill, `rgba(251,191,36,0.22)` bg, `#FB923C` fg, leading 6-px dot) + `Голосование №{meeting.number}` muted right.

Title: `meeting.agendaItems[0].title || "Собрание #{meeting.number}"` — 19 / 650 / `-0.02em` / lh 1.25.

3-stat grid (`grid-template-columns: repeat(3, 1fr)`, gap 10, margin-top 14):
| Stat | Source |
|---|---|
| `Кворум {percent}%` + sub `X из Y` | `calculateQuorum()` |
| `Осталось {n} {дн/ч/мин}` + sub `до DD.MM` | `meeting.votingClosedAt` / `meeting.schedulePollEndsAt` / fallback `Сегодня` |
| `Бюджет {n}М` + sub `сум` (optional) | parsed from `budget_approval` agenda items (largest number found in title/description). Hidden when no budget agenda item is present — the grid collapses to 2 columns so the stat row stays balanced. |

Quorum bar: 6-px track `rgba(255,255,255,0.18)` with filled portion `#FB923C` width = quorum%; subtitle `Для принятия решения нужно ≥ {threshold}% голосов от собственников`, threshold from `meeting.votingSettings.quorumPercent || 50`.

The status chip's label + colour adapts to `meeting.status`:
- `voting_open` → `Идёт` / `#FB923C`
- `schedule_poll_open` → `Опрос даты` / `#FB923C`
- `voting_closed` / `results_published` → `Подсчёт` / `#FCD34D`
- `protocol_approved` → `Завершено` / `rgba(255,255,255,0.55)`

### 3. Status-specific body

#### 3a. `schedule_poll_open` — date poll
Kept functionally identical to today's implementation (one-vote-only, leading badge, percent bars on each option), restyled to the new tokens:
- Section header `Голосование за дату` 12.5 / 600 / uppercase / muted
- Options as white cards with rounded-18, 1 px border, shadow `var(--sh-1)`. Selected card: `#FFF3EA` bg + `#FBA34A` border. Already-voted lock card (light green) shows below the list.
- Vote-percent fill renders as a `width:{pct}%` overlay inside each card (same as today).

#### 3b. `voting_open` — agenda
Section header `Повестка · {meeting.agendaItems.length} {вопрос[а/ов]}` 12.5 / 600 / uppercase / `0.04em` / muted, padding `0 4px 10px`.

Each agenda item is a card: white, 1 px border, radius 18, shadow `var(--sh-1)`, marginBottom 10, padding 16.

Card body:
- Header row: 26 × 26 amber index badge (`#FEF3C7` bg, `#B45309` fg, radius 8, 13 / 700, the agenda item's 1-based order). Right of badge: title 15 / 650 / `-0.01em` lh 1.3 + description 12.5 / muted lh 1.4 + threshold pill (existing `DECISION_THRESHOLD_LABELS`).
- Attachments strip (when present): horizontal scroll. Images → 80 × 80 thumbnails. Files → 1.5-px file icon + name pill, all `onClick={stopPropagation}` with `target="_blank"` / `download`.
- 3-button vote row (`grid-template-columns: repeat(3, 1fr)`, gap 6, margin-top 6):
  - **За** — `#DCFCE7` bg, `#15803D` fg. Selected: `#16A34A` bg, white fg, `0 4px 12px rgba(22,163,74,0.25)` shadow.
  - **Против** — `#FEE2E2` bg, `#B91C1C` fg. Selected: `#DC2626` bg, white fg.
  - **Воздерж.** — `#F5F5F4` bg, `#57534E` fg. Selected: `#78716C` bg, white fg.
  - Each button: leading icon (check / x / minus, 14 px stroke 2.6), label 12.5 / 650, then `{count} · {pct}%` 10.5 with tabular numerals. Counts are the running tally including the user's pending choice (mirrors the prototype's `count + (vote === 'for' ? 1 : 0)` UX trick so the bar reacts before submit).
- Result bar (4-px height, radius 999, `var(--stone-150)` track) split into 3 flexed segments — green / red / stone-400 — proportional to live counts.
- **Objection reveal (Against)** — when the pending or submitted vote is `against`:
  - Container: `#FEF2F2` bg, 1 px `#FECACA`, radius 12, padding 12, margin-top 12.
  - Heading: `Обоснуйте возражение` 12 / 600 / `#991B1B` + info icon.
  - Textarea: 1 px `#FECACA` border on white, radius 10, 13 / lh 1.4, `resize: none`. Existing 20-character minimum + 1000 maxLength behavior preserved.
  - Optional second textarea for `Альтернативное предложение` (`pendingCounterProposals[item.id]`) — preserved.
  - Footer note `Возражение прикрепляется к протоколу собрания.` 11 / `#7F1D1D`.
- **Optional comment field (For / Abstain)** — preserved exactly as today: 2-row textarea below the vote row, `Обоснование (будет в протоколе)`, optional, 500 char limit.

After the agenda list there is a single info row (existing "Voting Instructions" banner, restyled): `var(--stone-100)` bg, 1 px `var(--border)`, radius 12, padding 12, lock icon (16 px, `var(--text-3)`) + 12 / `var(--text-2)` lh 1.4 text:
> Голос подтверждается электронным ключом и юридически приравнивается к подписи на собрании собственников.

> NOTE: handoff says "кодом из SMS"; we deliberately swap to "электронным ключом" because the existing flow uses `QRSignatureModal` (chat1 retracted OTP).

#### 3c. `voting_closed` / `results_published` / `protocol_generated` / `protocol_approved` — read-only results
Same agenda cards but with the vote-button row hidden. The result bar uses the final percentage (`result.percentFor` from `calculateResult(item.id)`), and a green/red `Принято / Не принято` pill (existing logic) renders when `item.isApproved !== undefined`.

When `votesSubmitted || hasVotedOnAll`, the topbar title flips to `Голос принят` and the **post-vote ballot summary** screen renders (see §4) so the user lands on the "ваш голос учтён" page.

### 4. Sticky bottom action bar (voting_open only, only when there are pending votes)
- Container: `position: fixed; bottom: 0; left: 0; right: 0; z-index: 30`
- Background: `linear-gradient(180deg, rgba(244,240,232,0) 0%, rgba(244,240,232,0.95) 25%, var(--app-bg) 100%)` + 12-px blur. Padding `12px 16px calc(env(safe-area-inset-bottom) + 18px)` so it lifts above the iOS home indicator. The modal already covers the BottomBar so no extra clearance for that is needed.
- Inner card: white, 1 px `var(--border)`, radius 20, padding 14, shadow `0 8px 24px rgba(28,25,23,0.10)`.
- Row 1: `Заполнено X/Y пунктов` 12 / muted on the left; right-aligned mini-counts `За {n}` / `Против {n}` / `Воздерж. {n}` 11.5 / 600 (green / red / muted).
- Row 2: full-width submit button — `Подписать и отправить все голоса` (or `Подтвердить N голос(ов)` when still incomplete). When `ready` (all agenda items voted): `var(--amber-600)` bg with `var(--sh-amber)` glow, white text + chevron-right icon. When not ready: `var(--stone-200)` bg + muted text + label `Заполните все N пункта/ов`. Wires to `handleConfirmAllVotes()` which opens `QRSignatureModal`.

### 5. Post-vote success screen
Replaces the entire page (no scroll body) after `handleSignatureVerified()` succeeds.
- Topbar with back button + `Голос принят` + 36-px placeholder.
- 88 × 88 success circle (`var(--success-bg)` bg, `var(--success)` check icon, stroke 2.6), margin auto.
- Title `Спасибо, ваш голос учтён` 22 / 700 / `-0.02em`.
- Body 14 / muted: `Бюллетень №{ballotNumber} подписан и добавлен в протокол. Итоги — после закрытия {deadline}.` — ballot number derived from `meeting.number` + last 4 of `user.id`.
- Ballot card (white, 1 px border, radius 16, padding 16, shadow `var(--sh-1)`):
  - Eyebrow `Ваш бюллетень` 11 / 600 / uppercase / muted
  - One row per agenda item: amber index badge + title (13 / muted) + result chip (`За / Против / Воздерж.`) — coloured `var(--success-bg)` / `var(--danger-bg)` / `var(--stone-150)`.
- CTA `На главную` (amber-600 button) calls `onClose()` to dismiss the modal.

## Wiring contract — every action gets a real handler

| Action | Real handler |
|---|---|
| Mount | `getScheduleVote()` (existing) + `getUserVotesForMeeting(meetingId, userId)` from the parent page |
| Back button (top-left) | `onClose()` (existing prop) |
| Info button (top-right) | local toggle of a `Как считают голоса` bottom sheet that explains weighted voting (площадь × 1 голос). Implemented as a small in-component `<div role="dialog">`, registered with the parent's existing modal-presence (no new endpoint, no router change). |
| Vote button tap (За / Против / Воздерж.) | `handleVoteClick(agendaItemId, choice)` → updates local `pendingVotes` (no submit yet) |
| Objection textarea | `setPendingComments(prev => ({ ...prev, [id]: text }))` (existing); ≥ 20 chars required (existing validation) |
| Counter-proposal textarea | `setPendingCounterProposals(...)` (existing) |
| Comment textarea (For / Abstain) | same `setPendingComments` (existing) |
| Submit bar `Подписать и отправить все голоса` | `handleConfirmAllVotes()` → opens `QRSignatureModal` (existing) |
| `QRSignatureModal` verified | `handleSignatureVerified()` loops `pendingVotes` and calls `onVote(agendaItemId, choice, true, comment, counterProposal)` (existing prop wired to `voteOnAgendaItem(meetingId, agendaItemId, user.id, user.name, choice, { method: 'e_signature', otpVerified: true }, comment, counterProposal)`) |
| Submit failure | existing `useToastStore.addToast('error', …)` toast + `votesSubmitted = false` to allow retry |
| Submit success | `setVotesSubmitted(true)` → renders the post-vote success screen |
| Schedule poll option tap (when status is `schedule_poll_open`) | `handleScheduleVote(optionId)` → `onScheduleVote(optionId)` → `voteForSchedule(meetingId, optionId)` (existing). One-vote lock + leading badge preserved. |
| Read-only results | derived from `calculateResult(agendaItemId)` + `meeting.agendaItems[i].isApproved` (existing) |
| `Как считают голоса` sheet → close | local close handler; the sheet is registered through the same `<div>` overlay rather than a new modal, so no global registry change |
| `На главную` (post-vote) | `onClose()` |

Nothing in the contract calls a new endpoint. The handoff's OTP modal is intentionally NOT implemented — the verification step remains `QRSignatureModal` (chat1 retraction).

## Shell + BottomBar

`MeetingVotingModal` is rendered from `ResidentMeetingsPage` via `{showVotingModal && selectedMeeting && user && <MeetingVotingModal …>}`. The redesign keeps that exact render contract — only the modal's internal layout changes. The modal itself:

- Renders inside a `fixed inset-0 z-[110]` container with the warm beige `var(--app-bg)` background (full-screen overlay, not a sheet).
- Calls `useModalPresence(true)` at the top of its body so the global BottomBar hides while it's open and is restored on unmount. (Today the modal does not register — the BottomBar overlaps the bottom action card. The redesign fixes that.)
- No change to `Layout.tsx` `isResidentFullBleed` predicate: the page underneath (`/meetings`) keeps its existing chrome.
- No change to `Sidebar`, `Home`, `Chat`, `Profile`, `Vehicles`, `Passes`, `Rating`, `Contacts`, `Announcements`, `BottomBar`, `MobileHeader`.

## Out of scope
- Reconsideration request banner / new-request popup on `ResidentMeetingsPage`
- The meetings list cards themselves (those map to handoff §05 `05-sobraniya.html`, future work)
- Admin / manager / director meetings pages
- Auth / password / verification
- BottomBar, Layout (no full-bleed change for this page — modal handles its own chrome)
- Overlay-hide registry contract (still `modalStore.useModalPresence`)
- The OTP modal from the prototype — explicitly retracted by the user
