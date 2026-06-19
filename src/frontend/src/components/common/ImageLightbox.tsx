import { useCallback, useEffect, useRef, useState } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

// Fullscreen in-app image viewer with zoom + pan. Used wherever we show
// user-attached photos that may be stored as `data:` URLs — clicking such a
// URL via an `<a target="_blank">` is BLOCKED by Chromium (Chrome AND Edge)
// → about:blank#blocked, so opening in a new tab never works. This overlay
// renders the image inline and adds:
//   • wheel / +- buttons / double-click to zoom
//   • drag to pan (mouse or single-finger when zoomed)
//   • two-finger pinch to zoom on touch
//   • Esc or backdrop / X to close
// Works for both data: and https: URLs.
const MIN_SCALE = 1;
const MAX_SCALE = 6;

type Pt = { x: number; y: number };
const distance = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

export function ImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt?: string;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Pt>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Active pointers (for pan + pinch), plus drag/pinch anchors.
  const pointers = useRef(new Map<number, Pt>());
  const dragStart = useRef<Pt | null>(null);
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const zoomBy = useCallback((factor: number) => {
    setScale((prev) => {
      const next = clamp(prev * factor);
      if (next === 1) setOffset({ x: 0, y: 0 });
      return next;
    });
  }, []);

  // Esc closes; reset zoom whenever the image changes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === '+' || e.key === '=') zoomBy(1.2);
      else if (e.key === '-') zoomBy(1 / 1.2);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, zoomBy]);

  useEffect(() => { reset(); }, [src, reset]);

  // Wheel zoom — attached natively so we can preventDefault (React's onWheel
  // is passive and can't stop the page from scrolling underneath).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      setScale((prev) => {
        const next = clamp(prev * factor);
        if (next === 1) setOffset({ x: 0, y: 0 });
        return next;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchStart.current = { dist: distance(a, b), scale };
      dragStart.current = null;
    } else if (pointers.current.size === 1) {
      dragStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 2 && pinchStart.current) {
      const d = distance(pts[0], pts[1]);
      setScale(clamp(pinchStart.current.scale * (d / pinchStart.current.dist)));
    } else if (pts.length === 1 && dragStart.current && scale > 1) {
      setOffset({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 1) {
      const p = [...pointers.current.values()][0];
      dragStart.current = { x: p.x - offset.x, y: p.y - offset.y };
    } else if (pointers.current.size === 0) {
      dragStart.current = null;
      if (scale <= 1) setOffset({ x: 0, y: 0 });
    }
  };

  const btn =
    'p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors';

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-black/90 z-[10000] flex items-center justify-center overflow-hidden select-none"
      onClick={(e) => { if (e.target === e.currentTarget && scale === 1) onClose(); }}
      role="dialog"
      aria-modal="true"
    >
      {/* Toolbar */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={() => zoomBy(1 / 1.2)} className={btn} aria-label="Уменьшить">
          <ZoomOut className="w-5 h-5" />
        </button>
        <button type="button" onClick={() => zoomBy(1.2)} className={btn} aria-label="Увеличить">
          <ZoomIn className="w-5 h-5" />
        </button>
        <button type="button" onClick={reset} className={btn} aria-label="Сбросить">
          <RotateCcw className="w-5 h-5" />
        </button>
        <button type="button" onClick={onClose} className={btn} aria-label="Закрыть">
          <X className="w-6 h-6" />
        </button>
      </div>

      <img
        src={src}
        alt={alt || ''}
        draggable={false}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => (scale > 1 ? reset() : setScale(2.5))}
        onClick={(e) => e.stopPropagation()}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          cursor: scale > 1 ? 'grab' : 'zoom-in',
          touchAction: 'none',
          transition: pointers.current.size ? 'none' : 'transform 0.12s ease-out',
        }}
        // Mobile: fill the screen (max-w/h-full) — left as-is per request.
        // Desktop (md+): cap to a comfortable centred size so the photo isn't
        // huge; the dark backdrop frames it. Zoom still scales beyond this.
        className="max-w-full max-h-full md:max-w-[72vw] md:max-h-[80vh] object-contain rounded-lg"
      />
    </div>
  );
}
