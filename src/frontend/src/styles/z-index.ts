// Centralized z-index scale for consistent layering
// Usage: className={`z-[${Z_INDEX.modal}]`} or style={{ zIndex: Z_INDEX.modal }}

export const Z_INDEX = {
  base: 10,
  dropdown: 50,
  sticky: 80,
  sidebar: 100,
  overlay: 150,
  modal: 200,
  toast: 9999,
} as const;
