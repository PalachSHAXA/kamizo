# API Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close confirmed meetings and requests authorization bypasses without changing the database schema or interrupting active voting.

**Architecture:** Keep policy decisions in small domain-local pure helpers and enforce them in the existing route handlers. Add focused Vitest coverage for policy decisions plus route wiring where authentication and tenant context are the behavior under test.

**Tech Stack:** Node.js 20, TypeScript, custom Fetch router, D1-compatible SQLite API, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-08-13-api-security-hardening-design.md`

## Global Constraints

- Do not change the database schema or production data.
- Every meeting and request SQL statement touched by this work must use the request tenant ID.
- Do not enforce the currently non-operational OTP requirement; ignore client verification claims and store `login` plus `otp_verified=0`.
- `resident` and `commercial_owner` may vote; `tenant` may not vote.
- `resident`, `tenant`, and `commercial_owner` share request-owner cancellation rules.
- Do not commit, push, or deploy unless the user explicitly requests it.
- Do not modify unrelated existing worktree changes.

---

### Task 1: Meeting List And Voting Security

**Files:**
- Create: `cloudflare/src/routes/meetings/security.ts`
- Create: `cloudflare/src/routes/meetings/__tests__/security.test.ts`
- Modify: `cloudflare/src/routes/meetings/crud-list.ts`
- Modify: `cloudflare/src/routes/meetings/voting.ts`

**Interfaces:**
- Produces: `isMeetingVoterRole(role: string): boolean`
- Produces: `parseVoteChoice(value: unknown): 'for' | 'against' | 'abstain' | null`
- Consumes: existing `getUser`, `getTenantId`, `requireFeature`, and D1-compatible DB methods.

- [ ] **Step 1: Write failing policy tests**

Cover these exact expectations in `security.test.ts`:

```ts
expect(isMeetingVoterRole('resident')).toBe(true)
expect(isMeetingVoterRole('commercial_owner')).toBe(true)
expect(isMeetingVoterRole('tenant')).toBe(false)
expect(isMeetingVoterRole('executor')).toBe(false)
expect(parseVoteChoice('for')).toBe('for')
expect(parseVoteChoice('against')).toBe('against')
expect(parseVoteChoice('abstain')).toBe('abstain')
expect(parseVoteChoice('yes')).toBeNull()
expect(parseVoteChoice(null)).toBeNull()
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npx vitest run src/routes/meetings/__tests__/security.test.ts`

Expected: FAIL because `security.ts` and its exports do not exist.

- [ ] **Step 3: Implement the minimal pure policy helpers**

Use an explicit role set and explicit vote-choice switch. Do not accept truthy values, aliases, or client-provided verification state.

- [ ] **Step 4: Add failing route-wiring tests**

Capture registered handlers by mocking the meetings helper barrel. Verify:

```ts
expect((await anonymousListResponse).status).toBe(401)
expect((await tenantlessListResponse).status).toBe(403)
expect((await tenantRoleVoteResponse).status).toBe(403)
expect((await invalidChoiceResponse).status).toBe(400)
expect((await foreignAgendaResponse).status).toBe(404)
```

The successful vote fixture must assert that the final vote INSERT/UPDATE binds
`'login'` and `0` even when the request body contains
`verification_method: 'otp'` and `otp_verified: true`.

- [ ] **Step 5: Run the route tests and verify RED**

Run: `npx vitest run src/routes/meetings/__tests__/security.test.ts`

Expected: FAIL on the current anonymous list, role, choice, agenda, and OTP behavior.

- [ ] **Step 6: Harden meeting list and voting routes**

In `crud-list.ts`, call `getUser` before feature access, return `401` when absent,
return `403` when `getTenantId(request)` is empty, and use an unconditional
`tenant_id = ?` predicate.

In `voting.ts`, reject disallowed roles, parse `body.choice` through
`parseVoteChoice`, verify the agenda item with:

```sql
SELECT id FROM meeting_agenda_items
WHERE id = ? AND meeting_id = ? AND tenant_id = ?
```

Use the parsed choice everywhere. Bind verification method `login` and
`otp_verified=0` for inserts and updates. Keep vote area server-derived.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run: `npx vitest run src/routes/meetings/__tests__/security.test.ts`

Expected: PASS with no unhandled promise rejections.

---

### Task 2: Meeting Protocol Lifecycle Security

**Files:**
- Modify: `cloudflare/src/routes/meetings/security.ts`
- Modify: `cloudflare/src/routes/meetings/__tests__/security.test.ts`
- Modify: `cloudflare/src/routes/meetings/protocol.ts`

**Interfaces:**
- Produces: `canGenerateProtocol(role: string, status: string): boolean`
- Produces: `canApproveProtocol(role: string, status: string): boolean`

- [ ] **Step 1: Write failing lifecycle tests**

Assert generation is allowed for `admin`, `director`, and `manager` only in
`voting_closed` or `results_published`. Assert approval is allowed only for
`admin` and `director` in `protocol_generated`. Assert `protocol_approved`
cannot be generated or approved again.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npx vitest run src/routes/meetings/__tests__/security.test.ts`

Expected: FAIL because lifecycle helpers do not exist.

- [ ] **Step 3: Implement policy helpers and route guards**

Fetch meeting status and protocol ID with an unconditional tenant predicate.
Reject invalid roles with `403` and invalid states with `400`. Scope protocol
delete, update, and final reads through the already tenant-scoped meeting. Add
`tenant_id = ?` to meeting status updates so a stale or foreign ID cannot be
updated.

- [ ] **Step 4: Make generation replacement safe**

Do not delete an old protocol before all generation data has been prepared.
Never delete or replace a protocol when status is `protocol_approved`.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npx vitest run src/routes/meetings/__tests__/security.test.ts`

Expected: PASS.

---

### Task 3: Request Assignment And Generic Update Security

**Files:**
- Create: `cloudflare/src/routes/requests/security.ts`
- Create: `cloudflare/src/routes/requests/__tests__/security.test.ts`
- Modify: `cloudflare/src/routes/requests/assignment.ts`

**Interfaces:**
- Produces: `canAssignRequests(role: string): boolean`
- Produces: `hasForbiddenWorkflowFields(body: Record<string, unknown>): boolean`

- [ ] **Step 1: Write failing policy tests**

Assert assignment is allowed only for `admin`, `director`, `manager`,
`dispatcher`, and `department_head`. Assert `status` and `executor_id` are
forbidden generic PATCH fields even when their values are empty or null.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npx vitest run src/routes/requests/__tests__/security.test.ts`

Expected: FAIL because `security.ts` does not exist.

- [ ] **Step 3: Implement helpers and assignment guard**

Replace the current executor-inclusive role expression with
`canAssignRequests(user.role)`. Preserve the department specialization check
and atomic assignment update.

- [ ] **Step 4: Reject workflow fields in generic PATCH**

Parse the body before building updates. Return `400` when either forbidden key
is present. Preserve rating and feedback support. Return `400` when no mutable
field remains instead of executing an `updated_at`-only write.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npx vitest run src/routes/requests/__tests__/security.test.ts`

Expected: PASS.

---

### Task 4: Request Cancellation And Rating Security

**Files:**
- Modify: `cloudflare/src/routes/requests/security.ts`
- Modify: `cloudflare/src/routes/requests/__tests__/security.test.ts`
- Modify: `cloudflare/src/routes/requests/approval.ts`

**Interfaces:**
- Produces: `isRequestOwnerRole(role: string): boolean`
- Produces: `canManagementCancel(role: string): boolean`
- Produces: `canOwnerCancel(status: string): boolean`
- Produces: `canRateOwnedRequest(status: string): boolean`

- [ ] **Step 1: Write failing request-owner tests**

Assert all three owner roles share the early-state cancellation policy. Assert
executor, security, advertiser, and marketplace roles cannot use management
cancellation. Assert rating is accepted only in `pending_approval` or
`completed` and only with integer rating 1 through 5.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npx vitest run src/routes/requests/__tests__/security.test.ts`

Expected: FAIL because cancellation/rating helpers do not exist.

- [ ] **Step 3: Enforce cancellation roles and ownership**

Load the request by ID and tenant. Owner roles must match `resident_id` and an
allowed early status. Management roles are `admin`, `director`, `manager`,
`dispatcher`, and `department_head`; they may cancel non-completed requests.
All other roles receive `403`. Add `tenant_id` to the request history INSERT.

- [ ] **Step 4: Make legacy rating non-transitional**

Validate integer rating 1 through 5. Load an owned, tenant-scoped request in an
allowed state. Update only `rating`, `feedback`, and `updated_at`; do not change
status. Return `404` for a missing/foreign request and `400` for a disallowed
state or invalid rating.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npx vitest run src/routes/requests/__tests__/security.test.ts`

Expected: PASS.

---

### Task 5: Integration Verification And Independent Review

**Files:**
- Review all files changed in Tasks 1 through 4.

- [ ] **Step 1: Run backend focused and full tests**

Run:

```bash
npx vitest run src/routes/meetings/__tests__/security.test.ts src/routes/requests/__tests__/security.test.ts
npm test
```

Expected: all focused and existing backend tests pass.

- [ ] **Step 2: Run backend TypeScript validation**

Run: `npx tsc --noEmit`

Expected: no new errors. Record any pre-existing errors separately.

- [ ] **Step 3: Run frontend validation required by project policy**

Run from `src/frontend`:

```bash
npx tsc -p tsconfig.app.json --noEmit
npm run build
```

Expected: build succeeds. Record pre-existing type errors separately; do not
modify unrelated frontend files in this backend-only package.

- [ ] **Step 4: Independent security review**

Reviewer checks role matrices, every touched SQL statement for tenant scoping,
state transitions, test quality, and compatibility with the approved spec.
Critical and high findings must be fixed before completion.

- [ ] **Step 5: Re-run affected tests after fixes**

Run focused tests, full backend tests, backend TypeScript validation, frontend
TypeScript validation, and frontend build again. Request re-review of changed
areas.

- [ ] **Step 6: Report exact delivery state**

Report separately: code written, tests passed/failed, independent review,
commit state, push state, deployment state, and production verification state.
