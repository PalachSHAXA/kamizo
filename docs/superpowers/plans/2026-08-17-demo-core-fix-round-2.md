# Demo Core Fix Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close demo-session path/rate/identity disclosure gaps while preserving all tenant-scoped presentation journeys.

**Architecture:** The central guard canonicalizes route templates before applying deny-first sensitive path rules and a presentation-domain mutation allowlist. Demo login keeps the existing route/IP limiter and adds a synchronous process-wide fixed-window limiter keyed only by tenant and allowlisted role. Public role responses are projected to a minimal DTO after exact database role/specialization validation.

**Tech Stack:** TypeScript, custom Fetch router, Web Crypto JWT, Vitest, React API types.

**Spec:** `docs/superpowers/specs/2026-08-16-demo-presentation-tenant-design.md`

## Global Constraints

- Strict red-green-refactor TDD.
- No questions, subagents, commits, deploys, migrations, or production access.
- Preserve ordinary JWT behavior and signed `demo_session` capability behavior.
- Security decisions use request method plus canonical route template, never Origin or query parameters.

---

### Task 1: Canonical Demo Capability Policy

**Files:**
- Modify: `cloudflare/src/middleware/demoSession.ts`
- Modify: `cloudflare/src/middleware/__tests__/demoSession.test.ts`

**Interfaces:**
- Keeps `enforceDemoSessionPolicy(request, user, routePath): Response | null`.
- Canonical path decoding rejects malformed or sensitive encoded variants.

- [ ] Add failing table tests for exact/prefix/encoded/query super-admin paths, global metrics/monitoring GETs, password/reset routes and method variants.
- [ ] Add failing table tests allowing request, meeting, announcement/chat, marketplace, rental/listing, guest, vehicle, training and note mutations, including DELETE where the domain route supports it.
- [ ] Implement canonicalization, deny-first sensitive path rules, sensitive non-domain mutation rules and presentation-domain mutation prefixes.
- [ ] Run the focused policy suite until green and confirm ordinary users remain unaffected.

### Task 2: Process-Atomic Demo Login Limits

**Files:**
- Create: `cloudflare/src/middleware/demoLoginRateLimit.ts`
- Create: `cloudflare/src/middleware/__tests__/demoLoginRateLimit.test.ts`
- Modify: `cloudflare/src/routes/users/demo.ts`
- Modify: `cloudflare/src/routes/users/__tests__/demo.test.ts`

**Interfaces:**
- Produces `checkDemoLoginProcessLimit(tenantId, roleKey, now?): { allowed: boolean; reason?: 'global' | 'role'; retryAfterSec: number }`.
- Tenant-global cap: 30 attempts/60 seconds; per-role cap: 8 attempts/60 seconds.

- [ ] Add failing unit tests proving many spoofed-IP attempts share one tenant-global count, one role cannot exceed its cap, windows reset, and denied checks do not partially consume another bucket.
- [ ] Add a failing route test proving limiter denial returns cache-disabled `429` before user lookup/JWT issuance.
- [ ] Implement one synchronous module-level fixed-window state transition independent of request headers and call it after tenant/body role resolution but before user lookup.
- [ ] Preserve the existing `POST:/api/auth/demo-login` IP route bucket at 5/minute and run focused rate/route tests.

### Task 3: Minimal Exact Role DTO And UI Awareness

**Files:**
- Modify: `cloudflare/src/routes/users/demo.ts`
- Modify: `cloudflare/src/routes/users/__tests__/demo.test.ts`
- Modify: `src/frontend/src/types/auth.ts`
- Modify: `src/frontend/src/services/api/auth.ts`
- Modify: `src/frontend/src/services/api/__tests__/auth-demo.test.ts`
- Modify: `src/frontend/src/pages/__tests__/LoginPage.demo.test.tsx`
- Modify: `.superpowers/demo-core-report.md`

**Interfaces:**
- Public role DTO: `{ roleKey, role, specialization, primary, order }` only.
- Demo login response: `{ user, token, demoSession: true }`.

- [ ] Add failing backend tests proving role list and status require exact stored role/specialization and public role JSON contains no login/name/requiredFeature.
- [ ] Add failing frontend API tests for the reduced DTO and `demoSession: true` response mapping.
- [ ] Project exact available descriptors to the public DTO, harden status matching, return UI awareness flag, and update frontend types/fixtures.
- [ ] Document nginx trusted `CF-Connecting-IP`/forwarded-header dependency and process-local cap limitations in the report.
- [ ] Run focused suites, full backend tests, backend/frontend `tsc --noEmit`, relevant frontend tests and `git diff --check`.
