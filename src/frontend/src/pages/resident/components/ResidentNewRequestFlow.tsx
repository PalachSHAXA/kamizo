import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import {
  Droplet, Zap, Flame, MoveVertical, Sparkles, Trash2, ShieldCheck, Bell,
  MoreHorizontal, Search, X as XIcon, ArrowRight, ArrowLeft, Camera, Send,
  Check, Phone, ChevronRight, Loader2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { SERVICE_CATEGORIES } from '../../../types';
import type { ExecutorSpecialization, RequestPriority, Request, User } from '../../../types';
import { formatAddress } from '../../../utils/formatAddress';
import { compressImage } from '../../../utils/compressImage';
import { useModalPresence } from '../../../stores/modalStore';
import { useIsMobile } from '../../../hooks/useBreakpoint';

// New request flow — 1:1 port of Claude Design §03-novaya-zayavka, wired to
// real data: catalog tiles map to real ExecutorSpecialization categories,
// photo upload uses the same FileReader/data-URL pipeline as NewRequestModal
// (max 5; raw up to 10 MB, auto-compressed to 1280px JPEG ~150-250 KB
// before storage so the server's 350 KB/photo cap is never tripped),
// and submit calls the real addRequest via onCreate.
// Two steps in one component: 'catalog' (ServiceSheet) → 'form' (RequestForm).

type Tone = { fg: string; tint: string; ring: string; glow: string };
const TONES: Record<string, Tone> = {
  blue:  { fg: '#2F77C2', tint: 'rgba(47,119,194,0.13)', ring: '#2F77C2', glow: 'rgba(47,119,194,0.20)' },
  amber: { fg: '#D97706', tint: 'rgba(245,158,11,0.16)', ring: '#F59E0B', glow: 'rgba(245,158,11,0.22)' },
  red:   { fg: '#E2483D', tint: 'rgba(226,72,61,0.13)',  ring: '#E2483D', glow: 'rgba(226,72,61,0.20)' },
  green: { fg: '#15A06E', tint: 'rgba(21,160,110,0.14)', ring: '#15A06E', glow: 'rgba(21,160,110,0.20)' },
  brand: { fg: '#EA580C', tint: '#FFF1E6',               ring: '#F97316', glow: 'rgba(249,115,22,0.22)' },
  stone: { fg: '#6F6A62', tint: 'rgba(28,25,23,0.07)',   ring: '#A8A29E', glow: 'rgba(28,25,23,0.12)' },
  dark:  { fg: '#F4F0E8', tint: '#1C1917',               ring: '#1C1917', glow: 'rgba(28,25,23,0.26)' },
};

type SvcCat = 'home' | 'building' | 'territory';
interface NRService {
  category: ExecutorSpecialization;
  Icon: LucideIcon;
  label: string; labelUz: string;
  sub: string; subUz: string;
  cat: SvcCat; tone: string; tag?: string; tagUz?: string;
}

// Each tile is bound to a real backend category (ExecutorSpecialization).
const NR_SERVICES: NRService[] = [
  { category: 'plumber',     Icon: Droplet,        label: 'Сантехника',  labelUz: 'Santexnika', sub: 'Протечка, кран, унитаз', subUz: 'Quvur, kran, unitaz', cat: 'home',      tone: 'blue',  tag: 'Часто', tagUz: 'Tez-tez' },
  { category: 'electrician', Icon: Zap,            label: 'Электрика',    labelUz: 'Elektrika',  sub: 'Свет, розетки, щиток',   subUz: 'Yorug\'lik, rozetka', cat: 'home',      tone: 'amber', tag: 'Часто', tagUz: 'Tez-tez' },
  { category: 'boiler',      Icon: Flame,          label: 'Отопление',    labelUz: 'Isitish',    sub: 'Батареи, котёл',         subUz: 'Batareya, qozon',     cat: 'home',      tone: 'red'   },
  { category: 'elevator',    Icon: MoveVertical,   label: 'Лифт',         labelUz: 'Lift',       sub: 'Не работает, шум',       subUz: 'Ishlamaydi, shovqin', cat: 'building',  tone: 'dark'  },
  { category: 'cleaning',    Icon: Sparkles,       label: 'Уборка',       labelUz: 'Tozalash',   sub: 'Подъезд, лестница',      subUz: 'Kirish, zinapoya',    cat: 'building',  tone: 'green' },
  { category: 'trash',       Icon: Trash2,         label: 'Вывоз мусора', labelUz: 'Chiqindi',   sub: 'Крупногабарит',          subUz: 'Yirik chiqindi',      cat: 'building',  tone: 'stone' },
  { category: 'security',    Icon: ShieldCheck,    label: 'Охрана',       labelUz: 'Qo\'riqlash', sub: 'Двор, шлагбаум',        subUz: 'Hovli, shlagbaum',    cat: 'territory', tone: 'brand' },
  { category: 'intercom',    Icon: Bell,           label: 'Домофон',      labelUz: 'Domofon',    sub: 'Домофон, замки',         subUz: 'Domofon, qulf',       cat: 'territory', tone: 'blue'  },
  { category: 'other',       Icon: MoreHorizontal, label: 'Другое',       labelUz: 'Boshqa',     sub: 'Опишите проблему',       subUz: 'Muammoni yozing',     cat: 'home',      tone: 'stone' },
];

const NR_CATS: { id: 'all' | SvcCat; label: string; labelUz: string }[] = [
  { id: 'all', label: 'Все', labelUz: 'Barchasi' },
  { id: 'home', label: 'В квартире', labelUz: 'Kvartirada' },
  { id: 'building', label: 'В доме', labelUz: 'Binoda' },
  { id: 'territory', label: 'Двор', labelUz: 'Hovli' },
];

// Time slots → mapped to real scheduledDate / scheduledTime on submit.
const today = () => new Date().toISOString().split('T')[0];
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; };
interface Slot { id: string; label: string; labelUz: string; sub: string; subUz: string; date?: string; time?: string }
const NR_SLOTS: Slot[] = [
  { id: 'asap',     label: 'Как можно скорее', labelUz: 'Imkon qadar tez', sub: '~2 ч', subUz: '~2 soat' },
  { id: 'today_pm', label: 'Сегодня 15–17',    labelUz: 'Bugun 15–17',     sub: '', subUz: '', date: today(),    time: '15:00-17:00' },
  { id: 'tom_am',   label: 'Завтра 09–11',     labelUz: 'Ertaga 09–11',    sub: '', subUz: '', date: tomorrow(), time: '09:00-11:00' },
  { id: 'tom_pm',   label: 'Завтра 13–15',     labelUz: 'Ertaga 13–15',    sub: '', subUz: '', date: tomorrow(), time: '13:00-15:00' },
];

// Above the global BottomBar (zIndex 1000) so the sheet is never painted
// behind the floating bottom nav on screens where the nav is visible.
const ZTOP = 1100;
// Trash removal needs structured fields (type + volume + explicit date/time)
// rather than a free-text description — ported from the old NewRequestModal so
// dispatch keeps the type/volume signal that drives truck sizing.
export const TRASH_TYPES = [
  { id: 'construction', icon: '🧱', label: 'Строительный', labelUz: 'Qurilish',     sub: 'Кирпич, бетон, штукатурка', subUz: 'G\'isht, beton, shuvoq' },
  { id: 'furniture',    icon: '🛋️', label: 'Старая мебель', labelUz: 'Eski mebel',  sub: 'Диваны, шкафы, кровати',    subUz: 'Divan, shkaf, krovat' },
  { id: 'household',    icon: '🗑️', label: 'Бытовой',       labelUz: 'Maishiy',      sub: 'Обычные бытовые отходы',    subUz: 'Oddiy maishiy chiqindi' },
  { id: 'appliances',   icon: '📺', label: 'Техника',        labelUz: 'Texnika',      sub: 'Холодильники, стиралки',    subUz: 'Muzlatgich, kir mashina' },
  { id: 'garden',       icon: '🌿', label: 'Садовый',        labelUz: 'Bog\'',        sub: 'Ветки, листья, трава',      subUz: 'Shox, barg, o\'t' },
  { id: 'mixed',        icon: '📦', label: 'Смешанный',      labelUz: 'Aralash',      sub: 'Разные виды мусора',        subUz: 'Turli chiqindilar' },
];
const TRASH_VOLUME = [
  { id: 'small',  label: 'До 1 м³',      labelUz: '1 m³ gacha',     sub: '1-2 мешка',           subUz: '1-2 qop' },
  { id: 'medium', label: '1-3 м³',       labelUz: '1-3 m³',         sub: 'Мешки, мелкая мебель', subUz: 'Qoplar, kichik mebel' },
  { id: 'large',  label: '3-5 м³',       labelUz: '3-5 m³',         sub: 'Много, крупная мебель', subUz: 'Ko\'p, yirik mebel' },
  { id: 'truck',  label: 'Более 5 м³',   labelUz: '5 m³ dan ortiq', sub: 'Полная машина',        subUz: 'To\'liq mashina' },
];
const TRASH_TIME_SLOTS = ['09:00-11:00', '11:00-13:00', '13:00-15:00', '15:00-17:00', '17:00-19:00'];
const minDate = () => new Date().toISOString().split('T')[0];
const maxDate = () => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]; };

const RX = 'var(--radius-xl, 28px)';
const RL = 'var(--radius-lg, 20px)';
const RM = 'var(--radius-md, 14px)';
const RS = 'var(--radius-sm, 12px)';

export interface ResidentNewRequestFlowProps {
  open: boolean;
  language: string;
  user: User | null;
  onClose: () => void;
  // Returns the created request (with real .number) or null on failure.
  onCreate: (data: {
    title: string; description: string; category: ExecutorSpecialization;
    priority: RequestPriority; scheduledDate?: string; scheduledTime?: string; photos?: string[];
  }) => Promise<Request | null>;
  onGoToRequests: () => void;
}

export function ResidentNewRequestFlow({ open, language, user, onClose, onCreate, onGoToRequests }: ResidentNewRequestFlowProps) {
  const [step, setStep] = useState<'catalog' | 'form'>('catalog');
  const [category, setCategory] = useState<ExecutorSpecialization | null>(null);
  if (!open) return null;
  return (
    <SheetShell onDismiss={onClose}>
      {(shell, requestClose) => (
        step === 'catalog' ? (
          <ServiceSheet
            language={language}
            shell={shell}
            onClose={requestClose}
            onPick={(c) => { setCategory(c); setStep('form'); }}
          />
        ) : (
          <RequestForm
            language={language}
            user={user}
            category={category!}
            shell={shell}
            onBack={() => setStep('catalog')}
            onClose={requestClose}
            onCreate={onCreate}
            onGoToRequests={onGoToRequests}
          />
        )
      )}
    </SheetShell>
  );
}

// Drag handlers spread onto a step's grabber so a downward swipe dismisses.
//
// v118.23 — bundle now includes TWO handler sets:
//   • `drag`           — spread on the header / grabber zone. Always
//                        treats a downward touch as a sheet drag,
//                        except when the touch starts on an interactive
//                        descendant (input / button / link / etc) so
//                        the search field, X close button, and chip
//                        strip still work normally.
//   • `dragScrollable` — spread on the scrollable content list. Only
//                        initiates a sheet drag if the list is already
//                        scrolled to the TOP (scrollTop === 0) so the
//                        list's normal vertical scroll wins everywhere
//                        else. Once the user is at the top and pulls
//                        down, the SHEET drags, not the list.
//
// Both sets close the sheet when EITHER the cumulative downward
// distance crosses ~90 px OR a flick velocity > 0.55 px/ms is
// detected at touchend — whichever first. The 110 px distance-only
// threshold the previous build used made the dismiss gesture feel
// "stiff" because users have to drag almost the whole header before
// it would commit; the new combined-criteria version mirrors native
// iOS bottom-sheet behaviour.
type DragHandlers = {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
};
type ShellDrag = {
  drag: DragHandlers;
  dragScrollable: DragHandlers;
};

// Animated bottom-sheet chrome shared by every step: slides up on open, fades
// the backdrop, supports swipe-down-to-dismiss, locks background scroll and
// (via useModalPresence) hides the global BottomBar so the sticky action
// button is never covered by the nav. The panel stays mounted across
// catalog→form so there is no re-animation between steps.
//
// Desktop adaptation: mobile keeps the bottom-sheet pattern (slide-up,
// swipe-down-to-dismiss, anchored to bottom-edge, rounded only on top).
// At ≥md the same shell becomes a CENTERED MODAL with bounded width
// (~720 px) and full-radius corners — without this, the sheet flat-out
// covered the whole desktop main column with a dark backdrop including
// over the global Sidebar.
function SheetShell({ onDismiss, children }: { onDismiss: () => void; children: (shell: ShellDrag, requestClose: () => void) => ReactNode }) {
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);
  const dragging = useRef(false);
  const startY = useRef(0);
  const dragYRef = useRef(0);
  const lastY = useRef(0);
  const lastT = useRef(0);
  const velocity = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  useModalPresence();

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    // v118.28 — REAL background scroll lock. v118.23 set
    // `document.body.style.overflow = 'hidden'` but that's a no-op
    // on mobile because body is already `overflow:hidden` per the
    // global mobile CSS (the actual scroll container is
    // `.main-content` / `.main-content-full`). Without locking THAT
    // element, the user's dismiss-drag down on the sheet bled
    // through to the body's touch handler → the WebView walked the
    // DOM up to `.main-content` (the first scrollable ancestor) and
    // scrolled IT while the sheet was being dragged. The home page
    // visually moved with the sheet.
    //
    // Fix: find the actual scroll container by class and freeze it
    // with overflow:hidden + touchAction:none. Both are required:
    //   • overflow:hidden stops momentum / wheel scroll
    //   • touchAction:none stops iOS WKWebView from interpreting any
    //     touch-driven pan on a descendant as a scroll gesture for
    //     this container
    // body.style.overflow is ALSO set as belt-and-suspenders (matters
    // on desktop where body IS the scroller).
    const prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const scrollEl = document.querySelector('.main-content, .main-content-full') as HTMLElement | null;
    const prevScrollOverflow = scrollEl?.style.overflow ?? '';
    const prevScrollTouchAction = scrollEl?.style.touchAction ?? '';
    if (scrollEl) {
      scrollEl.style.overflow = 'hidden';
      scrollEl.style.touchAction = 'none';
    }
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = prevBodyOverflow;
      if (scrollEl) {
        scrollEl.style.overflow = prevScrollOverflow;
        scrollEl.style.touchAction = prevScrollTouchAction;
      }
    };
  }, []);

  const requestClose = useCallback(() => {
    setClosing(true);
    window.setTimeout(onDismiss, 240);
  }, [onDismiss]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [requestClose]);

  // v118.23 — bottom-sheet dismiss redesigned for native-iOS feel.
  //
  // (1) FOLLOW-FINGER 1:1: every touchmove writes the new translateY
  //     directly to panelRef.current.style instead of going through
  //     React state. The previous setDragY/setState path forced the
  //     entire SheetShell subtree (the ~20 service tiles, search,
  //     chips, etc.) to re-render on every move event — janky on
  //     iPhone SE / mid-range Android. Direct DOM mutation keeps
  //     the gesture locked to the finger at 60 fps even on weak
  //     hardware. The transition is set to "none" during a drag
  //     so the transform applies instantly; on release we restore
  //     the spring curve.
  //
  // (2) LOWER THRESHOLD + VELOCITY: closes if EITHER the cumulative
  //     downward distance crosses CLOSE_DISTANCE_PX (90 px) OR the
  //     instantaneous velocity at touchend exceeds CLOSE_VELOCITY
  //     (0.55 px/ms ≈ 550 px/s — a normal flick is 800-1500 px/s).
  //     Velocity is sampled across consecutive touchmove events so
  //     a quick flick down dismisses even if the total distance
  //     dragged is only ~30 px. Previously the dismiss required
  //     a slow 110 px drag — too stiff.
  //
  // (3) SPRING-BACK: if neither criterion is met, we set translateY
  //     to 0 and re-enable the cubic-bezier(.32,.72,0,1) curve so
  //     the panel springs back smoothly instead of snapping.
  //
  // Desktop: pointer-drag is a no-op (`if (!isMobile) return`); the
  // pill renders only as a visual cue, X close button is the only
  // dismiss path. Same logic as before.
  const CLOSE_DISTANCE_PX = 90;
  const CLOSE_VELOCITY = 0.55;

  const applyTransform = useCallback((y: number, withSpring: boolean) => {
    const el = panelRef.current;
    if (!el) return;
    el.style.transition = withSpring
      ? 'transform .28s cubic-bezier(.32,.72,0,1)'
      : 'none';
    el.style.transform = `translateY(${y}px)`;
  }, []);

  const beginDrag = useCallback((clientY: number) => {
    if (!isMobile) return;
    dragging.current = true;
    startY.current = clientY;
    lastY.current = clientY;
    lastT.current = performance.now();
    velocity.current = 0;
    dragYRef.current = 0;
  }, [isMobile]);

  const moveDrag = useCallback((clientY: number) => {
    if (!isMobile || !dragging.current) return;
    const dy = clientY - startY.current;
    const y = dy > 0 ? dy : 0;
    dragYRef.current = y;
    applyTransform(y, false);
    // Velocity sampling — small window averages out finger jitter
    // while still being responsive to a true flick.
    const now = performance.now();
    const dt = now - lastT.current;
    if (dt > 0) {
      velocity.current = (clientY - lastY.current) / dt;
    }
    lastY.current = clientY;
    lastT.current = now;
  }, [isMobile, applyTransform]);

  const endDrag = useCallback(() => {
    if (!isMobile || !dragging.current) return;
    dragging.current = false;
    const flick = velocity.current > CLOSE_VELOCITY;
    const farEnough = dragYRef.current > CLOSE_DISTANCE_PX;
    if (flick || farEnough) {
      requestClose();
    } else {
      // Spring back to 0
      applyTransform(0, true);
      dragYRef.current = 0;
    }
  }, [isMobile, requestClose, applyTransform]);

  // Two handler sets — see ShellDrag type above. `drag` is for the
  // header / grabber area; `dragScrollable` is for the scrollable
  // content list and only initiates a sheet drag when the list is
  // at scrollTop === 0 (otherwise the list scrolls normally — no
  // gesture conflict).
  const shell: ShellDrag = {
    drag: {
      onTouchStart: (e) => {
        // Skip if the touch starts on an interactive descendant —
        // search input, X close button, category chips. Those need
        // their own touch behaviour and shouldn't initiate a drag.
        const target = e.target as HTMLElement;
        if (target.closest('input, button, a, textarea, select, label')) return;
        beginDrag(e.touches[0].clientY);
      },
      onTouchMove: (e) => moveDrag(e.touches[0].clientY),
      onTouchEnd: () => endDrag(),
    },
    dragScrollable: {
      onTouchStart: (e) => {
        const el = e.currentTarget as HTMLElement;
        // Only initiate sheet drag if the list is at the top —
        // otherwise the list scrolls normally and the sheet stays put.
        if (el.scrollTop > 0) return;
        beginDrag(e.touches[0].clientY);
      },
      onTouchMove: (e) => moveDrag(e.touches[0].clientY),
      onTouchEnd: () => endDrag(),
    },
  };

  const shown = entered && !closing;
  // Mobile: slide-up from the bottom edge; closing slides back down.
  // Desktop: fade + tiny scale; no translate, since the panel is
  // centered. During a drag the transform is updated via panelRef
  // directly (applyTransform), but when the panel mounts / closes
  // we still rely on the JSX-driven transform below for the
  // open/close animations.
  const panelTransform = isMobile
    ? `translateY(${shown ? '0px' : '100%'})`
    : `scale(${shown ? 1 : 0.97})`;
  // v118.28 — render the sheet through a portal to document.body.
  // Without the portal, the outer `position:fixed` div still lives
  // inside .main-content's DOM subtree, so touchmove events on the
  // sheet bubble up the DOM tree all the way to .main-content, and
  // the WebView finds it as the nearest scrollable ancestor and
  // pans it while the user is dragging the sheet. Portaling escapes
  // the .main-content subtree entirely so touch can only bubble to
  // body (which is already overflow:hidden on mobile, and now
  // belt-and-suspenders pinned via the useEffect above).
  const tree = (
    <div
      onClick={requestClose}
      style={{
        position: 'fixed', inset: 0, zIndex: ZTOP,
        display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
        background: `rgba(28,25,23,${shown ? 0.5 : 0})`,
        backdropFilter: shown ? 'blur(2px)' : 'none',
        transition: 'background .25s ease',
        // Desktop: extra bottom padding so the sticky "Выберите услугу" CTA
        // never hugs the bottom edge of the viewport (the modal is centered,
        // and asymmetric padding nudges it ~36px higher than the geometric
        // middle, which looks much calmer with a CTA pinned to the panel
        // bottom).
        padding: isMobile ? 0 : '24px 24px 72px 24px',
      }}
    >
      <div ref={panelRef} onClick={(e) => e.stopPropagation()} style={{
        width: '100%',
        maxWidth: isMobile ? '100%' : 720,
        // Cap shorter on desktop (was 88vh) so even when the panel is full
        // of service cards there is ~10vh of breathing room around it.
        maxHeight: isMobile ? '94vh' : '82vh',
        display: 'flex', flexDirection: 'column',
        background: 'var(--app-bg, #F4F0E8)',
        // Mobile: rounded only at the top (sheet anchored to bottom).
        // Desktop: rounded all corners (free-floating modal).
        borderTopLeftRadius: RX, borderTopRightRadius: RX,
        borderBottomLeftRadius: isMobile ? 0 : RX,
        borderBottomRightRadius: isMobile ? 0 : RX,
        boxShadow: isMobile
          ? '0 -10px 40px rgba(28,25,23,0.3)'
          : '0 20px 60px rgba(28,25,23,0.35)',
        overflow: 'hidden',
        transform: panelTransform,
        opacity: isMobile ? 1 : (shown ? 1 : 0),
        transition: `transform .28s cubic-bezier(.32,.72,0,1), opacity .22s ease`,
        willChange: 'transform, opacity',
      }}>
        {children(shell, requestClose)}
      </div>
    </div>
  );
  if (typeof document === 'undefined') return tree;
  return createPortal(tree, document.body);
}

// ── Step 1: catalog ──────────────────────────────────────────
function ServiceSheet({ language, onPick, onClose, shell }: { language: string; onPick: (c: ExecutorSpecialization) => void; onClose: () => void; shell: ShellDrag }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<'all' | SvcCat>('all');
  const [sel, setSel] = useState<ExecutorSpecialization | null>(null);
  const ru = language === 'ru';

  let list = NR_SERVICES;
  if (cat !== 'all') list = list.filter(s => s.cat === cat);
  if (q.trim()) {
    const needle = q.toLowerCase();
    list = list.filter(s => (`${s.label} ${s.sub} ${s.labelUz} ${s.subUz}`).toLowerCase().includes(needle));
  }
  const selSvc = NR_SERVICES.find(s => s.category === sel) || null;

  return (
    <>
        {/* v118.23 — drag handlers spread on the WHOLE dark hero
            (not just the pill), so users can grab anywhere in the
            header to dismiss. The interactive-child guard inside
            beginDrag() ensures the search input, X close, and
            category chips still receive their own touch events.
            touchAction 'pan-y' lets the browser tolerate the
            vertical pan we're tracking without trying to scroll
            the underlying surface. */}
        {/* dark stone hero header */}
        <div
          {...shell.drag}
          style={{
            position: 'relative', overflow: 'hidden', flexShrink: 0,
            background: 'linear-gradient(155deg, #33302C 0%, #1C1917 70%)',
            padding: 'calc(env(safe-area-inset-top, 0px) + 6px) 16px 15px', color: 'var(--text-on-dark, #F4F0E8)',
            borderTopLeftRadius: RX, borderTopRightRadius: RX,
            touchAction: 'pan-y',
          }}
        >
          <div style={{ position: 'absolute', top: -70, right: -40, width: 200, height: 200, borderRadius: 999, background: 'radial-gradient(circle, rgba(249,115,22,0.35), transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative' }}>
            {/* Visible grab indicator — the pill stays as a visual
                cue (the whole hero is now the drag surface, but
                users still expect to see the pill). */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0 12px', cursor: 'grab', pointerEvents: 'none' }} aria-hidden="true">
              <div style={{ width: 38, height: 5, borderRadius: 999, background: 'rgba(244,240,232,0.3)' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{ru ? 'С чем нужна помощь?' : 'Qanday yordam kerak?'}</div>
                <div style={{ fontSize: 12.5, color: 'rgba(244,240,232,0.6)', marginTop: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--status-active, #15A06E)', boxShadow: '0 0 0 3px rgba(21,160,110,0.25)' }} />
                  {ru ? 'Мастера на смене · среднее время ~2 ч' : 'Ustalar smenada · o\'rtacha ~2 soat'}
                </div>
              </div>
              <button onClick={onClose} aria-label={ru ? 'Закрыть' : 'Yopish'} style={{ width: 34, height: 34, borderRadius: 999, background: 'rgba(244,240,232,0.1)', border: '1px solid rgba(244,240,232,0.14)', display: 'grid', placeItems: 'center', color: 'var(--text-on-dark, #F4F0E8)', cursor: 'pointer', flex: '0 0 auto' }}><XIcon size={16} /></button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(244,240,232,0.09)', border: '1px solid rgba(244,240,232,0.14)', borderRadius: RM, padding: '11px 13px' }}>
              <Search size={17} style={{ color: 'rgba(244,240,232,0.55)' }} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={ru ? 'Поиск услуги' : 'Xizmatni qidirish'} style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14.5, color: 'var(--text-on-dark, #F4F0E8)' }} />
            </div>
            <div style={{ display: 'flex', gap: 7, marginTop: 11, overflowX: 'auto' }}>
              {NR_CATS.map(c => {
                const on = cat === c.id;
                return <button key={c.id} onClick={() => setCat(c.id)} style={{ flex: '0 0 auto', padding: '7px 14px', borderRadius: 999, background: on ? 'var(--brand, #F97316)' : 'rgba(244,240,232,0.09)', color: on ? '#fff' : 'rgba(244,240,232,0.72)', border: on ? 'none' : '1px solid rgba(244,240,232,0.14)', cursor: 'pointer', fontSize: 12.5, fontWeight: 650 }}>{ru ? c.label : c.labelUz}</button>;
              })}
            </div>
          </div>
        </div>

        {/* v118.23 — tiles list uses dragScrollable: when scrollTop > 0
            the list scrolls normally (no gesture conflict); when at
            the top, pulling down dismisses the sheet. Matches native
            iOS bottom-sheet behaviour exactly. */}
        {/* tiles */}
        <div
          {...shell.dragScrollable}
          style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 16, overscrollBehavior: 'contain' }}
        >
          {(cat === 'all' && !q.trim()) && (
            <a href="tel:1059" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', marginBottom: 14, borderRadius: RM, background: 'var(--status-critical-bg, rgba(226,72,61,0.12))', border: '1px solid rgba(226,72,61,0.22)' }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--status-critical, #E2483D)', color: '#fff', display: 'grid', placeItems: 'center', flex: '0 0 auto', boxShadow: '0 4px 12px rgba(226,72,61,0.3)' }}><Phone size={19} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 750, color: '#B91C1C', letterSpacing: '-0.01em' }}>{ru ? 'Авария или ЧП?' : 'Avariya yoki favqulodda holat?'}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-secondary, #6F6A62)', marginTop: 1 }}>{ru ? 'Дежурный диспетчер · круглосуточно' : 'Navbatchi dispetcher · kechayu kunduz'}</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 750, color: 'var(--status-critical, #E2483D)', display: 'flex', alignItems: 'center', gap: 3, flex: '0 0 auto' }}>1059 <ChevronRight size={15} strokeWidth={2.6} /></div>
            </a>
          )}

          {list.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary, #6F6A62)' }}>
              <div style={{ width: 60, height: 60, borderRadius: 999, background: 'var(--surface-sunken, #EDE7DB)', color: 'var(--text-muted, #A8A29E)', display: 'grid', placeItems: 'center', margin: '0 auto 14px' }}><Search size={26} /></div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary, #1C1917)' }}>{ru ? 'Ничего не найдено' : 'Hech narsa topilmadi'}</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>{ru ? 'Попробуйте другой запрос' : 'Boshqa so\'rovni sinab ko\'ring'}</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {list.map(s => {
                const on = sel === s.category;
                const t = TONES[s.tone] || TONES.brand;
                return (
                  <button key={s.category} onClick={() => setSel(s.category)} style={{
                    position: 'relative', textAlign: 'left', cursor: 'pointer', overflow: 'hidden',
                    background: 'var(--surface, #fff)', borderRadius: RL, padding: 15,
                    border: on ? `2px solid ${t.ring}` : '1px solid var(--border-c, #E6DFD2)',
                    boxShadow: on ? `0 8px 20px ${t.glow}` : 'var(--shadow-sm, 0 1px 2px rgba(28,25,23,0.04))',
                    transform: on ? 'translateY(-1px)' : 'none', transition: 'border-color .15s, box-shadow .15s, transform .12s',
                  }}>
                    <div style={{ position: 'absolute', top: -24, left: -24, width: 78, height: 78, borderRadius: 999, background: t.tint, opacity: on ? 1 : 0.55 }} />
                    <div style={{ position: 'relative' }}>
                      <div style={{ width: 44, height: 44, borderRadius: 13, background: t.tint, color: t.fg, display: 'grid', placeItems: 'center', marginBottom: 11 }}>
                        <s.Icon size={22} />
                      </div>
                      <div style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-primary, #1C1917)' }}>{ru ? s.label : s.labelUz}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary, #6F6A62)', marginTop: 2, lineHeight: 1.3 }}>{ru ? s.sub : s.subUz}</div>
                    </div>
                    {s.tag && !on && (
                      <span style={{ position: 'absolute', top: 12, right: 12, fontSize: 9.5, fontWeight: 750, color: t.fg, background: t.tint, padding: '3px 7px', borderRadius: 999, textTransform: 'uppercase' }}>{ru ? s.tag : s.tagUz}</span>
                    )}
                    {on && <div style={{ position: 'absolute', top: 12, right: 12, width: 22, height: 22, borderRadius: 999, background: t.ring, color: '#fff', display: 'grid', placeItems: 'center' }}><Check size={13} strokeWidth={3} /></div>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* continue */}
        <div style={{ flexShrink: 0, padding: '12px 16px calc(env(safe-area-inset-bottom, 0px) + 18px)', borderTop: '1px solid var(--border-c, #E6DFD2)', background: 'var(--surface, #fff)' }}>
          <button onClick={() => sel && onPick(sel)} disabled={!sel} style={{
            width: '100%', padding: 14, borderRadius: RM, border: 'none',
            background: sel ? 'var(--brand, #F97316)' : 'var(--surface-sunken, #EDE7DB)',
            color: sel ? '#fff' : 'var(--text-muted, #A8A29E)', cursor: sel ? 'pointer' : 'default',
            fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', boxShadow: sel ? 'var(--sh-brand, 0 8px 22px rgba(249,115,22,0.26))' : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>{sel && selSvc ? <>{ru ? 'Продолжить' : 'Davom etish'} · {ru ? selSvc.label : selSvc.labelUz} <ArrowRight size={17} strokeWidth={2.4} /></> : (ru ? 'Выберите услугу' : 'Xizmatni tanlang')}</button>
        </div>
    </>
  );
}

// ── Step 2: form ─────────────────────────────────────────────
function RequestForm({ language, user, category, onBack, onClose, onCreate, onGoToRequests, shell }: {
  language: string; user: User | null; category: ExecutorSpecialization;
  onBack: () => void; onClose: () => void;
  onCreate: ResidentNewRequestFlowProps['onCreate']; onGoToRequests: () => void;
  shell: ShellDrag;
}) {
  const ru = language === 'ru';
  const svc = NR_SERVICES.find(s => s.category === category) || NR_SERVICES[0];
  const catInfo = SERVICE_CATEGORIES.find(c => c.id === category);
  const tone = TONES[svc.tone] || TONES.brand;
  const isTrash = category === 'trash';
  const [desc, setDesc] = useState('');
  const [priority, setPriority] = useState<RequestPriority>('medium');
  const [slotId, setSlotId] = useState('asap');
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [created, setCreated] = useState<Request | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Trash-specific structured fields
  const [trashType, setTrashType] = useState('');
  const [trashVolume, setTrashVolume] = useState('');
  const [trashDate, setTrashDate] = useState('');
  const [trashTime, setTrashTime] = useState('');

  const MAX_PHOTOS = 5;
  // v118.96 — raise FE size cap 3 → 10 MB. The 3 MB cap was hitting modern
  // iPhone camera shots constantly. NOTE: server (requests/crud.ts) caps
  // each photo at 350 KB base64 and SILENTLY DROPS oversize entries, so a
  // raise-only fix is a UX trap (user thinks photo attached, server
  // drops it). Companion fix below: compressImage() runs BEFORE the size
  // check, downsizing the camera input to 1280px JPEG q=0.8 — matches
  // the codebase-wide convention (CLAUDE.md "Фронт компрессит до 1280px
  // JPEG q=0.8 ~150-250KB"). Real-world camera shots land at ~200 KB
  // base64, comfortably under the server's 350 KB cap. The 10 MB FE
  // ceiling now only catches non-image junk.
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const valid = isTrash
    ? !!(trashType && trashVolume && trashDate && trashTime)
    : desc.trim().length >= 8;

  // v118.96 (merged) — photos pipeline:
  //   1. reject non-image and >10MB raw (defensive — non-image junk only)
  //   2. compress to 1280px max edge JPEG q=0.8 (~150-250 KB base64)
  //      via the shared compressImage util — server rejects any photo
  //      data-URL over ~350 KB, so without compression the photo was
  //      silently dropped (saved as NULL) and never appeared.
  //   3. push the compressed data URL into state.
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhotoError(null);
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) { setPhotoError(ru ? `Максимум ${MAX_PHOTOS} фото` : `Maksimum ${MAX_PHOTOS} ta rasm`); return; }
    const accepted = files.slice(0, remaining);
    const next: string[] = [];
    for (const file of accepted) {
      if (!file.type.startsWith('image/')) { setPhotoError(ru ? 'Только изображения' : 'Faqat rasmlar'); continue; }
      if (file.size > MAX_FILE_SIZE) { setPhotoError(ru ? 'Файл больше 10 МБ' : 'Fayl 10 MB dan katta'); continue; }
      const dataUrl = await compressImage(file).catch(() => null);
      if (dataUrl) next.push(dataUrl);
      else setPhotoError(ru ? 'Не удалось обработать изображение' : 'Rasmni qayta ishlab boʼlmadi');
    }
    setPhotos((p) => [...p, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const submit = async () => {
    setTouched(true);
    if (!valid || sending) return;
    setSending(true);

    let payload;
    if (isTrash) {
      const t = TRASH_TYPES.find(x => x.id === trashType);
      const v = TRASH_VOLUME.find(x => x.id === trashVolume);
      const typeLabel = t ? (ru ? t.label : t.labelUz) : trashType;
      const volLabel = v ? (ru ? v.label : v.labelUz) : trashVolume;
      let description = ru
        ? `Тип мусора: ${typeLabel}\nОбъём: ${volLabel}`
        : `Chiqindi turi: ${typeLabel}\nHajmi: ${volLabel}`;
      if (desc.trim()) description += `\n\n${ru ? 'Дополнительно' : 'Qo\'shimcha'}: ${desc.trim()}`;
      payload = {
        title: `${ru ? 'Вывоз мусора' : 'Chiqindi olib ketish'}: ${typeLabel}`,
        description,
        category,
        priority,
        scheduledDate: trashDate || undefined,
        scheduledTime: trashTime || undefined,
        photos: photos.length > 0 ? photos : undefined,
      };
    } else {
      const slot = NR_SLOTS.find(s => s.id === slotId);
      payload = {
        title: ru ? svc.label : svc.labelUz,
        description: desc.trim(),
        category,
        priority,
        scheduledDate: slot?.date,
        scheduledTime: slot?.time,
        photos: photos.length > 0 ? photos : undefined,
      };
    }

    const result = await onCreate(payload).catch(() => null);
    setSending(false);
    if (result) setCreated(result);
    else setPhotoError(ru ? 'Не удалось создать заявку. Попробуйте ещё раз.' : 'Ariza yaratilmadi. Qayta urinib ko\'ring.');
  };

  if (created) {
    const num = created.number ? `#${created.number}` : '';
    return (
      <div style={{ padding: 'calc(env(safe-area-inset-top, 0px) + 8px) 24px calc(env(safe-area-inset-bottom, 0px) + 28px)', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '0 0 18px' }}>
          <div style={{ width: 38, height: 5, borderRadius: 999, background: 'var(--border-strong, #D8CFBE)' }} />
        </div>
        <div style={{ width: 80, height: 80, borderRadius: 999, background: 'var(--status-active-bg, rgba(21,160,110,0.12))', color: 'var(--status-active, #15A06E)', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
          <Check size={42} strokeWidth={2.6} />
        </div>
        <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary, #1C1917)' }}>{ru ? `Заявка ${num} создана` : `Ariza ${num} yaratildi`}</div>
        <div style={{ fontSize: 14, color: 'var(--text-secondary, #6F6A62)', marginTop: 8, lineHeight: 1.45 }}>{ru ? 'Диспетчер назначит мастера в ближайшее время. Уведомим вас в приложении.' : 'Dispetcher tez orada usta tayinlaydi. Sizni ilovada xabardor qilamiz.'}</div>
        <button onClick={onGoToRequests} style={{ width: '100%', marginTop: 22, padding: 14, borderRadius: RM, background: 'var(--brand, #F97316)', color: '#fff', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: 'var(--sh-brand, 0 8px 22px rgba(249,115,22,0.26))' }}>{ru ? 'К моим заявкам' : 'Arizalarimga'}</button>
      </div>
    );
  }

  return (
    <>
        {/* v118.23 — same drag-area expansion as ServiceSheet: spread
            on the whole header so users grab anywhere; pill stays as
            a visual cue with pointer-events:none. */}
        {/* header */}
        <div
          {...shell.drag}
          style={{ flexShrink: 0, padding: 'calc(env(safe-area-inset-top, 0px) + 6px) 16px 14px', borderBottom: '1px solid var(--border-c, #E6DFD2)', background: 'var(--surface, #fff)', touchAction: 'pan-y' }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', padding: '0 0 10px', cursor: 'grab', pointerEvents: 'none' }} aria-hidden="true">
            <div style={{ width: 38, height: 5, borderRadius: 999, background: 'var(--border-strong, #D8CFBE)' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={onBack} aria-label={ru ? 'Назад' : 'Orqaga'} style={{ width: 36, height: 36, borderRadius: 999, background: 'var(--surface-sunken, #EDE7DB)', border: 'none', display: 'grid', placeItems: 'center', color: 'var(--text-secondary, #6F6A62)', cursor: 'pointer', flex: '0 0 auto' }}><ArrowLeft size={18} /></button>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: tone.tint, color: tone.fg, display: 'grid', placeItems: 'center', flex: '0 0 auto' }}><svc.Icon size={21} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary, #1C1917)' }}>{ru ? (catInfo?.name || svc.label) : (catInfo?.nameUz || svc.labelUz)}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary, #6F6A62)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatAddress(user?.address, user?.apartment)}</div>
            </div>
            <button onClick={onClose} aria-label={ru ? 'Закрыть' : 'Yopish'} style={{ width: 36, height: 36, borderRadius: 999, background: 'var(--surface-sunken, #EDE7DB)', border: 'none', display: 'grid', placeItems: 'center', color: 'var(--text-secondary, #6F6A62)', cursor: 'pointer', flex: '0 0 auto' }}><XIcon size={18} /></button>
          </div>
        </div>

        {/* v118.23 — body uses dragScrollable so the textarea + scrolling
            form content keeps normal vertical scroll, and only pulling
            down from scrollTop===0 dismisses the sheet. */}
        {/* body */}
        <div
          {...shell.dragScrollable}
          style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 16, overscrollBehavior: 'contain' }}
        >
          {!isTrash && (<>
          <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary, #1C1917)' }}>{ru ? 'Опишите проблему' : 'Muammoni tasvirlang'}</label>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={ru ? 'Например: капает из-под раковины, под ней лужа со вчера' : 'Masalan: rakovina ostidan suv oqyapti'} style={{
            width: '100%', minHeight: 92, marginTop: 8, padding: '12px 14px', boxSizing: 'border-box',
            background: 'var(--surface, #fff)', borderRadius: RS,
            border: `1px solid ${touched && !valid ? 'var(--status-critical, #E2483D)' : 'var(--border-c, #E6DFD2)'}`,
            fontSize: 14.5, color: 'var(--text-primary, #1C1917)', resize: 'none', outline: 'none', lineHeight: 1.4,
          }} />
          {touched && !valid && <div style={{ fontSize: 12, color: 'var(--status-critical, #E2483D)', marginTop: 4 }}>{ru ? 'Опишите проблему — минимум 8 символов' : 'Kamida 8 ta belgi yozing'}</div>}
          </>)}

          {isTrash && (<>
          {/* trash type */}
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary, #1C1917)' }}>{ru ? 'Тип мусора' : 'Chiqindi turi'} <span style={{ color: 'var(--status-critical, #E2483D)' }}>*</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {TRASH_TYPES.map(t => {
              const on = trashType === t.id;
              return <button key={t.id} onClick={() => setTrashType(t.id)} style={{
                textAlign: 'left', padding: '11px 12px', borderRadius: RM, cursor: 'pointer',
                background: on ? 'var(--brand-tint, #FFF3EA)' : 'var(--surface, #fff)',
                border: on ? '1.5px solid var(--brand, #F97316)' : '1px solid var(--border-c, #E6DFD2)',
              }}>
                <div style={{ fontSize: 18, lineHeight: 1 }}>{t.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 700, marginTop: 6, color: on ? 'var(--brand-dark, #EA580C)' : 'var(--text-primary, #1C1917)' }}>{ru ? t.label : t.labelUz}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary, #6F6A62)', marginTop: 1, lineHeight: 1.25 }}>{ru ? t.sub : t.subUz}</div>
              </button>;
            })}
          </div>

          {/* trash volume */}
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 18, marginBottom: 8, color: 'var(--text-primary, #1C1917)' }}>{ru ? 'Объём' : 'Hajmi'} <span style={{ color: 'var(--status-critical, #E2483D)' }}>*</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {TRASH_VOLUME.map(v => {
              const on = trashVolume === v.id;
              return <button key={v.id} onClick={() => setTrashVolume(v.id)} style={{
                textAlign: 'left', padding: '11px 13px', borderRadius: RM, cursor: 'pointer',
                background: on ? 'var(--brand-tint, #FFF3EA)' : 'var(--surface, #fff)',
                border: on ? '1.5px solid var(--brand, #F97316)' : '1px solid var(--border-c, #E6DFD2)',
              }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: on ? 'var(--brand-dark, #EA580C)' : 'var(--text-primary, #1C1917)' }}>{ru ? v.label : v.labelUz}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-secondary, #6F6A62)', marginTop: 1 }}>{ru ? v.sub : v.subUz}</div>
              </button>;
            })}
          </div>

          {/* trash date + time */}
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 18, marginBottom: 8, color: 'var(--text-primary, #1C1917)' }}>{ru ? 'Дата вывоза' : 'Olib ketish sanasi'} <span style={{ color: 'var(--status-critical, #E2483D)' }}>*</span></div>
          <input type="date" value={trashDate} min={minDate()} max={maxDate()} onChange={(e) => setTrashDate(e.target.value)} aria-label={ru ? 'Дата вывоза' : 'Olib ketish sanasi'} style={{
            width: '100%', padding: '11px 13px', boxSizing: 'border-box', background: 'var(--surface, #fff)',
            borderRadius: RS, border: '1px solid var(--border-c, #E6DFD2)', fontSize: 14.5, color: 'var(--text-primary, #1C1917)', outline: 'none',
          }} />
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 14, marginBottom: 8, color: 'var(--text-primary, #1C1917)' }}>{ru ? 'Время' : 'Vaqt'} <span style={{ color: 'var(--status-critical, #E2483D)' }}>*</span></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {TRASH_TIME_SLOTS.map(slot => {
              const on = trashTime === slot;
              return <button key={slot} onClick={() => setTrashTime(slot)} style={{
                padding: '9px 13px', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                background: on ? 'var(--brand, #F97316)' : 'var(--surface, #fff)',
                color: on ? '#fff' : 'var(--text-secondary, #6F6A62)',
                border: on ? 'none' : '1px solid var(--border-c, #E6DFD2)', fontVariantNumeric: 'tabular-nums',
              }}>{slot}</button>;
            })}
          </div>

          {/* trash optional details — reuses `desc` */}
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 18, marginBottom: 8, color: 'var(--text-primary, #1C1917)' }}>{ru ? 'Дополнительно' : 'Qo\'shimcha'} <span style={{ fontWeight: 500, color: 'var(--text-muted, #A8A29E)' }}>({ru ? 'необязательно' : 'ixtiyoriy'})</span></div>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={ru ? 'Этаж, место складирования, особые условия…' : 'Qavat, saqlash joyi, shartlar…'} style={{
            width: '100%', minHeight: 72, padding: '12px 14px', boxSizing: 'border-box',
            background: 'var(--surface, #fff)', borderRadius: RS, border: '1px solid var(--border-c, #E6DFD2)',
            fontSize: 14.5, color: 'var(--text-primary, #1C1917)', resize: 'none', outline: 'none', lineHeight: 1.4,
          }} />
          {touched && !valid && <div style={{ fontSize: 12, color: 'var(--status-critical, #E2483D)', marginTop: 6 }}>{ru ? 'Выберите тип, объём, дату и время' : 'Tur, hajm, sana va vaqtni tanlang'}</div>}
          </>)}

          {/* priority */}
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 18, marginBottom: 8, color: 'var(--text-primary, #1C1917)' }}>{ru ? 'Приоритет' : 'Ustuvorlik'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, background: 'var(--surface-sunken, #EDE7DB)', borderRadius: RM, padding: 4 }}>
            {([{ id: 'medium', label: ru ? 'Обычный' : 'Oddiy', crit: false }, { id: 'urgent', label: ru ? 'Срочный' : 'Shoshilinch', crit: true }] as const).map(p => {
              const on = priority === p.id;
              return <button key={p.id} onClick={() => setPriority(p.id as RequestPriority)} style={{
                padding: 10, borderRadius: 10, border: 'none', cursor: 'pointer',
                background: on ? (p.crit ? 'var(--status-critical, #E2483D)' : 'var(--surface, #fff)') : 'transparent',
                color: on ? (p.crit ? '#fff' : 'var(--text-primary, #1C1917)') : 'var(--text-secondary, #6F6A62)',
                fontSize: 13.5, fontWeight: on ? 750 : 600, boxShadow: on && !p.crit ? 'var(--shadow-sm, 0 1px 2px rgba(28,25,23,0.04))' : 'none',
              }}>{p.label}</button>;
            })}
          </div>

          {/* time slots — generic (trash uses its own date/time above) */}
          {!isTrash && (<>
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 18, marginBottom: 8, color: 'var(--text-primary, #1C1917)' }}>{ru ? 'Когда удобно' : 'Qachon qulay'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {NR_SLOTS.map(s => {
              const on = slotId === s.id;
              return <button key={s.id} onClick={() => setSlotId(s.id)} style={{
                textAlign: 'left', padding: '11px 13px', borderRadius: RM, cursor: 'pointer',
                background: on ? 'var(--brand-tint, #FFF3EA)' : 'var(--surface, #fff)',
                border: on ? '1.5px solid var(--brand, #F97316)' : '1px solid var(--border-c, #E6DFD2)',
              }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: on ? 'var(--brand-dark, #EA580C)' : 'var(--text-primary, #1C1917)', letterSpacing: '-0.01em' }}>{ru ? s.label : s.labelUz}</div>
                {(ru ? s.sub : s.subUz) && <div style={{ fontSize: 11.5, color: 'var(--text-secondary, #6F6A62)', marginTop: 1 }}>{ru ? s.sub : s.subUz}</div>}
              </button>;
            })}
          </div>
          </>)}

          {/* photos */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 18, marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary, #1C1917)' }}>{ru ? 'Фото' : 'Rasm'}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted, #A8A29E)', fontVariantNumeric: 'tabular-nums' }}>{photos.length}/{MAX_PHOTOS}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {photos.map((src, i) => (
              <div key={i} style={{ width: 72, height: 72, borderRadius: 12, overflow: 'hidden', position: 'relative', background: 'var(--surface-sunken, #EDE7DB)' }}>
                <img src={src} alt={ru ? `Фото к заявке ${i + 1}` : `Arizaga rasm ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button onClick={() => setPhotos(photos.filter((_, j) => j !== i))} aria-label={ru ? 'Удалить фото' : 'Rasmni o\'chirish'} style={{ position: 'absolute', top: 3, right: 3, width: 26, height: 26, borderRadius: 999, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center' }}><XIcon size={13} strokeWidth={3} /></button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <button onClick={() => fileInputRef.current?.click()} style={{ width: 72, height: 72, borderRadius: 12, background: 'var(--surface, #fff)', border: '1.5px dashed var(--border-strong, #D8CFBE)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, color: 'var(--text-secondary, #6F6A62)' }}>
                <Camera size={20} /><span style={{ fontSize: 10, fontWeight: 600 }}>{ru ? 'Добавить' : 'Qo\'shish'}</span>
              </button>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" multiple capture="environment" onChange={handlePhotoSelect} style={{ display: 'none' }} aria-label={ru ? 'Выбрать фото' : 'Rasm tanlang'} />
          {photoError && <div style={{ fontSize: 12, color: 'var(--status-critical, #E2483D)', marginTop: 8 }}>{photoError}</div>}
        </div>

        {/* sticky submit */}
        <div style={{ flexShrink: 0, padding: '12px 16px calc(env(safe-area-inset-bottom, 0px) + 18px)', borderTop: '1px solid var(--border-c, #E6DFD2)', background: 'var(--surface, #fff)' }}>
          <button onClick={submit} disabled={sending} style={{
            width: '100%', padding: 14, borderRadius: RM, border: 'none',
            background: 'var(--brand, #F97316)', color: '#fff', cursor: sending ? 'default' : 'pointer',
            fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', boxShadow: 'var(--sh-brand, 0 8px 22px rgba(249,115,22,0.26))',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: sending ? 0.8 : 1,
          }}>
            {sending ? <><Loader2 size={16} className="animate-spin" /> {ru ? 'Отправляем…' : 'Yuborilmoqda…'}</> : <><Send size={16} /> {ru ? 'Отправить заявку' : 'Arizani yuborish'}</>}
          </button>
        </div>
    </>
  );
}
