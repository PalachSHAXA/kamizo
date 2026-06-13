// Kamizo PWA Service Worker
// Version: 3.7.36 — cache suffix bumped to v90 to evict every v89 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Switch component restyled to match the reference design exactly:
//     solid BLACK pill track in BOTH states, white knob, state
//     expressed by knob position only (left=off, right=on). The
//     previous Kamizo-orange ON fill is gone — brand orange now only
//     paints the keyboard focus ring (a11y). Track lifts to a near-
//     black charcoal under html.dark so the silhouette still reads on
//     the warm-dark page bg. Tokens: --switch-track (light #0B0A09,
//     dark #1F1B17), --switch-knob (#FFFFFF), --switch-knob-shadow.
//     No behaviour change; the v89 Switch swap-in sites (ResidentProfile
//     ThemeToggle, admin/SettingsPage modules + notification channels,
//     AdminDashboard platform-ads, trainings/AdminPanel anonymous
//     flags) all pick up the new look automatically.
//
// Previous notes (v89) preserved below:
// Version: 3.7.35 — cache suffix bumped to v89 to evict every v88 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Unified Switch component (src/components/ui/Switch.tsx) replaces
//     every on/off control across resident, manager, and staff sides.
//     Pill track, white knob, brand-orange when on, neutral gray when
//     off, smooth slide. Tokens-only — --switch-on-bg falls back to
//     --brand so it tracks the Kamizo orange unification, --switch-off-bg
//     and --switch-knob-shadow have light + dark values in index.css so
//     the pill is legible on both white surfaces and dark surfaces.
//     accessible (role=switch, aria-checked, Space/Enter, focus-visible
//     ring). The previous ResidentProfilePage ThemeToggle was visually
//     broken — OFF track was rgba(28,25,23,0.16) (~16% opacity warm
//     dark) and disappeared on the dark page bg, making the knob look
//     oversized and unmoored; the refactored ThemeToggle now delegates
//     to Switch. Migrated sites: ThemeToggle (ResidentProfilePage,
//     StaffProfilePage, admin/SettingsPage), admin/SettingsPage module
//     on/off (was lucide ToggleLeft/ToggleRight icons), admin/Settings
//     Page notification channels Push/SMS/Email/Telegram (were styled
//     checkboxes), AdminDashboard platform-ad show-to-residents toggle
//     (was lucide icons), trainings/AdminPanel anonymous flags +
//     notifyAllOnNewProposal (4 styled checkboxes). Multi-select grids,
//     filter chips, agree-to-terms checkboxes, event-subscription
//     checkboxes left as checkboxes per spec.
//
// Previous notes (v88) preserved below:
// Version: 3.7.34 — cache suffix bumped to v88 to evict every v87 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Brand unification: every chrome / UI element now resolves to the
//     KAMIZO orange palette regardless of which tenant the user is on.
//     Previously App.tsx ran a useEffect that called
//     root.style.setProperty('--brand', tenant.color) plus every
//     --brand-{50..900} shade — so any `bg-primary-500`, `text-primary-600`,
//     `var(--brand)` consumer across the app painted in the tenant's
//     color. That single bridge is removed; the static Kamizo orange
//     palette in :root (with html.dark overrides) is now the only
//     source. LoginPage stops piping brandColor / brandColor2 into the
//     language switcher, terms checkbox, offer-modal accept button,
//     submit button gradient, tenant-chip placeholder, slug label,
//     demo-account chips, and the two decorative blur blobs — they all
//     now use bg-primary-*. DashboardTab tenant-list placeholder
//     gradient also unified. Tenant identity is carried by logo
//     (uploaded img) + name + content; tenant.color / color_secondary
//     stay in the API response, in the DB column (tenants.color), and
//     in the super-admin TenantFormModal edit form for future
//     reuse — they just don't paint chrome anymore. Light + dark both
//     unaffected by this change for non-overridden tokens.
//
// Previous notes (v87) preserved below:
// Version: 3.7.33 — cache suffix bumped to v87 to evict every v86 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Dark-mode follow-up #2: chat surfaces (resident chat header,
//     active-request chip, composer strip, quick-reply chips, attach +
//     camera + send buttons, incoming message bubbles, date separator
//     pills, timestamps, manager chat gradient page bg) now flip to the
//     warm dark palette under html.dark. Root cause was inline
//     style={{ background: '#FFFFFF', color: '#1C1917', … }} hex
//     literals in ResidentChatView / MessageBubble / ChatComposer /
//     ChatView — neither the CSS-var token system nor the Tailwind
//     safety-net could reach them. Fix: every chat hex now reads
//     through `var(--chat-…, <existing-light-hex>)`, with light values
//     in :root and dark overrides in html.dark. Outgoing orange-gradient
//     bubble + white-on-orange text stay verbatim. Tailwind safety-net
//     extended with chat-relevant utilities (bg-orange-50/100,
//     border-orange-100, text-orange-300/500, bg-black/[0.04],
//     border-black/[0.03], text-gray-400/300, focus:bg-white,
//     ring-orange-200, text-white/85). Light mode is byte-identical
//     for any user who hasn't opted in (every var falls back to the
//     prior hex). Image rendering path from v81 is unchanged.
//
// Previous notes (v86) preserved below:
// Version: 3.7.32 — cache suffix bumped to v86 to evict every v85 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Dark-mode follow-up: MobileHeader (top tenant chip + menu + bell
//     row, visible on every authenticated screen) now flips to the warm
//     dark surface under `html.dark`. The v85 verification pass caught
//     a beige strip floating above every dark page because
//     `.mobile-header` painted `rgba(244,240,232,0.92)` directly without
//     going through --app-bg. One CSS rule added; everything else from
//     the v85 sweep stays as-is. No JS changes, no schema changes.
//
// Previous notes (v85) preserved below:
// Version: 3.7.31 — cache suffix bumped to v85 to evict every v84 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Full dark mode. The test-account `.rpp-dark` pilot is gone;
//     `html.dark` is now the global theme signal, set/unset by
//     ThemeProvider based on a localStorage-persisted user choice
//     (`kamizo:theme`). A pre-paint inline script in index.html applies
//     the saved theme BEFORE React mounts so opted-in users never see a
//     light flash. Toggle lives on the resident profile (Приложение
//     section) and on the manager Settings page (Оформление section).
//     index.css's `html.dark` block re-points the same `--rpp-*`,
//     `--bb-*`, `--app-bg`, `--surface*`, `--text-*` and status-bg
//     tokens the pilot used, plus a Tailwind safety-net so unconverted
//     screens (bg-white / bg-gray-{50..900} / text-gray-{300..900} /
//     shadows / modal backdrops / inputs) still render USABLE on dark.
//     Brand orange / orange FAB stay verbatim. Capacitor / PWA status
//     bar follows via the live-updated theme-color meta. Light mode is
//     pixel-identical to before for any user who hasn't opted in.
//
// Previous notes (v84) preserved below:
// Version: 3.7.30 — cache suffix bumped to v84 to evict every v83 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Dark-profile PILOT extension: the floating BottomBar flips to
//     the dark palette while the resident profile is mounted for a
//     test account, and back to light the moment the user navigates
//     away. The `.rpp-dark` class is now applied to <html> by the
//     ResidentProfilePage useEffect (BottomBar createPortal-s itself
//     directly into document.body — outside the React tree — so a
//     class on the page wrapper would never reach it). BottomBar's
//     pill background / border / shadow / inactive icon colour /
//     unread badge ring all read through `var(--bb-…, <light-fallback>)`,
//     gated by the SAME class — no duplicate test-account check in
//     the bar component. Brand orange + orange FAB stay verbatim.
//
// Previous notes (v83) preserved below:
// Version: 3.7.29 — cache suffix bumped to v83 to evict every v82 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Dark-theme PILOT for the resident PROFILE screen, gated to
//     test accounts only (login starts with "test-"). Visual eval
//     before deciding on a full dark mode. Implemented as CSS
//     custom-property overrides on a single `.rpp-dark` className,
//     with `var(--rpp-…, <light-fallback>)` on every page token —
//     real users see zero change because the fallback wins. Brand
//     orange stays as-is. Status-bar `theme-color` meta is flipped
//     to the dark bg while on this page and restored on unmount.
//     Removing the experiment = drop the inline <style> block + one
//     className + the var() fallback wrappers. No other surfaces
//     touched (chat, home, payments are unchanged for test users).
//
// Previous notes (v82) preserved below:
// Version: 3.7.28 — cache suffix bumped to v82 to evict every v81 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Resident profile: new row "Лицевой счёт" / "Hisob raqami"
//     inside the «Дом и квартира» card, between Квартира and Состав
//     семьи. Read-only on the resident side (set by УК management
//     via PATCH /api/users/:id/personal-account); tap-to-copy with a
//     "Скопировано" / "Nusxalandi" toast when populated, "—" when
//     not. Migration 049 adds a nullable users.personal_account
//     column — the existing personal_accounts table was empty for
//     every real resident so the simpler per-user column avoids
//     a four-way JOIN through apartments for the read path.
//
// Previous notes (v81) preserved below:
// Version: 3.7.27 — cache suffix bumped to v81 to evict every v80 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Resident chat: photos sent by manager / director now render as
//     <img> instead of leaking the raw "![file](data:image/...;base64,
//     iVBOR...)" markdown into the bubble. ResidentChatView used a
//     strict whole-string regex that didn't match the manager's
//     "${text}\n\n![…]" composition; switched to the shared
//     <MessageContent /> already used by MessageBubble (handles mixed
//     text + image + attachment with the same data:image allowlist
//     and lightbox).
//   • Channel list previews collapse photo markdown to "📷 Фото" /
//     "📷 Rasm" instead of showing base64 in the last-message slot.
//
// Previous notes (v80) preserved below:
// Version: 3.7.26 — cache suffix bumped to v80 to evict every v79 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Meeting create wizard: "Опубликовать" no longer silently does
//     nothing when the director picks "Весь комплекс" or the tenant
//     has zero buildings. Wizard sends empty building_id as an
//     explicit whole-tenant intent; backend accepts it and fans the
//     meeting + bell notifications out to every active resident of
//     the УК (including unlinked ones). On any failure MeetingsPage
//     shows a Russian toast — no more silent no-op clicks.
//
// Previous notes (v79) preserved below:
// Version: 3.7.25 — cache suffix bumped to v79 to evict every v78 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • ResidentChatView attach: snapshot picked File objects into a
//     plain File[] BEFORE resetting input.value, so the live FileList
//     reference doesn't drop to length 0 before the async send loop
//     starts iterating. Symptom: tapping the paperclip / camera on
//     the resident chat picked the file but nothing was attached —
//     no preview, no upload, no error. Manager flow unaffected
//     (already used the safe `.files?.[0]` extract pattern).
//
// Previous notes (v78) preserved below:
// Version: 3.7.24 — cache suffix bumped to v78 to evict every v77 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Resident home hero: real УК logo (data-URL from tenants.logo)
//     now renders instead of a hardcoded "K" letter chip — every tenant
//     sees their own branding above the greeting. Falls back to a chip
//     with the first letter of the УК name when no logo is uploaded
//     (not the Kamizo brandmark, to avoid impersonation).
//   • Resident home hero: the pin+address chip is hidden when the
//     resident's row has no address/apartment (was rendering a floating
//     orphan pin icon with empty text for stub accounts and any
//     resident imported without an apartments row).
//
// Previous notes (v77) preserved below:
// Version: 3.7.23 — cache suffix bumped to v77 to evict every v76 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Unified tenant-agnostic native app: tenantStore.fetchConfig now
//     hits the hardcoded API_URL (https://api.kamizo.uz) instead of
//     window.location.origin (which resolved to https://localhost in
//     Capacitor and 404'd), AND sends Authorization: Bearer <jwt> so
//     the backend's JWT-fallback can pick the user's REAL tenant when
//     the Origin header is the WebView shell. authStore.login() now
//     re-fires fetchConfig() after a successful login so the in-memory
//     config reflects the actual workspace (not the pre-login null).
//     11 ad-hoc raw fetches across pages/hooks now route through
//     API_URL too — no more bundled-host derivations.
//
// Previous notes (v76) preserved below:
// Version: 3.7.22 — cache suffix bumped to v76 to evict every v75 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • LoginPage inputs now carry autoCapitalize="none", autoCorrect=
//     "off", and spellCheck={false} on BOTH the login and password
//     fields. The deployed disambiguation backend is case-sensitive
//     end-to-end (curl confirmed: capital "D" or "K" → 401, lowercase
//     → 200), so a phone user typing "demo-resident2" would have the
//     Android/iOS keyboard silently upper-case it to "Demo-resident2"
//     and see only "Неверный логин или пароль" with no clue why. Fix
//     applies to the same WebView engine that backs the native
//     Capacitor Android + iOS apps, so the PWA AND the native shells
//     both stop failing for real mobile users on the first attempt.
//
// Previous notes (v75) preserved below:
// Version: 3.7.21 — cache suffix bumped to v75 to evict every v74 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Tenant-picker step in the login flow. When a resident's login
//     is registered in 2+ tenants AND the password verifies against
//     2+ of them, the backend now returns { needs_tenant_pick: true,
//     tenants: [{ slug, name, logo }] } instead of a JWT. The login
//     page now mounts a full-viewport workspace picker overlay, the
//     user taps a workspace, the page re-submits login with the
//     chosen tenantSlug, and the existing scoped path issues the
//     JWT. Wires up the disambiguation backend deployed earlier
//     today; specifically unblocks the unified mobile app (which has
//     no subdomain to resolve from).
//   • Password lives only in the LoginPage's local useState — never
//     logged, never persisted. Survives a picker cancel so the user
//     can edit and retry without retyping.
//
// Previous notes (v74) preserved below:
// Version: 3.7.20 — cache suffix bumped to v74 to evict every v73 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Resident /contract route now hides the floating BottomBar for
//     the lifetime of the page. Uses the existing modalStore-presence
//     registry (useModalPresence) — same mechanism every bottom sheet
//     and full-screen modal already uses; BottomBar.tsx reads
//     useModalStore().count and returns null while > 0. No change to
//     BottomBar itself; bar reappears on route leave.
//   • Скачать PDF button is now an in-flow element at the end of the
//     scrollable content (after the requisites grid), not a
//     position:fixed sticky bar. With BottomBar hidden, the lifted-
//     bar workaround (bottom: calc(safe-area) + 76 px; zIndex 1001;
//     backdrop blur) is gone. The button scrolls with the content,
//     full-width, same handoff styling, same text-PDF handler.
//   • Page-root paddingBottom retuned 180 → 32 px (+ safe-area) since
//     there's no fixed bar to reserve for anymore.
//
// Previous notes (v73) preserved below:
// Version: 3.7.19 — cache suffix bumped to v73 to evict every v72 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Resident contract sticky action bar is now a single full-width
//     Скачать PDF button. The handoff (kamizo-contract.jsx line 74)
//     also specifies a second orange "Подписать" pill when !signed,
//     but the project has no self-serve signing backend yet — the
//     button could only show an info-toast directing the resident to
//     contact the УК offline, which is worse UX than a clean single
//     CTA. The pill is omitted with a documented restoration path so
//     it can return verbatim when the legal flow lands.
//
// Previous notes (v72) preserved below:
// Version: 3.7.18 — cache suffix bumped to v72 to evict every v71 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Resident contract Скачать PDF button now produces a REAL text
//     PDF (selectable text, crisp at any zoom, clean page breaks),
//     not the previous image-based PDF. Generated client-side by
//     jsPDF's text API from the canonical contract data
//     (utils/contractContent.ts), with Roboto Regular + Medium
//     embedded for full Cyrillic glyph coverage. Page-break safety:
//     every block is measured before drawing, section headings carry
//     a widow guard, and the requisites/signature block stays as a
//     single unit. Both fonts and jsPDF are lazy-loaded only when
//     the user actually taps Скачать PDF — zero impact on initial
//     bundle (main index.js unchanged at 438.91 kB).
//
// Previous notes (v71) preserved below:
// Version: 3.7.17 — cache suffix bumped to v71 to evict every v70 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Contract page (resident) action bar visibility fix: Скачать
//     договор / Подписать buttons were in the DOM but invisible because
//     the page's own sticky bar (position:fixed; bottom:0; zIndex:20)
//     sat directly under the global BottomBar pill (zIndex:1000). The
//     action bar is now lifted to bottom: env(safe-area-inset-bottom)
//     + 76 px with zIndex:1001, leaving the BottomBar pill below it
//     with a clean visual gap. Scroll container's paddingBottom bumped
//     120 → 180 px so the final Собственник requisite card clears both.
//
// Previous notes (v70) preserved below:
// Version: 3.7.16 — cache suffix bumped to v70 to evict every v69 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • LoginPage scroll fix: /login is rendered outside <Layout>, so it
//     inherited the resident shell's body/#root height:100dvh;
//     overflow:hidden lock and clipped its tall content (welcome +
//     form + offer + the demo-login grid) at both ends with no way to
//     scroll. The outer div is now its own scroll region
//     (height:100dvh + overflow-y:auto) with safe-area-inset padding
//     and a `m-auto`-on-flex-child centering pattern so the card
//     centers when it fits and scrolls when it doesn't.
//
// Previous notes (v69) preserved below:
// Version: 3.7.15 — cache suffix bumped to v69 to evict every v68 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Home swipe cards: card height bumped 210 → 250 + internal
//     rhythm tightened (smaller avatar/title/CTA, padding 22 → 20) so
//     the densest carousel card (registration) no longer clips its
//     "Заполнить →" CTA below `overflow:hidden`. Every card now has
//     ~25 px breathing room under the CTA. Carousel dots strip stays
//     in place (sibling div + marginTop:6).
//   • Drawer panel: rounded right edge corners
//     (borderTopRightRadius / borderBottomRightRadius: 24). Left edge
//     stays flush with the viewport. The brown header's
//     borderBottomLeft/RightRadius from v68 is preserved; the panel's
//     overflow:hidden clips the brown header's top-right corner
//     against the rounded panel edge so it reads as one coherent
//     floating card.
//
// Previous notes (v68) preserved below:
// Version: 3.7.14 — cache suffix bumped to v68 to evict every v67 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Resident home hero: multi-word УК names ("Kamizo Demo", "Sky
//     Park Tashkent") stay on a single line (whiteSpace:nowrap on the
//     absolute-centered wordmark wrapper + label; K-chip pinned
//     flex:0 0 auto).
//   • Resident home swipe cards: "Заполнить →" / "Проголосовать →" /
//     etc. CTA pills sit directly under the sub line with a 16-px
//     rhythm. Card flex column switched from space-between to
//     flex-start + CTA marginTop:16 — fixes the "detached at bottom
//     edge" look across all five carousel cards.
//   • Resident drawer: brown stone header (K logo, УК name, building,
//     stats, X) now has rounded bottom corners (22 px) so it reads as
//     a floating card on the warm beige drawer surface. Top corners
//     stay square (header flush with safe-area). Inner tiles + ЕЩЁ
//     list + bottom profile/logout card unchanged.
//
// Previous notes (v67) preserved below:
// Version: 3.7.13 — cache suffix bumped to v67 to evict every v66 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Smooth opacity-only page transitions on every route change
//     (BottomBar taps, sidebar nav, any pathname change). ~220ms
//     ease-out fade via the existing .page-transition class wired to a
//     Suspense-internal wrapper keyed by location.pathname. No
//     transform / filter / perspective is applied, so routed pages'
//     internal position:fixed elements (sticky action bars, modals)
//     stay anchored to the viewport throughout the fade. The fixed
//     MobileHeader and portaled BottomBar are siblings/portals — not
//     animated. Honors prefers-reduced-motion.
//
// Previous notes (v66) preserved below:
// Version: 3.7.12 — cache suffix bumped to v66 to evict every v65 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Resident "Оплата" page (09-oplata) full Claude Design port at
//     /finance/charges (resident roles only — staff keep the existing
//     filter page). Sticky header (Кв./ЖК + Оплата), dark balance card
//     with state-aware gradient (clear/due/overdue), charges accordion
//     wired to real financeApi.getCharges, inline payments history
//     via financeApi.getPayments (both auto-filtered by user.id on the
//     server). Empty state, skeleton, error fallback.
//   • LOCKED actions (no backend yet; tap shows info toast — no fake
//     success): "Оплатить {N} сум" (no online gateway) and "Акт сверки"
//     (server returns JSON only, no PDF renderer).
//   • Sections omitted because no resident endpoint exists yet: per-
//     charge sub-item breakdown and "Куда идут средства дома" expense
//     pie.
//   • Layout: /finance/charges added to isResidentFullBleed only for
//     resident-family roles so the page paints its own 16-px sides and
//     hides the global MobileHeader. Staff still see the original
//     chrome.
//
// Previous notes (v65) preserved below:
// Version: 3.7.11 — cache suffix bumped to v65 to evict every v64 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Sidebar: drop the hardcoded "ТСЖ «...»" prefix; use the real УК
//     name from /api/tenant/config; render the УК logo (when present)
//     as the avatar chip; resolve the resident's ЖК name + address
//     from useBuildingStore (lazy-loaded fetchBuildingById) instead of
//     the bare user.building number.
//   • Profile: new "Управляющая компания" card under the action tiles
//     showing real УК logo + name, with a "Жилой комплекс" sub-row
//     bound to the real building name + address. Tap navigates to
//     /contract.
//   • No new endpoints; existing tenantStore + buildingStore reads only.
//     Backend gaps documented in commit message (legal-form prefix,
//     УК physical address, resident-readable УК rating).
//
// Previous notes (v64) preserved below:
// Version: 3.7.10 — cache suffix bumped to v64 to evict every v63 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Resident /contract page (14-dogovor) full Claude Design port:
//     sticky in-page header (back + "Договор"), dark amber-stone hero
//     with Действует/На подписании badge + Номер/Дата stats, "Условия"
//     accordion (4 condensed RU/UZ sections), two-column "Реквизиты
//     сторон" (UK + Собственник cards). Sticky bottom action bar:
//     "Скачать договор" wires to existing generateContractDocx; the
//     "Подписать" CTA is shipped visually but locked (no self-serve
//     signing endpoint yet — tap shows an info toast).
//   • Layout: /contract added to isResidentFullBleed (page paints its
//     own 16-px sides, global MobileHeader hidden on this route).
//
// Previous notes (v63) preserved below:
// Version: 3.7.9 — cache suffix bumped to v63 to evict every v62 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Resident request-details bottom sheet (02d-detali-zayavki) full
//     Claude Design port: dim backdrop + 2-px blur, warm-beige sheet,
//     orange-gradient status card (56-px category chip + #UK-S-{N} +
//     centred status title + 4-step icon progress with brand-orange
//     halo + connector fill + submitted timestamp), contextual action
//     button (Принять работу / Отменить заявку). Details card with
//     description Ещё/Свернуть toggle, priority pill, scrollable photo
//     thumbs (open in new tab), rating + feedback for completed,
//     executor row with tel: phone button. Active-reschedule banner +
//     amber "Перенести на другое время" button preserved.
//   • Modal-presence: BottomBar hides while sheet is open (existing
//     useModalPresence kept).
//   • Wiring unchanged: onApprove / onCancel / onReschedule still emit
//     to the parent which opens existing ApproveModal /
//     CancelRequestModal / RescheduleModal.
//
// Previous notes (v62) preserved below:
// Version: 3.7.8 — cache suffix bumped to v62 to evict every v61 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Resident "Собрания" list (05-sobraniya) full Claude Design port:
//     sticky in-page header (Собрания собственников eyebrow +
//     Голосование title), legal-weight note (m² → ≥X% quorum), meeting
//     cards with status pill (Идёт / Опрос даты / Предстоит /
//     Завершено), QuorumBar with 50% threshold marker for active
//     meetings and 3-cell За/Против/Возд. result grid for closed
//     family, CTA footer with solid brand pill for voting_open
//     ("Голосовать"/"Изменить голос") and text-link for others
//     ("Протокол"/"Подробнее"). Empty state restyled.
//   • Reconsideration banner + new-request popup + 30 s polling
//     preserved (audio notification kept).
//   • Layout: /meetings added to isResidentFullBleed (page paints its
//     own 16-px sides, global MobileHeader hidden on this route).
//   • Card tap opens the existing MeetingVotingModal (§03) — unchanged.
//
// Previous notes (v61) preserved below:
// Version: 3.7.7 — cache suffix bumped to v61 to evict every v60 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Resident per-meeting voting flow (03-golosovanie) full Claude
//     Design port: sticky topbar, dark amber-stone hero with
//     Кворум/Осталось/Бюджет stats + quorum bar, agenda cards with
//     live За/Против/Воздерж buttons + result bar, objection +
//     counter-proposal reveal on Against (≥ 20 chars), optional
//     comment on For/Abstain, sticky bottom summary card with
//     "Подписать и отправить все голоса", post-vote ballot receipt,
//     and "Как считают голоса" bottom sheet. OTP card from the
//     prototype is intentionally NOT shipped — chat1 retracted it;
//     verification stays on the existing QRSignatureModal.
//   • Modal-presence: voting overlay now registers with
//     useModalPresence(true) so the global BottomBar hides while it's
//     open and is restored on close.
//
// Previous notes (v60) preserved below:
// Version: 3.7.6 — cache suffix bumped to v60 to evict every v59 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Resident "Объявления" (06-obyavleniya) full Claude Design port:
//     sticky in-page header (building eyebrow + Объявления title +
//     ink/surface filter chips), feed of cards with brand-tint unread
//     bg + 8px brand-orange dot, urgent variant (4px red stripe + cover
//     + Важно badge), priority-mapped category pill, line-clamp
//     preview that expands in-card with attachments + Читать/Свернуть
//     chevron toggle. Wiring kept (fetchAnnouncements,
//     getAnnouncementsForResidents, markAnnouncementAsViewed).
//   • Layout: /announcements added to isResidentFullBleed (page paints
//     its own 16-px sides, global MobileHeader hidden on this route).
//
// Previous notes (v59) preserved below:
// Version: 3.7.5 — cache suffix bumped to v59 to evict every v58 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • BottomBar active-tab fix: on secondary resident pages opened
//     from the sidebar (/useful-contacts, /rate-employees, /meetings,
//     /announcements, /guest-access, /vehicles, /contract, /finance/*,
//     /marketplace, …) the "Главная" tab now lights up via a fallback
//     in BottomBar.isActive. Strict matches still win first
//     (Заявки/Чат/Профиль keep their own active state on their owned
//     routes, including sub-routes via prefix match), so two tabs are
//     never active at once.
//
// Caching strategy unchanged:
//   • HTML / navigation requests   → network-first, cache on success
//     for offline fallback.
//   • /assets/<hash>.(js|css|woff) → cache-first, MIME-validated on
//     read AND write.
//   • images / fonts / icons       → stale-while-revalidate.
//   • /api/*  /events*  /ws*       → passthrough, never cached.
//   • activate                     → delete every cache not in the
//     current valid-list, then clients.claim().
// Combined with skipWaiting() on install + clients.claim() + the
// controllerchange auto-reload + chunk-load guard (v55) in index.html,
// every device transitions seamlessly to the new version.

const SW_VERSION = '3.7.15';
const STATIC_CACHE = 'kamizo-static-v90';
const ASSET_CACHE = 'kamizo-assets-v90';
const DYNAMIC_CACHE = 'kamizo-dynamic-v90';
const MAX_DYNAMIC_CACHE_SIZE = 50;

// Static shell to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html',
];

// Install event - cache static shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean old caches, claim clients
self.addEventListener('activate', (event) => {
  const validCaches = [STATIC_CACHE, ASSET_CACHE, DYNAMIC_CACHE];
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => !validCaches.includes(key))
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
      .then(() => {
        // Notify all clients about the update
        self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            client.postMessage({ type: 'SW_UPDATED', version: SW_VERSION });
          });
        });
      })
  );
});

// Trim cache to max size
async function trimCache(cacheName, maxSize) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxSize) {
    // Delete oldest entries (FIFO)
    const toDelete = keys.slice(0, keys.length - maxSize);
    await Promise.all(toDelete.map((key) => cache.delete(key)));
  }
}

// Fetch event - smart caching strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Skip API requests, WebSocket, SSE
  if (url.pathname.startsWith('/api/') || url.pathname.includes('/events') || url.pathname.includes('/ws')) return;

  // Strategy 1: Cache-first for hashed assets (JS, CSS with hash in filename)
  // These are immutable — once cached, always serve from cache.
  //
  // Hard rule: never trust a cached response whose Content-Type doesn't
  // match the URL extension. A prior broken deploy could have cached
  // text/html under a .js / .css URL (the worker's old SPA fallback did
  // exactly this). Such a cached entry permanently breaks the page —
  // browsers refuse to apply text/html as CSS or execute it as a module.
  // Detect on read, evict, and refetch from the network. Same gate on
  // write so we never poison the cache in the first place.
  if (url.pathname.startsWith('/assets/') && /\-[a-zA-Z0-9_-]{8,}\.(js|css|woff2?)$/.test(url.pathname)) {
    const expectsJs = /\.js$/.test(url.pathname);
    const expectsCss = /\.css$/.test(url.pathname);
    const expectsWoff = /\.woff2?$/.test(url.pathname);
    const mimeOk = (ct) => {
      const c = (ct || '').toLowerCase();
      if (c.includes('text/html')) return false;
      if (expectsJs)  return c.includes('javascript') || c.includes('ecmascript');
      if (expectsCss) return c.includes('css');
      if (expectsWoff) return c.includes('font') || c.includes('woff');
      return true;
    };

    event.respondWith((async () => {
      const cache = await caches.open(ASSET_CACHE);
      const cached = await cache.match(request);
      if (cached && mimeOk(cached.headers.get('Content-Type'))) {
        return cached;
      }
      if (cached) {
        // Poisoned entry — drop it and fall through to network.
        await cache.delete(request);
      }
      try {
        const response = await fetch(request);
        if (response.ok && mimeOk(response.headers.get('Content-Type'))) {
          cache.put(request, response.clone());
        }
        return response;
      } catch (err) {
        // Network failed and we have no usable cache — let the page see
        // the failure rather than handing back a stale/wrong response.
        return new Response('Asset fetch failed', {
          status: 503,
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        });
      }
    })());
    return;
  }

  // Strategy 2: Stale-while-revalidate for images, fonts, icons
  if (/\.(png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => {
              cache.put(request, clone);
              trimCache(DYNAMIC_CACHE, MAX_DYNAMIC_CACHE_SIZE);
            });
          }
          return response;
        }).catch(() => cached);

        return cached || fetchPromise;
      })
    );
    return;
  }

  // Strategy 3: Network-first for HTML (app shell) and everything else
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && (url.pathname === '/' || url.pathname.endsWith('.html'))) {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => {
        // Offline fallback
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          // For navigation requests, show offline page (better UX than blank screen)
          if (request.mode === 'navigate') {
            return caches.match('/offline.html') || caches.match('/index.html');
          }
          return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
        });
      })
  );
});

// Push notification received
self.addEventListener('push', (event) => {
  let notificationData = {
    title: 'Kamizo',
    body: 'Новое уведомление',
    icon: '/icons/favicon-192x192.png',
    badge: '/icons/favicon-192x192.png',
    tag: 'default',
    requireInteraction: false,
    data: { url: '/' }
  };

  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = { ...notificationData, ...data };
    } catch (e) {
      notificationData.body = event.data.text();
    }
  }

  const options = {
    body: notificationData.body,
    icon: notificationData.icon || '/icons/favicon-192x192.png',
    badge: notificationData.badge || '/icons/favicon-192x192.png',
    tag: notificationData.tag,
    requireInteraction: notificationData.requireInteraction,
    vibrate: [100, 50, 100, 50, 100],
    data: notificationData.data,
    actions: notificationData.actions || []
  };

  // Add default actions based on notification type
  if (notificationData.type === 'request_completed') {
    options.actions = [
      { action: 'approve', title: '✅ Подтвердить' },
      { action: 'view', title: '👁 Посмотреть' }
    ];
    options.requireInteraction = true;
  } else if (notificationData.type === 'request_assigned') {
    options.actions = [
      { action: 'accept', title: '✅ Принять' },
      { action: 'view', title: '👁 Детали' }
    ];
    options.requireInteraction = true;
  } else if (notificationData.type === 'announcement') {
    const isUrgent = notificationData.priority === 'urgent' || notificationData.data?.priority === 'urgent';
    options.actions = [
      { action: 'view', title: '📖 Читать' },
      { action: 'dismiss', title: '✓ Прочитано' }
    ];
    if (isUrgent) {
      options.requireInteraction = true;
      options.vibrate = [200, 100, 200, 100, 200];
    }
  } else if (notificationData.type === 'chat_message') {
    options.actions = [
      { action: 'reply', title: '💬 Ответить' }
    ];
  } else if (notificationData.type === 'meeting') {
    options.actions = [
      { action: 'vote', title: '🗳 Голосовать' },
      { action: 'view', title: '📋 Подробнее' }
    ];
    options.requireInteraction = true;
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title, options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const action = event.action;
  const data = notification.data || {};

  notification.close();

  let urlToOpen = data.url || '/';

  if (action === 'approve' && data.requestId) {
    urlToOpen = `/?action=approve&requestId=${data.requestId}`;
  } else if (action === 'accept' && data.requestId) {
    urlToOpen = `/?action=accept&requestId=${data.requestId}`;
  } else if (action === 'view' && data.requestId) {
    urlToOpen = `/?requestId=${data.requestId}`;
  } else if (action === 'view' && data.announcementId) {
    urlToOpen = `/announcements?id=${data.announcementId}`;
  } else if (action === 'dismiss') {
    urlToOpen = null;
  } else if (action === 'reply' && data.channelId) {
    urlToOpen = `/chat?channelId=${data.channelId}`;
  } else if (action === 'vote' && data.meetingId) {
    urlToOpen = `/meetings?meetingId=${data.meetingId}&action=vote`;
  }

  if (urlToOpen) {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((windowClients) => {
          for (const client of windowClients) {
            if ('focus' in client) {
              client.focus();
              client.navigate(urlToOpen);
              return;
            }
          }
          if (clients.openWindow) {
            return clients.openWindow(urlToOpen);
          }
        })
    );
  }
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-requests') {
    event.waitUntil(syncPendingRequests());
  } else if (event.tag === 'sync-messages') {
    event.waitUntil(syncPendingMessages());
  }
});

async function syncPendingRequests() {
  try {
    const db = await openIndexedDB();
    const pendingRequests = await db.getAll('pending_requests');
    for (const request of pendingRequests) {
      try {
        await fetch(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body
        });
        await db.delete('pending_requests', request.id);
      } catch (e) {
        // Will retry on next sync
      }
    }
  } catch (e) {
    // DB not available
  }
}

async function syncPendingMessages() {
  try {
    const db = await openIndexedDB();
    const pendingMessages = await db.getAll('pending_messages');
    for (const message of pendingMessages) {
      try {
        await fetch('/api/chat/channels/' + message.channelId + '/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${message.token}`
          },
          body: JSON.stringify({ content: message.content })
        });
        await db.delete('pending_messages', message.id);
      } catch (e) {
        // Will retry on next sync
      }
    }
  } catch (e) {
    // DB not available
  }
}

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('kamizo-offline', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      resolve({
        getAll: (store) => new Promise((res, rej) => {
          const tx = db.transaction(store, 'readonly');
          const req = tx.objectStore(store).getAll();
          req.onsuccess = () => res(req.result);
          req.onerror = () => rej(req.error);
        }),
        delete: (store, id) => new Promise((res, rej) => {
          const tx = db.transaction(store, 'readwrite');
          const req = tx.objectStore(store).delete(id);
          req.onsuccess = () => res();
          req.onerror = () => rej(req.error);
        })
      });
    };
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pending_requests')) {
        db.createObjectStore('pending_requests', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('pending_messages')) {
        db.createObjectStore('pending_messages', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

// Message handler
self.addEventListener('message', (event) => {
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: SW_VERSION });
  }
  if (event.data.type === 'CLEAR_CACHE') {
    caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
  }
});
