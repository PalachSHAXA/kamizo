# Isolated E2E Harness Implementation Plan

> **For agentic workers:** Execute inline. Subagents, commits, production access, and deploys are prohibited for this task.

**Goal:** Run Kamizo Playwright coverage against the real local Worker and a unique disposable D1 database.

**Architecture:** A Playwright web server launches a Node lifecycle harness that initializes local Wrangler bindings, seeds D1, starts Worker and Vite, and cleans up. A shared Playwright fixture redirects the frontend's fixed production API origin to the real local Worker.

**Tech Stack:** Playwright, TypeScript, Node.js 20, Wrangler 4, Miniflare D1/KV, Vite.

**Spec:** `docs/superpowers/specs/2026-08-15-isolated-e2e-harness-design.md`

## Global Constraints

- Do not modify application business code.
- Do not access or mutate production.
- Do not use production secrets or cached JWTs.
- Do not commit or deploy.
- Use one bounded local Worker and one unique D1 database per invocation.

---

### Task 1: Local Harness Contract

**Files:**
- Create: `src/frontend/e2e/isolated/harness.test.ts`
- Create: `src/frontend/e2e/isolated/harness.mjs`
- Create: `src/frontend/e2e/isolated/seed.mjs`

**Interfaces:**
- Produces: `createRunContext()`, `waitForHttp()`, `stopChildren()`, and `buildSeedSql()` for the executable harness.

- [ ] Write tests proving unique run directories, deterministic PBKDF2-compatible seed SQL, SQL escaping, bounded readiness failure, and idempotent cleanup.
- [ ] Run the focused tests and verify they fail because the modules do not exist.
- [ ] Implement the minimal helpers and rerun the focused tests.

### Task 2: Real Worker And Disposable D1 Lifecycle

**Files:**
- Modify: `src/frontend/e2e/isolated/harness.mjs`
- Create: `src/frontend/e2e/isolated/wrangler-config.mjs`

**Interfaces:**
- Consumes: helper contracts from Task 1.
- Produces: an executable process that initializes schema/seed, launches Wrangler and Vite, emits readiness, handles signals, and removes its temp directory.

- [ ] Add an integration check that starts the harness and requests local health/login endpoints.
- [ ] Verify the check fails before lifecycle implementation.
- [ ] Generate local-only Wrangler config and run `wrangler d1 execute --local --persist-to` for schema and seed.
- [ ] Validate required local columns through `PRAGMA table_info` before seeding.
- [ ] Start Wrangler and Vite, enforce startup deadlines, and clean up on every exit path.
- [ ] Rerun the integration check and verify a fresh login returns a JWT.

### Task 3: Playwright Isolation Fixture And Authentication

**Files:**
- Create: `src/frontend/e2e/fixtures.ts`
- Modify: `src/frontend/e2e/global-setup.ts`
- Modify: `src/frontend/e2e/helpers/auth.ts`
- Create: `src/frontend/playwright.isolated.config.ts`

**Interfaces:**
- Produces: isolated `test`/`expect`, per-run token cache, local API helper, and suite/project selection.

- [ ] Add a fixture test that fails if an API request can reach `api.kamizo.uz`.
- [ ] Implement request proxying to `127.0.0.1:8787` and block unhandled production-origin requests.
- [ ] Replace six-day token reuse with run-directory token storage and test-only credentials.
- [ ] Configure Playwright `webServer`, bounded retries, and targeted viewport projects.

### Task 4: Migrate Seven Suites

**Files:**
- Modify: `src/frontend/e2e/01-login-roles.spec.ts`
- Modify: `src/frontend/e2e/02-resident-create-request.spec.ts`
- Modify: `src/frontend/e2e/03-meetings-and-rbac.spec.ts`
- Modify: `src/frontend/e2e/04-create-meeting.spec.ts`
- Modify: `src/frontend/e2e/05-request-photos.spec.ts`
- Modify: `src/frontend/e2e/06-adaptive-smoke.spec.ts`
- Modify: `src/frontend/e2e/07-rentals-overflow.spec.ts`

**Interfaces:**
- Consumes: isolated `test`/`expect` fixture.
- Produces: no direct production origin usage in any suite.

- [ ] Change suite imports to the isolated fixture.
- [ ] Replace direct localhost literals with the shared local API constant.
- [ ] Run each destructive/API suite independently, then the UI/adaptive suites.
- [ ] Fix only harness, fixture, seed, or test assumptions; do not change business code.

### Task 5: Command, CI, Documentation, And Verification

**Files:**
- Modify: `src/frontend/package.json`
- Modify: `src/frontend/package-lock.json`
- Modify: `.github/workflows/deploy.yml`
- Create: `src/frontend/e2e/README.md`

**Interfaces:**
- Produces: `npm run test:e2e:isolated` and CI execution instructions.

- [ ] Add the canonical package command and install backend dependencies in CI before E2E.
- [ ] Document isolation guarantees, local prerequisites, artifacts, and troubleshooting.
- [ ] Run helper tests, all isolated E2E suites, frontend/backend type checks, and frontend build.
- [ ] Record exact pass/fail/skip counts and any executable remaining roadmap in the final report.
