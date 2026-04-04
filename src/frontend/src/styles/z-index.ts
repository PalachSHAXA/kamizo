// Centralized z-index scale for consistent layering
// Usage: className={`z-[${Z_INDEX.modal}]`} or style={{ zIndex: Z_INDEX.modal }}
//
// Layer order (lowest to highest):
//   base (10)        — BottomBar, MobileHeader, FAB
//   dropdown (50)    — dropdowns, popovers, autocomplete
//   sidebarOverlay (70) — sidebar dimmer
//   sidebar (80)     — sidebar drawer
//   modalBackdrop (100) — modal/sheet backdrop
//   modal (110)      — modal/sheet content
//   toast (150)      — toasts, banners, SW update
//   impersonation (200) — super-admin impersonation bar, skip-nav

export const Z_INDEX = {
  base: 10,
  dropdown: 50,
  sidebarOverlay: 70,
  sidebar: 80,
  modalBackdrop: 100,
  modal: 110,
  toast: 150,
  impersonation: 200,
} as const;
