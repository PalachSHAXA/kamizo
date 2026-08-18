# Isolated End-to-End Tests

Run the complete suite from `src/frontend`:

```bash
npm run test:e2e:isolated
```

## Isolation Guarantees

- The production Worker source runs locally through Wrangler.
- Every Playwright phase gets a unique directory under the OS temp directory.
- D1, KV, R2, and the `CONNECTION_MANAGER` Durable Object are local; no binding has `remote: true`.
- D1 starts from `cloudflare/schema.sql`, runs production `runMigrations()`, then applies the checked-in migration plan in `e2e/isolated/schema-plan.json`.
- `prod-schema-contract.json` is validated from local `PRAGMA table_info` results before `seed.mjs` runs. Seed SQL contains INSERT data only; schema drift fails setup visibly.
- JWT secrets, role tokens, Wrangler config, and SQLite state exist only in that run directory.
- Browser traffic for `https://api.kamizo.uz` is transported to `http://127.0.0.1:8787`; responses still come from the real Worker and D1.
- Browser redirects are not followed by the transport; external `Location` targets are rejected. Other browser HTTP(S) origins are denied.
- The test-only Worker entrypoint replaces Worker global `fetch` with a localhost-only, redirect-aware guard. Direct and redirect-mediated external requests fail before leaving the machine.
- Service workers are blocked so they cannot bypass Playwright routing.
- WebSocket attempts to the production API origin are closed locally.
- SIGINT, SIGTERM, startup errors, and normal Playwright shutdown terminate child processes and remove the run directory.
- Unix wrappers run in owned process groups; cleanup sends group TERM then bounded KILL so npm/Wrangler/Vite grandchildren cannot survive. Windows falls back to `taskkill /T /F`.
- Run directories are mode `0700`; `.dev.vars` and token files are mode `0600`. Every harness HTTP fetch has an abort timeout.

## Phases

The command always runs all phases sequentially and returns failure if any phase fails:

1. `playwright.isolated.config.ts`: suites 01-06 against real local authentication, API, D1, and frontend state.
2. `playwright.demo-isolated.config.ts`: suite 08 provisions all demo phases through the local Worker, then verifies role and cross-role presentation journeys.
3. `playwright.rentals-isolated.config.ts`: suite 07 rental states, required interactions, and overflow assertions.
4. `playwright.marketplace-isolated.config.ts`: suite 07 marketplace states and overflow assertions.

The split prevents rental and marketplace development fixtures from replacing authenticated role state or each other.

Self-viewport adaptive matrices are tagged `@self-viewport` and run only in the desktop project. Project-driven smoke assertions still run once per intended desktop/tablet/mobile project, avoiding a Cartesian product.

CI runs the harness as a prerequisite and executes core/demo/rentals/marketplace as independent matrix jobs. Deploy retains the same configs sequentially through the canonical command.

## Focused Commands

```bash
npm run test:e2e:harness
npx playwright test --config playwright.isolated.config.ts e2e/04-create-meeting.spec.ts
npx playwright test --config playwright.demo-isolated.config.ts
npx playwright test --config playwright.rentals-isolated.config.ts
npx playwright test --config playwright.marketplace-isolated.config.ts
```

The core phase requires Chromium only. CI installs it with `npx playwright install --with-deps chromium`.

## Artifacts

Failures retain traces, screenshots, and video under `test-results/`. HTML reports are written to `playwright-report-isolated/`, `playwright-report-demo/`, `playwright-report-rentals/`, and `playwright-report-marketplace/`.

## Current Runtime Boundary

The test entrypoint binds a stateful `E2EConnectionManager` Durable Object. It persists tenant/channel subscriptions and a bounded broadcast history, validates payloads, rejects explicit tenant mismatches, and reports delivery counts. Harness-only routes expose/reset this state for contract assertions. WebSocket upgrades deliberately return `501`; socket lifecycle and VPS process fan-out remain explicit residual limitations.

Miniflare R2 verifies `put/get/delete` and metadata used by contract routes. Production VPS stores contracts through a filesystem shim, so filesystem permissions, disk exhaustion, and cross-process persistence remain VPS-specific integration risks.

## Explicit Skips

- Desktop chat input zoom: not applicable to iOS.
- Four KPI-grid cases below the `lg` breakpoint: not applicable to that assertion.

## Readiness Budget

Harness integration readiness has a 240-second wall-clock deadline matching Playwright `webServer`. Each fetch attempt remains capped at 2 seconds with a 500ms retry pause. Healthy runs return immediately; refused connections cannot exhaust the budget early by consuming attempts too quickly.
# Demo Gate

The `demo.kamizo.uz` visual gate is cosmetic presentation chrome, not an
authorization boundary. It is inferred synchronously from the exact hostname
before tenant configuration loads; the isolated demo harness sets
`VITE_DEMO_TENANT=1` to exercise the same no-flash boot path on loopback.
Authorization is enforced by the signed short-lived `demo_session` JWT claim
and the backend demo-session capability policy.
