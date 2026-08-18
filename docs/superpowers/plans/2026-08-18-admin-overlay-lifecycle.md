# Admin Overlay Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Modal, Sheet, ConfirmDialog, and Executor overlays one accessible nested lifecycle without changing their public APIs or established visual behavior.

**Architecture:** A shared hook and module-level stack coordinate focus, Escape, inert background, body locking, and BottomBar presence. Canonical Modal and Sheet consume it; ConfirmDialog delegates to Modal; ExecutorsPage uses those primitives for every overlay and deletion confirmation.

**Tech Stack:** React 18, TypeScript, Zustand, Tailwind CSS, Vitest/Testing Library, Playwright, Vite, Capacitor iOS.

**Spec:** `docs/superpowers/specs/2026-08-18-admin-overlay-lifecycle-design.md`

## Global Constraints

- Modify only Modal/Sheet/ConfirmDialog lifecycle code, ExecutorsPage, and related tests/docs.
- Preserve existing component APIs and Sheet motion/swipe behavior.
- Preserve Executor password hardening, dispatcher restrictions, and demo guards.
- Do not commit changes.

---

### Task 1: Shared Overlay Lifecycle

**Files:**
- Create: `src/frontend/src/components/ui/useModalLifecycle.ts`
- Modify: `src/frontend/src/components/ui/Modal.tsx`
- Test: `src/frontend/src/components/ui/__tests__/Modal.test.tsx`

**Interfaces:**
- Produces: `useModalLifecycle({ active, onClose, closeOnEscape, returnFocus })`, returning `panelRef`, `layerRef`, `isTopLayer()`, and lifecycle-backed backdrop dismissal.

- [ ] Add failing tests for mixed nesting, one-Escape-one-close, focus wrap/restore, inert ownership, ref-counted body lock, and BottomBar count.
- [ ] Run `npm run test:unit -- src/components/ui/__tests__/Modal.test.tsx` and confirm failures.
- [ ] Implement the stack and hook with stable callback refs, per-layer registration, top-only keyboard handling, shared lock ownership, and safe cleanup.
- [ ] Refactor canonical Modal to use the hook without changing props or classes.
- [ ] Re-run the focused test until green.

### Task 2: Sheet And ConfirmDialog Delegation

**Files:**
- Modify: `src/frontend/src/components/common/Sheet.tsx`
- Modify: `src/frontend/src/components/common/ConfirmDialog.tsx`
- Create: `src/frontend/src/components/common/__tests__/OverlayLifecycle.test.tsx`

**Interfaces:**
- Consumes: `useModalLifecycle` and canonical `Modal`.
- Preserves: `SheetProps`, `ConfirmDialogProps`, Sheet swipe/transition classes, and `forceAction` semantics.

- [ ] Add failing tests nesting Modal, Sheet, and ConfirmDialog; assert top-only Escape, focus restore, BottomBar count, force-action Escape blocking, unique accessible names, safe-area footer, and motion classes.
- [ ] Run the focused overlay test and confirm failures.
- [ ] Replace Sheet's local keyboard/focus/body-lock logic with the shared hook and portal its existing visual shell to `document.body`.
- [ ] Render ConfirmDialog through canonical Modal while preserving tone, icon, body, and actions.
- [ ] Re-run Modal and overlay tests until green.

### Task 3: Executor Overlay Migration

**Files:**
- Modify: `src/frontend/src/pages/shared/ExecutorsPage.tsx`
- Modify: `src/frontend/src/pages/shared/__tests__/ExecutorsPage.passwords.test.tsx`

**Interfaces:**
- Consumes: canonical `Modal` and common `ConfirmDialog`.
- Preserves: store/API calls, localization, password one-time display, dispatcher restrictions, and demo mutation guards.

- [ ] Add failing tests for accessible add/details/credentials dialogs, trigger focus restoration, successful add-to-credentials flow, nested delete confirmation, Escape top-only, and confirmed deletion.
- [ ] Run the focused Executor test and confirm failures.
- [ ] Replace all three hand-built overlay shells with canonical Modal flex layouts and safe-area footer containers.
- [ ] Replace `window.confirm` with nested ConfirmDialog and keep deletion asynchronous/guarded.
- [ ] Re-run focused Executor and overlay tests until green.

### Task 4: 320px Executor E2E

**Files:**
- Modify: `src/frontend/e2e/06-adaptive-smoke.spec.ts`

**Interfaces:**
- Validates: `/executors` add/details overlays at 320px, reachable footer actions, hidden BottomBar, Escape close, and focus restoration.

- [ ] Add the Playwright scenario using role-based locators and viewport bounds.
- [ ] Run the relevant isolated Playwright project/spec and fix only regressions within scope.

### Task 5: Full Verification And iOS Refresh

**Files:** No source changes unless a scoped regression is found.

- [ ] Run `npm run test` in `src/frontend`.
- [ ] Run `npm run typecheck` in `src/frontend`.
- [ ] Run `npm run build` in `src/frontend`.
- [ ] Run `npm run test:e2e` in `src/frontend`.
- [ ] Run `npx cap sync ios` after the successful build.
- [ ] Resolve the available `iPhone 17 Pro Max` UUID and run `npx cap run ios --target <UUID>`.
- [ ] Inspect the final diff and report commands, outcomes, and any environmental E2E/iOS blockers.
