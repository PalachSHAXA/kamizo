// Centralised overlay coordinator.
//
// The app shows several mutually-exclusive overlays — onboarding tour, push
// permission prompt, service-worker update banner, director onboarding wizard.
// Before this store each component decided on its own (`useState` + setTimeout
// + localStorage), with no awareness of the others. Result on first login: tour
// + push prompt + SW banner all fired at once.
//
// This store is the single source of truth: at most one overlay is `active` at
// any time. Higher-priority requests preempt lower-priority ones; lower ones
// queue and resume when the active overlay releases.
//
// Priorities (higher = more urgent — wins over and preempts everything below):
//   sw_update       90  — running stale code, must reload
//   tour            80  — first-time orientation, blocks the screen
//   director_wizard 70  — multi-step setup wizard for directors
//   push_prompt     50  — informational opt-in
import { create } from 'zustand';

export type OverlayType = 'sw_update' | 'tour' | 'director_wizard' | 'push_prompt';

export const OVERLAY_PRIORITY: Record<OverlayType, number> = {
  sw_update: 90,
  tour: 80,
  director_wizard: 70,
  push_prompt: 50,
};

interface OverlayState {
  activeOverlay: OverlayType | null;
  /** Queued requests, ordered by descending priority (head = next to activate). */
  queue: OverlayType[];
  requestOverlay: (type: OverlayType) => void;
  releaseOverlay: (type: OverlayType) => void;
  /** Test-only reset; do not call from UI. */
  _reset: () => void;
}

const insertByPriority = (queue: OverlayType[], type: OverlayType): OverlayType[] => {
  // Skip duplicates — re-requesting an already-queued overlay is a no-op.
  if (queue.includes(type)) return queue;
  const incomingPriority = OVERLAY_PRIORITY[type];
  const idx = queue.findIndex(t => OVERLAY_PRIORITY[t] < incomingPriority);
  if (idx === -1) return [...queue, type];
  return [...queue.slice(0, idx), type, ...queue.slice(idx)];
};

export const useOverlayStore = create<OverlayState>((set, get) => ({
  activeOverlay: null,
  queue: [],

  requestOverlay: (type) => {
    const { activeOverlay, queue } = get();

    // Free slot — take it.
    if (!activeOverlay) {
      set({ activeOverlay: type });
      return;
    }

    // Already active or queued — idempotent.
    if (activeOverlay === type) return;
    if (queue.includes(type)) return;

    // Higher priority preempts the current active overlay. The preempted one
    // re-queues itself; it'll resurface once the higher one releases.
    if (OVERLAY_PRIORITY[type] > OVERLAY_PRIORITY[activeOverlay]) {
      set({
        activeOverlay: type,
        queue: insertByPriority(queue, activeOverlay),
      });
      return;
    }

    // Otherwise queue by priority order.
    set({ queue: insertByPriority(queue, type) });
  },

  releaseOverlay: (type) => {
    const { activeOverlay, queue } = get();

    // Releasing a queued (not-yet-active) overlay just removes it.
    if (activeOverlay !== type) {
      if (queue.includes(type)) {
        set({ queue: queue.filter(t => t !== type) });
      }
      return;
    }

    // Releasing the active one — promote queue head if any.
    const [next, ...rest] = queue;
    set({ activeOverlay: next ?? null, queue: rest });
  },

  _reset: () => set({ activeOverlay: null, queue: [] }),
}));

/**
 * Hook used by overlay components to know whether they are allowed to render.
 * Components should call `requestOverlay(type)` on mount and `releaseOverlay`
 * on unmount/dismiss; this hook only reads state.
 */
export const useCanShowOverlay = (type: OverlayType): boolean =>
  useOverlayStore(state => state.activeOverlay === type);
