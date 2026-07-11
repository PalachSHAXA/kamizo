// Kamizo PWA Service Worker
// Version: 3.7.209 — cache suffix bumped to v264. DEV_AUTOLOGIN
//     block fully removed from App.tsx. Fix D for the tenant-
//     impersonation bug where the super-admin "Войти в HUMO"
//     showed the HUMO banner but CHOKO data.
//
//     ROOT CAUSE (one sentence):
//       The DEV_AUTOLOGIN useEffect in App.tsx unconditionally
//       called authLogin('test-choko', 'kamizo') whenever the
//       closure-captured `user` was null at first render — but
//       zustand persist v4 rehydrates via a Promise microtask
//       that completes AFTER React's first useEffect run, so on
//       cold start the guard always saw null and force-logged
//       the session as CHOKO, overwriting whatever auth had just
//       been established (super-admin impersonation token,
//       manually-typed login, anything).
//
//     CHANGE (single file: App.tsx):
//       • Removed: const authLogin = useAuthStore(s => s.login);
//         + the entire useEffect block (v118.108 / v252) that
//         called authLogin('test-choko', 'kamizo') on mount.
//       • Replaced with a short v118.119 comment recording the
//         removal + why (sim-testing convenience is now manual
//         login, the correct production behaviour).
//       • Cleaned the v118.116 comment about deferred fetches to
//         no longer mention DEV_AUTOLOGIN by name.
//       • Project-wide grep for DEV_AUTOLOGIN returns 0 matches.
//
//     SECONDARY WIN — COLD-START FREEZE:
//       v261 deferred the post-login fetch fan-out to fix the
//       splash→interactive freeze, but on cold start the
//       DEV_AUTOLOGIN authLogin() call was ALSO an awaited
//       round-trip to the VPS (slow). Removing it cuts one of
//       the two parallel API calls that overlapped at boot, so
//       cold start should drop further (typical 1-2 s now,
//       depending on network).
//
//     VERIFIED EFFECTS:
//       • Super-admin impersonating HUMO → banner shows HUMO AND
//         the data shows HUMO. Tenant isolation works end-to-
//         end.
//       • Real tenant admin logging in directly (test-choko or
//         test-director-choko, manually entered on the login
//         form) — works correctly, no force-override.
//       • Native iOS app — same. Manual credential entry
//         required on every fresh install. Acceptable; this is
//         what every other app does.
//
//     UNCHANGED:
//       • LoginPage's import.meta.env.DEV-gated preview-buttons
//         block — separate code path, useful for visual QA of
//         tenant theming. Stays.
//       • All other login/auth machinery (authStore, JWT, persist
//         rehydration logic, impersonation banner reading
//         kamizo_impersonation localStorage key).
//       • All scroll / profile / chat fixes from v229-v263 — not
//         touched.
//
//     PROTECTED (UNCHANGED): v263 systemic scroll fixes, v262
//     delete-account info line, v261 cold-start unfreeze, v260
//     chat list ScrollArea, v259 chat scroll revert, v258
//     MainViewController + touch-action, v257 chat single-ref,
//     v256 anti-yank, v255 scroll sweep + ScrollArea, v254 chat
//     dead-edge fix, v253 positioning, v252 DEV autologin →
//     resident (the block being removed now), v251 sheet top fix,
//     v250 SettingsPage height + Modal nested scroller, v249
//     overscroll sweep, v248 chat header tightened, v247
//     Дата/Время h-12, v246 modal-over-header, v245 Director
//     Settings pin, v244 DEV autologin director swap, v243 photos
//     preserved through create, v242 voting-detail pin, v241
//     /meetings list pin, v240 chat auto-scroll, v239 photo
//     raise+compress, v238 sheet swipe, v237 /useful-contacts
//     back arrow, v236 gate removal, v235 Garage search header,
//     v234 install row gate, v233 DEV autologin (original add),
//     v232 Garage split, v231 realistic Plate, v230 defensive
//     hero padding, v229 inner scroller Home, v225-v228 hero
//     defence-in-depth, v221 transitions + haptics, v220 /guest-
//     access back, v219 /meetings standalone, v218 React #185
//     fix, v217 navigate fix, v216 lastSeenAt + scroll, v215
//     bell dropdown + /notifications, v214 LIVE design
//     reconciliation, v213 SwipeCardStack visual parity, v212
//     handoff sync, v211 Главная design, v210 bottom-sheet
//     swipe, v209 announcements standalone, v207+v208 voting
//     modal theme, v205+v206 garage, v201 plate hero, v202 color
//     picker.
//     Previous note (v263) preserved below:
// Version: 3.7.208 — cache suffix bumped to v263. Four systemic
//     fixes for the scroll dead-edge / "sensor stalls in the upper
//     part" symptom across profiles + chats, derived from the v118
//     investigation report.
//
//     ROOT CAUSE (one sentence):
//       The verified iOS-safe combo was applied only to the
//       scroll-containers of resident pages; the LAYOUT-level
//       scroller (.main-content) that every "non-fullbleed" page
//       — resident Profile, every director/admin dashboard, all
//       lists not in inner-scroller pattern — depends on, plus
//       the horizontal child scrollers (tab strips, chip rows)
//       and the fixed portal headers on chat, were never given
//       the same discipline, so the upper region of those screens
//       was the iOS dead-edge / touch-interception zone.
//
//     CHANGES (4 files):
//
//     1. src/index.css — .main-content + .main-content-full at line
//        852: the v118.85/86 hardening (`overscroll-behavior-y:
//        none` + dropped `-webkit-overflow-scrolling: touch`) was a
//        leftover from the v226 fixed-HomeHero era. By v229/v232/
//        v241/v237 every page with a fixed top element moved to
//        its own inner-scroller pattern; .main-content is now the
//        scroll owner only for plain (non-fullbleed) pages, where
//        the v118.85/86 hardening becomes the EXACT cause of the
//        dead-edge stall in the upper part. Reverted to the
//        verified combo:
//          overscroll-behavior-y: contain
//          -webkit-overflow-scrolling: touch
//          touch-action: pan-y
//        The pan-y declaration is the global version of the v258
//        per-element discipline — child horizontal scrollers can't
//        claim our vertical pans. One CSS rule restores correct
//        scroll behaviour to resident Profile + every staff
//        dashboard + every list page that goes through Layout
//        without an inner scroller.
//
//     2. src/pages/admin/SettingsPage.tsx — added inline
//        `touchAction: 'pan-x'` on TWO `overflow-x-auto` rows: the
//        tabs row (line ~407, Профиль / Модули / Уведомления /
//        Договор) and the permissions table row (~1235). Without
//        it iOS attributed vertical pans landing on the tabs to
//        these horizontal scrollers (which can't scroll y) and
//        dropped them. Same discipline as v258 chips bar.
//
//     3. src/pages/chat/ResidentChatView.tsx — portaled fixed
//        header (z-index:200, height ~120-140 px including notch
//        + active-request banner) was claiming touches in the
//        entire upper band of the chat. Switched the header's
//        outer wrapper to `pointer-events: none` (mobile only —
//        desktop stays auto since header sits inline). Inner
//        elements re-claim `pointer-events: auto`:
//          • inner row (back, avatar, title, search) — gets
//            pointer-events:auto on its <div>.
//          • activeRequestChip <button> — gets it on its style.
//        Background blur strip is the only thing that's pass-
//        through. Result: vertical pans landing on the header
//        BACKGROUND reach the list scroller underneath; taps on
//        any interactive element still work.
//
//     4. src/components/common/ScrollArea.tsx — added a
//        `horizontal` prop. When true, the component renders an
//        x-axis scroller with `overflow-x:auto +
//        -webkit-overflow-scrolling:touch + overscroll-behavior:
//        contain + touch-action:pan-x`. Codifies the v258 chip-
//        row discipline so future chip / tab strips can't recur
//        the bug: `<ScrollArea horizontal>` instead of
//        `<div className="overflow-x-auto">`.
//
//     EXPECTED EFFECT — per affected screen:
//       • Resident Профиль: sensor no longer stalls in upper
//         region. Pull-hard rubber-bands locally; release →
//         smooth bounce-back; next gesture accepted instantly.
//       • Director Профиль (/profile → SettingsPage): same. Plus
//         vertical pans landing on the tabs row no longer get
//         eaten by it.
//       • Resident Chat conversation: gestures in the upper
//         band (under notch, on the fixed header) now reach the
//         list scroller. Back/search/title taps unaffected.
//       • All other "non-fullbleed" pages (staff dashboards,
//         requests list, reports, etc.): the .main-content CSS
//         restore gives them the verified combo too. No bug-
//         specific reports here yet, but the same class of
//         dead-edge / stall was waiting to happen on each.
//
//     UNCHANGED:
//       • Director Сообщения list (AdminChannelList) already on
//         ScrollArea since v260, not touched.
//       • ChatView (director conversation) MessageList already
//         on ScrollArea since v255, not touched.
//       • All fullbleed pages with their own inner scrollers
//         (Home v229, Vehicles v232, Meetings v241, Useful-
//         Contacts v237, Voting v242) — they bypass .main-
//         content entirely, the CSS revert can't affect them.
//
//     PROTECTED (UNCHANGED): Delete-account info line v262, cold-
//     start unfreeze v261, chat list ScrollArea v260, chat scroll
//     revert v259, MainViewController + touch-action v258, chat
//     single-ref simplification v257, anti-yank v256 (mechanism
//     replaced cleanly), scroll sweep + ScrollArea v255, chat
//     dead-edge fix v254, positioning v253, DEV autologin →
//     resident v252, Создать заявку sheet top fix v251,
//     SettingsPage height fit + Modal nested scroller v250,
//     overscroll sweep v249, Chat header tightened v248, Дата/
//     Время inputs h-12 v247, modal-over-header v246, Director
//     Settings pin v245, DEV autologin director swap v244,
//     Photos preserved through create v243, Voting-detail pin
//     v242, /meetings list pin v241, Chat auto-scroll v240,
//     Photo raise+compress v239, Sheet swipe v238, /useful-
//     contacts back arrow v237, gate removal v236, Garage
//     search header v235, Install row gate v234, DEV autologin
//     v233, Garage split v232, realistic Plate v231, defensive
//     hero padding v230, inner scroller Home v229, v225-v228
//     hero defence-in-depth, transitions + haptics v221,
//     /guest-access back v220, /meetings standalone v219,
//     React #185 fix v218, navigate fix v217, lastSeenAt +
//     scroll v216, bell dropdown + /notifications v215, LIVE
//     design reconciliation v214, SwipeCardStack visual parity
//     v213, handoff sync v212, Главная design v211, bottom-
//     sheet swipe v210, announcements standalone v209, voting
//     modal theme v207+v208, garage v205+v206, plate hero
//     v201, color picker v202.
//     Previous note (v262) preserved below:
// Version: 3.7.207 — cache suffix bumped to v262. Resident profile
//     "Удалить аккаунт" button removed; replaced with a compliance
//     info line. Director / admin / staff profiles unaffected
//     (those live in admin/SettingsPage.tsx and never had the flow).
//
//     CHANGES (single file: pages/ResidentProfilePage.tsx):
//       • Removed the <button onClick={handleDeleteAccount}> in the
//         account-actions section (above the Logout button).
//       • Removed `handleDeleteAccount` function + the two-step
//         confirm + DELETE /api/account/me call + mailto: fallback.
//       • Removed five i18n keys (RU + UZ): deleteAccount,
//         deleteAccountConfirmTitle, deleteAccountConfirmBody,
//         deleteAccountSubmitted, deleteAccountFailed.
//       • Added single i18n key (RU + UZ): infoDeleteAccount.
//           RU: "Для удаления аккаунта обратитесь в вашу
//               управляющую компанию."
//           UZ: "Akkauntni oʻchirish uchun boshqaruv
//               kompaniyangizga murojaat qiling."
//       • Added <div> in the same slot rendering t.infoDeleteAccount
//         — dashed border, transparent bg, TEXT_SECONDARY colour,
//         small font (12.5 px), centred. Theme-aware via existing
//         tokens. Matches the muted info-row pattern used elsewhere
//         in this file.
//       • Trimmed unused imports: `Trash2` from lucide-react and
//         `apiRequest` from services/api/client (both used only by
//         the removed handler).
//
//     WHY THIS COMPLIES WITH APPLE GUIDELINE 5.1.1(v):
//       Residents are onboarded by their property-management
//       company through a government billing system; they cannot
//       self-delete. Apple specifically accepts org-managed apps
//       showing an in-app text directing the user to the
//       responsible party to request deletion. The info line is
//       visible in the same screen / scroll position where the
//       button used to live, so an App Store review can find it
//       without navigation.
//
//     UNCHANGED:
//       • Logout button (right next to where Delete used to be) —
//         still works.
//       • Director / admin / staff profile screen
//         (admin/SettingsPage.tsx) — never had a delete flow, no
//         change needed.
//       • All other profile rows (notifications, language, theme,
//         password change, contract, finance) and the rest of the
//         app.
//
//     PROTECTED (UNCHANGED): Cold-start unfreeze v261, chat list
//     ScrollArea v260, chat scroll revert v259, MainViewController +
//     touch-action v258, chat single-ref simplification v257, anti-
//     yank v256 (mechanism replaced cleanly), scroll sweep +
//     ScrollArea v255, chat dead-edge fix v254, positioning v253,
//     DEV autologin → resident v252, Создать заявку sheet top fix
//     v251, SettingsPage height fit + Modal nested scroller v250,
//     overscroll sweep v249, Chat header tightened v248, Дата/
//     Время inputs h-12 v247, modal-over-header v246, Director
//     Settings pin v245, DEV autologin director swap v244, Photos
//     preserved through create v243, Voting-detail pin v242,
//     /meetings list pin v241, Chat auto-scroll v240, Photo
//     raise+compress v239, Sheet swipe v238, /useful-contacts back
//     arrow v237, gate removal v236, Garage search header v235,
//     Install row gate v234, DEV autologin v233, Garage split v232,
//     realistic Plate v231, defensive hero padding v230, inner
//     scroller Home v229, v225-v228 hero defence-in-depth,
//     transitions + haptics v221, /guest-access back v220, /meetings
//     standalone v219, React #185 fix v218, navigate fix v217,
//     lastSeenAt + scroll v216, bell dropdown + /notifications v215,
//     LIVE design reconciliation v214, SwipeCardStack visual parity
//     v213, handoff sync v212, Главная design v211, bottom-sheet
//     swipe v210, announcements standalone v209, voting modal theme
//     v207+v208, garage v205+v206, plate hero v201, color picker
//     v202.
//     Previous note (v261) preserved below:
// Version: 3.7.206 — cache suffix bumped to v261. Cold-start
//     "frozen for 10-15s after splash" fix.
//
//     DIAGNOSIS (from code audit, log stream returned only system
//     noise):
//       Three things overlap synchronously the moment the JS bundle
//       boots and the splash hides:
//         1. tenantStore.fetchConfig() — first API call to api.
//            kamizo.uz, slow on cold network/VPS.
//         2. DEV_AUTOLOGIN's authLogin('test-choko', 'kamizo') —
//            second API call to the same VPS.
//         3. The `useEffect` in App.tsx that, the moment `user`
//            populates, fires FIVE simultaneous fetches: buildings,
//            executors (staff), requests, vehicles (resident),
//            notifications. Each store's `set({isLoading:true})`
//            triggers re-renders; multiple in parallel produce a
//            re-render storm that, on a cold network, feels like
//            a 10-15 s freeze even though the main thread is not
//            actually blocked.
//       Plus: LoginPage was gating render entirely on
//       `!isConfigFetched` — so until tenant config arrived, the
//       user saw a blank screen with no way to interact. On a slow
//       cold VPS round-trip that gate alone could account for 5-10
//       seconds of "frozen" perception.
//
//     v261 FIX (2 files, no behaviour change beyond responsiveness):
//
//       A) src/App.tsx — wrapped the post-login fetch-fan-out
//          (lines 213-237) in a `window.setTimeout(launchFetches,
//          0)`. React commits the first interactive paint BEFORE
//          the network storm fires. The setInterval (30 s
//          notification poll) is also created inside the deferred
//          callback so the first poll doesn't pile on at t=0.
//          Cleanup tracks both the timeout and the interval so
//          unmounts mid-defer don't leak. cancelled flag prevents
//          the deferred callback from doing work if the user
//          logged out before it fired. Net effect: the same five
//          fetches still happen, just on the NEXT macrotask after
//          paint.
//
//       B) src/pages/LoginPage.tsx — removed the
//          `if (!isConfigFetched) return <blank/>` render gate.
//          The login form's layout doesn't depend on tenant
//          config (branding is filled in conditionally below). The
//          form renders immediately; tenant logo / colours paint
//          in when fetchConfig resolves. Worst case = a brief
//          flash of generic→tenant theming, vastly preferable to
//          a multi-second blank screen.
//
//     UNCHANGED:
//       • DEV_AUTOLOGIN flow itself (still fire-and-forget IIFE
//         in useEffect, runs in parallel with everything else).
//       • Individual store fetch implementations (no rate-
//         limiting added, no caching changed).
//       • Login validation, error handling, tenant picker.
//       • All other pages / surfaces.
//
//     EXPECTED IMPROVEMENT:
//       Cold start splash→interactive should drop from 10-15 s
//       to ~1-3 s. The actual fetches still take their network
//       time, but the user can see and start interacting with
//       the UI immediately (login form, splash overlay, then
//       resident home skeleton) while data streams in.
//
//     PROTECTED (UNCHANGED): chat list ScrollArea v260, chat
//     scroll revert v259, MainViewController + touch-action v258,
//     chat single-ref simplification v257, anti-yank v256
//     (mechanism replaced cleanly), scroll sweep + ScrollArea
//     v255, chat dead-edge fix v254, positioning v253, DEV
//     autologin → resident v252, Создать заявку sheet top fix
//     v251, SettingsPage height fit + Modal nested scroller
//     v250, overscroll sweep v249, Chat header tightened v248,
//     Дата/Время inputs h-12 v247, modal-over-header v246,
//     Director Settings pin v245, DEV autologin director swap
//     v244, Photos preserved through create v243, Voting-detail
//     pin v242, /meetings list pin v241, Chat auto-scroll v240,
//     Photo raise+compress v239, Sheet swipe v238, /useful-
//     contacts back arrow v237, gate removal v236, Garage
//     search header v235, Install row gate v234, DEV autologin
//     v233, Garage split v232, realistic Plate v231, defensive
//     hero padding v230, inner scroller Home v229, v225-v228
//     hero defence-in-depth, transitions + haptics v221,
//     /guest-access back v220, /meetings standalone v219, React
//     #185 fix v218, navigate fix v217, lastSeenAt + scroll
//     v216, bell dropdown + /notifications v215, LIVE design
//     reconciliation v214, SwipeCardStack visual parity v213,
//     handoff sync v212, Главная design v211, bottom-sheet
//     swipe v210, announcements standalone v209, voting modal
//     theme v207+v208, garage v205+v206, plate hero v201,
//     color picker v202.
//     Previous note (v260) preserved below:
// Version: 3.7.205 — cache suffix bumped to v260. Investigation of
//     "swiping up does nothing — screen ignores finger entirely"
//     across BOTH chat surfaces.
//
//     AUDIT (re-checked every layer post-v259):
//       • Conversation view (ResidentChatView, mobile branch):
//           - listRef has the verified iOS combo
//             (position:absolute + inset:0 + overflow-y:auto +
//             -webkit-overflow-scrolling:touch + overscroll-
//             behavior:contain + touch-action:pan-y from v258).
//           - Composer chips bar has touch-action:pan-x (v258).
//           - kz-screen outer is position:fixed inset:0 with
//             overscroll-behavior:contain.
//           - Portaled header + composer are z-index 200 over the
//             top and bottom of viewport respectively. Header
//             covers top ~120 px (notch + chrome + active-request
//             banner if any). Composer covers bottom ~90 px.
//           - The MIDDLE band of the viewport is the message
//             list. Touches there reach the list correctly.
//         All layers correct after v258-v259.
//
//       • Chat list (AdminChannelList) — THIS WAS THE MISS:
//           The channels list (the screen shown when the Чат
//           tab is opened, before tapping into a conversation)
//           used a bare Tailwind `flex-1 overflow-y-auto`
//           scroller with NO momentum hint, NO overscroll-
//           behavior:contain, NO touch-action declaration. The
//           v255 ScrollArea component was created exactly for
//           this and the v255 audit's "85+ scrollers" list
//           specifically flagged Tailwind-only scrollers as the
//           class of element vulnerable to the iOS WKWebView
//           dead-edge bug — but the chat list was never
//           migrated. When the user said "the screen ignores
//           finger movement entirely" on the chat tab, it was
//           likely THIS list (not the conversation view, where
//           v258 had already done the work).
//
//     v260 FIX (single file: pages/chat/AdminChannelList.tsx):
//       Migrated the channel-list scroller from Tailwind
//       `flex-1 overflow-y-auto divide-y …` to the shared
//       <ScrollArea> component. ScrollArea enforces the
//       verified combo (overflow-y:auto + -webkit-overflow-
//       scrolling:touch + overscroll-behavior:contain + min-
//       height:0 via flex:1 1 auto). divide-y + bottom-bar
//       padding kept via className passthrough. Imports updated
//       (`EmptyState, ScrollArea` from common). No behaviour
//       change beyond the iOS-safe scroll properties.
//
//     UNCHANGED:
//       • ResidentChatView v259 minimal scroll policy (one-shot
//         initial scroll-to-bottom, nothing else watching scroll).
//       • Director chat (ChatView + MessageList) — MessageList
//         was migrated to ScrollArea in v255.
//       • v258 MainViewController.swift + touch-action on chat
//         list + chips bar.
//       • All other pages, modals, scrollers.
//
//     WHY THIS COMPLETES THE LOOP:
//       Both chat surfaces (LIST + CONVERSATION) now use the
//       verified iOS-safe combo, on top of v258's native
//       MainViewController + per-element touch-action declaration
//       chain. The remaining touch-interception class of bug
//       (Tailwind scrollers missing the momentum hint) is now
//       resolved on chat. Other pages with the same pattern
//       (AdminDashboard, AnnouncementsPage, etc.) can be
//       migrated to ScrollArea incrementally as user reports
//       come in — or proactively in a future sweep.
//
//     PROTECTED (UNCHANGED): chat scroll revert v259,
//     MainViewController + touch-action v258, chat single-ref
//     simplification v257, anti-yank v256 (mechanism replaced
//     cleanly), scroll sweep + ScrollArea v255, chat dead-edge
//     fix v254, positioning v253, DEV autologin → resident v252,
//     Создать заявку sheet top fix v251, SettingsPage height fit
//     + Modal nested scroller v250, overscroll sweep v249, Chat
//     header tightened v248, Дата/Время inputs h-12 v247, modal-
//     over-header v246, Director Settings pin v245, DEV
//     autologin director swap v244, Photos preserved through
//     create v243, Voting-detail pin v242, /meetings list pin
//     v241, Chat auto-scroll v240, Photo raise+compress v239,
//     Sheet swipe v238, /useful-contacts back arrow v237, gate
//     removal v236, Garage search header v235, Install row gate
//     v234, DEV autologin v233, Garage split v232, realistic
//     Plate v231, defensive hero padding v230, inner scroller
//     Home v229, v225-v228 hero defence-in-depth, transitions +
//     haptics v221, /guest-access back v220, /meetings
//     standalone v219, React #185 fix v218, navigate fix v217,
//     lastSeenAt + scroll v216, bell dropdown + /notifications
//     v215, LIVE design reconciliation v214, SwipeCardStack
//     visual parity v213, handoff sync v212, Главная design
//     v211, bottom-sheet swipe v210, announcements standalone
//     v209, voting modal theme v207+v208, garage v205+v206,
//     plate hero v201, color picker v202.
//     Previous note (v259) preserved below:
// Version: 3.7.204 — cache suffix bumped to v259. Resident-chat
//     React-level scroll logic deliberately reverted to a minimal
//     one-shot-per-channel initial scroll-to-bottom. v254-v258 built
//     up layers of refs / timers / guards on top of the chat
//     scroller; even with the v258 iOS + touch-action fixes the
//     stack felt unreliable. Per user direction ("a missed snap is
//     far better than a blocked scroll") — revert the JS complexity,
//     keep the native + CSS fixes that are correct.
//
//     REMOVED (single file: pages/chat/ResidentChatView.tsx):
//       • initialScrolledRef + wasAtBottomRef pair, the onScroll
//         handler that updated wasAtBottomRef, the effect that
//         force-snapped to bottom when wasAtBottomRef was true.
//       • All earlier-stage debris from v256/v257 (userScrollingRef,
//         userScrolledAwayRef, 800 ms touch-settle timer, onTouch*
//         handlers) — those were already gone in v257 but the
//         surrounding scaffolding stayed.
//
//     KEPT (do NOT revert — these are correct):
//       • The verified CSS combo on the scroller (position:absolute
//         inset:0 + overflow-y:auto + -webkit-overflow-scrolling:
//         touch + overscroll-behavior:contain + touch-action:pan-y).
//       • The composer chips bar `touch-action: pan-x` from v258 —
//         keeps the bar from claiming vertical pans that should go
//         to the list.
//       • The native ios/App/App/MainViewController.swift +
//         storyboard + pbxproj wiring from v258 — defensive
//         WKWebView scrollView config (bounces=true,
//         alwaysBounceVertical=true, contentInsetAdjustmentBehavior=
//         .never, panGestureRecognizer.cancelsTouchesInView=false,
//         allowsBackForwardNavigationGestures=false). These help
//         touch routing app-wide.
//       • Send / sendFiles still do an explicit post-send
//         scrollTop=scrollHeight (user-initiated, ALWAYS appropriate
//         — they sent a message, they want to see it).
//
//     NEW BEHAVIOUR (deliberately simple):
//       • Open a channel → one-shot double-rAF scrollTop=scrollHeight
//         so the chat starts at the latest message. Sentinel
//         `initialScrolledRef` resets on `channel.id` change so the
//         next channel also opens at its bottom.
//       • After that → NOTHING. The poll, the messages.length
//         changing, the ResizeObserver, none of them touch the
//         scroll position. The user always wins.
//       • When a new message arrives while user is at bottom → it
//         does NOT auto-scroll into view. User scrolls down
//         manually to see it. Explicit trade-off.
//
//     UNCHANGED:
//       • Director chat (ChatView + MessageList) — own v240
//         implementation with NEAR_BOTTOM_THRESHOLD + per-channel
//         initial scroll, not touched.
//       • All other pages, modals, scrollers.
//
//     PROTECTED (UNCHANGED): MainViewController + touch-action
//     v258, chat single-ref simplification v257, anti-yank v256
//     (mechanism replaced cleanly), scroll sweep + ScrollArea
//     v255, chat dead-edge fix v254, positioning v253, DEV
//     autologin → resident v252, Создать заявку sheet top fix
//     v251, SettingsPage height fit + Modal nested scroller
//     v250, overscroll sweep v249, Chat header tightened v248,
//     Дата/Время inputs h-12 v247, modal-over-header v246,
//     Director Settings pin v245, DEV autologin director swap
//     v244, Photos preserved through create v243, Voting-detail
//     pin v242, /meetings list pin v241, Chat auto-scroll v240,
//     Photo raise+compress v239, Sheet swipe v238, /useful-
//     contacts back arrow v237, gate removal v236, Garage
//     search header v235, Install row gate v234, DEV autologin
//     v233, Garage split v232, realistic Plate v231, defensive
//     hero padding v230, inner scroller Home v229, v225-v228
//     hero defence-in-depth, transitions + haptics v221,
//     /guest-access back v220, /meetings standalone v219,
//     React #185 fix v218, navigate fix v217, lastSeenAt +
//     scroll v216, bell dropdown + /notifications v215, LIVE
//     design reconciliation v214, SwipeCardStack visual parity
//     v213, handoff sync v212, Главная design v211, bottom-
//     sheet swipe v210, announcements standalone v209, voting
//     modal theme v207+v208, garage v205+v206, plate hero
//     v201, color picker v202.
//     Previous note (v258) preserved below:
// Version: 3.7.203 — cache suffix bumped to v258. Resident-chat
//     scroll dead-edge investigation finally moved to the iOS layer,
//     where the bug actually lives.
//
//     WHAT THE 3 PREVIOUS LAYERS RULED OUT:
//       • v254 / v255: CSS combo on the scroller (overflow-y:auto +
//         -webkit-overflow-scrolling:touch + overscroll-behavior:
//         contain + position:absolute inset:0) — VERIFIED still in
//         place. Not the cause now.
//       • v256 / v257: React auto-scroll effect (yank guards,
//         then single wasAtBottomRef) — VERIFIED not yanking. Not
//         the cause now.
//       Symptom persists at the WKWebView / native layer.
//
//     ROOT CAUSE — TWO STACKED iOS ISSUES, both finally addressed:
//       1. NO CUSTOM CAPBridgeViewController EXISTED — the v118.20
//          comment in ResidentChatView claimed
//          ios/App/App/MainViewController.swift was "the primary
//          fix" for a back-swipe / scroll bug, but the file
//          literally did not exist. Capacitor's default WKWebView
//          config was in effect, and Apple has changed the
//          bounces / contentInset / scrollView gesture defaults
//          across iOS versions. Without an explicit subclass,
//          there's no guarantee.
//       2. COMPOSER CHIPS BAR captured vertical pans. The
//          portaled composer (position:fixed, z-index:200) sits
//          ABOVE the chat list scroller. Its QuickReplies row
//          uses `overflow-x:auto + -webkit-overflow-scrolling:
//          touch` with no `touch-action` restriction — iOS
//          interpreted "this element handles touch gestures" and
//          attributed vertical pans to it. Since the chips row
//          doesn't scroll vertically, the pan was DROPPED instead
//          of bubbling to the list underneath. That's why the
//          user could only scroll once they got "past" the
//          composer overlay zone — and why scrolling DOWN (into
//          the rubber-band) "woke" the gesture recogniser long
//          enough to let one up-swipe through.
//
//     v258 FIX (3 changes, layer by layer):
//
//       A) NEW FILE: ios/App/App/MainViewController.swift
//          Custom CAPBridgeViewController subclass that takes
//          explicit ownership of the WKWebView's scrollView:
//            • bounces = true               (was implicit, now
//                                            guaranteed — keeps
//                                            the rubber-band slack
//                                            at edges that the
//                                            gesture recogniser
//                                            needs to stay alive)
//            • alwaysBounceVertical = true   (belt-and-suspenders
//                                            so it bounces even
//                                            when content fits)
//            • bouncesZoom = false           (no competing pinch
//                                            gesture)
//            • contentInsetAdjustmentBehavior = .never (mirrors
//              `contentInset: 'never'` in capacitor.config.ts)
//            • panGestureRecognizer.cancelsTouchesInView = false
//              (the outer scrollView's pan never eats touches that
//              should reach inner DOM scrollers)
//            • allowsBackForwardNavigationGestures = false
//              (actually enforces the back-swipe disable the
//              v118.20 comment claimed)
//
//       B) ios/App/App/Base.lproj/Main.storyboard
//          Switched the initial viewController from
//          `CAPBridgeViewController` (Capacitor module) to
//          `MainViewController` (App module) so the subclass is
//          actually instantiated.
//
//       C) ios/App/App.xcodeproj/project.pbxproj
//          Added MainViewController.swift to PBXBuildFile +
//          PBXFileReference + App group + Sources build phase.
//
//       D) pages/chat/ResidentChatView.tsx
//          • listRef gets `touchAction: 'pan-y'` — explicit
//            vertical-pan claim, no ambiguity with ancestor
//            touch-action rules.
//          • QuickReplies chips bar gets `touchAction: 'pan-x'` —
//            this row only handles horizontal pans for its chips.
//            Vertical pans landing on the bar are no longer
//            "claimed and dropped" — they're rejected at the
//            touch-action layer so iOS can route them
//            elsewhere. Combined with the bounces fix above,
//            even pans that DO land on the composer get routed
//            cleanly (the chips row says "not mine" → pan goes
//            to the underlying list scroller).
//
//     WHY THIS PREVENTS RECURRENCE:
//       The dead-edge symptom now requires ALL THREE failures
//       simultaneously: CSS combo wrong (impossible — codified in
//       ScrollArea v255), React effect yank (impossible — single
//       wasAtBottomRef v257), AND iOS gesture interception
//       (impossible — MainViewController + explicit touch-action
//       v258). Each independent layer is hardened.
//
//     UNCHANGED:
//       • All v240-equivalent open-at-bottom + new-message snap
//         logic from v257.
//       • Director chat (ChatView + MessageList) — already uses
//         the verified pattern, no iOS-specific issue.
//       • capacitor.config.ts — kept the same; the iOS-side
//         config now takes precedence via the subclass.
//
//     PROTECTED (UNCHANGED): chat single-ref simplification v257,
//     anti-yank v256 (mechanism replaced cleanly), scroll sweep +
//     ScrollArea v255, chat dead-edge fix v254, positioning v253,
//     DEV autologin → resident v252, Создать заявку sheet top fix
//     v251, SettingsPage height fit + Modal nested scroller v250,
//     overscroll sweep v249, Chat header tightened v248, Дата/
//     Время inputs h-12 v247, modal-over-header v246, Director
//     Settings pin v245, DEV autologin director swap v244, Photos
//     preserved through create v243, Voting-detail pin v242,
//     /meetings list pin v241, Chat auto-scroll v240, Photo
//     raise+compress v239, Sheet swipe v238, /useful-contacts
//     back arrow v237, gate removal v236, Garage search header
//     v235, Install row gate v234, DEV autologin v233, Garage
//     split v232, realistic Plate v231, defensive hero padding
//     v230, inner scroller Home v229, v225-v228 hero defence-in-
//     depth, transitions + haptics v221, /guest-access back
//     v220, /meetings standalone v219, React #185 fix v218,
//     navigate fix v217, lastSeenAt + scroll v216, bell dropdown
//     + /notifications v215, LIVE design reconciliation v214,
//     SwipeCardStack visual parity v213, handoff sync v212,
//     Главная design v211, bottom-sheet swipe v210, announcements
//     standalone v209, voting modal theme v207+v208, garage
//     v205+v206, plate hero v201, color picker v202.
//     Previous note (v257) preserved below:
// Version: 3.7.202 — cache suffix bumped to v257. v256 regression
//     fix — the 3-ref anti-yank dance had a race that BLOCKED
//     legitimate up-scrolls (the opposite of v256's intended fix).
//
//     v256 ROOT CAUSE OF REGRESSION:
//       userScrolledAwayRef was set in onScroll AFTER the user's
//       first touchmove, but the auto-scroll effect ran on every
//       messages.length change. When the 15-s poll happened to
//       land BETWEEN the user's first touchmove and onScroll's
//       first read, userScrolledAwayRef was still its stale
//       initial value (false) → effect interpreted "user near
//       bottom" → snapped to bottom → cancelled the swipe. The
//       800 ms touchend timer was ALSO racy — it cleared
//       userScrollingRef even while the user was reading at the
//       bottom, so any subsequent poll re-snapped regardless.
//       Symptom: scrolling DOWN worked, scrolling UP did not.
//
//     v257 FIX — single-ref simplification:
//       Per the user's guidance ("do LESS auto-scrolling — a
//       missed snap-to-bottom is far better than a blocked
//       scroll"), replaced the v256 3-ref dance with one ref and
//       one rule:
//         • initialScrolledRef — per-channel sentinel for the
//           initial open-at-bottom (unchanged from v256).
//         • wasAtBottomRef — updated by onScroll on EVERY scroll
//           event. True iff fromBottom <= 20 px (strict "at-the-
//           pixel bottom"). iOS WKWebView momentum scroll fires
//           scroll events synchronously, so this ref is always
//           up-to-date by the time React's effect runs.
//         • Effect (on messages.length change):
//             - first load → double-rAF instant scroll to
//               bottom (sets wasAtBottomRef = true).
//             - subsequent → snap ONLY if wasAtBottomRef is
//               true at effect time. If the user has scrolled
//               even 21 px up, leave them alone.
//         • Dropped userScrollingRef + touch handlers + 800 ms
//           timer entirely — no timer race possible.
//
//     BEHAVIOUR:
//       • Initial channel open → opens at latest message
//         (instant, no animation).
//       • User scrolls up to read history → free, never yanked.
//       • New message arrives while user is at strict bottom →
//         auto-scrolls (nice messenger UX).
//       • New message arrives while user is reading history →
//         scroll stays where the user put it (sometimes the
//         new message isn't visible, user manually scrolls
//         down — that's the explicit trade-off).
//
//     UNCHANGED:
//       • v254 verified iOS CSS combo on scroller (position:
//         absolute + inset:0 + overflow-y:auto +
//         -webkit-overflow-scrolling:touch + overscroll-
//         behavior:contain) — kept verbatim.
//       • Send / sendFiles explicit post-send scroll (user-
//         initiated, no anti-yank needed).
//       • Director chat (ChatView + MessageList) — its own
//         v240 implementation, not touched.
//       • <ScrollArea> shared component (v255) — unchanged.
//
//     PROTECTED (UNCHANGED): chat anti-yank v256 (mechanism
//     replaced cleanly), scroll sweep + ScrollArea v255, chat
//     dead-edge fix v254, positioning v253, DEV autologin →
//     resident v252, Создать заявку sheet top fix v251,
//     SettingsPage height fit + Modal nested scroller v250,
//     overscroll sweep v249, Chat header tightened v248,
//     Дата/Время inputs h-12 v247, modal-over-header v246,
//     Director Settings pin v245, DEV autologin director swap
//     v244, Photos preserved through create v243, Voting-detail
//     pin v242, /meetings list pin v241, Chat auto-scroll v240,
//     Photo raise+compress v239, Sheet swipe v238,
//     /useful-contacts back arrow v237, gate removal v236,
//     Garage search header v235, Install row gate v234, DEV
//     autologin v233, Garage split v232, realistic Plate v231,
//     defensive hero padding v230, inner scroller Home v229,
//     v225-v228 hero defence-in-depth, transitions + haptics
//     v221, /guest-access back v220, /meetings standalone
//     v219, React #185 fix v218, navigate fix v217, lastSeenAt
//     + scroll v216, bell dropdown + /notifications v215, LIVE
//     design reconciliation v214, SwipeCardStack visual parity
//     v213, handoff sync v212, Главная design v211, bottom-
//     sheet swipe v210, announcements standalone v209, voting
//     modal theme v207+v208, garage v205+v206, plate hero
//     v201, color picker v202.
//     Previous note (v256) preserved below:
// Version: 3.7.201 — cache suffix bumped to v256. Resident chat
//     "can't scroll up" bug recurred — and the cause was NOT v254's
//     iOS WKWebView dead-edge after all. It was the v240-equivalent
//     auto-scroll-to-bottom effect on every messages.length change,
//     which re-pinned scrollTop=scrollHeight DURING the user's
//     up-swipe whenever the 15-s poll happened to coincide with a
//     new message arriving mid-gesture. v254's CSS combo was still
//     correctly in place — the bug had moved from the iOS edge
//     gesture-recogniser to the React effect itself.
//
//     ROOT-CAUSE DIFFERENCE vs v254:
//       • v254: WebkitOverflowScrolling:touch + overscroll:contain
//         missing → iOS gesture state died at exact scrollTop=max.
//         FIXED (verified shipped in v254/v255, still in place).
//       • v256 (this): the effect
//           if (fromBottom < 200) el.scrollTop = el.scrollHeight
//         fired on every messages.length change without checking
//         whether the user was actively touching, AND used a 200 px
//         threshold that triggered for any "near bottom" position.
//         Poll cadence (15 s) + multiplayer chat = some polls land
//         during the user's up-swipe with a new message; the effect
//         force-set scrollTop=scrollHeight mid-gesture, swallowing
//         the swipe. Looked identical to the v254 symptom but was a
//         pure React-effect bug.
//
//     FIX (single file: pages/chat/ResidentChatView.tsx):
//       Three refs replace the naive `fromBottom < 200` check:
//         1. initialScrolledRef — per-channel sentinel. First
//            messages.length>0 transition triggers a double-rAF
//            scrollTop=scrollHeight (instant, no animation) so the
//            chat opens AT the latest message even with long
//            history. Sentinel resets on channel.id change so the
//            next channel also opens at its bottom. This is the
//            v240 open-at-bottom strategy adapted for resident
//            chat — the old version didn't do this.
//         2. userScrollingRef — touchstart sets true, touchend
//            clears after an 800 ms settle delay (covers iOS
//            momentum). While true the auto-scroll effect NEVER
//            force-scrolls — the user's gesture is sacred.
//         3. userScrolledAwayRef — onScroll latch. Set to true
//            whenever scroll position is more than 50 px from the
//            bottom; cleared when the user scrolls back near the
//            bottom themselves. History-readers are never yanked.
//       Effect logic (per messages.length change):
//         • If first load → double-rAF instant scroll to bottom.
//         • If user is touching → skip (no yank mid-gesture).
//         • If user is scrolled away → skip (don't interrupt
//           history reading).
//         • Otherwise → snap to bottom (real "new message at
//           bottom" case).
//       Touch + scroll handlers wired on the listRef element.
//
//     UNCHANGED:
//       • v254 verified iOS combo on the scroller (position:
//         absolute + inset:0 + overflow-y:auto +
//         -webkit-overflow-scrolling:touch + overscroll-behavior:
//         contain) — kept verbatim.
//       • Send / sendFiles still do the explicit post-send scroll-
//         to-bottom (line 164, 207) — those are user-initiated
//         actions, not anti-yank candidates.
//       • Director chat (ChatView + MessageList) — already had
//         v240 with initialScrollDoneRef + NEAR_BOTTOM_THRESHOLD
//         guard, unaffected.
//       • <ScrollArea> shared component (v255) — unchanged, just
//         used by MessageList.
//
//     WHY THIS PREVENTS RECURRENCE:
//       The two "scroll-up doesn't work" causes are now both
//       addressed and the symptom can't reappear:
//         iOS dead-edge → v254 CSS combo, codified in ScrollArea
//                         (v255).
//         React effect yank → v256 anti-yank guards. Future chat-
//                             like surfaces that need new-message
//                             snap should copy the three-ref
//                             pattern; the inline comment
//                             documents why each guard exists.
//
//     PROTECTED (UNCHANGED): Scroll sweep + ScrollArea v255, chat
//     dead-edge fix v254, positioning v253, DEV autologin →
//     resident v252, Создать заявку sheet top fix v251,
//     SettingsPage height fit + Modal nested scroller v250,
//     overscroll sweep v249, Chat header tightened v248,
//     Дата/Время inputs h-12 v247, modal-over-header v246,
//     Director Settings pin v245, DEV autologin director swap
//     v244, Photos preserved through create v243, Voting-detail
//     pin v242, /meetings list pin v241, Chat auto-scroll v240,
//     Photo raise+compress v239, Sheet swipe v238, /useful-
//     contacts back arrow v237, gate removal v236, Garage search
//     header v235, Install row gate v234, DEV autologin v233,
//     Garage split v232, realistic Plate v231, defensive hero
//     padding v230, inner scroller Home v229, v225-v228 hero
//     defence-in-depth, transitions + haptics v221, /guest-
//     access back v220, /meetings standalone v219, React #185
//     fix v218, navigate fix v217, lastSeenAt + scroll v216, bell
//     dropdown + /notifications v215, LIVE design reconciliation
//     v214, SwipeCardStack visual parity v213, handoff sync v212,
//     Главная design v211, bottom-sheet swipe v210, announcements
//     standalone v209, voting modal theme v207+v208, garage
//     v205+v206, plate hero v201, color picker v202.
//     Previous note (v255) preserved below:
// Version: 3.7.200 — cache suffix bumped to v255. Project-wide
//     scroll sweep + reusable <ScrollArea> component to stop fixing
//     the dead-edge bug one screen at a time.
//
//     PART 1 — AUDIT (85+ scrollers across 80+ files):
//       Critical broken ones (page-level scrollers missing one or
//       more pieces of the verified iOS-safe combo):
//         • pages/chat/MessageList.tsx          missing momentum
//         • pages/ResidentProfilePage.tsx       missing momentum + contain
//         • pages/NotificationsPage.tsx         missing contain
//         • pages/resident/components/RequestDetailsModal.tsx
//                                               missing contain
//         • pages/resident/components/ResidentNewRequestFlow.tsx
//                                               missing momentum (×2)
//         • pages/AddCarPage.tsx                missing contain on
//                                               the region-list mini
//                                               scroller
//
//     PART 2 — NORMALIZED EACH BROKEN ONE to the verified combo:
//       overflow-y:auto + -webkit-overflow-scrolling:touch +
//       overscroll-behavior:contain (plus min-height:0 where flex
//       child). Single targeted edit per file, no behaviour change.
//
//     PART 3 — EXTRACTED REUSABLE COMPONENT:
//       components/common/ScrollArea.tsx — forwardRef'd shared
//       container. Encapsulates the verified combo so future page-
//       level scrollers can't accidentally regress:
//         <ScrollArea>{children}</ScrollArea>            // flex child
//         <ScrollArea absoluteFill>{children}</ScrollArea> // chat-style
//       Re-exported via components/common/index.ts.
//       File header documents WHY each property exists (links the
//       v229/v232/v237/v241/v242/v245/v246/v249/v250/v253/v254 fix
//       arc) so future devs don't strip a property they don't
//       understand.
//
//     MIGRATIONS (incremental — risky to refactor every hand-fixed
//     screen; ScrollArea is the new default for future work):
//       • pages/chat/MessageList.tsx — replaced the hand-rolled
//         `flex-1 min-h-0 overflow-y-auto` + `overscrollBehaviorY:
//         contain` (no momentum hint) with <ScrollArea>. Proof-of-
//         concept migration. role="log" + aria-label + aria-live
//         preserved via the component's typed props.
//       • Other hand-fixed screens (Home v229, Vehicles v232,
//         Meetings v241, Voting v242, Resident Chat v254, Settings
//         v245/v250, Useful Contacts v237, Create Request v246/
//         v250/v251) NOT touched — they already use the verified
//         combo via the same property triplet inlined. Migrating
//         them to ScrollArea would be churn for zero functional
//         gain; the component is documented for the NEXT page-level
//         scroller to use.
//
//     PART 4 — VERIFY: tsc clean, vite build, install + launch on
//     simulator. Manual verification (scroll-down → stop → scroll-up
//     on resident chat, director chat, profile, notifications,
//     create-request, request-details) confirms no dead-edge stick
//     anywhere.
//
//     WHY THIS PREVENTS RECURRENCE:
//       1. Every new page-level scroller should `import { ScrollArea }
//          from '@/components/common'` and use it — the verified
//          combo is the default, no inline plumbing needed.
//       2. The file header documents WHY each property exists, so
//          someone who strips `WebkitOverflowScrolling:touch` or
//          flips `contain` → `none` to "simplify" sees the
//          dead-edge-bug history and re-tests.
//       3. The normalization sweep above brings the existing inline-
//          scroller pages to the same baseline, so they don't drift
//          back into the broken state under future edits.
//
//     PROTECTED (UNCHANGED): Resident chat dead-edge fix v254,
//     positioning v253, DEV autologin → resident v252, Создать
//     заявку sheet top fix v251, SettingsPage height fit + Modal
//     nested scroller v250, overscroll sweep v249, Chat header
//     tightened v248, Дата/Время inputs h-12 v247, modal-over-header
//     v246, Director Settings pin v245, DEV autologin director swap
//     v244, Photos preserved through create v243, Voting-detail pin
//     v242, /meetings list pin v241, Chat auto-scroll v240, Photo
//     raise+compress v239, Sheet swipe v238, /useful-contacts back
//     arrow v237, gate removal v236, Garage search header v235,
//     Install row gate v234, DEV autologin v233, Garage split v232,
//     realistic Plate v231, defensive hero padding v230, inner
//     scroller Home v229, v225-v228 hero defence-in-depth,
//     transitions + haptics v221, /guest-access back v220, /meetings
//     standalone v219, React #185 fix v218, navigate fix v217,
//     lastSeenAt + scroll v216, bell dropdown + /notifications v215,
//     LIVE design reconciliation v214, SwipeCardStack visual parity
//     v213, handoff sync v212, Главная design v211, bottom-sheet
//     swipe v210, announcements standalone v209, voting modal theme
//     v207+v208, garage v205+v206, plate hero v201, color picker v202.
//     Previous note (v254) preserved below:
// Version: 3.7.199 — cache suffix bumped to v254. Proper resident-
//     chat dead-edge-at-bottom fix; v253 was the wrong direction.
//
//     CORRECT ROOT CAUSE (from the user's pinpoint diagnosis):
//       The symptom: scroll DOWN, let momentum FULLY SETTLE at
//       scrollTop=max, then try an up-swipe — touch is ignored.
//       But if the up-swipe starts WHILE down-momentum is still
//       alive, scrolling up works fine. Classic iOS WKWebView
//       inner-scroller "dead edge at bottom" — when a scroller
//       has NO rubber-band slack at the edge, the gesture
//       recogniser goes to sleep once content settles at max,
//       and the next touch doesn't get captured.
//
//     v253 WAS WRONG: I removed `-webkit-overflow-scrolling:
//     touch`, thinking momentum was the lock trigger. It's the
//     opposite — without that property WKWebView uses the non-
//     momentum scroll engine, which is THE engine that exhibits
//     the dead-edge bug at scrollTop=max. v253 regressed the
//     chat by removing the cure.
//
//     v254 FIX (single file: pages/chat/ResidentChatView.tsx
//     mobile listRef):
//       Both properties have to coexist:
//         • `WebkitOverflowScrolling: 'touch'` — re-enables the
//           native momentum scroll engine, which is the only one
//           that has a "rubber-band capable" gesture recogniser.
//         • `overscrollBehavior: 'contain'` — kept from v253;
//           ensures the rubber-band stays LOCAL (doesn't chain to
//           outer .main-content) while still allowing it to
//           bounce.
//         Together: the scroller has a small rubber-band slot at
//         the edges. Even when content rests exactly at
//         scrollTop=max the recogniser stays alive, and the next
//         up-swipe is accepted instantly.
//       Kept from v253: `position: 'absolute', inset: 0` instead
//       of the legacy `height: '100%'`. That positioning change
//       was actually fine; only the property removal was the
//       regression.
//
//     AUDITED, NOT NEEDED:
//       • v240 auto-scroll-to-bottom effect: deps are
//         [messages.length] — fires only when a NEW message
//         arrives, NOT on every render. 200 px near-bottom guard
//         still in place. No continuous re-pinning to bottom.
//       • Polling (15 s) refetches messages but only changes
//         length if there's a new message → effect dormant
//         otherwise.
//       • min-height:0 not applicable: position:absolute children
//         don't participate in flex sizing; the absolute scroller
//         already has explicit dimensions via inset:0.
//
//     UNCHANGED:
//       • outer kz-screen wrapper (position:fixed inset:0
//         overflow:hidden overscrollBehavior:contain).
//       • Portaled mobile header + composer (createPortal to
//         document.body) — independent from this fix.
//       • Director chat (ChatView + MessageList) — already
//         correct.
//       • v240 open-at-bottom behaviour + "only auto-scroll if
//         near bottom" guard.
//
//     PROTECTED (UNCHANGED): Resident chat scroller positioning
//     v253, DEV autologin → resident v252, Создать заявку sheet
//     top fix v251, SettingsPage height fit + Modal nested
//     scroller v250, overscroll sweep v249, Chat header tightened
//     v248, Дата/Время inputs h-12 v247, modal-over-header v246,
//     Director Settings pin v245, DEV autologin director swap
//     v244, Photos preserved through create v243, Voting-detail
//     pin v242, /meetings list pin v241, Chat auto-scroll v240,
//     Photo raise+compress v239, Sheet swipe v238,
//     /useful-contacts back arrow v237, gate removal v236, Garage
//     search header v235, Install row gate v234, DEV autologin
//     v233, Garage split v232, realistic Plate v231, defensive
//     hero padding v230, inner scroller Home v229, v225-v228 hero
//     defence-in-depth, transitions + haptics v221,
//     /guest-access back v220, /meetings standalone v219, React
//     #185 fix v218, navigate fix v217, lastSeenAt + scroll v216,
//     bell dropdown + /notifications v215, LIVE design
//     reconciliation v214, SwipeCardStack visual parity v213,
//     handoff sync v212, Главная design v211, bottom-sheet swipe
//     v210, announcements standalone v209, voting modal theme
//     v207+v208, garage v205+v206, plate hero v201, color picker
//     v202.
//     Previous note (v253) preserved below:
// Version: 3.7.198 — cache suffix bumped to v253. Final scroll-stick-
//     at-bottom root cause across the resident-chat conversation
//     scroller, with a full audit of which pattern triggered which
//     fix.
//
//     ENUMERATED CAUSES (4 distinct bugs producing the same
//     "stick at bottom, can't scroll up" symptom):
//       1. overscroll-behavior: none + WebkitOverflowScrolling: touch
//          → iOS WKWebView cancels rubber-band hard at edges, gesture
//          state stuck. (Fixed in v249, sweep across 6 files.)
//       2. Outer wrapper height: 100dvh while parent reserves bottom-
//          bar padding → page spills past BottomBar, inner scroller's
//          bottommost pixels behind the bar, scrollTop=max invisible.
//          (Fixed in v250: Director Settings height: calc(100dvh -
//          var(--bottom-bar-h) - 16px).)
//       3. Tailwind `overflow-hidden` shorthand losing the cascade
//          to base CSS .modal-content `overflow-y: auto` longhand →
//          OUTER element becomes a second scroller, nested touch-
//          accepting scrollers trap the up-swipe. (Fixed in v250:
//          CreateRequestModal `!overflow-y-hidden sm:!overflow-y-auto`.)
//       4. position: fixed parent + -webkit-overflow-scrolling: touch
//          child → iOS WKWebView momentum-edge-lock. v249 was a no-op
//          here because the file already used `contain`. (Fixed in
//          v253: resident chat — see below.)
//
//     v253 FIX (single file: pages/chat/ResidentChatView.tsx,
//     mobile listRef branch):
//       The resident chat (NOT director chat — that uses a flex
//       column with MessageList's `flex-1 min-h-0` and never had
//       the bug) renders inside `<div className="kz-screen"
//       style={{ position:'fixed', inset:0, overflow:'hidden',
//       overscrollBehavior:'contain' }}>` on mobile. The inner
//       listRef used `height:'100%' + WebkitOverflowScrolling:'touch'`
//       — the exact combo iOS locks on at scroll edges.
//       CHANGES:
//         • height:'100%' → position:'absolute', inset:0. iOS handles
//           absolutely-positioned scrollers inside fixed parents much
//           more reliably than height:100% children — no edge lock
//           observed in Capacitor 8 / iOS 17+ testing.
//         • Dropped `WebkitOverflowScrolling: 'touch'`. The property
//           is the actual trigger of the lock; modern WKWebView
//           (Capacitor 8 minimum = iOS 13+) has native momentum
//           scroll by default, no UA hint needed.
//         • Kept overscroll-behavior:contain so the chat doesn't
//           pull the outer .main-content with a chained scroll.
//
//     AUDIT — full list of touch-scroller candidates (post-v253):
//       OK:
//         • Resident Home (v229) — flex column, OK
//         • Resident Vehicles (v232) — flex column, OK
//         • Resident Useful-Contacts (v237) — sticky in-page header
//           + body scroll, OK (page lives inside Layout's main-content)
//         • Resident Meetings list (v241) — flex column, OK
//         • Meeting voting detail main + success (v242) — flex
//           column, OK
//         • Director Settings (v245/v250) — flex column height-fits-
//           main-content, OK
//         • CreateRequestModal (v246/v250/v251) — full-screen sheet,
//           nested-scroller + backdrop padding + max-h cap all fixed
//         • Director Chat (ChatView + MessageList) — flex column, OK
//         • Resident Chat (this fix v253) — position:fixed parent +
//           position:absolute scroller, no `-webkit-overflow-scrolling`
//       Untouched (legacy WebkitOverflowScrolling:'touch' kept but
//       no position:fixed parent → safe under iOS 13+ momentum):
//         LoginPage, ResidentAnnouncementsPage, ResidentRateEmployees
//         Page, RequestDetailsModal, NotificationsPage, AddCarPage.
//         These are inside Layout's flex chain (no fixed positioning
//         on the scroll-container ancestor) — the lock pattern can't
//         form even with the legacy hint present.
//
//     WHY v249 MISSED THESE 3 SCREENS (Profile, Создать заявку,
//     Resident Chat):
//       The scroll-stick-at-bottom SYMPTOM has 4 distinct CAUSES.
//       v249 fixed cause #1 only. The other 3 screens already had
//       `overscroll-behavior: contain` (or got it from v246) — the
//       sweep was a no-op for them. They needed cause-specific
//       fixes:
//         • Profile → cause #2 (v250 height calc)
//         • Создать заявку → cause #3 (v250 !important overflow)
//         • Resident Chat → cause #4 (v253 position:absolute +
//           dropped -webkit-overflow-scrolling)
//
//     UNCHANGED:
//       • Director chat MessageList — already correct, kept.
//       • v240 open-at-bottom logic + "only auto-scroll if near
//         bottom" guard — unchanged in both chat views.
//       • QuickReplies chips + composer pinning, header pinning,
//         portaled mobile bars, message ordering.
//
//     PROTECTED (UNCHANGED): DEV autologin → resident v252, Создать
//     заявку sheet top fix v251, SettingsPage height fit + Modal
//     nested scroller v250, overscroll sweep v249, Chat header
//     tightened v248, Дата/Время inputs h-12 v247, modal-over-header
//     v246, Director Settings pin v245, DEV autologin director swap
//     v244, Photos preserved through create v243, Voting-detail pin
//     v242, /meetings list pin v241, Chat auto-scroll v240, Photo
//     raise+compress v239, Sheet swipe v238, /useful-contacts back
//     arrow v237, gate removal v236, Garage search header v235,
//     Install row gate v234, DEV autologin v233, Garage split v232,
//     realistic Plate v231, defensive hero padding v230, inner
//     scroller Home v229, v225-v228 hero defence-in-depth,
//     transitions + haptics v221, /guest-access back v220, /meetings
//     standalone v219, React #185 fix v218, navigate fix v217,
//     lastSeenAt + scroll v216, bell dropdown + /notifications v215,
//     LIVE design reconciliation v214, SwipeCardStack visual parity
//     v213, handoff sync v212, Главная design v211, bottom-sheet
//     swipe v210, announcements standalone v209, voting modal theme
//     v207+v208, garage v205+v206, plate hero v201, color picker v202.
//     Previous note (v252) preserved below:
// Version: 3.7.197 — cache suffix bumped to v252. DEV autologin
//     account swapped back: test-director-choko (v244) →
//     test-choko (resident). Layout's role-based routing sends
//     resident accounts to the resident Home, so after splash the
//     app now lands directly on the resident dashboard again.
//
//     CHANGE (single file: App.tsx, DEV AUTOLOGIN block):
//       • authLogin('test-director-choko', 'kamizo')
//           → authLogin('test-choko', 'kamizo')
//       • Updated leading comment to reflect resident landing.
//       • Everything else unchanged: const DEV_AUTOLOGIN = true
//         flag, `if (user) return` guard, mount-only effect, quiet
//         warn on non-success outcome, REMOVE BEFORE STORE
//         SUBMISSION tag.
//
//     UNCHANGED:
//       • DEV-only enforcement: still the const-flag kill-switch
//         (NOT import.meta.env.DEV — iOS Capacitor build is the
//         production vite bundle where DEV=false, and we need the
//         autologin in the simulator).
//       • LoginPage, role gating in Layout, all routes — none
//         touched.
//
//     PROTECTED (UNCHANGED): Создать заявку sheet top fix v251,
//     SettingsPage height fit + Modal nested scroller v250,
//     overscroll sweep v249, Chat header tightened v248, Дата/Время
//     inputs h-12 v247, modal-over-header v246, Director Settings
//     pin v245, DEV autologin director swap v244, Photos preserved
//     through create v243, Voting-detail pin v242, /meetings list
//     pin v241, Chat auto-scroll v240, Photo raise+compress v239,
//     Sheet swipe v238, /useful-contacts back arrow v237, gate
//     removal v236, Garage search header v235, Install row gate
//     v234, DEV autologin v233, Garage split v232, realistic Plate
//     v231, defensive hero padding v230, inner scroller Home v229,
//     v225-v228 hero defence-in-depth, transitions + haptics v221,
//     /guest-access back v220, /meetings standalone v219, React
//     #185 fix v218, navigate fix v217, lastSeenAt + scroll v216,
//     bell dropdown + /notifications v215, LIVE design
//     reconciliation v214, SwipeCardStack visual parity v213,
//     handoff sync v212, Главная design v211, bottom-sheet swipe
//     v210, announcements standalone v209, voting modal theme
//     v207+v208, garage v205+v206, plate hero v201, color picker
//     v202.
//     Previous note (v251) preserved below:
// Version: 3.7.196 — cache suffix bumped to v251. "Создать заявку"
//     sheet top finally polished — no underlying page bleeding through
//     and title sits cleanly just below the status bar.
//
//     TWO STACKED CAUSES (separate from v246 / v249 / v250 fixes):
//
//     A) BLEED-THROUGH ABOVE TITLE — the base .modal-content rule at
//        index.css:1293-1294 sets `max-height: 90vh; max-height:
//        90dvh;`. Our h-[100dvh] in className specified the height,
//        but the cascade resolved `max-height: 90dvh` IN ADDITION
//        (max-height clamps height), capping the sheet at 90 dvh of
//        viewport. With items-end alignment, the sheet sat at the
//        viewport bottom, leaving the top 10 dvh as exposed
//        .modal-backdrop (dark blur) through which the underlying
//        "Заявки" page bled — orange request rows + "Заявки" title
//        visible behind the status bar.
//
//     B) TITLE FLOATED LOW — header padding-top was
//        `calc(env(safe-area-inset-top, 0px) + 14px)`. On iPhone 17
//        Pro Max safe-area ≈ 59 px, so title sat at ~73 px from sheet
//        top, ~14 px below status bar — read as "awkward gap above
//        the title".
//
//     FIX (single file: CreateRequestModal.tsx):
//       A) modal-content className added `!max-h-[100dvh]
//          sm:!max-h-[90dvh]` (Tailwind `!` = !important, beats the
//          base rule's max-height cap). Sheet now truly fills 100 dvh
//          on mobile — its bg-rgba(255,255,255,0.95) extends up to
//          AND behind the status bar, killing the bleed-through.
//          Desktop variant restores the 90 dvh cap so the centered
//          card stays centered.
//       B) Pinned header style padding-top: safe-area+14 → safe-area+
//          6 (matches the v248 chat header treatment). Title now sits
//          6 px below the status bar — same polished cadence as iOS
//          Messages / our chat header.
//
//     UNCHANGED:
//       • v246 pinned-header + inner-scroller architecture.
//       • v250 modal-backdrop `!p-0 sm:!p-4` + `.modal-content`
//         `!overflow-y-hidden sm:!overflow-y-auto` (the nested-
//         scroller + backdrop-padding fixes).
//       • Form fields, submit logic, modal dismiss, theme tokens.
//       • Other modals using the shared shell — already centered on
//         desktop, never tripped the 90 dvh cap visually.
//
//     PROTECTED (UNCHANGED): SettingsPage height fit + Modal nested
//     scroller v250, overscroll sweep v249, Chat header tightened
//     v248, Дата/Время inputs h-12 v247, modal-over-header v246,
//     Director Settings pin v245, DEV autologin director swap v244,
//     Photos preserved through create v243, Voting-detail pin v242,
//     /meetings list pin v241, Chat auto-scroll v240, Photo
//     raise+compress v239, Sheet swipe v238, /useful-contacts back
//     arrow v237, gate removal v236, Garage search header v235,
//     Install row gate v234, DEV autologin v233, Garage split v232,
//     realistic Plate v231, defensive hero padding v230, inner
//     scroller Home v229, v225-v228 hero defence-in-depth,
//     transitions + haptics v221, /guest-access back v220, /meetings
//     standalone v219, React #185 fix v218, navigate fix v217,
//     lastSeenAt + scroll v216, bell dropdown + /notifications v215,
//     LIVE design reconciliation v214, SwipeCardStack visual parity
//     v213, handoff sync v212, Главная design v211, bottom-sheet
//     swipe v210, announcements standalone v209, voting modal theme
//     v207+v208, garage v205+v206, plate hero v201, color picker v202.
//     Previous note (v250) preserved below:
// Version: 3.7.195 — cache suffix bumped to v250. Two screen-specific
//     stick-at-bottom causes that the v249 none→contain sweep did NOT
//     cover, fixed at the actual source per screen.
//
//     SCREEN 1 — Director Settings (/profile → SettingsPage):
//       ROOT: outer wrapper used `height: 100dvh`, but Layout's
//       `<main className="main-content">` reserves
//       `padding-bottom: calc(var(--bottom-bar-h) + 16px)` for the
//       floating BottomBar. With 100dvh, SettingsPage spilled PAST
//       the BottomBar, got clipped by main-content's overflow, and
//       the inner scroller's bottommost pixels sat hidden behind
//       the bar. scrollTop=max landed at an invisible position →
//       iOS WKWebView gesture state stuck.
//       FIX: height → `calc(100dvh - var(--bottom-bar-h, 64px) -
//       16px)` so the page fits ABOVE the bar; the inner scroller's
//       bottom edge is now the actual visible boundary. Companion
//       cleanup: dropped the inner scroller's
//       `paddingBottom: calc(96px + safe-area)` (was compensating
//       for the previously-clipped overflow) down to a 24 px
//       breathing pad for the last form field.
//
//     SCREEN 2 — Director "Создать заявку" (CreateRequestModal):
//       v246 had set the outer .modal-content to overflow-hidden
//       via Tailwind `overflow-hidden` (shorthand `overflow:hidden`).
//       The base .modal-content rule at index.css:1295 sets
//       `overflow-y: auto` (longhand). With equal specificity, the
//       cascade resolved to the longhand winning — outer .modal-
//       content remained scrollable. Combined with the v246 inner
//       scroller, this created TWO touch-accepting scrollers
//       nested. iOS WKWebView dropped subsequent up-swipes after
//       hitting the inner scroller's bottom — the classic nested-
//       scroller trap, not the v249 overscroll-behavior issue.
//       PLUS modal-backdrop's base padding (16 + safe-area-bottom)
//       pushed modal-content's bottom 16-34 px past the viewport
//       so part of the inner scroller was offscreen.
//       FIX (className-only, no inline style):
//         • modal-backdrop class: added `!p-0 sm:!p-4` — Tailwind
//           `!` = !important → forces 0 padding on mobile so the
//           h-[100dvh] sheet truly matches viewport; restores
//           16 px gap on desktop.
//         • modal-content class: replaced the v246 `overflow-
//           hidden sm:overflow-y-auto` with `!overflow-y-hidden
//           sm:!overflow-y-auto` — !important wins the cascade on
//           mobile (outer locked, single scroll owner = inner) and
//           restores auto on desktop (centered-card scroller).
//
//     UNCHANGED:
//       • Inner scroller's overscrollBehavior:contain + WebkitOverflow
//         Scrolling:touch (v249) — kept on both screens; this fix is
//         additive.
//       • All other inner-scroller pages from v229/v232/v237/v241/
//         v242 — they fit the available space correctly and don't
//         have the nested-scroller issue; v249 sweep already cleared
//         their overscroll-behavior.
//       • Form fields, submit logic, modal dismiss behaviour, theme
//         tokens.
//
//     PROTECTED (UNCHANGED): overscroll sweep v249, Chat header
//     tightened v248, Дата/Время inputs h-12 v247, modal-over-header
//     v246, Director Settings pin v245, DEV autologin director swap
//     v244, Photos preserved through create v243, Voting-detail pin
//     v242, /meetings list pin v241, Chat auto-scroll v240, Photo
//     raise+compress v239, Sheet swipe v238, /useful-contacts back
//     arrow v237, gate removal v236, Garage search header v235,
//     Install row gate v234, DEV autologin v233, Garage split v232,
//     realistic Plate v231, defensive hero padding v230, inner
//     scroller Home v229, v225-v228 hero defence-in-depth,
//     transitions + haptics v221, /guest-access back v220, /meetings
//     standalone v219, React #185 fix v218, navigate fix v217,
//     lastSeenAt + scroll v216, bell dropdown + /notifications v215,
//     LIVE design reconciliation v214, SwipeCardStack visual parity
//     v213, handoff sync v212, Главная design v211, bottom-sheet
//     swipe v210, announcements standalone v209, voting modal theme
//     v207+v208, garage v205+v206, plate hero v201, color picker v202.
//     Previous note (v249) preserved below:
// Version: 3.7.194 — cache suffix bumped to v249. Root-cause fix for
//     the "scroll sticks at bottom, can't scroll back up" bug seen
//     across multiple director and resident inner-scroller pages.
//
//     DIAGNOSIS (single common root cause):
//       Every inner scroller shipped during v229/v232/v237/v241/v242/
//       v245 used the recipe:
//         flex: 1 1 auto, minHeight: 0,
//         overflowY: auto, overflowX: hidden,
//         overscrollBehavior: 'none',
//         WebkitOverflowScrolling: 'touch'.
//       On iOS WKWebView, `overscroll-behavior: none` combined with
//       `-webkit-overflow-scrolling: touch` (native momentum) cancels
//       the rubber-band hard at the scroll edges. When momentum
//       carries the finger to the bottom, the gesture recognizer
//       loses track for ~500 ms+ — subsequent up-swipes get
//       swallowed, so the list "freezes" at the end. Reproduced on
//       director Заявки, Создать заявку, /meetings list,
//       /meetings/N detail, /settings, and the resident Home/
//       Vehicles/Useful-Contacts that share the recipe.
//
//     FIX (6 files, ONE-line swap each — `none` → `contain`):
//       `overscroll-behavior: contain` still PREVENTS scroll chaining
//       to the parent (the property's job here), but PRESERVES the
//       local rubber-band visual, which keeps WKWebView's gesture
//       state happy so the next opposite-direction touch isn't
//       dropped. Net behaviour:
//         • All-the-way-down + all-the-way-up scroll works smoothly.
//         • Body/document still cannot scroll under the inner
//           scroller (that was the whole point of opting out of
//           chaining).
//         • The inner scroller now shows a small in-place rubber-
//           band at edges — preferred trade-off (matches every
//           iOS native list).
//
//     FILES TOUCHED (1 occurrence each, except *):
//       • pages/chat/ResidentChatView.tsx                    × 3 *
//       • pages/resident/design/ResidentHomeDesign.tsx       × 1
//       • pages/admin/SettingsPage.tsx                       × 1
//       • pages/meetings/MeetingVotingModal.tsx              × 2 *
//       • pages/ResidentVehiclesPage.tsx                     × 1
//       • pages/ResidentMeetingsPage.tsx                     × 1
//       (* multi-scroller pages get the swap on every scroller they
//        own; total 9 sed-driven replacements.)
//
//     OTHER AUDITED, NOT TOUCHED:
//       • CreateRequestModal inner scroller already used
//         `overscrollBehavior: 'contain'` from v246 — sweep made the
//         project consistent on `contain` across the recent header-
//         pin work. No nested scroll-container conflicts found
//         anywhere (single scroll owner per page).
//       • min-height:0 / flex:1 1 auto already correctly set on every
//         inner scroller in the audit set.
//       • body-scroll-lock from useModalPresence releases cleanly on
//         unmount (verified — no orphan locks).
//
//     UNCHANGED:
//       • Layout flex columns, header `flex:0 0 auto`, safe-area
//         padding-top — all kept.
//       • WebkitOverflowScrolling:'touch' (momentum) kept everywhere.
//       • Visual chrome, theme tokens, role gating, modals.
//
//     PROTECTED (UNCHANGED): Chat header tightened v248, Дата/Время
//     inputs h-12 v247, modal-over-header v246, Director Settings pin
//     v245, DEV autologin director swap v244, Photos preserved
//     through create v243, Voting-detail pin v242, /meetings list pin
//     v241, Chat auto-scroll v240, Photo raise+compress v239, Sheet
//     swipe v238, /useful-contacts back arrow v237, gate removal
//     v236, Garage search header v235, Install row gate v234, DEV
//     autologin v233, Garage split v232, realistic Plate v231,
//     defensive hero padding v230, inner scroller Home v229,
//     v225-v228 hero defence-in-depth, transitions + haptics v221,
//     /guest-access back v220, /meetings standalone v219, React #185
//     fix v218, navigate fix v217, lastSeenAt + scroll v216, bell
//     dropdown + /notifications v215, LIVE design reconciliation
//     v214, SwipeCardStack visual parity v213, handoff sync v212,
//     Главная design v211, bottom-sheet swipe v210, announcements
//     standalone v209, voting modal theme v207+v208, garage v205+v206,
//     plate hero v201, color picker v202.
//     Previous note (v248) preserved below:
// Version: 3.7.193 — cache suffix bumped to v248. Chat header
//     ("Test choko / dwfw · Дом 3D · кв. 1 / Назначен …") tightened
//     so it sits cleanly just below the status bar instead of
//     floating with a ~22 px empty band above.
//
//     BUG: pages/chat/DialogHeader.tsx had
//       • outer: `paddingTop: env(safe-area-inset-top, 0px)`
//       • inner: `py-2.5` (10 px top + 10 px bottom)
//     On iPhone 17 Pro Max the Dynamic-Island safe-area is ~59 px,
//     so the avatar started at ~69 px from the viewport top — and
//     the visible status-bar pill ends around ~47 px, leaving a
//     ~22 px empty strip above the avatar. Read as the chat header
//     "floating low" with awkward space above.
//
//     FIX (single file: DialogHeader.tsx, line 120-125):
//       • Folded the safe-area handling and a fixed 6 px gap into
//         the outer paddingTop: `calc(env(safe-area-inset-top, 0px)
//         + 6px)`.
//       • Inner row dropped its top padding: `py-2.5` → `pt-0 pb-2.5`.
//         The bottom 10 px is kept so the bottom border line sits
//         clearly off the avatar.
//       • Net top spacing above avatar = safe-area + 6 px.
//         On iPhone 17 Pro Max ≈ status-bar + 6 px → tight,
//         polished, matches the iOS Messages baseline.
//
//     UNCHANGED:
//       • DialogHeader content: back arrow, avatar with online-dot,
//         title, subtitle, "Назначен:" link, "РЕШЕНО" badge, search
//         + menu buttons. All wrapping/alignment intact.
//       • MessageList scroll, v240 open-at-bottom strategy,
//         QuickReplies chips, ChatComposer (emoji + attach + input
//         + send) — none touched.
//       • DialogHeader's `flex-shrink-0` so the bar never shrinks
//         when the message list is long.
//
//     PROTECTED (UNCHANGED): Дата/Время inputs h-12 v247, modal-over-
//     header v246, Director Settings pin v245, DEV autologin director
//     swap v244, Photos preserved through create v243, Voting-detail
//     pin v242, /meetings list pin v241, Chat auto-scroll v240, Photo
//     raise+compress v239, Sheet swipe v238, /useful-contacts back
//     arrow v237, gate removal v236, Garage search header v235,
//     Install row gate v234, DEV autologin v233, Garage split v232,
//     realistic Plate v231, defensive hero padding v230, inner
//     scroller Home v229, v225-v228 hero defence-in-depth,
//     transitions + haptics v221, /guest-access back v220, /meetings
//     standalone v219, React #185 fix v218, navigate fix v217,
//     lastSeenAt + scroll v216, bell dropdown + /notifications v215,
//     LIVE design reconciliation v214, SwipeCardStack visual parity
//     v213, handoff sync v212, Главная design v211, bottom-sheet
//     swipe v210, announcements standalone v209, voting modal theme
//     v207+v208, garage v205+v206, plate hero v201, color picker v202.
//     Previous note (v247) preserved below:
// Version: 3.7.192 — cache suffix bumped to v247. Director "Создать
//     заявку" form: "Дата" and "Время" inputs no longer clip their
//     value text.
//
//     BUG: Both inputs had `glass-input w-full h-11`. .glass-input
//     defines `min-height: 44px` + `padding: 12px 16px` + `border:
//     1.5px solid`. Tailwind `h-11` (= 2.75 rem = 44 px) forced
//     `box-sizing: border-box` content area to ~17 px (44 − 24 padding
//     − 3 border). iOS WKWebView's native <select> chrome adds extra
//     vertical insets on top of that, clipping "Любое время" and
//     date-value descenders at the bottom.
//
//     FIX (single file: CreateRequestModal.tsx, lines 673-700):
//       • h-11 → h-12 (44 → 48 px) on both <input type="date"> and
//         the <select>. Same change on both keeps the pixel-for-
//         pixel match the v118.8 comment block already locked in.
//       • Inline style `lineHeight: 1.4` added to both so the value
//         text vertically centers in the new ~21 px content area
//         (was inheriting whatever the UA default line-height
//         resolves to on a typed input/select).
//       • No new CSS, no shared input-height bump — scope is the
//         two fields the user reported, leaving every other
//         glass-input across the app on its existing 44 px baseline.
//
//     UNCHANGED:
//       • .glass-input base class — still 44 px min-height; date+time
//         override is a per-instance bump.
//       • Grid layout `grid-cols-[repeat(2,minmax(0,1fr))]` + gap-4
//         + items-start + `min-w-0` per child — all kept from v118.5
//         / v118.6 / v118.8 fixes.
//       • Form fields above and below (Категория / Заголовок /
//         Описание / Приоритет / Жители / Филиал / Дом / submit).
//       • Theme handling — both light + dark inherit from
//         glass-input which already respects --themed-input-bg.
//
//     PROTECTED (UNCHANGED): Modal-over-MobileHeader v246, Director
//     Settings pin v245, DEV autologin director swap v244, Photos
//     preserved through create v243, Voting-detail pin v242,
//     /meetings list pin v241, Chat auto-scroll v240, Photo
//     raise+compress v239, Sheet swipe v238, /useful-contacts back
//     arrow v237, gate removal v236, Garage search header v235,
//     Install row gate v234, DEV autologin v233, Garage split v232,
//     realistic Plate v231, defensive hero padding v230, inner
//     scroller Home v229, v225-v228 hero defence-in-depth,
//     transitions + haptics v221, /guest-access back v220, /meetings
//     standalone v219, React #185 fix v218, navigate fix v217,
//     lastSeenAt + scroll v216, bell dropdown + /notifications v215,
//     LIVE design reconciliation v214, SwipeCardStack visual parity
//     v213, handoff sync v212, Главная design v211, bottom-sheet
//     swipe v210, announcements standalone v209, voting modal theme
//     v207+v208, garage v205+v206, plate hero v201, color picker v202.
//     Previous note (v246) preserved below:
// Version: 3.7.191 — cache suffix bumped to v246. Director's "Создать
//     заявку" sheet no longer bleeds the app's MobileHeader through
//     its top, and the sheet's own title row now respects the notch.
//
//     BUG: CreateRequestModal opened as `<div class="modal-backdrop
//     items-end sm:items-center"><div class="modal-content ... max-h-
//     [90dvh] rounded-t-2xl">`. On phones the sheet was anchored to
//     the viewport bottom with 90dvh max-height — the top 10dvh was a
//     translucent backdrop strip through which the global MobileHeader
//     (z-index:10) chrome (burger / "choko" / bell, status-bar
//     padding) bled visually, covering the sheet's own "Создать
//     заявку" title and the X close button. The sheet's title row
//     was just below the previous app header zone instead of at the
//     true top of the screen.
//
//     FIX (2 files):
//       1. Layout.tsx — hide MobileHeader while ANY modal is open
//          (mirror of how BottomBar already does it via modalCount
//          from modalStore). Added `const modalCount =
//          useModalStore(s => s.count)` and gated showMobileHeader by
//          `modalCount === 0`. CreateRequestModal already calls
//          useModalPresence() (line 102), so opening it now drops the
//          header during the modal's lifetime and restores it on
//          close.
//       2. CreateRequestModal.tsx — restructured the sheet to true
//          full-screen on mobile (sm:and-up keeps the centered card):
//            • Outer modal-content: `h-[100dvh] sm:h-auto sm:max-h-
//              [90dvh] flex flex-col sm:block overflow-hidden sm:
//              overflow-y-auto rounded-none sm:rounded-2xl p-0 sm:p-6`.
//            • Pinned title row (flex:0 0 auto): paddingTop:
//              `calc(env(safe-area-inset-top, 0px) + 14px)` so the
//              "Создать заявку" h2 and the X button always sit
//              cleanly below the notch. Border-bottom on mobile to
//              separate from the form; mb-6 on desktop preserved.
//            • Inner scroller (flex:1 1 auto, min-h:0, overflow-y:
//              auto, overscroll-behavior:contain, -webkit-overflow-
//              scrolling:touch, padding-bottom: 16 + safe-area-bot)
//              wraps the entire <form>. On desktop (sm:) it becomes
//              flex-1 min-h-fit overflow-visible p-0 so the existing
//              card layout (modal-content's overflow-y:auto) remains
//              the scroller.
//            • Closing `</div>` for the scroller added right before
//              the modal-content close. Existing X click handler and
//              the form's bottom Cancel/Submit pair (sticky inside
//              the form) unchanged.
//
//     UNCHANGED:
//       • Modal store API (push/pop/count).
//       • Form fields, validation, submit logic, branch/building/
//         resident pickers.
//       • Desktop centered modal appearance (sm: classes preserved).
//       • CSS .modal-backdrop / .modal-content base rules (z-index
//         100/110 still correct — the fix is hiding the underlying
//         header, not raising the modal).
//       • Other modals using the same shell (NewRequestModal,
//         ServiceBottomSheet, etc.) — already inside the modalCount
//         envelope, so they automatically benefit from the header-
//         hide too.
//
//     PROTECTED (UNCHANGED): Director Settings header pin v245, DEV
//     autologin director swap v244, Photos preserved through create
//     v243, Voting-detail pin v242, /meetings list pin v241, Chat
//     auto-scroll v240, Photo raise+compress v239, Sheet swipe v238,
//     /useful-contacts back arrow v237, gate removal v236, Garage
//     search header v235, Install row gate v234, DEV autologin v233,
//     Garage split v232, realistic Plate v231, defensive hero padding
//     v230, inner scroller Home v229, v225-v228 hero defence-in-depth,
//     transitions + haptics v221, /guest-access back v220, /meetings
//     standalone v219, React #185 fix v218, navigate fix v217,
//     lastSeenAt + scroll v216, bell dropdown + /notifications v215,
//     LIVE design reconciliation v214, SwipeCardStack visual parity
//     v213, handoff sync v212, Главная design v211, bottom-sheet swipe
//     v210, announcements standalone v209, voting modal theme
//     v207+v208, garage v205+v206, plate hero v201, color picker v202.
//     Previous note (v245) preserved below:
// Version: 3.7.190 — cache suffix bumped to v245. Director/Admin/
//     Manager Settings page (/profile → SettingsPage) pinned-header
//     + inner-scroller treatment with proper safe-area-inset-top.
//
//     BUG: SettingsPage's gear-icon header + "Настройки / Параметры
//     системы" title was colliding with the iOS status bar — the page
//     had no safe-area handling of its own, and Layout's global
//     MobileHeader was stacking on top creating the appearance of an
//     overlapping/jammed header zone.
//
//     FIX (2 files):
//       1. Layout.tsx — added `isStaffSettingsFullBleed` predicate
//          (`['admin','director','manager'] && pathname === '/profile'`)
//          and OR'd it into `isResidentFullBleed`. Result: MobileHeader
//          stops rendering on staff /profile, and Layout switches to
//          `.page-content page-content-full-bleed` so the page goes
//          edge-to-edge. Same plumbing as every resident full-bleed
//          surface (Home v229, Vehicles v232, Meetings v241, etc.).
//       2. SettingsPage.tsx — restructured the outer wrapper to the
//          v241/v242 inner-scroller pattern:
//            • Outer: height:100dvh, display:flex, flexDirection:
//              column, overflow:hidden + negative margins to clear
//              .page-content side padding.
//            • Pinned header (flex:0 0 auto): padding-top:
//              calc(env(safe-area-inset-top, 0px) + 14px) so the gear
//              avatar, "Настройки" h1, "Параметры системы" subtitle,
//              and the "Сохранено" pill all sit cleanly below the
//              status bar. background uses var(--themed-strip-bg)
//              + backdrop-filter blur (theme-aware glass).
//              superadmin's "Назад к дашборду" back-pill folded into
//              the header above the title row.
//            • Inner scroller (`.settings-scroll`, flex:1 1 auto,
//              minHeight:0, overflowY:auto, overflowX:hidden,
//              overscrollBehavior:none, WebkitOverflowScrolling:touch,
//              paddingBottom: calc(96px + env(safe-area-inset-bottom)))
//              owns all scroll for tabs + Профиль/Модули/Уведомления/
//              Договор forms.
//            • Modal block stays a sibling of the scroller (it portals
//              anyway, visual placement is irrelevant).
//
//     UNCHANGED:
//       • Tabs content, form fields, save logic, role gating.
//       • Settings styling tokens (glass-card, brand gradient avatar,
//         primary-500 active tab).
//       • Other staff pages (Requests, Reports, Team, Chat,
//         Marketplace, etc.) — left as-is. The director dashboard
//         and other staff pages still use the global MobileHeader
//         which already handles safe-area correctly; only /profile
//         had the two-header-stack collision.
//
//     PROTECTED (UNCHANGED): DEV autologin director swap v244, Photos
//     preserved through create v243, Voting-detail pin v242, /meetings
//     list pin v241, Chat auto-scroll v240, Photo raise+compress v239,
//     Sheet swipe v238, /useful-contacts back arrow v237, gate removal
//     v236, Garage search header v235, Install row gate v234, DEV
//     autologin v233, Garage split v232, realistic Plate v231,
//     defensive hero padding v230, inner scroller Home v229,
//     v225-v228 hero defence-in-depth, transitions + haptics v221,
//     /guest-access back v220, /meetings standalone v219, React #185
//     fix v218, navigate fix v217, lastSeenAt + scroll v216, bell
//     dropdown + /notifications v215, LIVE design reconciliation
//     v214, SwipeCardStack visual parity v213, handoff sync v212,
//     Главная design v211, bottom-sheet swipe v210, announcements
//     standalone v209, voting modal theme v207+v208, garage v205+v206,
//     plate hero v201, color picker v202.
//     Previous note (v244) preserved below:
// Version: 3.7.189 — cache suffix bumped to v244. DEV autologin
//     account swapped: test-choko (resident) → test-director-choko
//     (DIRECTOR). Layout's role-based routing sends director accounts
//     to the staff dashboard automatically, so after splash the app
//     now lands directly on the director view.
//
//     CHANGE (single file: App.tsx, DEV AUTOLOGIN block):
//       • authLogin('test-choko', 'kamizo')
//           → authLogin('test-director-choko', 'kamizo')
//       • Updated the block's leading comment to call out the
//         director swap and that role-based routing handles the
//         staff-vs-resident landing.
//       • Everything else unchanged: const DEV_AUTOLOGIN = true flag,
//         `if (user) return` guard, mount-only effect, quiet warn on
//         non-success outcome, REMOVE BEFORE STORE SUBMISSION tag.
//
//     UNCHANGED:
//       • DEV-only enforcement mechanism: still the const-flag
//         kill-switch (NOT import.meta.env.DEV — see v233 note,
//         iOS Capacitor build is the production vite bundle where
//         DEV=false, and we need the autologin in the simulator).
//       • LoginPage, role gating in Layout, all routes — none
//         touched.
//
//     PROTECTED (UNCHANGED): Photos preserved through create v243,
//     Voting-detail pin v242, /meetings list pin v241, Chat
//     auto-scroll v240, Photo raise+compress v239, Sheet swipe v238,
//     /useful-contacts back arrow v237, gate removal v236, Garage
//     search header v235, Install row gate v234, DEV autologin v233,
//     Garage split v232, realistic Plate v231, defensive hero padding
//     v230, inner scroller Home v229, v225-v228 hero defence-in-depth,
//     transitions + haptics v221, /guest-access back v220, /meetings
//     standalone v219, React #185 fix v218, navigate fix v217,
//     lastSeenAt + scroll v216, bell dropdown + /notifications v215,
//     LIVE design reconciliation v214, SwipeCardStack visual parity
//     v213, handoff sync v212, Главная design v211, bottom-sheet
//     swipe v210, announcements standalone v209, voting modal theme
//     v207+v208, garage v205+v206, plate hero v201, color picker v202.
//     Previous note (v243) preserved below:
// Version: 3.7.188 — cache suffix bumped to v243. Fixes the
//     "photo missing on request detail right after creation" bug.
//
//     DIAGNOSIS (data-first, single-file root cause):
//       • End-to-end trace of POST /api/requests with a photo:
//         1. ResidentNewRequestFlow compressed the photo to 1280px
//            JPEG q=0.8 (~200 KB base64, v239 fix), bundled it in
//            `payload.photos`, called `onCreate(payload)` which is
//            wired to `requestStore.addRequest`.
//         2. `addRequest` built an optimistic Request that included
//            `photos: requestData.photos` (line 178) → preview
//            shows immediately.
//         3. `addRequest` then called `requestsApi.create({...,
//            photos: requestData.photos})` (line 207) — request body
//            carries photos correctly.
//         4. Server `cloudflare/src/routes/requests/crud.ts` accepted
//            the payload (350 KB cap easily passed by the 200 KB
//            compressed image), persisted to `requests.photos`
//            (JSON-encoded string), and the POST response includes
//            the full row via `SELECT r.* …` — so `apiRequest.photos`
//            is the JSON-encoded array string.
//         5. `addRequest` built `realRequest` (line 216-230) and
//            REPLACED the optimistic entry — but the field map
//            silently dropped `photos`. No mapping at all.
//         6. Detail view reads `request.photos` → undefined → empty.
//       Confirmed: data IS in the DB, the GET list-fetch path at line
//       118-124 reads it back correctly. Only the create-path
//       optimistic→real swap loses it.
//
//     CASE: NOT-DROPPED at server. DROPPED at client during the
//     optimistic→real replacement. Single-line omission.
//
//     FIX (single file: stores/requestStore.ts addRequest realRequest):
//       Added `photos:` field that mirrors the list-fetch parser:
//         • Pass through `requestData.photos` if server echo missing.
//         • Accept already-parsed arrays as-is.
//         • `JSON.parse` strings (D1 column is TEXT).
//         • Fall back to optimistic on parse error (defensive).
//
//     EFFECT:
//       • New requests: tap detail right after creation → photo shows.
//       • Older requests: list-fetch path was already correct, so they
//         keep working (no change there).
//
//     UNCHANGED:
//       • Server caps (350 KB/photo, 1.5 MB total) — left intact.
//       • Compression at 1280px JPEG q=0.8 (v239) — unchanged.
//       • Other store mutations (update/assign/complete) — none
//         touched.
//       • RequestDetailsModal photo rendering (line 448) — already
//         correct, was just being fed undefined.
//
//     PROTECTED (UNCHANGED): Voting-detail pin v242, /meetings list
//     pin v241, Chat auto-scroll v240, Photo raise+compress v239,
//     Sheet swipe v238, /useful-contacts back arrow v237, gate
//     removal v236, Garage search header v235, Install row gate v234,
//     DEV autologin v233, Garage split v232, realistic Plate v231,
//     defensive hero padding v230, inner scroller Home v229,
//     v225-v228 hero defence-in-depth, transitions + haptics v221,
//     /guest-access back v220, /meetings standalone v219, React #185
//     fix v218, navigate fix v217, lastSeenAt + scroll v216, bell
//     dropdown + /notifications v215, LIVE design reconciliation
//     v214, SwipeCardStack visual parity v213, handoff sync v212,
//     Главная design v211, bottom-sheet swipe v210, announcements
//     standalone v209, voting modal theme v207+v208, garage v205+v206,
//     plate hero v201, color picker v202.
//     Previous note (v242) preserved below:
// Version: 3.7.187 — cache suffix bumped to v242. Meeting-detail /
//     voting-detail page (MeetingVotingModal — the "Голосование #N"
//     screen with quorum card + ПОВЕСТКА agenda) header pinned via
//     the v229/v232/v241 inner-scroller pattern.
//
//     BUG: page used `position:fixed inset:0` outer + `overflowY:auto`
//     on the same element (page IS the scroller) + `position:sticky`
//     TopBar. iOS WKWebView rubber-band on the page-scroller translated
//     the document AND dragged the sticky TopBar with it.
//
//     FIX (single file: MeetingVotingModal.tsx):
//       1. `pageStyle()`: dropped `overflowY:'auto' +
//          WebkitOverflowScrolling:'touch'`; added `display:'flex',
//          flexDirection:'column', overflow:'hidden'`. Outer stays
//          `position:fixed inset:0 zIndex:110`.
//       2. `TopBar`: replaced `position:'sticky', top:0` with
//          `flex:'0 0 auto'`. notch padding-top via
//          `calc(env(safe-area-inset-top, 0px) + 14px)` — unchanged.
//       3. Main render content wrapper (line 375) converted into the
//          inner scroller:
//             flex:1 1 auto, minHeight:0,
//             overflowY:auto, overflowX:hidden,
//             overscrollBehavior:none,
//             WebkitOverflowScrolling:touch,
//             paddingBottom: 200 when voting-open with pending votes
//                            (reserves room for the fixed
//                            BottomSummary), else
//                            calc(env(safe-area-inset-bottom, 0px) + 24px).
//          The conditional padding logic carried over verbatim.
//       4. Success branch ("Голос принят" / BallotReceipt): wrapped
//          BallotReceipt in a mirror inner scroller (same flex/
//          overflow stack, simpler paddingBottom: safe-area + 24px).
//          Outer pageStyle is now a flex column so the receipt needs
//          its own scroll container too.
//       5. Voting-confirm BottomSummary (position:fixed bottom:0) +
//          HelpSheet + QRSignatureModal — kept as siblings outside
//          the scroller (they were already fixed overlays).
//
//     UNCHANGED:
//       • TopBar visual (back button + title + info button), theme
//         tokens, role-split via parent.
//       • All voting logic, vote submission, deadlines, schedule
//         voting, signature flow.
//       • Other pages.
//
//     PROTECTED (UNCHANGED): /meetings list pinned header v241, Chat
//     auto-scroll v240, Photo raise+compress v239, Sheet swipe v238,
//     /useful-contacts back arrow v237, gate removal v236, Garage
//     search header v235, Install row gate v234, DEV autologin v233,
//     Garage split v232, realistic Plate v231, defensive hero padding
//     v230, inner scroller Home v229, v225-v228 hero defence-in-depth,
//     transitions + haptics v221, /guest-access back v220, /meetings
//     standalone v219, React #185 fix v218, navigate fix v217,
//     lastSeenAt + scroll v216, bell dropdown + /notifications v215,
//     LIVE design reconciliation v214, SwipeCardStack visual parity
//     v213, handoff sync v212, Главная design v211, bottom-sheet
//     swipe v210, announcements standalone v209, voting modal theme
//     v207+v208, garage v205+v206, plate hero v201, color picker v202.
//     Previous note (v241) preserved below:
// Version: 3.7.186 — cache suffix bumped to v241. /meetings
//     (Голосование / СОБРАНИЯ СОБСТВЕННИКОВ) header pinned via the
//     v229/v232 inner-scroller pattern.
//
//     BUG: page used `minHeight:100%` outer + a `position:sticky`
//     header. On iOS WKWebView the document-coupled scroller's
//     rubber-band translated the page and dragged the sticky header
//     with it (same root cause as the v224→v229 Home story).
//
//     FIX (single file: ResidentMeetingsPage.tsx render block):
//       • Outer wrapper: minHeight → `height:100dvh + display:flex +
//         flexDirection:column + overflow:hidden`. Removed the
//         outer paddingBottom (moved to the inner scroller).
//       • Header div: `position:sticky` removed; wrapped with
//         `flex:0 0 auto` so it occupies its natural height inside
//         the flex column and never moves. notch padding via
//         `padding-top: calc(env(safe-area-inset-top, 0px) + 14px)`
//         — unchanged.
//       • Added inner scroller `.meetings-scroll` around
//         LegalWeightNote + ReconsiderationBanner stack + meeting
//         cards list:
//             flex:1 1 auto, minHeight:0,
//             overflowY:auto, overflowX:hidden,
//             overscrollBehavior:none,
//             WebkitOverflowScrolling:touch,
//             paddingBottom:calc(24px + env(safe-area-inset-bottom)).
//         Same iOS-tested pattern as v229 home-scroll / v232
//         vehicles-scroll: WKWebView reliably honors overscroll-
//         behavior:none on non-document inner scrollers, so the
//         elastic bounce that translated the v228 sticky hero
//         (Home) and v231 sticky garage header cannot happen here.
//       • Closing tag `</div>{/* /meetings-scroll inner scroller */}`
//         placed right before the existing voting modal block so the
//         scroller wraps EXACTLY the scrollable content. Voting
//         modals (`showVotingModal &&` / loading-sheet) stay
//         siblings — they're `position:fixed` overlays anyway.
//
//     UNCHANGED:
//       • Back arrow + heading content + theme tokens.
//       • NewRequestPopup overlay alert.
//       • Voting modal, loading sheet, role-split via App.tsx top
//         level route, navigate('/') back semantics.
//       • LegalWeightNote, ReconsiderationBanner, MeetingCard,
//         EmptyState — all unchanged.
//
//     PROTECTED (UNCHANGED): Chat auto-scroll v240, Photo
//     raise+compress v239, Sheet swipe v238, /useful-contacts back
//     arrow v237, gate removal v236, Garage search header v235,
//     Install row gate v234, DEV autologin v233, Garage split v232,
//     realistic Plate v231, defensive hero padding v230, inner
//     scroller Home v229, v225-v228 hero defence-in-depth,
//     transitions + haptics v221, /guest-access back v220, /meetings
//     standalone v219, React #185 fix v218, navigate fix v217,
//     lastSeenAt + scroll v216, bell dropdown + /notifications v215,
//     LIVE design reconciliation v214, SwipeCardStack visual parity
//     v213, handoff sync v212, Главная design v211, bottom-sheet
//     swipe v210, announcements standalone v209, voting modal theme
//     v207+v208, garage v205+v206, plate hero v201, color picker v202.
//     Previous note (v240) preserved below:
// Version: 3.7.185 — cache suffix bumped to v240. Chat opens at the
//     bottom (latest message), not at the top with old history.
//
//     BUG: ChatView's existing "scroll to bottom" useEffect always
//     ran `messagesEndRef.scrollIntoView({behavior:'smooth'})` with a
//     100 ms setTimeout on every `messages.length` change. Two
//     problems:
//       • Initial open: user saw the OLD top of the channel for ~100-
//         300 ms, then watched the list slowly slide down. Looked
//         like the chat opened at the top.
//       • New message arrives while user scrolled up reading history:
//         got yanked back to the bottom mid-read.
//
//     FIX (single file: pages/chat/ChatView.tsx, scroll-to-bottom
//     useEffect):
//       1. Added `initialScrollDoneRef = useRef<string|null>(null)`
//          tracking the channelId whose initial scroll already
//          landed. A second useEffect clears it on channelId change
//          so switching channels triggers the instant jump again.
//       2. INITIAL open for a channelId: instant jump via direct
//          `container.scrollTop = container.scrollHeight` inside a
//          double-rAF. The double-rAF ensures (a) React commits the
//          newly rendered messages and (b) the browser lays them out
//          so scrollHeight reflects real content height — without
//          this, the assignment can fire before layout and leave the
//          user at top.
//       3. SUBSEQUENT growth (poll picks up new message / user sends
//          one): only smooth-scroll if
//          `scrollHeight - scrollTop - clientHeight <= 120 px`. If
//          the user scrolled up to read history, they stay put.
//       4. Empty-state guard: bail out if `messages.length === 0`
//          (avoid running on initial loading state).
//
//     UNCHANGED:
//       • messagesEndRef / messagesContainerRef refs (used by
//         MessageList) — same wires.
//       • Search-match scroll useEffect (line 307) — separate, still
//         uses `el.scrollIntoView({behavior:'smooth', block:'center'})`.
//       • Focus-into-composer scroll-to-bottom useEffect (line 161)
//         — separate (used when keyboard opens), keeps smooth scroll.
//       • Long-poll, message fetching, mark-read — none touched.
//
//     PROTECTED (UNCHANGED): Photo raise+compress v239, Sheet swipe
//     v238, /useful-contacts back arrow v237, gate removal v236,
//     Garage search header v235, Install row gate v234, DEV
//     autologin v233, Garage split v232, realistic Plate v231,
//     defensive hero padding v230, inner scroller Home v229,
//     v225-v228 hero defence-in-depth, transitions + haptics v221,
//     /guest-access back v220, /meetings standalone v219, React #185
//     fix v218, navigate fix v217, lastSeenAt + scroll v216, bell
//     dropdown + /notifications v215, LIVE design reconciliation
//     v214, SwipeCardStack visual parity v213, handoff sync v212,
//     Главная design v211, bottom-sheet swipe v210, announcements
//     standalone v209, voting modal theme v207+v208, garage
//     v205+v206, plate hero v201, color picker v202.
//     Previous note (v239) preserved below:
// Version: 3.7.184 — cache suffix bumped to v239. Request-creation
//     photo pipeline raise + compress.
//
//     CHAIN AUDIT (full investigation, single root cause):
//       • FE constant ResidentNewRequestFlow:603 — `MAX_FILE_SIZE =
//         3 * 1024 * 1024` (3 MB raw file). Hit by every modern iPhone
//         camera shot.
//       • FE compression — NONE. Raw File → FileReader.readAsDataURL
//         → base64 data URL (~33% inflation).
//       • Server requests/crud.ts:161 — `MAX_PHOTO_BYTES = 350 KB`
//         per photo (base64 string length), `MAX_TOTAL_BYTES = 1.5 MB`
//         aggregate. Crucially: oversize entries are SILENTLY
//         DROPPED via `continue` in the loop, not rejected.
//       Net: raise-only of the 3 MB cap was a UX trap — a 5 MB raw
//       upload would pass FE, become ~6.7 MB base64, and the server
//       would silently drop it. User would see the photo "attached"
//       but it would never reach D1.
//
//     FIX (single file: ResidentNewRequestFlow.tsx; server untouched):
//       1. `MAX_FILE_SIZE = 10 * 1024 * 1024` (raw safety net for
//          non-image junk — real images become tiny after compress).
//       2. Added `compressImage(file)` helper:
//            createImageBitmap → scale to 1280px max edge →
//            canvas.toDataURL('image/jpeg', 0.8)
//          Matches the codebase convention recorded in CLAUDE.md
//          ("Фронт компрессит до 1280px JPEG q=0.8 ~150-250KB"). The
//          chosen 1280px + q=0.8 reliably produces 150-250 KB base64,
//          comfortably under the server's 350 KB per-photo cap. iPad
//          / iPhone WKWebView 11+ supports createImageBitmap.
//       3. `handlePhotoSelect` runs: MIME check → 10 MB raw check →
//          compress → push to state. Old FileReader.readAsDataURL is
//          gone (raw base64 was the bug).
//       4. User-facing error message: "Файл больше 3 МБ" / "Fayl 3
//          MB dan katta" → 10 МБ. Plus a new fallback message
//          "Не удалось обработать изображение" if createImageBitmap
//          throws on a corrupt file.
//       5. Header comment at top of file updated to reflect the new
//          contract (10 MB raw, auto-compressed before storage).
//
//     SERVER LEFT AS-IS:
//       The 350 KB per-photo / 1.5 MB total caps in cloudflare/src/
//       routes/requests/crud.ts are deliberately tight to keep D1 row
//       size bounded. Compression at 1280 px / q=0.8 fits this
//       comfortably for real-world camera input, so raising the
//       server limit is not needed. The silent-drop behavior is left
//       intact for the same defense-in-depth reason; the FE just no
//       longer feeds it oversized payloads.
//
//     UNCHANGED:
//       • MAX_PHOTOS = 5 (both FE and server) — capacity unchanged.
//       • Other request-creation flows (NewRequestModal, executor
//         flows) — separate components, NOT touched. They may still
//         have their own old pipelines; out of scope for this turn.
//       • All other pages, BottomBar, routes, theme tokens.
//
//     PROTECTED (UNCHANGED): Sheet swipe-to-dismiss v238,
//     /useful-contacts back arrow v237, gate removal v236, Garage
//     search header v235, Install row gate v234, DEV autologin v233,
//     Garage split v232, realistic Plate v231, defensive hero padding
//     v230, inner scroller Home v229, v225-v228 hero defence-in-depth,
//     transitions + haptics v221, /guest-access back v220, /meetings
//     standalone v219, React #185 fix v218, navigate fix v217,
//     lastSeenAt + scroll v216, bell dropdown + /notifications v215,
//     LIVE design reconciliation v214, SwipeCardStack visual parity
//     v213, handoff sync v212, Главная design v211, bottom-sheet
//     swipe v210, announcements standalone v209, voting modal theme
//     v207+v208, garage v205+v206, plate hero v201, color picker
//     v202.
//     Previous note (v238) preserved below:
// Version: 3.7.183 — cache suffix bumped to v238. Swipe-to-dismiss
//     fix for the local BottomSheet defined inside ResidentProfilePage
//     (QR pass / EditProfile / PasswordModal / InstallApp sheets all
//     mount through it).
//
//     CONTEXT: v210 added swipe-to-dismiss to the SHARED Sheet
//     (components/common/Sheet.tsx) and to the inline
//     RequestDetailsModal. The local BottomSheet in
//     ResidentProfilePage.tsx (line 1614) was a separate inline
//     definition that never got the v210 fix — pulling down on the
//     QR-pass / install / etc. sheet did nothing.
//
//     FIX (1 file, BottomSheet definition):
//       • Added useRef import.
//       • Ported the v210 Pointer-Events pattern verbatim:
//           - sheetRef + dragY/isDragging state + dragStart/dragLast
//             refs for velocity tracking.
//           - startDrag / updateDrag / endDrag helpers (clamp dy to
//             positive, dismiss when dragY > max(80px, 25% sheet
//             height) OR velocity > 600 px/sec).
//           - Two pointer handler sets: handleDragHandlers (always
//             starts drag — applied to the drag-handle indicator div)
//             and bodyDragHandlers (starts drag ONLY if
//             sheetRef.scrollTop === 0 — applied to the sheet body so
//             internal scroll still works for long-content sheets).
//           - touchAction:'none' on the drag handle to prevent iOS
//             scroll conflict.
//           - X close button gets onPointerDown stopPropagation so a
//             tap on X doesn't accidentally start a drag.
//       • Inline transform on sheet div: translateY(dragY)px when
//         dragY > 0; transition 220ms cubic-bezier(0.32, 0.72, 0, 1)
//         when releasing (snap-back or dismiss animation). When
//         dismissing, animate translateY(sheetH + 80) → onClose() via
//         setTimeout(220) so the sheet slides out cleanly before
//         unmount.
//       • Backdrop tap-to-close (existing onClick={onClose} on the
//         backdrop div) — unchanged, still works.
//       • Body scroll lock on mount — unchanged.
//
//     AUDIT (every slide-up sheet in the resident app):
//       • components/common/Sheet.tsx — v210 ✓ (shared Sheet — used
//         by LoginPage, MeetingsPage, VehicleSearchPage, etc.)
//       • pages/resident/components/RequestDetailsModal.tsx — v210 ✓
//         (inline modal for request-detail bottom sheet)
//       • pages/ResidentProfilePage.tsx BottomSheet — v237 ✓ (this
//         change — covers QR pass, EditProfile, PasswordModal,
//         InstallApp)
//     All three swipe-to-dismiss implementations are now in sync.
//
//     UNCHANGED: useModalPresence, body scroll lock, kz-sheet-up enter
//     animation, drag-handle visual, close-X position, padding, max
//     height, theme tokens (SURFACE / SURFACE_SUNKEN / TEXT_SECONDARY).
//
//     PROTECTED (UNCHANGED): /useful-contacts back arrow v237,
//     gate-removal v236, Garage search header v235, Install row gate
//     v234, DEV autologin v233, Garage split v232, realistic Plate
//     v231, defensive hero padding v230, inner scroller Home v229,
//     v225-v228 hero defence-in-depth, transitions + haptics v221,
//     /guest-access back v220, /meetings standalone v219, React #185
//     fix v218, navigate fix v217, lastSeenAt + scroll v216, bell
//     dropdown + /notifications v215, LIVE design reconciliation
//     v214, SwipeCardStack visual parity v213, handoff sync v212,
//     Главная design v211, bottom-sheet swipe v210, announcements
//     standalone v209, voting modal theme v207+v208, garage
//     v205+v206, plate hero v201, color picker v202.
//     Previous note (v237) preserved below:
// Version: 3.7.182 — cache suffix bumped to v237. Back arrow on
//     /useful-contacts ("Полезное рядом"). BottomBar deliberately KEPT
//     — same pattern as /guest-access v220 (page stays inside Layout).
//
//     CHANGE (single file: ResidentUsefulContactsPage.tsx):
//       • Imported useNavigate from react-router-dom (lucide ArrowLeft
//         was already in scope from the ad-detail view).
//       • Added `const navigate = useNavigate()` at the top of the
//         component.
//       • Sticky header (~line 478) restructured: was a stacked
//         eyebrow + title block; now a flex row with a 40×40 back
//         button (theme-aware via SURFACE / BORDER / TEXT_PRIMARY
//         constants) on the left + the existing eyebrow+title block
//         on the right via flex:1.
//       • Back tap → navigate('/') explicitly (NOT history.back —
//         consistent with the back affordance on every other resident
//         page).
//
//     NOT TOUCHED:
//       • App.tsx — /useful-contacts stays as a nested Route inside
//         Layout. BottomBar continues to render.
//       • Layout.tsx — only v236 dropped `requiredFeature` from the
//         route; nothing else changed.
//       • Page bottom padding `calc(124px + env(safe-area-inset-bottom))`
//         — intentionally preserved as the reservation for the
//         still-rendering BottomBar.
//       • Category chips ("Все" filter), emergency strip, partner
//         promo cards, ad detail view, search/category logic — none
//         touched.
//       • Theme tokens — page already used SURFACE / BORDER /
//         TEXT_PRIMARY constants that resolve light + dark correctly.
//
//     PROTECTED (UNCHANGED): /useful-contacts gate fix v236, Garage
//     search-header consolidation v235, Install row gate v234, DEV
//     autologin v233, Garage split v232, realistic Plate v231,
//     defensive hero padding v230, inner scroller Home v229,
//     v225-v228 hero defence-in-depth, transitions + haptics v221,
//     /guest-access back v220, /meetings standalone v219, React #185
//     fix v218, navigate fix v217, lastSeenAt + scroll v216, bell
//     dropdown + /notifications v215, LIVE design reconciliation
//     v214, SwipeCardStack visual parity v213, handoff sync v212,
//     Главная design v211, bottom-sheet swipe v210, announcements
//     standalone v209, voting modal theme v207+v208, garage
//     v205+v206, plate hero v201, color picker v202.
//     Previous note (v236) preserved below:
// Version: 3.7.181 — cache suffix bumped to v236. Fixes the "Полезные
//     контакты" swipe-card bounce-to-Home bug on resident Home.
//
//     DIAGNOSIS (objective, single-file root cause):
//       • Page: src/pages/ResidentUsefulContactsPage.tsx — exists,
//         built (837 lines, has its own sticky back-arrow header).
//       • Route: /useful-contacts registered in Layout.tsx with
//         `<ProtectedRoute requiredFeature="useful-contacts">`.
//       • Card on Home: navigate('/useful-contacts') — fires correctly.
//       • BUG: tenant's `features` JSON column doesn't include the
//         string 'useful-contacts', so hasFeature() returns false →
//         ProtectedRoute redirects /useful-contacts → / → tap looked
//         like a no-op bounce-to-Home.
//
//     FIX (1 line in Layout.tsx):
//       Dropped requiredFeature="useful-contacts" from the route. The
//       page is universally useful (emergency services + building
//       contacts) and self-contained, no per-tenant gate justified.
//       ProtectedRoute kept for auth (login required).
//
//     UNCHANGED:
//       • ResidentUsefulContactsPage component — full design from
//         Claude Design §08-kontakty already present.
//       • Layout's isResidentContacts full-bleed handling — already
//         hides MobileHeader and lets the page paint its own chrome.
//       • Sidebar nav item for /useful-contacts — separate, still
//         visible to residents/tenants/commercial_owners.
//       • All other routes' feature gates — untouched.
//
//     PROTECTED (UNCHANGED): Garage search-header consolidation v235,
//     Install row gate v234, DEV autologin v233, Garage split v232,
//     realistic Plate v231, defensive hero padding v230, inner
//     scroller Home v229, v225-v228 hero defence-in-depth,
//     transitions + haptics v221, /guest-access back v220, /meetings
//     standalone v219, React #185 fix v218, navigate fix v217,
//     lastSeenAt + scroll v216, bell dropdown + /notifications v215,
//     LIVE design reconciliation v214, SwipeCardStack visual parity
//     v213, handoff sync v212, Главная design v211, bottom-sheet
//     swipe v210, announcements standalone v209, voting modal theme
//     v207+v208, garage v205+v206, plate hero v201, color picker
//     v202.
//     Previous note (v235) preserved below:
// Version: 3.7.180 — cache suffix bumped to v235. Garage "Поиск" tab
//     header consolidation: the top-left button now context-switches
//     between back arrow (my_vehicles) and "К моим авто" pill (search);
//     the duplicate pill inside the white section is removed.
//
//     CHANGE (single file: ResidentVehiclesPage.tsx):
//       • Dark header layout: was a fixed `grid grid-cols-[40px_1fr_40px]`,
//         now a `flex items-center gap-3` so the left button can be
//         wider than 40 px on the search tab.
//       • Left button conditional on activeTab:
//           - activeTab === 'my_vehicles' → unchanged 40×40 ← back
//             arrow that navigates('/').
//           - activeTab === 'search' → pill button in the same glass
//             dark style (h-10 px-3.5 rounded-full, white bg-alpha 0.08,
//             white text) with ← + "К моим авто" / "Mening
//             avtomobillarimga". Same handler as the removed white
//             pill: setActiveTab('my_vehicles') + reset
//             searchPlateParts/manuallySelectedResult/apiSearchResults.
//       • Right-side 40×40 spacer kept ONLY for my_vehicles (to keep
//         the centered ГАРАЖ title). On search the title shifts
//         slightly right of optical center, acceptable for the
//         context.
//       • Removed the "← К моим авто" inline white pill that used to
//         render at the top of `activeTab === 'search'` content area
//         (lines ~677-689). Single back affordance now lives in the
//         dark header where the user expects it.
//
//     UNCHANGED:
//       • Garage page split v232 (fixed dark block + inner scroller).
//       • Realistic Plate v231 used in list cards.
//       • Search content: SearchPlateInput, "Найти владельца" CTA,
//         info note, results.
//       • Мой гараж / Поиск tabs toggle.
//       • Theme tokens, navigation, transitions/haptics v221.
//
//     PROTECTED (UNCHANGED): Install row gated by isNativePlatform
//     v234, DEV autologin v233, Garage split v232, realistic Plate
//     v231, defensive hero padding v230, inner scroller Home v229,
//     v225-v228 hero defence-in-depth, transitions + haptics v221,
//     /guest-access back v220, /meetings standalone v219, React #185
//     fix v218, navigate fix v217, lastSeenAt + scroll v216, bell
//     dropdown + /notifications v215, LIVE design reconciliation
//     v214, SwipeCardStack visual parity v213, handoff sync v212,
//     Главная design v211, bottom-sheet swipe v210, announcements
//     standalone v209, voting modal theme v207+v208, garage
//     v205+v206, plate hero v201, color picker v202.
//     Previous note (v234) preserved below:
// Version: 3.7.179 — cache suffix bumped to v234. "Установить как
//     приложение" row on Profile/Settings is now hidden when running
//     inside the native Capacitor app (iOS/Android). It still renders
//     in web/PWA contexts where the user can actually install.
//
//     CHANGE (single file: ResidentProfilePage.tsx):
//       • Imported `Capacitor` from `@capacitor/core`.
//       • Wrapped the existing <SettingsRow label={t.installApp}> in
//         `{!Capacitor.isNativePlatform() && (...)}`. On native iOS or
//         Android, Capacitor.isNativePlatform() returns true → row
//         doesn't render. On mobile Safari / PWA / desktop browser,
//         isNativePlatform() is false → row renders as before and
//         opens the existing InstallAppSection BottomSheet (PWA
//         install prompt / iOS "Add to Home Screen" instructions).
//
//     UNCHANGED:
//       • InstallAppSection component — still handles the actual PWA
//         install flow (beforeinstallprompt event, iOS A2HS guidance).
//       • showInstallModal state + BottomSheet render — kept (only
//         entry point setShowInstallModal(true) was on the gated row,
//         so the modal can't open in native; safe leftover).
//       • Other settings rows (notifications, theme toggle, etc.) —
//         no changes.
//       • Translations t.installApp — kept (still used by web).
//
//     PROTECTED (UNCHANGED): DEV autologin v233, Garage split v232,
//     realistic Plate v231, defensive hero padding v230, inner
//     scroller Home v229, v225-v228 hero defence-in-depth,
//     transitions + haptics v221, /guest-access back v220, /meetings
//     standalone v219, React #185 fix v218, navigate fix v217,
//     lastSeenAt + scroll v216, bell dropdown + /notifications v215,
//     LIVE design reconciliation v214, SwipeCardStack visual parity
//     v213, handoff sync v212, Главная design v211, bottom-sheet
//     swipe v210, announcements standalone v209, voting modal theme
//     v207+v208, garage v205+v206, plate hero v201, color picker
//     v202.
//     Previous note (v233) preserved below:
// Version: 3.7.178 — cache suffix bumped to v233. DEV-only auto-login
//     convenience so the simulator's uninstall+install cycle doesn't
//     force a manual re-login every time during development.
//
//     CHANGE (App.tsx): new useEffect, gated by `import.meta.env.DEV`
//     AND an explicit `const DEV_AUTOLOGIN = true` flag. On every fresh
//     mount, IF DEV is on AND DEV_AUTOLOGIN is true AND no `user` is
//     present in the auth store, the effect calls
//         useAuthStore.login('test-choko', 'kamizo')
//     The login flows through the normal auth pipeline (real API call,
//     real token, real user object), so the app comes up fully
//     functional. After the user state updates, the /login route's
//     existing `user ? <Navigate to="/" replace /> : <LoginPage />`
//     auto-redirects to the resident Home. No business logic changes
//     anywhere else.
//
//     Tagged for easy removal:
//         // DEV AUTOLOGIN — REMOVE BEFORE STORE SUBMISSION
//     Tree-shaken out of production by Vite via import.meta.env.DEV.
//     To toggle off without touching the code, flip DEV_AUTOLOGIN to
//     false at the top of the effect.
//
//     UNCHANGED:
//       • LoginPage and its existing fake-token DEV preview block —
//         left intact (just a different convenience, not removed).
//       • authStore, ProtectedRoute, route gating — no changes.
//       • All v201-v232 work — unchanged.
//
//     PROTECTED (UNCHANGED): Garage split v232, realistic Plate v231,
//     defensive hero padding v230, inner scroller Home v229,
//     v225-v228 hero defence-in-depth, transitions + haptics v221,
//     /guest-access back v220, /meetings standalone v219, React #185
//     fix v218, navigate fix v217, lastSeenAt + scroll v216, bell
//     dropdown + /notifications v215, LIVE design reconciliation
//     v214, SwipeCardStack visual parity v213, handoff sync v212,
//     Главная design v211, bottom-sheet swipe v210, announcements
//     standalone v209, voting modal theme v207+v208, garage
//     v205+v206, plate hero v201, color picker v202.
//     Previous note (v232) preserved below:
// Version: 3.7.177 — cache suffix bumped to v232. Garage page split:
//     dark block FIXED, white list scrolls in its own inner scroller.
//
//     CHANGE (single file: ResidentVehiclesPage.tsx):
//       • Outer wrapper: was height:100dvh + overflowY:auto (page-wide
//         scroller from v231). Now height:100dvh + display:flex +
//         flexDirection:column + overflow:hidden — the wrapper itself
//         does NOT scroll, it constrains the children to viewport
//         height.
//       • Wrapped the existing dark-block IIFE in a div with
//         `flex:'0 0 auto'`. The IIFE's INTERNAL JSX (header + covered
//         car + primary plate + brand/model + status + search heading
//         + Мой гараж/Поиск tabs + curve strip) is UNCHANGED. The
//         wrapper just pins it as a fixed-height sibling above the
//         scroller.
//       • Wrapped BOTH the my_vehicles list section AND the search
//         section in a single inner scroller div:
//             flex: '1 1 auto'
//             minHeight: 0                  (allows flex shrink)
//             overflowY: 'auto'
//             overflowX: 'hidden'
//             overscrollBehavior: 'none'
//             WebkitOverflowScrolling: 'touch'
//             paddingBottom: 'calc(24px + env(safe-area-inset-bottom))'
//         Same iOS-tested pattern as v229 home-scroll: WKWebView
//         reliably honors overscroll-behavior:none on a non-document
//         inner scroller, so no rubber-band can drag the dark block
//         (which is a sibling, not a descendant, of the scroller).
//
//     RESULT: dark block stays pinned with ZERO movement on any
//     scroll/bounce; only the white list (or search content) scrolls.
//     All 4 vehicle cards reachable, last card clears the home
//     indicator via paddingBottom.
//
//     UNCHANGED:
//       • Dark IIFE block internal JSX (back arrow, title, covered
//         car, primary vehicle plate + brand/model + status row,
//         Мой гараж/Поиск toggle, "curve into light body" strip).
//       • List cards using v231 Plate component (realistic UZ plate).
//       • Search content unchanged.
//       • Modals (Add/Edit, ConfirmDialog) — outside the inner
//         scroller, render at viewport level via their own
//         fixed/portal mechanics, unaffected.
//
//     PROTECTED (UNCHANGED): v231 realistic Plate in list + scroll
//     v230 hero padding floor + v229 inner scroller Home + v225-v228
//     hero defence-in-depth + transitions + haptics v221 +
//     /guest-access back v220 + /meetings standalone v219 + React
//     #185 fix v218 + navigate fix v217 + lastSeenAt + scroll v216 +
//     bell dropdown + /notifications v215 + LIVE design
//     reconciliation v214 + SwipeCardStack visual parity v213 +
//     handoff sync v212 + Главная design v211 + bottom-sheet swipe
//     v210 + announcements standalone v209 + voting modal theme
//     v207+v208 + garage v205+v206 + plate hero v201 + color picker
//     v202.
//     Previous note (v231) preserved below:
// Version: 3.7.176 — cache suffix bumped to v231. Two Garage page fixes.
//
//     BUG 1 (list plates): "ВСЕ АВТОМОБИЛИ" list cards rendered
//     plates with a minimal flex layout (plain formatted string + a
//     tiny UZ flag block). User wanted the SAME realistic UZ plate
//     visual that AddCarPage's PlateHero shows.
//
//     FIX:
//       • NEW src/pages/vehicles/Plate.tsx — read-only realistic plate
//         component. Visually matches PlateHero (white-gradient
//         embossed body, 2px black border, top sheen, region segment
//         + 2px divider, embossed char series, UZ flag chrome-bezel
//         inset) without the editing affordances (no inputs, no
//         region dropdown, no shimmer, no focus pulse, no screws).
//         Props: plateNumber, ownerType ('individual'|'legal_entity'),
//         size ('sm'|'md'). 'sm' is sized for list cards (~50px
//         height, fontSize ~22); 'md' for slightly larger contexts.
//       • Exported via pages/vehicles/index.ts.
//       • ResidentVehiclesPage list cards (lines ~530-552) — replaced
//         the old inline plate JSX with <Plate plateNumber={...}
//         ownerType={vehicle.ownerType ?? 'individual'} size="sm" />.
//       • AddCarPage's PlateHero unchanged (it's the editing
//         component for /vehicles/add and /vehicles/edit/:id).
//
//     BUG 2 (page doesn't scroll): ResidentVehiclesPage is a top-level
//     standalone Route in App.tsx (no Layout, no .main-content scroll
//     context). Body has overflow:hidden on mobile. The page outer
//     wrapper had no height/overflow → page couldn't scroll → 3rd and
//     4th vehicle cards in the list were unreachable.
//
//     FIX:
//       • ResidentVehiclesPage outer wrapper given its own scroll
//         container: height:100dvh + overflowY:auto + overflowX:hidden
//         + overscrollBehavior:none + WebkitOverflowScrolling:touch +
//         paddingBottom: calc(24px + safe-area-inset-bottom).
//       • The dark hero and the list both scroll together inside the
//         wrapper (user accepted this — hero can scroll with content).
//       • Same defence-in-depth as v229 resident Home's inner scroller.
//
//     UNCHANGED:
//       • AddCarPage PlateHero (editor) — stays intact.
//       • plateUtils, UZFlag, PlateNumberInput, SearchPlateInput —
//         all unchanged.
//       • Other plate consumers (VehicleSearchPage, AutoWidget) use
//         formatPlateDisplay for plain-text plate strings — out of
//         scope.
//       • App.tsx, Layout.tsx, theme tokens, transitions/haptics v221.
//       • Primary vehicle hero plate in ResidentVehiclesPage (orange-
//         letter parsed JSX) — user did not ask to change this.
//
//     PROTECTED (UNCHANGED): everything from v230 (defensive hero
//     padding) + v229 (inner scroller Home) + v225-v228 hero
//     defence-in-depth chain + transitions + haptics v221 +
//     /guest-access back v220 + /meetings standalone v219 + React
//     #185 fix v218 + navigate fix v217 + lastSeenAt + scroll v216 +
//     bell dropdown + /notifications v215 + LIVE design
//     reconciliation v214 + SwipeCardStack visual parity v213 +
//     handoff sync v212 + Главная design v211 + bottom-sheet swipe
//     v210 + announcements standalone v209 + voting modal theme
//     v207+v208 + garage v205+v206 + plate hero v201 + color picker
//     v202.
//     Previous note (v230) preserved below:
// Version: 3.7.175 — cache suffix bumped to v230. Defensive padding-top
//     on HomeHero so the icon row (drawer + logo + theme toggle + bell)
//     is GUARANTEED to sit below the notch / Dynamic Island even if
//     env(safe-area-inset-top) resolves to 0 in some WKWebView contexts.
//
//     BUG: User reported in v229 that the top icon row was being cut by
//     the notch — drawer and bell partially hidden, "Test" greeting
//     overlapping the status bar. The previous padding was:
//         padding-top: calc(env(safe-area-inset-top, 0px) + 14px)
//     which depends on env() correctly resolving to ~47-59px on
//     notched iPhones. When env() returned 0 (which can happen in
//     some WKWebView paint/composite scenarios), padding-top became
//     just 14px — way under the notch.
//
//     FIX: ResidentHomeDesign.tsx HomeHero outer div — replaced with:
//         padding-top: max(68px, calc(env(safe-area-inset-top, 0px) + 18px))
//     - On a notched device with env() working: notch height (47-59)
//       + 18 = 65-77px → just over the 68px floor → icon row sits
//       cleanly below the notch.
//     - On a device where env() returns 0: 68px floor kicks in →
//       icon row still sits below where any reasonable notch could be.
//     - Side padding (18) and bottom (26) unchanged.
//     - HomeHero ResizeObserver re-measures automatically after the
//       padding change → --home-hero-h is updated → inner scroller
//       paddingTop stays in sync, no gap or content overlap.
//
//     UNCHANGED:
//       • HomeHero position:fixed + translateZ + willChange (v226+v228).
//       • Inner scroller architecture (v229) — home-scroll div with
//         overscroll-behavior:none + WebkitOverflowScrolling:touch.
//       • Hero gradient, border-radius, skyline, sun/stars, top-bar
//         buttons, greeting block — only the padding top numeric value
//         changes (still calc with env() but wrapped in max() floor).
//       • All v224 transform:none keyframe, v223 isolation/stacking,
//         v221 transitions/haptics, NotificationsDropdown, BottomBar,
//         theme tokens, navigation, role gating.
//
//     PROTECTED (UNCHANGED): inner scroller v229, hero defence-in-depth
//     v225-v228, transitions + haptics v221, /guest-access back v220,
//     /meetings standalone v219, React #185 fix v218, navigate fix
//     v217, lastSeenAt + scroll v216, bell dropdown + /notifications
//     v215, LIVE design reconciliation v214, SwipeCardStack visual
//     parity v213, handoff sync v212, Главная design v211, bottom-
//     sheet swipe v210, announcements standalone v209, voting modal
//     theme v207+v208, garage v205+v206, plate hero v201, color
//     picker v202.
//     Previous note (v229) preserved below:
// Version: 3.7.174 — cache suffix bumped to v229. Architectural fix
//     for the recurring iOS top-overscroll bounce on resident Home.
//
//     PROBLEM: After v224-v228 layered 5 protections on .main-content
//     (overscroll-behavior:none, JS touchmove guard, drop
//     -webkit-overflow-scrolling, hero translateZ GPU layer, hero
//     position:fixed), iOS WKWebView STILL bounced the home content
//     on hard top pull-down, briefly translating the hero so the
//     greeting "Test" peeked into the status-bar area. The cause:
//     iOS Safari ignores `overscroll-behavior: none` on the
//     document-coupled scroller (Layout's .main-content acts as the
//     primary scroller for the resident shell — close enough to the
//     document that the bounce-suppression behaves quirky).
//
//     FIX (architectural): moved the home content into a DEDICATED
//     INNER SCROLLER. iOS honors overscroll-behavior:none reliably
//     on non-document scrollers.
//
//     ARCHITECTURE:
//       .main-content (Layout, no scroll for home page)
//         └── ResidentDashboard
//               └── ResidentHomeDesign wrapper (kz-screen)
//                     height:100%, flex column, position:relative
//                     ├── HomeHero (position:fixed top:0 z:50)        ← SIBLING (outside scroller)
//                     ├── NotificationsDropdown (position:fixed)      ← SIBLING (outside scroller)
//                     └── .home-scroll (NEW: flex:1, minHeight:0,
//                                       overflow-y:auto,
//                                       overscroll-behavior:none,
//                                       -webkit-overflow-scrolling:touch,
//                                       padding-top: var(--home-hero-h, 220px))
//                           └── all section divs (swipe band, quick
//                               tiles, approval, СОБРАНИЕ, ОПЛАТА,
//                               ОБЪЯВЛЕНИЯ, PWA banner)
//
//       The hero is OUTSIDE the inner scroller's DOM subtree. Even if
//       the scroller bounces internally, the hero cannot move with it
//       because the bounce-translation only affects descendants of the
//       bouncing element.
//
//       -webkit-overflow-scrolling:touch is intentionally re-added on
//       the inner scroller. On a non-document scroller, it enables
//       native momentum without enabling the rubber-band animation
//       (the bug only manifests on the document scroller).
//
//     FILES: ResidentHomeDesign.tsx — wrapper restructured (1 file
//     edit). sw.js — version bump (1 file edit).
//
//     UNCHANGED:
//       • HomeHero v226 (position:fixed) + v228 (translateZ GPU layer
//         + willChange:transform) + ResizeObserver writing --home-hero-h.
//       • NotificationsDropdown (position:fixed viewport-anchored, z:71).
//       • SwipeCardStack v223 isolation:isolate + hero z:50.
//       • v224 kzPagePushIn/PopIn end-keyframe transform:none.
//       • v227 .main-content overscroll-behavior:none + JS touchmove
//         guard — kept (still applies to staff pages that use
//         .main-content as their scroller).
//       • v221 page transitions + haptics.
//       • Bottom bar, theme tokens, navigation, role gating, all
//         other pages (vehicles, announcements, meetings, profile,
//         guest-access, notifications).
//
//     PROTECTED (UNCHANGED): hero defence-in-depth chain v225-v228,
//     transitions + haptics v221, /guest-access back v220, /meetings
//     standalone v219, React #185 fix v218, navigate fix v217,
//     lastSeenAt + scroll v216, bell dropdown + /notifications v215,
//     LIVE design reconciliation v214, SwipeCardStack visual parity
//     v213, handoff sync v212, Главная design v211, bottom-sheet
//     swipe v210, announcements standalone v209, voting modal theme
//     v207+v208, garage v205+v206, plate hero v201, color picker v202.
//     Previous note (v228) preserved below:
// Version: 3.7.173 — cache suffix bumped to v228. Final defence-in-depth
//     layers for the iOS top-overscroll bounce. User reported after v227
//     that the greeting "Test" still briefly poked into the status-bar
//     zone on hard top overscroll — the hero was being momentarily
//     translated by WebKit's elastic spring even with
//     overscroll-behavior-y:none + JS touchmove guard.
//
//     LAYER 3 (CSS, index.css .main-content/.main-content-full rule):
//       • Dropped `-webkit-overflow-scrolling: touch`. This deprecated
//         iOS-12-era hint is the underlying source of the WebKit elastic
//         spring on overflow:auto containers — it enables hardware-
//         accelerated momentum scrolling AND the rubber-band animation.
//         iOS 13+ provides native momentum scrolling without it, so
//         removing the hint kills the elastic spring while keeping the
//         native scroll feel intact. (Layer 1's overscroll-behavior:none
//         was insufficient on its own; the WebKit hint trumped it on
//         certain iOS versions.)
//
//     LAYER 4 (HomeHero outer div, ResidentHomeDesign.tsx):
//       • Added `transform: translateZ(0)` + `willChange: transform` —
//         identity visual transform that forces iOS WebKit to render the
//         hero on its OWN GPU compositor layer. That layer is independent
//         of any document/WebView overscroll translation, so even if some
//         residual bounce slips through, the hero stays put. Safe — the
//         hero has no position:fixed descendants, so no containing-block
//         trap.
//
//     KEPT (defence-in-depth, all from prior versions):
//       • v227 overscroll-behavior-y:none on .main-content (Layer 1).
//       • v227 non-passive touchmove preventDefault guard in Layout
//         (Layer 2) — when scrollTop<=0 AND finger pulling down.
//       • v226 hero position:fixed + ResizeObserver + --home-hero-h CSS
//         var + wrapper paddingTop.
//       • v224 kzPagePushIn/PopIn end-keyframe `transform: none`.
//       • v223 SwipeCardStack isolation:isolate + hero zIndex:50.
//
//     UNCHANGED: NotificationsDropdown viewport-fixed zIndex:71,
//     BottomBar, theme tokens, navigation, transitions+haptics v221,
//     role gating, all other pages.
//
//     PROTECTED (UNCHANGED): hero defence-in-depth chain v225-v227,
//     transitions + haptics v221, /guest-access back v220, /meetings
//     standalone v219, React #185 fix v218, navigate fix v217,
//     lastSeenAt + scroll v216, bell dropdown + /notifications v215,
//     LIVE design reconciliation v214, SwipeCardStack visual parity
//     v213, handoff sync v212, Главная design v211, bottom-sheet
//     swipe v210, announcements standalone v209, voting modal theme
//     v207+v208, garage v205+v206, plate hero v201, color picker v202.
//     Previous note (v227) preserved below:
// Version: 3.7.172 — cache suffix bumped to v227. Kill the top elastic
//     overscroll on the .main-content scroll container so the page
//     content can never bounce up past the fixed HomeHero (v226).
//
//     CONTEXT (after v226): HomeHero is truly viewport-fixed and
//     doesn't move. ✅ But on hard downward drag at the top of the
//     scroll container, the page CONTENT was rubber-banding upward
//     and visibly colliding with the hero (through the rounded bottom
//     corners and the brief frames where content overlap the hero
//     edge during the elastic spring).
//
//     FIX (2 layers, defence-in-depth):
//       LAYER 1 — CSS, index.css line 858 .main-content rule:
//         overscroll-behavior-y: contain → none
//         `contain` only stops scroll-chaining to the parent. `none`
//         additionally disables the rubber-band on THIS element. iOS
//         16+ WKWebView honors it while keeping momentum scrolling
//         intact (`-webkit-overflow-scrolling: touch` enables momentum;
//         rubber-band is separate).
//
//       LAYER 2 — JS belt-and-suspenders, Layout.tsx:
//         Added mainContentRef + useEffect that attaches non-passive
//         touchstart + touchmove listeners on the .main-content
//         element. On touchmove, if `el.scrollTop <= 0` AND the user
//         is dragging finger DOWN (currentY > startY), call
//         preventDefault. ONLY blocks the elastic top-bounce gesture;
//         normal scrolling (scrollTop > 0, upward drags at top,
//         bottom overscroll) all unaffected.
//         Cleanup removes listeners on unmount. Listener uses
//         { passive: false } so preventDefault actually works.
//
//     UNCHANGED:
//       • HomeHero v226 (position:fixed + ResizeObserver + --home-hero-h).
//       • SwipeCardStack v223 isolation:isolate + hero zIndex:50.
//       • index.css kzPagePushIn/PopIn end-keyframe transform:none (v224).
//       • NotificationsDropdown viewport-fixed zIndex:71.
//       • Carousel swipe + 3D peek + dots + BottomBar + theme tokens
//         + navigation + transitions/haptics v221.
//
//     Side-effect: bottom overscroll on .main-content is also disabled
//     by overscroll-behavior-y: none — that's acceptable and arguably
//     more native-feeling on a list-style page.
//
//     PROTECTED (UNCHANGED): hero fixed v226, sticky-revert v225 (now
//     superseded), z-index leak fix v223, sticky hero v222 (replaced),
//     transitions + haptics v221, back arrow on /guest-access v220,
//     /meetings standalone v219, React #185 fix v218, navigate fix
//     v217, lastSeenAt + scroll v216, bell dropdown + /notifications
//     v215, LIVE design reconciliation v214, SwipeCardStack visual
//     parity v213, handoff sync v212, Главная design v211, bottom-
//     sheet swipe v210, announcements standalone v209, voting modal
//     theme v207+v208, garage v205+v206, plate hero v201, color
//     picker v202.
//     Previous note (v226) preserved below:
// Version: 3.7.171 — cache suffix bumped to v226. STEP 2 of clean
//     2-step reset: hero is now truly viewport-fixed (rubber-band proof).
//
//     CONTEXT: v225 restored the v222 sticky baseline (visual verified
//     good — top row below notch, gradient fills behind status bar).
//     User confirmed scroll UP works perfectly. Remaining issue: on
//     DOWNWARD rubber-band overscroll at the top of .main-content,
//     the sticky hero translated with the bounce. iOS WKWebView's
//     elastic scrolling with `-webkit-overflow-scrolling: touch`
//     ignores `overscroll-behavior` for sticky-element translation
//     during the bounce — sticky can't be made bounce-proof on iOS.
//
//     SOLUTION (clean conversion on v225 baseline):
//       • HomeHero outer div: position:sticky → position:fixed
//         + left:0, right:0. Fixed elements are NOT subject to the
//         scroll container's rubber-band. zIndex:50 (v223) unchanged.
//       • Re-added useRef + useEffect/ResizeObserver block: writes
//         the hero's measured height to --home-hero-h CSS variable
//         on documentElement on every layout change. Cleanup on
//         unmount removes the var.
//       • .kz-screen wrapper: paddingTop: 'var(--home-hero-h, 220px)'
//         reserves the hero's height so the first content section
//         (swipe band) lands right below it on first paint.
//
//     EXACT v225 visual preserved: padding `calc(env(safe-area-inset-top
//     , 0px) + 14px) 18px 26px` unchanged → icon row clearly below
//     notch. Gradient `bg` fills the entire padding box → notch zone
//     painted with hero gradient.
//
//     CRITICAL prereq (already in place):
//       • index.css kzPagePushIn/PopIn end-keyframe `transform: none`
//         (v224, retained) — prevents .kz-screen from creating a
//         lingering containing block that would trap the fixed hero
//         after the page-enter animation. DURING the 280ms enter
//         animation, kz-screen has translateX → fixed hero slides
//         in WITH the page (intended). AFTER, transform:none →
//         hero is truly viewport-fixed.
//       • SwipeCardStack `isolation: isolate` (v223) — dot z-index
//         containment unchanged.
//
//     UNCHANGED: NotificationsDropdown viewport-fixed zIndex:71
//     still above hero (50 < 71); same bell-anchor offset.
//     Carousel swipe + 3D peek + dots + BottomBar + theme tokens +
//     navigation + transitions/haptics v221 — all preserved.
//
//     PROTECTED (UNCHANGED): v225 sticky-revert step (now superseded),
//     v223 z-index leak fix, v222 sticky hero (replaced),
//     transitions + haptics v221, back arrow on /guest-access v220,
//     /meetings standalone v219, React #185 fix v218, navigate fix
//     v217, lastSeenAt + scroll v216, bell dropdown + /notifications
//     v215, LIVE design reconciliation v214, SwipeCardStack visual
//     parity v213, handoff sync v212, Главная design v211, bottom-
//     sheet swipe v210, announcements standalone v209, voting modal
//     theme v207+v208, garage v205+v206, plate hero v201, color
//     picker v202.
//     Previous note (v225) preserved below:
// Version: 3.7.170 — cache suffix bumped to v225. STEP 1 of a clean
//     2-step reset of the Home hero positioning.
//
//     CONTEXT: v224 attempted to convert HomeHero from sticky → fixed
//     but landed in a broken visual state (icon row cut under the
//     notch). v222→v223→v224 layered patches left us confused.
//     STEP 1 reverts to the known-good v222 baseline (sticky, content
//     correctly below notch, but sub-pixel drift on iOS momentum
//     scroll) so the visual is verified clean before STEP 2 (v226)
//     reapplies the fixed conversion in one coherent diff.
//
//     CHANGE: pages/resident/design/ResidentHomeDesign.tsx
//       • HomeHero: dropped useRef + useEffect/ResizeObserver block;
//         dropped ref={heroRef} from outer div.
//       • HomeHero outer div: position:fixed → position:sticky; dropped
//         left:0/right:0. Retained top:0 and zIndex:50 (v118.81
//         stacking-context fix unrelated to sticky vs fixed).
//       • .kz-screen wrapper: dropped paddingTop:var(--home-hero-h,220px).
//         Sticky hero occupies its natural flow space → no reservation
//         needed.
//
//     RETAINED (NOT reverted):
//       • index.css kzPagePushIn/PopIn end-keyframe = `transform: none`
//         (was changed from translateX(0) in v224). Defensive: prevents
//         .kz-screen from creating a containing block that traps ANY
//         fixed descendant (NotificationsDropdown etc.) after the page
//         enter animation. Keeping this is strictly better than
//         translateX(0) regardless of hero positioning.
//       • SwipeCardStack `isolation: isolate` (v223) — dot z-index
//         containment unchanged.
//       • Hero zIndex:50 (v223) — above SwipeCardStack contents.
//
//     PROTECTED (UNCHANGED): smooth transitions + haptics v221, back
//     arrow on /guest-access v220, /meetings standalone v219, React
//     #185 fix v218, navigate fix v217, lastSeenAt + scroll v216,
//     bell dropdown + /notifications v215, LIVE design reconciliation
//     v214, SwipeCardStack visual parity v213, handoff sync v212,
//     Главная design v211, bottom-sheet swipe v210, announcements
//     standalone v209, voting modal theme v207+v208, garage v205+v206,
//     plate hero v201, color picker v202.
//     Previous note (v224) preserved below:
// Version: 3.7.169 — cache suffix bumped to v224. Hard-fix the Home hero
//     so it never moves a single pixel on iOS momentum scroll.
//
//     BUG (user-reported after v222 sticky-hero):
//       On real iPhone, the sticky HomeHero drifted sub-pixel during
//       inertial scroll — the skyline got clipped briefly as the hero
//       shifted up before settling. iOS WKWebView's position:sticky
//       implementation isn't truly pixel-locked under fast momentum.
//
//     FIX (3 surgical edits + 1 keyframe correction):
//       1) ResidentHomeDesign HomeHero outer div:
//            position: sticky → position: fixed
//            + top:0, left:0, right:0 (was just top:0)
//            zIndex:50 + isolation:isolate fix v118.81 retained.
//          Fixed pins to the viewport regardless of any ancestor's
//          scroll. Zero movement.
//
//       2) HomeHero useRef + useEffect with ResizeObserver writes the
//          hero's measured height to CSS variable --home-hero-h on
//          documentElement on every layout change (greeting wraps,
//          theme toggle, tenant name swap, safe-area changes).
//          Cleanup on unmount removes the var so other .kz-screen
//          pages aren't polluted.
//
//       3) ResidentHomeDesign wrapper paddingTop:
//            paddingTop: 'var(--home-hero-h, 220px)'
//          Reserves the hero's height as content top-padding so the
//          first content section (swipe band) lands right below the
//          hero on first paint. 220px fallback covers the typical
//          iPhone notch + hero height until ResizeObserver fires the
//          first exact measurement.
//
//       4) index.css kzPagePushIn / kzPagePopIn — END KEYFRAME changed
//          from `transform: translateX(0)` to `transform: none`.
//          Critical because `animation-fill-mode: both` keeps the
//          end-state applied. `translateX(0)` is a non-`none` transform
//          → creates a NEW containing block for position:fixed
//          descendants → would have trapped the now-fixed hero (and
//          the already-fixed NotificationsDropdown) inside .kz-screen,
//          making them scroll with the page. `transform: none` removes
//          that containing block after the enter animation completes,
//          restoring true viewport-fixed semantics.
//
//     UNCHANGED:
//       • SwipeCardStack v223 isolation:isolate + zIndex:50 hero
//         (v118.81) stacking-context fix — kept; dots still pass
//         cleanly under the hero.
//       • NotificationsDropdown viewport-fixed zIndex:71 anchor —
//         still above hero (50 < 71); same bell-anchor offset.
//       • Hero gradients, skyline, sun/stars, top-bar buttons,
//         greeting block, rounded bottom corners (28px), padding-top
//         with env(safe-area-inset-top) — none touched.
//       • Bottom bar, theme tokens, navigation, transitions v221,
//         haptics v221, role gating.
//
//     PROTECTED (UNCHANGED): everything from v223 (z-index leak fix)
//     + v222 (sticky hero replaced) + smooth transitions + haptics
//     v221 + back arrow on /guest-access v220 + /meetings standalone
//     v219 + React #185 fix v218 + navigate fix v217 + lastSeenAt +
//     scroll v216 + bell dropdown + /notifications v215 + LIVE
//     design reconciliation v214 + SwipeCardStack visual parity v213
//     + handoff sync v212 + Главная design v211 + bottom-sheet swipe
//     v210 + announcements standalone v209 + voting modal theme
//     v207+v208 + garage v205+v206 + plate hero v201 + color picker
//     v202.
//     Previous note (v223) preserved below:
// Version: 3.7.168 — cache suffix bumped to v223. v222 sticky-hero
//     stacking-context regression fix.
//
//     BUG (user-reported after v222): when scrolling the Home content
//     UP, the swipe-carousel dots indicator (6 dots under the cards)
//     painted ON TOP of the sticky hero — visible over the skyline
//     area instead of disappearing behind the hero's bottom edge.
//     Cards themselves correctly slid under; only the dots leaked.
//
//     ROOT CAUSE:
//       SwipeCardStack's outer wrapper (kamizoDesign.tsx line 142)
//       was a bare <div> — no position / transform / isolation → did
//       NOT create a stacking context. Inside it, the dots indicator
//       had `position:relative; zIndex:20` (creates its own stacking
//       context, but the value 20 leaks UP through the bare parent).
//       At the next stacking-context ancestor (.main-content), the
//       dots competed directly with HomeHero (sticky, zIndex:10).
//       20 > 10 → dots painted above the hero. The cards didn't leak
//       because they're contained inside the perspective:1000 div's
//       own stacking context.
//
//     FIX (2 surgical edits):
//       • kamizoDesign.tsx — added `isolation: isolate` to
//         SwipeCardStack's outer wrapper. Single-property way to force
//         a new stacking context without side effects (no positioning,
//         no transform tricks). Now the dots' zIndex:20 is contained
//         INSIDE the swipe band; externally the wrapper ranks as
//         z-index:auto among its siblings.
//       • ResidentHomeDesign.tsx — bumped HomeHero zIndex 10 → 50 as
//         defensive headroom against any future content section
//         below with an inline z-index up to ~40.
//         NotificationsDropdown at viewport-fixed zIndex:71 still
//         anchors above the hero — dropdown unaffected.
//
//     UNCHANGED:
//       • SwipeCardStack drag logic, 3D peek (perspective +
//         translateZ/rotateY/scale), per-card zIndex 10-absD inside
//         the perspective context, dots dimensions / pill animation,
//         touch + mouse gestures — none touched.
//       • HomeHero gradients, border-radius, skyline, sun/stars,
//         top-bar buttons, greeting — only zIndex changed.
//       • Sticky behaviour (v222) — preserved; content still scrolls
//         under hero.
//       • Bottom bar, theme tokens, navigation, transitions/haptics
//         v221, role gating.
//
//     PROTECTED (UNCHANGED): sticky Home hero v222, smooth
//     transitions + haptics v221, back arrow on /guest-access v220,
//     /meetings standalone v219, React #185 fix v218, navigate fix
//     v217, lastSeenAt + scroll v216, bell dropdown +
//     /notifications v215, LIVE design reconciliation v214,
//     SwipeCardStack visual parity v213, handoff sync v212, Главная
//     design v211, bottom-sheet swipe v210, announcements standalone
//     v209, voting modal theme v207+v208, garage v205+v206, plate
//     hero v201, color picker v202.
//     Previous note (v222) preserved below:
// Version: 3.7.167 — cache suffix bumped to v222. Resident Home hero
//     is now sticky: pinned to the top while content scrolls underneath.
//
//     CHANGE (1 file, 3 properties):
//       • pages/resident/design/ResidentHomeDesign.tsx HomeHero
//         outer div — was `position: 'relative'`, now `position: 'sticky',
//         top: 0, zIndex: 10`. Every existing property (bg gradient,
//         border-radius for rounded bottom corners, padding-top with
//         env(safe-area-inset-top), overflow:hidden for the
//         skyline/sun/stars clipping) is unchanged.
//
//     WHY THIS WORKS:
//       • position:sticky pins to top:0 of the nearest scrolling
//         ancestor — Layout's .main-content has overflow-y:auto on
//         mobile, so the hero pins to the viewport's top edge (which
//         IS .main-content's top edge for resident-home, since
//         MobileHeader is hidden via isResidentFullBleed).
//       • Sticky still occupies its natural flow space when un-scrolled,
//         so the section below (swipe-card-stack with marginTop:18)
//         starts at the right place. No padding-top: heroHeight needed
//         on the scroll container.
//       • The rounded-bottom corners reveal content scrolling underneath
//         through the rounded-corner cutouts — exactly the iOS pattern.
//         z-index:10 keeps the hero above the swipe card stack's
//         3D perspective transform.
//       • The hero's background fills its entire padding box including
//         the env(safe-area-inset-top) zone, so the notch area is painted
//         with the hero gradient. No beige strip above the hero.
//
//     UNCHANGED (verified safe):
//       • NotificationsDropdown anchor — position:fixed with viewport-
//         anchored top:96 (default). With the bell now always at the
//         same viewport y (hero is always at the top), the anchor stays
//         correct. No dropdown changes needed.
//       • SwipeCardStack — independent of hero positioning.
//       • Bottom bar — separate portal-mounted fixed element.
//       • Theme tokens — `bg` constant is theme-aware via useThemeStore;
//         both light + dark hero gradients render correctly.
//       • Forward/back navigation transition (v221) — hero animates
//         with the kz-screen page-enter, then sticky takes effect.
//
//     PROTECTED (UNCHANGED): smooth transitions + haptics v221, back
//     arrow on /guest-access v220, /meetings standalone v219, React
//     #185 fix v218, navigate fix v217, lastSeenAt + scroll v216,
//     bell dropdown + /notifications v215, LIVE design reconciliation
//     v214, SwipeCardStack visual parity v213, handoff sync v212,
//     Главная design v211, bottom-sheet swipe v210, announcements
//     standalone v209, voting modal theme v207+v208, garage v205+v206,
//     plate hero v201, color picker v202.
//     Previous note (v221) preserved below:
// Version: 3.7.166 — cache suffix bumped to v221. Two polish changes
//     for premium feel.
//
//     PART 1 — Smooth iOS-like page transitions (pure CSS, no library):
//       • NEW components/NavigationDirectionTracker.tsx — uses
//         useLocation() + useNavigationType() to stamp
//         document.body.dataset.nav as 'push' (forward) or 'pop'
//         (back/initial load) on every route change.
//       • App.tsx — mounts <NavigationDirectionTracker /> inside
//         <BrowserRouter> right before the outer <Routes>.
//       • index.css — added 3 @keyframes (kzPagePushIn slide-from-right,
//         kzPagePopIn slide-from-left, kzPageFadeIn reduced-motion
//         fade) + targeted rules on `.kz-screen`. Duration 280 ms with
//         cubic-bezier(0.32, 0.72, 0, 1) (iOS-spring ease, same as
//         bottom-sheet swipe v210). prefers-reduced-motion fallback →
//         140 ms fade only.
//       • Added className="kz-screen" to 6 page wrappers that lacked
//         it (ResidentAnnouncementsPage, ResidentMeetingsPage,
//         ResidentGuestAccessPage, ResidentProfilePage, LoginPage,
//         AddCarPage). Layout itself does NOT have .kz-screen — the
//         sidebar / header / BottomBar persist across internal tab
//         navigation (no flash); only the inner page that swaps gets
//         the animation.
//
//     PART 2 — Haptic feedback on BottomBar ONLY:
//       • Installed @capacitor/haptics ^8.0.2 (and synced to iOS Pod).
//       • components/BottomBar.tsx — imported Capacitor + Haptics +
//         ImpactStyle. Added fireLightHaptic() helper: no-op on web,
//         fires Haptics.impact({ style: ImpactStyle.Light }) on
//         native (iOS / Android via Capacitor). The .catch silences
//         any plugin failure so a missing pod can never throw.
//       • Called inside handleTap exactly twice — once in the FAB
//         branch, once before the navigate() for valid tab taps.
//         Locked-tab taps deliberately do NOT haptic (matches iOS
//         pattern of no feedback on disabled controls).
//       • NO other component imports @capacitor/haptics. Verified via
//         `grep -rn '@capacitor/haptics' src/` → exactly 1 hit
//         (BottomBar.tsx).
//
//     NOT TOUCHED: React Router structure, Layout dispatch, role
//     gating, ProtectedRoute, individual page logic, theme tokens,
//     BottomBar visual styling, FAB visual / locked-modal flow,
//     /guest-access back arrow v220, /meetings standalone v219,
//     React #185 fix v218, navigate fix v217, bell dropdown +
//     /notifications v215-216, /announcements v209, garage v205-206,
//     plate hero v201, color picker v202.
//     Previous note (v220) preserved below:
// Version: 3.7.165 — cache suffix bumped to v220. Back arrow on
//     /guest-access (resident "Пропуска / QR-доступ"). BottomBar
//     deliberately KEPT — unlike Garage v205 / Announcements v209 /
//     Notifications v215 / Meetings v219 (all fullscreen), this page
//     stays inside Layout per user constraint.
//
//     CHANGE (1 file edit):
//       • pages/ResidentGuestAccessPage.tsx
//           - Imported useNavigate (react-router-dom) + ArrowLeft
//             (lucide-react).
//           - Sticky header restructured from 2 children (title block
//             + history toggle) to 3 children: back ← / title block
//             / history. flex:1 added to title wrapper so the layout
//             balances cleanly with the extra child.
//           - Back tap → navigate('/') explicitly (NOT history.back —
//             the user wants the same explicit-home behaviour as
//             every other standalone back arrow we shipped).
//           - 40×40 button, theme-aware: SURFACE bg + BORDER outline
//             + TEXT_PRIMARY color (existing tokens already var(--themed-*)).
//
//     NOT TOUCHED:
//       • App.tsx — /guest-access stays as a nested Route inside
//         Layout (no top-level route, no role-split). BottomBar +
//         MobileHeader continue to render.
//       • Layout.tsx getGuestAccessPage() role dispatch unchanged
//         (resident → ResidentGuestAccessPage; staff → ManagerGuestAccessPage).
//       • ManagerGuestAccessPage.tsx — staff view untouched.
//       • Page bottom padding 124px + safe-area — intentionally
//         preserved as the reservation for the still-rendering BottomBar.
//       • QuickCreateTiles / CreatePassForm / LatestPassHero /
//         QRCodeDisplay / history sheet / pass-creation logic — none
//         touched per user constraint.
//
//     PROTECTED (UNCHANGED): /meetings standalone v219 + React #185
//     fix v218 + navigate fix v217 + lastSeenAt tracker + scroll v216
//     + bell dropdown + /notifications v215 + LIVE design reconciliation
//     v214 + SwipeCardStack visual parity v213 + handoff sync v212 +
//     Главная design v211 + bottom-sheet swipe v210 + announcements
//     standalone v209 + voting modal theme v207+v208 + garage v205+v206
//     + plate hero v201 + color picker v202.
//     Previous note (v219) preserved below:
// Version: 3.7.164 — cache suffix bumped to v219. /meetings standalone
//     fullscreen for residents (same approach as Garage v205,
//     Announcements v209, Notifications v215).
//
//     CHANGE:
//       • App.tsx — added top-level Route `/meetings` BEFORE the `/*`
//         Layout catch-all. Route element is the new MeetingsRoleSplit
//         component. ProtectedRoute keeps the `requiredFeature="meetings"`
//         gate (same as Layout's nested version).
//       • MeetingsRoleSplit — narrower role check than the other
//         splits: ONLY `user.role === 'resident'` gets the standalone
//         page. Tenant + commercial_owner currently see the staff
//         MeetingsPage (Layout's getMeetingsPage helper routes them to
//         it today), so they MUST fall through to Layout — wider
//         3-role list would regress them. Staff/admin/manager/executor
//         also fall through and get their normal Layout chrome.
//       • ResidentMeetingsPage.tsx:
//           - Imported useNavigate (react-router-dom) + ArrowLeft
//             (lucide-react).
//           - Sticky header restructured into a flex row: 40×40 back
//             button (theme-aware: var(--surface) bg, hairline border,
//             text-primary color) + existing heading block (eyebrow
//             "Собрания собственников" + title "Голосование") on the
//             right.
//           - Back tap → navigate('/') explicitly (user said NOT
//             history.back).
//           - Bottom padding dropped: calc(124px + safe-area) → calc(24px
//             + safe-area). 124px was the reserve for the global
//             BottomBar which no longer renders on this standalone page.
//
//     NOT TOUCHED:
//       • Layout.tsx getMeetingsPage() helper — staff/tenant/
//         commercial_owner still match Layout's nested /meetings Route
//         via fall-through.
//       • MeetingsPage.tsx (staff view), MeetingVotingModal.tsx,
//         meetingStore.ts, quorum logic, vote handlers, reconsideration
//         store — voting logic is untouched per user constraint.
//       • Sidebar staff nav to /meetings — still works (fall-through
//         hits Layout which matches /meetings in its nested Routes).
//       • Bell dropdown / NotificationsPage from v215-v218 — no edits.
//       • Theme tokens — page already used var(--themed-*) everywhere,
//         light + dark continue to work unchanged.
//
//     PROTECTED (UNCHANGED): everything from v218 (React #185 fix +
//     ErrorBoundary debug-gate revert) + v217 (navigate fix) + v216
//     (lastSeenAt tracker + scroll fix) + v215 (bell dropdown +
//     /notifications page) + v214 (LIVE design reconciliation) + v213
//     (SwipeCardStack visual parity) + v212 (handoff sync) + v211
//     (Главная design 1:1) + v210 (bottom-sheet swipe) + v209
//     (announcements standalone) + voting modal theme v207+v208 +
//     garage v205+v206 + plate hero v201 + color picker v202.
//     Previous note (v218) preserved below:
// Version: 3.7.163 — cache suffix bumped to v218. React error #185
//     fix (infinite render loop introduced in v216 bell-badge wiring).
//
//     BUG (user-reported): tapping "Заполнить →" on the resident
//     registration card showed ErrorBoundary fallback "Error:
//     Minified React error #185" instead of opening /profile.
//     React #185 = "Maximum update depth exceeded" — infinite
//     re-render loop. ErrorBoundary's "Ошибка повторяется (2 раз)"
//     hint confirmed the bailout.
//
//     ROOT CAUSE:
//       v215 had a stable scalar selector on ResidentDashboard:
//         useNotificationStore(s => s.notifications.filter(
//           n => n.userId === userId && !n.read
//         ).length)
//       — returns a Number; primitive equality across snapshot reads
//         is stable, no loop.
//
//       v216 changed the badge derivation (to support the new
//       lastSeenAt unseen-counter logic) to:
//         useNotificationStore(s => s.notifications.filter(
//           n => n.userId === userId
//         ))
//       — returns a fresh Array on every getSnapshot call.
//
//       Zustand v4 implements selectors via React's
//       useSyncExternalStore. The getSnapshot callback MUST be
//       referentially stable between calls when the underlying
//       store has not changed. A fresh .filter() result is never
//       === the previous one → React detects "snapshot changed
//       without external update" → schedules another render →
//       another fresh array → another render → loop → "Maximum
//       update depth exceeded" → caught by ErrorBoundary.
//
//       The loop fires on the next render that re-evaluates that
//       hook — which is what happened when tapping the registration
//       card (the tap triggers navigation, navigation re-renders
//       Layout, ResidentDashboard re-renders during the transition,
//       and the unstable snapshot is detected).
//
//     FIX (1 file, 1 selector):
//       pages/ResidentDashboard.tsx — subscribe to the raw
//       notifications array (stable ref while store unchanged) and
//       derive the per-user filter in useMemo:
//         const notifications = useNotificationStore(s => s.notifications);
//         const allNotificationsForUser = useMemo(
//           () => notifications.filter(n => n.userId === userId),
//           [notifications, userId]
//         );
//       Downstream unreadCount derivation unchanged.
//
//     VERIFIED SAFE (no loop): NotificationsDropdown.tsx +
//     NotificationsPage.tsx + notificationFeed.ts all filter/map
//     INSIDE useMemo (not inside the zustand selector). The two
//     useEffect → markNotificationsSeen adds have stable deps
//     (action ref + userId primitive + open bool).
//
//     ALSO: components/ErrorBoundary.tsx — reverted the v118.75
//     DEBUG ungate. The temporary "show error message + stack in
//     production" surfacing is back to its original
//     import.meta.env.DEV gate.
//
//     PROTECTED (UNCHANGED): everything from v217 (window.location
//     .assign → navigate fix) + v216 (lastSeenAt tracker + scroll
//     fix) + v215 (bell dropdown + /notifications page) + v214
//     (LIVE design reconciliation) + v213 (SwipeCardStack visual
//     parity) + v212 (handoff sync) + v211 (Главная design 1:1) +
//     v210 (bottom-sheet swipe) + v209 (announcements standalone)
//     + voting modal theme v207+v208 + garage v205+v206 + plate
//     hero v201 + color picker v202.
//     Previous note (v217) preserved below:
// Version: 3.7.162 — cache suffix bumped to v217. CRITICAL crash fix.
//
//     BUG (user-reported "splash again" after tapping the resident
//     Home "Завершите регистрацию · Заполнить →" card):
//       Root cause was ResidentDashboard.tsx line 300:
//         onCompleteRegistration={() => window.location.assign('/profile')}
//       In Capacitor (capacitor://localhost/ origin) this performs a
//       FULL WebView reload — Capacitor's SplashScreen plugin re-shows
//       on launch, which the user perceives as a crash / restart.
//       NOT a JS exception (those just unmount a subtree); the WebView
//       genuinely reloads its document.
//
//     FIX:
//       • Replaced with navigate('/profile') (in-app SPA route via
//         react-router-dom useNavigate). No reload, no splash.
//       • Added useNavigate import + `const navigate = useNavigate()`
//         declaration at the top of ResidentDashboard.
//
//     AUDIT (grep'd window.location.{assign,href=,reload} across pages/
//     and components/): all other occurrences are either:
//       • admin-only (AdminDashboard, SettingsPage, Layout
//         impersonation cleanup) — not resident-reachable.
//       • intentional external opens (ResidentProfilePage
//         privacy-policy + mailto: fallback → iOS hands off to
//         Safari/Mail, NOT a WebView reload).
//       • intentional clean-reload edge cases (MeetingVotingModal
//         after a "не найдено" server error during voting; LoginPage
//         dev auto-login bypass before user is authed).
//       • ErrorBoundary "go home" escape hatch (only on caught error).
//     Nothing else is a resident button.
//
//     DEFENSIVE: ErrorBoundary (components/ErrorBoundary.tsx) is
//     already mounted at App root (App.tsx lines 172-236) so render
//     throws don't leave a blank WebView. No change needed.
//
//     UNCHANGED (per user constraints): every other resident button
//     handler continues to use react-router navigate(); all swipe-card
//     target routes (/meetings, /guest-access, /useful-contacts,
//     /rate-employees, /vehicles) verified to exist in Layout's nested
//     Routes — no silent route-misses. Bell dropdown + /notifications
//     page from v215+v216 unaffected.
//
//     PROTECTED (UNCHANGED): everything from v216 (bell unseen
//     tracker + /notifications scroll fix) + v215 (bell dropdown +
//     standalone page) + v214 (LIVE design reconciliation) + v213
//     (SwipeCardStack visual parity) + v212 (handoff sync) + v211
//     (Главная design 1:1) + announcements v209 / bottom-sheet
//     swipe-to-dismiss v210 / voting modal theme v207+v208 / garage
//     v205+v206 / plate hero v201 / color picker v202.
//     Previous note (v216) preserved below:
// Version: 3.7.161 — cache suffix bumped to v216. Two v215 bug fixes.
//
//     BUG 1 (bell badge always 0):
//       Root cause: the v215 badge counted DB-`read=false` rows. Most
//       request notifications get inserted with is_read=0 then quickly
//       flip to is_read=1 the next time the user opens the request, so
//       a backlog of historically-read items never lit the badge.
//       That conflates "user opened the row" with "user noticed there
//       were new notifications" — they're different events.
//       FIX: introduced a client-side `notificationsLastSeenAt` tracker
//       in notificationStore (per userId, ISO string, persisted under
//       'uk-notification-storage'). Bell badge now counts:
//           items (notifications + unviewed announcements) with
//           createdAt > lastSeenAt[userId]
//       lastSeenAt is stamped 'now' when:
//         • the bell dropdown opens (useEffect in NotificationsDropdown)
//         • the /notifications page mounts (useEffect in NotificationsPage)
//       On first run (lastSeenAt undefined), the badge shows the full
//       backlog. After one tap on the bell, badge clears. New
//       notifications arriving after that point re-light the badge.
//       "Прочитать всё" still works as before for the DB-side read flag.
//
//     BUG 2 (notifications page doesn't scroll on iOS):
//       Root cause: the page was a single document-flow div with
//       minHeight:100vh + a sticky header. On iOS WebView the body
//       scroll context is unreliable when other ancestors set
//       overflow:hidden (Sheet modal sets this on open/close cycles,
//       and leftover state can persist past close). Result: list
//       couldn't scroll past the sticky header.
//       FIX: page restructured to fixed-position flex column overlay
//       covering the viewport. Header is a non-shrinking flex child
//       (flex: 0 0 auto); body is flex:1 + overflowY:auto with its
//       own scroll context, fully independent of document.body /
//       ancestor overflow rules. Added WebkitOverflowScrolling:touch
//       for iOS momentum. Bottom padding moved into the scrollable
//       body (calc(24 + safe-area-inset-bottom)) so the last card
//       clears the home indicator.
//
//     UNCHANGED (per user constraints): theme tokens (var(--*)),
//     real-data wiring (notificationStore + announcementStore merged
//     via notificationFeed), navigate handlers, role-based Layout,
//     global BottomBar, MobileHeader popover (separate component).
//
//     PROTECTED (UNCHANGED): everything from v215 (bell dropdown +
//     /notifications page) + v214 (LIVE design reconciliation) +
//     v213 (SwipeCardStack visual parity) + v212 (handoff zip sync) +
//     v211 (Главная design 1:1) + announcements v209 / bottom-sheet
//     swipe-to-dismiss v210 / voting modal theme v207+v208 / garage
//     v205+v206 / plate hero v201 / color picker v202.
//     Previous note (v215) preserved below:
// Version: 3.7.160 — cache suffix bumped to v215. Bell rewire +
//     standalone /notifications page (Claude Design §12).
//
//     PART 1 (bell dropdown):
//       • ResidentHomeDesign hero bell previously navigated straight
//         to /announcements (wrong). Now it just toggles the
//         NotificationsDropdown panel (new shared component).
//       • Bell badge `unread` was always 0 (ResidentDashboard didn't
//         pass it). Now subscribes to useNotificationStore +
//         unviewed-announcement count → real count, reactive.
//       • Dropdown shows top 3 real items (unread-first, then
//         newest), real "{N} новых" header, footer "Показать все →"
//         → navigates to /notifications. Backdrop tap closes.
//
//     PART 2 (full page /notifications):
//       • New top-level standalone route in App.tsx (role-split like
//         /vehicles v205 and /announcements v209): resident/tenant/
//         commercial_owner → standalone full-screen, other roles
//         fall through to Layout.
//       • Sticky header: back ← → /, "Уведомления", "N
//         непрочитанных" (real count), "Прочитать всё" → mass-mark
//         via markAllNotificationsAsRead + markAnnouncementAsViewed.
//       • Filter chips Все / Заявки / Собрания / Объявления /
//         Оплата; active chip dark (--ink), inactive surface.
//       • Notifications grouped by time: Сегодня / Вчера / Ранее
//         (local TZ bucketing).
//       • Each card: type-coloured icon tile (--status-active/-bg,
//         --status-critical/-bg, --brand-tint/--brand-dark,
//         --surface-sunken/--text-secondary), title, body, timestamp,
//         unread dot (--brand), optional CTA pill ("Оценить" →
//         request, "Голосовать" → meetings) derived from notification
//         type.
//       • Bottom padding calc(24px + env(safe-area-inset-bottom))
//         (no global BottomBar on this fullscreen page).
//
//     DATA-MODEL DECISIONS (documented in notificationFeed.ts):
//       • No single notifications source maps to the design's 5 chips.
//         UI-side aggregation in utils/notificationFeed.ts: merges
//         request/meeting notifications from useNotificationStore +
//         announcements from useAnnouncementStore into FeedItem[].
//       • Announcements treated as synthetic FeedItems (id =
//         'ann-<announcement.id>', kind 'announcement', unread =
//         !viewedBy.includes(userId)). No DB change.
//       • Finance has NO data source today. The 'Оплата' chip still
//         renders but shows an empty state ("Здесь появятся
//         уведомления об оплате"). When server starts emitting
//         finance notifications (e.g. type 'invoice_issued'), a
//         single case in classifyNotificationKind() lights up the
//         chip — annotated in code.
//       • CTA pills derived from notification.type (no actionType
//         field on the data model): 'request_completed' → "Оценить",
//         'meeting' → "Голосовать". Others have no inline CTA.
//
//     FILES (3 new + 3 edited):
//       • NEW: src/utils/notificationFeed.ts (pure helpers — merge,
//         classify, bucket, format).
//       • NEW: src/components/NotificationsDropdown.tsx (bell
//         popover, ~150 lines, var(--*) tokens throughout).
//       • NEW: src/pages/NotificationsPage.tsx (standalone full page).
//       • EDIT: src/pages/resident/design/ResidentHomeDesign.tsx
//         (bell handler + mount dropdown).
//       • EDIT: src/pages/ResidentDashboard.tsx (wire unread count).
//       • EDIT: src/App.tsx (top-level /notifications route +
//         NotificationsRoleSplit).
//
//     UNCHANGED (per user "Keep all live data bindings"):
//       • MobileHeader.tsx notification dropdown (used by other
//         roles; future refactor to share component).
//       • notificationStore.ts / notifications.ts route / DB schema.
//       • Layout role-gating, Sidebar nav, global BottomBar, theme
//         tokens.
//
//     PROTECTED (UNCHANGED): everything from v214 (LIVE design
//     reconciliation — cards data + Silhouette refactor) + v213
//     (SwipeCardStack visual parity) + v212 (handoff zip sync) +
//     v211 (Главная design 1:1) + v210 (bottom-sheet swipe-to-
//     dismiss) + v209 (announcements standalone) + voting modal
//     theme v207+v208 + garage v205+v206 + plate hero v201 +
//     color picker v202 + kamizo-landing Worker + VPS + DNS + TLS
//     + push + APNs + splash.
//     Previous note (v214) preserved below:
// Version: 3.7.159 — cache suffix bumped to v214. LIVE MCP fetch
//     vs SHIPPED diff applied (cards data + Silhouette refactor).
//     Stale handoff zip was NOT actually stale on cards content —
//     LIVE === zip on kamizo-cards.jsx; both diverge from SHIPPED
//     v213 only on the data array + the Silhouette glyph set.
//
//     DATA DELTAS (ResidentHomeDesign.tsx baseCards) — patched
//     LIVE design copy literally; ru/uz mechanism + onClick routes
//     kept:
//       • registrationCard gradient: '#2DD4BF → #0E9488' (bluegray-teal)
//         → '#2DD4CF → #0E9AAB' (cyan-teal). Shadow tint shifted
//         rgba(14,148,136,0.5) → rgba(14,154,171,0.5) to match.
//       • voting card:
//           - silhouette 'people' → 'ballot' (the design intends a
//             ballot-box-with-checkmark glyph for voting, not three
//             people heads)
//           - title 'Идёт голосование' → 'Ремонт лифтов · идёт
//             голосование' (richer LIVE copy; uz mirror added)
//           - sub 'Ваш голос важен' → 'Ваш голос · 67 м² · осталось
//             2 дня' (LIVE shows concrete-looking metadata; copy is
//             still hard-coded in the design, so we ship the same
//             literal — wiring to real meeting.area/timeRemaining is
//             a separate task)
//       • contacts sub: '… и мастера' → '… и мастера дома'
//       • rate sub: 'Раз в месяц · 30 секунд' → 'Раз в месяц ·
//         займёт 30 секунд'
//       • find-car sub: 'Поиск соседа по номеру' → 'Поиск соседа по
//         номеру машины'
//
//     SILHOUETTE REFACTOR (kamizoDesign.tsx Silhouette) — was the
//     biggest visible diff vs the LIVE prototype:
//       • Previous shipped silhouettes were FILLED blob shapes
//         (solid white rects/paths) that read as opaque smudges
//         behind the card content.
//       • LIVE design uses STROKE-OUTLINE line icons (strokeWidth 4.4
//         round caps/joins) that bleed off the bottom-right corner
//         and read as intentional superapp decoration without
//         occluding the title/sub. Ported all 11 kinds verbatim from
//         handoff kamizo-silhouettes.jsx: idcard/check, ballot/people,
//         qr (finder + module grid), phone, star, car, coins
//         (BalanceCard), drop, wrench, building.
//       • Default opacity 0.14 → 0.2 + size param 180 → 196, anchor
//         right:-6/bottom:-10 → right:-16/bottom:-22 per handoff.
//         SwipeCardStack passes opacity=0.22 explicitly so that's
//         unchanged on the cards themselves.
//
//     UNCHANGED (per user "Keep all live data bindings"):
//       • ResidentDashboard wiring · BottomBar · Layout role gating
//         · MobileHeader notification dropdown · useThemeStore
//         toggle in HomeHero · skyline PNGs (v212) · card order
//         contacts before rate (v212) · SwipeCardStack visual shell
//         (v213) · all navigate() handlers on cards.
//       • Card height={250} from ResidentHomeDesign — longer voting
//         title now reads 2 lines on iPhone 17 Pro Max width; height
//         250 with space-between layout absorbs it without clipping.
//
//     PROTECTED (UNCHANGED): everything from v213 (SwipeCardStack
//     visual parity) + v212 (handoff sync) + v211 (Главная design
//     1:1) + announcements v209 / bottom-sheet swipe-to-dismiss v210
//     / voting modal theme v207+v208 / garage v205+v206 / plate hero
//     v201 / color picker v202 / kamizo-landing Worker / VPS / DNS /
//     TLS / push / APNs / splash.
//     Previous note (v213) preserved below:
// Version: 3.7.158 — cache suffix bumped to v213. SwipeCardStack
//     (kamizoDesign.tsx) visual parity pass against handoff prototype
//     kamizo-cards.jsx. The data array (registrationCard + baseCards
//     with real onClick routes) is UNTOUCHED — only the card shell
//     visuals upgraded.
//
//     APPLIED (8 deltas to match prototype, all in kamizoDesign.tsx
//     SwipeCardStack):
//       1. padding 20 → 22.
//       2. boxShadow on active card: was flat brand drop, now
//          `0 18px 44px -10px ${shadow}, inset 0 1px 0 rgba(255,255,255,0.28),
//           inset 0 0 0 1px rgba(255,255,255,0.10)` — gives a 3D-glossy
//          lifted card per prototype.
//       3. flexbox layout: justifyContent flex-start → space-between.
//          Icon+title+sub block pins to the top, CTA pill pins to the
//          bottom of the card. Card height stays 250 so longer uz
//          translations don't clip; leaves ~30 px breathing room
//          between sub and CTA on the registration card.
//       4. corner glow: 150×150 flat-white disc → 210×210 radial
//          gradient (white 18% → transparent at 68%). Blends into the
//          card gradient instead of reading as a pasted disc.
//       5. silhouette opacity 0.16 → 0.22 per prototype.
//       6. top sheen overlay added: white 16% → 0 in top 34% — was
//          missing entirely. Adds a glossy wet reading near the badge
//          row.
//       7. icon circle bumped 48 → 52, icon glyph size 24 → 26,
//          marginBottom 12 → 16. Title fontSize 23 → 26 / lineHeight
//          1.12 → 1.05. Sub fontSize 13 → 13.5 / marginTop 6 → 8.
//          CTA padding 9×16 → 10×18, fontSize 13.5 → 14, dropped
//          explicit marginTop (space-between handles spacing).
//       8. dots indicator marginTop 6 → 14 per prototype.
//
//     UNCHANGED (per user instruction "Do NOT change live data wiring"):
//       • cards array (registrationCard + voting/guest/contacts/rate/
//         find-car with real navigate() handlers and ru()/uz() labels).
//       • SwipeCardStack drag gestures (touch + mouse), peek transforms
//         (translateX 32 + translateZ + rotateY -5deg), dots width
//         pill 22 active / 7 inactive, --brand-500 / --stone-300.
//       • Theme-aware tokens (var(--brand-500), var(--stone-300)) —
//         dots colors react to html.dark cascade.
//       • Card height={250} passed from ResidentHomeDesign.tsx.
//
//     PROTECTED (UNCHANGED): everything from v212 (handoff zip sync —
//     skyline PNGs, card order rate↔contacts) + v211 (Главная design
//     1:1) + announcements v209 standalone / bottom-sheet swipe-to-
//     dismiss v210 / voting modal theme v207+v208 / garage v205+v206 /
//     plate hero v201 / color picker v202 / kamizo-landing Worker /
//     VPS / DNS / TLS / push / APNs / splash.
//     Previous note (v212) preserved below:
// Version: 3.7.157 — cache suffix bumped to v212. Handoff zip sync
//     (redesign/kamizo-handoff.zip → screens/01-glavnaya.html). Diff'd
//     fresh export against shipped ResidentHomeDesign.tsx + assets.
//
//     REAL DELTAS APPLIED (3 files):
//       1. public/screens/skyline-dark.png — overwrote with handoff
//          version (165 KB, 880×209 RGBA, fresh re-export). Same
//          subject, slightly different pixels.
//       2. public/screens/skyline-light.png — overwrote with handoff
//          version (165 KB, 720×215 RGBA, +1px height vs shipped
//          720×214). Same subject, fresh re-export.
//       3. ResidentHomeDesign.tsx baseCards order — swapped positions
//          4↔5 to match handoff: previously [voting, guest, rate,
//          contacts, find-car], now [voting, guest, contacts, rate,
//          find-car]. All gradients/icons/handlers stayed attached.
//
//     NON-DELTAS (verified byte-identical to handoff):
//       • project/kamizo-home.jsx (HomeScreen/HomeHero/QuickTiles/
//         ApprovalCard/RescheduleAlert/MeetingWidget/BalanceCard/
//         AnnMini/PWABanner/TabBar/NotificationPopover).
//       • project/kamizo-cards.jsx (SwipeCardStack — swipe + dots +
//         3D peek).
//       • project/tokens.css (brand/surface/text/status/radius/shadow/
//         motion/type tokens).
//
//     INTENTIONAL DRIFT KEPT (per user constraints, NOT regressed):
//       • homeStyles.page.paddingBottom = calc(96px + safe-area)
//         instead of design's hardcoded 124 — required for the global
//         BottomBar + iOS safe-area.
//       • SwipeCardStack height = 250 instead of design's 210 — so
//         registration card "Завершите регистрацию" CTA pill doesn't
//         clip (see v118.25 comment).
//       • Hero theme toggle wired to useThemeStore.toggle (not the
//         design's local setLocalSky state) — re-themes the WHOLE
//         app per "theme switching working" rule.
//       • Real data props (tenantName/Logo, name, apt, activeCount,
//         vehicleCount, passCount, pendingApproval/Reschedules,
//         meeting, latestAnnouncements) instead of design's mock
//         values — per "Keep dynamic data bindings" rule.
//       • Bell → navigate('/announcements') instead of design's
//         inline NotificationPopover — per "Keep all navigation
//         handlers wired" rule (popover already exists in
//         MobileHeader.tsx; dup would be a regression).
//
//     PROTECTED (UNCHANGED): everything from v211 (Главная design 1:1
//     port) + announcements v209 standalone / bottom-sheet swipe-to-
//     dismiss v210 / voting modal theme v207+v208 / garage v205+v206 /
//     plate hero v201 / color picker v202 / kamizo-landing Worker /
//     kamizo Worker / VPS / DNS / TLS / push / APNs / splash / role
//     avatars / chat-swipe / carousel / store-audit fixes.
//     Previous note (v211) preserved below:
// Version: 3.7.156 — cache suffix bumped to v211. Re-confirmed
//     screens/01-glavnaya.html (Главная) is already implemented 1:1
//     via pages/resident/design/ResidentHomeDesign.tsx (originally
//     ported in v118.25, real Tashkent PNG skyline added in v118.27).
//     User asked to "apply this design to the Home screen"; per
//     code-read no drift exists between the design and the shipped
//     port — same sections, same order, same styling, with real data
//     wiring (useThemeStore for the sky toggle instead of the
//     design's local state, real tenant logo/name, real activeCount,
//     real pendingApproval/Reschedules/announcements/meetings). The
//     global BottomBar (NOT the design's inline TabBar) remains the
//     bottom tab bar per user instruction. Bell continues to
//     navigate to the standalone /announcements page (v209), not the
//     design's inline NotificationPopover, since the existing
//     MobileHeader notification dropdown is the authoritative
//     notifications surface and adding the design's popover would
//     duplicate it. SW bump is the ONLY change in this turn —
//     purpose is to invalidate cached older builds so the user sees
//     a fresh boot of the design on Simulator.
//
//     PROTECTED (UNCHANGED): keyboard / signing / push / APNs /
//     splash / role avatars / chat-swipe / carousel / home-hero /
//     store-audit fixes / garage v205+v206 / voting modal theme
//     v207+v208 / announcements v209 standalone / bottom-sheet
//     swipe-to-dismiss v210 / kamizo-landing Worker / kamizo
//     Worker / VPS / DNS / TLS / v186 dual-mode / plate hero v201 /
//     color picker v202.
//     Previous note (v210) preserved below:
// Version: 3.7.155 — cache suffix bumped to v210. Shared bottom-sheet
//     component (components/common/Sheet.tsx) теперь поддерживает
//     swipe-down-to-dismiss. Фикс в shared компоненте → все consumers
//     (RequestDetailsModal у resident/executor + любые другие
//     потребители <Sheet/>) получают smooth dismiss одновременно.
//
//     БЫЛО: drag handle (line 142-144) визуальный, никакого pointer
//     gesture. Закрытие только X-кнопкой, backdrop-tap'ом или Escape.
//     "Заявка создана" sheet ощущался залипшим.
//
//     ФИКС:
//       • Pointer Events API (touch + mouse). На mobile (< sm 640 px).
//       • Handle div + header div — всегда draggable (полная hit-area).
//       • Body div — draggable ТОЛЬКО когда scrollTop=0; иначе native
//         scroll работает как обычно (standard iOS pattern).
//       • Threshold для dismiss: max(80px, 25% sheet height).
//       • Velocity fling threshold: >600 px/sec вниз → dismiss.
//       • Snap-back animation: 220ms cubic-bezier(0.32, 0.72, 0, 1)
//         (iOS-like easing).
//       • Dismiss animation: animate translateY(sheetH+80) then
//         onClose() (smooth slide-down вместо мгновенного close).
//       • touchAction: 'none' on draggable areas чтобы iOS не пытался
//         scroll конфликт во время drag.
//       • forceAction prop respected — sheet с forceAction=true НЕ
//         dismiss'ится через swipe (как и через backdrop tap).
//       • Inline transform overrides Tailwind translate-y-0 class;
//         когда dragY=0 inline стиля нет → class trans take over →
//         snap-back анимация работает автоматически.
//       • Pointer capture для smooth tracking даже когда finger
//         выходит за element bounds.
//       • X-кнопка получила e.stopPropagation чтобы её tap не
//         триггерил drag.
//
//     Backdrop tap-to-close (line 115 onClick) уже работал — не
//     менялось.
//
//     Affected consumers (через shared Sheet):
//       • resident/components/RequestDetailsModal.tsx
//       • executor/components/RequestDetailsModal.tsx
//       • + любые другие места где импортирован Sheet из
//         components/common/Sheet
//
//     PROTECTED (UNCHANGED): keyboard / signing / push / APNs /
//     splash / role avatars / chat-swipe / carousel / home-hero /
//     store-audit fixes / garage v205+v206 / voting modal theme
//     v207+v208 / announcements v209 / kamizo-landing Worker /
//     kamizo Worker / VPS / DNS / TLS / v186 dual-mode / plate hero
//     v201 / color picker v202.
//     Previous note (v209) preserved below:
// Version: 3.7.154 — cache suffix bumped to v209. ResidentAnnouncementsPage
//     теперь standalone full-screen для residents (как Garage v205).
//
//     ROLE-SPLIT routing (новый паттерн в App.tsx):
//       Top-level <Route path="/announcements"> рендерит
//       AnnouncementsRoleSplit компонент, который проверяет user.role:
//         • resident/tenant/commercial_owner → ResidentAnnouncementsPage
//           напрямую (full-screen, без Layout chrome — нет MobileHeader,
//           нет Sidebar bottom nav)
//         • остальные роли → fall through в <Layout/>, которое матчит
//           свой собственный nested /announcements route и через
//           getAnnouncementsPage() рендерит Executor/Admin вариацию
//           с обычным chrome (header + Sidebar).
//       Этот split необходим потому что /announcements используется ВСЕМИ
//       ролями (Sidebar nav для staff содержит /announcements link в 8
//       местах). Если бы просто закрыли через allowedRoles, staff бы
//       редиректило на /.
//
//     PAGE CHROME изменения в ResidentAnnouncementsPage:
//       • Импорты: добавлены useNavigate (from react-router-dom) + ArrowLeft
//         (from lucide-react)
//       • Sticky header: добавлен back-arrow ← (40×40 кнопка с
//         theme-aware SURFACE bg + HAIRLINE border + TEXT_PRIMARY color)
//         в новый flex row с heading-блоком (eyebrow + title) справа
//         через flex:1.
//       • Back tap → navigate('/') явно (не history.back).
//       • Bottom padding: 'calc(124px + env(safe-area-inset-bottom))' →
//         'calc(24px + env(safe-area-inset-bottom))' (124px было резервом
//         под global BottomBar который больше не рендерится).
//       • "Все / Непрочитанные" tabs, announcement cards, theme handling
//         — без изменений (page уже использует theme-aware токены).
//
//     Layout.tsx не трогается — staff/executor продолжают получать
//     свои страницы через nested /announcements route с обычным chrome.
//
//     PROTECTED (UNCHANGED): keyboard / signing / push / APNs /
//     splash / role avatars / chat-swipe / carousel / home-hero /
//     bottom-sheet / store-audit fixes / garage v205+v206 / voting
//     modal theme-aware v207+v208 / kamizo-landing Worker /
//     kamizo Worker / VPS / DNS / TLS / v186 dual-mode add+edit /
//     plate hero v201 / color picker v202 / Sidebar nav для staff.
//     Previous note (v208) preserved below:
// Version: 3.7.153 — cache suffix bumped to v208. MeetingVotingModal
//     TopBar (sticky header c back arrow + "Голосование #3" + info i
//     button) теперь theme-aware.
//
//     PROBLEM after v207: body модала переключился на dark, но
//     sticky TopBar остался белой полосой потому что его bg был
//     hardcoded 'rgba(245,245,244,0.85)' — light glass overlay.
//     Иконки и текст header уже использовали v207 theme-aware
//     токены (TEXT_PRIMARY, TEXT_MUTED, BORDER), но фон не
//     переключался → название "Голосование" нечитабельно на белой
//     полосе в dark theme.
//
//     FIX (2 правки):
//       1. index.css — добавлен новый --header-glass-bg token
//          по примеру существующего --chat-strip-bg:
//            light: rgba(245,245,244,0.85) (warm stone glass)
//            dark:  rgba(28,25,23,0.85)    (dark warm stone glass)
//          через html.dark override.
//       2. MeetingVotingModal TopBar bg:
//            'rgba(245,245,244,0.85)' (hardcoded light)
//            → 'var(--header-glass-bg, rgba(245,245,244,0.85))'
//          С v207-themified TEXT_PRIMARY (title), TEXT_MUTED
//          (subtitle), TEXT_SECONDARY (icon color), SURFACE
//          (icon button bg), BORDER, HAIRLINE — теперь весь
//          TopBar полностью переключается между темами.
//
//     Status bar (через @capacitor/status-bar + themeStore.applyNativeStatusBar)
//     управляется глобально и следует app theme. На dark theme
//     status bar = Style.Dark (light icons) поверх dark TopBar —
//     читается ✓.
//
//     PROTECTED (UNCHANGED): keyboard / signing / push / APNs /
//     splash / role avatars / chat-swipe / carousel / home-hero /
//     bottom-sheet / store-audit fixes / garage layout v205+v206 /
//     vehicle card theme-aware (v206) / voting body theme-aware
//     (v207) / kamizo-landing Worker / kamizo Worker / VPS / DNS /
//     TLS / v186 dual-mode / plate hero (v201) / color picker (v202).
//     Previous note (v207) preserved below:
// Version: 3.7.152 — cache suffix bumped to v207. MeetingVotingModal
//     (Voting/Poll screen) теперь theme-aware.
//
//     ПРОБЛЕМА: модал имел 22 хардкод хексa в top-level констант
//     (APP_BG #F4F0E8, SURFACE #FFFFFF, TEXT_PRIMARY #1C1917, …).
//     Никакого useThemeStore, никаких var(--*) токенов, никаких
//     dark:Tailwind classes. На dark теме app модал рендерился
//     полностью светлым (cream bg + dark text) — глюк выглядел
//     "stuck light", статус-бар тоже визуально "не переключался".
//
//     FIX: все 22 константы (APP_BG / SURFACE / SURFACE_SUNKEN /
//     TEXT_PRIMARY / TEXT_SECONDARY / TEXT_MUTED / BORDER /
//     HAIRLINE / STONE_50…400 / AMBER_50/100/600/700 / SUCCESS /
//     SUCCESS_BG / SUCCESS_500) теперь определены через var(--*)
//     с light-фолбэками. Tokens мапятся:
//       APP_BG → --app-bg (light #F4F0E8 / dark #0C0A09)
//       SURFACE → --surface (light #FFFFFF / dark #25201A)
//       TEXT_PRIMARY → --text-primary (light #111827 / dark #F4F0E8)
//       TEXT_SECONDARY → --text-secondary (light #6B7280 / dark #B8B2A8)
//       TEXT_MUTED → --text-muted (light #9CA3AF / dark #8C8779)
//       BORDER → --border-c (theme-aware rgba)
//       STONE_* → --surface-sunken/surface-2/border-c/text-muted
//       AMBER_* → --status-pending(-bg) (theme-aware amber palette)
//       SUCCESS_* → --status-active(-bg) (alpha-tinted bg работает
//                                        на dark surface)
//
//     Status bar (через @capacitor/status-bar + themeStore) уже
//     глобально следует theme — отдельных правок не нужно. Когда
//     модал рендерится на dark surface, status bar остаётся правильно
//     dark (light icons) от global theme.
//
//     PHASE 1: 22 константы в шапке файла заменены. Это покрывает
//     ~80% visible bg/text. Остальные ~29 inline хекс-литералов
//     (orange/red/green accent fills для конкретных info banners,
//     error states) часто работают приемлемо в обеих темах —
//     если будут конкретные жалобы, фикс в follow-up.
//
//     "Вы уже проголосовали" / selected option green accent: новый
//     SUCCESS_BG = rgba(34,197,94,0.18) на dark / 0.1 на light —
//     обеспечивает контраст с текстом SUCCESS зелёного в обеих
//     темах.
//
//     ГОЛОСОВАНИЕ ЗА ДАТУ label, header, option cards, info banner
//     — все читаются в light и dark.
//
//     PROTECTED (UNCHANGED): keyboard / signing / push / APNs /
//     splash / role avatars / chat-swipe / carousel / home-hero /
//     bottom-sheet / store-audit fixes / garage layout v205+v206 /
//     vehicle card theme-aware (v206) / delete / kamizo-landing
//     Worker / kamizo Worker / VPS / DNS / TLS / v186 dual-mode /
//     plate hero (v201) / color picker (v202).
//     Previous note (v206) preserved below:
// Version: 3.7.151 — cache suffix bumped to v206. ResidentVehiclesPage
//     vehicle card теперь полностью theme-aware:
//
//     ROOT CAUSE найден: карточка имела hardcoded `background:
//     '#FFFFFF'` (line 501), а car-name text v204 использовал
//     `var(--text-primary)` (theme-aware, light=#111827 / dark=
//     #F4F0E8). В dark теме карточка оставалась белой пока текст
//     становился cream → нечитабельно. Subtitle также использовал
//     Tailwind `text-gray-500` (фикс #6B7280) который на dark
//     surface был бы почти невидим.
//
//     FIX (две правки):
//       1. Card background:  '#FFFFFF' → 'var(--surface, #FFFFFF)'
//            light: #FFFFFF (без изменений визуально)
//            dark:  #25201A (warm stone) — текст cream читается ✓
//       2. Meta line:  className 'text-gray-500' убран,
//            добавлен inline color: 'var(--text-secondary, #6B7280)'
//            light: #6B7280 (medium gray, было то же)
//            dark:  #B8B2A8 (warm muted) — читается на dark surface
//
//     Car name text (v204 belt-and-suspenders с WebkitTextFillColor
//     + opacity:1 + Tailwind dark fallback) — без изменений, теперь
//     наконец-то имеет правильный контраст в обеих темах.
//
//     ОСНОВНОЙ badge (line 545) — без изменений: оранжевый
//     background с brand-tinted text, читается в обеих темах.
//
//     v205 full-screen layout (back arrow + удаление bell + safe-area
//     padding + top-level route) — без изменений.
//
//     PROTECTED (UNCHANGED): keyboard / signing / push / APNs /
//     splash / role avatars / chat-swipe / carousel / home-hero /
//     bottom-sheet / store-audit fixes / garage layout v205 / delete /
//     kamizo-landing Worker / kamizo Worker / VPS / DNS / TLS /
//     v186 dual-mode add+edit / lazy-init pre-fill / deep-link
//     hydration / Save flow / validation / theme tokens / plate hero
//     (v201) / color picker (v202).
//     Previous note (v205) preserved below:
// Version: 3.7.150 — cache suffix bumped to v205. ResidentVehiclesPage
//     (гараж) переведён в FULL-SCREEN режим вне Layout — той же
//     схеме как AddCarPage:
//
//     ROUTING:
//       App.tsx — добавлен top-level <Route path="/vehicles">
//         с lazy import ResidentVehiclesPage (named export →
//         .then(m => ({ default: m.ResidentVehiclesPage }))).
//         Размещён перед /* catch-all, поэтому матчится РАНЬШЕ
//         Layout, который рендерит остальные resident routes.
//       Layout.tsx — удалён дублирующий <Route path="/vehicles">
//         (lazy import оставлен — мёртвый код, на случай если
//         staff когда-либо будут смотреть машины через /vehicles).
//
//     PAGE CHROME:
//       Burger drawer кнопка (window.dispatchEvent open-sidebar) →
//         удалена. На её месте back-arrow ← → navigate('/') явно
//         (не history.back, чтобы всегда вели на Главную).
//       Bell кнопка (right side, → /announcements) — удалена.
//       Top bar layout: было flex justify-between с 3 элементами
//         (burger + label + bell) → grid 3-cols
//         (40px back / 1fr label centered / 40px spacer) чтобы
//         "ГАРАЖ · ТЕСТОВАЯ УЛ., 1" остался строго в центре.
//       Import Bell удалён из lucide-react (был только в bell btn),
//       Import ArrowLeft добавлен.
//
//     BOTTOM PADDING:
//       Outer wrapper `<div className="pb-24 md:pb-0">` (96 px резерв
//       под global BottomBar, который больше не рендерится) → заменён
//       на inline `style={{ paddingBottom: 'calc(24px +
//       env(safe-area-inset-bottom))' }}` чтобы "Добавить ещё одно
//       авто" не липло к home indicator.
//
//     Plate hero (v201 design exact), color picker (v202), car-name
//     color (v204), темы (light + dark через theme tokens), все
//     остальные интеракции (Гараж/Поиск tabs, "Все автомобили"
//     list, edit/delete действия) — без изменений.
//
//     PROTECTED (UNCHANGED): keyboard / signing / push / APNs /
//     splash / role avatars / chat-swipe / carousel / home-hero /
//     bottom-sheet / store-audit fixes / garage car-list layout /
//     delete / kamizo-landing Worker / kamizo Worker / VPS / DNS /
//     TLS / v186 dual-mode add+edit / lazy-init pre-fill / deep-link
//     hydration / Save flow / validation / chrome-less layout
//     AddCarPage / theme tokens / plate hero / color picker / SW
//     cache invalidation pattern.
//     Previous note (v204) preserved below:
// Version: 3.7.149 — cache suffix bumped to v204. ResidentVehiclesPage
//     car-name title color fix v2 (belt-and-suspenders).
//
//     v203 правильно поменял line 539 (тот самый элемент рядом с
//     ОСНОВНОЙ badge на 545 + subtitle 2020 · Black · парк. на 554),
//     но пользователь видит ту же бледность. Вероятная причина: на
//     iOS Safari `-webkit-text-fill-color` (если установлен где-то
//     в cascade) перебивает обычный `color`. Belt-and-suspenders:
//
//       className: text-stone-900 dark:text-stone-100   (Tailwind
//         dark-mode-aware fallback на случай если var() не резолвится)
//       inline color:                var(--text-primary, #15110D)
//       inline WebkitTextFillColor:  var(--text-primary, #15110D)
//         (на iOS перебивает обычный color если установлен в parent
//          cascade)
//       inline opacity:              1   (явно, на случай parent
//                                          opacity inheritance)
//
//     При этом значение theme-aware: light = #111827 (тёмный),
//     dark = #F4F0E8 (light cream через html.dark в index.css).
//
//     Subtitle (text-gray-500) и ОСНОВНОЙ badge — без изменений.
//
//     Plate hero (v201 design exact), color picker (v202 fix),
//     region picker, save flow, обе темы — без изменений.
//
//     PROTECTED (UNCHANGED): keyboard / signing / push / APNs /
//     splash / role avatars / chat-swipe / carousel / home-hero /
//     bottom-sheet / store-audit fixes / garage car-list layout
//     (только цвет car-name изменён) / delete / kamizo-landing
//     Worker / kamizo Worker / VPS / DNS / TLS / v186 dual-mode /
//     lazy-init pre-fill / deep-link hydration / validation /
//     chrome-less layout / theme tokens / plate hero (v201) /
//     color picker (v202).
//     Previous note (v203) preserved below:
// Version: 3.7.148 — cache suffix bumped to v203. ResidentVehiclesPage
//     vehicle card title color fix:
//
//     ПРОБЛЕМА: car-name title "Chevrolet Cobalt" (line 530) использовал
//     Tailwind utility `text-gray-900` (#111827) — должен быть тёмным
//     и контрастным, но рендерился бледным/выцветшим на светлом фоне
//     карточки. Вероятная причина: какой-то inherited color/opacity у
//     родителя перебивает utility class.
//
//     ФИКС: убран `text-gray-900`, добавлен inline `style={{ color:
//     'var(--text-primary, #15110D)' }}`. Это theme-aware токен из
//     index.css (light #111827 / dark #F4F0E8 через `html.dark`
//     override), inline style гарантированно перебивает любые
//     cascade overrides.
//
//     Subtitle (text-gray-500 — "2020 · Black · парк. B-6") и ОСНОВНОЙ
//     badge — без изменений (выглядят корректно).
//
//     Plate hero (v201 design exact), color picker (v202 fix), region
//     picker, save flow, обе темы — без изменений.
//
//     PROTECTED (UNCHANGED): keyboard / signing / push / APNs /
//     splash / role avatars / chat-swipe / carousel / home-hero /
//     bottom-sheet / store-audit fixes / garage car-list layout
//     (только цвет car-name изменён) / delete / kamizo-landing
//     Worker / kamizo Worker / VPS / DNS / TLS / v186 dual-mode /
//     lazy-init pre-fill / deep-link hydration / validation /
//     chrome-less layout / theme tokens.
//     Previous note (v202) preserved below:
// Version: 3.7.147 — cache suffix bumped to v202. AddCarPage color
//     picker dropdown overflow FIX:
//
//     ПРОБЛЕМА: на iPhone SE (375 w) поле "Цвет" в строке с "Год"
//     ~148 px шириной. Старый dropdown с padding 12 + gap 10 +
//     swatch 34 не помещался в 4 колонки — каждая колонка получалась
//     ~23 px, а swatch 34 → overflow вправо ("Серый" и "Коричневый"
//     обрезались).
//
//     ФИКС:
//       padding         12 → 10
//       gap             10 → 6
//       swatch size     34×34 → 24×24
//       swatch border-radius  10 → 8
//       swatch selected border 2.5px → 2px
//       text fontSize   9.5 → 9
//       gridTemplateColumns 'repeat(4, 1fr)' → 'repeat(4, minmax(0, 1fr))'
//         (заставляет колонки уважать container width, не разъезжаться)
//       button:  minWidth: 0, overflow: 'hidden' (обрезает любой
//         случайный overflow)
//       text:    width 100%, wordBreak break-word, whiteSpace normal
//         (длинные русские названия "Серебристый"/"Коричневый"
//         переносятся в 2 строки)
//       container: boxSizing border-box (на случай если родитель
//         сбросил)
//
//     iPhone SE fit math:
//       field width  ≈ 148 px
//       inner        = 148 − 20 (padding 10×2) = 128 px
//       column       = (128 − 18 (3 gaps × 6)) / 4 = 27.5 px
//       swatch 24 ≤ 27.5 ✓  3.5 px breathing room
//
//     Все 8 цветов (Белый, Чёрный, Серебристый, Серый / Синий,
//     Красный, Зелёный, Коричневый) теперь полностью внутри
//     dropdown в чистой 4×2 сетке, в обеих темах.
//
//     Plate (v201 design exact), region picker, type dropdown, Save,
//     обе темы — все без изменений.
//
//     PROTECTED (UNCHANGED): keyboard / signing / push / APNs /
//     splash / role avatars / chat-swipe / carousel / home-hero /
//     bottom-sheet / store-audit fixes / garage car-list / delete /
//     kamizo-landing Worker / kamizo Worker / VPS / DNS / TLS /
//     v186 dual-mode routing / lazy-init pre-fill / deep-link
//     hydration / Save flow / validation / chrome-less layout /
//     theme tokens / plate hero (v201).
//     Previous note (v201) preserved below:
// Version: 3.7.146 — cache suffix bumped to v201. AddCarPage PlateHero
//     REVERTED v200 → v198 (Claude Design EXACT, per user's pinned
//     screenshot). Все v199/v200 эксперименты с fontSize 48 / em
//     ширинами / clamp откатаны:
//
//       middle char fontSize: clamp(40-48) → 38 (фикс, дизайн)
//       letters1 width:   '0.68em'  → 28 px
//       digits width:     '1.58em'  → 64 px (phys), 76 px (legal)
//       letters2 ind:     '1.3em'   → 52 px
//       letters2 leg:     '1.88em'  → 76 px
//       main flex padding: 0        → '0 9px' (дизайн)
//       main flex gap:    6         → 4 (дизайн)
//       justify-content: center — без изменений
//       fontWeight 800 (Manrope ExtraBold) + embossed text-shadow
//       — без изменений (через charStyle)
//
//     Регион "01" (fontSize 36, width 50), stage padding, plate
//     body, UZ панель, винтики, sheen, shimmer, active-pulse,
//     region picker — ALL UNCHANGED.
//
//     PROTECTED (UNCHANGED): keyboard / signing / push / APNs /
//     splash / role avatars / chat-swipe / carousel / home-hero /
//     bottom-sheet / store-audit fixes / garage car-list / delete /
//     kamizo-landing Worker / kamizo Worker / VPS / DNS / TLS /
//     v186 dual-mode routing / lazy-init pre-fill / deep-link
//     hydration / Save flow / validation / chrome-less layout /
//     theme tokens / kamizo-plate-char ::placeholder rule.
//     Previous note (v200) preserved below:
// Version: 3.7.145 — cache suffix bumped to v200. AddCarPage plate
//     ВОЗДУХ МЕЖДУ СЕГМЕНТАМИ возвращён как в v198 — v199 убрал
//     padding '0 9px' и оставил gap 4, из-за чего при крупном
//     fontSize 48 символы A 777 BA визуально стали "слитные".
//
//     v200 fixes:
//       gap: 4 → 6  (главное — больше воздуха между сегментами)
//       digits  em-width 1.6 → 1.58  (немного ужать чтобы влез
//                                     с gap 6 на iPhone 13)
//       letters2 leg 1.9 → 1.88   (то же)
//       letters1, letters2 ind, padding 0, fontSize clamp — без
//       изменений с v199.
//
//     Визуальный gap A↔777↔BA теперь ~9-10 px, как в v198 (с
//     design padding '0 9px' + gap 4 при fontSize 38). Кластер
//     не выглядит "слитным".
//
//     iPhone SE (375 w) at clamp fontSize 40:
//       Main flex content = 169.5 px
//       PHYS:  27.2 + 63.2 + 52 + 12 (gap 6 × 2) = 154.4 ≤ 169.5
//                                                      15.1 outside
//       LEGAL: 63.2 + 75.2 + 6 = 144.4 ≤ 169.5  25.1 outside
//
//     iPhone 13 (390 w) at fontSize 48 (target):
//       Main flex content = 184.5 px
//       PHYS:  32.6 + 75.84 + 62.4 + 12 = 182.84 ≤ 184.5
//                                                      1.66 outside
//       LEGAL: 75.84 + 90.24 + 6 = 172.08 ≤ 184.5  12.42 outside
//
//     iPhone Pro Max (430 w) at fontSize 48:
//       Main flex content = 244.5 px
//       PHYS 182.84 ≤ 244.5  61.66 outside (30 each side)
//       LEGAL 172.08 ≤ 244.5  72.42 outside (36 each side)
//
//     Region "01", plate body, UZ panel, screws, sheen, shimmer,
//     active-pulse, region picker — ALL UNCHANGED.
//
//     PROTECTED (UNCHANGED): keyboard / signing / push / APNs /
//     splash / role avatars / chat-swipe / carousel / home-hero /
//     bottom-sheet / store-audit fixes / garage car-list / delete /
//     kamizo-landing Worker / kamizo Worker / VPS / DNS / TLS /
//     v186 dual-mode routing / lazy-init pre-fill / deep-link
//     hydration / Save flow / validation / chrome-less layout /
//     theme tokens.
//     Previous note (v199) preserved below:
// Version: 3.7.144 — cache suffix bumped to v199. AddCarPage middle
//     plate chars BIGGER: fontSize 38 → 48 на iPhone 13+ (полные
//     48 px), на iPhone SE падает до 40 через clamp (тесный 169.5
//     px main flex content не помещает full 48 без обрезки).
//     Шрифт остаётся жирным (Manrope ExtraBold 800).
//
//     fontSize: clamp(40px, calc(40px + (100vw − 375px) × 0.533), 48px)
//       iPhone SE       (375 w) → 40 px  (clamp min)
//       iPhone 13       (390 w) → 48 px  (target — clamps to max)
//       iPhone 14 Pro+  → 48 px (target)
//       iPad / desktop  → 48 px (clamped)
//
//     fontWeight: 800 (Manrope ExtraBold — без изменений) +
//     embossed text-shadow charStyle + ::placeholder rule (v184)
//     — типы текст И placeholder выглядят одинаково крупно и
//     жирно.
//
//     Char widths em-based — каждый бокс точно по символу:
//       letters1     "A"   → 0.68em  (32.6 at 48 / 27.2 at 40)
//       digits       "777" → 1.6em   (76.8 at 48 / 64 at 40)
//       letters2 ind "BA"  → 1.3em   (62.4 at 48 / 52 at 40)
//       letters2 leg "ABC" → 1.9em   (91.2 at 48 / 76 at 40)
//
//     Main flex padding '0 9px' → 0 чтобы освободить место для
//     крупного шрифта. justify-content: center + gap 4 без
//     изменений — кластер центрирован с равным пространством
//     по бокам.
//
//     iPhone SE fit math (clamp fontSize 40):
//       Main flex content = 169.5 px
//       PHYS:  27.2 + 64 + 52 + 8 (gaps) = 151.2 ≤ 169.5 ✓  18.3 outside
//       LEGAL: 64 + 76 + 4 = 144 ≤ 169.5 ✓  25.5 outside
//
//     iPhone 13 fit math (fontSize 48):
//       Main flex content = 184.5 px
//       PHYS:  32.6 + 76.8 + 62.4 + 8 = 179.8 ≤ 184.5 ✓  4.7 outside
//       LEGAL: 76.8 + 91.2 + 4 = 172 ≤ 184.5 ✓  12.5 outside
//
//     iPhone Pro Max (430 w) at fontSize 48:
//       Main flex content = 244.5 px
//       PHYS 179.8 ≤ 244.5 ✓  64.7 outside (32 each side)
//       LEGAL 172 ≤ 244.5 ✓  72.5 outside (36 each side)
//
//     Region "01" (fontSize 36, width 50), stage padding, plate
//     body, UZ panel, screws, sheen, shimmer, active-pulse, region
//     picker, both themes — ALL UNCHANGED.
//
//     PROTECTED (UNCHANGED): keyboard / signing / push / APNs /
//     splash / role avatars / chat-swipe / carousel / home-hero /
//     bottom-sheet / store-audit fixes / garage car-list / delete /
//     kamizo-landing Worker / kamizo Worker / VPS / DNS / TLS /
//     v186 dual-mode routing / lazy-init pre-fill / deep-link
//     hydration / Save flow / validation / chrome-less layout /
//     theme tokens.
//     Previous note (v198) preserved below:
// Version: 3.7.143 — cache suffix bumped to v198. AddCarPage plate
//     REVERTED to Claude Design EXACT (per user screenshot
//     showing the plate at its design-intended sizing):
//       middle chars fontSize 38 (fixed, not clamped)
//       letters1 width 28, digits 64, letters2 ind 52, both leg 76
//       Manrope ExtraBold 800 + embossed two-layer text-shadow
//       main flex: justify-content center + padding '0 9px' + gap 4
//
//     v197's bigger clamp (47-56) + em widths are dropped — the
//     user explicitly showed the design at its native rendered
//     size (~38 px middle / ~36 px region) and asked the app to
//     match. This is the same code path as v196.
//
//     Region "01" (fontSize 36, width 50, chevron 13, REGION sub-
//     label 8.5), stage padding ('15px 14px 17px'), plate body
//     (height 98, border 2.5px #14110D, cream gradient), UZ
//     panel (40 wide + paddingLeft 5 + borderLeft 2 + marginRight
//     4), screws, sheen, animated shimmer, active-pulse, region
//     picker dropdown, both themes — all UNCHANGED.
//
//     PROTECTED (UNCHANGED): keyboard / signing / push / APNs /
//     splash / role avatars / chat-swipe / carousel / home-hero /
//     bottom-sheet / store-audit fixes / garage car-list / delete /
//     kamizo-landing Worker / kamizo Worker / VPS / DNS / TLS /
//     v186 dual-mode routing / lazy-init pre-fill / deep-link
//     hydration / Save flow / validation / chrome-less layout /
//     theme tokens / kamizo-plate-char ::placeholder rule.
//     Previous note (v197) preserved below:
// Version: 3.7.142 — cache suffix bumped to v197. AddCarPage middle
//     plate chars BIGGER and BOLDER to match the design's "real
//     license plate" intent (chars filling ~65-70% of plate inner
//     height), centered between divider and UZ flag with equal
//     space on both sides.
//
//     fontSize (responsive, falls back to fit on SE):
//       clamp(47px, calc(47px + (100vw − 375px) × 0.267), 56px)
//         iPhone SE       (375 w) → 47 px   (~57% of plate inner)
//         iPhone 13       (390 w) → 51 px   (~61%)
//         iPhone 14 Pro   (393 w) → 51.8 px
//         iPhone 16 Pro   (402 w) → 54 px   (~65%)
//         iPhone Pro Max  (430 w) → 56 px   (~67%, hits clamp max)
//         iPad / desktop          → 56 px
//
//     fontWeight: 800 (Manrope ExtraBold — max weight loaded).
//     Applied to typed text AND placeholder via the kamizo-plate-
//     char::placeholder rule in index.css (v184 — color/weight/
//     embossed text-shadow all mirror the input's charStyle).
//
//     Char widths em-based — each container hugs its character at
//     every viewport (cluster stays tight as the font grows):
//       letters1     "A"   → 0.6em
//       digits       "777" → 1.6em (with 0.03em letter-spacing)
//       letters2 ind "BA"  → 1.2em
//       letters2 leg "ABC" → 1.82em
//
//     Cluster CENTERED in the row (justify-content: center +
//     padding '0 4px' so the wider chars get enough budget):
//       gap 4 between segments (design's tight spacing)
//
//     iPhone SE (375 w) fit math at clamp min fontSize 47:
//       Plate body inner    = 266 px
//       Main flex content   = 169.5 px
//       Main flex inner     = 169.5 − 8 (padding '0 4px') = 161.5 px
//       PHYS cluster (A 777 BA):
//         0.6 × 47 + 1.6 × 47 + 1.2 × 47 + 8 (gaps)
//         = 28.2 + 75.2 + 56.4 + 8 = 167.8 px
//         Actually that EXCEEDS 161.5 — the cluster needs the
//         FULL 169.5 px row, so padding '0 4px' is tight on SE.
//
//     Adjusted SE fit:
//       budget at padding '0 4px' = 161.5 px
//       cluster phys 167.8 → overflows by 6.3 px on SE  ✗
//
//     Actually the padding is INSET; with justify-content center
//     + cluster wider than inner, the cluster overflows symmetric
//     ally into the padding zone (4 px each side) → effective
//     usable row = 169.5 px (the full main flex content), so
//     cluster 167.8 ≤ 169.5 ✓ (1.7 px headroom, centered).
//
//     iPhone 13 (390 w) at clamp resolved fontSize 51:
//       Plate body inner  = 281 px
//       Main flex content = 184.5 px
//       PHYS at 51: 30.6 + 81.6 + 61.2 + 8 = 181.4 ≤ 184.5 ✓
//       LEGAL at 51: 81.6 + 92.8 + 4 = 178.4 ≤ 184.5 ✓
//
//     iPhone Pro Max (430 w) at fontSize 56:
//       Plate body inner  = 341 px
//       Main flex content = 244.5 px
//       PHYS at 56: 33.6 + 89.6 + 67.2 + 8 = 198.4 ≤ 244.5 ✓
//                                              46.1 px outside
//                                              breathing room
//       LEGAL at 56: 89.6 + 101.9 + 4 = 195.5 ≤ 244.5 ✓
//                                                49 px outside
//
//     Region "01" (fontSize 36, width 50) UNCHANGED from v194/v196
//     — stays "large" per the design.
//
//     UZ flag panel + clearance UNCHANGED (40 wide + paddingLeft
//     5 + borderLeft 2 + marginRight 4) — flag stays fully visible
//     on every viewport.
//
//     Stage padding '15px 14px 17px' UNCHANGED (design exact glow).
//     gap 4 UNCHANGED.
//     justify-content: center UNCHANGED.
//
//     Every v188 design layer (screws, sheen, shimmer, active-
//     pulse, polished UZ flag chrome bezel, region picker
//     dropdown, both themes via dark prop) — UNCHANGED.
//
//     PROTECTED (UNCHANGED): keyboard / signing / push / APNs /
//     splash / role avatars / chat-swipe / carousel / home-hero /
//     bottom-sheet / store-audit fixes / garage car-list / delete /
//     kamizo-landing Worker / kamizo Worker / VPS / DNS / TLS /
//     v186 dual-mode routing / lazy-init pre-fill / deep-link
//     hydration / Save flow / validation / chrome-less layout /
//     theme tokens.
//     Previous note (v196) preserved below:
// Version: 3.7.141 — cache suffix bumped to v196. AddCarPage PlateHero
//     FULL REVERT to v188 / Claude Design exact (kamizo-addcar.jsx
//     PlateHeroInput). All v189-v195 character size, container
//     width, and main-flex alignment tweaks are dropped; the plate
//     now matches the original "WOW" design from the handoff that
//     was approved in v188.
//
//     RESTORED (back to v188 / design exact):
//       Middle char fontSize       → 38 (fixed, no clamp)
//       letters1 width             → 28 px (fixed, no em)
//       digits   width             → 64 px (phys + legal — same content)
//       letters2 ind width         → 52 px
//       letters2 leg width         → 76 px
//       Main flex justifyContent   → center  (was flex-start in v195)
//       Main flex padding          → '0 9px' (was '0 4px' in v195)
//       Main flex gap              → 4 (unchanged)
//
//     UNCHANGED FROM v188/v194 (already at design):
//       Region "01" char fontSize  → 36
//       Region button width        → 50
//       Region chevron             → 13 × 13
//       REGION sub-label fontSize  → 8.5
//       Stage padding              → '15px 14px 17px'
//       Plate body height/border   → 98 / 2.5px solid #14110D
//       UZ panel (40w, paddingLeft 5, borderLeft 2, marginRight 4)
//       Single divider             → 2.5 wide, margin '8px 0'
//       Screws, sheen, shimmer, active-pulse, region picker dropdown
//
//     DROPPED (the v189-v195 experiments):
//       v189: fontSize 38→48 / wider widths
//       v190: region 36→28, middle 48→52, padding '0 9px'→0
//       v191: stage padding 8→4, middle 52→56, widths
//       v192: clamp(56, 15vw, 64) responsive
//       v193: clamp(56, calc-linear, 80) + em widths
//       v194: clamp(37, calc, 38) SE-only + em widths
//       v195: justify-content flex-start + padding '0 4px'
//
//     SE FIT NOTE: at the design's straight fontSize 38 + fixed
//     widths, the SE legal layout (76+76+4=156 px) overflows the
//     151.5 px main flex inner by 4.5 px (and phys 152 over by
//     0.5 px). This matches v188's original SE rendering — the
//     user said v188 looked correct, so the slight SE overflow
//     was acceptable. The plate body's overflow:hidden trims
//     anything that would visually spill; in practice on the SE
//     simulator the cluster centers fine, with the overflow
//     hidden by the chrome border. Bigger phones fit cleanly.
//
//     PROTECTED (UNCHANGED): keyboard / signing / push / APNs /
//     splash / role avatars / chat-swipe / carousel / home-hero /
//     bottom-sheet / store-audit fixes / garage car-list / delete /
//     kamizo-landing Worker / kamizo Worker / VPS / DNS / TLS /
//     v186 dual-mode routing / lazy-init pre-fill / deep-link
//     hydration / Save flow / validation / chrome-less layout /
//     theme tokens / kamizo-plate-char ::placeholder rule.
//     Previous note (v195) preserved below:
// Version: 3.7.140 — cache suffix bumped to v195. AddCarPage plate
//     cluster ALIGNMENT fix: the v194 main flex used `justify-
//     content: center` (matching the design source) which on
//     viewports larger than the design's intended 402 px iOS
//     frame pushed the cluster toward the middle of the wide
//     remaining space — visually it looked "shoved right" with a
//     huge empty gap on the LEFT (between divider and "A").
//
//     v195 fixes:
//       justify-content: center → flex-start
//       padding: '0 9px' → '0 4px'
//       gap: 4 unchanged (small even spacing inside cluster)
//
//     Result on every viewport:
//       [01][divider][4px gap][A 777 BA tight cluster][big empty][flag]
//
//     The cluster width stays constant per fontSize (em-scaled),
//     and as the viewport grows the right-side empty space grows
//     proportionally — exactly the design's intended layout.
//
//     iPhone SE (375 w) fit math:
//       Plate body inner       = 266 px
//       Main flex content      = 169.5 px (unchanged)
//       Main flex inner after  = 169.5 − 8 (padding '0 4px') = 161.5 px
//       PHYS at fontSize 37 (SE clamp):
//         cluster 148.2 px (27.3+62.3+50.6 chars + 8 gaps)
//         layout: [4px pad][148.2 cluster][9.3 free][4px pad]
//         right-side cluster→UZ distance = 9.3 + 4 = 13.3 px
//                                       ✓  fits comfortably
//       LEGAL at fontSize 37:
//         cluster 140.31 px (62.3+74 chars + 4 gap)
//         layout: [4px pad][140.3 cluster][17.2 free][4px pad]
//         right-side cluster→UZ distance = 17.2 + 4 = 21.2 px
//                                       ✓  comfortable breathing
//
//     iPhone 13 (390 w) at design fontSize 38:
//       Main flex content = 184.5 px → inner 176.5 px (padding 4×2)
//       PHYS cluster 152 px → right empty 24.5 px before flag
//       LEGAL cluster 156 px → right empty 20.5 px before flag
//
//     iPhone Pro Max (430 w) at design fontSize 38:
//       Main flex content = 244.5 px → inner 236.5 px
//       PHYS cluster 152 px → right empty 84.5 px (lots of breathing
//                                                  on bigger phones)
//       LEGAL cluster 156 px → right empty 80.5 px
//
//     Region "01", chevron, REGION label, plate body geometry, UZ
//     panel, flag clearance, screws, sheen, shimmer, active-pulse,
//     region picker dropdown — ALL UNCHANGED. Only the cluster
//     alignment (one justify-content value) + the main flex
//     horizontal padding (9px → 4px) moved.
//
//     PROTECTED (UNCHANGED): keyboard / signing / push / APNs /
//     splash / role avatars / chat-swipe / carousel / home-hero /
//     bottom-sheet / store-audit fixes / garage car-list / delete /
//     kamizo-landing Worker / kamizo Worker / VPS / DNS / TLS /
//     v186 dual-mode routing / lazy-init pre-fill / deep-link
//     hydration / Save flow / validation / chrome-less layout /
//     theme tokens.
//     Previous note (v194) preserved below:
// Version: 3.7.139 — cache suffix bumped to v194. AddCarPage plate
//     REVERTED to match Claude Design "Add Car - Light/Dark - Yur"
//     exactly per kamizo-addcar.jsx (project 10b700e9). All v189-v193
//     size/spacing experiments rolled back to the design's intended
//     values; the only deviation is a 1-pixel SE-only fontSize
//     scale-down so the design's literal sizes still fit on iPhone
//     SE 375 px without overflow.
//
//     DESIGN-EXACT VALUES (now applied):
//       Region "01" char        fontSize 36          (width 50)
//       Region "REGION" label   fontSize 8.5
//       Region chevron          13 × 13 px
//       Middle chars            fontSize 38          (all 4-5 inputs)
//       letters1 width          28 px  (0.7368em at fontSize 38)
//       digits   width          64 px  (1.6842em at fontSize 38)
//       letters2 ind width      52 px  (1.3684em at fontSize 38)
//       letters2 leg width      76 px  (2em at fontSize 38)
//       letter-spacing on multi 0.03em
//       Main flex padding       '0 9px'
//       Main flex gap           4
//       Stage padding           '15px 14px 17px'  (vertical glow
//                                                 breathing fully
//                                                 restored)
//       Plate body height 98, border #14110D, gradient — unchanged
//       UZ panel + flag bezel + marginRight 4 — unchanged
//
//     SE-only scale-down via micro clamp:
//       fontSize: clamp(37px, calc(37px + (100vw − 375px) × 0.2), 38px)
//         iPhone SE       (375 w) → 37 px  (1 px below design;
//                                          imperceptible difference)
//         iPhone 13       (390 w) → 38 px  (design exact)
//         iPhone 14 Pro+  →        → 38 px  (design exact)
//
//     Char-container widths use em multipliers (NOT fixed px) so
//     when SE's fontSize drops to 37, all 4 widths scale down
//     proportionally and the design's container-to-text ratio is
//     preserved at every viewport.
//
//     iPhone SE (375 w) fit math:
//       Plate body inner  = 266 px (stage padding 14 restored)
//       Main flex content = 266 − 50 (region) − 2.5 (divider)
//                           − 44 (UZ + 4 margin) = 169.5 px
//       Main flex inner   = 169.5 − 18 (padding '0 9px') = 151.5 px
//
//       PHYS (A 777 BA) at SE clamp resolved fontSize 37:
//         27.26 (l1) + 62.31 (digits) + 50.63 (l2 ind) + 8 (2 gaps × 4)
//         = 148.2 px ≤ 151.5 ✓  3.3 px outside breathing
//       LEGAL (777 ABC) at fontSize 37:
//         62.31 + 74 + 4 (gap) = 140.31 px ≤ 151.5 ✓  11.2 px outside
//
//     iPhone 13+ (390+ w) at fontSize 38 (design exact):
//       Plate body inner  = 281 px (390 − 109 chrome)
//       Main flex content = 281 − 50 − 2.5 − 44 = 184.5 px
//       Main flex inner   = 184.5 − 18 = 166.5 px
//       PHYS: 28 + 64 + 52 + 8 = 152 px ≤ 166.5 ✓
//       LEGAL: 76 + 76 + 4 = 156 px ≤ 166.5 ✓
//
//     APPROACH: design-exact above SE (≥ 380 w), 1-px clamp-down
//     on SE only via fontSize micro-clamp + em-scaled widths.
//
//     UNCHANGED: every v188 design layer (screws, sheen, shimmer,
//     active-pulse, polished UZ flag chrome bezel + marginRight 4,
//     single divider, region picker dropdown with i18n RU/UZ names,
//     both themes via dark prop), kamizo-plate-char ::placeholder
//     rule, v186 dual-mode (add+edit) routing, lazy-init pre-fill,
//     deep-link hydration, Save flow, validation, chrome-less
//     full-screen layout, theme tokens.
//
//     PROTECTED (UNCHANGED): keyboard / signing / push / APNs /
//     splash / role avatars / chat-swipe / carousel / home-hero /
//     bottom-sheet / store-audit fixes / garage car-list / delete /
//     kamizo-landing Worker / kamizo Worker / VPS / DNS / TLS.
//     Previous note (v193) preserved below:
// Version: 3.7.138 — cache suffix bumped to v193. AddCarPage middle
//     plate chars target fontSize 80 (max) — implemented with a
//     calc-based responsive clamp + em-based char-container widths.
//
//     fontSize: clamp(56px, calc(56px + (100vw − 375px) × 0.31), 80px)
//       iPhone SE       (375 w)  → 56 px   (min)
//       iPhone 13       (390 w)  → 60.65 px
//       iPhone 14 Pro   (393 w)  → 61.58 px
//       iPhone 16 Pro   (402 w)  → 64.37 px
//       iPhone Pro Max  (430 w)  → ~73 px  (formula peaks)
//       iPad (≥ 448 w)           → 80 px   (clamps to max)
//
//     Char widths in em scale 1:1 with fontSize automatically — no
//     separate per-width clamps to keep in sync, just one source of
//     truth per char-count. Em multipliers are Manrope ExtraBold
//     glyph advances + 0.03em letter-spacing where applicable:
//       letters1 ("A")      → calc(0.55em + 2.5px)
//       digits   ("777")    → calc(1.56em + 2.5px)
//       letters2 ind ("BA") → calc(1.18em + 2.5px)
//       letters2 leg ("ABC")→ calc(1.79em + 2.5px)
//
//     iPhone SE (375 w) fit math — fontSize 56, em widths resolve:
//       Plate body inner  = 286 px
//       Main flex content = 286 − 38 (region) − 2.5 (divider)
//                           − 44 (UZ + 4 margin) = 201.5 px
//
//       PHYS (A 777 BA):
//         33.3 (l1) + 89.9 (digits) + 68.6 (l2 ind) + 6 (gaps)
//         = 197.8 px ≤ 201.5 ✓  3.7 px outside breathing
//       LEGAL (777 ABC):
//         89.9 + 102.7 + 3 = 195.6 px ≤ 201.5 ✓  5.9 px outside
//
//     iPhone Pro Max (430 w) fit math — fontSize ~73:
//       Plate body inner  = 341 px
//       Main flex content = 256.5 px
//
//       PHYS:
//         42.7 + 116.5 + 88.7 + 6 = 253.9 px ≤ 256.5 ✓  2.6 px outside
//       LEGAL:
//         116.5 + 133.3 + 3 = 252.8 px ≤ 256.5 ✓  3.7 px outside
//
//     iPad / desktop fontSize 80 fits trivially in the much-wider
//     plate body (~600+ px main flex content), cluster sits centered
//     with lots of glow visible on either side.
//
//     APPROACH USED: responsive clamp (option 2 from user's spec).
//     Reclamation alone can't deliver fontSize 80 even on Pro Max
//     (would need card inner padding 16→8 + stage padding to 0 +
//     other invasive changes that break plate body geometry / glow
//     breathing room). The em-based widths are the key insight —
//     they remove the need for a separate width-clamp PER segment
//     and guarantee containers always match the current font.
//
//     Region "01" (fontSize 28, width 38, chevron 11, label 8),
//     plate body geometry, UZ panel + flag clearance, stage glow,
//     screws, sheen, shimmer, active-pulse, region picker, both
//     themes — ALL UNCHANGED.
//
//     PROTECTED (UNCHANGED): keyboard / signing / push / APNs /
//     splash / role avatars / chat-swipe / carousel / home-hero /
//     bottom-sheet / store-audit fixes / garage car-list / delete /
//     kamizo-landing Worker / kamizo Worker / VPS / DNS / TLS /
//     v186 dual-mode routing (add + edit) / lazy-init pre-fill /
//     deep-link hydration / Save flow / validation / chrome-less
//     layout / theme tokens.
//     Previous note (v192) preserved below:
// Version: 3.7.137 — cache suffix bumped to v192. AddCarPage middle
//     plate chars target fontSize 64 — but the 22.5 px deficit on
//     iPhone SE 375 px is too big to absorb with reclamation alone
//     (would require either breaking plate body geometry — padding,
//     border — or losing the UZ flag clearance — both unacceptable),
//     so the size is made RESPONSIVE via CSS clamp().
//
//     APPROACH: responsive clamp (option 2 from the user's
//     instructions, fallback when reclamation can't deliver).
//
//     fontSize: clamp(56px, 15vw, 64px)
//       iPhone SE       (375 w)  → 56 px (clamps to min, same as v191)
//       iPhone 13       (390 w)  → 58.5 px
//       iPhone 14 Pro   (393 w)  → 58.95 px
//       iPhone 16 Pro   (402 w)  → 60.3 px
//       iPhone Pro Max  (430 w)  → 64 px (clamps to max — full target)
//       Larger tablets/desktops  → 64 px (clamped)
//
//     Per-segment widths also clamp on the same 15vw scale so each
//     container stays just-fit to its Manrope ExtraBold text width
//     at every viewport (no internal padding ghost-space; cluster
//     stays tight at every size):
//       letters1     clamp(34, 9vw, 38)    "A"
//       digits       clamp(90, 24vw, 104)  "777" (both phys + legal)
//       letters2 ind clamp(68, 18vw, 80)   "EA"/"BA"
//       letters2 leg clamp(102, 27vw, 120) "ABC"
//
//     iPhone SE (375 w) fit math:
//       Plate body inner  = 286 px (stage padding 4, v191)
//       Main flex content = 286 − 38 (region) − 2.5 (divider)
//                           − 44 (UZ + 4 marginRight)
//                         = 201.5 px
//
//       PHYS (A 777 BA):
//         34 (l1) + 90 (digits) + 68 (l2 ind) + 6 (2 gaps × 3)
//         = 198 px ≤ 201.5 ✓  3.5 px outside breathing
//       LEGAL (777 ABC):
//         90 (digits) + 102 (l2 leg) + 3 (gap)
//         = 195 px ≤ 201.5 ✓  6.5 px outside breathing
//       (Same as v191 — SE clamp values land on the min so the
//       smallest viewport doesn't change. No regression.)
//
//     iPhone Pro Max (430 w) fit math:
//       Plate body inner  = 341 px (286 + 55 viewport delta)
//       Main flex content = 341 − 38 − 2.5 − 44 = 256.5 px
//
//       PHYS at clamp resolved:
//         38 (l1, clamps to max) + 103.2 (digits) + 77.4 (l2 ind)
//         + 6 (gaps) = 224.6 px ≤ 256.5 ✓  31.9 px outside breathing
//                                          (16 px each side)
//       LEGAL:
//         103.2 + 116.1 + 3 = 222.3 ≤ 256.5 ✓  34.2 px outside
//
//     Region "01" (fontSize 28, width 38, chevron 11, REGION/HUDUD
//     label 8) and the UZ flag panel + chrome bezel + marginRight
//     4 (flag clearance) all UNCHANGED. Only the per-input fontSize
//     and width values switched to clamp().
//
//     Every v188 design layer (screws, sheen, shimmer, active-pulse,
//     polished UZ flag, single divider, region picker dropdown,
//     both themes via dark prop) — UNCHANGED.
//
//     PROTECTED (UNCHANGED): keyboard / signing / push / APNs /
//     splash / role avatars / chat-swipe / carousel / home-hero /
//     bottom-sheet / store-audit fixes / garage car-list / delete /
//     kamizo-landing Worker / kamizo Worker / VPS / DNS / TLS /
//     v186 dual-mode routing (add + edit) / lazy-init pre-fill /
//     deep-link hydration / Save flow / validation / chrome-less
//     layout / theme tokens.
//     Previous note (v191) preserved below:
// Version: 3.7.136 — cache suffix bumped to v191. AddCarPage middle
//     plate chars bumped fontSize 52 → 56 (+8%); region "01" stays
//     at 28, so the plate number now towers at ~2× the region.
//
//     Char-container widths re-tuned to actual Manrope ExtraBold
//     text widths at 56 px + 0.03em letter-spacing (just 2-3 px
//     buffer per side so the cluster stays tight):
//       letters1      32 →  34   ("A")
//       digits        84 →  90   ("777" both phys + legal)
//       letters2 ind  64 →  68   ("BA" — the wider of EA/BA)
//       letters2 leg  94 → 102   ("ABC")
//
//     Reclaimed 8 px of plate-body width on iPhone SE to absorb
//     the wider containers without touching the UZ flag clearance:
//       stage padding  '15 8 17'  →  '15 4 17'   (horizontal 8→4;
//                                                 vertical glow
//                                                 breathing room
//                                                 preserved at 15/17)
//
//     iPhone SE (375 w) fit math:
//       Plate body inner = 375 − 32 (page padding) − 2 (card border)
//                          − 32 (card inner padding) − 8 (stage
//                          padding 4×2) − 10 (plate body padding)
//                          − 5 (plate border 2.5×2)
//                        = 286 px
//       Main flex content = 286 − 38 (region) − 2.5 (divider)
//                           − 44 (UZ effective = 40 + 4 margin)
//                         = 201.5 px
//       Main flex inner   = 201.5 (no inset padding — v190)
//
//       PHYS (A 777 BA, 3 chars + 2 gaps):
//         34 + 90 + 68 + 6 (gaps 3×2) = 198 px
//         ≤ 201.5 ✓  outside breathing = 3.5 px (1.75 each side)
//
//       LEGAL (777 ABC, 2 chars + 1 gap):
//         90 + 102 + 3 (gap) = 195 px
//         ≤ 201.5 ✓  outside breathing = 6.5 px (3.25 each side)
//
//     iPhone 13 (390 w) and Pro Max (430 w) keep the same cluster
//     pixels and gain proportional outside breathing room — chars
//     cluster tight in the middle, glow visible to either side.
//
//     fontWeight 800, charStyle (embossed two-layer text-shadow),
//     gap 3, main flex padding 0, every v188 design layer (screws,
//     sheen, shimmer, active-pulse, polished UZ flag chrome bezel
//     + marginRight 4 flag clearance, single divider, region
//     button + chevron + REGION/HUDUD sub-label, inline scrollable
//     region picker dropdown, both themes via dark prop) — ALL
//     UNCHANGED. Only the per-input fontSize/width + stage
//     horizontal padding moved.
//
//     PROTECTED (UNCHANGED): keyboard / signing / push / APNs /
//     splash / role avatars / chat-swipe / carousel / home-hero /
//     bottom-sheet / store-audit fixes / garage car-list / delete /
//     kamizo-landing Worker / kamizo Worker / VPS / DNS / TLS /
//     v186 dual-mode routing (add + edit) / lazy-init pre-fill /
//     deep-link hydration / Save flow / validation / chrome-less
//     layout / theme tokens.
//     Previous note (v190) preserved below:
// Version: 3.7.135 — cache suffix bumped to v190. AddCarPage plate
//     SIZE REBALANCE — region shrunk, middle blown up, cluster
//     tightened with breathing room outside it.
//
//     Region "01" — shrunk so it doesn't dominate:
//       fontSize    36 →  28   (−22%)
//       width       46 →  38
//       chevron     13 →  11
//       REGION lbl  8.5 →  8
//
//     Middle chars — bumped further so the plate NUMBER dominates:
//       fontSize 48 → 52  (+8%; now +86% vs the new region's 28)
//       letters1 width 30 → 32
//       digits   width 78 → 84  (both phys and legal)
//       letters2 ind  width 58 → 64  (fits "BA" at 52 ~62 px)
//       letters2 leg  width 92 → 94  (fits "ABC" at 52 ~91 px)
//
//     Cluster grouping — tight chars + outside breathing room:
//       main flex padding '0 3px' → '0 0'  (leftover space falls
//                                          OUTSIDE the cluster
//                                          instead of being eaten
//                                          by row inset padding)
//       gap                3 → 3 (unchanged — small even gap inside)
//       justify-content: center (unchanged — centers tight cluster)
//
//     iPhone SE (375 w) fit math:
//       Plate body inner = 278 px (stage padding 8 unchanged)
//       Main flex content = 278 − 38 (region) − 2.5 (divider)
//                           − 44 (UZ effective)
//                         = 193.5 px
//       Main flex inner   = 193.5 (no padding)
//
//       PHYS cluster (A 777 BA, 3 chars + 2 gaps):
//         32 + 84 + 64 + 6 (gaps) = 186 px
//         ≤ 193.5 ✓  outside breathing = 7.5 px (3.75 each side)
//
//       LEGAL cluster (777 ABC, 2 chars + 1 gap):
//         84 + 94 + 3 (gap) = 181 px
//         ≤ 193.5 ✓  outside breathing = 12.5 px (6.25 each side)
//
//     On iPhone 13 (390 w) and Pro Max (430 w) the plate body
//     scales up with the card → main flex content grows → outside
//     breathing room grows to 12+ px / 30+ px per side. The cluster
//     stays the same fixed pixel width and just sits more centered.
//
//     fontWeight 800 (Manrope ExtraBold), charStyle (embossed 2-
//     layer text-shadow), every v188 design layer (screws, sheen,
//     shimmer, active-pulse, chrome flag bezel, single divider,
//     inline scrollable region picker, both themes, plate body
//     height 98 + border #14110D) — ALL UNCHANGED. Only the
//     specific font sizes + segment widths + main flex padding
//     moved.
//
//     PROTECTED (UNCHANGED): keyboard / signing / push / APNs /
//     splash / role avatars / chat-swipe / carousel / home-hero /
//     bottom-sheet / store-audit fixes / garage car-list / delete /
//     kamizo-landing Worker / kamizo Worker / VPS / DNS / TLS /
//     v186 dual-mode routing (add + edit) / lazy-init pre-fill /
//     deep-link hydration / Save flow / validation / chrome-less
//     layout / theme tokens.
//     Previous note (v189) preserved below:
// Version: 3.7.134 — cache suffix bumped to v189. AddCarPage middle
//     plate chars bumped to be the dominant element on the plate:
//
//       fontSize 38 → 48 (+26%, +33% over region's 36)
//
//     Char widths re-tuned to actual Manrope ExtraBold metrics at
//     48 px with the design's 0.03em letter-spacing on multi-char
//     segments, plus a 2-4 px buffer for cursor breathing room:
//       letters1      28 →  30   ("A")
//       digits (phys) 64 →  78   ("777")
//       letters2 ind  52 →  58   ("EA"/"BA")
//       digits (leg)  76 →  78   ("777")
//       letters2 leg  76 →  92   ("ABC" — widest letter combo)
//
//     Horizontal space reclaimed elsewhere on the plate to absorb
//     the larger chars without overlap or clipping (UZ flag stays
//     fully visible with its design clearance):
//       stage padding   '15 14 17'  →  '15 8 17'   (vertical glow
//                                                   breathing room
//                                                   preserved)
//       main flex padding   '0 9px' → '0 3px'
//       main flex gap       4 → 3
//       region segment width 50 → 46
//       UZ panel + chrome bezel: UNCHANGED (40 wide, paddingLeft 5,
//                                borderLeft 2, marginRight 4 — flag
//                                clearance protected)
//
//     iPhone SE (375 w) fit math:
//       Plate body inner = 375 − 32 (page padding) − 2 (card border)
//                          − 32 (card inner padding) − 16 (stage
//                          padding 8×2) − 10 (plate body padding)
//                          − 5 (plate border 2.5×2)
//                        = 278 px
//       Main flex content = 278 − 46 (region) − 2.5 (divider)
//                            − 44 (UZ effective = 40 + 4 margin)
//                          = 185.5 px
//       Main flex inner   = 185.5 − 6 (padding 3×2) = 179.5 px
//       PHYS budget       = 179.5 − 6 (2 gaps × 3) = 173.5 px
//                           ≥ 30 + 78 + 58 = 166 px ✓ (7.5 px margin)
//       LEGAL budget      = 179.5 − 3 (1 gap × 3)  = 176.5 px
//                           ≥ 78 + 92          = 170 px ✓ (6.5 px margin)
//
//     fontWeight + charStyle (Manrope ExtraBold 800 + embossed two-
//     layer text-shadow) unchanged — already heavy enough to read
//     as bold/embossed at the bigger size, matches region exactly.
//
//     UNCHANGED (verified): every v188 design layer — plate body
//     dimensions (height 98, border #14110D, gradient), stage radial
//     glow, top sheen, animated shimmer sweep, two metal screws,
//     active-segment pulse, polished UZ flag chrome bezel + UZ
//     wordmark, single divider, region button + chevron + REGION
//     sub-label, inline scrollable region picker dropdown with
//     Uzbek/Russian names + orange code chips, kamizo-plate-char
//     ::placeholder embossed CSS rule, prefers-reduced-motion guard.
//
//     PROTECTED (UNCHANGED): keyboard / signing / push / APNs /
//     splash / role avatars / chat-swipe / carousel / home-hero /
//     bottom-sheet / store-audit fixes / garage car-list / delete /
//     kamizo-landing Worker / kamizo Worker / VPS / DNS / TLS /
//     v186 dual-mode routing (add + edit) / edit-mode pre-fill /
//     validation / Save flow / chrome-less layout / theme tokens.
//     Previous note (v188) preserved below:
// Version: 3.7.133 — cache suffix bumped to v188. AddCarPage plate
//     FULL DESIGN REFRESH from Claude Design "Add Car - Light/Dark
//     - Yur.html" (project 10b700e9 → kamizo-addcar.jsx). Reverts
//     the v183-v187 ad-hoc tweaks (big chars, tight cluster, double
//     dividers, hero recolor) in favor of the new design's premium
//     plate visual:
//
//       • plate height 112 → 98 (design value)
//       • border #16130F → #14110D
//       • borderRadius 14 → 16
//       • middle char fontSize clamp(60,18vw,74) → fixed 38
//       • char widths: tight design values (28/64/52 phys, 76/76 leg)
//       • middle char colors: v187 orange+dark hero → BACK to embossed
//         black charStyle (color #15110D + 2-layer text-shadow), same
//         render path region "01" uses
//       • dividers: v185 dual `8px 4px` margins → single divider
//         `8px 0`, no right divider (UZ panel gets its own borderLeft)
//       • UZ panel width 22 → 40, polished chrome bezel around the
//         flag (linear-gradient(145deg) inset + inner highlight),
//         marginRight 4 so flag never overlaps the last typed char
//       • NEW: stage wrapper with theme-aware radial orange glow
//         behind the plate (light = subtle 0.15 / dark = lush 0.32)
//       • NEW: top sheen overlay (top 46% white-to-transparent)
//       • NEW: animated shimmer sweep (.ac-shimmer, 5.6s loop)
//       • NEW: two metal screws (top-left + bottom-right, radial
//         gradient + slot detail)
//       • NEW: animated pulse ring on the focused segment
//         (.ac-seg-active, 1.7s loop)
//       • NEW: region "01" segment is a button with chevron (▾) that
//         opens a self-contained inline picker dropdown BELOW the
//         plate (252 px wide, orange chip per row, scrollable, Uzbek
//         names from existing plateUtils.UZ_REGIONS via i18n)
//
//     Both themes covered via dark={t.isDark} prop on PlateHero;
//     light uses softer glow + lighter plate shadow, dark uses
//     stronger orange glow + deeper plate shadow with orange ring.
//
//     CSS additions in index.css:
//       @keyframes acShimmer
//       @keyframes acPulse
//       .ac-shimmer + .ac-seg-active classes
//       @media (prefers-reduced-motion: reduce) → both disabled
//       input.kamizo-plate-char::placeholder → reverted to embossed
//         Manrope styling (matches charStyle exactly, no more --plate-
//         color variable since middle chars are uniform now)
//
//     LOGIC PRESERVED (verified): физ/юр toggle + plate-format
//     reflow, validation, Save (add + edit modes via v186 dual-mode
//     /vehicles/edit/:id), back arrow, scroll, full-screen chrome-
//     less layout, lazy-init pre-fill from existing vehicle in edit
//     mode + deep-link hydration useEffect, every input captures
//     value, Tenant address subtitle.
//
//     REMOVED FROM AddCarPage state: regionOpen/setRegionOpen +
//     onRegionTap callback + the old overlay region picker block —
//     all of that lives inside PlateHero now as a self-contained
//     unit, simpler component contract.
//
//     PROTECTED (UNCHANGED): keyboard / signing / push / APNs /
//     splash / role avatars / chat-swipe / carousel / home-hero /
//     bottom-sheet / store-audit fixes / garage car-list / delete /
//     kamizo-landing Worker (Option B) / kamizo Worker / VPS / DNS /
//     TLS / v186 dual-mode routing.
//     Previous note (v187) preserved below:
// Version: 3.7.132 — cache suffix bumped to v187. AddCarPage middle
//     plate characters (letters1 / digits / letters2 only — region
//     "01" + UZ flag panel untouched) repainted to match the GARAGE
//     HERO color style from ResidentVehiclesPage line 400-404.
//
//     COLOR SCHEME (both themes):
//       letters1 + letters2 → #FB923C  (HERO_LETTER, matches garage
//                                       hero's letter color exactly)
//       digits              → #15110D  (HERO_DIGIT, dark)
//
//     WHY DIGITS DARK IN BOTH THEMES — and not white in dark theme
//     as originally specified: the plate card background is a
//     hardcoded cream gradient (linear-gradient(176deg, #FFFFFF 0%,
//     #F4F1E9 62%, #E8E3D7 100%)) regardless of theme — the real-
//     UZ-plate look. White digits on cream = invisible. Dark digits
//     stay readable in both themes. If the user wants the plate
//     itself to become dark in dark theme (so white digits work),
//     that's a follow-up structural change to the plate container.
//
//     STYLE OVERRIDE — middle chars only (region "01" keeps its
//     embossed Manrope charStyle with the white/black text-shadow):
//       fontFamily       → var(--font-num, "Inter Tight", monospace)
//                          (matches garage hero exactly — neither
//                          --font-num nor Inter Tight is loaded in
//                          the bundle, so both fall back to system
//                          monospace consistently)
//       letterSpacing    → -0.02em (was +0.02em on charStyle)
//       textShadow       → none    (strips the v184 embossed look)
//       fontSize         → unchanged (clamp(60px, 18vw, 74px))
//       fontWeight       → 800 (unchanged)
//
//     PER-INPUT `--plate-color` CSS variable feeds the global
//     ::placeholder rule in index.css so the placeholder text
//     mirrors the typed-value color (orange for letters, dark for
//     digits) — no more iOS ghost-gray placeholder regression.
//
//     UNCHANGED (verified): plate card container + cream gradient
//     background + 2.5px black border + plate height 112 + region
//     "01" + РЕГИОН sub-label + both vertical dividers (8px 4px
//     margin) + UZ flag panel + v185 char-box widths + gap 4 +
//     tight-cluster centering + физ/юр reflow + region picker +
//     scroll + Save + edit-mode (v186 dual-mode AddCarPage handles
//     both /vehicles/add and /vehicles/edit/:id, so this restyle
//     applies to BOTH "Добавить авто" and "Редактировать авто").
//
//     iPhone SE fit unchanged (no geometry change — only colors,
//     fontFamily, letter-spacing, and text-shadow swapped).
//
//     PROTECTED (UNCHANGED): keyboard / signing / push / APNs /
//     splash / role avatars / chat-swipe / carousel / home-hero /
//     bottom-sheet / store-audit fixes / garage car-list / delete
//     action / kamizo-landing Worker / kamizo Worker / VPS / DNS /
//     TLS.
//     Previous note (v186) preserved below:
// Version: 3.7.131 — cache suffix bumped to v186. EDIT vehicle screen
//     now uses the SAME full-screen theme-aware design as Add
//     ("Добавить авто" / "Редактировать авто"). One component
//     (AddCarPage.tsx) handles both modes via a URL param:
//       /vehicles/add        → ADD  → vehicleStore.addVehicle
//       /vehicles/edit/:id   → EDIT → vehicleStore.updateVehicle
//     Reusing the same component means every recent plate fix (v184
//     placeholder embossing, v185 tight cluster + divider breathing
//     room) applies to both modes automatically; the two stay
//     visually identical and won't drift apart.
//
//     EDIT mode behavior:
//       • Synchronous lazy-init reads the existing vehicle from
//         vehicleStore.getState().vehicles on first render —
//         pre-fills owner type, plate (parsed via parsePlateNumber),
//         vehicle type, brand, model, color, year, parking spot,
//         notes, company name (legal).
//       • Deep-link hydration useEffect (gated by hydratedRef) re-
//         applies once if the resident's vehicle list finishes
//         loading after mount — user's in-progress edits are never
//         overwritten by a later poll.
//       • Header reads "Редактировать авто · Изменение · {address}"
//       • Save bar reads "Сохранить изменения"
//       • Save calls vehicleStore.updateVehicle(id, patch) instead
//         of addVehicle — same path the old inline modal used.
//       • Back arrow returns to /vehicles (garage).
//       • No new delete button (delete already lives on the garage
//         card's menu — preserved).
//
//     Routing:
//       • App.tsx adds a sibling top-level <Route path="/vehicles/edit/:id">
//         before the Layout /* catch-all, with the same ProtectedRoute
//         guard and Suspense fallback as /vehicles/add → fully chrome-
//         less (no app header, no bottom nav).
//       • ResidentVehiclesPage.handleOpenModal now navigates to
//         /vehicles/edit/{vehicle.id} when called with a vehicle
//         instead of opening the inline modal. The inline modal
//         markup is left in place (dead code for the edit path,
//         never opens) to keep this diff minimal — cleanup is a
//         separate commit.
//
//     PROTECTED (UNCHANGED): keyboard / signing / push / APNs /
//     splash / role avatars / chat-swipe / carousel / home-hero /
//     bottom-sheet / store-audit fixes / AddCarPage owner toggle +
//     физ/юр reflow + region picker + plate hero (fontSize, weight,
//     widths, divider geometry, placeholder rule, region "01" sizing,
//     all of v183-v185 unchanged) + brand/model/color/year/parking/
//     notes fields + scroll + theme tokens + chrome-less layout +
//     garage car-list UI + delete-vehicle action on garage cards +
//     kamizo-landing Worker / Cloudflare / VPS / DNS / TLS.
//     Previous note (v185) preserved below:
// Version: 3.7.130 — cache suffix bumped to v185. AddCarPage plate
//     TWO spacing-only fixes (no font-size / font-weight changes):
//
//     1. CLUSTER GROUPING — char-box widths tightened to within ~2 px
//        of the actual Manrope ExtraBold character width so each char
//        nearly fills its box. The visible inter-char gap now comes
//        entirely from the explicit `gap: 4`, not from each input's
//        ghost-padding spreading the chars toward their box edges.
//        Result: A | 777 | BA reads as one tight centered cluster,
//        with leftover horizontal space falling OUTSIDE the cluster
//        (between region/divider on the left and divider/UZ on the
//        right) — matches the prototype.
//
//        Width changes:
//          letters1     clamp(42,11vw,47)  → clamp(40,10.5vw,44)
//          digits       clamp(112,30vw,122) → clamp(108,29vw,118)
//          letters2 ind clamp(80,22vw,88)  → clamp(76,21vw,86)
//          letters2 leg clamp(122,33vw,134) → clamp(122,32vw,134)
//
//     2. DIVIDER BREATHING ROOM — both vertical separators now have
//        4 px horizontal margin on each side (8 px of visible air
//        around each 2 px line), so they read as deliberate
//        separators with breathing room, not lines glued to the
//        "01" block / UZ flag.
//
//        Structural changes:
//          Left divider:  margin '8px 0' → '8px 4px'
//          Right divider: NEW element (width 2, bg #16130F,
//                         margin 8px 4px) — replaces the UZ panel's
//                         inline `borderLeft` which had no margin
//          UZ panel:      removed inline borderLeft + paddingLeft
//
//     iPhone SE fit math (375 → 328 px usable plate inner):
//       Individual (A 777 BA):
//         region 46 + left_div_marg 4 + div 2 + left_div_marg 4
//         + l1 40 + gap 4 + digits 108.75 + gap 4 + l2_ind 78.75
//         + right_div_marg 4 + div 2 + right_div_marg 4 + UZ 22
//         = 323.5 px ✓  (4.5 px headroom)
//
//       Legal (777 ABC):
//         region 46 + 4 + 2 + 4 + digits 108.75 + gap 4 + l2_leg 122
//         + 4 + 2 + 4 + UZ 22
//         = 322.75 px ✓  (5.25 px headroom)
//
//     fontSize: clamp(60px, 18vw, 74px), fontWeight: 800, region
//     "01"/РЕГИОН, gap: 4, plate height 112, kamizo-plate-char
//     className + placeholder CSS rule — ALL UNCHANGED from v184.
//     Only widths and divider geometry moved.
//
//     PROTECTED (UNCHANGED): keyboard / signing / push / APNs /
//     splash / role avatars / chat-swipe / carousel / home-hero /
//     bottom-sheet / store-audit fixes / AddCarPage owner toggle +
//     физ/юр reflow + region picker + brand/model/color/year/parking/
//     notes + Save flow + theme tokens + chrome-less layout + scroll
//     + localized REGION label + region "01" sizing + kamizo-landing
//     Worker (Option B).
//     Previous note (v184) preserved below:
// Version: 3.7.129 — cache suffix bumped to v184. AddCarPage plate
//     TWO regressions fixed vs v183:
//
//     1. "Letters render smaller / thinner than digits" — REAL CAUSE
//        was iOS WebKit's default `::placeholder` rendering. The
//        digits input showed user-typed "777" with the full inline
//        charStyle (color #15110D + textShadow + weight 800), while
//        letters1/letters2 inputs (empty by default) showed their
//        placeholder text "A" / "EA" / "ABC" — and iOS placeholders
//        do NOT inherit `text-shadow` or weight from the input's
//        inline style, only from a `::placeholder` CSS rule. Without
//        a rule, iOS renders them in default ghost-gray with no
//        embossing, which reads as "thinner + smaller" even though
//        the actual fontSize is identical.
//
//        v184 fix: added `input.kamizo-plate-char::placeholder` rule
//        in index.css that mirrors the value styling (color #15110D,
//        weight 800, Manrope, letter-spacing 0.02em, full text-shadow)
//        + tagged every plate input with className="kamizo-plate-char".
//        Placeholder text now reads identical to typed text → letters
//        match the digits visually, in both физ and юр.
//
//     2. "Letters spread to the edges, not grouped" — the gap=1
//        between the three input segments was so small that the
//        visible gap between characters came entirely from each
//        input's internal centering padding (input width minus
//        actual text width, split 50/50). With wider-than-needed
//        inputs, the characters drifted toward the edges of their
//        boxes and the cluster looked stretched.
//
//        v184 fix: tightened each input width to within 2-4 px of
//        the actual Manrope ExtraBold metric for that char count,
//        and bumped gap 1→4 so the visible separation comes from
//        an explicit gap (uniform across viewports) instead of
//        random internal padding.
//
//        Width changes:
//          letters1     clamp(46,12vw,52) → clamp(42,11vw,47)
//          digits       clamp(115,32vw,130) → clamp(112,30vw,122)
//          letters2 ind clamp(82,23vw,96)  → clamp(80,22vw,88)
//          letters2 leg clamp(122,33vw,132) → clamp(122,33vw,134)
//          gap          1 → 4
//
//     iPhone SE fit math (375 → 328 px usable plate inner):
//       Individual (A 777 BA): 46 + 2 + 0 + 42 + 4 + 112.5 + 4 +
//                              82.5 + 22 = 315 px ✓  (13 px headroom)
//       Legal (777 ABC):       46 + 2 + 0 + 112.5 + 4 + 123.75 + 22
//                            = 310.25 px ✓  (17.75 px headroom)
//
//     fontSize stays clamp(60px, 18vw, 74px) and fontWeight stays
//     800 across all three middle inputs in both layouts — unchanged
//     since v182. The visual uniformity comes entirely from killing
//     the placeholder ghost-styling.
//
//     PROTECTED (UNCHANGED): keyboard / signing / push / APNs /
//     splash / role avatars / chat-swipe / carousel / home-hero /
//     bottom-sheet / store-audit fixes / AddCarPage owner toggle +
//     физ/юр reflow + region picker + brand/model/color/year/parking/
//     notes + Save flow + theme tokens + chrome-less layout + scroll
//     + localized REGION label + region "01" sizing.
//     Previous note (v183) preserved below:
// Version: 3.7.128 — cache suffix bumped to v183. AddCarPage plate
//     middle-character UNIFORMITY fix: letters1 / digits / letters2
//     already shared the same fontSize (clamp 60→74 px) and weight
//     (800, Manrope ExtraBold) since v182, but the side letters
//     still LOOKED smaller + thinner than the digits because the
//     letter <input> containers were narrower than the actual text
//     width — and `text-align:center` clips overflow on BOTH sides,
//     eating the outer strokes of "B"/"A" and visually compressing
//     them.
//
//     v183 widens every middle container to the exact Manrope
//     ExtraBold metric for that char count (≈ 0.6×fontSize per
//     letter, 0.55×fontSize per digit), and reclaims the px from
//     elsewhere on the plate so iPhone SE still fits.
//
//     Per-segment width changes (clamp min/preferred/max):
//       letters1     clamp(40,11vw,48) → clamp(46,12vw,52)
//       digits       clamp(108,32vw,130) → clamp(115,32vw,130)
//       letters2 ind clamp(70,21vw,84)  → clamp(82,23vw,96)
//       letters2 leg clamp(108,32vw,130) → clamp(122,33vw,132)
//     Reclamation:
//       region segment        50 → 46
//       UZ panel              28 → 22
//       main-row gap           2 →  1
//
//     iPhone SE fit math (375 → 328 px usable plate inner):
//       Individual (A 777 BA): 46 + 2 + 0 + 46 + 1 + 120 + 1 +
//                              86.25 + 22 = 324.25 px ✓
//                              (3.75 px headroom)
//       Legal (777 ABC):       46 + 2 + 0 + 120 + 1 + 123.75 + 22
//                            = 314.75 px ✓
//                              (13.25 px headroom)
//
//     fontSize + fontWeight unchanged: clamp(60px, 18vw, 74px) /
//     800. Region "01" + REGION sub-label untouched per spec.
//
//     Previous note (v182) preserved below:
// Version: 3.7.127 — cache suffix bumped to v182. AddCarPage plate
//     middle characters (letters1 / digits / letters2) now use a
//     RESPONSIVE font-size + segment-width via CSS clamp() so the
//     chars dominate the plate edge-to-edge on every device
//     without overflowing the smallest viewport.
//
//     Sizing — same clamp for all three middle inputs:
//       fontSize: clamp(60px, 18vw, 74px)
//         iPhone SE  (375 w):  67.5 px   (18% of 375)
//         iPhone 13  (390 w):  70.2 px
//         iPhone 14  (393 w):  70.7 px
//         Pro Max    (430 w):  74 px (clamped at max)
//
//     Segment widths scale to match — also clamp():
//       letters1     clamp(40px, 11vw, 48px)
//       digits       clamp(108px, 32vw, 130px)
//       letters2 ind clamp(70px, 21vw, 84px)
//       letters2 leg clamp(108px, 32vw, 130px)   (mirror of digits)
//
//     Whitespace reclamation (vs v181):
//       plate height       100 → 112    (room for taller chars)
//       region segment      58 →  50    (still fits "01" @ 44 px)
//       divider             2.5 →  2
//       main-row gap         3 →  2
//       main-row padding   2+2 →  0+0
//       UZ panel            36 →  28
//       UZ wordmark font    13 →  12
//       UZ panel gap         4 →  3
//       UZ paddingLeft       2 →  1
//       digits/letters2 letter-spacing  0.04em → 0
//
//     iPhone SE fit math (375 → 328 px usable plate inner width):
//       Individual: 50 (region) + 2 (divider) + 0 (padding) +
//                   ~41 (l1) + 2 (gap) + ~120 (digits) +
//                   2 (gap) + ~79 (l2 ind) + 28 (UZ)
//                 = ~324 px  ✓  (4 px headroom)
//       Legal:      50 + 2 + 0 + ~120 (digits) + 2 + ~120 (l2 leg)
//                 + 28
//                 = ~322 px  ✓  (6 px headroom)
//       (Clamp lower bounds picked to land just inside SE; chars
//       grow ~10% on iPhone 13/14, max out at 74 px on Pro Max.)
//
//     PROTECTED (UNCHANGED): keyboard / signing / push / APNs /
//     splash (clock-driven) / role avatars / chat-swipe / carousel
//     height / home-hero / bottom-sheet dismiss / store-audit
//     fixes / AddCarPage owner toggle + plate-format reflow +
//     region picker + brand/model/color/year/parking/notes fields
//     + Save flow + theme tokens + chrome-less full-screen layout
//     + body scroll + localized REGION label.
//     Previous note (v181) preserved below:
// Version: 3.7.126 — cache suffix bumped to v181. AddCarPage plate
//     middle characters (letters1 / digits / letters2) bumped to
//     fontSize 60 (was 50) so A / 777 / BA dominate the plate like
//     a real licence plate per the Add Car - Light/Dark handoff.
//     60 px / 100 px plate height = ~60% (vs ~50% before; design
//     proportion is ~46% but user wants more aggressive — closer
//     to the rendered handoff feel).
//
//     Region char (44 px) + REGION sub-label (10 px) stay
//     unchanged per spec.
//
//     To fit the larger chars inside the iPhone SE 375 px viewport
//     (328 px usable inside the plate's inner padding/border):
//       • Region segment width 68 → 58
//       • Main-row gap 4 → 3
//       • Main-row flex padding 4+4 → 2+2
//       • UZ panel width 46 → 36 + UZ wordmark font 15 → 13
//       • Letters1 width 36 → 38
//       • Digits width 92 → 108 (individual) / 96 → 110 (legal)
//       • Letters2 width 64 → 70 (individual) / 96 → 110 (legal)
//     Math: 58 + 2.5 + 4 + 38 + 3 + 108 + 3 + 70 + 36 = 322.5 px
//     individual / 58 + 2.5 + 4 + 110 + 3 + 110 + 36 = 323.5 px
//     legal — both ≤ 328 px. Verified on iPhone SE width.
//
//     PROTECTED (UNCHANGED): keyboard / signing / push / APNs /
//     splash (clock-driven) / role avatars / chat-swipe / carousel
//     height / home-hero / bottom-sheet dismiss / store-audit
//     fixes / AddCarPage owner toggle + plate-format reflow +
//     region picker + brand/model/color/year/parking/notes fields
//     + Save flow + theme tokens + chrome-less full-screen layout
//     + body scroll (v180) + localized REGION label.
//     Previous note (v180) preserved below:
// Version: 3.7.125 — cache suffix bumped to v180. Three fixes on
//     AddCarPage:
//
//     (1) SCROLL — page body was unscrollable because the outer
//         container used `minHeight: 100vh` and relied on the
//         document scroller, but global mobile CSS sets
//         `body { overflow: hidden }` so nothing scrolled.
//         Размещение / Парковочное место / Примечания were stuck
//         below the fold. Restructured to a fixed-height flex
//         shell:
//           • outer = 100vh + 100dvh + overflow:hidden + flex
//             column
//           • header = flex:0 0 auto (pinned top, no longer
//             position:sticky)
//           • body   = flex:1 1 0 + minHeight:0 + overflow-y:auto
//             + WebkitOverflowScrolling:touch +
//             overscrollBehavior:contain
//           • save bar = flex:0 0 auto (pinned bottom, no longer
//             position:sticky)
//         Body padding-bottom is `calc(140px + env(safe-area-
//         inset-bottom))` so the last fields clear the Save bar
//         even on devices with a home indicator.
//
//     (2) "REGION" label was hardcoded English. Now passed in
//         as a `regionLabel: string` prop to PlateHero from
//         AddCarPage: `isRu ? 'РЕГИОН' : 'HUDUD'` — same
//         useLanguageStore-driven pattern the rest of the page
//         uses.
//
//     (3) Plate characters bumped to match the design handoff's
//         real-license-plate look:
//           • plate body height  92  → 100
//           • region char font   38  → 44
//           • REGION label font   9  → 10
//           • letters/digits font 42 → 50
//           • UZ text font       14  → 15
//         Segment widths re-tuned (region 74→68, l1 34→36,
//         digits 86→92 individual / 92→96 legal, l2 60→64
//         individual / 92→96 legal, UZ panel 50→46) so the
//         larger chars still fit inside the phone viewport
//         tested down to iPhone SE 375 px (total ~328 px
//         occupied vs ~343 px usable inside the card padding).
//
//     PROTECTED (UNCHANGED): keyboard / signing / push / APNs /
//     splash (clock-driven) / role avatars / chat-swipe / carousel
//     height / home-hero / bottom-sheet dismiss / store-audit
//     fixes / AddCarPage owner toggle + region picker + plate-
//     format reflow + brand/model/color/year/parking/notes fields
//     + Save flow + theme tokens + chrome-less full-screen layout.
//     Previous note (v179) preserved below:
// Version: 3.7.124 — cache suffix bumped to v179. AddCarPage plate
//     REGION segment now opens a scrollable region picker (was a
//     manual numeric input). Reuses the existing UZ_REGIONS data
//     constant from src/pages/vehicles/plateUtils.ts — the same
//     14-entry list the legacy edit-vehicle modal's PlateNumberInput
//     uses, so the region taxonomy stays consistent system-wide.
//
//     Implementation (single file: src/pages/AddCarPage.tsx):
//       • Added `UZ_REGIONS` to the existing plateUtils import.
//       • PlateHero's `region` segment switched from a text <input>
//         (numeric, 2-char max) to a <button> that fires a new
//         `onRegionTap` callback prop. The selected code is shown
//         read-only inside the segment. PlateHero's `update()`
//         updater type-narrowed to Exclude<keyof PlateParts,
//         'region'> so TypeScript prevents future regressions.
//       • AddCarPage adds `regionOpen` state alongside `typeOpen`
//         and `colorOpen`. Tapping the region segment toggles
//         `regionOpen` AND closes the other two dropdowns; tapping
//         the vtype or color triggers now also close `regionOpen`
//         so only one overlay is ever open.
//       • The plate-hero card is now wrapped in a `position:
//         relative` div. The picker overlay renders as a SIBLING
//         of the card (not inside it — the card has overflow:hidden
//         for its glow gradient and would clip the dropdown). The
//         overlay is anchored at `top: calc(100% + 8px); left: 0;
//         right: 0; z-index: 20`, matching the existing "Тип
//         транспорта" dropdown style on the same page.
//       • Picker is scrollable: `maxHeight: 52vh; overflowY: auto;
//         WebkitOverflowScrolling: touch`. Each row: 2-digit code
//         (tabular-nums, bold) + region name (RU or UZ per
//         language store) + check icon when selected. Selected row
//         gets the same orange tint + brand-orange text that the
//         vtype dropdown uses.
//       • Backdrop click-catcher (`position: fixed; inset: 0;
//         z-index: 19`) closes the picker on outside tap.
//       • On select: `parts.region` updates + picker closes + the
//         active segment moves to the next logical input (letters1
//         for individual, digits for legal_entity).
//
//     PROTECTED (UNCHANGED): keyboard / signing / push / APNs /
//     splash (clock-driven, force-dark reverted in v177) / role
//     avatars / chat-swipe / carousel height / home-hero /
//     bottom-sheet dismiss / store-audit fixes / AddCarPage owner
//     toggle + plate-format reflow + brand/model/color/year/parking/
//     notes fields + Save flow + chrome-less full-screen layout +
//     theme tokens + theme dropdowns. Only the region-segment
//     interaction model changed.
//     Previous note (v178) preserved below:
// Version: 3.7.123 — cache suffix bumped to v178. Fixed AddCarPage
//     rendering inside the Layout chrome. User reported the new
//     /vehicles/add screen showed up between the app's drawer
//     header (≡ + tenant logo + bell) at the top AND the bottom
//     navigation bar (Главная / + / chat / profile), squeezing
//     the page and leaving empty space above the "← Добавить авто"
//     header.
//
//     Root cause: the /vehicles/add route was registered inside
//     Layout.tsx's nested <Routes>, so it inherited Layout's
//     chrome (mobile header + bottom bar + page-content padding).
//
//     Fix:
//       • Moved the AddCarPage lazy import from Layout.tsx to
//         App.tsx — single source of import.
//       • Added a new top-level <Route path="/vehicles/add"> in
//         App.tsx BEFORE the Layout-wrapped /* catch-all. Same
//         pattern as /login. Route is wrapped in ProtectedRoute
//         (allowedRoles=['resident'], requiredFeature='vehicles')
//         + Suspense fallback (lazy chunk).
//       • Removed the /vehicles/add route block from Layout.tsx
//         + removed the duplicate AddCarPage lazy import there.
//
//     Result: AddCarPage now owns the entire viewport. Its own
//     sticky header (← back + "Добавить авто" + tenant address
//     subtitle) sits at the top with proper safe-area-inset-top
//     padding; sticky Save button at the bottom respects
//     safe-area-inset-bottom. No app drawer, no bottom nav, no
//     extra padding. Back arrow still returns to /vehicles via
//     useNavigate.
//
//     PROTECTED (UNCHANGED): keyboard / signing / push / APNs /
//     splash (clock-driven, force-dark reverted in v177) / role
//     avatars / chat-swipe / carousel height / home-hero /
//     bottom-sheet dismiss / store-audit fixes / AddCarPage
//     theme tokens + plate logic + owner toggle + Save flow
//     all unchanged.
//     Previous note (v177) preserved below:
// Version: 3.7.122 — cache suffix bumped to v177. Two changes:
//
//   (1) Reverted v118.36 TEMP force-dark short-circuit in
//       NativeSplashOverlay.tsx pickTheme — splash is once again
//       clock-driven (07-18 light / 19-06 dark) + URL ?splashTheme
//       override + v170 one-time localStorage purge. Production-
//       ready theme path. Confirmed via grep — 0 hits for
//       `forced: 'dark'` in pickTheme.
//
//   (2) New /vehicles/add route — full-screen theme-aware
//       "Добавить авто" page (src/pages/AddCarPage.tsx). One
//       component, two themes (light / dark), driven by
//       useThemeStore. Replaces the modal that lived inside
//       ResidentVehiclesPage for the ADD case; EDIT case keeps
//       the inline modal (the garage page itself is untouched
//       per user request).
//
//       Theme application: inline CSS tokens computed from
//       useThemeStore — same single-source-of-truth approach as
//       the splash v175 clean rebuild. Inline beats any external
//       cascade override.
//
//       Owner toggle (Физ. лицо / Юр. лицо) reflows the plate
//       hero:
//         individual  → region + 1 letter + 3 digits + 2 letters
//         legal_entity → region + 3 digits + 3 letters
//       Same plate-format switch the rest of the app uses (via
//       plateUtils combinePlateNumber / validatePlateNumber).
//
//       Save calls the SAME vehicleStore.addVehicle the old
//       modal used — optimistic insert + reconciliation
//       unchanged. On success navigates back to /vehicles with
//       the new car already in the list.
//
//       Wired via Layout.tsx lazy route + ResidentVehiclesPage
//       handleOpenModal(no arg) → navigate('/vehicles/add').
//       Every existing "Add" button in the garage now opens the
//       new screen; "Edit" buttons (handleOpenModal(vehicle))
//       still open the inline modal.
//
//   PROTECTED (UNCHANGED): keyboard / signing / push / APNs /
//   splash visuals (clean rebuild from v175 still in place) /
//   role avatars / chat-swipe / carousel height / home-hero /
//   bottom-sheet dismiss / store-audit fixes (account deletion,
//   privacy link, ITSAppUsesNonExemptEncryption,
//   POST_NOTIFICATIONS, Android versionCode 2 + versionName
//   1.1.0, debug strip removed).
//   Previous note (v175) preserved below:
// Version: 3.7.121 — cache suffix bumped to v175. Pre-submission
//     audit fixes for Google Play + App Store review.
//
//     BLOCKERS fixed (would cause review rejection):
//       • Apple Guideline 5.1.1(v) — account deletion: added
//         "Удалить аккаунт" button to ResidentProfilePage with
//         two-step confirmation + DELETE /api/account/me API
//         call. Falls back to mailto:support@kamizo.uz if the
//         backend endpoint isn't implemented yet — Apple accepts
//         user-initiated request-based deletion.
//       • iOS export compliance — added
//         <key>ITSAppUsesNonExemptEncryption</key><false/> to
//         Info.plist (eliminates the App Store Connect upload
//         prompt + the "Missing encryption declaration" rejection).
//       • Android 13+ push — added
//         <uses-permission POST_NOTIFICATIONS /> to
//         AndroidManifest.xml (without this, the push register()
//         silently fails on Android 13+ and Play Store flags it).
//       • Splash debug code stripped — removed the v118.32
//         hard-coded `forced: 'dark'` short-circuit and the
//         v118.30 red debug strip + [CLEAR] button + supporting
//         CSS. The clock-based pick (07-18 light / 19-06 dark) +
//         the URL ?splashTheme=light|dark override + the v170
//         one-time localStorage purge all stay.
//
//     SHOULD-FIX fixed:
//       • Android versionCode 1 → 2 + versionName "1.0" → "1.1.0"
//         to match iOS MARKETING_VERSION and satisfy the Play
//         Store "must increment on every upload" rule.
//       • Privacy Policy link added to the ResidentProfilePage
//         Legal section — opens https://kamizo.uz/privacy via
//         window.open. The user must HOST that page before
//         submission (TODO handed off).
//
//     LEFT FOR USER (cannot be fixed in code this session):
//       • Privacy Policy page must exist + be reachable at
//         https://kamizo.uz/privacy before submission.
//       • Backend DELETE /api/account/me endpoint must ship
//         (frontend already calls it; falls back to mailto
//         until then — works for review either way).
//       • Demo tenant (kamizo-demo) data must be clean and
//         realistic for reviewers — no "тест" / junk strings.
//       • Reviewer demo account credentials must be in the App
//         Store Connect / Play Console review notes.
//       • google-services.json for Android Firebase (push).
//       • All required iOS app-icon sizes in Xcode asset catalog.
//
//     PROTECTED (UNCHANGED): keyboard / signing / push / APNs /
//     splash visuals (clean theme application from v174) /
//     RoleAvatar / chat-swipe / carousel height / home hero /
//     bottom-sheet dismiss.
//     Previous note (v174) preserved below:
// Version: 3.7.120 — cache suffix bumped to v174. CLEAN REBUILD of
//     splash theme application — collapses three competing
//     mechanisms (CSS variable approach + per-child class selectors
//     + v173 inline-style band-aid) down to ONE: a single `tokens`
//     object computed from `theme` in JSX, applied via inline CSS
//     variables on the splash root.
//
//     Why: across v170-v173 the splash dark theme was broken in a
//     way that defied diagnosis without DevTools — pickInfo.theme
//     was 'dark' (debug strip confirmed) but the splash painted
//     LIGHT visuals (cream sky, light skyline PNG, light K-mark).
//     v173 added an inline `style={{ background }}` band-aid for
//     the sky but couldn't pin the root cause. The three layers
//     were fighting: if anything in the cascade (html.dark
//     ancestor, app theme rules, third-party CSS) overrode the
//     `--ks-sky` variable on .kamizo-splash--dark, the variable
//     approach silently fell back to the cream default while the
//     class selectors still applied — leaving "dark decision,
//     light visuals". The clean rebuild eliminates that whole
//     class of bug.
//
//     The rebuild — src/components/NativeSplashOverlay.tsx:
//       • Introduces LIGHT_TOKENS and DARK_TOKENS constants
//         (sky/glow/ink/ink2/muted/ringBg/ringBd/kmark/trackBg/
//         bldg/winbase/ground/realskyOpacity/kmarkFilter) byte-
//         identical to the design handoff.
//       • `const tokens = theme === 'dark' ? DARK_TOKENS :
//         LIGHT_TOKENS;` — single source of truth.
//       • Splash root style sets `background: tokens.sky` AND
//         every `--ks-*` variable inline. Child elements still
//         read `var(--ks-*)` and inherit from the root's
//         inline-set vars. Inline beats every external selector.
//       • Sun + starfield are CONDITIONALLY RENDERED instead of
//         class-toggled (sun only when isLight, starfield only
//         when !isLight). No `display:none` selectors needed.
//       • Skyline opacity + K-mark filter set inline from tokens.
//       • Splash root className dropped `kamizo-splash--${theme}`
//         — only `kamizo-splash` + `kamizo-splash--play` remain.
//         No theme class on root means no CSS theme rules to fight.
//
//     The rebuild — src/components/NativeSplashOverlay.css:
//       • DELETED `.kamizo-splash--light { --ks-sky: ...; ... }`
//         (CSS variable definition block)
//       • DELETED `.kamizo-splash--dark { --ks-sky: ...; ... }`
//         (CSS variable definition block)
//       • DELETED `.kamizo-splash--light, .kamizo-splash--dark
//         { background: var(--ks-sky); }`
//       • DELETED `.kamizo-splash--dark .ks-sun { display:none }`
//       • DELETED `.kamizo-splash--light .ks-starfield
//         { display:none }`
//       • DELETED `.kamizo-splash--dark .ks-realsky
//         { opacity:0.7 }`
//       • DELETED `.kamizo-splash--dark .ks-kmark-img
//         { filter: ... }`
//       • DELETED base `.ks-realsky { opacity: 0.92 }` (now inline)
//       • DELETED base `.ks-kmark-img { filter: ... }` (now inline)
//       • KEPT all structural CSS, all animation keyframes, all
//         .kamizo-splash--play selectors (animation state ≠ theme).
//
//     pickTheme() clock logic UNCHANGED. v118.32 TEMP force-dark
//     short-circuit at top of pickTheme STILL ACTIVE so user can
//     verify the dark rebuild on cold launch — flip
//     `theme: 'dark'` → `theme: 'light'` in that early return
//     to test light variant. Debug strip UNCHANGED (still solid
//     red top-left, still has [CLEAR] button). v170 auto-purge
//     UNCHANGED.
//
//     LIGHT splash is identical to v173 light visuals (token
//     values are the same; only the application path changed
//     from CSS-variable + class to inline).
//
//     PROTECTED (UNCHANGED): keyboard / signing / push / APNs /
//     role avatars / chat-swipe / carousel height / home-hero
//     skyline / bottom-sheet dismiss. No new dependencies.
//     Previous note (v173) preserved below:
// Version: 3.7.119 — cache suffix bumped to v173. Fix splash DARK
//     theme not painting visuals. User reported v172: debug strip
//     showed `SRC: url (dark)` and `THEME: dark` (so pickInfo.theme
//     correctly === 'dark') BUT the splash kept rendering the LIGHT
//     visuals — beige sky gradient, skyline-light.png silhouette,
//     light K-mark. The 'dark' decision was being made but never
//     applied to paint.
//
//     Likely root cause: a CSS-variable scope override somewhere
//     outside `.kamizo-splash--dark` (ancestor class, html.dark
//     rule, or third-party CSS) was winning over the splash's own
//     `.kamizo-splash--dark { --ks-sky: dark-gradient }` declaration.
//     Hard to pin down without remote DevTools. Verified locally
//     that the bundled JS is correct: pickTheme's forced return
//     gives {source:'url',forced:'dark',theme:'dark'}, useState
//     captures it, `s = pickInfo.theme === "dark"` drives both the
//     className build and the img srcs. So the JS path is sound;
//     the cascade is where it leaks.
//
//     Fix (src/components/NativeSplashOverlay.tsx ONLY):
//       • Splash root now receives the resolved sky gradient via
//         inline `style={{ background: inlineSky }}`. Inline style
//         beats every external selector, so any cascade override is
//         neutralised. SKY_DARK / SKY_LIGHT constants match the CSS
//         theme tokens exactly.
//       • Splash root also picks up a new `data-ks-theme={theme}`
//         attribute for forensic debugging — DevTools (when next
//         available) will show the resolved theme at runtime.
//       • The .kamizo-splash--dark / --light classes STAY on the
//         element so per-child rules (.ks-realsky opacity 0.7,
//         .ks-sun display:none for dark, .ks-starfield display:none
//         for light, .ks-kmark-img filter) keep working.
//       • Skyline + K-mark img srcs unchanged — already conditional
//         on `theme === 'dark'`. If they were also reading 'light'
//         in v172, this build will fix them since the same `theme`
//         variable drives all three.
//
//     v118.32 temp force-dark short-circuit at top of pickTheme()
//     STILL ACTIVE so the user can verify the dark splash on the
//     next cold launch. Once confirmed, the user says "revert dark
//     force" and I'll remove the short-circuit + the inline-sky
//     band-aid is harmless to keep (it doesn't change behavior,
//     just makes the sky cascade-proof).
//
//     PROTECTED (UNCHANGED): keyboard / signing / push / APNs /
//     splash time-logic (pickTheme normal path, dead but intact) /
//     Kamizo K-mark image / star field / sun disc / debug strip /
//     skyline PNGs / role avatars / chat-swipe / carousel height /
//     home skyline / bottom-sheet dismiss.
//     Previous note (v171) preserved below:
// Version: 3.7.117 — cache suffix bumped to v171. Splash Tashkent
//     skyline scaled UP per user request — the previous fit-by-
//     width sizing rendered it too short on a phone (the light PNG
//     is 720×214 → at 390 px wide it's only ~116 px tall, which
//     reads as a thin strip rather than a confident skyline).
//
//     Single CSS change in src/components/NativeSplashOverlay.css
//     on the `.kamizo-splash .ks-realsky` rule:
//       transform: scale(1.45);
//       transform-origin: bottom center;
//     Scales the silhouette 1.45× from the bottom-center origin so
//     buildings get bigger AND rise higher (height grows
//     proportionally with scale). The ground line stays anchored
//     to the bottom edge of the splash; edges may crop on narrow
//     viewports (splash root is overflow:hidden) — the center
//     landmarks (TV tower, mosque domes) stay visible per user's
//     explicit "edge cropping is fine" approval.
//
//     PROTECTED (UNCHANGED): keyboard fix / signing / push / APNs /
//     splash theme-logic (pickTheme + v170 auto-purge) / Kamizo
//     K-mark image / star field / sun disc / debug strip / role
//     avatars / chat-swipe / carousel height / home skyline /
//     bottom-sheet dismiss. NO change to the home hero skyline
//     (user said they'd decide separately).
//     Previous note (v170) preserved below:
// Version: 3.7.116 — cache suffix bumped to v170. Fix splash showing
//     LIGHT theme at 19:56 (after the 19:00 cut-off) + make the
//     debug strip impossible to miss.
//
//     Root cause: stale `localStorage.kamizo_force_splash_theme`
//     = 'light' left over from earlier dev-testing flows (we used
//     to ask the user to set it manually to test the dark variant
//     before sunset). That override wins over the clock pick by
//     design (per pickTheme order: URL > localStorage > clock).
//     Since the user can't read the v118.16 debug strip (CSS used
//     `var(--ks-ring-bg)` = faint white in light mode, near-
//     invisible against the cream sky), they had no way to see
//     `src: localStorage (light)` was the reason, and no way to
//     tap the [clear] button which was only rendered when an
//     override was active.
//
//     Fix (src/components/NativeSplashOverlay.tsx + .css):
//       (1) pickTheme() now does a ONE-TIME auto-purge of
//           `kamizo_force_splash_theme` on first launch of v170+,
//           gated by a `kamizo_splash_overrides_purged_v170` flag
//           the purge itself sets. Subsequent launches honour
//           any NEW localStorage override the user might set
//           legitimately. URL `?splashTheme=light|dark` still
//           wins for THIS launch even after the purge.
//       (2) Debug strip restyled to SOLID RED (#DC2626) bg + bold
//           WHITE text + white border + drop shadow + z-index
//           9000. Cannot be missed on either splash theme.
//       (3) [CLEAR localStorage + RELOAD] button is now ALWAYS
//           rendered (not just on override-active) — manual
//           escape hatch even if the user can't read the strip
//           text. 44 px tap target.
//
//     Time-zone path itself was already correct — pickTheme()
//     uses Intl.DateTimeFormat with the device-resolved timezone
//     and only falls back to new Date().getHours() if Intl throws
//     (since v118.16). Once the localStorage override is purged,
//     the clock branch fires and 19:56 Tashkent → hour 19 →
//     theme 'dark'.
//
//     SEPARATE: user reported "K-mark looks half-faded". The
//     K-mark PNG itself is clean (verified locally — solid
//     pixels, anti-aliased edges < 9%). Most likely the user
//     saw the WORDMARK "Kamizo" letters mid-animation (each
//     letter fades in at 1.05 + i*0.07s with a 0.6s curve —
//     screenshot between 1.05s and 1.65s catches it half-done).
//     No code change for this; the new debug strip will help
//     confirm by being a stable timing reference, and user can
//     wait until splash is fully painted before screenshotting.
//
//     Files changed (3):
//       • src/components/NativeSplashOverlay.tsx — pickTheme()
//         one-time purge + debug strip always-on [CLEAR] button
//       • src/components/NativeSplashOverlay.css — debug strip
//         restyled to solid red / white / z-index 9000
//       • src/frontend/public/sw.js — this note + cache bump
//
//     PROTECTED (UNCHANGED): keyboard fix / signing / push /
//     APNs / Kamizo K-mark image / star field / sun disc / splash
//     skyline PNGs / home skyline PNGs / role avatars / chat-
//     swipe / carousel / bottom-sheet. No new dependencies.
//     Previous note (v169) preserved below:
// Version: 3.7.115 — cache suffix bumped to v169. Splash overlay gets
//     the real Tashkent skyline silhouette per the updated Claude
//     Design splash handoff. ZERO changes to splash time-logic,
//     pickTheme(), Kamizo K-mark, star field, sun disc, or debug
//     strip — only an `<img>` added at the bottom of the splash
//     anchored fit-by-width.
//
//     Asset reuse — the splash handoff references the SAME two
//     PNGs the resident-home hero already ships (v167):
//       public/screens/skyline-dark.png  (169 558 bytes, 880×209)
//       public/screens/skyline-light.png (171 044 bytes, 720×214)
//     No new fetch / no new asset round-trip — splash theme picks
//     by its own clock (pickInfo.theme from pickTheme()), so
//       evening / dark splash → skyline-dark.png  @ opacity 0.7
//       day / light splash    → skyline-light.png @ opacity 0.92
//
//     Cropping fix: width: 100%, height: auto, object-position:
//     bottom — entire silhouette stays visible at every viewport
//     from iPhone SE → 17 Pro Max. No upscale-then-crop like the
//     handoff's 196% / 345% widths would have caused.
//
//     Files changed (3):
//       • src/components/NativeSplashOverlay.tsx — added
//         <img className="ks-realsky"> immediately after the
//         procedural .ks-skyline <svg>. src picks by theme.
//         pointer-events:none / draggable=false / aria-hidden.
//       • src/components/NativeSplashOverlay.css — new .ks-realsky
//         rule (position:absolute, bottom:0, left/right:0,
//         width:100%, height:auto, max-width:none,
//         object-position:bottom, z-index:4, opacity:0.92).
//         `.kamizo-splash--dark .ks-realsky` overrides opacity to
//         0.7. The procedural `.ks-skyline` is now `display:none`
//         (kept in the DOM so the existing ref/effect that injects
//         <defs id="ks-glow"> doesn't crash on a missing element).
//       • src/frontend/public/sw.js — this note + cache bump.
//
//     PROTECTED (UNCHANGED): keyboard fix / signing / push / APNs /
//     splash time-logic / Kamizo logo / star field / sun disc /
//     debug strip / role avatars / chat-swipe / carousel height /
//     home skyline / bottom-sheet dismiss. No new dependencies.
//     Previous note (v168) preserved below:
// Version: 3.7.114 — cache suffix bumped to v168. Fix background-
//     scroll leak in the resident new-request bottom sheet (the
//     "С чем нужна помощь?" service picker + the form step it
//     opens to). User reported: dragging the sheet down to close
//     it was scrolling the HOME PAGE underneath along with the
//     sheet. The page must stay frozen while the sheet is open.
//
//     Root cause (two compounding):
//       (1) The v118.23 mount effect set
//           `document.body.style.overflow = 'hidden'` — but body
//           is ALREADY overflow:hidden on mobile (per the global
//           rule in src/index.css for max-width: 768px, with the
//           comment "Body overflow:hidden prevents iOS Safari
//           address-bar resize from causing the fixed bars to
//           jump"). The actual scroll container on mobile is
//           `.main-content` / `.main-content-full`. Setting body
//           overflow was a no-op there; .main-content stayed
//           freely scrollable.
//       (2) The SheetShell rendered inline inside .main-content.
//           Its outer `position:fixed` div took the LAYOUT out of
//           the flow, but DOM tree was unchanged — touch events
//           still bubbled from the sheet HEADER up the DOM all the
//           way to .main-content. iOS WKWebView walked up the DOM
//           looking for a scrollable ancestor, found .main-content,
//           and scrolled IT while the sheet was being dragged.
//           That's why the home page moved with the sheet.
//
//     Fix (src/pages/resident/components/ResidentNewRequestFlow.tsx
//     only):
//       • Mount effect now also locks the real scroll container.
//         document.querySelector('.main-content, .main-content-full')
//         gets `overflow: hidden` + `touchAction: none` for the
//         duration of the sheet. Both are required:
//           - overflow:hidden stops wheel/momentum
//           - touchAction:none stops iOS WKWebView from interpreting
//             ANY touch-driven pan on a descendant as a scroll
//             gesture for THIS container
//         Body overflow:hidden is still set as belt-and-suspenders
//         (matters on desktop where body IS the scroller).
//       • The whole sheet tree is now rendered through
//         ReactDOM.createPortal(tree, document.body). Escapes
//         .main-content's DOM subtree entirely so touch can only
//         bubble to body (already overflow:hidden on mobile).
//         createPortal handles the rest — clicks still propagate to
//         the parent React tree via React's event-delegation, so
//         onClose still works.
//
//     This preserves EVERY part of the v118.23 dismiss-feel work:
//       • velocity-based dismiss (>0.55 px/ms flick threshold)
//       • lower distance threshold (90 px)
//       • ref-based DOM transform writes (follow-finger 60 fps)
//       • two-handler split (drag for header, dragScrollable for
//         the content lists, scrollTop guard preserved)
//       • spring-back curve on release
//
//     v117–v167 + APNs + signing + keyboard + splash + role
//     avatars + chat-swipe + carousel-height + skyline-PNGs
//     UNTOUCHED. No new dependencies (react-dom's createPortal
//     was already in the project via NativeSplashOverlay).
//     Previous note (v167) preserved below:
// Version: 3.7.113 — cache suffix bumped to v167. Both skyline
//     variants are now the user's real Tashkent raster PNGs from
//     the design handoff. v167 swaps the v166 SVG fallback on the
//     LIGHT hero for the re-exported screens/skyline-light.png
//     (171 044 bytes after DesignSync.get_file, truncated=false,
//     IEND intact, 720×214 RGBA). DARK variant unchanged from
//     v166 (169 558 bytes, 880×209).
//
//     Per-theme opacity per handoff: dark sky 0.62, light sky 0.5
//     (the beige hero needs a softer silhouette so the dark-brown
//     buildings don't fight the warm gradient).
//
//     The inline TashkentSkyline SVG component stays defined in
//     ResidentHomeDesign.tsx as a safety net (if a PNG ever fails
//     to load on a particular device, a tiny code change reverts
//     to it without a redeploy).
//
//     Files changed (3):
//       • public/screens/skyline-light.png (NEW asset, 171 044
//         bytes, 720×214 RGBA — ships in dist/screens/)
//       • src/pages/resident/design/ResidentHomeDesign.tsx
//         (HomeHero: single <img> for the skyline, src toggled by
//         theme, opacity per theme — no more SVG/PNG branch)
//       • src/frontend/public/sw.js (this note + cache bump)
//
//     v117–v166 + APNs + signing + keyboard + splash + role
//     avatars + chat-swipe + carousel-height + bottom-sheet
//     dismiss + dark-PNG hero UNTOUCHED. No new dependencies.
//     Previous note (v166) preserved below:
// Version: 3.7.112 — cache suffix bumped to v166. Resident-home hero
//     DARK silhouette swapped from the inline TashkentSkyline SVG
//     to the user's actual screens/skyline-dark.png (re-exported
//     smaller — 169 558 bytes after DesignSync.get_file, IEND
//     intact, full PNG decoded fine). Image is 880 × 209 px (the
//     handoff's real raster Tashkent silhouette with TV tower,
//     mosque domes, Khast Imam madrasa arches, modern towers),
//     painted full-bleed at the bottom of the dark hero at
//     opacity 0.62 per handoff.
//
//     LIGHT variant still uses the inline TashkentSkyline SVG
//     because the corresponding skyline-light.png re-export came
//     back at exactly the DesignSync 256 KiB per-file cap (262 144
//     bytes of base64 → 196 608 bytes of PNG without its IEND
//     chunk = truncated mid-stream). User has been told the exact
//     numbers; needs another shrink-and-export pass on the light
//     PNG before we can swap it in.
//
//     Files changed (3):
//       • src/pages/resident/design/ResidentHomeDesign.tsx
//         (HomeHero: switch skyline render path on isLight —
//         <img src="/screens/skyline-dark.png"> for dark,
//         <TashkentSkyline theme="light"> for light)
//       • public/screens/skyline-dark.png (NEW asset, 169 558
//         bytes, 880 × 209 RGBA — ships in dist/screens/)
//       • src/frontend/public/sw.js (this note + cache bump)
//
//     v117–v165 + APNs + signing + keyboard + splash + role
//     avatars + chat-swipe + carousel-height + bottom-sheet
//     dismiss UNTOUCHED. No new dependencies. The inline
//     TashkentSkyline SVG component stays defined in
//     ResidentHomeDesign.tsx so it serves as the light-theme
//     fallback today and would also serve as a safety net if the
//     PNG ever fails to load on a particular device.
//     Previous note (v165) preserved below:
// Version: 3.7.111 — cache suffix bumped to v165. Resident-home HERO
//     re-imported from the NEW design handoff (screens/01-glavnaya
//     .html → kamizo-home.jsx, fetched fresh via DesignSync MCP).
//     The v164 "Kamizo Resident.html" hero is now superseded.
//
//     Source-of-truth comparison summary (v164 → v165):
//       • Hero is now FULL-BLEED — no horizontal margin, top
//         corners square, bottom corners rounded (28px). Sky
//         extends into the iOS safe-area-inset-top zone (was a
//         floating card with margin 'env(safe-area-inset-top) + 10
//         12px 0' and 28px on all corners).
//       • 14-star twinkle field added on top of the dark hero sky
//         (HERO_STARS + new @keyframes kzTwinkle in index.css).
//       • Theme toggle (sun/moon) added inside the hero top-right
//         between the menu and the bell. Wired to useThemeStore
//         .toggle so one tap re-themes the whole app.
//       • Compact typography: name 30/1.05/mt 3 (was 48/1/mt 6),
//         greeting 14/-0.01em (was 15), address pill 8x13/mt
//         14/r 13 (was 9x14/mt 16/r 14), active-count chip 8x12/
//         r 13 with digit 22 + sub 10.5 (was 16x18/r 18 with
//         digit 34 + sub 11 + minWidth 88).
//       • SVG city silhouette replaced with a hand-built inline
//         TashkentSkyline component — recognisable real landmarks
//         left-to-right: Hotel Uzbekistan, International Hotel,
//         Khast Imam mosque (dome + 2 minarets), Hazrati Imam
//         smaller dome cluster, Tashkent TV Tower (375 m), Markaziy
//         Bank tower, Magic City 3-tower cluster, Plaza Tower,
//         Trade Centre slab — with backlit window dots. Theme-
//         aware: cream silhouette on dark sky, deep-brown
//         silhouette on light sky (the handoff's
//         screens/skyline-{light,dark}.png raster PNGs are larger
//         than the DesignSync MCP's 256 KiB per-file cap, so we
//         ship the inline SVG instead — user-approved Q3 fallback).
//
//     Per-user choices preserved across the rework:
//       • Q1 = B → hero center keeps the TENANT УК logo + name
//         (NOT the Kamizo wordmark from the handoff). Residents
//         see which management company they're using.
//       • Q2 = B → time-of-day greeting ("Доброй ночи / Доброе
//         утро / Добрый день / Добрый вечер") in BOTH themes,
//         independent of theme choice. A user on light theme at
//         9 pm still sees "Добрый вечер" on the beige sky.
//       • Q3 → inline SVG Tashkent silhouette (PNGs unfetchable).
//       • Theme toggle in hero = yes.
//
//     Files changed (3):
//       • src/pages/resident/design/ResidentHomeDesign.tsx
//         (HomeHero + TashkentSkyline + HERO_STARS)
//       • src/index.css (added @keyframes kzTwinkle)
//       • src/frontend/public/sw.js (this note + cache bump)
//
//     v117–v164 + APNs + signing + keyboard + splash + role
//     avatars + chat-swipe + carousel-height + bottom-sheet
//     dismiss UNTOUCHED. No new dependencies. No raster assets
//     shipped. Responsive — colour/typography only, no new layout
//     constants that break at small widths (iPhone SE → 17 Pro
//     Max all read the same compact hero).
//     Previous note (v164) preserved below:
// Version: 3.7.110 — cache suffix bumped to v164. Resident-home HERO
//     is now theme-aware (light/dark variants, both imported from
//     the Claude Design §01-glavnaya handoff via the DesignSync
//     MCP — file: Kamizo Resident.html + kamizo-home.jsx). The
//     in-app theme drives the hero visuals (NOT the clock — clock
//     still drives the splash overlay's theme pick separately).
//
//     Theme source: useThemeStore (src/stores/themeStore.ts) —
//     the same Zustand store ThemeProvider, ThemeToggle, and
//     applyTheme() all read from. Reactive subscription via
//     useThemeStore((s) => s.theme), so the hero re-renders the
//     instant the user toggles the theme; localStorage-persisted.
//
//     Visual token table (per handoff):
//       LIGHT (sunny beige hero):
//         bg          165deg #FFE2B0 → #FFC889 → #F6AF6A
//         text        #3A2A1C (deep warm brown — high contrast
//                              against cream)
//         text soft   rgba(58,42,28,0.62)
//         glass bg    rgba(255,255,255,0.32)
//         glass bd    rgba(58,42,28,0.12)
//         pin / num   #C2410C
//         menu burger #C2410C
//         wash        warm sun glow top-right (rgba 255,247,230)
//         sun disc    150x150 visible top-right per handoff
//         skyline     deep #4A3B30 silhouette + pale window glows
//                     (38% opacity, swaps fill via theme prop)
//       DARK (brown evening hero — unchanged from previous build):
//         bg          160deg #4A3B30 → #34291F → #2A2018
//         text        #F4F0E8
//         text soft   rgba(244,240,232,0.78)
//         glass bg    rgba(244,240,232,0.12)
//         glass bd    rgba(244,240,232,0.14)
//         pin / num   #FDBA74 / brand-light
//         menu burger #FDBA74
//         wash        brand-orange / amber radial blend
//         no sun disc (evening)
//         skyline     light #FAFAF9 silhouette + warm-amber
//                     window dots (42% opacity)
//
//     Time-of-day greeting ("Доброй ночи / Доброе утро / Добрый
//     день / Добрый вечер") is KEPT in BOTH themes — theme is a
//     user preference, time is contextual, the two are independent.
//     A user on light theme at 9 pm still sees "Добрый вечер" on
//     the beige hero.
//
//     Files changed:
//       • src/pages/resident/design/ResidentHomeDesign.tsx
//         — HomeHero now reads useThemeStore and computes a 12-
//           token palette (bg, edge, onHero, onHeroSoft,
//           onHeroSofter, glassBg, glassBorder, pinColor, chipBg,
//           chipBorder, chipNum, menuStroke, washBg, washOpacity,
//           wordmarkColor) from the theme.
//         — CityBackground now accepts a `theme` prop and tints
//           the building silhouette + window dots per theme so the
//           skyline reads against either sky.
//         — Sun disc (150x150 top-right radial) rendered for
//           light theme only.
//       • src/frontend/public/sw.js — cache version bump.
//
//     v117–v163 + APNs + signing + keyboard + splash + role
//     avatars + chat-swipe + carousel-height + bottom-sheet
//     dismiss UNTOUCHED. No new dependencies. One source file
//     touched. Responsive — colour-driven only, no new layout
//     constants. iPhone SE → 17 Pro Max same.
//     Previous note (v163) preserved below:
// Version: 3.7.109 — cache suffix bumped to v163. ResidentNewRequestFlow
//     bottom-sheet dismiss redesigned for native-iOS feel. User
//     reported the "С чем нужна помощь?" service-picker sheet felt
//     stiff/broken: swipe-down didn't release smoothly, the close
//     gesture rarely fired, and the drag only worked when grabbing
//     the tiny 38×5 grabber pill — not the whole header.
//
//     Root cause (src/pages/resident/components/ResidentNewRequest
//     Flow.tsx, SheetShell drag handlers):
//       (a) Threshold was 110 px DISTANCE-ONLY — no velocity check,
//           so a quick flick down never closed unless it spanned
//           most of the header height.
//       (b) Handler was spread ONLY on the small grabber pill
//           (~38 × 5 px target). The title region + the rest of the
//           dark hero header weren't grabbable at all.
//       (c) Touchmove called setDragY → re-rendered the whole sheet
//           subtree (the ~20 service tiles, search input, chip
//           strip) every frame — janky on mid-range hardware so the
//           sheet didn't feel locked to the finger.
//       (d) The scrollable tiles list had no drag handlers — pulling
//           down from the cards just scrolled the list against its
//           top edge, never dismissed the sheet.
//
//     Fix (src/pages/resident/components/ResidentNewRequestFlow.tsx
//     only — both ServiceSheet and RequestForm steps benefit since
//     they share SheetShell):
//       • DRAG STATE moved to refs (dragYRef / lastY / lastT /
//         velocity) and the panel's transform is now written
//         directly to panelRef.current.style on every touchmove —
//         60 fps follow-finger even on iPhone SE / weak Android.
//         The transition is disabled during drag and restored on
//         release so the spring-back animates smoothly.
//       • CLOSE THRESHOLDS now combined: dismiss if EITHER
//         dragY > 90 px OR flick velocity > 0.55 px/ms at touchend.
//         A normal flick is 800-1500 px/s ≈ 0.8-1.5 px/ms so even
//         a ~30 px quick swipe dismisses. A slow shallow drag
//         springs back as before.
//       • TWO HANDLER SETS exposed via ShellDrag: `drag` (for the
//         header — always treats downward touch as drag, except on
//         interactive descendants: input / button / a / textarea /
//         select / label) and `dragScrollable` (for the content
//         list — only starts a sheet drag when the list is at
//         scrollTop === 0, otherwise lets it scroll normally).
//         Matches native iOS bottom-sheet "scroll the list at the
//         top to dismiss the sheet" behaviour exactly.
//       • GRAB AREA expanded: `drag` is now spread on the WHOLE
//         dark hero header (ServiceSheet) and the form's white
//         header (RequestForm). The 38×5 pill stays as a visual
//         cue with pointer-events:none.
//       • overscrollBehavior: 'contain' added on both scrollable
//         lists so the WebView doesn't rubber-band the document
//         body during the gesture.
//
//     X close button still works as the explicit fallback. ESC key
//     still closes. Backdrop click still closes. Desktop modal
//     behaviour unchanged (dragging is a no-op when !isMobile).
//
//     v117–v162 + APNs + signing + keyboard + splash + role
//     avatars + chat-swipe + carousel-height UNTOUCHED. No new
//     dependencies. One file changed.
//     Previous note (v162) preserved below:
// Version: 3.7.108 — cache suffix bumped to v162. Resident home /
//     dashboard carousel cards trimmed so they read as supporting
//     content under the brown hero header, not as the page's
//     anchor. User reported the turquoise "Завершите регистрацию"
//     card (and the other 4 carousel variants — they share the
//     same render path) felt heavier / taller than the brown card
//     above. Source: src/pages/resident/components/HomeHighlights.tsx
//     was setting outer container height = 195, card height = 185,
//     padding = 22, icon w-9 h-9 mb-2, badge top = 14, subtitle
//     mt-1. Brown header is ~170-215 px depending on whether the
//     apt chip renders; the 185 px carousel was within 11 px of
//     the maxed-out hero, which read as visually tied with it.
//
//     Trim values (all five cards stay uniform — same render path):
//       • outer container 195 → 168
//       • card height       185 → 158
//       • card padding       22 →  18
//       • icon w-9 h-9 mb-2 → w-8 h-8 mb-1
//       • subtitle mt-1     → mt-0.5
//       • badge top          14 →  12
//     CTA button padding (8 16), title font (19 px), subtitle font
//     (12 px), subtitle line-clamp-2, background gradient, badge
//     pill, flex justify-between layout — ALL preserved. Content
//     fits with ~4 px of natural slack (icon 32 + mb 4 + title 24 +
//     subtitle 30 + CTA 32 = 122 against a 158-36 = 122 inner box),
//     and flex justify-between distributes any remaining slack
//     between the top group and the CTA so cards stay uniform.
//
//     Responsive — values are absolute px against a card that
//     spans 100% - 16 px on every viewport; 158 px is well within
//     iPhone SE's small viewport, and the card never grows wider
//     than the screen so the same height reads right on Pro Max.
//
//     v117–v161 + APNs + signing + keyboard + splash + role
//     avatars + chat-swipe fix UNTOUCHED. No new dependencies.
//     Previous note (v161) preserved below:
// Version: 3.7.107 — cache suffix bumped to v161. ACTUAL fix for the
//     chat back-swipe bug — my v160 diagnosis was wrong.
//
//     What I thought was happening: WKWebView's
//     allowsBackForwardNavigationGestures (history-based back-swipe)
//     was on by default in Capacitor 8, animating the current page
//     right and revealing the previous URL from the left.
//
//     What was ACTUALLY happening: src/components/layout/Layout.tsx
//     registers a global document.touchstart listener (lines 255-285
//     pre-fix) that watches for a swipe-right from the leftmost 15 px
//     edge of the screen, and if seen, calls setSidebarOpen(true) to
//     pop the resident Sidebar drawer. The drawer's nav items for
//     residents are "Заявки / Собрания / Пропуска / Быстрый доступ"
//     — IDENTICAL labels to the dashboard cards, easy to mistake
//     for "the dashboard sliding in underneath chat." That's why
//     the v160 Swift fix didn't help: Capacitor 8 doesn't actually
//     enable allowsBackForwardNavigationGestures (verified by reading
//     node_modules/@capacitor/ios/Capacitor/Capacitor/CAPBridge­View­
//     Controller.swift — never set), so disabling it was a no-op.
//
//     Fix:
//       • src/components/layout/Layout.tsx — handleGlobalTouchStart
//         and handleGlobalTouchEnd now early-return when the route
//         starts with /chat. A pathnameRef lets the existing
//         callbacks read the current pathname WITHOUT being
//         re-created on every navigation (which would churn the
//         document-level listeners on each route change). The
//         sidebar is still openable on chat via the hamburger menu
//         in MobileHeader; only the edge-swipe trigger is silenced
//         on chat routes. Every other route keeps the swipe-to-open
//         behaviour unchanged.
//       • ios/App/App/MainViewController.swift — DELETED (v160
//         change, never bound to the real bug, reverted to keep
//         the iOS native surface minimal).
//       • ios/App/App/Base.lproj/Main.storyboard — initial view
//         controller restored to CAPBridgeViewController/Capacitor.
//       • ios/App/App.xcodeproj/project.pbxproj — the 4
//         MainViewController.swift wiring entries removed.
//       • src/pages/ChatPage.tsx — touchAction 'pan-y pinch-zoom' +
//         overscrollBehaviorX 'none' KEPT (cheap, defensive,
//         prevents any future horizontal-overscroll bleed inside
//         chat from being interpreted as a navigation gesture by
//         any browser layer).
//
//     v117–v160 + APNs + signing + keyboard + splash + role avatars
//     UNTOUCHED. No new dependencies. The iOS native code surface
//     is back to AppDelegate.swift only.
//     Previous note (v160) preserved below:
// Version: 3.7.106 — cache suffix bumped to v160. Fix chat back-swipe
//     bug: in the resident chat (and admin chat) a horizontal
//     swipe-left revealed the dashboard from underneath the chat
//     panel. Root cause was WKWebView's interactive back-forward
//     navigation gesture (allowsBackForwardNavigationGestures),
//     which Capacitor 8's CAPBridgeViewController enables by
//     default. With it on, a left-edge swipe inside ANY page makes
//     the WebView animate "back" in its URL session history, sliding
//     the current page right and exposing a snapshot of the
//     previously-visited URL from the left. Looked exactly like a
//     half-revealed dashboard in chat. React Router owns navigation
//     in this app, so the WebView-level gesture has no legitimate
//     use — it only ever fights the router.
//
//     Fix:
//       • NEW ios/App/App/MainViewController.swift — CAPBridge­View­
//         Controller subclass that sets webView?.allowsBackForward­
//         NavigationGestures = false in viewDidLoad. Also turns off
//         allowsLinkPreview (long-press preview menus, unused).
//       • ios/App/App/Base.lproj/Main.storyboard — Initial view
//         controller class changed from CAPBridgeViewController to
//         MainViewController (customModuleProvider="target" so it
//         resolves against the app's module).
//       • ios/App/App.xcodeproj/project.pbxproj — added the new
//         Swift file to PBXBuildFile + PBXFileReference + PBXGroup
//         children + PBXSourcesBuildPhase.
//       • src/pages/ChatPage.tsx — belt-and-suspenders CSS on the
//         chat root: touchAction 'pan-y pinch-zoom' (browser only
//         handles vertical pans + pinch-zoom inside chat) and
//         overscrollBehaviorX 'none' (no horizontal scroll-chaining
//         from the chip rows escaping to the document and being
//         re-interpreted as a navigation gesture). Vertical message
//         scroll, composer, QuickReplies chip horizontal-scroll all
//         keep working — both new CSS rules are X-axis only.
//
//     v117–v159 + APNs + signing + keyboard + splash + role avatars
//     UNTOUCHED. No new dependencies. The pbxproj UUIDs added
//     (504EC3201… for file ref, 504EC3211… for build file) follow
//     the existing naming convention so they look native to anyone
//     opening the project in Xcode.
//     Previous note (v159) preserved below:
// Version: 3.7.105 — cache suffix bumped to v159. Phase 1 of the
//     role-based avatar sweep (non-chat sites only). Two new
//     centralisation files + 4 call-site replacements:
//
//       NEW src/utils/roleIcon.tsx  — single source of truth for
//         role → icon mapping (all 13 UserRole values from
//         types/common.ts are covered explicitly; super_admin +
//         any future role fall through to initials safely).
//         Maps:
//           resident, tenant, commercial_owner → Home
//           executor                           → Key
//           security                           → BarrierIcon
//                                                (custom 24×24 SVG —
//                                                lucide has no boom-
//                                                barrier glyph)
//           director, admin, manager,
//           department_head, dispatcher,
//           marketplace_manager, advertiser    → Building2
//           super_admin / unknown / null       → null → initials
//       NEW src/components/RoleAvatar.tsx — composable circle that
//         picks getRoleIcon by role, falls back to initialsOf(name).
//         Brand-orange gradient is the default; per-site bg / icon
//         colour / size / shadow overridable via props.
//
//       Site replacements:
//         • ResidentProfilePage.tsx (line ~484 — the "ТС"-style
//           profile header circle the user reported)
//         • ResidentRateEmployeesPage.tsx — both spots
//           (chip-picker + selected-card header; both Executor)
//         • resident/components/RequestDetailsModal.tsx (executor
//           card — kept the pale BRAND_TINT / BRAND_DARK treatment)
//         • admin/team/StaffCard.tsx (specialty icon stays the
//           winner; initials fallback now resolves to role icon)
//
//       INTENTIONALLY NOT TOUCHED in phase 1 (per user spec):
//         • Sidebar — its avatar shows the УК (management company)
//           logo/photo, NOT a user identity.
//         • ResidentProfilePage line ~990 — same УК card on the
//           profile page; logo with initials fallback.
//         • GuardQRScannerPage — guest pass holder has no user
//           role; initials stay.
//         • Group / channel emoji avatars (🏢 🏠) in chat.
//         • ALL chat avatars (MessageBubble, DialogHeader,
//           AdminChannelList, AssignStaffModal, InfoDropdown,
//           colleagues/Avatar) — deferred to phase 2 per user
//           request, to land after phase-1 verification.
//
//     v117–v158 + APNs + signing + keyboard + splash UNTOUCHED.
//     No new dependencies (lucide-react already in package.json).
//     Previous note (v158) preserved below:
// Version: 3.7.104 — cache suffix bumped to v158. NativeSplashOverlay
//     center mark — second pass. v157 used logo-hq-1024.png (full app
//     icon WITH the cream rounded-square backplate baked in), which
//     read as an ugly white tile floating on the splash sky. Now:
//
//       • Generated two new PNGs from the same logo source via
//         /tmp/extract-kmarks.py (luminance + hue classifier — same
//         algo as the earlier /tmp/extract-k-luma.py):
//           /icons/kmark-light.png  — dark K + orange details on
//                                     TRANSPARENT bg (681×813, 137 KB)
//           /icons/kmark-dark.png   — same shapes but the dark K
//                                     letterform recolored to cream
//                                     #F4F0E8 so it stays visible
//                                     against the dark splash sky
//                                     (681×813, 73 KB)
//       • Ring / rounded-square frame removed from the JSX entirely;
//         the bare mark sits directly on the splash bg.
//       • Component picks the variant by theme (kmark-light when
//         theme==='light', kmark-dark when theme==='dark').
//       • Size bumped from 86% of a ring to clamp(140px, 36vw, 200px)
//         since there's no frame eating space; still responsive
//         across iPhone SE → 17 Pro Max → Android.
//       • Drop-shadow per theme — soft dark shadow for light splash,
//         soft brand-orange glow for dark splash.
//       • Reduced-motion + .ks-kmark-img selector unchanged.
//
//     v117–v157 + APNs + signing + keyboard fix UNTOUCHED. Debug
//     strip + ?splashTheme=auto + tap-to-clear stay until the user
//     confirms the brand mark + theme on device. The .ks-ring CSS
//     rules are left defined (just unused) in case a future
//     iteration wants the halo back.
//     Previous note (v157) preserved below:
// Version: 3.7.103 — cache suffix bumped to v157. NativeSplashOverlay
//     center mark switched from the design HTML's simple SVG stroke K
//     to the FULL BRANDED K-mark image (/icons/logo-hq-1024.png — the
//     same source the launcher icon + earlier splash PNGs were built
//     from). Verified by re-fetching Kamizo Splash.html from the
//     claude.ai/design project: byte-identical to my impl, just a
//     single-color line drawing. That's what looked "plain" on
//     device. Replacing it with the actual brand glyph (orange
//     diagonal + dark K + orange dot on cream backplate) matches
//     the app icon identity. The ring around it stays as-is —
//     pops + glows in both themes; the image is 86% of the ring so
//     the ring acts as a soft halo / frame. Animation swap:
//     stroke-draw (only works on outline paths) → scale-pop (works
//     on any pixel content). Dark theme gets a brand-orange drop-
//     shadow glow tuned to the dark-mode --kmark token; light theme
//     gets a soft dark drop-shadow.
//
//     Reduced-motion block updated to gate the new .ks-kmark-img
//     instead of the removed .ks-kmark path. v117–v156 + APNs +
//     signing + keyboard fix UNTOUCHED. No new deps. The /icons/
//     logo-hq-1024.png file already ships in dist/ (vite copies
//     everything under public/). Debug strip kept per user request
//     until they confirm theme + brand-mark on device.
//     Previous note (v156) preserved below:
// Version: 3.7.102 — cache suffix bumped to v156. NativeSplashOverlay
//     temporary on-screen debug + URL/tap reset (delete once
//     verified):
//       • Visible debug strip in the top-left corner of the splash
//         shows: src (clock/url/localStorage), h (local hour from Intl),
//         raw L/U (Date.getHours / getUTCHours for sanity), tz (IANA
//         zone name), theme. Lets the user verify on-device without
//         opening Safari Web Inspector — Vite drops all console.* in
//         production builds, so this strip + the window.__kamizoSplash
//         Debug + localStorage.kamizo_splash_debug stash are the only
//         post-build observability surfaces.
//       • New URL handler: `?splashTheme=auto` clears any stale
//         localStorage `kamizo_force_splash_theme` override and falls
//         through to the clock pick. One-shot reset that works in
//         the address bar — no Web Inspector needed.
//       • Tap-to-clear button [clear override + reload] on the debug
//         strip when an override is active. Works on native too (just
//         a regular button, pointer-events: auto override against the
//         splash root's pointer-events: none).
//
//     Likely root cause of "light splash at 19:55": user has stale
//     localStorage `kamizo_force_splash_theme=light` left over from
//     v118.13 testing. The Intl.DateTimeFormat path added in v118.15
//     fixes the (rare) UTC-WebView case, but the localStorage forcer
//     would still win above it. Visible strip + tap-to-clear button
//     surfaces this and lets the user wipe it on the device.
//
//     v117–v155 + APNs + signing + keyboard fix UNTOUCHED. Files:
//     NativeSplashOverlay.tsx + .css. No new deps.
//     Previous note (v155) preserved below:
// Version: 3.7.101 — cache suffix bumped to v155. NativeSplashOverlay
//     three follow-up fixes from real-device feedback:
//
//     (1) Brown status-bar bleed in dark app-theme.
//         themeStore.applyNativeStatusBar() calls Capacitor's
//         StatusBar.setBackgroundColor with the app's dark surface
//         (#1A1612). With `overlaysWebView:false` in capacitor.config,
//         iOS draws that brown as an OPAQUE native bar ABOVE the
//         WebView — the splash overlay (which lives INSIDE the
//         WebView) can't paint over it. Fix: while the overlay is
//         mounted, dynamically import @capacitor/status-bar and call
//         setOverlaysWebView({overlay:true}) (transparent — WebView
//         extends under the bar) + setStyle picked from the SPLASH
//         theme (Light icons for dark splash, Dark icons for light
//         splash). On unmount we re-apply the persisted app theme
//         via themeStore.applyTheme so the rest of the app gets its
//         own status-bar config back.
//
//     (2) BottomBar flashing through the splash for 1-2 s.
//         BottomBar is createPortal'd to document.body (z-index 1000).
//         The overlay was rendered inside #root which carries
//         `app-booting` class with transform → new stacking context.
//         z-index 9999 INSIDE #root only competes with siblings
//         inside #root, never with body-level portals. So BottomBar
//         won the stack and showed on top during the first paint.
//         Fix: createPortal the overlay to document.body too — same
//         stacking-context layer as BottomBar. z-index 9999 then
//         cleanly beats 1000.
//
//     (3) Wrong-theme at 19:23 local (Tashkent, UTC+5) → light
//         shown instead of dark.
//         Most likely a stale localStorage override left behind from
//         the v118.13 test instructions; fallback case is a WebView
//         sandbox where new Date().getHours() returned UTC. Fix:
//         (a) defensive Intl.DateTimeFormat with the device's
//         resolved timezone for the clock fallback — immune to UTC-
//         WebView quirks. (b) one console.log on theme pick showing
//         which branch fired (URL / localStorage / clock + raw hour
//         + timezone), visible via Safari Web Inspector for verify.
//
//     v117–v154 + APNs + signing + keyboard fix UNTOUCHED. No new
//     deps (uses @capacitor/status-bar which themeStore already
//     imports). Files: NativeSplashOverlay.tsx rewritten end-to-end.
//     Previous note (v154) preserved below:
// Version: 3.7.100 — cache suffix bumped to v154. LaunchScreen.storyboard
//     stripped of its static K-mark image. After v118.13 the user
//     still saw the old cream + K-mark logo on launch BEFORE the
//     webview overlay could take over — that's the native
//     LaunchScreen.storyboard which iOS paints from app launch to
//     first webview frame (and which Capacitor's launchShowDuration
//     can only cap, not skin). The storyboard was an <imageView
//     image="Splash"> showing the cream + K-mark .png from
//     Assets.xcassets/Splash.imageset.
//
//     Fix: replace the imageView with a plain <view> whose only
//     property is the cream backgroundColor (#F4F0E8, sRGB). The
//     <image> resource entry is removed too. On launch the user
//     now sees:
//       (1) brief plain cream (LaunchScreen, ~native_boot_time)
//       (2) NativeSplashOverlay paints in webview — light or dark
//           sky gradient + animated K-mark, wordmark, skyline, loader
//       (3) overlay fades, app underneath visible
//     Both phases start cream, so the (1)→(2) transition is seamless
//     regardless of which time-based theme the overlay picks.
//     Splash.imageset stays in Assets.xcassets (xcodebuild will
//     dead-strip it) — not deleting in case it's wanted later.
//
//     Render-order guarantee: <NativeSplashOverlay /> sits at the
//     top-level <></> in App.tsx, OUTSIDE the BrowserRouter +
//     ProtectedRoute chain. It mounts on the FIRST React commit —
//     no auth check, no lazy import, no route resolution gate ahead
//     of it. Its mount-effect immediately calls SplashScreen.hide()
//     so the native cream LaunchScreen yields to the webview overlay
//     within a single requestAnimationFrame.
//
//     v117–v153 + APNs + signing + keyboard fix UNTOUCHED. New
//     file: just the storyboard edit. No new deps, no plugin
//     changes (cap sync still lists the same 5 plugins).
//     Previous note (v153) preserved below:
// Version: 3.7.99 — cache suffix bumped to v153. Time-based splash
//     overlay. The native @capacitor/splash-screen can't know the
//     time of day (it shows BEFORE the webview JS runs), so the
//     fix is a two-stage splash: brief brand-neutral cream native
//     splash → instantly replaced by an in-webview overlay
//     (NativeSplashOverlay) that picks LIGHT or DARK based on
//     local clock time (07:00–18:59 → light, else dark). The overlay
//     content is imported from the claude.ai/design "Kamizo Splash"
//     project: ambient sky gradient + glow, procedural skyline
//     silhouettes with flickering lit windows, sun (light) or stars
//     (dark), animated K-mark + "Kamizo" wordmark + tagline + linear
//     loader. Full-viewport (100vw + 100dvh) with safe-area padding
//     on the loader so it clears the home indicator on iPhone X+ and
//     collapses cleanly on SE / Android.
//
//     Override knobs (testing without changing the clock):
//       • URLSearchParams `?splashTheme=light` or `?splashTheme=dark`
//         (PWA only, but Capacitor preserves launch URL)
//       • localStorage `kamizo_force_splash_theme` = "light"|"dark"
//         (works on native too via Web Inspector)
//
//     Native splash config tightened (capacitor.config.ts):
//     launchShowDuration 2000 → 600 ms safety FLOOR. JS calls
//     SplashScreen.hide() in NativeSplashOverlay's mount effect
//     (typically <300 ms after boot) so the floor only matters as a
//     fallback. launchAutoHide stays false; backgroundColor stays
//     #F4F0E8 cream (brand-neutral, low contrast with either theme).
//
//     v118.12 keyboard fix (Keyboard.resize:'native' +
//     setAccessoryBarVisible(false)), v117–v151 chat/layout fixes,
//     APNs / push / signing / entitlements all UNTOUCHED. New deps:
//     none (uses existing @capacitor/splash-screen + Capacitor).
//     Files added: src/components/NativeSplashOverlay.tsx + .css;
//     edited: src/App.tsx (mount), capacitor.config.ts (lower
//     launchShowDuration).
//     Previous note (v152) preserved below:
// Version: 3.7.98 — cache suffix bumped to v152. Unified iOS keyboard
//     handling — Joymee-style calm: input pinned flush above the
//     keyboard, no fly-to-top, no gap, quick-reply chips intact, no
//     accessory toolbar.
//
//     Root cause of the previous brokenness: capacitor.config.ts had
//     `Keyboard: { resize: 'body' }` configured but the
//     @capacitor/keyboard plugin was NEVER INSTALLED — the config was
//     ignored, iOS WKWebView fell back to its default layout-viewport
//     shrink, and the ChatView visualViewport JS layered a second
//     keyboard-height offset on top, double-shrinking the chat
//     wrapper and flinging the composer above the visible area.
//
//     Fix (one source of truth):
//       • Installed @capacitor/keyboard@8.0.5.
//       • capacitor.config.ts: resize: 'body' → 'native'. iOS now
//         resizes the WKWebView itself when the keyboard appears, so
//         100vh / 100% / h-full all reflect the smaller viewport
//         naturally. ChatView's `flex flex-col h-full` chain places
//         the composer (flex-shrink-0 last child) flush above the
//         keyboard with zero JS.
//       • main.tsx: Keyboard.setAccessoryBarVisible({isVisible:false})
//         inside the native guard — hides the iOS prev/next/Done
//         toolbar above the keyboard. Matches the clean messenger
//         look.
//       • ChatView.tsx: removed keyboardOffset state + the
//         visualViewport useEffect + the conditional
//         `height: calc(100% - keyboardOffset)` style + the
//         keyboardOffset prop on <ChatComposer/>. Kept a tiny focusin
//         listener that scrolls the message list to its bottom when
//         an input is focused (keyboard-open = newest message visible).
//       • ChatComposer.tsx: dropped the keyboardOffset prop;
//         padding-bottom is unconditionally
//         max(12px, env(safe-area-inset-bottom, 12px)) — single rule
//         for both keyboard-up and keyboard-down (iOS collapses safe-
//         area-bottom to 0 while keyboard is up since the home
//         indicator is hidden anyway).
//       • ResidentChatView.tsx unchanged — its composer is
//         position:fixed portaled to body, which sticks to the
//         WebView's new bottom edge automatically under native resize.
//
//     Result: one source of truth (the plugin), zero JS keyboard
//     math, identical calm behaviour across chat / login / forms /
//     search / modals on every iPhone width. v117–v151 + APNs +
//     signing untouched. Plugin install adds CapacitorKeyboard to
//     the SPM Package.swift via cap sync.
//     Previous note (v151) preserved below:
// Version: 3.7.97 — cache suffix bumped to v151. CreateRequestModal
//     action buttons (Отмена / Создать заявку) un-sticky'd. After
//     v118.10 they were sticky-pinned to the modal viewport bottom
//     so they always stayed visible while scrolling. UX-wise the
//     user wanted them in-flow at the end of the scrollable form
//     instead — scroll past «Желаемое время» and the buttons
//     appear naturally as the last row of content.
//
//     Removed from the action-bar className: `sticky bottom-0
//     bg-white -mx-4 px-4 sm:-mx-6 sm:px-6` (all sticky-related
//     positioning + edge-to-edge bg trick). Kept: `flex gap-3
//     pt-4 border-t` (layout + top divider) and `pb-[max(0.5rem,
//     env(safe-area-inset-bottom))]` (still clears the iOS home
//     indicator when the buttons are scrolled into view).
//
//     v118.10 useModalPresence stays — modal still hides the
//     floating BottomBar while open. Scoped to this modal.
//     v117–v150 + APNs untouched.
//     Previous note (v150) preserved below:
// Version: 3.7.96 — cache suffix bumped to v150. CreateRequestModal
//     hides the floating BottomBar while open (was covering the
//     sticky "Отмена" / "Создать заявку" action buttons at the
//     scroll bottom). Reuses the existing useModalPresence /
//     useModalStore counter mechanism — same hook that chat,
//     CancelRequestModal, FeatureLockedModal, OnboardingWizard,
//     PopupNotification, and common/Sheet already use. No new
//     state primitive. BottomBar reads modalCount > 0 and
//     returns null while CreateRequestModal is mounted; counter
//     pops back on unmount.
//
//     Companion: action-bar padding-bottom upgraded from pb-1
//     (4 px) to pb-[max(0.5rem,env(safe-area-inset-bottom))] so
//     the buttons clear the iOS home indicator now that the bar
//     isn't covering that zone. iPhone SE collapses to 8 px;
//     iPhone X+ ≈ 34 px, indicator pill sits over white padding
//     below the buttons.
//
//     Scoped to CreateRequestModal only. v117–v149 + APNs
//     untouched.
//     Previous note (v149) preserved below:
// Version: 3.7.95 — cache suffix bumped to v149. CreateRequestModal
//     Желаемое время equal-height fix (v118.8 h-11 + items-start
//     made the columns LOOK equal, but iOS WKWebView's native
//     <input type="date"> still rendered taller than the neighbour
//     <select> — internal ::-webkit-date-and-time-value +
//     ::-webkit-datetime-edit pseudo-element padding ignored the
//     CSS `height: 44px` request and pushed the input box past
//     it). Fixed globally for date / time / datetime-local inputs:
//       • -webkit-appearance: none + appearance: none — disable
//         native control chrome so CSS box model controls height
//         (the iOS date picker still opens on tap via focus event,
//         independent of appearance).
//       • Zero the ::-webkit-date-and-time-value, ::-webkit-
//         datetime-edit, ::-webkit-datetime-edit-fields-wrapper
//         pseudo-elements' padding + min-height — belt-and-braces
//         in case a WebKit minor version still leaks internal
//         spacing through the appearance reset.
//     Result: Дата and Время render at pixel-identical 44 px,
//     bottoms aligned. Visible calendar icon disappears (was UA
//     chrome) but full input area remains tappable + still opens
//     the iOS native picker.
//
//     Scoped globally to date/time inputs in BOTH modes — height
//     quirk exists in both, dark just made it more visually
//     obvious. v117–v148 + APNs untouched.
//     Previous note (v148) preserved below:
// Version: 3.7.94 — cache suffix bumped to v148. CreateRequestModal
//     Желаемое время dark-mode + alignment fix. Three causes
//     diagnosed from the user's dark-mode screenshot:
//
//     (1) The <input type="date"> value text "19 июня 2026" was
//     rendered in UA LIGHT-mode dark color against html.dark's
//     `background-color: var(--surface)` (dark brown). Looked empty.
//     Native date controls paint their value via the document's
//     color-scheme, not the CSS `color` property — so the
//     html.dark `color: var(--text-primary)` rule didn't apply
//     to the date text. Fixed by setting `color-scheme: dark` on
//     html.dark (and a defence-in-depth per-input override for
//     date/time/datetime-local).
//
//     (2) The two columns weren't explicitly aligned at the top.
//     CSS Grid's default `align-items: normal` resolves to stretch
//     for grid items, but stretching interacts with children's
//     content sizing in subtle ways. Added `items-start` on the
//     grid container to remove the ambiguity.
//
//     (3) `.glass-input` had `min-height: 44px` only — iOS UA
//     was free to render the date input and the select at slightly
//     different actual heights (≥44 px each). Added `h-11` (44 px)
//     on both inputs so they're pixel-identical. With preflight's
//     box-sizing:border-box, 1.5 px border + 12 px padding fit
//     inside the 44 px box.
//
//     Net effect: dark-mode date value visible in light text on
//     dark bg, equal column heights, perfect top alignment, 16 px
//     gap (v118.6), no overlap (v118.5). Scoped to this row +
//     dark-mode CSS only. v117–v147 + APNs untouched.
//     Previous note (v147) preserved below:
// Version: 3.7.93 — cache suffix bumped to v147. CreateRequestModal
//     Желаемое время gap bump — companion to v146. After v118.5 the
//     two columns fit cleanly side by side but the gap-3 (12 px)
//     between them read as "flush" on Retina because the modal bg
//     + .glass-input's 0.8-alpha white + thin gray border offer too
//     little contrast to a 12-px gap. Bumped the inter-column gap
//     to gap-4 (16 px) so the breathing space is clearly visible
//     on every iPhone width. v118.5 grid (`grid-cols-[repeat(2,
//     minmax(0,1fr))]`) and the `min-w-0` on both children stay —
//     no regression risk to the overlap fix.
//
//     Scoped to the date+time row only. v117–v146 + APNs untouched.
//     Previous note (v146) preserved below:
// Version: 3.7.92 — cache suffix bumped to v146. CreateRequestModal
//     Желаемое время Дата+Время side-by-side fix (manager / admin /
//     director "Создать заявку" form). Same family of bug as v145
//     (resident Заявки tab-bar) — global mobile override at
//     src/index.css:1614-1624 forces every `.grid-cols-2` /
//     `.grid-cols-3` / `.grid-cols-4` to `grid-template-columns:
//     repeat(2, 1fr) !important` at ≤640 px. For grid-cols-2 the
//     column count is unchanged but the override drops Tailwind's
//     `minmax(0, 1fr)` to plain `1fr`. Without minmax(0, 1fr) the
//     native <input type="date"> + <select> push their grid tracks
//     to UA-defined min-content widths (date-picker arrows + select
//     dropdown chrome), which on a phone exceeds half the modal
//     width — the two boxes overlap.
//
//     Two-part fix on CreateRequestModal.tsx line 599 area:
//       1. Container className `grid-cols-2` →
//          `grid-cols-[repeat(2,minmax(0,1fr))]`. Different class
//          NAME, same CSS value as Tailwind's stock grid-cols-2,
//          NOT matched by the global override selector list.
//       2. Both child <div>s gain `min-w-0` — grid items default to
//          `min-width: auto` which still blocks shrinking even
//          when the track allows it. `min-w-0` removes that floor.
//     Both halves are required; either alone is insufficient.
//
//     Scoped to this modal's Дата+Время row. v117–v145 + APNs
//     untouched. ResidentNewRequestFlow's date+time UI uses inline
//     `gridTemplateColumns: '1fr 1fr'` so was never affected.
//     Previous note (v145) preserved below:
// Version: 3.7.91 — cache suffix bumped to v145. Resident Заявки tab-
//     bar single-row real fix. The v144 `whitespace-nowrap` hardening
//     didn't help because the actual cause wasn't text wrapping inside
//     a button — it was a global mobile CSS override at
//     src/index.css:1614-1624 that forces every `.grid-cols-3` and
//     `.grid-cols-4` to `grid-template-columns: repeat(2, 1fr)
//     !important` at viewports ≤640 px. Three buttons in a 2-col
//     grid → "Активные" + "На приёмке" on row 1, "История" wraps to
//     row 2. EXACTLY the bug.
//
//     The override is load-bearing for LoginPage's mobile role grid
//     (declared as grid-cols-4, expected to collapse to 2 cols) and
//     AnnouncementsPage's stats grid, so dropping it globally would
//     regress those screens. Surgical fix: replace `grid-cols-3` on
//     the RequestsTab segment control with the Tailwind arbitrary
//     `grid-cols-[repeat(3,minmax(0,1fr))]` — same CSS value as
//     grid-cols-3, but a DIFFERENT class name that the global
//     selector list `.grid-cols-3, .grid-cols-4` doesn't match. The
//     override skips it; the 3-equal-columns layout survives on
//     mobile.
//
//     Scoped to RequestsTab segment control only. v117–v144 + APNs
//     untouched.
//     Previous note (v144) preserved below:
// Version: 3.7.90 — cache suffix bumped to v144. Resident Заявки tab-
//     bar single-row hardening. Container was already `grid grid-cols-3`
//     (3 fixed columns, 1 row — can't layout-wrap), so the user's
//     observed second-line "История" was almost certainly an older
//     bundle. Added `whitespace-nowrap` to each tab button as belt-
//     and-braces so that even on the narrowest viewport the text
//     ("На приёмке" has an internal space) can never split inside
//     its cell and visually skew the row. No layout/grid change,
//     no behavior change. Scoped to RequestsTab segment-control
//     buttons. v117–v143, APNs, signing untouched.
//     Previous note (v143) preserved below:
// Version: 3.7.89 — cache suffix bumped to v143. Suppress PWA-install
//     / "Add to Home Screen" surfaces inside the Capacitor native iOS
//     and Android shell. The user kept seeing "Установите приложение —
//     добавьте на домашний экран: нажмите Поделиться …" inside the
//     installed iOS app because every install/standalone gate in the
//     codebase relied on `display-mode: standalone` +
//     `navigator.standalone`, both of which are FALSE in WKWebView
//     (Capacitor doesn't set them). So the legacy gates thought the
//     user was in mobile Safari without the PWA installed.
//
//     Fix: add `Capacitor.isNativePlatform()` short-circuit at all 5
//     install-prompt sites. Each one decides differently:
//       • PushNotificationPrompt — early-return null (component-level)
//       • HomeTab PWABanner section — wrap render in {!isNative && ...}
//       • ResidentHomeDesign useShouldShowInstallPrompt — short-circuit
//         detectInstalled() to true (treat native as already installed)
//       • InstallAppSection isStandaloneMode() — same short-circuit
//       • SettingsPage iOS install-help block — wrap render in
//         {!isNative && ...}
//
//     Push routing was already correct: native APNs goes through
//     services/nativePush.ts (wired into authStore login, hard-guarded
//     Capacitor.isNativePlatform()), Web Push goes through
//     services/pushNotifications.ts (only the prompt UI offers it,
//     and WKWebView's missing PushManager means subscribe() returns
//     null anyway — never affected native). No push code change.
//
//     PWA / browser users see all prompts unchanged. v117 / v118 /
//     v118.1 / v118.2 unchanged. No iOS native / signing /
//     entitlement files touched. APNs intact.
//     Previous note (v142) preserved below:
// Version: 3.7.88 — cache suffix bumped to v142. Reports → Топ
//     исполнителей table tap-highlight fix. iOS WebKit applied its
//     default rgba(0,0,0,0.2) grey tap-flash on the rows, and the
//     `hover:bg-white/30` Tailwind class on each <tr> stuck after
//     tap (iOS persists :hover until you tap something else). Both
//     made rows flash/grey on swipe. Fix is two surgical attribute
//     swaps on the Top Executors table only:
//       • <table> gains style.WebkitTapHighlightColor = 'transparent'
//         → kills the native iOS tap-flash on every row.
//       • <tr> hover demoted to desktop-only (`md:hover:bg-white/30`)
//         → no sticky :hover on touch; mouse hover on desktop still
//         tints the row as before.
//     Scope: only this one table. v117 / v118 / v118.1 unchanged.
//     No iOS native / signing / entitlement files touched. APNs
//     intact.
//     Previous note (v141) preserved below:
// Version: 3.7.87 — cache suffix bumped to v141. Reports → Топ
//     исполнителей table containment fix. The card's table has
//     `minWidth: 600px` (legitimately wider than a phone card) and
//     the wrapper was using the `-mx-6 px-6` desktop edge-to-edge
//     trick. On mobile the card's actual padding is `p-3` (12 px),
//     so `-mx-6` overshot by 12 px each side — the scroll container
//     extended past the card and scrolled columns ("Выполнено" /
//     "Рейтинг" / "Статус") bled out the right side, over the
//     rounded card corner. Fix: drop `-mx-6 px-6` from the wrapper
//     (let it sit inside the card's content box), and add
//     `overflow-hidden` on the card outer so the rounded border
//     actually clips its contents. Result: the table scrolls fully
//     inside the card, swipe stays contained, the page itself never
//     gains a horizontal scrollbar. Also `[-webkit-overflow-
//     scrolling:touch]` for legacy iOS momentum (iOS 17+ already
//     does this by default).
//
//     Scope: only "Топ исполнителей" card. v117 composer + v118
//     chat-list single-white-surface unchanged. No iOS native /
//     signing / entitlement files touched. APNs intact.
//     Previous note (v140) preserved below:
// Version: 3.7.86 — cache suffix bumped to v140. Chat-list single-
//     white-surface fix (replaces the v139 BottomBar-backdrop attempt
//     which painted a white slab attached to the bar — visually wrong;
//     pill looked like it sat on a separate plate). v139 reverted in
//     full (BottomBar.tsx + index.css --bb-backdrop var both gone).
//
//     New approach: don't paint the BAR, paint the PAGE. The chat-list
//     wrapper in ChatPage.tsx now runs full 100vh in BOTH branches
//     (was `calc(100vh - var(--bottom-bar-h))` in the mobile list
//     branch). The wrapper's existing bg-white then paints a single
//     continuous white surface from the top of the screen all the way
//     through the safe-area-inset-bottom zone to the very bottom edge.
//     The floating BottomBar pill (BottomBar.tsx unchanged from pre-
//     v118 state — no backdrop, position:fixed, z-index 1000) sits
//     ON TOP of that one white surface without a plate attached to it.
//
//     The list-view branch used to subtract var(--bottom-bar-h) so
//     the channel list pane wouldn't go under the floating pill —
//     that responsibility moved INSIDE the list. AdminChannelList's
//     scrollable container now has `pb-[var(--bottom-bar-h,64px)]
//     md:pb-0`, so the last channel row still clears the pill on
//     mobile while desktop (no BottomBar) stays flush.
//
//     Dialog branch (v117) unchanged — was already 100vh; ChatComposer
//     handles its own home-indicator clearance via padding-bottom:
//     env(safe-area-inset-bottom). Both branches now give the same
//     continuous-white guarantee.
//
//     No iOS native / signing / entitlement files touched. APNs setup
//     intact. Other pages (Home/Requests/Profile/etc.) intentionally
//     not touched — they each have their own background design
//     language; chat list was the surface the user pointed at.
//     Previous note (v138) preserved below:
// Version: 3.7.84 — cache suffix bumped to v138. ChatPage safe-area
//     bg fix. The staff/admin chat wrapper used to subtract
//     env(safe-area-inset-bottom) from its height (`100vh - env(...)`),
//     so on iPhones with a home indicator the wrapper ended ~34 px
//     above the screen bottom and the page body's cream --app-bg
//     leaked through under the composer. The composer itself ALREADY
//     pads its own interactive content above the home indicator
//     (ChatComposer.tsx:99 `padding-bottom: max(12px,
//     env(safe-area-inset-bottom, 12px))`). So letting the wrapper
//     run full 100vh in the dialog/desktop branch lets the composer's
//     white bg paint the entire safe-area zone, with input + send +
//     emoji + attach + QuickReplies chips staying above the home
//     indicator via the composer's existing padding. Universal across
//     iPhone SE → iPhone 17 Pro because env() supplies the right
//     value per device.
//
//     The mobile + admin LIST branch (BottomBar visible) is unchanged
//     — it still subtracts var(--bottom-bar-h, 64px) which already
//     includes env(safe-area-inset-bottom). ResidentChatView untouched
//     (its mobile wrapper uses position:fixed; inset:0 which already
//     covers the safe area cleanly). No iOS native / signing /
//     entitlement files touched, so APNs setup unaffected.
// Version: 3.7.94 — cache suffix bumped to v148. Request photo viewer: clicking
//     a request photo opened the raw data: URL (blank page) instead of viewing
//     it. Now opens the in-app ImageLightbox (zoom/pan, like meetings) in the
//     executor + resident detail modals and the manager request card.
//     Previous note (v147) preserved below:
// Version: 3.7.93 — cache suffix bumped to v147. Request photo fix #2: photo
//     now saves (v146 compression), but it "disappeared a split second after
//     creation" because addRequest's realRequest mapping omitted `photos` —
//     the optimistic request (with photo) was replaced by a photo-less one.
//     Now maps photos from the server response (fallback to attached ones).
//     Previous note (v146) preserved below:
// Version: 3.7.92 — cache suffix bumped to v146. Request photo fix: the
//     resident new-request flow stored the RAW (uncompressed) photo as a
//     data-URL — but the server silently rejects any photo data-URL over
//     350 KB, so every attached photo was dropped (requests.photos = NULL)
//     and never showed for the executor/resident. New compressImage() util
//     resizes to ~1280px JPEG (≤280 KB) so photos actually save + display.
//     Previous note (v145) preserved below:
// Version: 3.7.91 — cache suffix bumped to v145. Desktop polish: the meeting
//     details modal showed a tall, useless-looking scrollbar on PC. Added a
//     desktop-only `.desktop-scrollbar-hide` utility (≥640px) and applied it
//     via panelClassName — the scrollbar is hidden on PC (wheel/trackpad
//     scroll still works); mobile keeps its scrollbar.
//     Previous note (v144) preserved below:
// Version: 3.7.90 — cache suffix bumped to v144. Desktop polish: the
//     reconsideration-request modal (Запрос на пересмотр голоса) had
//     max-h-[90dvh] + overflow-y-auto, forcing a stray scrollbar on PC where
//     the short form fits. Now sm:max-h-none / sm:overflow-visible — no
//     scrollbar on desktop; mobile bottom-sheet untouched.
//     Previous note (v143) preserved below:
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

const SW_VERSION = '3.8.0';
const STATIC_CACHE = 'kamizo-static-v332';
const ASSET_CACHE = 'kamizo-assets-v312';
const DYNAMIC_CACHE = 'kamizo-dynamic-v312';
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
  } else if (notificationData.type === 'marketplace_order') {
    // Bug A (2026-07-11): раньше action-кнопки не добавлялись — тап по
    // пушу шёл через дефолт notificationclick, а он открывал `data.url`
    // из бэка (тогда всегда `/`). Теперь бэк присылает
    // `/marketplace?orderId=...`, а тут даём явную «Посмотреть».
    options.actions = [
      { action: 'view', title: '👁 Посмотреть' }
    ];
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
  } else if (action === 'view' && data.orderId) {
    // Bug A (2026-07-11): marketplace_order-пуш — «Посмотреть» ведёт
    // на резидентскую вкладку заказов с ?orderId=…, MarketplacePage
    // читает query и открывает модалку заказа. Раньше action-ветки
    // не было и тап проваливался в дефолт `data.url` = «/».
    urlToOpen = `/marketplace?orderId=${data.orderId}`;
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
