# Demo Core Fix Round 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent unrestricted password login for demo manifest identities and make demo meeting, billing and rerun behavior match live production contracts.

**Architecture:** Normal login performs a post-password, pre-mutation capability redirect check against the exact active `demo` tenant and shared manifest. Core integration uses one checked-in live-schema fixture. Apartment billing classification is centralized around live boolean flags, with legacy `property_type` used only when those flags are unavailable; demo upserts update descriptive fields but never reset lifecycle state.

**Tech Stack:** TypeScript, custom Fetch router, SQLite, Vitest, Web Crypto JWT.

**Spec:** `docs/superpowers/specs/2026-08-16-demo-presentation-tenant-design.md`

## Global Constraints

- Strict red-green-refactor TDD.
- No questions, subagents, commits, deploys, migrations, or production writes.
- Live read-only PRAGMA output from 2026-08-17 is authoritative.
- Ordinary tenants and non-manifest demo residents retain normal login behavior.

---

### Task 1: Block Normal Login For Demo Manifest Identities

**Files:**
- Modify: `cloudflare/src/routes/users/auth.ts`
- Create: `cloudflare/src/routes/users/__tests__/demo-normal-login.test.ts`

**Interfaces:**
- Normal login returns bilingual cache-disabled `403` with `demo_login_required: true` and `demo_login_endpoint: '/api/auth/demo-login'` after valid credentials but before last-login/password/JWT mutation.

- [ ] Add failing captured-route tests for `demo-director`, `demo-director-admin` and every manifest identity on exact active slug `demo`.
- [ ] Add tests proving a manual non-manifest demo resident and identical logins in ordinary tenants still receive ordinary JWTs.
- [ ] Add a password-reset-bypass regression proving a changed valid hash still reaches the same `403` and performs no rehash/last-login write.
- [ ] Implement one shared-manifest membership check plus exact tenant lookup before any login mutation or JWT issuance.
- [ ] Run focused normal/quick login tests until green.

### Task 2: Live Meeting Schema Contract And Executable Upserts

**Files:**
- Modify: `cloudflare/src/lib/demo/__tests__/fixtures/demo-production-schema.sql`
- Modify: `cloudflare/src/lib/demo/__tests__/production-schema-contract.test.ts`
- Modify: `cloudflare/src/lib/demo/__tests__/core.integration.test.ts`
- Modify: `cloudflare/src/lib/demo/core.ts`

**Interfaces:**
- Eligible voter rows use deterministic `id`, `voting_weight`, `has_voted`, `created_at`, `tenant_id`.
- Participated voter rows use deterministic `id`, `participation_type`, `participated_at`, `tenant_id`.
- Vote rows always provide required `user_id` and `vote` alongside compatibility fields.
- Protocol rows use live `created_at` and omit nonexistent `attachments`/`generated_at`.

- [ ] Extend the shared fixture and PRAGMA contract assertions with exact live meeting columns and indexes.
- [ ] Replace core integration’s inline schema with the shared production contract.
- [ ] Add failing integration assertions that exact prepared INSERT/UPSERT statements execute and `EXPLAIN` successfully against the shared fixture.
- [ ] Correct core meeting SQL and rerun focused schema/core tests.

### Task 3: Flag-Authoritative Residential Billing

**Files:**
- Create: `cloudflare/src/lib/finance/property-classification.ts`
- Create: `cloudflare/src/lib/finance/__tests__/property-classification.test.ts`
- Modify: `cloudflare/src/routes/finance.ts`
- Modify: `cloudflare/src/routes/finance-v2.ts`
- Modify: `cloudflare/src/lib/demo/core.ts`
- Modify: `cloudflare/src/lib/demo/finance.ts`
- Modify: `cloudflare/src/lib/demo/__tests__/finance.integration.test.ts`
- Modify: `cloudflare/src/routes/__tests__/finance-accounting.test.ts`

**Interfaces:**
- `classifyApartmentForBilling(apartment)` returns `residential | commercial | basement | parking` with boolean flags authoritative and legacy `property_type` fallback only when flags are absent.

- [ ] Add failing pure classification tests for live flags plus inverted legacy defaults.
- [ ] Add failing demo finance assertions that every seeded resident charge rate equals the per-building `computeComplexEstimate().tariff_effective` and amount equals area times that rate.
- [ ] Add/adjust manual and cron generation contract tests for all-zero flags with legacy `property_type='commercial'` and `'non_commercial'`.
- [ ] Seed all apartment flags as zero with canonical-compatible legacy `property_type='commercial'`, use the shared classifier in demo/manual/cron generation, and run focused finance tests.

### Task 4: Non-Destructive Core Reruns

**Files:**
- Modify: `cloudflare/src/lib/demo/core.ts`
- Modify: `cloudflare/src/lib/demo/__tests__/core.integration.test.ts`

**Interfaces:**
- Existing deterministic rows keep request workflow, meeting workflow, vote choice/time, agenda decision totals, protocol signatures, announcement active/expiry/priority and chat channel/message lifecycle state.

- [ ] Add a failing mutation-before-rerun integration test spanning requests, meetings, agenda/votes/protocol, announcements, channels and messages.
- [ ] Restrict conflict updates to descriptive/reference fields; use `DO NOTHING` for immutable event/message/vote rows.
- [ ] Prove second-run counts remain stable and all mutated values survive.
- [ ] Update `.superpowers/demo-core-report.md`, run focused demo integration, full backend tests, backend `tsc --noEmit` and `git diff --check`.
