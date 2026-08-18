# Demo Engagement Seeder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate and expose deterministic demo training, colleague-rating, and private-note data without changing the production schema.

**Architecture:** A new insert-only `engagement` demo phase depends on core users and writes only columns verified by live production PRAGMA. Minimal API projections translate the live legacy training schema into current frontend types, while executor aggregation and page-mount fetching make seeded data visible.

**Tech Stack:** Node.js 20, TypeScript, Hono-style route registry, D1-compatible SQLite API, Vitest, React 18, Zustand, Vite, Capacitor iOS.

**Spec:** `docs/superpowers/specs/2026-08-18-demo-engagement-design.md`

## Global Constraints

- Live read-only production PRAGMA is the schema source of truth.
- No schema migration, new table, production write, deploy, password reset, destructive data reset, or subagent.
- Every seeded lookup/write is tenant-scoped and deterministic.
- Reruns preserve mutable seeded lifecycle fields and unrelated/cross-tenant data.
- Do not commit unless the user separately requests a commit.

---

### Task 1: Production Contract And Seeder Tests

**Files:**
- Modify: `cloudflare/src/lib/demo/__tests__/fixtures/demo-production-schema.sql`
- Modify: `cloudflare/src/lib/demo/__tests__/production-schema-contract.test.ts`
- Create: `cloudflare/src/lib/demo/__tests__/engagement.integration.test.ts`

**Interfaces:**
- Consumes: `demoId(namespace: string, key: string): Promise<string>` and `DemoProvisionContext`.
- Produces: failing contract for `provisionDemoEngagement(context): Promise<DemoProvisionResult>` and `demoEngagementSeeder`.

- [ ] Add exact live DDL for `training_partners`, `training_proposals`, `training_votes`, `training_registrations`, `training_feedback`, `training_notifications`, `employee_ratings`, and `notes`; assert exact column order and absence of `training_settings`/`employee_thanks`.
- [ ] Write an integration test that creates demo and other-tenant users, provisions once, and asserts coherent partner/proposal/vote/registration/feedback/rating/note counts and relative dates.
- [ ] Extend the test to mutate proposal status, attendance, rating comment, and note content; delete one deterministic vote; rerun; assert mutations survive, the vote is repaired, passwords remain unchanged, and other-tenant rows remain byte-for-byte unchanged.
- [ ] Run `npx vitest run src/lib/demo/__tests__/production-schema-contract.test.ts src/lib/demo/__tests__/engagement.integration.test.ts` in `cloudflare`; expect the new seeder import/test to fail before implementation.

### Task 2: Engagement Seeder

**Files:**
- Create: `cloudflare/src/lib/demo/engagement.ts`
- Test: `cloudflare/src/lib/demo/__tests__/engagement.integration.test.ts`

**Interfaces:**
- Produces: `provisionDemoEngagement(context: DemoProvisionContext): Promise<DemoProvisionResult>` and `demoEngagementSeeder: DemoDomainSeeder` with phase `engagement`.

- [ ] Implement exact-demo-tenant validation and tenant-scoped user resolution for director, manager, resident, executor, electrician, and department head.
- [ ] Build deterministic insert-only rows with `demoId`: at least two partners and proposals covering active/scheduled/completed presentation states, linked votes, registrations, attended records, and feedback using dates relative to `context.now`.
- [ ] Insert tenant-scoped employee ratings/comments for visible ranking and three private notes for each director, manager, and primary executor.
- [ ] Use `INSERT ... ON CONFLICT(id) DO NOTHING`; count pre-existing deterministic IDs so reruns report no creations while never overwriting mutable columns.
- [ ] Run the Task 1 Vitest command; expect all contract and engagement tests to pass.

### Task 3: Provisioning Phase And Status

**Files:**
- Modify: `cloudflare/src/lib/demo/provision.ts`
- Modify: `cloudflare/src/routes/users/demo.ts`
- Modify: `cloudflare/src/lib/demo/core.ts`
- Modify: `cloudflare/src/lib/demo/__tests__/provision-all.integration.test.ts`
- Modify: `cloudflare/src/routes/users/__tests__/demo.test.ts`

**Interfaces:**
- Consumes: `demoEngagementSeeder`.
- Produces: `DemoPhase = 'core' | 'commerce' | 'finance' | 'engagement'`, default fixed phase ordering, engagement sentinels, counters, and readiness.

- [ ] First extend route/provision tests to expect default order `core, commerce, finance, engagement`, explicit engagement dependency on core, engagement status sentinels, table counts, and aggregate counters.
- [ ] Extend `CORE_FEATURES` with exact keys `trainings`, `colleagues`, and `notepad` while preserving existing tenant features.
- [ ] Register the seeder after finance in default order; make explicit `engagement` selection include core; add engagement table inventory, deterministic sentinel IDs, and relevant cache invalidation.
- [ ] Extend combined fixture table counting and twice-run assertions for all engagement tables.
- [ ] Run `npx vitest run src/lib/demo/__tests__/provision-all.integration.test.ts src/routes/users/__tests__/demo.test.ts`; expect pass.

### Task 4: Live-Schema Routes And Visibility

**Files:**
- Modify: `cloudflare/src/routes/training.ts`
- Modify: `cloudflare/src/routes/users/executors.ts`
- Create: `cloudflare/src/routes/__tests__/engagement-visibility.test.ts`

**Interfaces:**
- Produces: training list/detail/settings/stats responses matching current frontend shape while querying only live columns; executor list rating aggregated from `employee_ratings`.

- [ ] Register route handlers in a test harness backed by the production fixture and seeded engagement data; assert manager/admin/resident-visible training rows, nested votes/registrations/feedback, executor ratings/comments influence ranking, and note ownership remains private.
- [ ] Replace obsolete training reads with tenant-scoped joins/projections: `title AS topic`, partner name, user names, `start_date/end_date/location`, live vote/registration/feedback fields, and default settings when the absent settings table is requested.
- [ ] Adapt training mutations used by the current UI to only live columns and tenant scope; retain authorization and feature gates.
- [ ] Join a tenant-scoped employee-rating aggregate in `/api/executors`, preferring its average over request rating while retaining request operational stats.
- [ ] Run `npx vitest run src/routes/__tests__/engagement-visibility.test.ts src/routes/users/__tests__/executors-security.test.ts`; expect pass.

### Task 5: Frontend Visibility

**Files:**
- Modify: `src/frontend/src/pages/TrainingsPage.tsx`
- Modify: `src/frontend/src/stores/trainingStore.ts`
- Modify: `src/frontend/src/types/training.ts`
- Create: `src/frontend/src/pages/__tests__/EngagementPages.demo.test.tsx`

**Interfaces:**
- Consumes: projected training API and executor `rating` fields.
- Produces: mount-time training loading and deterministic visible proposal/rating/note presentation.

- [ ] Write React tests with mocked API/stores proving Trainings triggers fetch and renders proposal data, Colleagues renders executor names and persisted rating, and Notepad renders only returned private notes.
- [ ] Add a mount effect to fetch partners, proposals, and settings via field selectors; avoid whole-store barrel subscriptions.
- [ ] Make only necessary mapper/type adaptations for the route projection; remove random colleague rating variance so backend ratings render deterministically while retaining category presentation.
- [ ] Run `npm run test:unit -- src/pages/__tests__/EngagementPages.demo.test.tsx` in `src/frontend`; expect pass.

### Task 6: Full Verification And iOS

**Files:**
- Verify all modified files; no production or deployment files.

**Interfaces:**
- Produces: evidence that backend, frontend, bundle, and iOS simulator gates pass.

- [ ] Run backend full tests: `npm test` in `cloudflare`.
- [ ] Run backend TypeScript: `npx tsc --noEmit` in `cloudflare`.
- [ ] Run frontend full tests: `npm test` in `src/frontend`.
- [ ] Run frontend TypeScript: `npm run typecheck` in `src/frontend`.
- [ ] Run frontend build: `npm run build` in `src/frontend`.
- [ ] Run `npx cap sync ios` in `src/frontend`.
- [ ] Run `npx cap run ios --target "$(xcrun simctl list devices available | grep -m1 'iPhone 17 Pro Max' | grep -oE '[0-9A-F-]{36}')"`; verify command output identifies the intended simulator.
- [ ] Inspect `git diff --check`, `git status --short`, and the final diff; report changed behavior, test evidence, and any residual limitations without deploying.
