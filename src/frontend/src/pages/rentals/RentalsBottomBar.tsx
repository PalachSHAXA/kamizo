import { createPortal } from 'react-dom';
import { ArrowLeft, Home, Key, Heart } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { SoftHaptic } from '../../services/softHaptic';
import { useIsMobile } from '../../hooks/useBreakpoint';

/**
 * RentalsBottomBar — /apartment-rentals-scoped navigation.
 *
 * Sibling of MarketplaceBottomBar. Deliberately NOT sharing code with
 * either that or components/BottomBar.tsx: the shared BottomBar carries
 * v118.x drift (.kz-bottombar-portal), MarketplaceBottomBar carries its
 * own props/behaviour. Duplicating a small pill component verbatim is
 * cheaper than extracting a primitive that would need to touch either
 * file. All three share the same CSS vars (--bb-pill-bg / --bb-pill-border
 * / --bb-shadow / --bb-inactive-fg / --bb-badge-ring, defined in
 * index.css:419-424), so dark-mode parity is free and the three bars
 * read as one visual family.
 *
 * Items (fixed order): Смотреть · Мои · Избранное · Назад.
 *   - «Смотреть» is the shop/feed. Resets filters on tap (see caller).
 *   - «Мои» = my listings.
 *   - «Избранное» = client-side favourites (localStorage). No backend
 *     dependency — v1 plan explicitly deferred fav API.
 *   - «Назад» → navigate('/') flat, no history.
 *   - Cart is not a rentals concept — no fourth "primary" like the
 *     marketplace's «Корзина». All four items share the same neutral
 *     resting style; exactly one wears the orange active highlight at
 *     a time (whichever tab is open) — same rule the marketplace bar
 *     landed on after the "double-highlight" fix.
 */

interface Props {
  activeTab: 'feed' | 'mine' | 'favorites';
  favoritesCount: number;
  language: 'ru' | 'uz';
  /**
   * Hide the bar while a sheet/modal is open on top of the page. The
   * bar sits at zIndex:1000 while inline sheets live at z-[110]; without
   * this the bar would cover primary-action buttons at the bottom of
   * the sheet. Same pattern MarketplaceBottomBar uses.
   */
  hidden?: boolean;
  onFeed: () => void;      // Смотреть: switch to feed, reset filters
  onMine: () => void;      // Мои
  onFavorites: () => void; // Избранное
  onBack: () => void;      // Назад: navigate('/') flat
}

// Duplicated verbatim from MarketplaceBottomBar / BottomBar. Cheaper
// to copy 15 lines than to force an extraction that would touch either.
const fireLightHaptic = () => {
  if (!Capacitor.isNativePlatform()) return;
  if (Capacitor.getPlatform() === 'android') {
    Haptics.vibrate({ duration: 10 }).catch(() => {});
    return;
  }
  SoftHaptic.tap({ intensity: 0.30, sharpness: 0.00 }).catch(() => {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  });
};

interface Item {
  id: 'feed' | 'mine' | 'favorites' | 'back';
  icon: typeof ArrowLeft;
  label: string;
  badge: number;
  active: boolean;
  onTap: () => void;
}

export function RentalsBottomBar({
  activeTab, favoritesCount, language, hidden,
  onFeed, onMine, onFavorites, onBack,
}: Props) {
  const isMobile = useIsMobile();
  if (!isMobile) return null;
  if (hidden) return null;

  const wrap = (fn: () => void) => () => { fireLightHaptic(); fn(); };

  const items: Item[] = [
    {
      id: 'feed',
      icon: Home,
      label: language === 'ru' ? 'Смотреть' : 'Ko\'rish',
      badge: 0,
      active: activeTab === 'feed',
      onTap: wrap(onFeed),
    },
    {
      id: 'mine',
      icon: Key,
      label: language === 'ru' ? 'Мои' : 'Meniki',
      badge: 0,
      active: activeTab === 'mine',
      onTap: wrap(onMine),
    },
    {
      id: 'favorites',
      icon: Heart,
      label: language === 'ru' ? 'Избранное' : 'Sevimli',
      badge: favoritesCount,
      active: activeTab === 'favorites',
      onTap: wrap(onFavorites),
    },
    {
      id: 'back',
      icon: ArrowLeft,
      label: language === 'ru' ? 'Назад' : 'Orqaga',
      badge: 0,
      active: false,
      onTap: wrap(onBack),
    },
  ];

  const renderItem = (item: Item) => {
    const Icon = item.icon;
    return (
      <button
        key={item.id}
        type="button"
        onClick={item.onTap}
        aria-current={item.active ? 'page' : undefined}
        aria-label={item.label}
        style={{
          position: 'relative',
          background: item.active ? 'rgba(249,115,22,0.12)' : 'transparent',
          border: 'none',
          cursor: 'pointer',
          borderRadius: 999,
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: item.active ? '9px 15px' : '9px 11px',
          color: item.active ? '#EA580C' : 'var(--bb-inactive-fg, #9CA3AF)',
          minWidth: 0,
          minHeight: 0,
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <Icon
          style={{ width: 22, height: 22 }}
          strokeWidth={item.active ? 2.3 : 1.9}
        />
        {item.active && item.label && (
          <span style={{ fontSize: 13, fontWeight: 750, whiteSpace: 'nowrap' }}>{item.label}</span>
        )}
        {item.badge > 0 && (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              top: -2,
              right: -4,
              minWidth: 18,
              height: 18,
              padding: '0 4px',
              borderRadius: 999,
              // Favourites uses solid brand orange — no cart-gradient
              // like the marketplace's Корзина chip. Single accent,
              // matches the site rule.
              background: '#EF4444',
              color: '#FFFFFF',
              fontSize: 10,
              fontWeight: 800,
              display: 'grid',
              placeItems: 'center',
              border: '2px solid var(--bb-badge-ring, #FFFFFF)',
            }}
          >
            {item.badge > 9 ? '9+' : item.badge}
          </span>
        )}
      </button>
    );
  };

  const bar = (
    <div
      className="kz-bottombar-portal"
      role="navigation"
      aria-label={language === 'ru' ? 'Навигация аренды' : 'Ijara navigatsiyasi'}
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        padding: '0 14px env(safe-area-inset-bottom, 0px)',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          pointerEvents: 'auto',
          maxWidth: 480,
          margin: '0 auto',
          background: 'var(--bb-pill-bg, rgba(255,255,255,0.92))',
          backdropFilter: 'blur(16px) saturate(180%)',
          WebkitBackdropFilter: 'blur(16px) saturate(180%)',
          border: '1px solid var(--bb-pill-border, rgba(255,255,255,0.7))',
          borderRadius: 26,
          boxShadow: 'var(--bb-shadow, 0 10px 30px rgba(28,25,23,0.14), 0 2px 6px rgba(28,25,23,0.06))',
          padding: '8px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          gap: 4,
        }}
      >
        {items.map(renderItem)}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(bar, document.body) : bar;
}
