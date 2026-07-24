import { createPortal } from 'react-dom';
import { ArrowLeft, Package, ShoppingBag, ShoppingCart } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { SoftHaptic } from '../../services/softHaptic';
import { useIsMobile } from '../../hooks/useBreakpoint';

/**
 * MarketplaceBottomBar — /marketplace-scoped navigation.
 *
 * Deliberately NOT sharing code with components/BottomBar.tsx: that file
 * carries pre-existing v118.x drift (.kz-bottombar-portal, per-role tab
 * sets, feature-lock modal, preload cascade) that must survive
 * untouched. Sharing the pill styling would mean extracting primitives
 * out of BottomBar, i.e. editing it. So the visual chrome is duplicated
 * verbatim — same portal class, same inline styles, same CSS-var
 * fallbacks (--bb-pill-bg / --bb-pill-border / --bb-shadow /
 * --bb-inactive-fg / --bb-badge-ring, defined in index.css). Result:
 * dark-mode parity is free, and a reader switching between the two bars
 * reads them as one visual family.
 *
 * Items (fixed order): Товары · Заказы · Корзина · Назад.
 *   - Товары = the shop / storefront view (all products, filters reset).
 *   - All four items share the SAME neutral resting style; exactly one
 *     wears the active-tab orange highlight at a time (whichever tab
 *     is open). Cart previously had a permanent tinted-pill accent —
 *     removed because it read as "two tabs selected" whenever another
 *     tab was active. Corzina's count badge remains as the sole
 *     always-on visual for cart activity.
 *   - No FAB: with 4 items a centre element is 1+FAB+2 or 2+FAB+1,
 *     both unbalanced.
 *   - Назад rightmost per the current spec (Профиль removed — users
 *     reach it via /profile from anywhere else).
 */

interface Props {
  activeTab: 'shop' | 'favorites' | 'cart' | 'orders';
  cartCount: number;
  activeOrdersCount: number;
  language: 'ru' | 'uz';
  /**
   * Hide the bar while a sheet/modal is open on top of the page.
   * The bar sits at zIndex:1000 (see below) while inline sheets on this
   * page live at z-[110] — without this signal the bar covers the sheet's
   * primary-action buttons at the bottom of the viewport (BUG 1, Sprint
   * 87 v9). Mirrors the shared BottomBar's `modalCount > 0` check
   * ([BottomBar.tsx:166](../../components/BottomBar.tsx)) — same intent,
   * just via an explicit signal from the page instead of a store read,
   * because MarketplacePage's blanket `useModalPresence(true)` at line
   * 282 makes any modalCount read from here ambiguous.
   */
  hidden?: boolean;
  onShop: () => void;    // Товары: switch to shop tab, reset filters/search
  onOrders: () => void;  // Заказы: switch to orders tab
  onCart: () => void;    // Корзина: switch to cart tab
  onBack: () => void;    // Назад: navigate('/') flat, no history
}

// Duplicated verbatim from BottomBar.tsx (fireLightHaptic). Cheaper to
// copy 15 lines than to force an extraction that would touch that file.
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
  id: 'shop' | 'orders' | 'cart' | 'back';
  icon: typeof ArrowLeft;
  label: string;
  badge: number;
  active: boolean;
  onTap: () => void;
}

export function MarketplaceBottomBar({
  activeTab, cartCount, activeOrdersCount, language,
  hidden,
  onShop, onOrders, onCart, onBack,
}: Props) {
  // Mobile-only, same rule as the shared BottomBar — desktop already has
  // the horizontal .hidden.md:block tab strip at the top of the page,
  // and a floating pill over an already-navigable surface just competes.
  const isMobile = useIsMobile();
  if (!isMobile) return null;
  if (hidden) return null;

  const wrap = (fn: () => void) => () => { fireLightHaptic(); fn(); };

  const items: Item[] = [
    {
      id: 'shop',
      icon: ShoppingBag,
      label: language === 'ru' ? 'Товары' : 'Mahsulotlar',
      badge: 0,
      active: activeTab === 'shop',
      onTap: wrap(onShop),
    },
    {
      id: 'orders',
      icon: Package,
      label: language === 'ru' ? 'Заказы' : 'Buyurtma',
      badge: activeOrdersCount,
      active: activeTab === 'orders',
      onTap: wrap(onOrders),
    },
    {
      id: 'cart',
      icon: ShoppingCart,
      label: language === 'ru' ? 'Корзина' : 'Savat',
      badge: cartCount,
      active: activeTab === 'cart',
      onTap: wrap(onCart),
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
    // All four items share the same neutral resting style. Only the
    // active tab wears the orange tint + label — matches BottomBar.tsx
    // exactly, so no item competes with the active-tab highlight.
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
              // Cart's count wears the same brand-orange gradient the
              // page header used for its old cart chip — recognisable
              // as "cart total". Other counters (orders) stay red so
              // they still read as "something needs attention".
              background: item.id === 'cart'
                ? 'linear-gradient(135deg,#E8621A,#F59E0B)'
                : '#EF4444',
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
      aria-label={language === 'ru' ? 'Навигация магазина' : 'Do\'kon navigatsiyasi'}
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
