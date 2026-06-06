# Contract / Договор (resident) — Claude Design handoff

**Source bundle:** https://api.anthropic.com/v1/design/h/tS7dQGX1RR7S02ztI_bKtQ?open_file=screens%2F14-dogovor.html
**Primary screen:** `screens/14-dogovor.html` (mounts `<ContractScreen activeTab="profile" />`)
**Fetched:** 2026-06-06
**Branch:** `feature/contract-handoff`

Single source of truth for the resident **`/contract`** page. Implementation
lives at [src/frontend/src/pages/ResidentContractPage.tsx](src/frontend/src/pages/ResidentContractPage.tsx).
Manager / director / executor contract surfaces are NOT in scope.

## Files in this folder
- `contract-handoff.md` — this spec
- `contract-14-dogovor.html` — raw screen HTML
- `kamizo-contract.jsx` — the `ContractScreen` component
- `tokens-contract.css` — full token sheet
- `contract-README.md` — bundle README

## Visual structure (in render order)

The page now paints its own 16-px sides (full-bleed) — the global
`MobileHeader` is hidden on this route and the page's own header takes over.

### 1. Header
- `padding: calc(env(safe-area-inset-top) + 14px) 16px 8px`
- Row with: 40 × 40 round-cornered back button (radius 12, white surface, 1 px `var(--border-c)`, chevron-left icon 19) + 20 / 800 / `-0.02em` title `Договор`. The button goes back via `useNavigate(-1)`, defaulting to `/profile` when there's no history entry (matches the handoff's `onTabChange('profile')` fallback).

### 2. Dark hero card
- `margin: 8px 16px 0`, radius `var(--radius-xl)` (22), padding 20, color `var(--text-on-dark)`.
- Background `linear-gradient(160deg, #4A3B30 0%, #2A2018 100%)`, overflow hidden.
- Decorative radial glow at top-right: `radial-gradient(90% 80% at 88% 0%, rgba(251,146,60,0.45), transparent 55%)`, opacity 0.4.

Contents (in two rows):
- Row 1 (flex, space-between, align-start):
  - 46 × 46 rounded square (radius 13), bg `rgba(244,240,232,0.14)`, with `FileText` icon (24) inside.
  - Status chip — 11 / 700, padding `4 / 10`, radius 999, leading icon 11 px:
    - Signed (`user.contractSignedAt`): bg `rgba(34,197,94,0.18)`, fg `#86EFAC`, label `Действует`, Check icon.
    - Unsigned: bg `rgba(245,158,11,0.20)`, fg `#FCD34D`, label `На подписании`, no leading icon (handoff also drops the icon).
- Title row: `Договор управления` 21 / 800 / `-0.02em` margin-top 14.
- Stats row: two columns, gap 16, margin-top 10.
  - Eyebrow `Номер` 10.5 / 700 / 0.04em uppercase / `rgba(244,240,232,0.55)` + value 14 / 700 tabular = `user.contractNumber` (fallback: `ДОГ-{year}-{user.login}` — preserves the existing placeholder rule from the current page).
  - Eyebrow `Дата` 10.5 / 700 / 0.04em uppercase + value 14 / 700 = `formatDate(user.contractSignedAt || user.contractStartDate || user.createdAt)` formatted `DD.MM.YYYY`. When no date is available, `—`.

### 3. Conditions accordion ("Условия")
- Section title — 11 / 800 / 0.06em uppercase / `var(--text-secondary)`, padding `20 / 2 / 10`.
- Stack of accordion cards (vertical gap 8). Each card:
  - White surface, 1 px `var(--border-c)`, radius `var(--radius-lg)`, shadow `var(--shadow-sm)`, overflow hidden.
  - Header button (padding 15, flex, gap 10): title 14.5 / 700 / `-0.01em` + chevron-down 17 / `var(--text-muted)` that rotates 180° when open.
  - Body (when open): padding `0 / 15 / 15`, 13.5 / `var(--text-secondary)` / lh 1.6.

The handoff lists 4 sections; we ship 4 condensed sections drawn from the
project's existing canonical contract text in
`src/frontend/src/components/ContractPreview.tsx`. The translations from
`ContractPreview` are kept short enough for an in-page accordion (the user can
download the full DOCX from the sticky action). Section content:

1. **Предмет договора** — preamble + 1.x clauses (предмет — управление, содержание, ремонт общего имущества; границы эксплуатационной ответственности).
2. **Права и обязанности сторон** — collapsed 3.1–3.4 from existing preview (УК обеспечивает аварийку, ведёт документацию, выставляет начисления; Собственник своевременно платит, обеспечивает доступ, согласовывает перепланировки).
3. **Стоимость и порядок расчётов** — sections 4.x: тариф пропорционален площади, оплата до 10-го числа, пеня 0,1% в день при просрочке.
4. **Срок действия** — sections 9.x: договор действует с момента заключения и продлевается на 1 год при отсутствии уведомления за 30 дней.

Uzbek translations live in the component (`lang === 'uz'`) and follow the same
breakdown.

### 4. Requisites ("Реквизиты сторон")
- Section title same style as above, padding `20 / 2 / 10`.
- 2-column grid (`grid-template-columns: 1fr 1fr`, gap 10). Each cell:
  - White surface, 1 px `var(--border-c)`, radius `var(--radius-lg)`, shadow `var(--shadow-sm)`, padding 14.
  - Eyebrow 11 / 700 / 0.03em uppercase / `var(--brand-dark)` (party label).
  - Column body, gap 4, margin-top 8: first line 12.5 / 700 / `var(--text-primary)` (party name), subsequent lines 12.5 / 500 / `var(--text-secondary)` (details).
- **УК card** — hardcoded from `UK_COMPANY` in `src/frontend/src/utils/contractGenerator.ts` so the values stay consistent with the generated DOCX:
  - Line 1: `ООО «Камизо»`
  - Line 2: `ИНН ${UK_COMPANY.inn}`
  - Line 3: `Ташкент, Махтумкули 93/3`
- **Собственник card** — from `useAuthStore().user`:
  - Line 1: `formatName(user.name)`
  - Line 2: `Кв. ${user.apartment}` + ` · ${user.totalArea} м²` when present. Falls back to `Кв. —` when missing.
  - Line 3: phone masked to `тел. ···{last 4}` (matches handoff's privacy idiom).

### 5. Sticky action bar
- `position: fixed; bottom: 0; left: 0; right: 0`, padding `12px 16px calc(env(safe-area-inset-bottom) + 18px)`.
- Background `rgba(244,240,232,0.95)` + 14-px blur + 1 px top `var(--border-c)`.
- Flex row, gap 10.
- **Скачать договор** button (always present):
  - Flex `1` when the contract is signed; `0 0 auto` when unsigned (handoff layout idiom — leaves room for the brand "Подписать" pill).
  - White surface, 1 px `var(--border-strong)`, radius `var(--radius-md)`, padding `14 / 18`, 14.5 / 700, Download icon + label.
  - Fires `generateContractDocx(user, qrCodeUrl)` (existing — `src/frontend/src/utils/contractGenerator.ts`). On error: `useToastStore.addToast('error', …)` (existing).
- **Подписать** button (only when `!user.contractSignedAt`):
  - Brand-orange pill (flex 1, `var(--brand)` bg, white fg, padding 14, radius `var(--radius-md)`, shadow `var(--sh-brand)`, 14.5 / 700, no icon).
  - **Locked**: there's no self-serve signing endpoint today (the existing `ContractQRCode` component already documents this in a comment — signing currently runs through the УК offline). Tapping shows an info toast `Подписание договора пока проходит через УК. Свяжитесь с управляющей компанией.` and does nothing else. The button stays visually consistent with the design but is wired to the same "feature gated" pattern as similar locked features in the codebase (toast info, no broken state). This is called out in the report so the team can swap in the real handler when the backend lands.

## Wiring contract — every action gets a real handler

| Action | Real handler |
|---|---|
| Mount | `useAuthStore().user` (existing). When `user` is null, render `null` (existing guard preserved). QR code data URL is generated lazily for `generateContractDocx` via the existing `generateQRCode` helper. |
| Back button (top-left) | `navigate(-1)` with fallback `navigate('/profile')` if `window.history.length <= 1` |
| Accordion section header tap | local `setOpen(id => id === s.id ? null : s.id)` — exactly one section open at a time (matches the handoff) |
| Status chip / hero stats | derived from `user.contractSignedAt`, `user.contractNumber`, `user.contractStartDate`, `user.createdAt` |
| УК card content | hardcoded `UK_COMPANY` constants (existing) |
| Собственник card content | from `useAuthStore().user` |
| **Скачать договор** | `generateContractDocx(user, qrCodeUrl, language)` (existing). Generates a real DOCX from `src/frontend/src/assets/dogovor.docx` template, downloads it. iOS/Safari fallback opens the blob in a new tab (already handled by the helper). |
| **Подписать** (unsigned only) | `addToast('info', '…подписание через УК…')` — LOCKED. No backend endpoint exists. See "Locked actions" section below. |
| Sticky bar safe-area | adds `env(safe-area-inset-bottom)` to the bottom padding |

## Locked actions

- **Подписать** — the prototype shows a primary "Подписать" CTA for unsigned residents. There is no self-serve signing endpoint today; the existing `ContractQRCode` component already documents this (signing runs through УК offline). The button is shipped visually identical to the design but its tap shows an info toast and does NOT submit anything. When the legal self-serve flow lands, the button's `onClick` can be wired to it without changing the visuals.

## Shell + BottomBar
- `/contract` is added to `isResidentFullBleed` in `Layout.tsx`. Side-effects:
  - `<main>` carries `page-content-full-bleed` (no per-device mobile padding compounding — the page paints its own 16-px sides).
  - The global `MobileHeader` is hidden on this route (the page's own back+title row takes over).
- Warm beige `var(--app-bg)` background, light status bar via the global theme-color — unchanged.
- No overlay / modal opens on this page — `useModalPresence` is not used here.
- BottomBar stays portaled / fixed as everywhere else; `Главная` remains the fallback active tab on `/contract` (consistent with `/announcements`, `/meetings`, etc.).

## Out of scope
- Manager / director / executor contract pages
- Contract template upload / customisation
- Legal self-serve signing flow (no backend endpoint yet)
- `ContractPreview` modal — not used on this route; remains in the codebase for any future surface that needs it
- BottomBar, Layout (apart from the one full-bleed predicate), Sidebar, Home, Chat, Profile, Vehicles, Passes, Rating, Contacts, Announcements, Meetings, Request details
- Overlay-hide registry contract (still `modalStore.useModalPresence`)
- Auth / password / verification
