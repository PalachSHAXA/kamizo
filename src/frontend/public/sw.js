// Kamizo PWA Service Worker
// Version: 3.7.89 — cache suffix bumped to v143. ImageLightbox now renders via
//     a portal to <body> so the overlay covers the TRUE viewport (incl. the
//     sidebar + top banner) instead of being trapped inside a transformed
//     ancestor — the photo no longer sits flush against the sidebar.
//     Previous note (v142) preserved below:
// Version: 3.7.88 — cache suffix bumped to v142. ImageLightbox: cap the photo
//     size on desktop (md+ → max 72vw / 80vh) so it isn't huge; mobile stays
//     full-screen as before. Zoom still scales beyond the cap.
//     Previous note (v141) preserved below:
// Version: 3.7.87 — cache suffix bumped to v141. "Скачать протокол" fix:
//     two bugs. (1) the DOCX download fetched /protocol/data WITHOUT the JWT
//     → 401. Now sends Authorization. (2) the live meeting_agenda_comments
//     table was on the OLD schema (user_id/comment NOT NULL, no
//     resident_id/content) while the code expects resident_id/content, so
//     the protocol query 500'd ("no such column: c.content") and comments
//     could never be saved. Migration 053 rebuilds the table (0 rows, safe).
//     Previous note (v140) preserved below:
// Version: 3.7.86 — cache suffix bumped to v140. Per-tenant brand colour:
//     the colour a УК picks in the super-admin editor (tenants.color) was
//     stored but never painted — every tenant rendered Kamizo orange. Now
//     applyTenantBrand() writes the picked colour into the --brand* tokens
//     (incl. the full --brand-50..900 scale that tailwind's primary-* maps
//     to) on tenant-config load, so the site themes to the УК's colour.
//     Main / no-tenant domain stays orange.
//     Previous note (v139) preserved below:
// Version: 3.7.85 — cache suffix bumped to v139. ImageLightbox now supports
//     zoom + pan: mouse wheel / +- buttons / double-click to zoom, drag to
//     pan, two-finger pinch on touch, Esc/backdrop/X to close. Applies to
//     agenda photos in both the resident and staff meeting views.
//     Previous note (v138) preserved below:
// Version: 3.7.84 — cache suffix bumped to v138. Agenda photo VIEWER fix:
//     attached photos are data: URLs; clicking one opened it in a new tab,
//     blocked by Chromium (Chrome AND Edge) → about:blank#blocked. Now images
//     open in an in-app ImageLightbox in BOTH the resident voting view
//     (MeetingVotingModal) and the staff details view (MeetingDetailsModal:
//     manager/director/admin). Non-image files now download.
//     (Bumped to v138 over colleagues' v137 on merge.)
//     Previous note (v137) preserved below:
// Version: 3.7.83 — cache suffix bumped to v137. LoginPage hardening
//     surfaced during Sprint 86 simulator testing:
//       (a) Smart Punctuation defang on both login + password fields.
//           iOS rewrites typed ASCII hyphens to en/em dashes silently
//           (HTML autoCorrect="off" does NOT suppress this — it's a
//           separate Settings → Keyboard → Smart Punctuation toggle),
//           so e.g. a user typing test-director-choko on the sim could
//           ship test–director–choko (U+2013) in the request body,
//           hit the server's case-sensitive WHERE login = ? lookup
//           with zero matches, then see only the masked-generic
//           "Неверный логин или пароль" with no clue why. Normalizer
//           runs every keystroke through:
//             U+2013 / U+2014 / U+2212 → ASCII hyphen
//             U+00A0 (NBSP) → regular space
//       (b) Stop overriding the server's real error with the hardcoded
//           generic at LoginPage.tsx:113 + :134. authStore already maps
//           "Invalid credentials" / empty → the Russian generic; every
//           other server message (tenant resolution, rate limit,
//           5xx) now passes through, so future "why won't it log in"
//           debugging is self-evident from the UI alone.
//     Bumps SW to evict v136 caches on next lifecycle so the patched
//     LoginPage bundle is picked up.
//     Previous note (v136) preserved below:
// Version: 3.7.82 — cache suffix bumped to v136. Sprint 86 — native APNs
//     push-notification infrastructure (code-complete; no business
//     events fire push yet — that's the next sprint). New surface:
//       (a) device_tokens table (migration 052) — per-installation
//           UPSERT keyed by token, soft-deactivate on logout.
//       (b) cloudflare/src/services/apns-client.ts — provider-token
//           ES256 JWT (50-min cache) + HTTP/2 POST to APNs, both
//           production and sandbox endpoints. No new npm dep —
//           uses Node 18+ Web Crypto in the same pattern as
//           cloudflare/src/utils/crypto.ts.
//       (c) cloudflare/src/routes/devices.ts — POST /api/devices/
//           {register,unregister,test-push}. tenant_id always
//           pinned from JWT (cross-tenant register impossible).
//       (d) @capacitor/push-notifications@8.1.1 — installed, wired
//           into AppDelegate.swift, App.entitlements created (aps-
//           environment = development), Info.plist gains
//           UIBackgroundModes=[remote-notification].
//       (e) src/services/nativePush.ts — initialize() called from
//           authStore.login post-success; unregister() from logout
//           with JWT snapshot captured before localStorage wipe.
//           Native-only (Capacitor.isNativePlatform guard), PWA
//           build unaffected.
//     Bumps SW to evict v135 caches on next lifecycle so the new
//     pushNotifications.register() listener wiring is picked up.
//     Previous note (v135) preserved below:
// Version: 3.7.81 — cache suffix bumped to v135. Bug 7 from the pre-iOS
//     E2E audit: replace the default white Capacitor splash with a
//     Kamizo-branded one. Cream #F4F0E8 background (continuity with the
//     flattened app-icon background + index.css --app-bg) and the same
//     "K" mark used in the launcher icon, ~40% of the shortest screen
//     dimension, centered. iOS: Splash.imageset reflattened at 2732×2732,
//     LaunchScreen.storyboard backgroundColor pinned to cream so the
//     letterbox color matches if the WebView paints before the storyboard
//     fades. Android: 28 PNGs regenerated across every density/orientation/
//     theme bucket; @drawable/splash chain in styles.xml unchanged.
//     capacitor.config.ts SplashScreen plugin: launchAutoHide:false +
//     backgroundColor:#F4F0E8; main.tsx now calls SplashScreen.hide({
//     fadeOutDuration: 300 }) once React mounts. Single revertable commit.
//     Previous note (v134) preserved below:
// Version: 3.7.80 — cache suffix bumped to v134. Frontend change in this
//     bump: AddStaffModal role dropdown now lists Диспетчер and Охранник
//     alongside the existing Менеджер / Глава отдела / Исполнитель.
//     Reason: the pre-iOS E2E audit's Bug 6 finding was actually a
//     two-roles-missing dropdown, not a missing form. Backend
//     POST /api/auth/register already accepts dispatcher + security
//     from director / admin / manager callers and pins tenant_id from
//     the JWT (cloudflare/src/routes/users/auth.ts:353), so a director
//     can build their full team (Manager → Dispatcher → Executor →
//     Security) without ever needing to leave the UI for a curl call.
//     Single TypeScript-union widening in three files (modal type,
//     TeamPage useState type, openAddModal default-param type).
//     Previous note (v133) preserved below:
// Version: 3.7.79 — cache suffix bumped to v133. Agenda photo SAVE fix:
//     meetingStore.createMeeting was rebuilding each agenda item with only
//     {title, description, threshold} — silently dropping `attachments`, so
//     a photo on a «свой вопрос» never reached the server (stored NULL).
//     Now forwarded. (Companion to the v132 display fix in mapAgendaItem —
//     both are needed: one to save the photo, one to render it.)
//     Previous note (v132) preserved below:
// Version: 3.7.78 — cache suffix bumped to v132. In this bundle:
//   (1) Meeting schedule-poll voting fix: resident date-poll votes were
//       silently dropped — the server INSERT omitted the legacy NOT NULL
//       `user_id` column (constraint failure 500) and the store masked it
//       as "Голос принят!". Now user_id is written and the store surfaces
//       real failures.
//   (2) Meeting agenda photos: attachments never reached the UI because
//       mapAgendaItem didn't map `attachments` (the list endpoint returns
//       it as a JSON string) — now parsed, so residents see photos attached
//       to a question.
//   (3) Договор управления: upload widget shows on the director/manager
//       dashboard overview ONLY while no contract exists; once attached it
//       moves to Настройки → Договор (new tab, appears only after upload).
//       Managers can now upload the contract too (SELF_UPLOAD_ROLES += manager).
//     Previous note (v131) preserved below:
// Version: 3.7.77 — cache suffix bumped to v131. Frontend change in this
//     bump: TeamPage desktop toolbar no longer overlaps (action buttons
//     wrap as a unit, never compress). (Companion server-side fix, not in
//     this file: the Cloudflare Worker now validates a tenant subdomain
//     against the LIVE VPS DB via /api/public/tenant-exists instead of the
//     frozen D1 archive — that archive lacked every post-migration УК, so
//     new tenants like testpr.kamizo.uz were wrongly 404'd.)
//     Previous note (v130) preserved below:
// Version: 3.7.76 — cache suffix bumped to v130 to evict every v129 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Cross-platform file download via @capacitor/filesystem. The
//     iOS port (v129+) revealed a known Capacitor limitation: blob
//     URLs on synthetic <a download> clicks silently no-op in
//     WKWebView. Sprint 85's contract download fired the toast +
//     fetched the bytes but Files app showed nothing. Same applied
//     to every report export (Excel, CSV) and the guest-pass PNG.
//
//   Plugin:
//     npm install @capacitor/filesystem (8.1.2)
//     SPM (iOS) and android settings.gradle now register the plugin.
//
//   Shared helper:
//     src/utils/downloadFile.ts — single entry point
//        downloadBlob(blob, { filename, language?, silent? })
//     Routes by Capacitor.getPlatform():
//        'ios' / 'android' → @capacitor/filesystem.writeFile to
//                             Directory.Documents. iOS Files app
//                             surfaces it under "On My iPhone →
//                             Kamizo → {filename}" (requires
//                             UIFileSharingEnabled +
//                             LSSupportsOpeningDocumentsInPlace
//                             in Info.plist, both added in v130).
//        'web'             → synthetic <a download> OR (iOS Safari
//                             PWA only) window.open() so the user
//                             can Save via the share sheet. The old
//                             iOS-Safari sniff that lived inline in
//                             contractGenerator.ts/protocolGenerator.ts
//                             moved here.
//     One success toast pair shared across surfaces. silent: true
//     when the caller wants to surface its own (resident profile's
//     locale-aware "Договор скачан").
//
//   Info.plist updates (ios/App/App/Info.plist):
//     UIFileSharingEnabled = true            (Documents/ visible in Files)
//     LSSupportsOpeningDocumentsInPlace = true (tap → original, not copy)
//
//   Twelve call sites replaced:
//     src/components/contracts/ContractUploader.tsx        — Sprint 85 director/super-admin
//     src/pages/ResidentProfilePage.tsx                    — Sprint 85 resident
//     src/utils/contractGenerator.ts                       — DOCX + PDF contract
//     src/utils/protocolGenerator.ts                       — meeting protocol DOCX
//     src/pages/AdminDashboard.tsx                         — marketplace XLSX
//     src/pages/admin/ReportsPage.tsx                      — 3 CSV exports
//     src/pages/admin/ActivityLogPage.tsx                  — activity CSV
//     src/pages/admin/TeamPage.tsx                         — staff JSON
//     src/pages/manager/components/ReportsSection.tsx      — manager CSV
//     src/pages/shared/components/buildings/useBuildingsState.ts — ZHK JSON
//     src/pages/dashboard/MarketplaceTab.tsx               — marketplace XLSX
//     src/pages/guest-access/QRCodeDisplay.tsx             — guest QR PNG
//
//   NOT touched (per task spec):
//     src/components/common/MessageContent.tsx             — chat attachments
//                                                            (chat surface closed)
//
//   Capacitor version alignment as part of this sprint:
//     @capacitor/core, android, cli all bumped to 8.4.0 (was 8.2.0)
//     to silence the sync warning that flagged @capacitor/core 8.4.0
//     (pulled in transitively by @capacitor/filesystem) mismatching
//     android 8.2.0. status-bar stays at 8.0.2 — that's the latest
//     stable on npm.
//
//   Verified:
//     - iOS Simulator (iPhone 15 / iOS 17.0.1): tapped "Скачать
//       договор" as test-choko → Files → On My iPhone → Kamizo →
//       test2.pdf visible → opens in iOS PDF viewer.
//     - Android emulator: file lands in
//       /storage/emulated/0/Android/data/uz.kamizo.app/files/Documents/
//       (visible via adb shell ls). No regression in the v124 director
//       download path.
//     - PWA (Chrome desktop, https://choko.kamizo.uz): Capacitor.
//       getPlatform() === 'web' → synthetic anchor path → file lands
//       in ~/Downloads, existing behavior preserved. Toast still fires.
//
//   Files changed:
//     src/frontend/src/utils/downloadFile.ts                — NEW (~140)
//     src/frontend/src/utils/contractGenerator.ts           — local downloadBlob → shared
//     src/frontend/src/utils/protocolGenerator.ts           — local downloadBlob → shared
//     src/frontend/src/components/contracts/ContractUploader.tsx — handleDownload
//     src/frontend/src/pages/ResidentProfilePage.tsx        — handleDownloadTenantContract
//     src/frontend/src/pages/AdminDashboard.tsx             — marketplace export
//     src/frontend/src/pages/admin/ReportsPage.tsx          — 3 handlers
//     src/frontend/src/pages/admin/ActivityLogPage.tsx      — handleExportActivityLog
//     src/frontend/src/pages/admin/TeamPage.tsx             — handleExportStaff
//     src/frontend/src/pages/manager/components/ReportsSection.tsx
//     src/frontend/src/pages/shared/components/buildings/useBuildingsState.ts
//     src/frontend/src/pages/dashboard/MarketplaceTab.tsx   — marketplace XLSX
//     src/frontend/src/pages/guest-access/QRCodeDisplay.tsx — guest pass PNG
//     src/frontend/ios/App/App/Info.plist                   — UIFileSharingEnabled + LSSupports…
//     src/frontend/capacitor.config.ts                      — (already wired in v127 iOS port)
//     src/frontend/package.json + package-lock.json         — @capacitor/filesystem ^8.1.2
//                                                              + core/android/cli 8.4.0 align
//     src/frontend/ios/App/CapApp-SPM/Package.swift         — auto-regenerated by cap sync
//     src/frontend/android/capacitor.settings.gradle        — auto-regenerated by cap sync
//     src/frontend/public/sw.js                             — v3.7.76 / cache v130
//
//   Behaviour preserved:
//     - All v109-v129 fixes intact.
//     - Sprint 85 backend untouched.
//     - v126 Telegram-style tap-to-mark-read untouched.
//     - Web PWA download UX unchanged.
//
// Previous notes (v129) preserved below:
// Version: 3.7.75 — cache suffix bumped to v129 to evict every v128 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • P1 sweep from the pre-iOS project audit. Three categories of
//     hygiene fix, batched into a single commit because each surface
//     is small and they share an SW bump.
//
//     A. dvh callsites — Capacitor's Android System WebView can resolve
//        `100dvh` to 0 on some older Chromium-based WebViews, collapsing
//        the page chrome to height 0. The CSS-only callsites get a
//        `100vh → 100svh → 100dvh` cascade so the last supported value
//        wins; inline-style JSX sites switch to 100svh (small viewport,
//        always real) with 100vh as the safe baseline.
//          src/frontend/src/index.css                 — body + #root + main-layout + resident-chat-container cascades
//          src/frontend/src/pages/LoginPage.tsx       — root + picker overlay heights
//          src/frontend/src/components/layout/Header.tsx — notification dropdown maxHeight (also bounded to 500px)
//          src/frontend/src/pages/admin/components/DashboardTab.tsx — master-list pane maxHeight + min-height calc
//
//     B. Swallowed error catches in backend route handlers. Three
//        catches in apartments.ts and one in buildings.ts used to
//        return empty arrays / null on ANY DB error, masking real
//        outages as "no related data". KEEP the empty fallback (the
//        partial response is the correct UX when those tables are
//        empty or absent in older deployments), but add createRequestLogger
//        error logging so DB failures surface in /opt/kamizo/logs/api.err.log
//        instead of disappearing.
//          cloudflare/src/routes/buildings/apartments.ts — owners + personal_accounts + userResidents
//          cloudflare/src/routes/buildings/buildings.ts  — building_documents
//
//     C. Resident HomeTab "Оплата" tile was a soon-flagged button that
//        kept registering tap presses without action (the Lock icon
//        was the only visual cue, no `disabled` attribute). Now
//        disabled + aria-disabled when its onClick is undefined, with
//        opacity 0.7 to match the v127 ResidentProfilePage disabled-tile
//        convention. Tap no longer reads as broken UI.
//          src/frontend/src/pages/resident/components/HomeTab.tsx
//
//     SettingsPage AddManager button was already correctly disabled
//     (opacity-50 + cursor-not-allowed + disabled + title) — no change.
//
//   Files changed:
//     src/frontend/src/index.css                                — 3 dvh cascade blocks
//     src/frontend/src/pages/LoginPage.tsx                      — 2 inline style fixes
//     src/frontend/src/components/layout/Header.tsx             — dropdown maxHeight
//     src/frontend/src/pages/admin/components/DashboardTab.tsx  — master-list min/max heights
//     src/frontend/src/pages/resident/components/HomeTab.tsx    — Оплата tile disabled
//     cloudflare/src/routes/buildings/apartments.ts             — 3 catches + logger
//     cloudflare/src/routes/buildings/buildings.ts              — 1 catch + logger
//     src/frontend/public/sw.js                                 — v3.7.75 / cache v129
//
//   Verified on Capacitor APK + production api.kamizo.uz:
//     - Login page renders full viewport on Android emulator (was
//       collapsed pre-v129 on some Chromium-WebView builds).
//     - Notification dropdown opens at min(viewport - 100px, 500px) —
//       never 0-height clipped.
//     - Resident HomeTab "Оплата" tile: tap no longer triggers an
//       active state; Lock icon + reduced opacity make it visibly
//       inactive at a glance.
//     - Apartment detail / building detail responses unchanged when
//       the underlying tables are empty. Triggering a deliberate
//       table-missing failure now writes an error line to api.err.log
//       (visible via `journalctl -u kamizo-api -f`).
//
//   Migration: NONE.
//
//   Behaviour preserved:
//     - All v109-v128 fixes intact.
//     - Sprint 85 contract + v125 Собрания + v126 tap-to-read + v128
//       apartment_id all untouched.
//     - Existing v117 + v125 dark-theme safety net unchanged — no new
//       surface broken in dark.
//
// Previous notes (v128) preserved below:
// Version: 3.7.74 — cache suffix bumped to v128 to evict every v127 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Real fix for the v127 P0-NEEDS-DECISION on resident finance balance.
//
//     Backend (the v127 audit's "Option A" — widen the user payload):
//       cloudflare/src/routes/users/auth.ts — `userFields` SELECT now
//         carries a correlated subquery that resolves the user's
//         apartment_id (apartments.id UUID) via
//           SELECT id FROM apartments
//             WHERE primary_owner_id = users.id
//               AND tenant_id = users.tenant_id
//             ORDER BY created_at ASC LIMIT 1
//         Both PATH A (tenant-scoped login) and PATH B (unified mobile
//         disambiguation) reuse the same field list — both now include
//         apartment_id.
//       cloudflare/src/middleware/auth.ts — getUser() applies the same
//         subquery to both the tenant-scoped lookup and the super-admin
//         fallback path, so /api/users/me + every other endpoint that
//         reads `user.apartment_id` from getUser stays consistent with
//         the login payload.
//
//     Frontend:
//       src/types/auth.ts — User.apartmentId?: string | null
//       src/services/api/client.ts — transformUser() maps the snake_case
//         apartment_id from the API into camelCase apartmentId, falling
//         back to null when absent.
//       src/pages/ResidentDashboard.tsx — replaces the v127 guarded-no-op
//         with a proper call: getApartmentBalance(user.apartmentId)
//         only when apartmentId is truthy. Effect dep array now keys on
//         apartmentId instead of user.id so a user who got their
//         apartment linked after first login re-fires the fetch.
//
//     Verified on production api.kamizo.uz with VPS-restarted backend:
//       - test-choko (resident, linked to apartment fa55afb2-…):
//         /api/auth/login response includes
//           "apartment_id": "fa55afb2-221e-4a91-914a-b0288d368890"
//         GET /api/finance/apartments/fa55afb2…/balance with the same
//         token returns HTTP 200 + a real balance object (no more 403).
//       - test-director-choko: response carries
//           "apartment_id": null
//         No crashes on profile or dashboard surfaces (verified via APK
//         re-walk: 0 dead buttons, 0 4xx).
//       - Cross-tenant: as test-choko, GET /api/finance/apartments/
//         f8d2b7f6-… (an apartment on a different tenant) → 403
//         "Access denied". Tenant isolation holds; the JOIN's
//         `tenant_id = users.tenant_id` keeps cross-tenant rows out.
//       - /api/users/me with the resident token returns the same
//         apartment_id as /api/auth/login. Refresh paths consistent.
//
//   Test-data note: choko has 28 apartments seeded but only a handful
//   have `primary_owner_id` set. Most residents in the choko test set
//   thus get apartment_id=null on login. That's correct behavior — the
//   tile keeps its "—" default for those users. Real production data
//   should hydrate primary_owner_id during onboarding (the auth.ts
//   /api/auth/register handler already does that for new residents).
//
//   Migration: NONE. The query is an additive subquery; no schema
//   change, no ALTER TABLE.
//
//   Files changed:
//     cloudflare/src/routes/users/auth.ts                   — userFields subquery
//     cloudflare/src/middleware/auth.ts                     — getUser subquery × 2
//     src/frontend/src/types/auth.ts                        — User.apartmentId
//     src/frontend/src/services/api/client.ts               — transformUser mapping
//     src/frontend/src/pages/ResidentDashboard.tsx          — proper apartmentId call
//     src/frontend/public/sw.js                             — v3.7.74 / cache v128
//
//   Behaviour preserved:
//     - All v109-v127 fixes intact.
//     - Sprint 85 contract section + v125 orange Собрания + v126
//       Telegram-style tap-to-read untouched.
//     - Existing routes that didn't read apartment_id from getUser are
//       unaffected (extra field is harmless if ignored).
//
// Previous notes (v127) preserved below:
// Version: 3.7.73 — cache suffix bumped to v127 to evict every v126 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • P0 fixes from the pre-iOS project audit. Two resident-facing
//     issues found by the auto-walker (director + manager surfaces
//     came back 0 dead buttons / 0 4xx):
//
//     1. ResidentProfilePage "Бонусы" tile was a dead button —
//        no onClick, no visual disabled state, no "Скоро" indicator.
//        Tapping read as "broken UI". Fix:
//          - Tile sub-text now reads "Скоро" / "Tez orada" instead
//            of the bare "—" placeholder.
//          - Tile button now sets disabled / aria-disabled when its
//            onClick is undefined, so it visually + semantically
//            announces "not active yet". opacity 0.7 makes it
//            distinct from active tiles at a glance.
//
//     2. ResidentDashboard was calling /api/finance/apartments/
//        :apartmentId/balance with user.id (a users.id, not an
//        apartments.id). The backend's WHERE clause never matched,
//        returning 403 twice per dashboard render. The "Оплата" tile
//        showed "—" anyway because the response was discarded. Fix:
//          - Gate the fetch behind user.apartmentId — currently
//            absent from /api/auth/login, so the call is suppressed
//            until that backend payload is widened. Visible UX is
//            unchanged (tile still defaults to "—"), but we stop
//            hammering /api/finance with rejections.
//
//        Tracked as P0-NEEDS-DECISION in the v127 audit report: the
//        real fix requires either widening the user payload (option
//        A) or adding GET /api/finance/me/balance with JWT-derived
//        resolution (option B). Both are small backend touches —
//        ~1 hour of dev time. Not done in v127 per the audit's
//        "no backend changes" stop condition.
//
//   Files changed:
//     src/frontend/src/pages/ResidentProfilePage.tsx     — Бонусы tile + disabled rendering
//     src/frontend/src/pages/ResidentDashboard.tsx       — gate finance fetch
//     src/frontend/public/sw.js                          — v3.7.73 / cache v127
//
//   Behaviour preserved:
//     - All v109-v126 fixes intact.
//     - Director / manager / dispatcher / executor surfaces unchanged
//       (auto-walker confirmed 0 dead buttons / 0 4xx).
//     - Sprint 85 contract section untouched.
//     - v125 orange "Собрания" recolor untouched.
//     - v126 Telegram-style tap-to-read untouched.
//
// Previous notes (v126) preserved below:
// Version: 3.7.72 — cache suffix bumped to v126 to evict every v125 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Notifications dropdown — Telegram-style tap-to-mark-read +
//     navigate. Before v126 the bell badge would stay at its highest
//     count for the whole session: opening the modal didn't clear
//     anything, and only the generic userNotifications rows had a
//     mark-as-read on click (no navigation), while the meetings and
//     announcements section rows navigated without marking. Now every
//     row in every section is a single self-contained tap target:
//
//       userNotifications row:
//         - markNotificationAsRead(id) → PATCH /api/notifications/:id/read
//           (already existed, idempotent server-side)
//         - heuristic route resolver maps title/message + requestId
//           to /requests, /meetings, /announcements (LIST pages —
//           detail routes don't exist in this app)
//         - close modal + navigate
//
//       Meetings section row:
//         - notificationStore.dismissMeetingForUser(userId, meetingId)
//           writes a per-user dismissed-meeting ID to localStorage
//           (under the existing uk-notification-storage blob).
//           upcomingMeetings filter excludes dismissed IDs so the
//           "Собрания (N)" header decrements + the bell total drops.
//           No backend table — meetings are events, not notification
//           rows, and cross-device dismissal sync carries near-zero
//           product value (a meeting you reviewed on the phone is
//           still upcoming and a fresh nudge on the tablet is fine).
//         - close modal + navigate('/meetings')
//
//       Announcements section row:
//         - announcementStore.markAnnouncementAsViewed(id, userId)
//           POSTs the existing /api/announcements-views endpoint
//           (already shipped) so the badge decrements AND the read
//           state syncs across devices.
//         - close modal + navigate('/announcements')
//
//     Both header surfaces (desktop Header.tsx + mobile MobileHeader.tsx)
//     receive the same wiring so the behavior is identical at every
//     breakpoint. Onboarding tasks already self-clear when complete
//     (client-side check against user/vehicle state) — no change.
//
//   Files changed:
//     src/frontend/src/stores/notificationStore.ts        — +47 / dismissedMeetings + 2 actions
//     src/frontend/src/components/layout/Header.tsx       — wired 3 click handlers
//     src/frontend/src/components/layout/MobileHeader.tsx — wired 3 click handlers
//     src/frontend/public/sw.js                           — v3.7.72 / cache v126
//
//   No backend changes. PATCH /api/notifications/:id/read +
//   /api/announcements-views were both already wired pre-v126.
//
//   Verified live on Capacitor APK against api.kamizo.uz:
//     - test-director-moon: bell badge "1" → tap "Собрание дома" row →
//       modal closes → /meetings page → bell badge gone.
//     - test-choko (5 unread): tap 🔔 "Новое собрание объявлено" →
//       modal closes → /meetings → badge "5" → "4".
//     - Cross-tenant: choko cannot mark moon's notification IDs (404,
//       handler scopes to user_id from JWT — preserved from pre-v126
//       endpoint).
//     - Light + dark themes both render decrement correctly.
//
//   Behaviour preserved:
//     - All v109-v125 fixes intact, Sprint 85 contract feature
//       unchanged, v125 orange "Собрания" recolor unchanged.
//     - markAllNotificationsAsRead button (when present) unchanged.
//
// Previous notes (v125) preserved below:
// Version: 3.7.71 — cache suffix bumped to v125 to evict every v124 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Notifications dropdown "Собрания" section recolored from purple
//     to brand orange. v118 had only softened the saturation (50/60
//     alpha) but left the hue purple, so director / resident accounts
//     still saw a non-brand block in their notification dropdown. v125
//     swaps every purple-* utility for the corresponding orange-*:
//       header band   bg-orange-50  /  bg-orange-50/50   (mobile keeps alpha)
//       border        border-orange-100  /  border-orange-100/60
//       row tint      bg-orange-50/50    (desktop only)
//       icon circle   bg-orange-100  /  bg-orange-100/60
//       icon          text-orange-600
//       header text   text-orange-700
//       unread dot    bg-orange-500
//     Two files touched — Header.tsx (desktop ≥ md breakpoint) and
//     MobileHeader.tsx (< md). No other notification renderer exists;
//     grep confirmed there's no NotificationsModal / NotificationsPanel
//     / NotificationsDropdown sub-component, both header variants own
//     the dropdown inline. All other section colors untouched (Заявки
//     blue, Объявления blue, onboarding amber, dashboard category tiles
//     keep their categorical colors — including the legit purple
//     "Сотрудники" tile which is outside this dropdown).
//
//   Tested live on Capacitor APK + Chrome PWA against api.kamizo.uz:
//     - test-director-moon: notifications dropdown header band is
//       orange in light + dark themes.
//     - test-choko (resident, 1 upcoming meeting): same orange band,
//       same brand-consistent eyebrow.
//     - Other categorical colors (announcements blue, onboarding amber)
//       unchanged.
//
//   Files changed:
//     src/components/layout/Header.tsx                    — desktop block swap (6 classes)
//     src/components/layout/MobileHeader.tsx              — mobile block swap (5 classes, /50/60 alpha kept)
//     src/frontend/public/sw.js                           — v3.7.71 / cache v125
//
//   Behaviour preserved:
//     - All v109-v124 fixes untouched.
//     - Sprint 85 tenant-contract feature unchanged.
//     - Dashboard categorical tiles unchanged.
//     - Sidebar nav badges unchanged.
//     - RoleBadge dots unchanged.
//
// Previous notes (v124) preserved below:
// Version: 3.7.70 — cache suffix bumped to v124 to evict every v123 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Sprint 85 commit 3 of 3 — resident-side download of the tenant's
//     "Договор управления" PDF. Closes the end-to-end loop opened by
//     commit 1 (backend / R2 / 5 endpoints) and commit 2 (super-admin
//     + director upload UI). Now every authenticated resident on a
//     tenant whose director uploaded a contract can pull the PDF
//     from their profile in two taps.
//
//     Implementation:
//       - src/pages/ResidentProfilePage.tsx — new
//         "Договор управления" section sits between the
//         ManagementCompanyCard and the Settings sections, matching
//         the page's existing inline-style design (NOT the Tailwind
//         ContractUploader from commit 2 — visually would clash with
//         the rest of the profile). Two states:
//           filled: BRAND_TINT FileText icon, filename, upload date
//                   + uploader name, full-width orange "Скачать
//                   договор" button, muted help line "Договор
//                   управления многоквартирным домом с УК {name}"
//           empty : muted FileText icon, "Договор ещё не загружен",
//                   help line "Обратитесь в управляющую компанию,
//                   чтобы они загрузили договор управления"
//         Inline download helper mirrors ContractUploader's flow
//         (fetch → blob → URL.createObjectURL → <a download> →
//         revoke on next animation frame) without taking on the
//         shared component's Tailwind / dragdrop / delete surface.
//       - On mount the page also calls useTenantStore.fetchConfig()
//         so super-admin / director changes since the last app boot
//         become visible without a hard reload. Cheap — same pattern
//         the page already uses for refreshUser().
//       - GET /api/resident/contract is the only endpoint touched —
//         already shipped in commit 1. tenant_id is JWT-derived in
//         the handler, so cross-tenant residents can never see
//         another УК's PDF.
//       - 404 on download (race against super-admin deleting the
//         contract between page-load and tap) triggers a friendly
//         "Договор больше не доступен. Обновите страницу." toast +
//         a silent refetchTenantConfig() so the section flips to
//         empty-state on the next paint.
//
//     Tested live on Capacitor APK + Chrome PWA against api.kamizo.uz:
//       - test-choko (resident on choko.kamizo.uz):
//         section visible, metadata correct, "Скачать договор"
//         downloads the PDF via Android DownloadManager.
//       - Resident with no tenant contract: empty state renders
//         with the contact-УК prompt and no download button.
//       - Super-admin deletes choko's contract → resident reloads
//         the profile → section flips to the empty state.
//       - Cross-tenant: as test-moon, only MOON's contract (or empty
//         state) is reachable. Server enforces tenant isolation on
//         /api/resident/contract via JWT-derived tenant_id; the
//         client never knows the other tenant's contract URL.
//       - Dark + light themes both render cleanly via the existing
//         --rpp-* tokens.
//       - Admin / director / chat surfaces untouched.
//
//   Files changed (commit 3):
//     src/frontend/src/pages/ResidentProfilePage.tsx       — +~210
//     src/frontend/public/sw.js                            — v3.7.70 / cache v124
//
//   Behaviour preserved:
//     - All v109-v123 fixes untouched.
//     - ContractUploader / director / super-admin surfaces unchanged.
//     - Resident /contract route (personal contract tile) unchanged.
//     - No backend changes — uses existing GET /api/resident/contract
//       and GET /api/tenant/config from commits 1 + 2.
//
//   Phase complete — all 3 Sprint 85 commits closed. End-to-end working:
//     super-admin uploads → director uploads → every resident downloads.
//
// Previous notes (v123) preserved below:
// Version: 3.7.69 — cache suffix bumped to v123 to evict every v122 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Sprint 85 commit 2 of 3 — super-admin + director upload UI for
//     tenant contract PDFs. Backend (commit 1, v200) already shipped
//     the R2 binding + 5 endpoints + tenants.contract_* columns.
//     This commit adds:
//       - NEW src/components/contracts/ContractUploader.tsx
//         (~280 lines) — single shared widget used by both surfaces.
//         Empty-state drag-drop zone with file picker; filled-state
//         metadata row + Заменить + Скачать + (optional) Удалить
//         buttons. Client-side validation: file.type ===
//         'application/pdf' AND size ≤ 10 MB. Toast on 415 / 413 /
//         403 with friendly RU/UZ copy. ConfirmDialog on delete
//         (red tone). Download path: fetch → blob →
//         URL.createObjectURL → synthetic <a download> → revoke on
//         next animation frame so Android WebView's DownloadManager
//         actually picks up the click.
//       - DashboardTab.tsx (super-admin tenants page) — wired the
//         shared component into the selected-tenant detail panel
//         with allowDelete=true. Cards also get a quiet emerald
//         FileText icon on tenants with has_contract === 1, so
//         super-admin can scan the list for missing contracts.
//       - OverviewTab.tsx (director dashboard) — wired with
//         allowDelete=false; downloadEndpoint=/api/admin/tenant/
//         contract so director can verify what residents see.
//       - useTenantStore.TenantConfig type + frontend Tenant type
//         extended with optional contract metadata. /api/tenant/config
//         got a small 5-line backend touch to include
//         { contract: { filename, uploaded_at, uploaded_by_name } }
//         when the tenant has a contract uploaded. The director uses
//         this for the widget without a second fetch.
//       - Backend touch (src/routes/misc/health.ts) was the only
//         non-frontend change — adds a LEFT JOIN users + lifts the
//         per-row enrichment so the existing useTenantStore consumers
//         get the field for free. No new endpoint introduced.
//
//   Tested live on Capacitor APK + Chrome PWA against api.kamizo.uz:
//     - Director upload (PDF): metadata refreshes, toast "Договор
//       загружен", widget switches to filled state with filename +
//       date + uploader name
//     - Director download: PDF blob, anchor download triggers
//       browser's save dialog (Capacitor WebView → DownloadManager)
//     - Director NO Delete button rendered (allowDelete=false)
//     - Resident path (test-choko): InfoDropdown, chat, contract
//       download from profile (commit 3 territory) all unaffected
//     - Non-PDF rejected client-side with friendly RU message
//     - >10 MB file rejected client-side
//     - Cross-tenant: as test-director-moon, dashboard shows MOON's
//       contract metadata (from JWT-scoped /api/tenant/config)
//
//   Files changed:
//     src/components/contracts/ContractUploader.tsx       — NEW (~280)
//     src/pages/admin/components/DashboardTab.tsx         — uploader + cards badge
//     src/pages/admin/components/types.ts                 — contract fields
//     src/pages/dashboard/OverviewTab.tsx                 — director widget
//     src/stores/tenantStore.ts                           — TenantConfig.contract
//     cloudflare/src/routes/misc/health.ts                — backend touch
//     src/frontend/public/sw.js                           — v3.7.69 / cache v123
//
//   Behaviour preserved:
//     - All v109-v122 fixes untouched.
//     - ResidentChatView unchanged.
//     - Resident profile (commit 3 territory) unchanged.
//     - TenantFormModal unchanged.
//
// Previous notes (v122) preserved below:
// Version: 3.7.68 — cache suffix bumped to v122 to evict every v121 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • TWO fixes in one commit.
//
//     1) WIRED "Профиль жителя" in the admin chat InfoDropdown via the
//        `/residents?focus=:id` query-param convention. v121 had kept
//        the row disabled (Option D in the known-issue doc). Within
//        24h product asked for the chat → profile flow to work
//        end-to-end without waiting on an app-wide :param routing
//        decision, so Option B was re-picked with two adjustments to
//        the original B sketch:
//          - Tenant-wide fetch (no building filter) on cache miss so
//            the dispatcher gets the modal even on first load — not
//            just when they had recently drilled into a building.
//          - Param always cleared via
//            setSearchParams({}, { replace: true }) regardless of
//            success / miss / error, so refresh + back-nav don't
//            re-fire the effect.
//        Tenant isolation is server-side (usersApi.getAll filters by
//        caller's JWT tenant). Cross-tenant focus IDs silently miss —
//        the dispatcher lands on their own residents list, no error,
//        no PII leak.
//
//     2) KILLED light-flash on :active and :hover in dark theme
//        app-wide. v117 had patched only the dashboard tabs
//        (active:bg-gray-100 / -50). Tailwind doesn't ship dark
//        variants for those pseudo classes, so dozens of other
//        components (cards, list rows, sidebar nav items, modal close
//        buttons) flashed bright on every tap. Extended the v96 dark
//        safety net to cover the full color family:
//          .active\\:bg-white /
//          .active\\:bg-gray-{100,200,50} /
//          .active\\:bg-stone-{50,100,200} /
//          .active\\:bg-neutral-{50,100} /
//          .active\\:bg-slate-{50,100} /
//          .active\\:bg-zinc-{50,100}
//        Plus companion :hover rules for desktop pointer surfaces. Each
//        maps to the same themed stone the static-state v96 rule uses,
//        so the press blends with the surrounding card.
//
//   Files changed:
//     src/pages/chat/InfoDropdown.tsx                            — wired profile nav
//     src/pages/shared/components/residents/useResidentsLogic.ts — ?focus reader
//     src/index.css                                              — dark safety net
//     docs/known-issues/INDEX.md                                 — moved to Resolved
//     docs/known-issues/resident-deep-link.md                    — sprint-note appended
//     src/frontend/public/sw.js                                  — v3.7.68 / cache v122
//
//   Behaviour preserved:
//     - LIGHT theme is byte-identical — every CSS rule is `html.dark` scoped.
//     - All v109-v121 fixes untouched (security, layout, dark theme,
//       admin chat actions, RoleBadge, etc.).
//     - ResidentChatView unchanged.
//     - Commit-2 InfoDropdown rows (Assign / Resolve) untouched.
//     - AssignStaffModal unchanged.
//     - ResidentsPage existing flows (drill-down, upload, add, edit)
//       unaffected — the new useEffect only fires when ?focus= is in
//       the URL.
//
// Previous notes (v120 — v121 cache header never updated the comment)
// preserved below:
// Version: 3.7.66 — cache suffix bumped to v120 to evict every v119 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Admin chat InfoDropdown actions — frontend implementation
//     (commit 2 of 3 in the admin-chat-actions sprint).
//
//     Backend (commit 1, shipped earlier) added chat_channels.assigned_to
//     / resolved_at / resolved_by columns and four PATCH endpoints. This
//     commit wires the InfoDropdown's previously-stubbed rows to those
//     endpoints, plus surfaces the new state in DialogHeader and the
//     AdminChannelList ChatCard.
//
//     New: AssignStaffModal.tsx
//       - Bottom-sheet on mobile / centered 480-card on desktop
//       - Fetches /api/team on open, flattens the categorized response
//         into a single rank-ordered list (director → admin → manager
//         → department_head → dispatcher → executor → advertiser →
//         security), renders RoleBadge per row
//       - Search filter by name or role label
//       - Tap row → PATCH /assign with that user-id → toast + close
//       - Current assignee shows orange "Назначен" pill + disabled row
//       - Footer "Снять назначение" button when an assignee exists
//
//     InfoDropdown.tsx wired:
//       - "Назначить сотрудника" row now opens AssignStaffModal
//       - "Пометить решённым" row triggers ConfirmDialog → PATCH /resolve
//         Label dynamically flips to "Снять отметку решённого" when
//         channel.resolved_at is non-null; same row drives /unresolve
//       - "Профиль жителя" still navigates (was already wired)
//       - "Закрыть обращение" still stub — commit 3 will REMOVE it
//
//     DialogHeader.tsx:
//       - Adds emerald "✓ Решено" pill next to channel name when
//         channel.resolved_at is set (visible to BOTH staff and
//         residents — chat-spec §1.4 makes resolved state legitimate
//         resident-facing context)
//       - Adds tappable "Назначен: <Name> · <Role>" line under the
//         subtitle (staff only — backend nulls assigned_* for residents).
//         Tap reopens AssignStaffModal so the operator can reassign.
//
//     AdminChannelList.tsx (ChatCard LocationBadges):
//       - Adds small emerald "Решено" tag next to the
//         "Дом X · кв. N" metadata line. Resolved channels stay in the
//         list (chat-spec §5.1 — no auto-archive).
//
//     ChatView.tsx:
//       - Hosts the modal + ConfirmDialog state, owns the PATCH calls,
//         calls onChannelUpdated(updated) bubble up.
//       - Confirm dialog uses the existing ConfirmDialog component
//         (tone: primary, brand orange button).
//       - Error toasts on 400/403/404 — "Не удалось пометить, попробуйте
//         позже" / "Не удалось назначить, попробуйте позже".
//
//     ChatPage.tsx:
//       - handleChannelUpdated(updated) replaces the row in channels[]
//         state in-place. List view re-renders with the new Решено tag
//         without a full /api/chat/channels refetch.
//
//   Type extensions:
//     ChatChannel (in chatUtils.ts) — new optional/nullable fields:
//       assigned_to, assigned_to_name, assigned_to_role,
//       resolved_at, resolved_by, resolved_by_name, updated_at
//
//   chatApi (in services/api/chat.ts) — new methods:
//       getChannel(id)               GET /api/chat/channels/:id
//       assignChannel(id, userId)    PATCH /assign  body {assigned_to}
//       resolveChannel(id)           PATCH /resolve
//       unresolveChannel(id)         PATCH /unresolve
//
//   Files changed/created:
//     src/pages/chat/AssignStaffModal.tsx        — NEW (~280 lines)
//     src/pages/chat/InfoDropdown.tsx            — wired Assign + Resolve rows
//     src/pages/chat/DialogHeader.tsx            — Решено pill + Назначен line
//     src/pages/chat/AdminChannelList.tsx        — Решено tag on ChatCard
//     src/pages/chat/ChatView.tsx                — modal/confirm state + handlers
//     src/pages/ChatPage.tsx                     — onChannelUpdated handler
//     src/pages/chat/chatUtils.ts                — ChatChannel type ext
//     src/services/api/chat.ts                   — 4 new methods
//
//   Behaviour preserved:
//     - All v109-v119 fixes untouched.
//     - Resident view (ResidentChatView) untouched — InfoDropdown
//       only renders on the staff dialog header.
//     - Light + dark themes both render correctly. Emerald palette
//       picks up dark variants automatically via Tailwind defaults.
//     - "Профиль жителя" stub — commit 3 wires the navigation.
//     - "Закрыть обращение" stub — commit 3 removes it.
//
// Previous notes (v119) preserved below:
// Version: 3.7.65 — cache suffix bumped to v119 to evict every v118 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Sidebar drawer "Собрания" nav badge — color swap blue → brand orange.
//
//     User reported that the count badge on the «Собрания жильцов»
//     row in the side-drawer (hamburger menu) renders as a blue
//     circle when there's an active vote, which reads as off-brand
//     against the surrounding sidebar where every other count badge
//     is brand orange. Note: the bug lives in Sidebar.tsx (the
//     drawer component), NOT MobileHeader.tsx as the task description
//     stated — MobileHeader hosts the bell notifications dropdown,
//     and only opens the drawer that Sidebar.tsx renders.
//
//     Root cause: a 3-way conditional at Sidebar.tsx:~1083 that color-
//     coded the badge by meeting status — `voting` → bg-blue-500,
//     `confirmed` → bg-green-500, anything else → bg-primary-500
//     (brand orange). The blue was a categorical "active vote"
//     marker but didn't match the Kamizo palette and was the only
//     blue badge anywhere in the drawer.
//
//     Single class swap: bg-blue-500 → bg-primary-500. Net:
//       voting state → orange (was blue) + still pulses
//                      (animate-pulse via shouldAnimate)
//       confirmed   → green  (unchanged — that's a different success-
//                      state semantic the user didn't complain about)
//       upcoming    → orange (unchanged)
//       all other   → orange (unchanged)
//
//   NOT touched:
//     - The other badge render path inside the resident-side
//       NavMenuItem (line ~1339-1349) — it already uses
//       `var(--brand, #F97316)`, so no change needed there.
//     - The bell-icon red badge in MobileHeader top-right
//       (unread-critical indicator, stays red).
//     - The gray lock icons on premium-feature rows.
//     - The orange "СНОКО" tenant chip — already brand orange.
//     - All other badges across the app.
//     - The shared `<span>` badge renderer at line 1131 — change is
//       scoped to the per-item `badgeColor` derivation, not the JSX.
//
//   Files changed:
//     src/components/layout/Sidebar.tsx   — 1 class swap (3-way conditional, voting branch)
//     src/frontend/public/sw.js           — v3.7.65 / cache v119
//
//   Behaviour preserved:
//     - v109-v118 fixes untouched.
//     - Light + dark themes both render the orange badge correctly
//       (bg-primary-500 = orange in both themes; no dark-variant
//       needed because brand orange is identity-color, not surface).
//     - Pulse animation on active voting still fires.
//     - confirmed-state green badge unchanged.
//
// Previous notes (v118) preserved below:
// Version: 3.7.64 — cache suffix bumped to v118 to evict every v117 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Targeted softening of the "Собрания" section in the bell
//     notifications dropdown (MobileHeader.tsx), LIGHT theme only.
//     v117 already softened the dark-theme rendering via the index.css
//     safety net; this commit addresses a separate user observation
//     that the LIGHT theme purple band was louder than its sibling
//     section headers (amber Onboarding, blue Announcements). Root
//     cause: Tailwind's `purple-50` (#FAF5FF) is markedly brighter
//     than `blue-50` (#EFF6FF) / `amber-50` (#FFFBEB), so even though
//     the JSX classes are structurally identical across the three
//     sections, the purple one read as the most-saturated band.
//
//     Class deltas in MobileHeader.tsx, scoped strictly to the
//     Meetings section JSX (~10 lines):
//       header band:  bg-purple-50          → bg-purple-50/50
//                     border-purple-100     → border-purple-100/60
//       rows:         bg-purple-50/50       → (removed, plain white)
//       icon circle:  bg-purple-100         → bg-purple-100/60
//
//     UNCHANGED (intentionally):
//       header text  text-purple-700 — needs contrast for legibility
//       icon text    text-purple-600 — category cue still visible
//       unread dot   bg-purple-500   — functional marker, must stay vivid
//       dark theme   inherits v117 safety net translucent treatment
//       sibling sections (Onboarding amber, Announcements blue) — out of scope
//       all other purple uses in the app (status pills, icon backgrounds,
//         settings page module list, etc.) — out of scope
//
//   Files changed:
//     src/components/layout/MobileHeader.tsx — 4 class edits in the Meetings block
//     src/frontend/public/sw.js              — v3.7.64 / cache v118
//
//   Behaviour preserved:
//     - All v109-v117 fixes untouched.
//     - Light theme of every other surface in the app — byte-identical.
//     - Dashboard cards (Сотрудники purple icon, Комплексы teal, Собрания
//       orange) — UNCHANGED, they live in OverviewTab.tsx, not touched.
//
// Previous notes (v117) preserved below:
// Version: 3.7.63 — cache suffix bumped to v117 to evict every v116 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Three dark-mode polish fixes for the director/admin dashboard,
//     all addressed via a single index.css safety-net extension (no
//     component-level JSX changes — light theme is byte-identical).
//
//     1) Notifications dropdown — section accent colors. The bell
//        modal in Header.tsx + MobileHeader.tsx groups notifications
//        by category (Onboarding amber, Announcements blue, Meetings
//        purple) and each section header + row uses hardcoded
//        bg-{color}-50 / text-{color}-700 / bg-{color}-100 with no
//        dark variant. The v96 safety net only covered the gray
//        scale, so the bands rendered as bright lit panels against
//        the dark surface. User specifically reported the violet
//        "Собрания (2)" header looking pasted in from a different
//        design system, plus translucent gray rows lifting above
//        the surface. New rules map each accent family to alpha
//        overlays of the same hue — band stays identifiable but
//        the surface tone matches the rest of the dark theme.
//
//     2) Tab press state — "white capsule" on tap. Director,
//        Admin, and Manager dashboards share a segmented-tab
//        pattern with `active:bg-gray-100` (8 callsites). The v96
//        safety net's `.bg-gray-100` rule only matched the unmodified
//        class — Tailwind's `:active` pseudo selector
//        (`.active\:bg-gray-100:active`) escaped it, so taps flashed
//        a bright light-gray panel against the dark surface. New
//        rule routes the press state to the same themed stone the
//        static state uses.
//
//     3) Companion `active:bg-gray-50` rule added so the same
//        treatment applies wherever components use the lighter
//        press shade.
//
//   Files changed:
//     src/frontend/src/index.css   — +43 lines in the v96 safety-net block
//     src/frontend/public/sw.js    — v3.7.63 / cache v117
//
//   Behaviour preserved:
//     - All v109-v116 fixes (security, density, tabbar hide,
//       RoleBadge, layout, scroll, conditional bottom-bar, image
//       download, QuickReplies position, send icon color).
//     - Light theme byte-identical — every new rule is `html.dark`
//       scoped.
//     - No JSX touched, so no risk of breaking existing visuals
//       in surfaces the rules also reach (status pills using
//       bg-purple-100 etc. now get the same translucent
//       treatment, which is a net improvement, not a regression).
//
// Previous notes (v116) preserved below:
// Version: 3.7.62 — cache suffix bumped to v116 to evict every v115 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Three admin chat dialog fixes in one commit:
//
//     1) Image-viewer download button (was a no-op in Capacitor).
//        ImageLightbox.handleDownload created a detached <a> with a
//        `download` attribute and called .click() on it. Chrome desktop
//        tolerates clicks on disconnected anchors; Android WebView
//        silently no-ops. Fix: appendChild to body, click, then
//        requestAnimationFrame-remove. Also derive a sensible filename
//        ("kamizo-chat-image-${ts}.${ext}") from the data:image MIME
//        type when alt is empty/generic. try/catch + window.open
//        fallback for the rare case where the browser blocks the
//        synthetic click (user can then long-press → Save image).
//
//     2) Staff QuickReplies pills moved from ABOVE MessageList (right
//        under DialogHeader) to immediately ABOVE the Composer. The
//        prior position blocked the resident-context strip from being
//        visible during message scroll and didn't match the design
//        pack mockup or the resident chat's own pattern. The flex
//        chain is unchanged (`shrink-0` everywhere except MessageList's
//        `flex-1 min-h-0`), so this is a pure render-order change.
//        QuickReplies.tsx itself unchanged behaviour-wise, but its
//        TemplatesPicker popover anchor flipped from `top-full` (v114
//        decision when pills were at top) back to `bottom-full` so the
//        popover opens UPWARD into the message-list area — visible
//        — instead of off the bottom of the viewport.
//
//     3) Send-button icon stays brand-orange when disabled. Previously
//        `disabled:text-gray-300` made the paper-plane fade out with
//        the button, washing the Kamizo identity. Now the button bg
//        stays gray (signals "not actionable") but the icon switches
//        to `text-orange-500` so the brand marker is visible even with
//        an empty composer.
//
//   Files changed:
//     src/components/common/MessageContent.tsx  — robust download path
//     src/pages/chat/ChatView.tsx               — QuickReplies render position
//     src/pages/chat/QuickReplies.tsx           — popover anchor bottom-full
//     src/pages/chat/ChatComposer.tsx           — disabled-icon color
//     src/frontend/public/sw.js                 — v3.7.62 / cache v116
//
//   Behaviour preserved:
//     - v111 BottomBar hide rule (modalStore-driven) untouched.
//     - v112 RoleBadge polish untouched.
//     - v113 wrapper-margin fix untouched.
//     - v114 dvh→vh + min-w-0/min-h-0 flex chain untouched.
//     - v115 conditional bottom reserve untouched.
//     - Resident chat (ResidentChatView) untouched — QuickReplies is
//       staff-only (rendered only when `isStaff && isPrivateSupport`),
//       resident's own quick-reply chips are inline in ChatView at a
//       different render block.
//
// Previous notes (v115) preserved below:
// Version: 3.7.61 — cache suffix bumped to v115 to evict every v114 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Admin chat composer — close the ~68 px gap below it on mobile.
//     v114's wrapper height calc subtracted var(--mobile-header-h, 68px)
//     unconditionally, leaving ~68 CSS px of empty space between the
//     Composer and the viewport bottom when the dialog was open and the
//     BottomBar was hidden. The subtraction was a hold-over from a
//     prior layout — no top mobile-header is actually rendered above
//     the chat-active wrapper, and the bottom reservation didn't match
//     the actual BottomBar height anyway.
//     v115 fixes both: drops the spurious --mobile-header-h subtraction
//     and makes the bottom reservation conditional on BottomBar
//     visibility. Decision tree:
//       - Mobile + LIST view (no channel selected) → reserve
//         var(--bottom-bar-h, 64px). BottomBar is fixed at bottom and
//         the wrapper must not run under it.
//       - Mobile + DIALOG view (channel selected) → reserve only
//         env(safe-area-inset-bottom). BottomBar is hidden via
//         useModalPresence, so the wrapper fills the viewport.
//       - Desktop (≥md) → reserve safe-area only. BottomBar is never
//         rendered on desktop (BottomBar.tsx early-returns on
//         !isMobile).
//
//     Same change duplicated to ResidentChatView.tsx — the resident
//     chat uses a fixed-positioned composer that pinned itself to
//     viewport bottom regardless of wrapper height, but the
//     chat-area surface still ended ~64 px above viewport bottom.
//     Resident is always on /chat with BottomBar hidden, so we drop
//     the var entirely and reserve only safe-area-inset-bottom.
//
//   Files changed:
//     src/pages/ChatPage.tsx                 — conditional bottom reserve in admin wrapper height + maxHeight
//     src/pages/chat/ResidentChatView.tsx    — drop --mobile-header-h, reserve safe-area only
//     src/frontend/public/sw.js              — v3.7.61 / cache v115
//
//   Behaviour preserved:
//     - v111 BottomBar hide rule (modalStore-driven) untouched.
//     - v112 RoleBadge polish untouched.
//     - v113 wrapper-margin fix untouched.
//     - v114 dvh→vh + min-w-0/min-h-0 flex chain fix untouched.
//
// Previous notes (v114) preserved below:
// Version: 3.7.60 — cache suffix bumped to v114 to evict every v113 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Admin chat mobile layout — root-cause fix for everything-offscreen:
//     - Prior verify report (v113 era) found DialogHeader, search button,
//       info button, InfoDropdown, and TemplatesPicker were all positioned
//       OUTSIDE the 412 CSS px mobile viewport. CDP probe showed the chat
//       panel rendering at ~947 CSS px wide and ~3428 CSS px tall, with
//       the outer .main-content scroller carrying a scrollTop of ~2607 —
//       i.e. the chat had inflated past the viewport in both axes and
//       the outer page had auto-scrolled toward the bottom, hiding the
//       header.
//     - Root cause: missing `min-w-0` / `min-h-0` on the flex chain.
//       A flex item defaults to `min-width: auto` / `min-height: auto`,
//       which sizes to its content's min-content dimensions and refuses
//       to shrink below. Combined with `flex: 1` + `overflow-y-auto` on
//       MessageList, this is a classic footgun — the overflow never
//       clips because the flex item itself grows tall enough to hide
//       the need for any scrollbar.
//     - Fix touches three files, each adding a small set of utility
//       classes (zero new logic):
//         ChatPage.tsx           — two-pane wrapper + both panes get
//                                  `min-w-0 min-h-0`
//         ChatView.tsx           — h-full flex flex-col gets `min-w-0 min-h-0`
//         MessageList.tsx        — flex-1 overflow-y-auto gets `min-h-0`
//     - Net effect on mobile (<768px): single-column dialog fills the
//       viewport, DialogHeader pinned at top, Composer pinned at bottom,
//       message list scrolls inside the bounded middle band. Telegram /
//       WhatsApp UX as spec'd. Popovers (InfoDropdown +
//       TemplatesPicker) anchor against in-viewport elements, render
//       inside the viewport.
//     - Desktop (>=768px): unchanged. The two-pane layout still works
//       because the panels have explicit widths (md:w-[280px] etc.)
//       that exceed any min-content; `min-w-0` is a no-op when the
//       intrinsic content fits within the explicit width.
//
//     - PLUS a second root cause uncovered during verify: Capacitor's
//       Android WebView does NOT support dynamic viewport units
//       (100dvh / 100svh / 100lvh all resolve to 0px on this build).
//       The chat wrapper's `height: calc(100dvh - 68px - safe-area)`
//       resolved to 0 → invalid → fell back to auto → wrapper inflated
//       to content. Switched to `100vh` (which DOES work, returning
//       821 CSS px) so the calc resolves to ~753 px as designed.
//       Same change duplicated in ResidentChatView.tsx (same pattern,
//       same bug). Other dvh callsites in the codebase (Header.tsx
//       dropdown maxHeight, LoginPage.tsx, DashboardTab.tsx min-height)
//       are likely affected too but out of scope for this fix — flagged
//       separately for follow-up.
//     - PLUS a third issue: TemplatesPicker popover was anchored with
//       `bottom-full` (above the QuickReplies strip). In the admin
//       ChatView layout QuickReplies sits at the TOP of the chat, so
//       `bottom-full` rendered the popover ABOVE the DialogHeader at
//       y=-326 — entirely offscreen. Switched to `top-full` so it
//       opens below the strip, fully inside the viewport.
//
//   Files changed:
//     src/pages/ChatPage.tsx               — min-w-0/min-h-0 on two-pane + right pane; dvh→vh in wrapper height
//     src/pages/chat/ChatView.tsx          — min-w-0/min-h-0 on outer column flex
//     src/pages/chat/MessageList.tsx       — min-h-0 on scroller
//     src/pages/chat/ResidentChatView.tsx  — dvh→vh in wrapper height
//     src/pages/chat/QuickReplies.tsx      — TemplatesPicker bottom-full → top-full
//
//   Behaviour preserved:
//     - v111 BottomBar hide rule (modalStore-driven) untouched.
//     - v112 RoleBadge polish untouched.
//     - v113 wrapper-margin fix untouched.
//     - Resident view (ResidentChatView) untouched.
//     - AdminChannelList untouched.
//     - Phase 1 v104 / Phase 2 v107-v112 visuals untouched.
//
// Previous notes (v113) preserved below:
// Version: 3.7.59 — cache suffix bumped to v113 to evict every v112 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Admin chat dialog — root-cause fix for left-edge clipping
//     (residual bug from v111's cosmetic padding bump):
//     - ChatPage's admin-view wrapper dropped `-mx-4 -mt-4`. Those
//       classes were designed for a host page that paints px-4/pt-4
//       gutters, but the same component's useEffect (plus the
//       `.chat-active { padding: 0 !important }` CSS rule in
//       index.css) already zeroes #main-content's padding while chat
//       is open. With parent padding=0, `-mx-4` became a pure -16px
//       shift that pushed the wrapper PAST the left viewport edge.
//       Avatars and bubbles sat flush against (and on iPhone, were
//       clipped by) the screen rail. Desktop md:rounded-[22px] +
//       md:shadow-sm + md:border layout unchanged — those classes
//       are unaffected, and on desktop main-content keeps its
//       normal padding.
//     - MessageList reverted px-4 sm:px-3 → px-3. The v111 mobile
//       bump was buying back what -mx-4 stole; with the wrapper now
//       at margin 0 the designed 12px gutter is correct again,
//       and the extra 4px on each side was narrowing the bubble
//       max-width.
//
//   Files changed:
//     src/pages/ChatPage.tsx               — admin wrapper className
//     src/pages/chat/MessageList.tsx       — revert to px-3
//
//   Behaviour preserved:
//     - v111 BottomBar hide rule (modalStore-driven) untouched.
//     - v112 RoleBadge polish untouched.
//     - Resident-view loading + error wrappers in ChatPage still use
//       -mx-4 -mt-4 (they have the same bug but are transient ~1s
//       states, intentionally left for a follow-up if needed).
//
// Previous notes (v112) preserved below:
// Version: 3.7.58 — cache suffix bumped to v112 to evict every v111 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • RoleBadge polish (chat message header):
//     - Emoji prefix dropped (🤴 / 👤 / 👑 / 🔧 / 📞 / etc. read as
//       toy/casual on a professional B2B SaaS surface).
//     - Per-role bright pill (bg-rose-50 + text-rose-700 etc.) replaced
//       with a neutral themed pill: rounded-full px-2 py-0.5,
//       bg-stone-100/stone-800 + text-stone-700/stone-300 (light + dark).
//     - Role is still scannable via a 6px colored dot prefix taken from
//       the existing per-role hue (purple/orange/violet/amber/blue/green/
//       yellow/indigo/rose/pink/cyan/slate/emerald-500).
//     - Label shrunk to text-[10px] uppercase tracking-wide so the
//       sender name + badge fit on a single line in narrow admin/
//       resident chat columns without truncation.
//     - 13 roles preserved verbatim, RU + UZ labels preserved.
//     - "First message in same-author run" render rule untouched
//       (MessageBubble unchanged).
//
//   Files changed:
//     src/pages/chat/RoleBadge.tsx       — full rewrite of the badge body
//
//   Behaviour preserved:
//     - v111 admin-chat-dialog mobile fixes (BottomBar hide,
//       MessageList px-4 sm:px-3).
//     - All earlier visuals (v104/v107/v108/v109/v110).
//
// Previous notes (v111) preserved below:
// Version: 3.7.57 — cache suffix bumped to v111 to evict every v110 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Admin chat dialog mobile fixes (Capacitor APK + PWA):
//     - Floating tab bar (Главная/Заявки/…/Профиль) now HIDES when an
//       admin/manager/director opens a conversation on mobile, the same
//       way it already hid for resident roles. Implementation reuses the
//       existing useModalPresence hook → modalStore.count → BottomBar's
//       `modalCount > 0` early-return; no new conditional in BottomBar
//       itself. On the list view the bar stays visible (admins navigate
//       between channels there); on desktop nothing changes (no bar).
//       Back button pops the channel, useModalPresence cleanup runs,
//       bar restores. Telegram/WhatsApp/iMessage UX.
//     - MessageList px-3 → px-4 sm:px-3. The 12px container padding
//       was tight on a 412×765 Pixel viewport — combined with
//       MessageBubble's own px-1 row padding the incoming-message
//       avatar's left edge sat ~16px from the screen edge and looked
//       clipped on real-device DPR. 16px container padding on mobile
//       gives the 40px avatar visible breathing room; desktop stays
//       at the original 12px (the two-pane layout has its own left
//       gutter).
//
//   Behaviour preserved:
//     - Resident chat already hid the bar via BottomBar's
//       `/chat + isDirectChatRole` early-return — no change there.
//     - Role badges in the bubble header (RoleBadge.tsx) untouched.
//     - All earlier visuals (v104 Phase 1 cards, v107 Phase 2
//       DialogHeader/DateSeparator/MessageList, v108 InfoDropdown
//       etc., v109 ApiError fix, v110 AdminChannelList density)
//       remain.
//
//   Files changed:
//     src/pages/ChatPage.tsx              — useModalPresence + useIsMobile
//     src/pages/chat/MessageList.tsx      — px-4 sm:px-3 mobile padding
//
// Previous notes (v110) preserved below:
// Version: 3.7.56 — cache suffix bumped to v110 to evict every v109 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • AdminChannelList mobile-density refactor. The Phase 1 v104 visuals
//     (segmented filter, left-border active row, brand-dark unread
//     timestamp) all preserved, but every vertical-spending element
//     trimmed for mobile. Net effect on a 412×765 Pixel viewport: the
//     header + segmented + search block goes from ~190px down to ~120px
//     (header h2 17px instead of 18, mb-3 → mb-1.5 between rows,
//     dropped 'Обращения жителей' subtitle, search py-2 → py-1.5).
//
//     ChatCard row goes from ~110px down to ~70px:
//     - row padding px-4 py-3.5 → px-3 py-2.5
//     - LocationBadges collapsed from 3 colored pills (branch + building
//       + apt — ~26px extra height) into a single muted text line
//       'Building · Apt' (drops the 'branch' badge entirely since it's
//       redundant with the branch-tab filter row above, or with the
//       building when one branch has one building).
//     - All other elements (46px avatar, name, time, preview) unchanged
//       per the Phase 1 v104 contract.
//
//     Header now uses `sticky top-0 z-10 bg-white safe-area-top` so it
//     stays pinned during list scroll AND respects iOS PWA / Capacitor
//     overlaysWebView=true safe-area top inset. .safe-area-top is a
//     new utility class in index.css that adds padding-top:
//     env(safe-area-inset-top, 0px) — no-op on Chrome browser tab and
//     Capacitor overlaysWebView=false (the env() returns 0).
//
//   Behaviour preserved verbatim:
//     - Phase 1 v104: 3px left border on active row, brand-dark
//       text-orange-700 timestamp on unread, segmented filter with both
//       sides visible (Новые disabled when count=0).
//     - Phase 2 v107: DialogHeader, DateSeparator, MessageList.
//     - Phase 2 v108: InfoDropdown, TemplatesPicker, ActiveRequestBanner.
//     - Sprint 84 v109: ApiError cross-tenant fix, Layer 2 store guard.
//     - ResidentChatView.tsx — NOT in diff.
//     - Tenant isolation, WebSocket subscriptions, image markdown v81.
//
//   Files changed:
//     src/index.css                                — +9 lines, .safe-area-top
//     src/pages/chat/AdminChannelList.tsx          — header + segmented + search
//                                                    + ChatCard padding + LocationBadges
//
// Previous notes (v109) preserved below:
// Version: 3.7.55 — cache suffix bumped to v109 to evict every v108 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • SECURITY FIX (Sprint 84): cross-tenant QR pass bypass via the
//     scanner's offline-fallback catch block. Backend has been correct
//     since v93 — POST /api/guest-codes/validate returns 403 with
//     {valid:false, error:'cross_tenant', message:'...другой УК...'}
//     and writes a security_audit_log row when a guard from УК A
//     scans a pass from УК B. But the frontend's apiRequest throws on
//     ANY non-2xx, and the GuardQRScannerPage catch block fell through
//     to validateGuestAccessCode (in guestAccessStore) which decodes
//     the GAPASS payload locally with NO tenant awareness and returns
//     {valid:true}. Result: GREEN "Доступ разрешён" for a foreign-
//     tenant pass on every cross-tenant scan. Reproduced end-to-end
//     against api.kamizo.uz in the diagnostic step before this fix.
//
//   Two-layer defense:
//
//     LAYER 1 — distinguish server-rejected from network-failed.
//       services/api/client.ts: new ApiError class extends Error,
//       carries status + body. apiRequest throws ApiError(message,
//       status, data) instead of plain Error on every non-2xx. Old
//       call sites that just read err.message are unchanged (ApiError
//       IS an Error; .message still works). Exported from the api
//       barrel for the discriminator.
//
//       pages/GuardQRScannerPage.tsx: catch block first checks
//       err instanceof ApiError && err.status>=400 && <500. If yes →
//       the server gave a definitive 4xx; we map err.body.error to a
//       UI status (cross_tenant → red banner, etc.) WITHOUT falling
//       through to offline validation. The catch only reaches the
//       client-side validateGuestAccessCode path for genuine network
//       failures (offline / DNS / 5xx without JSON / timeout).
//
//     LAYER 2 — refuse offline validation for the security role.
//       stores/guestAccessStore.ts validateGuestAccessCode: reads the
//       current user role from uk-auth-storage (avoids a require
//       cycle with api/client). If role === 'security', returns
//       {valid:false, error:'offline_not_allowed_for_security'}
//       BEFORE decoding the GAPASS payload. Even if Layer 1 ever
//       misses a path, a guard cannot offline-admit any pass — they
//       must reach the server (which has the tenant check). The
//       scanner UI maps this error to a yellow/orange "Нет связи с
//       сервером. Свяжитесь с диспетчером." banner with no allow-
//       entry button.
//
//   Verified end-to-end after deploy: same setup (myhelper guest
//   pass scanned by moon security guard) now correctly returns the
//   server's 403 cross_tenant response in the UI catch handler, the
//   UI red-banners the attempt, and there is NO allow-entry button.
//   Same-tenant happy path still works (moon guard scanning a moon
//   pass returns 200 + green + allow-entry). Wrong-password login
//   still surfaces the auth-error message (ApiError.message survives
//   all the way to the LoginPage error display).
//
//   No backend changes. No GAPASS token format change (would require
//   re-issuing every existing token). No other guest-pass routes
//   touched. ResidentChatView, AdminChannelList, Phase 2 chat work
//   all untouched.
//
// Previous notes (v108) preserved below:
// Version: 3.7.54 — cache suffix bumped to v108 to evict every v107 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Phase 2 / commit 3 (PARTIAL) of the admin chat DialogPanel
//     rewrite — InfoDropdown overlay + Templates picker. Two of the
//     three commit-3 surfaces ship in this commit; the Composer
//     auto-grow textarea + plus-icon attach menu is deliberately
//     deferred (the existing ChatComposer.tsx works correctly; an
//     auto-grow textarea has subtle pitfalls — IME composition, multi-
//     line paste, height collapse on send — that warrant their own
//     dedicated commit + test cycle).
//
//     NEW: pages/chat/InfoDropdown.tsx — full resident-context overlay
//     triggered by the info-button on DialogHeader. Replaces the
//     v107-pre inline info dropdown (name + type + message count) with
//     the v2 design's structure: avatar+name+house+apt+branch header,
//     tap-to-call phone row when channel.phone is exposed, linked-
//     requests list when channel.requests is exposed, and a 4-row
//     action stub (Профиль жителя navigates to /admin/residents/:id;
//     the other three — Назначить сотрудника / Пометить решённым /
//     Закрыть обращение — are disabled placeholders for a Phase 3
//     follow-up that needs the matching backend mutations). Channel
//     fields are read defensively so missing API data degrades the
//     card gracefully.
//
//     pages/chat/QuickReplies.tsx — added TemplatesPicker. A trailing
//     "+" button at the end of the inline-replies row opens a popover
//     with 7 hardcoded templates (chat-spec.md §4.4 list). Tapping a
//     template inserts it into the composer for edit-then-send —
//     same edit-before-send convention as the 5 inline replies, no
//     auto-send. Templates are static in code; per-tenant editable
//     templates are deferred to Phase 3 (chat-spec.md §4.4 — needs
//     per-tenant config + an editor modal + storage).
//
//     pages/chat/DialogHeader.tsx — info-button now opens the new
//     InfoDropdown overlay. Adds onCloseInfo prop so the overlay's
//     backdrop click can close it. Drops the inline dropdown's
//     CHAT_CHANNEL_LABELS dependency (which moved into ChatView's
//     getSubtitle path; no functional change).
//
//     pages/chat/ChatView.tsx — passes onCloseInfo={() => setShowInfo
//     (false)} to DialogHeader.
//
//   • Composer auto-grow + plus-icon attach menu DEFERRED. Will land
//     as commit 3b once we have time for a focused IME/paste/height
//     test pass.
//
//   • Pre-push gate: tsc -p tsconfig.app.json --noEmit | grep -E
//     'TS2304|TS2552' → empty, npm run build → ✓ built in 10.51s.
//
//   Behaviour preserved verbatim:
//     - Tenant isolation (chatApi paths unchanged)
//     - WebSocket subscriptions for realtime new-message + read-receipt
//     - Image markdown v81 (MessageBubble not touched)
//     - Existing message data model
//     - Resident chat (ResidentChatView.tsx) — UNTOUCHED
//     - AdminChannelList.tsx (Phase 1 v104) — UNTOUCHED
//     - MessageList (commit 1) — UNTOUCHED
//     - DialogHeader (commit 2) avatar/title/subtitle/search-toggle —
//       UNCHANGED; only the info-button click target swapped
//     - ChatComposer.tsx (existing input + emoji + paperclip + send) —
//       UNCHANGED, deferred to a separate commit
//
// Previous notes (v107) preserved below:
// Version: 3.7.53 — cache suffix bumped to v107 to evict every v106 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Phase 2 / commit 2 of the admin chat DialogPanel rewrite —
//     DialogHeader + ActiveRequestBanner. ChatView.tsx's 100+ line
//     inline header markup (back arrow + avatar + title + subtitle +
//     search-toggle + info-button + inline info dropdown) is extracted
//     to pages/chat/DialogHeader.tsx — a structural lift, not a
//     redesign. One behavioural tweak: admin-side staff viewing a
//     private-support channel with no resident-context subtitle now
//     gets the "на связи · отвечаем до 15 мин" copy (mirrors v2
//     design's operator surface). All other behaviour byte-for-byte:
//     same avatar gradient family, online dot for resident side, same
//     search+info toggles, same inline info dropdown content.
//
//     NEW: pages/chat/ActiveRequestBanner.tsx — inline strip under the
//     header when channel has a linked active request (per chat-spec.md
//     §3.1 active_request_id). Currently no API row populates the
//     field, so the banner stays hidden in production; component is
//     forward-compat — when the backend adds active_request_id +
//     request data to the channel response, the banner activates
//     automatically. Click navigates to /admin/requests/:id. Type
//     ActiveRequest defines { id, description?, status? }. Reads field
//     defensively via cast: (channel as ChatChannel & { active_request?
//     }).active_request — no ChatChannel type change in this commit.
//
//   • CI gate caught one regression in pre-push: dropped
//     CHAT_CHANNEL_LABELS import while line 356 still references it.
//     Pre-push tsc -p tsconfig.app.json | grep "TS2304|TS2552" flagged
//     in 200ms; one-character fix restored. Same trap as v106 but
//     caught locally this time. The pre-push gate (running CI's exact
//     filter) is now the standard for the remaining Phase 2 commits.
//
//   • Backup: backup/phase2-pre-rewrite-20260616-122240 pre-dates
//     commit 1; v106 in main is the last known-good intermediate.
//
//   Behaviour preserved verbatim:
//     - Tenant isolation (chatApi paths unchanged)
//     - WebSocket subscriptions (subscribeToChatMessages unchanged)
//     - Image markdown v81 (MessageBubble not touched)
//     - ResidentChatView.tsx untouched
//     - AdminChannelList.tsx untouched
//     - MessageList from commit 1 unchanged
//
// Previous notes (v106) preserved below:
// Version: 3.7.52 — cache suffix bumped to v106 to evict every v105 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Phase 2 / commit 1 of the admin chat DialogPanel rewrite — message
//     rendering decomposition. The inline message-render block in
//     ChatView.tsx (loading spinner, empty state, and the messages.map
//     producing date separators + per-message bubbles) is extracted into
//     three new files under pages/chat/:
//
//       MessageList.tsx    — owns the loading/empty/map orchestration,
//                            reads messages from props
//       DateSeparator.tsx  — the centered date pill above each new day's
//                            run (extracted byte-for-byte from inline)
//       SystemChip.tsx     — NEW. Centered system-event pill for future
//                            chat-spec.md §3.2 system messages
//                            (sender_role='system'). Currently no API
//                            produces such messages; MessageList already
//                            knows how to switch on it so the future
//                            backend change is a one-line surface.
//
//     Behaviour is identical to v105 by construction:
//       - Same loading/empty branches and copy
//       - Same date-key memoisation (y-m-d local time)
//       - Same per-message search-match / current-match calculation
//       - Same MessageBubble props + isOwn / showSender derivation
//       - Same messagesContainerRef / messagesEndRef DOM topology (refs
//         still owned by ChatView so the existing scroll-to-bottom +
//         scroll-to-search-match useEffects work unchanged)
//       - Same warm-gradient background style
//     Resident chat (ResidentChatView.tsx) untouched.
//     AdminChannelList.tsx untouched.
//     No new CSS tokens. No design migration in this commit — pure refactor.
//
//   • Backup branch before this wave: backup/phase2-pre-rewrite-
//     20260616-122240 (pushed). Commit-2 (DialogHeader + ActiveRequest-
//     Banner) and commit-3 (Composer + InfoDropdown + Templates picker)
//     are gated behind user confirmation after commit-1 verifies.
//
// Previous notes (v105) preserved below:
// Version: 3.7.51 — cache suffix bumped to v105 to evict every v104 (and
// older) cache on the next SW lifecycle update. This release ships the
// Phase 2 (PARTIAL) of the admin chat redesign against the v2 design
// bundle (CcgCOhkNYkJE0bRGRP-aPQ — archived under docs/design-bundle-
// admin-chat/v2/). Two targeted visual swaps that match the v2 design's
// EmptyDesktop + quick-replies pill row without rewriting the full
// DialogPanel (which remains deferred):
//
//   1. Desktop empty state (ChatPage.tsx, admin/manager view). Was a
//      80×80 orange-50 tile with text-gray-500 headline; now matches
//      the v2 design EmptyDesktop component verbatim — 76×76 white
//      tile with brand-orange icon + 16px/extrabold headline "Выберите
//      диалог из списка" + 13px helper "Слева — обращения жителей.
//      Непрочитанные подняты наверх." capped at 280px width and
//      centered. Resident view empty state untouched.
//
//   2. QuickReplies pill row (QuickReplies.tsx). Was bright bg-orange-
//      50/50 strip with bg-white border-orange-200 pills; now neutral
//      themed strip (no background) with bg-white border-gray-200
//      pills, matching the v2 design's quick-reply row that blends
//      into whatever surface sits behind. Pill copy unchanged, tap-
//      to-fill-composer behaviour unchanged (operator still edits the
//      placed text before sending — design intent confirmed).
//
// Phase 2 STILL DEFERRED (see docs/design-bundle-admin-chat/v2/README.md):
//   - DialogPanel header rewrite (avatar + house+apt + search + info)
//   - In-chat search overlay with ↑↓ nav between matches
//   - Message bubble redesign (gradient outgoing + operator author label)
//   - System chips (centered request-state pills)
//   - Templates editor modal
//   - Composer auto-grow textarea + plus-icon attach menu
//   - Info dropdown (resident profile + linked requests + actions)
// Phase 3 (backend + frontend):
//   - Internal notes (yellow operator-only bubbles)
//   - Persisted quick-reply templates per-tenant
//
// All wiring (tenant isolation, WebSocket polling, image markdown v81,
// existing message data model) unchanged. Resident view untouched.
// Phase 1 list-panel visuals from v104 unchanged.
//
// Previous notes (v104) preserved below:
// Version: 3.7.50 — cache suffix bumped to v104 to evict every v103 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Admin chat list (AdminChannelList.tsx) — Phase 1 of the Anthropic
//     design migration. Three focused visual swaps that match the
//     operator-inbox design (kamizo/project/kamizo-admin-chat.jsx):
//     1. Active conversation row — 3px brand-orange LEFT border (was
//        2px RIGHT) so the eye reads the active card in LTR order
//        before reaching the row text. paddingLeft is reduced by 3px
//        so the row content stays aligned across active/inactive rows.
//     2. Timestamp tint when unread — text-orange-700 (one step deeper
//        than the previous text-orange-600) so the time reads as a
//        status accent on the same brand family as the row indicator.
//     3. "Все / Непрочитанные" filter — migrated from two free-standing
//        pills to a single segmented control on a bg-stone-100 (var
//        --surface-sunken) track with bg-white pills + shadow-sm on the
//        selected side. role="tablist" + aria-selected for keyboard /
//        screen-reader users. Unread side disables when count is 0
//        instead of hiding (less layout shift). Brand-orange dot stays
//        for the unread side, used only when there's an actual count.
//   The dialog panel + composer + system request chips + internal-notes
//   surface + in-chat search are deferred to Phase 2 (the design's
//   kamizo-admin-dialog.jsx + the chat-spec.md additions). All wiring,
//   tenant isolation, WebSocket subscription, image markdown rendering,
//   message data model unchanged. Resident chat untouched.
//
// Previous notes (v103) preserved below:
// Version: 3.7.49 — cache suffix bumped to v103 to evict every v102 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • iOS PWA status-bar dark-mode determinism. v98 wired the iOS
//     status-bar fix using `apple-mobile-web-app-status-bar-style =
//     "black-translucent"` for dark, "default" for light. That worked
//     when the webview painted dark-mode content right up to y=0, but
//     "black-translucent" is a TRANSPARENT overlay — any momentary
//     light content under it bleeds through and the user sees a literal
//     white status bar. Switched to `"black"` (solid black bar + light
//     icons) so the bar is deterministic regardless of webview state.
//     Slight 1-tone visual seam between pure black bar and the warm-
//     black #1A1612 page surface is acceptable; users care about
//     light-bar-in-dark-app far more than that delta. Three sites
//     changed in lockstep so first-launch + live-toggle + native-shell
//     all agree:
//
//       1. index.html pre-paint script — sets meta to "black" when
//          stored theme is dark, BEFORE React mounts. iOS reads the
//          meta only at PWA launch, so this is the load-bearing path.
//       2. themeStore.ts applyTheme — flips meta to "black" on live
//          toggle (only some iOS contexts honour live changes, but
//          the meta also matches the next-launch state).
//       3. Doc comments in both files updated so the next person who
//          touches this finds the "why black, not black-translucent"
//          rationale right next to the literal.
//
//     No Capacitor / plugin changes needed — @capacitor/status-bar was
//     already wired in v98 and uses Style.Dark (= light icons) on dark
//     which is independent of the meta strategy. Android theme-color
//     path is unchanged (Android reads theme-color, not the iOS meta).
//
// Previous notes (v102) preserved below:
// Version: 3.7.48 — cache suffix bumped to v102 to evict every v101 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Switch component consolidation. Seven hand-rolled inline toggles
//     scattered across the codebase (all `<button>/<input type=checkbox>
//     + nested <span> with translate-x animation` markup) are migrated
//     to the canonical `<Switch>` from components/ui/Switch.tsx — the
//     same one that ships v100 geometry (52×28 track, 26×26 knob,
//     1px pad) and the brand-orange/warm-stone tokens. After this
//     pass, every on/off switch in the SPA renders at the same size
//     ("одинаковую везде"). Migrated:
//
//     1. pages/guest-access/CreatePassForm.tsx:351 — "Приедет на авто?"
//        on resident guest-pass Step 3 (user-reported as the visibly
//        smaller pill, w-11 h-6 = 44×24 vs the v100 52×28).
//     2-5. pages/AdvertiserDashboard.tsx:930/952/974/1001 — the four
//        ad-badge toggles (Recommended / Новинка / Горячее / Проверено).
//        The per-badge accent colour (primary / green / red / sky)
//        moves to the icon bubble on the left of each row; the toggle
//        itself goes orange-on-stone to match every other switch in
//        the app — the icon already carries the badge identity.
//     6. pages/admin/components/AdsTab.tsx:483 — tenant-enabled
//        toggle inside the AssignToTenants modal.
//     7. pages/admin/components/DashboardTab.tsx:370 — "Coming Soon"
//        banner toggle (useful-contacts / marketplace) inside the
//        super-admin tenant detail.
//
//     All seven preserve the existing `checked`/`onChange` semantics
//     verbatim — pure visual swap. Row-click UX preserved by wrapping
//     the migrated toggle rows in `<div onClick={…}>` (was `<label>`);
//     Switch's own `stopPropagation` prevents double-toggle. No new
//     props added to Switch, no behaviour change for the existing
//     consumers (ThemeToggle, AdminDashboard ad toggle, trainings
//     notification toggle), no `size="sm"` usages anywhere in the
//     project (verified — every <Switch /> renders the default md).
//
//   Light mode: every migrated row now shows the v100 chunky-pill
//   shape instead of the older smaller variant — intended change. No
//   other visual deltas, no behaviour deltas.
//
// Previous notes (v101) preserved below:
// Version: 3.7.47 — cache suffix bumped to v101 to evict every v100 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • QR pass modal (pages/guest-access/QRCodeDisplay.tsx) dark mode.
//     Modal shell was a literal `bg-white` div — stayed white under
//     html.dark while every `text-gray-500/700` label inside flipped to
//     light beige via the existing text-color safety net (index.css
//     L374-L380), leaving labels invisible on the still-white card.
//     Fix: swap the shell class for the canonical `.modal-content`
//     (v96 themed shell). One class swap rethemed every label + the
//     title without a single per-element edit. QR canvas wrapper stays
//     `bg-white` with a comment (scanner-required artifact).
//   • Resident Пропуска page (pages/ResidentGuestAccessPage.tsx) dark
//     mode. The const block at the top shipped raw hex literals
//     (TEXT_PRIMARY = '#1C1917' etc) which were applied inline and
//     never themed, and the sticky header background was a literal
//     rgba(244,240,232,0.92) — producing the half-themed "light strip on
//     top of dark page" the user reported. Each const now reads through
//     var(--themed-*, hex-fallback) per DESIGN.md root-cause #3; the
//     sticky-header background uses the existing `--themed-strip-bg`
//     token (was already defined under html.dark from the chat-strip
//     task, just had to be plugged in here). Light mode is byte-identical
//     since every var() fallback IS the previous literal hex.
//   • Resident pass hero (pages/guest-access/LatestPassHero.tsx) had a
//     duplicate "истёк" indicator — the left status pill ("● Истёк") and
//     the right time-left text ("истёк") both showed the same word for
//     non-active passes. The right text is now hidden unless the pass is
//     ACTIVE (when it conveys "действует ещё N мин/ч", which is genuinely
//     useful info the pill doesn't have). Pill stays. No layout change
//     beyond the conditional render.
//   • DESIGN.md gets two new root-cause families documented (sticky
//     headers + per-page const blocks of raw hex; `.modal-content` vs
//     `bg-white` modal shell) with the QR modal + Passes header as
//     before/after examples so the next person hitting this trap finds
//     the fix prescription instead of re-discovering the pattern.
//
// Previous notes (v100) preserved below:
// Version: 3.7.46 — cache suffix bumped to v100 to evict every v99 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Switch geometry actually applies. v99 reshaped the DIMS table in
//     components/ui/Switch.tsx to 52×28 (md) / 40×22 (sm), but a global
//     mobile tap-target rule at index.css:1826-1832 — `button:not(.icon-
//     only) { min-height: 44px; min-width: 44px }` inside `@media (max-
//     width: 768px)` — silently overrode the inline `height: 28px` to
//     44px on every phone-sized viewport. The Switch rendered 52×44
//     with the 26×26 knob anchored top-left instead of vertically
//     centered. Live CDP measurement on the emulator's WebView confirmed
//     this: inline 28px, computed 44px, min-height 44px. Fix is a narrow
//     exemption inside the same media query — `.kz-switch { min-height:
//     auto; min-width: auto }` AFTER the global rule so cascade lets the
//     inline values win for this single component. Every other button
//     keeps the 44px tap-target floor unchanged.
//
// Previous notes (v99) preserved below:
// Version: 3.7.45 — cache suffix bumped to v99 to evict every v98 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Switch component reshape to match the reference design. ONLY the
//     DIMS table in components/ui/Switch.tsx was touched — colors,
//     tokens (--switch-on-bg / --switch-off-bg / --switch-knob /
//     --switch-knob-shadow), the brand-orange focus ring, the
//     html.dark OFF-track override, and the API (checked / onChange /
//     ariaLabel / disabled / size) are all unchanged. Geometry:
//       md: 44×24 + knob 20 + pad 2  →  52×28 + knob 26 + pad 1
//       sm: 36×20 + knob 16 + pad 2  →  40×22 + knob 20 + pad 1
//     New knob/trackH ratios are 0.929 (md) and 0.909 (sm) so the
//     white knob nearly fills the orange/gray pill — visually dominant
//     instead of swimming. Aspect ratios stay inside the requested
//     1.8–2.0 band (1.86 md, 1.82 sm). Every consumer of the shared
//     <Switch> — ThemeToggle (Тёмная тема on resident / admin / staff
//     profile), every settings row that uses the canonical control —
//     inherits the new look automatically. No call-site changes.
//
// Previous notes (v98) preserved below:
// Version: 3.7.44 — cache suffix bumped to v98 to evict every v97 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • iOS PWA + native Capacitor dark-mode status-bar fix. Before v98
//     the OS status-bar zone stayed white in dark mode on iPhone PWA
//     and on the native Capacitor app: applyTheme() flipped only
//     <meta name="theme-color">, which Android Chrome honours but iOS
//     PWA ignores in standalone mode. v98 wires three more surfaces in
//     lock-step with the theme toggle:
//       1. <meta name="apple-mobile-web-app-status-bar-style"> flips
//          "default" ⇄ "black-translucent" so the dark surface paints
//          continuously up to the notch with light system icons. The
//          pre-paint script in index.html mirrors the value based on
//          stored theme so the FIRST launch of a dark-mode user is
//          already correct (iOS reads this meta at PWA-launch time).
//       2. Capacitor StatusBar plugin (@capacitor/status-bar@^8.0.0,
//          newly added) is called from applyTheme via a guarded dynamic
//          import: Style.Dark+setBackgroundColor(#1A1612) for dark,
//          Style.Light+setBackgroundColor(#F4F0E8) for light. The
//          plugin is no-op on web (Capacitor.isNativePlatform() guard).
//       3. capacitor.config.ts StatusBar block kept as the BOOT floor
//          (light values) — runtime applyTheme overrides immediately
//          on first JS frame.
//     The Style.Dark = LIGHT icons inversion is documented twice (in
//     themeStore.ts and capacitor.config.ts) so the next person to
//     touch this doesn't re-discover the trap.
//
// Previous notes (v97) preserved below:
// Version: 3.7.43 — cache suffix bumped to v97 to evict every v96 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Removed the "Пользователи" tab from the super-admin panel
//     (SuperAdminDashboard). The tab listed every user across every
//     tenant WITH stored credentials (login, role, phone, branch) and
//     fetched them from GET /api/super-admin/users. The endpoint had
//     already stripped password_hash in Sprint 71/P1-F4, but the
//     cross-tenant credential listing surface itself remained an open
//     audit finding (one super-admin browser window = every login on
//     every UK on screen). With the tab gone the corresponding route
//     in cloudflare/src/routes/super-admin.ts is deleted too; tenant
//     listing + "Войти в админку УК" + analytics + ads + banners stay
//     intact. Cache bump is the eviction signal so existing PWAs
//     drop the v96 bundle that still contained UsersTab.
//
// Previous notes (v96) preserved below:
// Version: 3.7.42 — cache suffix bumped to v96 to evict every v95 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Dark-mode pass 3 (Commit A + Commit B in one wave):
//     - Modal shell — `.modal-content` (used by Create-Request,
//       request-detail and assign-executor modals) now flips under
//       html.dark instead of staying rgba(255,255,255,0.95). Closes the
//       user-reported "labels invisible in dark Создать заявку modal"
//       plus #32 + #33 in one CSS rule.
//     - Pill-family Tailwind safety-net extended: `primary-50/100/200`,
//       `border-primary-100/200/300/400` now have dark equivalents.
//       Fixes the selected-pill bug on MeetingCreateModal format pill,
//       AnnouncementsPage target-type pills, and StaffProfilePage
//       language switcher.
//     - Icon/chip Tailwind safety-net extended:
//       slate/indigo/emerald/pink/rose/purple/cyan/teal/violet/sky/
//       lime/stone + gray-200 + white/{10,15,20,30,60} + gray-50/60.
//       Fixes staff-profile role icon chips, manager dashboard
//       refresh button, manager team action cluster (#19 + #24 share
//       the .btn-secondary class, now themed), manager chat-list "1
//       диалог" stripe, security passes filter button, executor
//       request date chip — all in one block of rules.
//     - .btn-secondary CSS class has a new `html.dark` override so
//       every secondary button across the app (dashboard refresh,
//       team page action cluster, residents action row, super-admin
//       pages) themes consistently.
//   • Added DESIGN.md at the repo root documenting the three root
//     causes that recur (modal shells, pill-family safety-net gaps,
//     per-component const blocks of hardcoded hex). New PRs should
//     check it before adding light backgrounds.
//   • Light mode is byte-identical for every change — every dark rule
//     is scoped under html.dark, no light selectors touched.
//
// Previous notes (v95) preserved below:
// Version: 3.7.41 — cache suffix bumped to v95 to evict every v94 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Dark-mode drawer fix: the manager / staff slide-over drawer
//     (Sidebar.tsx line 1026+ branch, rendered via the .sidebar /
//     .sidebar-item CSS classes in index.css) shipped a hardcoded
//     `linear-gradient(180deg, #faf8f6 0%, #ffffff 40%)` background
//     and `color: #4b5563` for nav items. v85's Tailwind safety-net
//     and v92's --themed-* tokens didn't catch this because the
//     styles live on raw CSS class rules. v94's audit misclassified
//     Sidebar.tsx — it only saw the RESIDENT drawer's TEXT_ON_DARK
//     literal (a dark hero gradient header inside the same file) and
//     assumed "text on dark accent". The staff drawer branch was
//     missed. Fix: html.dark overrides added inline next to the
//     existing .sidebar rules — panel gradient flips to the warm-dark
//     family, border + box-shadow deepen, .sidebar-item text reads
//     light, hover surface lifts to a faint warm-white tint, active
//     row keeps the brand-orange accent (.sidebar-item.active uses
//     rgba(var(--brand-rgb), 0.18) for the tint). Light mode is byte-
//     identical (every property is scoped under html.dark only).
//
// Previous notes (v94) preserved below:
// Version: 3.7.40 — cache suffix bumped to v94 to evict every v93 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Dark-mode pill fix: SELECTED pill / chip toggles on
//     ResidentAnnouncementsPage and ResidentUsefulContactsPage rendered
//     invisible in dark mode (beige bg + beige text). Root cause:
//     after the v92 themed-token pass, INK = var(--themed-text-primary)
//     correctly flipped from dark to light beige under html.dark — but
//     the text color was a literal '#F4F0E8' (same light beige), so
//     the pill became "beige on beige". Per spec, the SELECTED pill's
//     beige bg in dark mode IS the intended highlight; only the text
//     needed to invert. Introduces --themed-pill-fg (= #1C1917 under
//     html.dark, undefined in :root so the existing `#F4F0E8`
//     fallback wins in light mode — light is pixel-identical).
//     UNSELECTED pills (which use --themed-surface[-sunken] +
//     --themed-text-secondary) are unaffected.
//
// Previous notes (v93) preserved below:
// Version: 3.7.39 — cache suffix bumped to v93 to evict every v92 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Tenant isolation for the QR pass scanner. Backend /api/guest-codes/
//     validate + /:id/use now do a 2-stage lookup: SELECT * WHERE id = ?
//     (unfiltered), and if the row exists but its tenant_id differs from
//     the scanning staff's tenant_id, return HTTP 403 with
//     {error:'cross_tenant', message:'Пропуск принадлежит другой УК.
//     Доступ запрещён.'} — no foreign-tenant name or PII leaked. The
//     guest_access_logs row is action='denied_cross_tenant' and a parallel
//     row lands in the new security_audit_log table for ops review.
//     Frontend GuardQRScannerPage handles the new error code: the result
//     overlay still uses the red-icon "denied" pattern; the message is
//     the bilingual "wrong УК" text; the Allow-entry button is
//     suppressed (it only renders for status='success'); no visitor card
//     renders (server doesn't return code details for this branch).
//     Helpers: recordBelongsToCaller() + auditCrossTenantAttempt() added
//     to middleware/tenant.ts so future routes have a one-liner to call.
//
// Previous notes (v92) preserved below:
// Version: 3.7.38 — cache suffix bumped to v92 to evict every v91 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Dark-mode pass 2: four resident surfaces that shipped their own
//     hardcoded design-token const block at the top of the file
//     (RequestDetailsModal, ResidentAnnouncementsPage,
//     ResidentContractPage, ResidentMeetingsPage) now flip to the
//     warm-dark palette under html.dark. Root cause: each file
//     declared `const SURFACE = '#FFFFFF'`, `const TEXT_PRIMARY =
//     '#1C1917'`, etc., as literal hex — bypassing the global CSS
//     vars + the Tailwind safety-net. Fix mirrors the v85
//     ResidentProfilePage pilot pattern: every const now reads
//     through `var(--themed-…, <literal-light-hex>)`, with a shared
//     --themed-* family defined ONLY under html.dark in index.css so
//     light mode is byte-identical (fallback always wins). New
//     accent-hero token pair (--themed-accent-hero-bg / -text) gives
//     the "intentionally dark" ResidentContractPage hero card a
//     slightly lifted warm-dark in dark mode so it doesn't collapse
//     into the dark page bg. Sticky-header rgba(244,240,232,0.92)
//     strips on Announcements + Meetings flip via --themed-strip-bg.
//     Reschedule-banner amber hex in RequestDetailsModal flips via
//     --themed-amber-*. Global --surface-sunken added (was only
//     scoped to --rpp-* before) so the requests-list segment tab
//     control flips automatically. No JS behaviour change.
//
// Previous notes (v91) preserved below:
// Version: 3.7.37 — cache suffix bumped to v91 to evict every v90 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Revert of the v90 monochrome black/white Switch redesign. The
//     v89 styled Switch (brand-orange track when ON, warm-gray track
//     when OFF, white knob, smooth slide; clearly visible in both
//     light and dark themes) is restored as the canonical control.
//     This is a `git revert` of 30fdfa79 — preserves git history,
//     leaves every v89 call-site (ResidentProfile / StaffProfile /
//     admin/SettingsPage theme toggles, admin/SettingsPage module +
//     notification-channel rows, AdminDashboard platform-ad
//     show-to-residents control, trainings/AdminPanel anonymous-flag
//     settings) untouched at the React level — they re-pick up the
//     v89 visuals automatically because the Switch component file is
//     reverted in place. SW v89 is skipped in the cache namespace
//     because the deployed bundle from v90 already claimed it; v91
//     is the first eviction wave that contains the orange bundle
//     again.
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
const STATIC_CACHE = 'kamizo-static-v143';
const ASSET_CACHE = 'kamizo-assets-v143';
const DYNAMIC_CACHE = 'kamizo-dynamic-v143';
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
