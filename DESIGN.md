# Kamizo design system — guardrails

This file is the short answer to "why is the dark mode breaking again?"
It exists so the next person adding a UI element doesn't re-discover the
same three root causes the v85→v96 fix waves uncovered.

If your PR adds a new component, a new modal, or a new pill/chip and
you're tempted to write `#FFFFFF`, `bg-white`, `bg-stone-100`, or a fresh
`background: linear-gradient(180deg, #faf8f6 0%, …)` — stop and read this.

---

## Three root causes that repeatedly broke dark mode

### 1. Modal shells that paint a literal light background

The shared bottom-sheet wrapper is the `.modal-content` CSS class
declared in [`src/frontend/src/index.css`](src/frontend/src/index.css#L1033).
Before v96 it had a hardcoded
`background: rgba(255, 255, 255, 0.95)` that didn't theme. Every modal
that adopted the class inherited the bug:

- `pages/shared/CreateRequestModal.tsx` (manager Create Request — the
  user-reported "labels invisible" bug)
- `pages/shared/components/ManagementRequestModal.tsx` (request detail
  for managers)
- `pages/shared/RequestsPage.tsx` (inline assign-executor picker)

Fix shipped in v96: `html.dark .modal-content { background: rgba(37, 32, 26, 0.96); … }`
re-themes the shared shell — every consumer flips automatically.

**Rule for new modals:** use the `.modal-content` class (or wrap your
modal in something that does). Do not invent a new shell with a literal
`bg-white` / `#FFFFFF`. If you genuinely need a different shape, add the
same `html.dark` override right next to its light declaration, in the
same file.

The canonical example of a modal that uses the class correctly is the
**ComplexEditModal** rendered by `pages/admin/components/buildings/BuildingModal.tsx` — copy that pattern.

### 2. Pill / chip selected-state that uses a Tailwind color outside the safety-net

Three sites had identical bugs (light-beige pill + invisible text in
dark) because they used Tailwind utility classes from a palette family
that wasn't in the v85 dark safety-net:

- `pages/MeetingCreateModal.tsx` format pill (`bg-primary-50`)
- `pages/AnnouncementsPage.tsx` target-type pills (`bg-primary-100`)
- `pages/StaffProfilePage.tsx` language switcher (`bg-primary-50`)

The bug was structural: `primary-50` / `primary-100` map to `--brand-50`
/ `--brand-100` CSS vars, declared only in `:root`. Dark mode didn't
override them, so the literal warm-peach #FFF7ED / #FFEDD5 carried into
the dark page.

v96 extended the safety-net to cover `primary-*` (and the
slate/indigo/emerald/pink/rose/purple/cyan/teal/violet/sky/lime/stone
families that had the same problem on icon chips). The safety-net is at
[`src/frontend/src/index.css`](src/frontend/src/index.css) — search for
the section comment "Pill-family Tailwind utilities". Every `bg-<color>-50`
and `bg-<color>-100` of every active palette is now mapped.

**Rule for new pills/chips:** when in doubt, check the safety-net. If
you're using a class not in there (`bg-fuchsia-100`?), add it.

### 3. Components that ship their own design-token const block

Several files declared their own private const block at the top:

```ts
const SURFACE = '#FFFFFF';
const TEXT_PRIMARY = '#1C1917';
const TEXT_ON_DARK = '#F4F0E8';
```

…then used `style={{ background: SURFACE, color: TEXT_PRIMARY }}` inline.
Light hex never themed — the chat surfaces (v87), four resident pages
(v92), and pill foregrounds (v94) all needed manual migration.

The pattern that works: `var(--themed-X, <literal-light-hex>)`. The var
is declared **only** under `html.dark` in `index.css` so light mode
falls back to the literal hex and stays byte-identical:

```ts
const SURFACE = 'var(--themed-surface, #FFFFFF)';
const TEXT_PRIMARY = 'var(--themed-text-primary, #1C1917)';
```

**Rule for new components:** if you add a const block of design tokens,
each entry must read through `var(--themed-…, hex)`. If you need a new
token, add it to the `html.dark` block in `index.css` — never declare a
new family in :root that doesn't have a matching dark override.

### 4. Sticky page headers + literal-hex const blocks on themed surfaces

After v96 we tripped over a fourth recurring shape: page-top sticky
headers with a hardcoded translucent-beige bg + a const block at the
top of the file that ships pure literal hex (not the `var(--themed-…,
hex)` pattern from root-cause #3). The Resident Passes page
(`pages/ResidentGuestAccessPage.tsx`) had both at once:

```ts
const TEXT_PRIMARY   = '#1C1917';      // ❌ doesn't theme
const TEXT_SECONDARY = '#6F6A62';      // ❌ doesn't theme
const SURFACE        = '#FFFFFF';      // ❌ history-icon button stays white
…
<div style={{ background: 'rgba(244,240,232,0.92)', … }}>   // ❌ light strip on dark page
```

In dark mode the page bg flipped via `--app-bg` (correct), but the
sticky header stayed warm beige and every label inside still painted
`#1C1917`-dark — producing the "half-themed bar" the user reported:
dark page below, light strip on top with dark-on-dark unreadable text.

Fix uses the existing token plumbing — no new files, no new selectors:

```ts
const TEXT_PRIMARY     = 'var(--themed-text-primary, #1C1917)';   // ✅
const TEXT_SECONDARY   = 'var(--themed-text-secondary, #6F6A62)'; // ✅
const SURFACE          = 'var(--themed-surface, #FFFFFF)';        // ✅
const STICKY_HEADER_BG = 'var(--themed-strip-bg, rgba(244,240,232,0.92))';
…
<div style={{ background: STICKY_HEADER_BG, … }}>                 // ✅
```

`--themed-strip-bg` was already defined under `html.dark` from a prior
chat-strip task (`rgba(26,22,18,0.92)`) — the sticky header just had
to start reading it.

**Rule for sticky headers + per-page const blocks:**
- Every entry in a page-level const block MUST resolve through
  `var(--themed-X, hex-fallback)`. Never ship a raw literal hex.
- The sticky header background goes through `--themed-strip-bg` (or
  declare a same-named page-specific token next to its `html.dark`
  override). Don't paint `rgba(244,240,232, …)` inline.
- Any white circular button (history, close, share) inside a sticky
  header reads `--themed-surface` for its bg so it themes with the
  strip.

### 5. Modal shells: prefer `.modal-content` over `bg-white`

Closely related to root-cause #1 — and the bug that took the QR pass
modal (`pages/guest-access/QRCodeDisplay.tsx`) out of dark mode in this
same wave. The modal's outer card was `<div className="bg-white …">`
instead of `<div className="modal-content …">`. Result:

- The shell stayed white in dark mode (no override).
- Every `text-gray-500` / `text-gray-700` label inside DID flip to a
  light beige via the existing text-color safety net (`index.css`
  L374-L380, `html.dark .text-gray-*`).
- Light beige labels on a still-white card = "invisible".

A single class change fixed every label in one stroke — no per-label
edits needed:

```tsx
- <div className="bg-white rounded-t-2xl sm:rounded-2xl max-w-md w-full max-h-[90dvh] overflow-y-auto">
+ <div className="modal-content max-w-md">
```

**Rule for new/legacy modals:** if you find a `bg-white rounded-…
max-w-* max-h-[…vh] overflow-y-auto` shell on a `fixed inset-0`
overlay, that's a modal shell — convert to `.modal-content`. It
already encodes the bg, border, shadow, backdrop-blur, mobile
bottom-sheet behaviour, and the `html.dark` override.

---

## Where the tokens live

- Light values: `:root` block at the top of [`index.css`](src/frontend/src/index.css).
- Dark overrides: `html.dark` block in the same file. **The component-
  level convention is** that dark-only `--themed-*` tokens live ONLY in
  `html.dark` — they're undefined in `:root` so the inline fallback
  wins in light mode. This guarantees pixel-identity for light without
  per-component branching.
- Pill-active fg: `--themed-pill-fg` (= dark text in dark). Used by
  components where a selected pill's bg is a token that flips light in
  dark (e.g. `--themed-text-primary` becomes `#F4F0E8` in dark).
- Modal shell: `.modal-content` + `html.dark .modal-content`.
- Sidebar drawer: `.sidebar` + `.sidebar-item` + `html.dark` variants.
- Secondary button (`btn-secondary` class): `html.dark .btn-secondary`.
- Tailwind safety-net: a giant block of `html.dark .<utility> { … }`
  rules at roughly L240-L520 of index.css. Search for "Tailwind safety-
  net" or "Role / status icon-chip families".

---

## Verification protocol when shipping a UI change

1. Build + install on the emulator (or run the PWA).
2. Walk your screen in **light**, then toggle **dark**, then toggle back.
3. Stuck-color check: any element that stays light in dark is a bug. Any
   element that stays dark in light is a bug.
4. Run this grep to spot literal hex:
   ```
   grep -nE "background:[ ]*'#FFFFFF|background:[ ]*'#FFF'|background:[ ]*'#fff'|backgroundColor:[ ]*'#FFFFFF'" <your-file>
   ```
5. Same for Tailwind classes — anything in your diff that's `bg-white`,
   `bg-gray-100`, or a new pastel `bg-<color>-50` should be intentional.
6. If it's a modal: are you using `.modal-content` (preferred) or your
   own shell? If your own, add `html.dark` override at the declaration.

---

## When the safety-net should be extended

You don't need to tokenise every chip in a new feature. The safety-net
exists so common Tailwind utilities theme automatically. Two cases:

- **Tailwind utility, NOT in safety-net** → add it once to `index.css`
  in the "Tailwind safety-net" block. Now every future use is covered.
- **Literal hex** (inline style or custom CSS class) → either migrate to
  tokens, or add a one-off `html.dark .your-class { … }` rule next to
  the light declaration.

The intentional exceptions (license plate background, QR code chip,
brand-logo container) are kept literally white in both themes because
the visual reads as "real artifact" — they're documented as comments at
the call sites.

---

## When NOT to follow these rules

- super-admin tooling (`src/frontend/src/pages/admin/`) where the user
  intentionally edits a tenant's color — the form needs to render the
  literal color the user picks. The brand unification (v88) covers this:
  the color stays in the DB + form, but doesn't paint chrome.
- recovery / jun4-ui branches — don't touch them.
- The "real artifact" exceptions noted above.

If you're tempted to bypass any other rule, post in #frontend before
shipping.
