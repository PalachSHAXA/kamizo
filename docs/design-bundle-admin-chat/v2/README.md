# Admin Chat Design Bundle — v2 (CcgCOhkNYkJE0bRGRP-aPQ)

This is the **updated reference** design bundle for the УК-side admin
chat, fetched 2026-06-16. It supersedes the deferred Phase 2 reference
from the v1 bundle in the parent directory (still kept for history).

**Nothing here is imported or built** — same convention as the parent
`design-bundle-admin-chat/` folder. Static reference only.

## What's in here

| File | Purpose |
|---|---|
| `kamizo-admin-chat.jsx` | v2 ListPanel + ConvCard impl. Phase 1 was already implemented against the v1 version of this file (commit `0c52d0ed`, SW v104) and the design intent for the list panel didn't change meaningfully between v1 and v2 — no list-panel work needed. |
| `kamizo-admin-dialog.jsx` | v2 DialogPanel impl. Phase 2 reference. Reads top-to-bottom as the spec for: dialog header (avatar+name+house+apt+search+info), in-chat search overlay, message bubbles (regular + internal-notes-yellow), system chips, quick-replies row with templates-editor trigger, composer with internal/public toggle + attach menu + auto-grow textarea + send button, info dropdown (resident profile + phone + linked requests + actions), templates editor modal, desktop empty state, mobile orchestrator, and the loading skeleton. |

## Implementation status (after this bundle landed)

### Phase 2 (partial) — shipped in SW v105
- **Desktop empty state** in `ChatPage.tsx` migrated to match v2 design's
  `EmptyDesktop` (76×76 themed icon tile + bilingual headline + helper
  capped at 280px width).
- **QuickReplies pills** in `QuickReplies.tsx` migrated to the v2
  design's neutral-themed pill row (was bright orange-tinted) so they
  blend with whatever surface sits behind, and the existing tap-to-fill
  composer behavior is preserved (operator edits before sending).

### Phase 2 (still deferred)
- DialogPanel header rewrite with avatar + house+apt + search-toggle + info-dropdown
- In-chat search overlay with arrow-key nav between matches
- Message bubble redesign (gradient orange outgoing with operator-author label)
- System chips (centered request-state pills)
- Templates editor modal (per-tenant config — needs backend)
- Composer auto-grow textarea + plus-icon attach menu (currently uses existing composer)
- Info dropdown (resident profile + linked requests + assign/close actions)

### Phase 3 (still requires backend)
- Internal notes (yellow bubbles, operator-only) — needs `chat_messages.is_internal` column + API filter
- Quick-reply templates persistence (per-tenant config storage)

See `kamizo-admin-dialog.jsx` top-to-bottom for the Phase 2/3 source of truth.
