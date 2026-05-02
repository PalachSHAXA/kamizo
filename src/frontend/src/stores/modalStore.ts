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
