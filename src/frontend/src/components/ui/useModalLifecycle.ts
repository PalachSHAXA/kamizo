import { useEffect, useRef, type RefObject } from 'react';

import { useModalPresence } from '../../stores/modalStore';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface ModalLayer {
  id: symbol;
  panelRef: RefObject<HTMLDivElement>;
  layerRef: RefObject<HTMLDivElement>;
  closeOnEscape: () => boolean;
  requestClose: () => void;
  restoreFocus: HTMLElement | null;
}

interface ManagedAttributeState {
  hadInert: boolean;
  ariaHidden: string | null;
}

const layers: ModalLayer[] = [];
const managedBackground = new Map<HTMLElement, ManagedAttributeState>();
let originalBodyOverflow = '';

function topLayer() {
  return layers.at(-1);
}

function focusableElements(panel: HTMLElement) {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => !element.hasAttribute('disabled') && !element.closest('[hidden], [aria-hidden="true"], [inert]'),
  );
}

function restoreManagedBackground() {
  for (const [element, state] of managedBackground) {
    if (!state.hadInert) element.removeAttribute('inert');
    else element.setAttribute('inert', '');
    if (state.ariaHidden === null) element.removeAttribute('aria-hidden');
    else element.setAttribute('aria-hidden', state.ariaHidden);
  }
  managedBackground.clear();
}

function updateManagedBackground() {
  restoreManagedBackground();
  let branch: HTMLElement | null = topLayer()?.layerRef.current ?? null;
  while (branch?.parentElement) {
    const parent = branch.parentElement;
    for (const child of Array.from(parent.children)) {
      if (child === branch || !(child instanceof HTMLElement)) continue;
      managedBackground.set(child, {
        hadInert: child.hasAttribute('inert'),
        ariaHidden: child.getAttribute('aria-hidden'),
      });
      child.setAttribute('inert', '');
      child.setAttribute('aria-hidden', 'true');
    }
    if (parent === document.body) break;
    branch = parent;
  }
}

function handleKeyDown(event: KeyboardEvent) {
  const layer = topLayer();
  if (!layer) return;
  if (event.key === 'Escape') {
    if (!layer.closeOnEscape()) return;
    event.preventDefault();
    event.stopPropagation();
    layer.requestClose();
    return;
  }
  if (event.key !== 'Tab') return;

  const panel = layer.panelRef.current;
  if (!panel) return;
  const focusable = focusableElements(panel);
  if (focusable.length === 0) {
    event.preventDefault();
    panel.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement as HTMLElement | null;
  if (event.shiftKey && (active === first || !panel.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

function registerLayer(layer: ModalLayer) {
  if (layers.length === 0) {
    originalBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
  }
  layers.push(layer);
  updateManagedBackground();
}

function unregisterLayer(id: symbol) {
  const index = layers.findIndex((layer) => layer.id === id);
  if (index === -1) return false;
  const removedLayer = layers[index];
  const wasTop = index === layers.length - 1;
  for (const layer of layers.slice(index + 1)) {
    const target = layer.restoreFocus;
    if (
      !target?.isConnected
      || removedLayer.layerRef.current?.contains(target)
      || removedLayer.panelRef.current?.contains(target)
    ) {
      layer.restoreFocus = removedLayer.restoreFocus;
    }
  }
  layers.splice(index, 1);
  updateManagedBackground();
  if (layers.length === 0) {
    document.body.style.overflow = originalBodyOverflow;
    document.removeEventListener('keydown', handleKeyDown);
  }
  return wasTop;
}

interface UseModalLifecycleOptions {
  active: boolean;
  onClose: () => void;
  closeOnEscape?: boolean;
  returnFocus?: HTMLElement | null;
}

export function useModalLifecycle({
  active,
  onClose,
  closeOnEscape = true,
  returnFocus,
}: UseModalLifecycleOptions) {
  const panelRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(Symbol('modal-layer'));
  const onCloseRef = useRef(onClose);
  const closeOnEscapeRef = useRef(closeOnEscape);

  onCloseRef.current = onClose;
  closeOnEscapeRef.current = closeOnEscape;
  useModalPresence(active);

  useEffect(() => {
    if (!active) return;
    const id = idRef.current;
    const layer: ModalLayer = {
      id,
      panelRef,
      layerRef,
      closeOnEscape: () => closeOnEscapeRef.current,
      requestClose: () => onCloseRef.current(),
      restoreFocus: returnFocus ?? document.activeElement as HTMLElement | null,
    };
    registerLayer(layer);

    const focusFrame = requestAnimationFrame(() => {
      if (topLayer()?.id !== id) return;
      const panel = panelRef.current;
      if (!panel) return;
      (focusableElements(panel)[0] ?? panel).focus();
    });

    return () => {
      cancelAnimationFrame(focusFrame);
      const wasTop = unregisterLayer(id);
      if (wasTop && layer.restoreFocus?.isConnected && !layer.restoreFocus.closest('[inert]')) {
        layer.restoreFocus.focus();
      }
    };
  }, [active, returnFocus]);

  return {
    panelRef,
    layerRef,
    isTopLayer: () => topLayer()?.id === idRef.current,
  };
}
