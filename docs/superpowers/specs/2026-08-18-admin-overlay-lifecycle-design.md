# Admin Overlay Lifecycle Cleanup

## Scope

Unify overlay behavior for canonical `ui/Modal`, common `Sheet`, and common
`ConfirmDialog`, then migrate the add, details, credentials, and delete flows in
`ExecutorsPage`. Preserve public component APIs, Sheet motion/swipe behavior,
password hardening, dispatcher permissions, and demo read-only guards.

## Architecture

Add a shared `useModalLifecycle` hook used by `ui/Modal` and `Sheet`. A
module-level stack coordinates mixed nested overlays so only the top layer
handles Escape, backdrop dismissal, and focus trapping. The lifecycle owns
focus capture/initial focus/restore, background inert and `aria-hidden`
restoration, ref-counted body scroll locking, and shared BottomBar presence.

`ConfirmDialog` delegates its shell and lifecycle to canonical `ui/Modal` while
retaining its existing API and visual content. `Sheet` keeps its presentation,
responsive sizing, footer, animation, and drag-to-dismiss implementation while
delegating lifecycle behavior to the shared hook.

## Executors

Render add, details, and credentials overlays with canonical `ui/Modal`, using
flex panels with independently scrolling bodies and safe-area-aware footers.
Replace native `window.confirm` deletion with nested `ConfirmDialog`. Closing a
nested confirmation restores focus inside details; closing an Executor overlay
restores its trigger. Add-to-credentials transition restores final focus to the
original add trigger.

## Testing

Write failing tests before implementation for mixed Modal/Sheet/Confirm nesting,
top-only Escape, focus trap/restore, inert cleanup, body lock, BottomBar presence,
Sheet force-action behavior, and preserved motion classes. Extend Executor tests
for accessible dialogs, add/details/credentials/delete flows, permissions,
password handling, and focus restoration. Add 320px E2E coverage proving dialog
footers remain reachable and BottomBar remains absent.

Run frontend unit tests, TypeScript, production build, full isolated E2E, then
build and sync the Capacitor iOS app and launch the configured simulator.
