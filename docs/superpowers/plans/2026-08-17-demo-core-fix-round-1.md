# Demo Core Fix Round 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Constrain passwordless demo sessions to presentation-safe behavior while correcting deterministic core actors, apartment semantics, seed retirement, login matching, and provision diagnostics.

**Architecture:** A signed `demo_session: true` JWT claim is preserved by verification and mapped to `User.isDemoSession`. A pure central route-template policy runs in the API dispatcher before handlers and allows reads plus a small workflow mutation allowlist only for authenticated demo sessions whose JWT and database tenant resolve to slug `demo`. Seeder fixes remain in `lib/demo/core.ts`; login and provision diagnostics remain in `routes/users/demo.ts`.

**Tech Stack:** TypeScript, Web Crypto HMAC JWT, custom Fetch router, Vitest, SQLite CLI integration fixture.

**Spec:** `docs/superpowers/specs/2026-08-16-demo-presentation-tenant-design.md`

## Global Constraints

- Strict red-green-refactor TDD for every behavior change.
- No questions, subagents, commits, deploys, migrations, or production access.
- Preserve ordinary JWT and impersonation claims.
- Demo origin routes tenant discovery only; the signed claim is the authorization boundary.
- Demo denials are bilingual `403` responses with `Cache-Control: no-store`.

---

### Task 1: Signed Demo Capability And Central Policy

**Files:**
- Create: `cloudflare/src/middleware/demoSession.ts`
- Modify: `cloudflare/src/utils/crypto.ts`
- Modify: `cloudflare/src/types.ts`
- Modify: `cloudflare/src/middleware/auth.ts`
- Modify: `cloudflare/src/index.ts`
- Test: `cloudflare/src/__tests__/auth.test.ts`
- Test: `cloudflare/src/__tests__/middleware.test.ts`

**Interfaces:**
- Produces: `JwtPayload.demo_session?: true`, `User.isDemoSession?: true`.
- Produces: `enforceDemoSessionPolicy(request, user, routePath): Response | null`.

- [ ] Add failing JWT tests proving a signed boolean claim survives verification, malformed claims are ignored, and impersonation remains intact.
- [ ] Add failing auth tests proving only a JWT pinned to the active `demo` tenant yields `isDemoSession`.
- [ ] Add failing policy tests proving GET/HEAD and the exact request/chat/guest/marketplace presentation mutations pass while password/users/settings/tenant/finance/delete/super-admin mutations return bilingual no-store `403`; ordinary users pass unchanged.
- [ ] Add the claim/type mapping, exact tenant validation, pure policy allowlist, and dispatcher guard.
- [ ] Run the focused auth/middleware tests until green.

### Task 2: Trusted Demo Login Rate Bucket And Exact Role Match

**Files:**
- Modify: `cloudflare/src/middleware/rateLimit.ts`
- Modify: `cloudflare/src/index.ts`
- Modify: `cloudflare/src/routes/users/demo.ts`
- Test: `cloudflare/src/routes/users/__tests__/demo.test.ts`
- Test: `cloudflare/src/__tests__/middleware.test.ts`

**Interfaces:**
- Produces: `getRateLimitIdentifier(request, user, endpoint): string` with forced IP identity for `POST:/api/auth/demo-login`.
- Demo JWT payload includes `{ demo_session: true }` and remains 1,800 seconds.

- [ ] Add failing tests proving a bearer user cannot create a separate demo-login bucket and the route remains 5/minute.
- [ ] Add failing route tests for the signed capability and exact descriptor role/specialization matching, including `null` specialization.
- [ ] Implement endpoint-aware rate identity and exact login checks without selecting password columns.
- [ ] Run focused rate and demo route tests until green.

### Task 3: Deterministic Actor, Residential Apartments, And Seed Retirement

**Files:**
- Modify: `cloudflare/src/lib/demo/core.ts`
- Modify: `cloudflare/src/lib/demo/__tests__/core.integration.test.ts`
- Modify: `cloudflare/src/routes/users/seed.ts`
- Modify: `cloudflare/src/routes/users/__tests__/seed-deprecation.test.ts`

**Interfaces:**
- Secondary actor is always deterministic ID `demoId(tenantId, 'actor:resident-secondary')` and login `demo-resident-2`.
- Residential apartments persist the live enum `property_type='non_commercial'` and `is_commercial=0` while retaining private ownership.

- [ ] Add failing SQLite tests proving unrelated residents remain unchanged, wrong-tenant/global login conflicts fail without writes, and all six homes use residential/non-commercial semantics with coherent owner/user area links.
- [ ] Add a failing route test proving `/api/seed` always returns `410` without hashing or database access.
- [ ] Replace arbitrary resident selection with exact scoped conflict validation and deterministic upsert; correct apartment columns; retire generic seed execution.
- [ ] Run focused integration and seed tests until green within the existing 60-second timeout.

### Task 4: Sanitized Provision Diagnostics And Final Gates

**Files:**
- Modify: `cloudflare/src/lib/demo/provision.ts`
- Modify: `cloudflare/src/routes/users/demo.ts`
- Modify: `cloudflare/src/routes/users/__tests__/demo.test.ts`
- Modify: `.superpowers/demo-core-report.md`

**Interfaces:**
- `DemoProvisionError` exposes completed phases plus a non-sensitive phase/code diagnostic.
- Exactly one structured route log contains `{ tenantId, phase, code }`, without raw error or duplicate stack output.

- [ ] Add a failing route/provision test that captures logging and rejects raw messages/stacks or duplicate log calls.
- [ ] Remove inner raw logging and emit one sanitized structured log at the route boundary.
- [ ] Update the report with capability policy, deterministic actor, residential semantics, and final counts.
- [ ] Run focused demo tests, full backend tests, backend `tsc --noEmit`, frontend `tsc --noEmit`, and `git diff --check`.
