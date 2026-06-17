# Profile deep-linking from chat InfoDropdown — RESOLVED

**Status**: ✅ RESOLVED on 2026-06-17 (v122)
**Resolution**: Option **B** — query-param convention
`/residents?focus=:id`. `useResidentsLogic` reads `?focus` on mount,
short-circuits to the in-memory cache when the resident is already
loaded (drilled-down dispatcher), otherwise fetches the tenant-wide
residents list (one call, no building filter) and opens
`ResidentCardModal` directly. Param is cleared via
`setSearchParams({}, { replace: true })` on success or failure so
refresh / back-nav lands on the bare list. Cross-tenant focus IDs
silently miss (tenant-isolated `usersApi.getAll` won't return them).
See [SPRINT-NOTE — 2026-06-17 follow-up](#sprint-note--2026-06-17-followup)
at the bottom for the reasoning that overrode the original D-defer
choice.

**Discovered**: Sprint 84 commit 3 (admin-chat-actions sprint, v121)
**Resolved**: Sprint 84 follow-up (v122)

## Symptom

Tapping **«Профиль жителя»** in the admin chat dialog's InfoDropdown
(the popover behind the `⋮` button next to the channel name) does
nothing. The row is rendered with `disabled` so the click is
visually inert; a `console.warn` fires pointing here.

## Root cause

The frontend app router is **flat** — `Layout.tsx` declares zero
`:param`-style routes anywhere. Every detail view in the admin shell
is reached as a **stateful modal opened from a list page**, never via
a URL deep-link.

For residents specifically:
- `/residents` (the only residents-related route) renders
  `<ResidentsPage>` which lists branches → buildings → entrances →
  residents, then opens `<ResidentCardModal>` via local React state
  when the operator taps a row.
- There is no `/residents/:id` route and no `?focus=:id` convention.
- `ChatChannel.resident_id` **is** exposed on the channel response
  ([chatUtils.ts:30](../../src/frontend/src/pages/chat/chatUtils.ts#L30)
  + verified live: `"resident_id": "53ea1c0f-…"` on the choko test
  channel). The ID is available — only the destination is missing.

## Options considered (Sprint 84 commit 3)

| | Approach | Pros | Cons | Decision |
|---|---|---|---|---|
| A | Add `/residents/:id` route + `ResidentsPage` refactor that fetches the single resident server-side and opens `ResidentCardModal` directly | Clean deep-link, future-proof for shareable URLs, sets a `:param` precedent for the rest of the app (requests/buildings/etc.) | Touches the router, `ResidentsPage`, `useResidentsLogic`; needs a new GET endpoint or an in-list scroll-to-row helper. Architectural decision beyond chat. | not now |
| B | Query-param convention `/residents?focus=:id` — read `useSearchParams` in `useResidentsLogic`, auto-open the card modal on mount | No new route declaration; smaller diff than (A) | Still touches the shared `useResidentsLogic` hook, sets a one-off convention that the rest of the app doesn't follow | not now |
| C | Navigate to `/residents` only (no id) | Strictly one-file change in InfoDropdown.tsx | Lands the user on a generic list. They have to find the specific resident manually — UX gap masquerading as wiring. Explicitly disallowed by commit-3 spec ("don't half-wire it") | not now |
| **D** | **Keep the row disabled, document, ship the rest of commit 3** | One-file change, no half-wires, full decision log preserved | Profile row stays a stub indefinitely | **chosen** |

## Decision

**Defer.** The wiring is blocked on an app-wide routing strategy
decision, not on chat. Forcing a one-off convention (B) or a
list-fallback (C) just for the chat dropdown would either pollute
the shared resident-list state-machine or ship a confusing UX.

## Workaround

For dispatchers who need to look at a resident's profile while in a
chat:

1. Sidebar drawer (hamburger menu) → **Жители**
2. Branch → building → entrance → tap the row matching the chat's
   resident name / apartment

The chat's DialogHeader already shows the resident's name + house +
apartment, so this is a two-step manual lookup, not a search problem.

## Re-evaluate when

- The app router gains its first `:param` route (whether for residents,
  requests, buildings, or whatever — the convention should be set
  app-wide), **OR**
- Real УК users at one of the production tenants generate explicit
  feedback that the manual lookup is a recurring annoyance.

Whichever comes first.

## Related

- [InfoDropdown.tsx](../../src/frontend/src/pages/chat/InfoDropdown.tsx)
  — TODO comment above the row points at this file.
- [chatUtils.ts:30](../../src/frontend/src/pages/chat/chatUtils.ts#L30)
  — `resident_id` field present on `ChatChannel`.
- chat-spec.md §3.1 — `channel.assigned_to` is internal-only per spec.
  Resident-side analogue (showing a resident's profile to staff) is
  not covered by the spec; this issue is the first time the question
  has been asked at the product level.

## Sprint 84 commit 3 — files touched

- `src/frontend/src/pages/chat/InfoDropdown.tsx` — deleted the duplicate
  "Закрыть обращение" row, kept "Профиль жителя" as a documented stub.
- `src/frontend/public/sw.js` — cache bump to v121.
- This file (newly created).
- [INDEX.md](INDEX.md) — index entry.


## SPRINT-NOTE — 2026-06-17 follow-up

The original commit 3 picked **Option D (defer)** on the principle
that wiring should wait for an app-wide routing strategy decision.
Within 24h the product asked for the chat → profile flow to work
end-to-end without that decision, accepting the limitation that the
wiring is chat-only and uses query-param convention rather than a new
`:id` route. We re-picked **Option B** with two adjustments to the
original B sketch:

1. **Tenant-wide fetch, not list-match-only.** The original B sketch
   relied on the resident already being in `apiResidents` (which only
   loads after the dispatcher drills into a building). In real use
   that's almost never true on the chat → profile path, so we add a
   single `usersApi.getAll({ role: 'resident', limit: 5000 })` call
   when the cache miss happens. The endpoint is tenant-isolated
   server-side, so the fetch is safe; cost is acceptable for a
   dispatcher-triggered nav.

2. **Param always cleared.** Whether the fetch succeeds, misses, or
   errors out, we `setSearchParams({}, { replace: true })`. The next
   render doesn't re-fire the effect and the URL is clean for
   back-nav.

The original B-cons remain accurate: this convention is chat-specific
and not used elsewhere in the app yet. When the next surface needs
similar deep-linking, the cleanest move is to lift the
`?focus`-handling pattern into a tiny reusable hook (e.g.
`useFocusParam`). For now it's inline in `useResidentsLogic`.

