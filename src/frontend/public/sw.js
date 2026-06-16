// Kamizo PWA Service Worker
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
const STATIC_CACHE = 'kamizo-static-v115';
const ASSET_CACHE = 'kamizo-assets-v115';
const DYNAMIC_CACHE = 'kamizo-dynamic-v115';
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
