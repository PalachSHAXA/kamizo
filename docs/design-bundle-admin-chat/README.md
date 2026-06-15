# Admin Chat Design Bundle — reference archive

This folder is the **reference design** for the УК-side ("admin")
chat feature in Kamizo — the operator inbox that managers, directors
and dispatchers use to talk to residents. It was produced via Claude
Design (claude.ai/design) on 2026-06-04 and archived here as the
authoritative spec for the multi-phase implementation.

**Nothing in this folder is imported or built.** It's static
documentation that lives alongside [`DESIGN.md`](../../DESIGN.md) at the
repo root. The `.jsx` files describe the *intent* of each panel in a
self-contained prototype; the real implementation lives in
[`src/frontend/src/pages/chat/`](../../src/frontend/src/pages/chat/) and
uses the project's own components, tokens, and data plumbing — not the
prototype's hardcoded mock data.

---

## What's in here

| File | What it is |
|---|---|
| `kamizo-admin-chat.jsx` | The **ListPanel + ConvCard** implementation. The left/overview side: conversation list, search, branch + house + unread filters, segmented "Все / Непрочитанные" control, empty state. ~200 lines of self-contained JSX with FOUNDATION tokens (`--brand`, `--surface`, `--ink`, `--brand-tint`, `--brand-dark`, `--text-primary/secondary/muted`, etc.). |
| `kamizo-admin-dialog.jsx` | The **DialogPanel** implementation. The right/thread side: resident-context header, message timeline, system request chips, quick-reply templates, in-chat search overlay, multi-operator author labels, internal notes (yellow operator-only), composer. The Phase 2 + Phase 3 reference. |
| `chat-spec.md` | The **business-logic spec** for the chat module. Roles + their rights, tenant-isolation rules, channel/message data model, user flows, state matrices, the role of `active_request_id`, the multi-operator-author convention. Read this BEFORE adding any chat backend or new flow. |
| `chats/chat1.md` | Design conversation #1 — early system design (~3,500 lines). Context for the broader Kamizo redesign that the chat module is a sub-feature of. |
| `chats/chat2.md` | Design conversation #2 — the chat-specific design session (~715 lines). The decision rationale for the dialog panel shape, system chips, internal-notes color, the segmented filter control, etc. Read this to understand *why* the design landed where it did. |

The `.jsx` files reference globals (`window.BRANCHES`, `window.ADMIN_PHOTOS`)
defined in a sibling `kamizo-admin-data.jsx` that's not copied here —
the real implementation already has its own data sources (chatStore,
buildingStore, etc.), so the mock module isn't load-bearing for the
migration.

---

## Implementation status — phased migration

### Phase 1 — ListPanel + ConvCard refresh ✅ shipped

Commit [`0c52d0ed`](https://github.com/PalachSHAXA/kamizo/commit/0c52d0ed) (SW v104) — three targeted visual swaps on
[`AdminChannelList.tsx`](../../src/frontend/src/pages/chat/AdminChannelList.tsx)
that match the design intent without rewriting the data layer:

1. **Active row indicator** — 3px LEFT brand-orange border (was 2px
   right). LTR reading order puts the active card under the eye before
   the row text reaches it.
2. **Unread timestamp tint** — `text-orange-700` (= brand-dark family),
   one step deeper than the row indicator so both read as the same
   brand-orange family at different intensities.
3. **Segmented "Все / Непрочитанные" control** — single
   `var(--surface-sunken)` track with `bg-white` pills + `shadow-sm`
   on the selected side; `role="tablist"` + `aria-selected` for
   keyboard + screen-reader.

All existing wiring (tenant isolation, WebSocket realtime, image
markdown, message data model, branch/building filters) preserved
verbatim. Resident chat untouched.

### Phase 2 — DialogPanel refresh (deferred, see `kamizo-admin-dialog.jsx`)

Frontend-only follow-up. Estimated 500-700 lines of changes across
[`ChatView.tsx`](../../src/frontend/src/pages/chat/ChatView.tsx),
[`MessageBubble.tsx`](../../src/frontend/src/pages/chat/MessageBubble.tsx)
and a new shared `SystemChip` component:

- Resident-context header — avatar + name + house + apt + info
  dropdown
- "Перейти к заявке #UK-S-1001" CTA bar when an active request is
  linked to the channel
- `SystemChip` centered chip for inline request announcements within
  the timeline
- `ATicks` brand-tint when a message is read (vs the current
  `lucide-react` `CheckCheck`)
- `Highlighted` substring match utility (paired with Phase 3
  in-chat search)

### Phase 3 — additive surfaces (deferred — partially frontend, partially backend)

Each requires the surfaces from Phase 2 to land first:

- **Quick-reply template strip** above the composer (per-operator
  templates). Frontend-only — adds local state + a template-edit
  modal.
- **In-chat search overlay** with `↑↓` arrow-key navigation between
  matches. Frontend-only — works on the already-loaded message
  array.
- **Internal notes** (yellow background, "оператор → оператор",
  invisible to residents). **Requires backend**: a new
  `chat_messages.is_internal` column, an API filter so resident
  reads exclude internal rows, and a UI affordance to compose an
  internal note vs a public message. See `chat-spec.md` §3.2.

---

## How to use this archive

- **When touching the admin chat code**: read `chat-spec.md` first
  (especially §2 Roles, §3 Data model, §4 User flows). The spec
  pre-dates and defines what each role can see/send/delete, and the
  tenant-isolation rules are NOT discretionary.
- **When designing a new chat surface**: read the relevant `.jsx`
  prototype, follow its token usage as the colour intent, but
  translate the tokens to the project's own
  [`src/index.css`](../../src/frontend/src/index.css) equivalents
  (`--themed-*`, `--brand`, `--switch-on-bg`, etc.) — most have
  direct counterparts already. Add a token only if no equivalent
  exists, and document the addition in [`DESIGN.md`](../../DESIGN.md)
  per its v96 conventions.
- **When unsure about a design decision**: search `chats/chat2.md`
  for the relevant component name; the rationale is usually in
  there as a back-and-forth between the user and the design
  assistant.

---

## Provenance

- Designer: a Claude Design session (claude.ai/design) on 2026-06-04
- Bundle ID: `s1DnFOF2PXsnz7uxSKfItg`
- Original tar: `kamizo/project/Kamizo Admin Chat.html` + siblings
- Extracted and archived here on 2026-06-15 alongside the Phase 1 ship
