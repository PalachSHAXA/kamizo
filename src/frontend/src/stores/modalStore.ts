// Lightweight modal-presence counter.
//
// Why: the BottomBar (`fixed; bottom: -25px`) and full-screen sheets
// (NewRequestModal, ServiceBottomSheet, ApproveModal, etc.) both anchor to
// the viewport bottom. Even with z-index ordering, on iOS PWA the BottomBar
// peeks under the sheet's primary action ("Продолжить" / "Принять работу"),
// making it visually look covered by the bar.
//
// Mounted modals push, unmounted ones pop; BottomBar hides while count > 0.
// Counter (not boolean) so nested modals work — when the inner closes the
// outer is still counted.
import { create } from 'zustand';

interface ModalState {
  count: number;
  push: () => void;
  pop: () => void;
}

export const useModalStore = create<ModalState>((set) => ({
  count: 0,
  push: () => set((s) => ({ count: s.count + 1 })),
  pop: () => set((s) => ({ count: Math.max(0, s.count - 1) })),
}));

import { useEffect } from 'react';

/** Hook: declare that a modal is open while this component is mounted. */
export function useModalPresence(active: boolean = true) {
  const push = useModalStore((s) => s.push);
  const pop = useModalStore((s) => s.pop);
  useEffect(() => {
    if (!active) return;
    push();
    return () => pop();
  }, [active, push, pop]);
}

// Body-scroll-lock counter — separate from useModalPresence because a few
// consumers of useModalPresence are full pages that "act like a modal" for
// the sake of hiding the BottomBar (ResidentContractPage, some Resident
// tabs) and shouldn't lock body-scroll on themselves. Modal-shaped things
// call BOTH hooks; page-shaped things call only useModalPresence.
//
// Counter (not boolean) so nested modals don't fight over the restore
// value: only the first push captures the original inline overflow, only
// the last pop restores it.
//
// Why not just document.body: on mobile the actual scroll surface is the
// .main-content / .main-content-full wrapper (index.css:1008-1013 —
// "Scrollable content area — only this scrolls on mobile"), and modals
// like ManagementRequestModal render INSIDE that wrapper (not portaled to
// document.body). Setting body.style.overflow='hidden' is a no-op there
// because body itself never scrolls. We freeze both: body (desktop) and
// every .main-content / .main-content-full element (mobile & multi-panel).
let scrollLockCount = 0;
let originalBodyOverflow = '';
const originalMainOverflow = new Map<HTMLElement, string>();

function pushScrollLock() {
  if (scrollLockCount === 0) {
    originalBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const surfaces = document.querySelectorAll<HTMLElement>('.main-content, .main-content-full');
    surfaces.forEach((el) => {
      originalMainOverflow.set(el, el.style.overflow);
      el.style.overflow = 'hidden';
    });
  }
  scrollLockCount += 1;
}

function popScrollLock() {
  if (scrollLockCount === 0) return;
  scrollLockCount -= 1;
  if (scrollLockCount === 0) {
    document.body.style.overflow = originalBodyOverflow;
    originalMainOverflow.forEach((prev, el) => {
      // Element may have been unmounted meanwhile; guard.
      if (el.isConnected) el.style.overflow = prev;
    });
    originalMainOverflow.clear();
  }
}

/** Hook: freeze document.body scroll while this component is mounted (or
 *  while `active` is true). Ref-counted, safe for stacked modals. */
export function useBodyScrollLock(active: boolean = true) {
  useEffect(() => {
    if (!active) return;
    pushScrollLock();
    return () => popScrollLock();
  }, [active]);
}
