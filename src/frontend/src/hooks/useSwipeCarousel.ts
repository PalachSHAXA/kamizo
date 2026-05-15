import { useRef, useState, type TouchEvent, type MouseEvent } from 'react';

interface UseSwipeCarouselOpts {
  /** Total number of items in the carousel. */
  count: number;
  /** Current active index. */
  activeIdx: number;
  /** Called when the user swipes far enough to advance / go back. */
  onChange: (next: number) => void;
  /** Horizontal pixels the user must drag before we treat it as a swipe.
   *  Default 50. Set higher if the carousel sits inside a list that also
   *  scrolls horizontally. */
  swipeThreshold?: number;
  /** Pixels of movement before we mark this as a "drag" so any inner
   *  onClick can short-circuit. Default 8. */
  dragFarThreshold?: number;
}

interface UseSwipeCarouselReturn {
  /** Current drag offset in px (positive = swiping right). */
  drag: number;
  /** True while the user's finger / mouse is down. */
  dragging: boolean;
  /**
   * Set to true once movement passes `dragFarThreshold` and stays true
   * until the next gesture starts. Use this from an inner card's onClick
   * to suppress accidental taps after a swipe.
   */
  draggedFar: () => boolean;
  /** Spread onto the gesture surface. */
  handlers: {
    onTouchStart: (e: TouchEvent) => void;
    onTouchMove: (e: TouchEvent) => void;
    onTouchEnd: () => void;
    onMouseDown: (e: MouseEvent) => void;
    onMouseMove: (e: MouseEvent) => void;
    onMouseUp: () => void;
    onMouseLeave: () => void;
  };
}

/**
 * Shared horizontal-swipe carousel state. Touch + mouse events both
 * supported (mouse so the carousel works on a desktop tester too).
 *
 * Used by HomeHighlights, ServiceBottomSheet and NewsWidget — each renders
 * its own cards but the gesture math is identical.
 */
export function useSwipeCarousel({
  count,
  activeIdx,
  onChange,
  swipeThreshold = 50,
  dragFarThreshold = 8,
}: UseSwipeCarouselOpts): UseSwipeCarouselReturn {
  const startX = useRef(0);
  const cur = useRef(0);
  const farRef = useRef(false);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);

  const start = (clientX: number) => {
    startX.current = clientX;
    farRef.current = false;
    setDragging(true);
  };

  const move = (clientX: number) => {
    if (!dragging) return;
    cur.current = clientX - startX.current;
    if (Math.abs(cur.current) > dragFarThreshold) farRef.current = true;
    setDrag(cur.current);
  };

  const end = () => {
    setDragging(false);
    if (Math.abs(cur.current) > swipeThreshold) {
      if (cur.current < 0 && activeIdx < count - 1) onChange(activeIdx + 1);
      else if (cur.current > 0 && activeIdx > 0) onChange(activeIdx - 1);
    }
    setDrag(0);
    cur.current = 0;
  };

  return {
    drag,
    dragging,
    draggedFar: () => farRef.current,
    handlers: {
      onTouchStart: (e) => start(e.touches[0].clientX),
      onTouchMove: (e) => move(e.touches[0].clientX),
      onTouchEnd: end,
      onMouseDown: (e) => start(e.clientX),
      onMouseMove: (e) => move(e.clientX),
      onMouseUp: end,
      onMouseLeave: () => { if (dragging) end(); },
    },
  };
}
