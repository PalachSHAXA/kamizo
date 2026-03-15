# Project Audit Report

**Project:** Kamizo (UK-CRM / Property Management Platform)
**Date:** 2026-03-14
**Auditor:** Claude (Cowork)

---

## Executive Summary

Kamizo is a multi-tenant property management platform built on React + Vite (frontend) and Cloudflare Workers + D1 SQLite (backend), serving residential communities in Uzbekistan with Russian/Uzbek language support. The codebase totals ~91,456 lines of TypeScript across 191 source files, with a 16,533-line monolithic backend handler and a well-structured frontend of 69,528 lines.

**Overall Health Score: 5.5 / 10**

The project demonstrates strong architectural intuition -- clean frontend structure with Zustand stores, facade patterns for backward compatibility, lazy-loaded routes, optimistic updates, and a comprehensive database schema of 60+ tables. The CI/CD pipeline via GitHub Actions is functional, and the Husky pre-commit hooks enforce TypeScript compilation and secrets scanning.

However, the project suffers from several critical deficiencies that must be resolved before production: (1) **hardcoded encryption key in version control** used for reversible password storage, (2) **zero test files** across the entire codebase creating extreme regression risk, and (3) **weak multi-tenancy enforcement** where tenant isolation is conditional rather than mandatory, allowing potential cross-tenant data leakage.

**Top 3 Strengths:** Excellent frontend architecture with optimistic updates and error boundaries; comprehensive database schema with 140+ indexes; functional CI/CD with pre-commit hooks.

---

## Critical Issues (fix immediately)

1. **Hardcoded encryption key in source control** -- `cloudflare/wrangler.toml` line 17: `ENCRYPTION_KEY = "K4m1z0-S3cur3-Encrypt10n-2026!"` is committed to git. Anyone with repo access can decrypt all stored passwords. Move to Cloudflare Secrets immediately.

2. **Reversible password storage** -- `cloudflare/schema.sql` line 9: `password_plain TEXT` column stores AES-GCM encrypted (not hashed) passwords. Combined with #1, this exposes every user credential. Remove this column entirely and use password resets instead.

3. **SQL injection via LIKE interpolation** -- `cloudflare/src/index.ts` line ~12786: notification tag value is interpolated directly into a LIKE pattern (`%"tag":"${notification.tag}"%`) instead of being parameterized. Use `json_extract(data, '$.tag') = ?` with bound parameters.

4. **Conditional multi-tenancy filtering** -- Throughout `cloudflare/src/index.ts`: tenant_id filtering uses pattern `if (tenantId) { whereClause += ... }`, making isolation optional. Routes like `DELETE /api/users/:id` (line ~1085) and building cascade deletes (lines ~4666-4684) lack tenant verification entirely.

5. **WebSocket authentication bypass** -- `cloudflare/src/index.ts` lines 63-102: WebSocket endpoint accepts raw user ID as query parameter token, bypasses `getUser()` middleware, skips tenant validation, and exposes tokens in URL logs.

6. **Rate limiter fails open** -- `cloudflare/src/middleware/rateLimit.ts` lines 54-57: on KV error, returns `allowed: true` with 99 remaining. Attackers can exploit KV degradation for brute-force attacks. Must fail closed.

7. **Zero test coverage** -- No test files exist anywhere in the project (0 `.test.*` or `.spec.*` files). No jest/vitest configuration. Any refactoring or feature addition carries extreme regression risk.

8. **No LICENSE file** -- Repository has no license file, making the code legally ambiguous for contributors and deployment.

---

## Warnings (fix soon)

1. **Monolithic backend handler** -- `cloudflare/src/index.ts` at 16,533 lines contains all ~200+ routes in a single file. Split into route modules (`routes/auth.ts`, `routes/users.ts`, etc.).

2. **Missing database indexes for common queries** -- No composite indexes on `(tenant_id, role)` for users, `(channel_id, created_at)` for chat_messages, `(user_id, created_at)` for notifications, `(resident_id, status)` for requests.

3. **Training tables lack tenant_id** -- Tables `training_partners`, `training_proposals`, `training_votes`, `training_registrations`, `training_feedback`, `training_notifications` in schema.sql have no `tenant_id` column, breaking multi-tenancy.

4. **N+1 query in push notifications** -- `cloudflare/src/index.ts` lines ~2603-2615 + ~12724: broadcasting to N residents fires N separate `SELECT * FROM push_subscriptions` queries. Batch with `WHERE user_id IN (...)`.

5. **Pagination defaults too permissive** -- `cloudflare/src/utils/helpers.ts` line ~34: default limit 500, max 5000. Cloudflare Workers have CPU time limits. Reduce to default 50, max 500.

6. **Minimal accessibility** -- Frontend has only ~3 ARIA attributes total. No `aria-label`, `aria-modal`, `role="dialog"`, focus traps, or keyboard navigation. Fails WCAG 2.1 Level AA.

7. **430 uses of `any` type** -- Across frontend TypeScript files. While some are acceptable for API response mapping, many should be properly typed.

8. **Inconsistent migration file naming** -- `cloudflare/migrations/` uses mixed formats: `0001_`, `001_`, `003_`, `0008_`, with suffixes like `.applied`, `.disabled`, `.skip`. Standardize naming convention.

9. **No external monitoring/observability** -- `cloudflare/src/monitoring.ts` exists but uses in-memory metrics lost on restart. No Sentry, Datadog, or Cloudflare Analytics integration.

10. **Hardcoded i18n strings** -- Frontend uses inline ternary pattern (`language === 'ru' ? '...' : '...'`) scattered throughout components. Some strings are hardcoded in Russian only (e.g., requestStore.ts line ~179: "Novaya zayavka").

11. **No empty states in list components** -- Frontend lists don't show "no data" messages when results are empty.

12. **CORS includes localhost origins** -- `cloudflare/src/middleware/cors.ts` lines 8-9 include `http://localhost:5173` and `http://localhost:3000` in production config.

13. **Database ID exposed in wrangler.toml** -- `database_id = "e83916ec-941f-420e-86fc-8760dd430aec"` and KV namespace ID committed to source control.

14. **Data residency compliance risk** -- Cloudflare Workers deploy globally (US/EU edge). Uzbekistan data protection law may require local data storage. Evaluate compliance requirements.

---

## Strengths

1. **Excellent frontend architecture** -- Clean separation into components, pages, stores, services, types, and utils. Facade pattern (crmStore, dataStore) maintains backward compatibility while allowing modular growth. 60+ routes lazy-loaded with React.lazy/Suspense.

2. **Production-grade error handling on frontend** -- ErrorBoundary.tsx (328 lines) includes error logging, count tracking to prevent infinite loops, user-friendly recovery UI, and optional monitoring integration.

3. **Optimistic updates with rollback** -- requestStore and vehicleStore implement optimistic UI updates with automatic rollback on API failure -- a mature pattern for perceived performance.

4. **Comprehensive database schema** -- 60+ tables with 140+ indexes covering buildings, apartments, meters, meetings (with UzR voting law compliance), CRM, chat, marketplace, work orders, and more.

5. **CI/CD pipeline functional** -- GitHub Actions workflow handles frontend build, asset copy, and Cloudflare Workers deploy on push to main. Husky pre-commit runs TypeScript checks and secrets scanning.

6. **API caching layer** -- Frontend implements request deduplication + TTL-based cache (SHORT: 10s, MEDIUM: 60s, LONG: 120s) preventing redundant network calls.

7. **WebSocket real-time sync** -- WebSocket-based sync for chat and notifications with exponential backoff on reconnection, replacing polling for most real-time features.

8. **Zustand store architecture** -- 21 focused stores with proper TypeScript interfaces, selective subscriptions, and clear responsibility boundaries.

9. **Vite build optimization** -- Code splitting isolates heavy libraries (exceljs, recharts, docx, qr-scanner) into separate chunks. Console.log stripped in production. Source maps available for debugging.

10. **Multi-language support** -- Russian and Uzbek with centralized label constants (STATUS_LABELS, SPECIALIZATION_LABELS) for enums.

---

## Detailed Findings

### 1. Code & Architecture

**Project Structure:**
The project follows a clean top-level organization: `src/frontend/` (React+Vite), `cloudflare/` (Workers backend), `mobile/` (mobile app), `docs/`, `scripts/`, `load-tests/`, and `audit/`. The frontend internal structure is excellent with dedicated folders for components, pages, stores, services/api, types, and utils.

The backend, however, is a single monolithic file (`cloudflare/src/index.ts` at 16,533 lines) containing all route handlers, business logic, and data access. Supporting modules exist (`auth.ts`, `cors.ts`, `rateLimit.ts`, `cache-local.ts`, `helpers.ts`, `ConnectionManager.ts`, `monitoring.ts`) but the core handler needs splitting.

**Tech Stack Assessment:**
React 18.3 + Vite 7.2.4 + Zustand 5 + Tailwind CSS is a modern, appropriate stack for this SPA. Cloudflare Workers + D1 is a reasonable choice for edge deployment but imposes constraints (SQLite, CPU time limits, no persistent connections). The stack is up to date with no critically outdated dependencies.

**Code Quality:**
Frontend code quality is high -- zero dead code blocks, zero commented-out code, consistent naming conventions (camelCase variables, PascalCase components). Backend code quality is functional but suffers from the monolith problem. Error handling in the backend uses generic catch blocks without structured logging or request correlation IDs. Frontend ErrorBoundary is production-grade.

**Security Vulnerabilities:**
See Critical Issues #1-6. Additionally: no Content-Security-Policy headers detected, no CSRF protection mentioned, file upload validation relies on MIME type checking without content inspection (`cloudflare/src/index.ts` upload handler).

**Performance:**
Frontend: good code splitting, lazy loading, memoization (23 useMemo/useCallback instances, React.memo on key components). Backend: N+1 query patterns in push notifications and user listing (subquery per row for vehicle_count), LIKE-based JSON searching instead of json_extract(), no query timeouts.

**Database Schema:**
Well-designed with 60+ tables, 140+ indexes, proper foreign keys, and meeting/voting system aligned with Uzbekistan housing law. Issues: missing composite indexes for tenant-scoped queries, inconsistent CASCADE behavior, training tables lacking tenant_id, some UNIQUE constraints missing tenant scope.

**API Design:**
RESTful conventions followed (~200+ endpoints). No API versioning (`/api/*` without version prefix). Inconsistent error response formats (some return `{error: "..."}`, others `{success: true, ...}`). Rate limiting implemented but fails open. Input validation is minimal -- Zod is a dependency but not used for request validation.

**Environment & Config:**
Encryption key hardcoded in wrangler.toml (committed). Database and KV IDs exposed. `.env.local` exists in cloudflare/ but .gitignore does cover `.env` patterns. No dev/staging/prod environment separation -- single ENVIRONMENT = "production" in wrangler.toml.

### 2. DevOps & Infrastructure

**CI/CD Pipeline:**
GitHub Actions workflow (`.github/workflows/deploy.yml`) deploys on push to main: install frontend deps, build, copy to cloudflare/public, deploy via wrangler. No staging environment. No test step (because no tests exist). No security scanning step. No build artifact caching beyond npm cache.

**Deployment:**
Multiple deployment scripts exist (`deploy.sh`, `quick-deploy.sh`, `quick-deploy.ps1`, `build-and-deploy.ps1`) for manual deployment alongside CI/CD. The scripts are functional but redundant. No Dockerfile or containerization.

**Logging & Monitoring:**
`monitoring.ts` exists but uses in-memory counters (lost on worker restart). No external monitoring service integration. Console.log/error used for backend logging with no structured format. No request tracing or correlation IDs. No alerting.

**Backup & Disaster Recovery:**
No documented backup strategy. Cloudflare D1 has automatic backups, but no off-site replication or point-in-time recovery documentation. Database schema exists in `schema.sql` and `schema_no_fk.sql` for recreation. No disaster recovery runbook.

### 3. Testing & Quality

**Test Coverage:**
Zero test files. No unit tests, integration tests, or end-to-end tests. No test runner configuration (jest, vitest, playwright, cypress). The `load-tests/` directory contains k6 load testing scripts, which is positive but insufficient.

**Linting & Formatting:**
ESLint configured with modern flat config (`eslint.config.js`) including react-hooks and typescript-eslint plugins. TypeScript strict mode enabled with `noUnusedLocals`, `noUnusedParameters`. No Prettier configuration found. Husky pre-commit hook runs TypeScript check and build.

### 4. Documentation

**README:**
`README.md` (6,743 bytes) exists with project overview. Quality is unclear without full content review, but its presence is positive.

**Additional Docs:**
`CLAUDE.md` provides excellent development guidelines (architecture, patterns, rules). `CLOUDFLARE_AUTH_INSTRUCTIONS.md` covers deployment auth. `SYSTEM_AUDIT_2025-12-31.md` and `audit-report.md` show prior audit history. `docs/` directory contains 8 files. No Swagger/OpenAPI specification. No Postman collection.

**Inline Comments:**
Backend code has minimal inline comments. Frontend has good "why" comments rather than "what" comments. Some outdated comments reference old patterns.

**Missing Documentation:**
No API documentation (Swagger/OpenAPI). No architecture decision records (ADRs). No onboarding guide for new developers. No database schema diagram. No runbook for incident response.

### 5. Product & UX

**UI Consistency:**
Tailwind CSS with custom brand color palette ensures visual consistency. Lucide-react icons used consistently. Component reuse appears good with shared UI components.

**Accessibility:**
Critical gap. Only ~3 ARIA attributes found in the entire frontend codebase. No aria-label, aria-describedby, or role attributes on interactive elements. Modals lack aria-modal, focus traps, and keyboard navigation. Not WCAG 2.1 compliant. For a property management app serving diverse residents, this is a significant concern.

**Responsive Design:**
Tailwind CSS utility classes suggest responsive design is handled, but no explicit mobile breakpoint strategy was documented. Mobile app exists separately in `mobile/` directory.

**Loading/Error/Empty States:**
Loading states: Suspense fallbacks for lazy-loaded routes. Error states: production-grade ErrorBoundary. Empty states: missing from list components -- no "no data" messages when query results are empty.

**UX Friction Points from Code:**
30-second polling for notifications (could fully use WebSocket). Large list views without pagination/virtualization. i18n inline ternaries create inconsistent language mixing if strings are missed. No skeleton loaders for perceived performance.

### 6. Business & Legal

**License:**
No LICENSE file in repository. This creates legal ambiguity about usage rights, contribution terms, and liability.

**Data Privacy:**
Application handles personal data (names, phone numbers, apartment details, passwords) for residential communities. No documented GDPR-equivalent compliance for Uzbekistan's "On Personal Data" law (2019). No data deletion/export features visible in code. No audit logging for data access. Password stored in reversible encrypted form (see Critical #2).

**Data Residency:**
Cloudflare Workers deploy to global edge network. Uzbekistan law may require personal data storage within national borders. This needs legal review.

**Localization:**
Russian and Uzbek supported via inline ternary pattern. Functional but not scalable. No i18n library (react-i18next). Adding a third language would require touching hundreds of files.

---

## Recommended Action Plan

**Phase 1 -- Security (Effort: Medium, Timeline: 1-2 weeks)**
1. Move ENCRYPTION_KEY to Cloudflare Secrets, remove from wrangler.toml (Low effort)
2. Remove password_plain column, implement password reset flow (Medium effort)
3. Fix SQL injection in notification LIKE query (Low effort)
4. Make tenant_id filtering mandatory on all tenant-scoped routes (Medium effort)
5. Fix WebSocket auth to use proper token verification (Low effort)
6. Make rate limiter fail-closed on KV errors (Low effort)

**Phase 2 -- Testing Foundation (Effort: High, Timeline: 2-4 weeks)**
7. Set up Vitest with React Testing Library (Low effort)
8. Write unit tests for all Zustand stores (Medium effort)
9. Write integration tests for critical API endpoints (auth, multi-tenancy) (Medium effort)
10. Add test step to GitHub Actions CI pipeline (Low effort)

**Phase 3 -- Code Quality (Effort: Medium, Timeline: 2-3 weeks)**
11. Split index.ts into route modules (Medium effort)
12. Add Zod validation to all API endpoints (Medium effort)
13. Standardize error response format (Low effort)
14. Add missing database indexes (Low effort)
15. Add tenant_id to training tables (Low effort)
16. Standardize migration file naming (Low effort)

**Phase 4 -- Observability & Reliability (Effort: Medium, Timeline: 2 weeks)**
17. Integrate external monitoring (Sentry or Cloudflare Analytics) (Medium effort)
18. Add structured logging with request correlation IDs (Medium effort)
19. Implement proper API versioning (/api/v1/) (Medium effort)
20. Reduce pagination defaults to 50/500 (Low effort)

**Phase 5 -- Compliance & UX (Effort: High, Timeline: 4-6 weeks)**
21. Add LICENSE file (Low effort)
22. Legal review of data residency requirements (High effort)
23. Implement WCAG 2.1 Level AA accessibility (High effort)
24. Migrate i18n to react-i18next (Medium effort)
25. Add empty states to all list components (Low effort)
26. Generate OpenAPI documentation (Medium effort)

---

## Stats

- Total files scanned: 2,623 (source, excluding node_modules)
- Total project files: 66,086 (including node_modules)
- Languages detected: TypeScript (191 files), JavaScript, SQL, PowerShell, Shell, CSS, HTML, Markdown, JSON
- Total TypeScript/TSX lines: 91,456
- Backend main handler: 16,533 lines (single file)
- Database schema: 1,632 lines, 60+ tables, 140+ indexes
- Dependencies (frontend): 16 direct, 17 dev
- Dependencies (backend): 0 direct, 3 dev (wrangler, workers-types, zod)
- Known vulnerabilities: Encryption key hardcoded in version control; reversible password storage
- Test files found: 0
- TODO/FIXME/HACK count: 20
- `any` type usage: 430 instances
- ARIA attributes: ~3
- API endpoints: ~200+
- Zustand stores: 21
- Migration files: ~30 (inconsistent naming)
- Load test scripts: present (k6)
- CI/CD: GitHub Actions (1 workflow, no test step)
