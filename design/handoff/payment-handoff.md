# Payment / Оплата (resident) — Claude Design handoff

**Source bundle:** https://api.anthropic.com/v1/design/h/yYxWUEm8bp068cu2Rh8NAA?open_file=screens%2F09-oplata.html
**Primary screen:** `screens/09-oplata.html` (mounts `<FinanceScreen activeTab="home" />`)
**Fetched:** 2026-06-06
**Branch:** `feature/payment-handoff`

Single source of truth for the resident **`/finance/charges`** surface. The
existing `ChargesPage.tsx` keeps the full staff finance UX; when the visitor
is a resident / tenant / commercial owner, the page now dispatches to a new
[ResidentFinancePage](src/frontend/src/pages/finance/ResidentFinancePage.tsx)
that matches the handoff. Manager / admin / director paths are unchanged.

## Files in this folder
- `payment-handoff.md` — this spec
- `payment-09-oplata.html` — raw screen HTML
- `kamizo-payment.jsx` — the `FinanceScreen` component (handoff exports it under that name)
- `tokens-payment.css` — full token sheet
- `payment-README.md` — bundle README

## Visual structure (in render order)

The page now paints its own 16-px sides (full-bleed) — the global
`MobileHeader` is hidden on this route for resident roles and the page's
own sticky header takes over. Staff/admin paths keep the global header
unchanged.

### 1. Header
- `padding: calc(env(safe-area-inset-top) + 14px) 16px 8px`
- Eyebrow `Кв. {apartment} · {ЖК name}` — 11.5 / 700 / 0.04em uppercase / `var(--text-secondary)`. Building name pulls from `useBuildingStore.fetchBuildingById(user.buildingId)` (lazy-loaded, same pattern as the §07 profile & sidebar wiring). Falls back to `user.building`, then `user.address`.
- Title `Оплата` — 24 / 800 / `-0.025em`.

### 2. Balance card (dark gradient)
The card adapts to three derived states:
- `clear` — all charges fully paid (`total_debt === 0`)
- `due` — debt > 0, no charge is `overdue`
- `overdue` — at least one charge has status `overdue`

Backgrounds (per state):
- `due` — `linear-gradient(160deg, #4A3B30 0%, #2A2018 100%)` + amber radial glow
- `overdue` — `linear-gradient(155deg, #7A2520 0%, #2A1816 100%)` + red radial glow
- `clear` — `linear-gradient(155deg, #15734F 0%, #143A2A 100%)` + green radial glow

Content:
- Eyebrow 12.5 / `rgba(244,240,232,0.7)`: `Баланс квартиры` (clear) / `К оплате за {month}` (due) / `Просроченная задолженность` (overdue).
- When `clear` → 44 × 44 green-tint Check + `Нет задолженности` 22 / 800.
- When `due` / `overdue` → tabular `{fmtSum}` 36 / 800 / `-0.03em` + `сум` suffix 16 / 600.
- Hint row (due/overdue only) — clock icon + `Срок до {dueDate}` / `Просрочено с {oldestOverdueDate} · начисляется пеня`.
- Primary CTA (full-width, padding 14, radius `var(--radius-md)`):
  - `due` / `overdue` → `var(--brand)` bg, white fg, card icon + `Оплатить {sum} сум`. **LOCKED** — tap shows info toast `Онлайн-оплата скоро. Сейчас доступна оплата в кассе УК.` Adds a subtle ⓘ glyph after the label so the locked state reads visually.
  - `clear` → translucent `rgba(244,240,232,0.15)` bg, label `История платежей`. Tap toggles the payments inline list (real data, see §4).

### 3. Charges list ("Начисления")
- Section header row: eyebrow `Начисления` 11 / 800 uppercase + right-side text button `Акт сверки` 12.5 / 700 / `var(--brand-dark)` with download icon (**LOCKED** — tap shows info toast `Акт сверки скоро. Запросите у УК.` Backend route `POST /api/finance/claims/reconciliation` exists but only returns JSON; no PDF generator is wired up. The button stays visually identical to the handoff, ready to wire when PDF rendering lands).

Each charge card (vertical stack, gap 8):
- White surface, 1 px `var(--border-c)`, radius `var(--radius-lg)`, shadow `var(--shadow-sm)`.
- Tap target = full card; expands the line items below.
- Left column: title 14.5 / 700 / `-0.01em` = `charge.description || charge.estimate_item_name || 'Начисление'`. Sub 12 / `var(--text-muted)` = formatted period (`Май 2026`).
- Right column: amount 15 / 800 tabular + status pill 10 / 700 / radius 999. Pill maps from `charge.status`:
  | status | label (RU) | fg | bg |
  |---|---|---|---|
  | `paid` | Оплачено | `var(--status-active)` | `var(--status-active-bg)` |
  | `pending` | К оплате | `var(--status-pending)` | `var(--status-pending-bg)` |
  | `partial` | Частично | `var(--status-pending)` | `var(--status-pending-bg)` |
  | `overdue` | Просрочено | `var(--status-critical)` | `var(--status-critical-bg)` |
- Trailing chevron-down that rotates 180° when expanded.

Expanded body — replaces the handoff's hard-coded sub-items (e.g. `Уборка / Лифт / Освещение МОП`) which DON'T exist in the API as line items: instead we surface the real per-charge breakdown the backend already returns:
- `Начислено: {amount} сум`
- `Оплачено: {paid_amount} сум`
- `Остаток: {amount - paid_amount} сум`
- `Срок до: {due_date}` (if present)
- `Дата начисления: {generated_at}` (if present)

When the backend later joins charges to estimate items, the renderer can swap in the true `[name, amount]` rows without changing the card chrome.

### 4. Payments history (inline expansion)
Visible when balance state is `clear` and the user toggled `История платежей`, OR always as a small "Последние оплаты" block below the charges when there are entries:
- Section header eyebrow `Последние оплаты`.
- Each row: payment_date (formatted) + payment_type icon + amount tabular. Source: `financeApi.getPayments({ page: 1, limit: 10 })` — server auto-filters by `user.id`.

### 5. Building expenses ("Куда идут средства дома") — OMITTED
The handoff includes a "stacked bar + legend" expense breakdown
(Зарплата персонала / Ремонт / Коммунальные МОП / Прочее). There is
**no resident-readable endpoint** for per-category building expenses
(`/api/finance/expenses` requires staff `view_only` access). We omit
this section entirely rather than fake data. When a public summary
endpoint lands (e.g. expose category aggregates in
`/api/finance/charges/summary` for the resident's building), it can be
plugged in without touching the rest of the layout.

## Wiring contract — every action gets a real handler

The interface is a self-contained page (no props).

| Action | Real handler |
|---|---|
| Mount | `financeApi.getCharges({})` — server auto-filters by `apartment.primary_owner_id = user.id`. We also call `getCharges({ period: currentPeriod })` to know the current month's total. |
| Balance state derivation | computed from the returned charges:<br>• `clear` when every charge has `status === 'paid'` (or list is empty);<br>• `overdue` when at least one charge has `status === 'overdue'`;<br>• `due` otherwise. The sum is `Σ (amount - paid_amount)` of non-paid charges. |
| Charge card tap | local `setExpanded(id => id === id ? null : id)` |
| **Оплатить {sum} сум** | LOCKED — `useToastStore.addToast('info', 'Онлайн-оплата скоро. Сейчас доступна оплата в кассе УК.')` |
| **История платежей** (clear state) | toggles inline `getPayments({ page: 1, limit: 10 })` (real, resident-filtered) |
| **Акт сверки** | LOCKED — `useToastStore.addToast('info', 'Акт сверки скоро. Запросите у УК.')` |
| Eyebrow building name | `useBuildingStore` (lazy `fetchBuildingById(user.buildingId)`) |

No new endpoints. All reads use existing resident-readable routes.

## Locked actions (no backend support yet)

- **`Оплатить {sum} сум`** — there is no online payment gateway (Payme / Click / Octobank) integration. `POST /api/finance/payments` is staff-only (`hasFinanceAccess(..., 'payments_only')`) and records a cash/transfer receipt manually after the resident pays offline. Until an online gateway lands, the button shows an info toast. This matches the existing pattern from the ResidentDashboard "Онлайн-оплата и счётчики — в разработке" card.
- **`Акт сверки`** download — `POST /api/finance/claims/reconciliation` exists and is callable by residents, but it returns raw JSON (charges + payments arrays + totals), not a renderable PDF/DOCX. Without a client-side reconciliation renderer, exposing the raw JSON to a resident is useless. The button stays visually identical to the handoff; tap shows an info toast.

## Backend gaps the team needs to fill next (out of scope for this PR)

1. **Online payment gateway** — wire `POST /api/finance/online-payments/init` returning a redirect URL for Payme / Click / Octobank. Then the brand CTA on this page wires to it.
2. **Per-charge line items** — currently `finance_charges` stores a single `amount` per row; the per-item breakdown (Уборка, Лифт, Освещение МОП) lives only on `finance_estimates.items`. Either (a) clone the estimate items into a `finance_charge_items` table at generate time, or (b) expose a `GET /api/finance/charges/:id/items` endpoint that joins back to the source estimate.
3. **Resident-readable expense aggregate** — for the "Куда идут средства дома" pie/bar. Either expose `/api/finance/expenses/resident-summary?building_id=…&period=…` returning `{ category_name, percent, amount }[]`, or include a `by_category` field in `/api/finance/charges/summary`.
4. **Reconciliation PDF generator** — wrap the existing `/api/finance/claims/reconciliation` JSON response in a server-side PDF (so the resident's "Скачать акт сверки" button delivers a signed, printable doc).

## Shell + BottomBar
- `/finance/charges` is added to `isResidentFullBleed` in `Layout.tsx` **but only for resident-family roles**. Staff hitting the same URL keep the existing chrome (`MobileHeader`, `.page-content` padding) because their UI is the existing complex filter page.
- Warm beige `var(--app-bg)` background, light status bar via the global theme-color — unchanged.
- No modal opens on this page — `useModalPresence` is not used here.
- BottomBar stays portaled / fixed as everywhere else; `Главная` remains the fallback active tab.

## Out of scope
- Staff / admin finance pages (estimates, debtors, income, expenses, materials, settings, payments)
- Online payment gateway (no endpoint)
- Charge line-item joins (current schema doesn't link charges to estimate items)
- Building expenses breakdown for residents (no endpoint)
- Reconciliation PDF renderer (server only returns JSON)
- BottomBar, Layout (apart from the role-gated full-bleed predicate), Sidebar, Home, Chat, Profile, Vehicles, Passes, Rating, Contacts, Announcements, Meetings, Request details, Contract
- Overlay-hide registry contract (still `modalStore.useModalPresence`)
- Auth / password / verification
