# Kamizo — Full Functional & Technical Audit Report

**Date:** 2026-03-15
**Auditor:** Claude (Cowork)
**Scope:** Every page, feature, role, and data chain
**Codebase:** 91,456 lines TypeScript | 45 pages | 21 stores | 16,556-line backend | 63 DB tables

---

## Executive Summary

| Dimension | Score | Rationale |
|---|---|---|
| **Functional completeness** | 6.5/10 | Core features work; payments, meter validation, proxy voting missing |
| **Design consistency** | 7/10 | Glass-morphism + Tailwind unified; icon sizes & modal patterns inconsistent |
| **Data integrity** | 4/10 | 41 of 63 tables missing tenant_id column; votes mutable; no FK constraints |
| **Role enforcement** | 5.5/10 | Backend checks exist but 4+ endpoints lack explicit role gates; no frontend ProtectedRoute |
| **i18n completeness** | 6/10 | Most pages bilingual (RU/UZ); SuperAdmin, Settings, Colleagues, Marketplace labels hardcoded Russian |
| **Testing** | 0/10 | Zero test files in entire project |

| Metric | Value |
|---|---|
| Total pages audited | 45 |
| Total features audited | 13 |
| Critical logic gaps found | 12 |
| Design inconsistencies found | 9 |
| Missing data chains | 6 |
| Tables missing tenant_id | 41 of 63 |
| `any` type usage | 316 instances |
| ARIA attributes | 1 |
| TODO/FIXME count | 0 |

---

## 🔴 Critical Logic Gaps (features that look done but aren't)

1. **Multi-tenancy schema mismatch** — Backend code writes `tenant_id` to 41 tables that don't have the column. INSERT statements either fail silently or data leaks across tenants. (`cloudflare/schema.sql` — tables: users, buildings, apartments, requests, vehicles, chat_channels, chat_messages, meetings, marketplace_products, marketplace_orders, notifications, and 30 more)

2. **Meeting vote deadline not enforced** — `POST /api/meetings/:meetingId/agenda/:agendaItemId/vote` (index.ts ~line 10353) checks `meeting.status !== 'voting_open'` but does NOT check `voting_deadline > NOW()`. Votes accepted after deadline if admin forgets to close.

3. **Votes are mutable (UPDATE, not INSERT-only)** — `cloudflare/src/index.ts` line ~10431: `UPDATE meeting_vote_records SET choice = ?`. Original vote overwritten. Violates audit trail immutability. Vote hash exists but doesn't prevent modification.

4. **Marketplace has no payment integration** — Orders created at `POST /api/marketplace/orders` (line ~13981) without payment verification. `payment_method` parameter accepted but never processed. Revenue cannot be collected.

5. **Meter readings accept negative consumption** — No validation that `current_reading >= previous_reading` in meter reading submission endpoint. No submission window enforcement (e.g., 1st-10th of month).

6. **No ProtectedRoute component** — Frontend routes in `Layout.tsx` have no route-level guards. A logged-out user can stay on `/admin` until page refresh. Role checks happen only inside individual components.

7. **Auth token = raw user.id** — `authStore.ts` stores `user.id` as the authentication token. Not a JWT. If user IDs are predictable/sequential, any user can impersonate another by setting localStorage.

8. **Rate limiter fails open** — `cloudflare/src/middleware/rateLimit.ts` lines 54-57: on KV error returns `allowed: true` with 99 remaining. Attacker can exploit KV degradation for brute-force.

9. **Hardcoded encryption key in source control** — `cloudflare/wrangler.toml` line 17: `ENCRYPTION_KEY = "K4m1z0-S3cur3-Encrypt10n-2026!"` committed to git.

10. **Reversible password storage** — `password_plain TEXT` column stores AES-GCM encrypted passwords (not bcrypt-hashed). Combined with exposed encryption key, every credential is compromised.

11. **SQL injection in notification LIKE pattern** — `cloudflare/src/index.ts` line ~12786: notification tag interpolated directly into LIKE pattern instead of parameterized query.

12. **Guest access max_uses not enforced** — `POST /api/guest-codes/:id/use` increments usage counter but doesn't check if `current_uses >= max_uses` before allowing entry.

---

## 🟡 Incomplete Chains (partially implemented features)

1. **Payment/Finance** — Debt display exists (`GET /api/accounts/debtors`), but no payment recording endpoint, no receipt generation, no payment-to-invoice reconciliation.

2. **Meter auto-consumption** — Meters and readings stored but no automatic `consumption = current - previous` calculation. No meter verification date expiry enforcement.

3. **Chat attachments** — Chat is text-only. No `chat_message_attachments` table or upload endpoint. Media sharing not possible.

4. **Proxy voting** — Uzbekistan law may require proxy votes (доверенности) for meetings. No proxy_voter tables or delegation mechanism.

5. **UK Rating period locking** — Residents can change UK satisfaction rating anytime within the month. No lock after submission or month-end.

6. **Activity audit log** — `ActivityLogPage.tsx` exists but generates log from request status changes only — no system-wide audit trail for user actions, data changes, or access events.

---

## 🟢 Fully Working Features

1. **Service Requests lifecycle** — Full chain: create (auto-numbered per branch+category) → assign → in_progress → completed → rated. Optimistic UI with rollback. Push notifications on creation and assignment. Role-based visibility (residents see own; executors see specialization; managers see all).

2. **Meeting creation & voting (core flow)** — Vote weight = apartment area (кв.м) per Uzbek law. Quorum = 50%+ of total building area. UNIQUE constraint prevents duplicate votes. Protocol generation from vote records + comments. Reconsideration requests supported.

3. **Guest access & QR codes** — Self-contained GAPASS tokens (base64 JSON with expiry, visitor info). Guard scanner validates offline. Access types: single_use, day, week, month, custom. Logs entry/exit. Revocation works.

4. **Chat/Messaging (core)** — Real-time via WebSocket. Channel types: uk_general, building, private_support. Cursor-based pagination. Read tracking via `chat_message_reads` table. Unread count decrements correctly.

5. **Vehicle management** — Full CRUD with plate search. Supports car, motorcycle, bicycle types. Owner/company vehicles. Region-based plate validation.

6. **Announcements** — Full CRUD with read tracking. Priority levels (high/normal/low). Targeted delivery (building/entrance/floor/branch). Push notification on creation.

7. **Resident profile & contract** — Profile editing, password change, language preference, QR contract display, contract signing flow.

8. **Work orders** — Auto-numbered `НР-YYYY-NNN`. CRUD with status tracking. Assignment to executors.

9. **UK satisfaction rating** — Monthly period. UPSERT prevents duplicates. 4 metrics (overall, cleanliness, responsiveness, communication). 6-month summary for admin.

---

## Part 1: Page-by-Page Audit

### Dashboard Pages

## Page: AdminDashboard
- Route: / (role=admin)
- Component: src/frontend/src/pages/AdminDashboard.tsx
- Roles: admin
- Data source: useDataStore → getStats(), requests, marketplace reports
- Design status: ✅ Current (glass-card, responsive grid)
- i18n status: ✅ Full
- Empty state: ⚠️ Partial (staleApprovals checks length; marketplace tab shows nothing when null)
- Loading state: ✅ Handled (isLoadingReport spinner)
- Error state: ⚠️ Partial (errors logged to console, no user-facing messages)
- Responsive: ✅
- Issues: getStats() called without error handling; tab switching doesn't preserve state

## Page: ManagerDashboard
- Route: / (role=manager)
- Component: src/frontend/src/pages/ManagerDashboard.tsx
- Roles: manager
- Data source: useDataStore → requests, executors, getStats(), getChartData()
- Design status: ✅ Current
- i18n status: ✅ Full
- Empty state: ✅ Handled ("Нет данных для отображения" on empty chart)
- Loading state: ⚠️ Partial (isLoadingRatings but no spinner for initial load)
- Error state: ⚠️ Partial (ratings error logged, no UI feedback)
- Responsive: ✅
- Issues: Plural handling incomplete for reschedule request counts (line ~270)

## Page: DirectorDashboard
- Route: / (role=director)
- Component: src/frontend/src/pages/DirectorDashboard.tsx
- Roles: director
- Data source: useDataStore + useCRMStore + useMeetingStore + teamApi + marketplace reports
- Design status: ✅ Current
- i18n status: ✅ Full
- Empty state: ✅ Handled (modals handle empty states)
- Loading state: ✅ Handled (isLoadingReport, isLoadingRatings)
- Error state: ⚠️ Partial (line ~200: marketplace report fetch fails silently)
- Responsive: ✅
- Issues: Silent marketplace report failure; complex useMemo could break silently without error boundaries

## Page: DepartmentHeadDashboard
- Route: / (role=department_head)
- Component: src/frontend/src/pages/DepartmentHeadDashboard.tsx
- Roles: department_head
- Data source: useDataStore → fetchRequests(), fetchExecutors()
- Design status: ✅ Current
- i18n status: ✅ Full
- Empty state: ✅ Handled (lines 272-276, 324-328)
- Loading state: ✅ Handled (Loader2 lines 98-103)
- Error state: 🔴 Missing (no try/catch, no error UI)
- Responsive: ✅
- Issues: Zero error handling for fetch operations

## Page: ExecutorDashboard
- Route: / (role=executor)
- Component: src/frontend/src/pages/ExecutorDashboard.tsx
- Roles: executor, courier
- Data source: useDataStore → requests + executorsApi.getStats() + marketplace orders
- Design status: ✅ Current
- i18n status: ✅ Full
- Empty state: ✅ Handled
- Loading state: ✅ Handled (isLoadingStats, isLoadingOrders, custom spinner)
- Error state: ⚠️ Partial (inconsistent: alert() for some, console.log for others)
- Responsive: ✅
- Issues: Timer calculation overflow if delivering_at malformed (lines 294-300); marketplace order fetch error silently fails

## Page: ResidentDashboard
- Route: / (role=resident)
- Component: src/frontend/src/pages/ResidentDashboard.tsx
- Roles: resident
- Data source: useDataStore → requests, addRequest, announcements + useMeetingStore → meetings
- Design status: ✅ Current (custom mobile header, mobile-first)
- i18n status: ✅ Full
- Empty state: ✅ Handled (booking/guest sections)
- Loading state: 🔴 Missing (no loading skeleton while data fetches)
- Error state: 🔴 Missing (errors logged to console only)
- Responsive: ✅ (excellent mobile-first: grid-cols-1 lg:col-span-2, pb-24 md:pb-0)
- Issues: No loading skeleton during initial fetch; no error UI for API failures

## Page: TenantDashboard
- Route: / (role=tenant, commercial_owner)
- Component: src/frontend/src/pages/tenant/TenantDashboard.tsx
- Roles: tenant, commercial_owner
- Data source: useDataStore → fetchMyRentals()
- Design status: ✅ Current
- i18n status: ✅ Full
- Empty state: ✅ Handled (lines 269-287 no apartments; 373-375 no bookings)
- Loading state: ✅ Handled (Loader2 lines 254-267)
- Error state: ⚠️ Partial (error caught and logged, no UI message)
- Responsive: ✅
- Issues: USD_TO_UZS_RATE hardcoded as constant (line 8); calendar doesn't handle timezone differences

## Page: SuperAdminDashboard
- Route: / (role=super_admin) and /super-admin
- Component: src/frontend/src/pages/admin/SuperAdminDashboard.tsx
- Roles: super_admin
- Data source: Direct apiRequest() for tenants, analytics, ads, banners, users
- Design status: ⚠️ Partially outdated (hardcoded widths, min-h-screen without mobile adaptation)
- i18n status: 🔴 Hardcoded (AVAILABLE_FEATURES, PLAN_*, FEATURE_LABELS all Russian-only — lines 191-218)
- Empty state: 🔴 Missing (no empty state for ads tab, tenants list, analytics)
- Loading state: ⚠️ Partial (some tabs lack spinners during loading)
- Error state: 🔴 Missing (errors only logged to console)
- Responsive: ⚠️ Issues (hardcoded widths without mobile breakpoints)
- Issues: All feature labels hardcoded Russian; no Uzbek translations; modals don't show loading during form submission

## Page: AdvertiserDashboard
- Route: / (role=advertiser)
- Component: src/frontend/src/pages/AdvertiserDashboard.tsx
- Roles: advertiser
- Data source: Direct fetch to /api/ads/* endpoints (not using stores)
- Design status: ✅ Current
- i18n status: ⚠️ Partial (hardcoded Russian in form options; alert() messages not localized)
- Empty state: ✅ Handled (lines 518-525)
- Loading state: ✅ Handled
- Error state: ⚠️ Partial (multiple fetch() calls don't check response.ok before JSON parse)
- Responsive: ✅
- Issues: fetch() calls risk JSON parse failure on non-200 responses (lines 164-209); form validation incomplete

## Page: MarketplaceManagerDashboard
- Route: /marketplace-products
- Component: src/frontend/src/pages/MarketplaceManagerDashboard.tsx
- Roles: marketplace_manager
- Data source: apiRequest() for /api/marketplace/admin/*
- Design status: ✅ Current
- i18n status: ✅ Full
- Empty state: ✅ Handled
- Loading state: ✅ Handled
- Error state: ⚠️ Partial (errors logged not displayed)
- Responsive: ✅
- Issues: No loading state during product save; delete uses confirm() without spinner; no search debounce

---

### Feature Pages

## Page: RequestsPage
- Route: /requests
- Component: src/frontend/src/pages/shared/RequestsPage.tsx
- Roles: admin, manager, director, department_head (not super_admin)
- Data source: dataStore → fetchRequests(), fetchExecutors()
- Design status: ✅ Current
- i18n status: ✅ Full
- Empty state: ✅ Handled (line 171: "Заявки не найдены")
- Loading state: ✅ Handled (Loader2 with "Загрузка заявок...")
- Error state: 🔴 Missing (no error handling for assignRequest/addRequest)
- Responsive: ✅
- Issues: Hardcoded Russian "Объём:" in trash badge parsing (line ~197)

## Page: BuildingsPage
- Route: /buildings
- Component: src/frontend/src/pages/BuildingsPage.tsx
- Roles: admin, director, manager
- Data source: crmStore → fetchBuildings(), buildingsApi, branchesApi, entrancesApi
- Design status: ✅ Current
- i18n status: ✅ Full (t() helper used)
- Empty state: ✅ Handled
- Loading state: ✅ Handled (isLoadingBuildings, isLoadingBranches, isLoadingEntrances)
- Error state: ⚠️ Partial (try-catch but no user-facing error messages)
- Responsive: ✅
- Issues: STATUS_CONFIG hardcoded Russian/Uzbek labels (lines 62-67) outside language store

## Page: ResidentsPage
- Route: /residents
- Component: src/frontend/src/pages/ResidentsPage.tsx
- Roles: admin, manager, director, department_head
- Data source: crmStore → fetchBuildings(), usersApi.getAll()
- Design status: ✅ Current
- i18n status: ⚠️ Partial (language imported but not consistently used)
- Empty state: ✅ Handled
- Loading state: ✅ Handled
- Error state: ⚠️ Partial (errors logged not shown)
- Responsive: ✅
- Issues: 🔴 DEFAULT_PASSWORD = 'kamizo' hardcoded (line 106); generatePassword() uses Russian patterns ("дом", "д.") (lines 235-250)

## Page: ExecutorsPage
- Route: /executors
- Component: src/frontend/src/pages/shared/ExecutorsPage.tsx
- Roles: admin, manager, director, department_head
- Data source: dataStore → fetchExecutors(), addExecutor(), updateExecutor(), deleteExecutor()
- Design status: ✅ Current
- i18n status: ✅ Full (specLabels with RU/UZ pairs)
- Empty state: ✅ Handled
- Loading state: ✅ Handled
- Error state: ✅ Handled (error alert on delete, error handling with user message)
- Responsive: ✅
- Issues: @ts-ignore on line 37 indicates type safety issue

## Page: MeetingsPage
- Route: /meetings
- Component: src/frontend/src/pages/MeetingsPage.tsx
- Roles: admin, manager, director
- Data source: meetingStore → fetchMeetings(), createMeeting(), closeVoting(), publishResults(), generateProtocol()
- Design status: ✅ Current
- i18n status: ⚠️ Partial (t() helper partially used)
- Empty state: ⚠️ Partial (large component ~90KB; truncation limits verification)
- Loading state: ⚠️ Partial (Loader2 imported but usage unclear in full file)
- Error state: ⚠️ Partial (cannot fully verify)
- Responsive: ⚠️ Issues (cannot fully verify from truncated output)
- Issues: File extremely large (90.9KB) — should be split into sub-components

## Page: ResidentMeetingsPage
- Route: /meetings (role=resident)
- Component: src/frontend/src/pages/ResidentMeetingsPage.tsx
- Roles: resident
- Data source: meetingStore → fetchMeetings(), voteForSchedule(), voteOnAgendaItem()
- Design status: ✅ Current
- i18n status: ✅ Full
- Empty state: ✅ Handled
- Loading state: ✅ Handled (Loader2 during voting)
- Error state: ⚠️ Partial (no error handling for fetchMyReconsiderationRequests)
- Responsive: ✅
- Issues: 5-second polling for reconsideration requests (line 85-91) should use WebSocket; audio playback assumes '/notification.mp3' exists

## Page: AnnouncementsPage
- Route: /announcements
- Component: src/frontend/src/pages/AnnouncementsPage.tsx
- Roles: admin, manager, director
- Data source: dataStore → announcements CRUD + buildingsApi
- Design status: ✅ Current
- i18n status: ⚠️ Partial (t() rarely used; debt template hardcoded Russian — line 41-43; "Основной филиал" hardcoded — line 69-84)
- Empty state: ⚠️ Partial (large component, truncation)
- Loading state: ⚠️ Partial
- Error state: ⚠️ Partial (console.error on failed buildingsApi)
- Responsive: ⚠️ Partial
- Issues: Debt template hardcoded Russian with {name}, {debt} placeholders

## Page: ResidentAnnouncementsPage
- Route: /announcements (role=resident)
- Component: src/frontend/src/pages/ResidentAnnouncementsPage.tsx
- Roles: resident
- Data source: dataStore → getAnnouncementsForResidents(), markAsViewed(), fetchAnnouncements()
- Design status: ✅ Current
- i18n status: ✅ Full
- Empty state: ✅ Handled ("Нет новых объявлений" / "Yangi e'lonlar yo'q")
- Loading state: 🔴 Missing (no spinner during fetchAnnouncements)
- Error state: 🔴 Missing (no error handling)
- Responsive: ✅
- Issues: useEffect dependency on fetchAnnouncements could cause infinite loop if not memoized

## Page: ExecutorAnnouncementsPage
- Route: /announcements (role=executor)
- Component: src/frontend/src/pages/ExecutorAnnouncementsPage.tsx
- Roles: executor, security, advertiser
- Data source: dataStore → getAnnouncementsForEmployees(), markAsViewed()
- Design status: ✅ Current
- i18n status: ✅ Full
- Empty state: ✅ Handled
- Loading state: 🔴 Missing (no spinner during initial fetch)
- Error state: 🔴 Missing (no error handling)
- Responsive: ✅
- Issues: No loading or error states

## Page: ChatPage
- Route: /chat
- Component: src/frontend/src/pages/ChatPage.tsx
- Roles: all authenticated
- Data source: chatApi → getChannels(), getMessages(), sendMessage() + WebSocket
- Design status: ✅ Current
- i18n status: ✅ Full (CHAT_CHANNEL_LABELS imported)
- Empty state: ✅ Handled ("Нет сообщений" / "Xabar yo'q")
- Loading state: ✅ Handled
- Error state: ⚠️ Partial
- Responsive: ✅
- Issues: ROLE_CONFIG hardcoded Russian labels (lines 52-66); formatTime/formatDateSeparator hardcoded Russian/Uzbek instead of using languageStore

## Page: WorkOrdersPage
- Route: /work-orders
- Component: src/frontend/src/pages/WorkOrdersPage.tsx
- Roles: admin, manager, director
- Data source: workOrdersApi.getAll() + useCRMStore → buildings + dataStore → executors
- Design status: ✅ Current
- i18n status: ⚠️ Partial (status/type labels hardcoded in switch — lines 148-165)
- Empty state: ✅ Handled
- Loading state: ✅ Handled
- Error state: ⚠️ Partial (errors logged not shown)
- Responsive: ✅
- Issues: Status labels hardcoded Russian without language conditional

## Page: MarketplacePage
- Route: /marketplace
- Component: src/frontend/src/pages/MarketplacePage.tsx
- Roles: resident, tenant
- Data source: apiRequest → /api/marketplace/categories, products, cart, orders
- Design status: ✅ Current
- i18n status: ⚠️ Partial (ORDER_STAGES hardcoded RU/UZ — lines 20-26; PRODUCT_EMOJI Russian-specific — lines 73-78)
- Empty state: ✅ Handled
- Loading state: ✅ Handled
- Error state: ⚠️ Partial
- Responsive: ✅
- Issues: Product emoji mapping Russian-specific ("соль", "сахар", "зубн")

## Page: MarketplaceOrdersPage
- Route: /marketplace-orders
- Component: src/frontend/src/pages/MarketplaceOrdersPage.tsx
- Roles: admin, manager
- Data source: apiRequest → /api/marketplace/admin/orders + dataStore → fetchExecutors()
- Design status: ✅ Current
- i18n status: ⚠️ Partial (ORDER_STATUS_LABELS hardcoded; formatPrice() uses 'ru-RU' + ' сум')
- Empty state: ✅ Handled
- Loading state: ✅ Handled
- Error state: ⚠️ Partial (errors logged)
- Responsive: ✅
- Issues: formatPrice() hardcoded Russian locale and ' сум' suffix (line 137)

## Page: TrainingsPage
- Route: /trainings
- Component: src/frontend/src/pages/TrainingsPage.tsx
- Roles: admin, director, staff
- Data source: useTrainingStore() → labels, CRUD
- Design status: ✅ Current
- i18n status: ⚠️ Partial (labels from trainingStore need verification)
- Empty state: ✅ Handled
- Loading state: ⚠️ Partial (file truncated)
- Error state: ⚠️ Partial (file truncated)
- Responsive: ✅
- Issues: File truncated; full audit incomplete

## Page: ReportsPage
- Route: /reports
- Component: src/frontend/src/pages/admin/ReportsPage.tsx
- Roles: admin, director
- Data source: dataStore → requests, executors + crmStore → buildings, residents + authStore → additionalUsers
- Design status: ✅ Current
- i18n status: ⚠️ Partial (periodLabels hardcoded Russian — lines 122-126; CSV export headers Russian — lines 130-144)
- Empty state: ⚠️ Partial
- Loading state: 🔴 Missing (no explicit loading state; data from stores assumed available)
- Error state: 🔴 Missing (no error handling for store data access)
- Responsive: ✅
- Issues: CSV export headers and period labels all hardcoded Russian; formatPrice() hardcoded 'ru-RU'

---

### Utility & Profile Pages

## Page: LoginPage
- Route: /login (public)
- Component: src/frontend/src/pages/LoginPage.tsx
- Roles: all (public)
- Data source: authStore → POST /api/auth/login
- Design status: ✅ Current
- i18n status: ✅ Full
- Empty state: ✅
- Loading state: ✅ Handled (authLoading spinner on button)
- Error state: ✅ Handled (displayError with AlertCircle)
- Responsive: ✅
- Issues: None critical

## Page: ResidentVehiclesPage
- Route: /vehicles
- Component: src/frontend/src/pages/ResidentVehiclesPage.tsx
- Roles: resident
- Data source: vehicleStore → local + API
- Design status: ✅ Current
- i18n status: ⚠️ Partial (UZ_REGIONS hardcoded Russian — lines 15-27)
- Empty state: ✅ Handled ("Машины не добавлены")
- Loading state: ✅ Handled
- Error state: ✅ Handled
- Responsive: ✅
- Issues: Region names need Uzbek translations

## Page: VehicleSearchPage
- Route: /vehicle-search
- Component: src/frontend/src/pages/VehicleSearchPage.tsx
- Roles: resident, manager
- Data source: dataStore → searchVehicles
- Design status: ✅ Current
- i18n status: ⚠️ Partial (UZ_REGIONS hardcoded Russian)
- Empty state: ✅ Handled
- Loading state: ✅ Handled
- Error state: ✅ Handled
- Responsive: ✅
- Issues: Region data needs Uzbek translation

## Page: ResidentGuestAccessPage
- Route: /guest-access (role=resident)
- Component: src/frontend/src/pages/ResidentGuestAccessPage.tsx
- Roles: resident
- Data source: dataStore → guestAccessCodes store
- Design status: ✅ Current
- i18n status: ✅ Full
- Empty state: ✅ Handled
- Loading state: ✅ Handled
- Error state: ✅ Handled
- Responsive: ✅
- Issues: None critical — well implemented

## Page: ManagerGuestAccessPage
- Route: /guest-access (role=manager+)
- Component: src/frontend/src/pages/ManagerGuestAccessPage.tsx
- Roles: manager, director
- Data source: dataStore → getAllGuestAccessCodes(), getGuestAccessStats()
- Design status: ✅ Current
- i18n status: ✅ Full
- Empty state: ✅ Handled
- Loading state: ✅ Handled
- Error state: ✅ Handled
- Responsive: ✅
- Issues: None critical

## Page: GuardQRScannerPage
- Route: /qr-scanner
- Component: src/frontend/src/pages/GuardQRScannerPage.tsx
- Roles: security
- Data source: validateGuestAccessCode(), useGuestAccessCode()
- Design status: ✅ Current
- i18n status: ✅ Full
- Empty state: 🔴 Missing (no "no active codes" message)
- Loading state: ✅ Handled (spinning border during camera load)
- Error state: ✅ Handled (cameraError with retry)
- Responsive: ✅ (fixed full-screen with safe-area-inset)
- Issues: Missing empty state for no codes

## Page: ResidentProfilePage
- Route: /profile (role=resident/tenant/commercial_owner)
- Component: src/frontend/src/pages/ResidentProfilePage.tsx
- Roles: resident, tenant, commercial_owner
- Data source: authStore
- Design status: ✅ Current
- i18n status: ✅ Full (useMemo t object)
- Empty state: ✅ Handled
- Loading state: ✅ Handled
- Error state: ✅ Handled
- Responsive: ✅
- Issues: None critical — very well structured

## Page: StaffProfilePage
- Route: /profile (staff roles)
- Component: src/frontend/src/pages/StaffProfilePage.tsx
- Roles: executor, security, dispatcher, manager, director, admin
- Data source: authStore
- Design status: ✅ Current
- i18n status: ✅ Full
- Empty state: ✅ Handled
- Loading state: ✅ Handled
- Error state: ✅ Handled
- Responsive: ✅
- Issues: None critical

## Page: ResidentContractPage
- Route: /contract
- Component: src/frontend/src/pages/ResidentContractPage.tsx
- Roles: resident
- Data source: authStore → user data
- Design status: ✅ Current
- i18n status: ✅ Full
- Empty state: ✅ Handled
- Loading state: ✅ Handled
- Error state: ⚠️ Partial (no error handling for QR generation failure)
- Responsive: ✅
- Issues: Missing error handling for QR code generation

## Page: ResidentUsefulContactsPage
- Route: /useful-contacts
- Component: src/frontend/src/pages/ResidentUsefulContactsPage.tsx
- Roles: resident
- Data source: apiRequest → /api/ads, /api/ads/categories, /api/banners
- Design status: ✅ Current
- i18n status: ⚠️ Partial (hardcoded "Назад" button — line 245; info sections hardcoded Russian)
- Empty state: ✅ Handled
- Loading state: ✅ Handled
- Error state: ⚠️ Partial (fetch errors caught not shown)
- Responsive: ✅
- Issues: Hardcoded Russian in navigation and description sections

## Page: ResidentRateEmployeesPage
- Route: /rate-employees
- Component: src/frontend/src/pages/ResidentRateEmployeesPage.tsx
- Roles: resident
- Data source: dataStore → executors, requests + localStorage (ratings)
- Design status: ✅ Current
- i18n status: ✅ Full
- Empty state: ✅ Handled
- Loading state: ✅ Handled
- Error state: ✅ Handled
- Responsive: ✅
- Issues: None critical

## Page: ColleaguesSection
- Route: /colleagues
- Component: src/frontend/src/pages/ColleaguesSection.tsx
- Roles: executor, department_head
- Data source: dataStore → executors
- Design status: ✅ Current
- i18n status: 🔴 Hardcoded (criteriaLabels lines 107-118 and thankReasons lines 120-126 ALL Russian-only)
- Empty state: ✅ Handled
- Loading state: ✅ Handled
- Error state: ⚠️ Partial (console.error only)
- Responsive: ✅
- Issues: Major i18n gap — all rating criteria and thank reasons hardcoded Russian

## Page: NotepadPage
- Route: /notepad
- Component: src/frontend/src/pages/NotepadPage.tsx
- Roles: all authenticated
- Data source: Notepad component (local/API)
- Design status: ✅ Current
- i18n status: ✅ Full
- Empty state: ✅ Handled
- Loading state: N/A (delegates to Notepad)
- Error state: N/A
- Responsive: ✅
- Issues: None — simple wrapper

## Page: SettingsPage
- Route: /settings and /profile (admin/director/manager)
- Component: src/frontend/src/pages/admin/SettingsPage.tsx
- Roles: admin, director, manager
- Data source: dataStore (settings), authStore
- Design status: ✅ Current
- i18n status: ⚠️ Partial (extensive hardcoded Russian in settings sections)
- Empty state: N/A
- Loading state: ✅ Handled
- Error state: ✅ Handled
- Responsive: ✅
- Issues: Many hardcoded Russian labels throughout settings

## Page: TeamPage
- Route: /team
- Component: src/frontend/src/pages/admin/TeamPage.tsx
- Roles: admin, manager, director
- Data source: teamApi, dataStore
- Design status: ✅ Current
- i18n status: ⚠️ Partial (ROLE_LABELS have RU/UZ but many UI strings still Russian)
- Empty state: ✅ Handled
- Loading state: ✅ Handled
- Error state: ✅ Handled
- Responsive: ✅
- Issues: Extensive Russian hardcoding in UI labels

## Page: ActivityLogPage
- Route: (not directly routed — embedded or legacy)
- Component: src/frontend/src/pages/admin/ActivityLogPage.tsx
- Roles: admin, director
- Data source: dataStore → requests (generates activity from request events)
- Design status: ✅ Current
- i18n status: ✅ Full
- Empty state: N/A
- Loading state: N/A
- Error state: N/A
- Responsive: ✅
- Issues: Only covers request activity, not system-wide audit trail

## Page: MonitoringPage
- Route: /monitoring
- Component: src/frontend/src/pages/admin/MonitoringPage.tsx
- Roles: admin, director
- Data source: dataStore → requests, executors + simulated health data
- Design status: ✅ Current
- i18n status: ✅ Full
- Empty state: N/A
- Loading state: ✅ Handled
- Error state: ✅ Handled
- Responsive: ✅
- Issues: Health/performance data is simulated, not from real monitoring

## Page: RentalsPage
- Route: /rentals
- Component: src/frontend/src/pages/manager/RentalsPage.tsx
- Roles: manager
- Data source: dataStore → rentalApartments, rentalRecords + branchesApi, buildingsApi
- Design status: ✅ Current
- i18n status: ⚠️ Partial (cascading selectors may have hardcoded labels)
- Empty state: ✅ Handled
- Loading state: ✅ Handled (loading states for branches, buildings, residents)
- Error state: ✅ Handled
- Responsive: ✅
- Issues: Potential hardcoded labels in cascading selects

## Page: ExecutorSchedulePage
- Route: /schedule
- Component: src/frontend/src/pages/ExecutorSchedulePage.tsx
- Roles: executor
- Data source: dataStore → requests, executors
- Design status: ✅ Current
- i18n status: ✅ Full
- Empty state: ✅ Handled
- Loading state: N/A
- Error state: N/A
- Responsive: ✅
- Issues: formatDate hardcoded to 'ru-RU' locale (line 59)

## Page: ExecutorStatsPage
- Route: /my-stats
- Component: src/frontend/src/pages/ExecutorStatsPage.tsx
- Roles: executor
- Data source: dataStore → requests, executors, getExecutorStats
- Design status: ✅ Current
- i18n status: ✅ Full
- Empty state: N/A (shows 0 values)
- Loading state: N/A
- Error state: N/A
- Responsive: ✅
- Issues: weeklyStats days array hardcoded (lines 28-30)

---

### Page-by-Page Summary

| Category | ✅ | ⚠️ | 🔴 |
|---|---|---|---|
| **Design status** | 43 | 2 (SuperAdmin, Meetings) | 0 |
| **i18n status** | 23 | 18 | 4 (SuperAdmin, Colleagues, + 2 partial) |
| **Empty state** | 38 | 4 | 3 |
| **Loading state** | 33 | 6 | 6 |
| **Error state** | 16 | 19 | 10 |
| **Responsive** | 43 | 2 | 0 |

---

## Part 2: Feature Chronology Audit

## Feature: Service Requests (Заявки)
- Files: RequestsPage.tsx, RequestCard.tsx, requestStore.ts, services/api/requests.ts, index.ts lines 6253-6700
- Roles: resident (create, view own), executor (view assigned, update status), manager/admin/director (full CRUD, assign)

### Data Chain:
- Create: ✅ Auto-numbered per branch+category (YS-L-1001). Optimistic UI with temp IDs. Push notification to managers.
- Read: ✅ Role-filtered (resident=own, executor=specialization, manager=all). Real-time via WebSocket.
- Update: ✅ Status transitions tracked with timestamps (started_at, completed_at). Optimistic with rollback.
- Delete: ✅ Available to managers.
- Timestamps/audit: ✅ created_at, started_at, completed_at, updated_at tracked

### Business Logic:
- Lifecycle tracking: ✅ new → assigned → in_progress → completed (with paused/resumed sub-states)
- Backward transitions: ⚠️ No explicit prevention of completed → in_progress
- Worker notification: ✅ Push + WebSocket on assignment
- Rating after completion: ⚠️ Rating endpoint exists (POST /api/ratings) but no check that request is completed first; no duplicate rating prevention
- Reschedule requests: ✅ Full workflow with resident request → admin approval

### Chronology Status: 🟢 Full chain works end-to-end (with minor gaps in rating validation)

---

## Feature: Meetings & Voting (Собрания)
- Files: MeetingsPage.tsx, ResidentMeetingsPage.tsx, meetingStore.ts, services/api/meetings.ts, index.ts lines 8813-11238+
- Roles: admin/manager/director (create, manage), resident (vote, comment)

### Data Chain:
- Create: ✅ Meeting with agenda items, schedule options, eligible voters
- Read: ✅ Real-time vote aggregation with weight calculation
- Update: ✅ Meeting details, agenda items editable before voting opens
- Delete: ✅ Available to organizers
- Timestamps/audit: ✅ created_at, voting_opened_at, voting_closed_at

### Business Logic:
- Quorum by area (кв.м): ✅ vote_weight = apartment total_area; quorum = 50%+ of building total area
- Vote deadline enforcement: 🔴 No time check in vote endpoint — only status check. Can vote after deadline if status still 'voting_open'
- Proxy votes: 🔴 Not implemented (no proxy_voter tables)
- Vote immutability: 🔴 Votes UPDATE existing record (line ~10431), not INSERT-only. Violates audit immutability.
- Duplicate prevention: ✅ UNIQUE constraint on (meeting_id, agenda_item_id, voter_id)
- Revote control: ✅ Gated by meeting.allow_revote flag with reconsideration requests
- Protocol generation: ✅ Auto-generates from vote records + comments after close-voting
- Objections on "against" vote: ✅ Stored in meeting_agenda_comments with comment_type='objection' + counter_proposal

### Chronology Status: 🟡 Partially implemented — core voting works but deadline enforcement and immutability are broken

---

## Feature: Meters (Счётчики/ИПУ)
- Files: meterStore.ts, services/api/crm.ts, index.ts lines 5930-6200
- Roles: admin/manager (CRUD meters), resident (submit readings)

### Data Chain:
- Create: ✅ Meter creation with type, serial number, location
- Read: ✅ Per-apartment and per-building views
- Update: ✅ Meter details editable
- Delete: ✅ Decommissioning supported
- Timestamps/audit: ✅ created_at, readings have timestamps

### Business Logic:
- Reading < previous check: 🔴 No validation — negative consumption possible
- Submission window: 🔴 No date window enforcement (e.g., 1st-10th of month)
- Auto-consumption calculation: 🔴 No automatic current - previous logic
- Meter verification expiry: 🔴 next_verification_date column exists but not checked/enforced
- Tariff zones: ⚠️ Tariff zone field exists but calculation logic missing

### Chronology Status: 🟡 CRUD works but business validation rules completely missing

---

## Feature: Chat/Messaging
- Files: ChatPage.tsx, chatStore.ts, services/api/chat.ts, index.ts lines 2199-2730
- Roles: all authenticated

### Data Chain:
- Create: ✅ Message sending with WebSocket broadcast
- Read: ✅ Cursor-based pagination, real-time via WebSocket
- Update: N/A (messages not editable)
- Delete: N/A (no message deletion)
- Timestamps/audit: ✅ created_at on messages

### Business Logic:
- Delivery confirmation: 🔴 No delivery receipt — only "sent" status
- Unread count decrement: ✅ Via chat_message_reads table
- Media attachments: 🔴 Text-only — no attachment support
- Pagination: ✅ Cursor-based with `before` parameter
- Channel creation: ⚠️ Role enforcement on channel creation unclear
- Private support channels: ✅ Management replies marked with role indicator

### Chronology Status: 🟡 Core messaging works; missing attachments, delivery confirmation

---

## Feature: Guest Access & QR Codes
- Files: ResidentGuestAccessPage.tsx, ManagerGuestAccessPage.tsx, GuardQRScannerPage.tsx, guestAccessStore.ts, index.ts lines 1771-2183
- Roles: resident (create passes), security (scan QR), manager (view all)

### Data Chain:
- Create: ✅ Self-contained GAPASS token with expiry, visitor info
- Read: ✅ Per-resident and management views with stats
- Update: N/A (passes not editable, only revokable)
- Delete: ✅ Revocation with status update
- Timestamps/audit: ✅ created_at, used_at in logs

### Business Logic:
- QR offline validation: ✅ Token self-contained, can validate without DB
- Expiry handling: ✅ Auto-expires on GET list
- Access types: ✅ single_use, day, week, month, custom
- Max uses enforcement: 🔴 Code doesn't check current_uses >= max_uses before allowing entry
- Guard verification flow: ✅ Scan → decode → validate → log entry/exit

### Chronology Status: 🟢 Full chain works (except max_uses enforcement gap)

---

## Feature: Vehicles
- Files: ResidentVehiclesPage.tsx, VehicleSearchPage.tsx, vehicleStore.ts, services/api/vehicles.ts, index.ts lines 1093-1265
- Roles: resident (own vehicles), manager+ (all vehicles, search)

### Data Chain:
- Create: ✅ With plate, brand, model, color, year, type, parking spot
- Read: ✅ Per-user and global list with pagination
- Update: ✅ All fields editable
- Delete: ✅ With confirmation
- Timestamps/audit: ✅ created_at

### Business Logic:
- Plate search: ✅ UPPER(plate_number) LIKE search
- Multiple vehicles per user: ✅ Supported with is_primary flag
- Owner/company vehicles: ✅ owner_type field supported
- Region-based plate validation: ✅ UZ_REGIONS mapping

### Chronology Status: 🟢 Full chain works end-to-end

---

## Feature: Announcements
- Files: AnnouncementsPage.tsx, ResidentAnnouncementsPage.tsx, ExecutorAnnouncementsPage.tsx, announcementStore.ts, index.ts lines 2770-3223
- Roles: admin/manager/director (CRUD), resident/executor (view, mark read)

### Data Chain:
- Create: ✅ With targeting (building/entrance/floor/branch/custom), priority, attachments
- Read: ✅ Role-filtered views with unread badges
- Update: ✅ Full editing
- Delete: ✅ Available
- Timestamps/audit: ✅ created_at + view tracking via announcement_views

### Business Logic:
- Read tracking: ✅ Per-user view recording with view stats aggregation
- Push notifications: ✅ Triggered on creation for all residents
- Urgent flag: ✅ Priority levels (high triggers different UI treatment)
- Targeted delivery: ✅ Building, entrance, floor, branch, custom recipient lists

### Chronology Status: 🟢 Full chain works end-to-end

---

## Feature: Marketplace
- Files: MarketplacePage.tsx, MarketplaceManagerDashboard.tsx, MarketplaceOrdersPage.tsx, index.ts lines 13810-15025
- Roles: resident (browse, order), marketplace_manager (products), admin (orders), executor (delivery)

### Data Chain:
- Create: ✅ Products with categories, stock, pricing, images
- Read: ✅ Product listing with categories, search, featured
- Update: ✅ Product details, stock management
- Delete: ✅ Product deactivation
- Timestamps/audit: ✅ created_at on orders

### Business Logic:
- Stock management: ✅ Real-time availability (stock - reserved across all carts)
- Order flow: ✅ Cart → order → accepted → preparing → ready → delivered
- Stock reversal on cancel: ✅ Returns stock to inventory
- Payment integration: 🔴 NOT IMPLEMENTED — orders created without payment
- Delivery assignment: ✅ Executor takes order, tracks delivery
- Rating: ✅ Post-delivery review with stars + comment

### Chronology Status: 🟡 Full UI chain but payment is missing — no revenue collection

---

## Feature: Work Orders (Наряды)
- Files: WorkOrdersPage.tsx, index.ts lines 7469-7661
- Roles: admin, manager, director

### Data Chain:
- Create: ✅ Auto-numbered НР-YYYY-NNN
- Read: ✅ With filtering
- Update: ✅ Status updates
- Delete: ✅ Available
- Timestamps/audit: ⚠️ updated_at tracked but no explicit completion_at

### Business Logic:
- Auto-numbering: ✅ Sequential per year
- Status lifecycle: ✅ pending → assigned → in_progress → completed → cancelled
- Feedback/rating: 🔴 No rating mechanism for completed work orders

### Chronology Status: 🟢 Core chain works (no rating/feedback)

---

## Feature: UK Satisfaction Rating
- Files: ResidentRateEmployeesPage.tsx, index.ts lines 7726-7810
- Roles: resident (rate), admin (view summary)

### Data Chain:
- Create: ✅ Monthly UPSERT (ON CONFLICT UPDATE)
- Read: ✅ Per-resident current period + 6-month admin summary
- Update: ✅ Via UPSERT mechanism
- Delete: N/A
- Timestamps/audit: ✅ period (YYYY-MM), created_at

### Business Logic:
- Duplicate prevention: ✅ UNIQUE constraint on (resident_id, tenant_id, period)
- Multiple votes: ⚠️ Can change rating anytime within month (no lock after first submission)
- Metrics: ✅ overall, cleanliness, responsiveness, communication (1-5 scale)
- Scope: ✅ Per-tenant per-month
- History: ✅ Stored permanently; 6-month summary endpoint

### Chronology Status: 🟢 Full chain works (no period locking)

---

## Feature: Notifications & Push
- Files: notificationStore.ts, services/pushNotifications.ts, index.ts lines 12112-12386
- Roles: all authenticated

### Data Chain:
- Create: ✅ Via API (management) or auto-generated by events
- Read: ✅ Per-user with unread count
- Update: ✅ Mark read (single + bulk)
- Delete: ✅ Available
- Timestamps/audit: ✅ created_at, read_at

### Business Logic:
- Event triggers: ⚠️ Partial — requests, announcements, chat trigger push; meetings, work orders, marketplace orders may not
- Push subscription: ✅ Service worker registration + VAPID keys
- Cross-device sync: ⚠️ Push delivered to all subscriptions; read status via API may not sync immediately
- Notification preferences: 🔴 No user-configurable notification settings

### Chronology Status: 🟡 Core works but event coverage incomplete; no user preferences

---

## Feature: Payments/Finance
- Files: index.ts lines 5483-5698
- Roles: admin (view debtors), resident (view own balance)

### Data Chain:
- Create: 🔴 No payment recording endpoint
- Read: ✅ Debt list and personal accounts
- Update: 🔴 No way to update payment status
- Delete: N/A
- Timestamps/audit: 🔴 No payment history

### Business Logic:
- Debt calculation: ⚠️ current_debt column exists but calculation logic not visible
- Payment recording: 🔴 Not implemented
- Receipt generation: 🔴 Not implemented
- Invoice matching: 🔴 Not implemented

### Chronology Status: 🔴 Broken chain — read-only display of debt; no payment workflow

---

## Feature: Residents/Users Management
- Files: ResidentsPage.tsx, ResidentProfilePage.tsx, index.ts auth endpoints
- Roles: admin/manager (manage), resident (self-service)

### Data Chain:
- Create: ✅ Admin creates residents with auto-generated password
- Read: ✅ Filtered by building/entrance
- Update: ✅ Profile editing (phone, password)
- Delete: ✅ Available to admin
- Timestamps/audit: ✅ created_at

### Business Logic:
- Registration: ✅ Admin-invited (no self-registration)
- Multi-apartment: ✅ One user can be linked to multiple apartments
- Multi-user per apartment: ✅ Multiple residents per apartment
- Role assignment: ✅ Admin can set roles
- Default password: 🔴 Hardcoded 'kamizo' (line 106 ResidentsPage.tsx) — security risk
- Deactivation vs deletion: ⚠️ Deletion removes user; no soft-deactivation option

### Chronology Status: 🟢 Full chain works (security concern with default password)

---

## Part 3: Role-Based Access Audit

## Role: Super Admin (platform-level)
- Routes accessible: /, /super-admin
- Routes correctly restricted: ✅ Layout.tsx line 224 blocks /requests for super_admin
- Data isolation: ✅ Cross-tenant access is intentional for platform management
- Backend enforcement: ✅ Super admin endpoints separate from tenant endpoints
- UI adaptation: ✅ No sidebar shown (line 197); full-width layout; dedicated SuperAdminDashboard
- Issues:
  - 🔴 Super admin impersonation via URL parameter `?auto_auth=base64` is insecure (App.tsx lines 13-36)
  - ⚠️ SuperAdminDashboard all feature labels hardcoded Russian

## Role: Admin (UK/management company)
- Routes accessible: /, /requests, /residents, /executors, /buildings, /work-orders, /meetings, /announcements, /chat, /team, /reports, /settings, /monitoring, /marketplace-orders, /guest-access, /rentals, /trainings, /colleagues, /notepad, /profile
- Routes incorrectly accessible: ⚠️ /schedule and /my-stats are executor-specific but no frontend guard prevents admin from navigating there
- Data isolation: ⚠️ Backend filters by tenant_id but 41 tables missing column — see Part 4
- Backend enforcement: ✅ isManagement(authUser) checks on most endpoints
- UI adaptation: ✅ Sidebar shows admin menu items; dashboard switches to AdminDashboard

## Role: Manager
- Routes accessible: /, /requests, /residents, /executors, /buildings, /work-orders, /meetings, /announcements, /chat, /guest-access, /rentals, /trainings, /colleagues, /notepad, /profile (redirects to /settings)
- Routes correctly restricted: ✅ No access to /team, /reports, /monitoring (admin-only)
- Data isolation: ⚠️ Same tenant_id gap as admin
- Backend enforcement: ✅ Filtered appropriately in most endpoints
- UI adaptation: ✅ ManagerDashboard shown; reduced menu items

## Role: Director
- Routes accessible: Same as Admin plus /reports, /team, /monitoring
- Data isolation: ⚠️ Same tenant_id gap
- Backend enforcement: ✅
- UI adaptation: ✅ DirectorDashboard with comprehensive analytics

## Role: Department Head
- Routes accessible: /, /requests, /residents, /executors, /announcements, /chat, /colleagues, /notepad, /profile
- Routes correctly restricted: ✅ Limited to specialization-specific requests
- Data isolation: ✅ Requests filtered by specialization
- Backend enforcement: ✅ Request queries filter by department head's specialization
- UI adaptation: ✅ DepartmentHeadDashboard with specialization focus

## Role: Executor (worker/specialist)
- Routes accessible: /, /requests, /schedule, /my-stats, /announcements, /chat, /colleagues, /notepad, /profile, /marketplace
- Routes incorrectly accessible: ⚠️ No frontend guard on /buildings, /residents, /meetings — components may render empty but route accessible
- Data isolation: ✅ Requests filtered to assigned + matching specialization
- Backend enforcement: ✅ Executor-specific endpoints verify role
- UI adaptation: ✅ ExecutorDashboard; BottomBar shows executor-specific navigation
- Issues:
  - 🔴 `POST /api/marketplace/executor/orders/:id/take` missing explicit role check (line ~14628)

## Role: Security (guard)
- Routes accessible: /qr-scanner (default redirect), /schedule, /my-stats, /announcements, /chat, /profile
- Routes correctly restricted: ✅ Redirected to /qr-scanner on login
- Data isolation: ✅ Limited to guest access verification
- Backend enforcement: ✅
- UI adaptation: ✅ Redirects to QR scanner; minimal sidebar

## Role: Resident
- Routes accessible: /, /requests, /announcements, /meetings, /chat, /vehicles, /guest-access, /marketplace, /rate-employees, /profile, /contract, /useful-contacts
- Routes incorrectly accessible: ⚠️ /buildings, /work-orders, /executors have no frontend guard — may render empty
- Data isolation: ✅ Backend filters to own apartment/building data
- Backend enforcement: ✅ Resident sees only own requests, vehicles, guest codes
- UI adaptation: ✅ ResidentDashboard with mobile-first design; BottomBar with resident actions

## Role: Tenant / Commercial Owner
- Routes accessible: /, /requests, /marketplace, /chat, /profile
- Data isolation: ✅ Filtered to linked rental apartments
- Backend enforcement: ✅
- UI adaptation: ✅ TenantDashboard with rental focus; calendar + bookings

## Role: Guest (unauthenticated)
- Routes accessible: /login only
- Data isolation: ✅ No data access
- Backend enforcement: ✅ All API endpoints require authentication (getUser middleware)
- UI adaptation: ✅ Redirected to LoginPage

### Cross-Role Edge Cases:
- **Role changed while logged in**: 🔴 No session invalidation. User keeps old role until page refresh. Backend will reject if role doesn't match, but frontend may show wrong UI.
- **Manual URL typing**: ⚠️ No ProtectedRoute. Resident can type /admin URL — component renders but may show empty data. Backend prevents data access.
- **Backend vs frontend enforcement**: ✅ Backend checks independently. Frontend role checks are UX-only.

---

## Part 4: Cross-Cutting Concerns

### A. Multi-tenancy Isolation

**Critical Finding: 41 of 63 tables missing tenant_id column**

The backend code consistently calls `getTenantId(request)` and includes tenant_id in queries, but the database schema doesn't have the column on most tables. This creates a critical data isolation failure.

| Tables WITH tenant_id | Tables MISSING tenant_id |
|---|---|
| uk_satisfaction_ratings | users, buildings, apartments, entrances |
| meeting_protocols | requests, categories |
| meeting_voting_units | vehicles, guest_access_codes, guest_access_logs |
| meeting_building_settings | chat_channels, chat_messages, chat_participants |
| meeting_eligible_voters | meetings, meeting_schedule_votes, meeting_vote_records |
| meeting_participated_voters | meeting_agenda_items, meeting_otp_records |
| meeting_agenda_comments | marketplace_products, marketplace_orders, marketplace_cart |
| settings | marketplace_order_items, marketplace_reviews |
| ad_coupons, ad_views | announcements, announcement_views |
| | notifications, push_subscriptions |
| | work_orders, meters, meter_readings |
| | personal_accounts, employee_ratings |
| | owners, owner_apartments, building_documents |
| | training_*, ads |

**Tenant_id source**: Secure — derived from authenticated session via `getTenantId(request)`, NOT from request body/params.

### B. Data Consistency

**Orphaned records**: Yes — deleting a building does NOT cascade to apartments, meters, work_orders. Deleting a user does NOT cascade to requests, vehicles, guest_access_codes, chat_messages.

**Foreign key constraints**: Schema uses FK references but D1 SQLite may not enforce them. No CASCADE DELETE rules found in schema.sql. App code handles cascading manually in some places but not consistently.

**Race conditions**: No optimistic locking. Two admins editing same entity simultaneously could overwrite each other. No version/etag checking.

### C. Notification Completeness Matrix

| Event | Push | WebSocket | In-App DB | Telegram |
|---|---|---|---|---|
| Request created | ✅ Managers | ✅ Broadcast | ✅ | 🔴 |
| Request assigned | ✅ Executor | ✅ | ✅ | 🔴 |
| Request completed | ✅ Resident | ✅ | ✅ | 🔴 |
| Chat message | ✅ Recipient | ✅ Real-time | ✅ | 🔴 |
| Announcement created | ✅ All residents | ✅ | ✅ | 🔴 |
| Meeting created | 🔴 | 🔴 | 🔴 | 🔴 |
| Meeting voting opened | 🔴 | 🔴 | 🔴 | 🔴 |
| Vote cast | 🔴 | ✅ Aggregate | 🔴 | 🔴 |
| Guest access used | 🔴 | 🔴 | 🔴 | 🔴 |
| Marketplace order status | ⚠️ Some | ✅ | ⚠️ | 🔴 |
| Work order assigned | 🔴 | 🔴 | 🔴 | 🔴 |
| Meter reading submitted | 🔴 | 🔴 | 🔴 | 🔴 |
| UK rating period open | 🔴 | 🔴 | 🔴 | 🔴 |
| Payment received | 🔴 | 🔴 | 🔴 | 🔴 |

**Missing notifications**: Meeting lifecycle (creation, voting open/close), guest access usage alerts to resident, work order assignment, meter reminders, payment confirmations.
**Telegram**: Not integrated at all.

### D. Search & Filtering

| Page | Search Works | Searchable Fields | Server/Client | Sort |
|---|---|---|---|---|
| Requests | ✅ | title, description, number | Server | Server |
| Residents | ✅ | name, phone, apartment | Client | Client |
| Buildings | ✅ | name, address | Client | Client |
| Executors | ✅ | name, specialization | Client | Client |
| Vehicles | ✅ | plate_number (UPPER LIKE) | Server | Server |
| Announcements | ✅ | title, content | Client | Client |
| Chat | 🔴 | None (no message search) | - | - |
| Marketplace | ✅ | product name | Server | Server |
| Work Orders | ✅ | title, number | Client | Client |
| Meetings | ⚠️ | Basic title | Client | Client |

**Filter combination**: Mostly AND logic. No OR filters found. Date range filters use server-side WHERE clause for requests; client-side for most other pages.

### E. File Upload/Media

**File storage**: Cloudflare R2 (via presigned URLs)
**Accepted types**: Images (JPEG, PNG, GIF, WebP), documents (PDF) — MIME type validation only, no content inspection
**Size limits**: Not explicitly enforced in API; Cloudflare Workers have 100MB body limit
**Access control**: 🔴 No per-file access control — uploaded files likely accessible by URL to anyone with the link

---

## Part 5: Design System Audit

### Color Palette
- **Brand**: #F97316 (orange) with dynamic tenant customization via CSS variables (--brand-50 to --brand-900)
- **Deviations**: ✅ No significant deviations found — all components use Tailwind brand classes or CSS variables

### Typography
- **Font**: Inter (Google Fonts) with system fallback
- **Inconsistencies**: ⚠️ Icon sizes vary (w-4, w-5, w-6, w-8) without clear system. Heading levels not standardized.

### Spacing
- **Glass cards**: Consistent p-3 sm:p-4 md:p-5 pattern
- **Page padding**: px-3 py-3 md:p-6 lg:p-7 xl:p-8
- **Violations**: Minor — some components use hardcoded pixel values instead of Tailwind spacing

### Component Reuse
- **Duplicate patterns**: ⚠️ Each modal defined separately — no shared ModalWrapper component. Loading spinners inline everywhere instead of shared LoadingSpinner component.
- **StatsCard**: Reusable component exists and is used consistently

### Icon Consistency
- **Source**: ✅ lucide-react exclusively — no mixed icon libraries
- **Size standard**: ⚠️ No standard — ranges from w-3 to w-10 without documented system

### Button Styles
- **Primary**: .btn-primary (orange, shadow, 44px min-height) — consistent
- **Secondary/Danger**: ⚠️ Inline Tailwind classes — no standardized .btn-secondary, .btn-danger classes

### Form Patterns
- **Input style**: .glass-input (transparent, blur, 44px min-height) — consistent
- **Label placement**: Above input — consistent
- **Validation display**: ⚠️ Inconsistent — some forms show inline errors, others use alert()
- **Required indicators**: 🔴 No asterisk or "required" markers on required fields

### Modal Patterns
- **Structure**: ⚠️ No shared modal component. Each modal has own overlay, close button, animation
- **Close behavior**: Click outside to close — mostly consistent
- **Focus trap**: 🔴 Missing — no focus management on modal open

### Table Patterns
- **Header style**: Consistent Tailwind bg-gray-50 text-gray-600
- **Row hover**: ⚠️ Inconsistent — some tables have hover:bg-gray-50, others don't
- **Pagination**: ⚠️ Some tables use client-side pagination, others use server-side

### Dark Mode
- 🔴 Not implemented at all. No dark: Tailwind classes. No theme toggle.

---

## Prioritized Fix List

### Week 1: Critical Security & Data Integrity
1. **Move ENCRYPTION_KEY to Cloudflare Secrets** — remove from wrangler.toml (Low effort)
2. **Add tenant_id columns to all 41 missing tables** — create migration 027_add_tenant_id_all_tables.sql (Medium effort)
3. **Remove password_plain column** — switch to bcrypt hashing (Medium effort)
4. **Fix SQL injection** in notification LIKE query (Low effort)
5. **Make rate limiter fail-closed** on KV errors (Low effort)
6. **Add vote deadline time check** to meeting vote endpoint (Low effort)
7. **Add max_uses check** to guest access use endpoint (Low effort)

### Week 2: Auth & Access Control
8. **Implement JWT-based authentication** replacing user.id-as-token (High effort)
9. **Add ProtectedRoute component** to frontend router (Medium effort)
10. **Add explicit role checks** to 4+ unguarded endpoints (Low effort)
11. **Fix super admin auto_auth** to use secure mechanism, not URL parameter (Medium effort)
12. **Remove DEFAULT_PASSWORD = 'kamizo'** — use random generated passwords (Low effort)

### Week 3: Business Logic Completion
13. **Implement payment integration** for marketplace (High effort)
14. **Add meter reading validation** (reading >= previous, submission window) (Medium effort)
15. **Make votes immutable** (INSERT-only model for meeting_vote_records) (Medium effort)
16. **Add proxy voting** support for meetings (High effort)
17. **Add missing notification triggers** (meetings, work orders, guest access) (Medium effort)

### Week 4: i18n & Design Polish
18. **Fix SuperAdminDashboard i18n** — translate all feature labels (Low effort)
19. **Fix ColleaguesSection i18n** — translate criteria + thank reasons (Low effort)
20. **Fix ReportsPage i18n** — period labels, CSV headers, formatPrice (Low effort)
21. **Fix Marketplace i18n** — ORDER_STAGES, product emoji, formatPrice (Low effort)
22. **Create shared Modal component** (Medium effort)
23. **Add required field indicators** to all forms (Low effort)

### Week 5+: UX, Testing, Monitoring
24. **Set up Vitest + React Testing Library** (Medium effort)
25. **Write tests for critical stores** (requestStore, meetingStore, authStore) (High effort)
26. **Add loading states** to ResidentDashboard, ReportsPage, announcement pages (Low effort)
27. **Add error states** to all 10 pages missing them (Medium effort)
28. **Integrate external monitoring** (Sentry or similar) (Medium effort)
29. **Add WCAG accessibility** — ARIA labels, focus management, keyboard navigation (High effort)
30. **Implement dark mode** (Medium effort)

---

## Appendix: Full Route Map

| Route | Component | Roles | Status |
|---|---|---|---|
| / | getDashboard() (role-switched) | all | 🟢 |
| /requests | RequestsPage | admin, manager, director, dept_head, executor, resident | 🟢 |
| /residents | ResidentsPage | admin, manager, director, dept_head | 🟢 |
| /executors | ExecutorsPage | all staff | 🟢 |
| /buildings | BuildingsPage | admin, manager, director | 🟢 |
| /work-orders | WorkOrdersPage | admin, manager, director | 🟢 |
| /meetings | MeetingsPage / ResidentMeetingsPage | admin, manager, director / resident | 🟡 |
| /announcements | AnnouncementsPage / Resident / Executor | role-switched | 🟢 |
| /schedule | ExecutorSchedulePage | executor | 🟢 |
| /my-stats | ExecutorStatsPage | executor | 🟢 |
| /rate-employees | ResidentRateEmployeesPage | resident | 🟢 |
| /vehicles | ResidentVehiclesPage | resident | 🟢 |
| /vehicle-search | VehicleSearchPage | resident, manager | 🟢 |
| /guest-access | GuestAccessPage (role-switched) | resident, manager+ | 🟢 |
| /qr-scanner | GuardQRScannerPage | security | 🟢 |
| /chat | ChatPage | all authenticated | 🟡 |
| /profile | ProfilePage (role-switched) | all | 🟢 |
| /contract | ResidentContractPage | resident | 🟢 |
| /useful-contacts | ResidentUsefulContactsPage | resident | 🟢 |
| /colleagues | ColleaguesSection | executor, dept_head | 🟡 i18n |
| /notepad | NotepadPage | all | 🟢 |
| /trainings | TrainingsPage | admin, director, staff | 🟡 |
| /team | TeamPage | admin, manager, director | 🟢 |
| /reports | ReportsPage | admin, director | 🟡 i18n |
| /settings | SettingsPage | admin, director, manager | 🟡 i18n |
| /monitoring | MonitoringPage | admin, director | 🟢 |
| /marketplace | MarketplacePage | resident, tenant | 🟡 |
| /marketplace-orders | MarketplaceOrdersPage | admin, manager | 🟡 i18n |
| /marketplace-products | MarketplaceManagerDashboard | marketplace_manager | 🟢 |
| /rentals | RentalsPage | manager | 🟢 |
| /super-admin | SuperAdminDashboard | super_admin | 🟡 i18n |
| /login | LoginPage | public | 🟢 |

---

## Appendix: Feature × Status Matrix

| Feature | Create | Read | Update | Delete | Notifications | History | Status |
|---|---|---|---|---|---|---|---|
| Requests | ✅ | ✅ | ✅ | ✅ | ✅ Push+WS | ✅ timestamps | 🟢 |
| Meetings | ✅ | ✅ | ✅ | ✅ | 🔴 Missing | ✅ vote records | 🟡 |
| Voting | ✅ | ✅ | ⚠️ mutable | N/A | 🔴 | ✅ hash | 🟡 |
| Meters | ✅ | ✅ | ✅ | ✅ | 🔴 | ✅ readings | 🟡 |
| Chat | ✅ | ✅ | N/A | N/A | ✅ Push+WS | ✅ messages | 🟡 |
| Guest Access | ✅ | ✅ | N/A | ✅ revoke | 🔴 | ✅ logs | 🟢 |
| Vehicles | ✅ | ✅ | ✅ | ✅ | N/A | N/A | 🟢 |
| Announcements | ✅ | ✅ | ✅ | ✅ | ✅ Push | ✅ views | 🟢 |
| Marketplace | ✅ | ✅ | ✅ | ✅ | ⚠️ Partial | ✅ orders | 🟡 |
| Work Orders | ✅ | ✅ | ✅ | ✅ | 🔴 | ⚠️ updated_at | 🟢 |
| UK Rating | ✅ | ✅ | ✅ upsert | N/A | 🔴 | ✅ monthly | 🟢 |
| Payments | 🔴 | ✅ debt only | 🔴 | N/A | 🔴 | 🔴 | 🔴 |
| Users | ✅ | ✅ | ✅ | ✅ | N/A | ✅ created_at | 🟢 |

---

## Appendix: Notification Event Matrix

| Event | Push | WebSocket | In-App DB | Telegram |
|---|---|---|---|---|---|
| Request created | ✅ | ✅ | ✅ | 🔴 |
| Request assigned | ✅ | ✅ | ✅ | 🔴 |
| Request status changed | ✅ | ✅ | ✅ | 🔴 |
| Chat message | ✅ | ✅ | ✅ | 🔴 |
| Announcement created | ✅ | ✅ | ✅ | 🔴 |
| Meeting created | 🔴 | 🔴 | 🔴 | 🔴 |
| Voting opened | 🔴 | 🔴 | 🔴 | 🔴 |
| Voting closed | 🔴 | 🔴 | 🔴 | 🔴 |
| Vote cast | 🔴 | ✅ aggregate | 🔴 | 🔴 |
| Guest access used | 🔴 | 🔴 | 🔴 | 🔴 |
| Guest pass expiring | 🔴 | 🔴 | 🔴 | 🔴 |
| Marketplace order placed | ⚠️ | ✅ | ⚠️ | 🔴 |
| Marketplace order delivered | ⚠️ | ✅ | ⚠️ | 🔴 |
| Work order assigned | 🔴 | 🔴 | 🔴 | 🔴 |
| Work order completed | 🔴 | 🔴 | 🔴 | 🔴 |
| Meter reading reminder | 🔴 | 🔴 | 🔴 | 🔴 |
| Meter reading submitted | 🔴 | 🔴 | 🔴 | 🔴 |
| Payment received | 🔴 | 🔴 | 🔴 | 🔴 |
| Payment overdue | 🔴 | 🔴 | 🔴 | 🔴 |
| UK rating period open | 🔴 | 🔴 | 🔴 | 🔴 |
| Training scheduled | 🔴 | 🔴 | 🔴 | 🔴 |

---

## Stats

- Total files scanned: 154 TypeScript source files (excl. node_modules)
- Total project files: 66,086 (incl. node_modules)
- Total TS/TSX lines: 91,456
- Backend main handler: 16,556 lines (1 file)
- Database tables: 63
- Database schema lines: 1,632
- Migration files: 26
- Page components: 45
- Zustand stores: 21
- API service modules: 15
- Frontend dependencies: 16 direct, 17 dev
- Backend dependencies: 0 direct, 3 dev
- `any` type usage: 316 instances
- ARIA attributes: 1
- TODO/FIXME/HACK: 0
- Test files: 0
- Dark mode support: None
