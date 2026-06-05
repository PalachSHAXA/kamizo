# Profile (resident) — Claude Design handoff

**Source bundle:** https://api.anthropic.com/v1/design/h/B6EpXP7hDYXxFbQbyD21Sg?open_file=screens%2F07-profil.html
**Primary screen:** `screens/07-profil.html` (mounts `<ProfileScreen activeTab="profile" />` inside `<ScreenFrame>`)
**Fetched:** 2026-06-05
**Branch:** `feature/profile-handoff`

This is the canonical source of truth for the resident Profile page. Treat the HTML/JSX as a pixel-perfect spec; recreate it in the project's TS/React conventions. Do not redesign — match it.

## Files in this folder
- `profile-handoff.md` — this spec
- `profile-07-profil.html` — raw screen HTML (loader for the component below)
- `kamizo-profile.jsx` — the `ProfileScreen` component, top-to-bottom
- `tokens-profile.css` — full token sheet (`--brand-*`, `--app-bg`, `--surface*`, `--radius-*`, `--shadow-*`, semantic statuses)

## Visual structure (in render order)

### 1. Page container
`<div className="kz-screen">` with `minHeight: 100%`, `background: var(--app-bg)`, `paddingBottom: 124` (clearance for the floating BottomBar).

### 2. Hero — premium dark card
- Outer wrapper: `padding: 52px 16px 0` (top accounts for status bar / safe area).
- Inner card: `borderRadius: var(--radius-xl)` (28px), `padding: 20`, `color: var(--text-on-dark)`, background `linear-gradient(160deg, #4A3B30 0%, #2A2018 100%)`.
- Orange glow overlay (`position: absolute; inset: 0`) at 40% opacity: `radial-gradient(90% 80% at 90% 0%, rgba(251,146,60,0.45), transparent 55%)`.
- Row of avatar + name + edit button:
  - **Avatar** 66×66 circle, brand gradient `linear-gradient(135deg, #FB923C, #EA580C)`, white initials (font-weight 800, size 23), shadow `0 6px 16px rgba(249,115,22,0.4)`.
  - **Name** 20px / 800 / letter-spacing -0.02em.
  - **Subtitle** 12.5px / `rgba(244,240,232,0.6)` / "Собственник · с октября 2023" (role + start month).
  - **Verified pill** inline-flex with check icon + uppercase "Верифицирован" / bg `rgba(34,197,94,0.18)` / color `#86EFAC` / fontSize 10.5 / fontWeight 800 / letter-spacing 0.04em.
  - **Edit button** 36×36 circle, glass: bg `rgba(244,240,232,0.12)`, border `1px solid rgba(244,240,232,0.14)`.
- **Stats strip** below, marginTop 18, three equal-width cells with `borderRight: 1px solid rgba(244,240,232,0.12)` between (not after last). Each cell: 19px / 800 / tabular-nums value + 10.5px / muted label. Three stats: заявок, рейтинг, баллов.

### 3. Quick tiles — 2-col grid
`padding: 16px 16px 0`, `gridTemplateColumns: 1fr 1fr`, `gap: 10`.
Each tile: white surface, `border: 1px solid var(--border-c)`, `borderRadius: var(--radius-lg)` (20px), `box-shadow: var(--shadow-sm)`, padding 13px, flex row gap 11.
Icon box 40×40 `borderRadius: 12`, label 13.5/700, sub 11.5/`var(--text-secondary)`.
Per-tile colours (icon fg + box bg):
1. **Договор** · `#EA580C` / `var(--brand-tint)` · sub `№ 2024-1842`.
2. **QR пропуск** · `#15A06E` / `var(--status-active-bg)` · sub `Активен`.
3. **Оплата** · `#2F77C2` / `var(--status-info-bg)` · sub `312 400 сум`.
4. **Бонусы** · `#7C3AED` / `rgba(124,58,237,0.12)` · sub `1 240 баллов`.

### 4. Settings sections
`padding: 20px 16px 16px`, vertical stack `gap: 18`.

Each section:
- Section title above the card: 11px / 800 / uppercase / letter-spacing 0.06em / `var(--text-secondary)` / `padding: 0 4px` / `marginBottom 8`.
- Section card: white, `borderRadius: var(--radius-lg)` (20px), `border: 1px solid var(--border-c)`, `box-shadow: var(--shadow-sm)`, `overflow: hidden`.
- Each row: flex row gap 12, padding `13px 14px`, separator `1px solid var(--hairline)` between rows (not after last).
- Icon box 34×34, `borderRadius: 10`. Default fg `var(--text-secondary)` bg `var(--surface-sunken)`. Accent rows: fg `var(--brand-dark)` bg `var(--brand-tint)`.
- Label 14 / 650 / `var(--text-primary)` (accent rows: `var(--brand-dark)`). Optional value 12 / `var(--text-secondary)` (1px below).
- Trailing affordance: `<IChevronR>` (chevron), or `<IEdit>` (pencil), or a badge pill (10.5 / 700 / `var(--status-active)` / `var(--status-active-bg)`).

Sections + items:
1. **Дом и квартира**
   - Адрес — value, chevron.
   - Квартира — `Кв. 45 · 67 м² · 2 комн.`, chevron.
   - Состав семьи — `4 человека`, chevron.
2. **Безопасность**
   - Телефон — masked value, pencil (editable).
   - Сменить пароль — chevron.
   - Двухфакторная защита — `Включена` badge.
3. **Приложение**
   - Язык — `Русский`, chevron.
   - Уведомления — `Все`, chevron.
   - Установить как приложение — **accent** row, chevron.

### 5. Logout button
Full-width, white, `border: 1px solid var(--border-c)`, `borderRadius: var(--radius-md)` (14px), padding 14, centered text/icon, color `var(--status-critical)`, fontSize 14, fontWeight 700, `box-shadow: var(--shadow-sm)`.

### 6. Version label
Centered, 11px / `var(--text-muted)`, `marginTop 2`. Text: `Kamizo · версия 2.4.1`.

## Shell + BottomBar
- Page MUST use the existing shared `Layout` and the global floating pill `BottomBar` — no per-page bar.
- `Layout` already hides `MobileHeader` on `/profile` (the page owns the hero/status-bar zone) and renders `<BottomBar />` once at the root.
- Bottom padding 124 leaves room for the bar; nothing else changes in the shell.
- BottomBar already exposes a `profile` tab keyed on `path: '/profile'` — its active state lights up automatically when on this route.

## Data wiring (what to keep functional)
- **Avatar/name** — `formatName(user.name)`; initials from the first letters of the first two name tokens.
- **Subtitle** — role label + `с {LL} {YYYY}` parsed from `user.createdAt` (RU/UZ locale-aware).
- **"Верифицирован" pill** — show when `user.contractSignedAt` is set; otherwise hide.
- **Edit button** — opens the phone-edit inline state on the Телефон row (no separate screen).
- **Stats** — `заявок` = count of `requestStore.getRequestsByResident(user.id)`. `рейтинг` and `баллов` have no schema yet; render as visual placeholders (`—`).
- **Tiles** — Договор → `/contract`. QR пропуск → opens QR sheet (existing `generateQRCode`). Оплата → `/finance/charges`. Бонусы → no-op (placeholder).
- **Адрес** — `user.address`.
- **Квартира** — `Кв. {apartment} · {totalArea} м²` (drop `комн.` until a `rooms` field exists).
- **Состав семьи** — placeholder `—` until a `household` field exists.
- **Телефон** — `formatPhone(user.phone)`; tap pencil → inline edit → `updateProfile({ phone })`.
- **Сменить пароль** — opens existing password-change flow (`changePassword(current, new)`), reuses validation rules from the previous page (min 4 chars, must differ from current).
- **2FA "Включена"** — visual placeholder badge (no backend yet).
- **Язык** — toggles `languageStore.setLanguage('ru' ↔ 'uz')`.
- **Уведомления** — placeholder value `Все`; tap = no-op for now.
- **Установить как приложение** — opens existing `<InstallAppSection />` in a modal sheet.
- **Logout** — confirm → `authStore.logout()` → `navigate('/login')`.
- **Version label** — show real build version from `import.meta.env.VITE_APP_VERSION` if defined; otherwise the static design value.

## Out of scope
- Other roles (`StaffProfilePage`, `EmployeeProfile`) — untouched.
- Home, Vehicles, Chat, admin pages — untouched.
- BottomBar component itself — untouched (already correct).
