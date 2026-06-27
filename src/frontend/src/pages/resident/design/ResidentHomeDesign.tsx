/* Resident home — ported 1:1 from Claude Design §01-glavnaya (kamizo-home.jsx).
   Verbatim structure/styles from the mockup; the dynamic parts (name, address,
   active count, swipe cards, approval, reschedule, meeting, announcements) are
   wired to real data via props. Includes the design's own floating TabBar — the
   global BottomBar is hidden for residents on this screen to avoid a double nav. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import {
  IBell, IPin, IWrench, IQR, ICard, ICar, ILock, ICheck, IClock, IChevronR,
  IUsers, IBolt, IUmbrella, IDownload, IStar, IPhone,
  SwipeCardStack,
} from './kamizoDesign';
import { useIsMobile } from '../../../hooks/useBreakpoint';
import { useThemeStore } from '../../../stores/themeStore';
import { NotificationsDropdown } from '../../../components/NotificationsDropdown';

const ru = (language: string, r: string, u: string) => (language === 'ru' ? r : u);

// v118.25 — Tashkent skyline silhouette (inline SVG).
//
// The design §01-glavnaya handoff references raster PNGs
// (screens/skyline-light.png + screens/skyline-dark.png) of an
// actual Tashkent skyline. DesignSync.get_file capped both files
// at 256 KiB (server-side limit) and returned `truncated: true`,
// so the persisted base64 was incomplete and decoded to broken
// PNGs. Per the user's Q3 fallback rule we ship a hand-built
// SVG of the real Tashkent silhouette instead — recognisable
// landmarks left-to-right:
//
//   1. Hotel Uzbekistan       (Soviet-era twin-curve tower)
//   2. International Hotel    (modern slim tower)
//   3. Khast Imam mosque dome (cental dome + 2 minarets)
//   4. Hazrati Imam complex   (smaller dome cluster)
//   5. Tashkent TV Tower      (375 m — the city's tallest)
//   6. Markaziy Bank tower    (modernist box, antenna)
//   7. Magic City group       (cluster of 3 modern towers)
//   8. Plaza Tower            (slim residential tower)
//   9. Trade Centre block     (low rectangular slab)
//
// Theme-aware:
//   • DARK hero  → silhouette painted cream (#FAFAF9), warm amber
//                  window dots — silhouette glows against the dark
//                  brown sky.
//   • LIGHT hero → silhouette painted deep warm brown (#4A3B30),
//                  pale-cream window dots — a backlit city against
//                  the warm beige sky.
// preserveAspectRatio xMidYMax meet so the skyline always anchors
// to the BOTTOM edge of the hero across iPhone SE → 17 Pro Max
// widths (the design's PNGs do the same).
function TashkentSkyline({ theme }: { theme: 'light' | 'dark' }) {
  const buildingFill = theme === 'dark' ? '#FAFAF9' : '#4A3B30';
  const windowFill = theme === 'dark' ? 'rgba(255,231,194,0.78)' : 'rgba(255,231,194,0.85)';
  const opacity = theme === 'dark' ? 0.55 : 0.4;
  return (
    <svg
      viewBox="0 0 400 140"
      preserveAspectRatio="xMidYMax meet"
      aria-hidden
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, width: '100%', height: '75%', opacity, pointerEvents: 'none' }}
    >
      <g fill={buildingFill}>
        {/* 1. Hotel Uzbekistan — distinctive twin-curve tower */}
        <path d="M2 88 L2 138 L46 138 L46 88 Q46 60 38 56 L38 50 L34 50 L34 56 Q30 58 30 64 L18 64 Q18 58 14 56 L14 50 L10 50 L10 56 Q2 60 2 88 Z" />
        {/* 2. International Hotel — slim modern tower */}
        <rect x="52" y="42" width="22" height="96" />
        <rect x="60" y="32" width="6" height="10" />
        <polygon points="63,28 60,32 66,32" />
        {/* 3. Khast Imam mosque — central dome + two minarets */}
        <rect x="80" y="106" width="48" height="32" />
        <path d="M104 106 Q104 80 96 78 Q104 76 104 60 Q104 76 112 78 Q104 80 104 106 Z" />
        <circle cx="104" cy="78" r="14" />
        <rect x="82" y="62" width="5" height="44" />
        <circle cx="84.5" cy="60" r="3" />
        <polygon points="84.5,52 82,60 87,60" />
        <rect x="121" y="62" width="5" height="44" />
        <circle cx="123.5" cy="60" r="3" />
        <polygon points="123.5,52 121,60 126,60" />
        {/* 4. Hazrati Imam smaller dome cluster */}
        <rect x="134" y="110" width="30" height="28" />
        <path d="M149 110 Q149 96 144 95 Q149 94 149 86 Q149 94 154 95 Q149 96 149 110 Z" />
        <circle cx="149" cy="95" r="8" />
        {/* 5. Tashkent TV Tower — 375 m, three-leg base, observation pod */}
        <polygon points="180,138 188,82 198,138" />
        <polygon points="184,138 188,82 192,138" />
        <rect x="184" y="74" width="8" height="14" rx="1.5" />
        <rect x="180" y="66" width="16" height="9" rx="2" />
        <rect x="186" y="50" width="4" height="16" />
        <rect x="184" y="42" width="8" height="9" rx="1.5" />
        <rect x="187" y="22" width="2" height="20" />
        <circle cx="188" cy="20" r="2.2" />
        {/* 6. Markaziy Bank tower — modernist with antenna */}
        <rect x="208" y="58" width="28" height="80" />
        <rect x="220" y="44" width="4" height="14" />
        <polygon points="222,38 220,44 224,44" />
        {/* 7. Magic City — cluster of 3 modern towers (stepped heights) */}
        <rect x="244" y="72" width="20" height="66" />
        <rect x="266" y="52" width="22" height="86" />
        <rect x="290" y="64" width="18" height="74" />
        {/* 7b. roof crowns */}
        <polygon points="254,72 244,76 264,76" />
        <polygon points="277,52 266,58 288,58" />
        {/* 8. Plaza Tower — slim residential */}
        <rect x="316" y="46" width="14" height="92" />
        <rect x="321" y="40" width="4" height="6" />
        {/* 9. Trade Centre block — low slab */}
        <rect x="336" y="96" width="62" height="42" />
        <rect x="336" y="90" width="62" height="6" />
      </g>
      <g fill={windowFill}>
        {/* Hotel Uzbekistan windows */}
        {[0,1,2,3,4].map(r => [6,12,18,24,30,36].map((x, i) => (
          <rect key={`hu-${r}-${i}`} x={x} y={94 + r*9} width={3.5} height={4} rx={0.4} />
        ))).flat()}
        {/* International Hotel windows */}
        {[0,1,2,3,4,5,6,7,8,9].map(r => [54, 60, 67].map((x, i) => (
          <rect key={`ih-${r}-${i}`} x={x} y={48 + r*9} width={2.6} height={3.5} rx={0.4} />
        ))).flat()}
        {/* Markaziy Bank windows */}
        {[0,1,2,3,4,5,6,7].map(r => [210, 216, 222, 228, 233].map((x, i) => (
          <rect key={`mb-${r}-${i}`} x={x} y={64 + r*9} width={2.6} height={3.5} rx={0.4} />
        ))).flat()}
        {/* Magic City windows */}
        {[0,1,2,3,4,5,6].map(r => [246, 251, 257, 262].map((x, i) => (
          <rect key={`mc1-${r}-${i}`} x={x} y={78 + r*8} width={2.4} height={3} rx={0.3} />
        ))).flat()}
        {[0,1,2,3,4,5,6,7,8].map(r => [268, 273, 279, 284].map((x, i) => (
          <rect key={`mc2-${r}-${i}`} x={x} y={60 + r*8} width={2.4} height={3} rx={0.3} />
        ))).flat()}
        {[0,1,2,3,4,5,6,7].map(r => [292, 297, 302].map((x, i) => (
          <rect key={`mc3-${r}-${i}`} x={x} y={70 + r*8} width={2.4} height={3} rx={0.3} />
        ))).flat()}
        {/* Plaza Tower */}
        {[0,1,2,3,4,5,6,7,8,9,10].map(r => [318, 323, 327].map((x, i) => (
          <rect key={`pt-${r}-${i}`} x={x} y={52 + r*8} width={2.2} height={3} rx={0.3} />
        ))).flat()}
        {/* Trade Centre */}
        {[0,1,2,3].map(r => [340, 348, 356, 364, 372, 380, 388].map((x, i) => (
          <rect key={`tc-${r}-${i}`} x={x} y={102 + r*9} width={3} height={3.5} rx={0.4} />
        ))).flat()}
      </g>
    </svg>
  );
}

// v118.25 — 14-star twinkle field for the dark hero sky.
// Coordinates are %, sizes are px. Animation keyframes
// (kzTwinkle) live in index.css.
const HERO_STARS: Array<[number, number, number]> = [
  [9,16,2.5],[18,30,2],[27,12,2.5],[35,24,2],[44,15,2.5],[7,40,2],
  [61,11,2.5],[69,26,2],[78,15,3],[87,30,2],[92,19,2.5],[54,32,1.8],[15,52,2],[88,44,2],
];

function HomeHero({ name, apt, activeCount, language, onMenu, onBell, bellOpen, unread, brand, logo }: any) {
  // v118.84 — STEP 2 (clean fixed conversion on verified v225 baseline).
  // ResizeObserver measures the hero's height on every layout change
  // (greeting wrap, theme toggle, safe-area, tenant name swap) and
  // writes it to a CSS variable --home-hero-h on documentElement.
  // The ResidentHomeDesign wrapper reserves that height as paddingTop
  // so the first content section starts right below the hero.
  // Cleanup on unmount removes the var so other .kz-screen pages
  // aren't affected.
  const heroRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const update = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      if (h > 0) document.documentElement.style.setProperty('--home-hero-h', `${h}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty('--home-hero-h');
    };
  }, []);
  // v118.25 — full-bleed hero per new screens/01-glavnaya.html.
  // Theme-aware via useThemeStore (Q1=B keeps tenant logo/name in
  // the center; Q2=B keeps time-of-day greeting). Compact typography
  // per handoff: name 30 / lineHeight 1.05; address pill 8x13;
  // count chip 8x12 with digit 22. Theme toggle now rendered
  // top-right next to the bell. Dark variant gets a 14-star
  // twinkle field (HERO_STARS); light variant gets the sun disc.
  const theme = useThemeStore((s) => s.theme);
  // v118.121 — toggleTheme was the home-header theme button's onClick;
  // button gone (redundant with Profile screen's ThemeToggle), so the
  // selector goes too. `theme` + `isLight` stay — they drive the
  // hero's theme-aware colour tokens below.
  const isLight = theme === 'light';
  const hour = new Date().getHours();
  const greetRu = hour < 6 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
  const greetUz = hour < 6 ? 'Hayrli tun' : hour < 12 ? 'Hayrli tong' : hour < 18 ? 'Hayrli kun' : 'Hayrli kech';

  const bg = isLight
    ? 'linear-gradient(165deg, #FFE2B0 0%, #FFC889 46%, #F6AF6A 100%)'
    : 'linear-gradient(160deg, #4A3B30 0%, #34291F 55%, #2A2018 100%)';
  const heroEdge = isLight ? '#F6AF6A' : '#34291F';
  const onHero = isLight ? '#3A2A1C' : '#F4F0E8';
  const onHeroSoft = isLight ? 'rgba(58,42,28,0.62)' : 'rgba(244,240,232,0.78)';
  const onHeroSofter = isLight ? 'rgba(58,42,28,0.55)' : 'rgba(244,240,232,0.7)';
  const glassBg = isLight ? 'rgba(255,255,255,0.32)' : 'rgba(244,240,232,0.12)';
  const glassBorder = isLight ? 'rgba(58,42,28,0.12)' : 'rgba(244,240,232,0.14)';
  const pinColor = isLight ? '#C2410C' : '#FB923C';
  const chipBg = isLight ? 'rgba(255,255,255,0.5)' : 'rgba(249,115,22,0.22)';
  const chipBorder = isLight ? 'rgba(194,65,12,0.22)' : 'rgba(249,115,22,0.4)';
  const chipNum = isLight ? '#C2410C' : '#FDBA74';
  // Menu burger bars + brand-K letter stay orange in BOTH themes (brand
  // identity), but use the darker C2410C in light mode so the orange
  // doesn't bleach against the beige sky.
  const menuStroke = isLight ? '#C2410C' : '#FDBA74';
  // Wash gradient over the hero — warm sun-glow in light mode, the
  // existing brand-orange / amber radial blend in dark mode.
  const washBg = isLight
    ? 'radial-gradient(60% 50% at 84% -6%, rgba(255,247,230,0.85) 0%, transparent 60%)'
    : 'radial-gradient(90% 70% at 88% -10%, rgba(251,146,60,0.5) 0%, transparent 55%), radial-gradient(70% 60% at 0% 110%, rgba(217,119,6,0.18) 0%, transparent 60%)';
  const washOpacity = isLight ? 0.8 : 0.55;
  const wordmarkColor = isLight ? '#3A2A1C' : '#F4F0E8';

  return (
    <div
      ref={heroRef}
      style={{
        // v118.84 STEP 2 — position:fixed (was sticky in v225).
        // Rubber-band overscroll on .main-content cannot drag a
        // viewport-fixed element. v225 was visually correct but
        // sticky bounced with iOS WKWebView's elastic scroll.
        // padding-top: env(safe-area-inset-top) + 14 — unchanged
        // from v225/v222 → icon row below notch, gradient fills box.
        // index.css's kzPagePushIn/PopIn end-keyframe is `transform:
        // none` (v224, retained) → no lingering containing block
        // after page-enter animation, so the fixed hero is truly
        // viewport-fixed once the animation completes. DURING the
        // 280ms enter animation, kz-screen has translateX → fixed
        // hero slides in WITH the page (intended).
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        // v118.86 — defensive GPU layer. translateZ(0) is an identity
        // visual transform but forces iOS WebKit to render the hero on
        // its own compositor layer that is independent of document/
        // WebView overscroll translation. Even if some residual quirk
        // tries to bounce content, the hero is on a separate layer that
        // doesn't move. willChange:transform makes the GPU promotion
        // explicit. Safe because hero has no position:fixed descendants
        // (children are positioned absolute/relative to the hero box).
        transform: 'translateZ(0)',
        willChange: 'transform',
        background: bg,
        // v118.25 — FULL-BLEED per new handoff. Sky paints the
        // status-bar safe area too; bottom corners stay rounded
        // (xl). padding-top includes env(safe-area-inset-top) so
        // the menu / logo / bell row never collides with the notch.
        // bg fills the entire padding box → the notch zone is
        // painted with the hero gradient, eliminating any beige
        // strip above the hero.
        borderRadius: '0 0 28px 28px',
        margin: 0,
        // v118.88 — defensive padding-top via max(): floor of 68px
        // guarantees the icon row (44px buttons) sits clearly below
        // ANY notch / Dynamic Island even if env(safe-area-inset-top)
        // returns 0 in some WKWebView contexts (the failure mode in
        // v228-v229 where drawer + bell were cut by the status bar).
        // On a real notched device, env(safe-area-inset-top) ≈ 47-59
        // and the calc adds +18 → ~65-77px, which the 68px floor
        // gracefully clears. Side padding (18) and bottom (26)
        // unchanged.
        padding: 'max(68px, calc(env(safe-area-inset-top, 0px) + 18px)) 18px 26px',
        overflow: 'hidden',
        color: onHero,
      }}
    >
      <div style={{ position: 'absolute', inset: 0, opacity: washOpacity, background: washBg, pointerEvents: 'none' }} />
      {/* Sun disc — light theme only, top-right of the hero per handoff */}
      {isLight && (
        <div style={{
          position: 'absolute', top: -26, right: 6, width: 150, height: 150, borderRadius: '50%',
          background: 'radial-gradient(circle at 50% 50%, #FFFBEF 0%, #FFE79A 34%, rgba(252,211,77,0.55) 58%, rgba(251,191,36,0) 72%)',
          pointerEvents: 'none',
        }} />
      )}
      {/* Stars — dark theme only, twinkle via @keyframes kzTwinkle */}
      {!isLight && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} aria-hidden>
          {HERO_STARS.map(([x, y, size], i) => (
            <span key={i} style={{
              position: 'absolute', left: `${x}%`, top: `${y}%`,
              width: size, height: size, borderRadius: '50%', background: '#F4F0E8',
              animation: `kzTwinkle ${3 + (i % 3)}s ease-in-out ${(i * 0.22).toFixed(2)}s infinite`,
            }} />
          ))}
        </div>
      )}
      {/* v118.27 — BOTH skyline variants are now the user's real
          Tashkent raster PNGs from the design handoff. LIGHT
          variant re-exported smaller (171 KB after DesignSync, IEND
          intact, 720×214) — replaces the inline SVG fallback that
          v166 was using. DARK variant unchanged from v166 (169 KB,
          880×209). Per-theme opacity matches the design's handoff:
          dark sky 0.62, light sky 0.5 (the beige hero needs a
          softer silhouette so the dark-brown buildings don't fight
          the warm gradient). Wrapper is identical for both — full-
          bleed absolute, anchored to the hero's bottom edge,
          objectPosition:bottom + width:100%/height:auto so the
          aspect ratio is preserved at every viewport from SE to
          17 Pro Max. The TashkentSkyline SVG component stays
          defined in this file as a safety net in case the PNGs
          ever fail to load on a particular device. */}
      <img
        src={isLight ? '/screens/skyline-light.png' : '/screens/skyline-dark.png'}
        alt=""
        aria-hidden
        draggable={false}
        style={{
          position: 'absolute',
          left: 0, right: 0, bottom: 0, width: '100%',
          height: 'auto',
          objectFit: 'cover',
          objectPosition: 'bottom',
          opacity: isLight ? 0.5 : 0.62,
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <button onClick={onMenu} style={{ width: 44, height: 44, borderRadius: 14, background: glassBg, border: `1px solid ${glassBorder}`, display: 'grid', placeItems: 'center', cursor: 'pointer' }} aria-label="Меню">
          <svg width="22" height="15" viewBox="0 0 22 15"><rect y="0" width="22" height="3" rx="1.5" fill={menuStroke}/><rect y="6" width="15" height="3" rx="1.5" fill={menuStroke}/><rect y="12" width="22" height="3" rx="1.5" fill={menuStroke}/></svg>
        </button>
        {/* Centered Kamizo wordmark — bigger K tile (34) + bigger Kamizo (19) per LEFT mockup.
            Every text node below has an EXPLICIT color (hex literals via wordmarkColor) so
            inheritance from body{color:#1a1a1a} cannot turn the cream text dark even if
            the CSS bundle is the old cached one. */}
        {/* `whiteSpace: 'nowrap'` on both wrapper and label so multi-word
             УК names ("Kamizo Demo", "Sky Park Tashkent") stay on a
             single line. The absolute-positioned wrapper still
             shrink-to-fits content, but text inside it can no longer
             break at the inter-word space and stack vertically. */}
        <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', display: 'flex', alignItems: 'center', gap: 10, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          {logo ? (
            // Real УК logo from tenants.logo (data:image/…;base64,…) routed
            // through useTenantStore. White inner background mirrors the
            // sidebar chip so transparent PNGs read on either sky.
            <div style={{ width: 34, height: 34, borderRadius: 10, background: '#FFFFFF', display: 'grid', placeItems: 'center', overflow: 'hidden', flex: '0 0 auto', border: '1px solid rgba(249,115,22,0.4)' }}>
              <img src={logo} alt={brand || 'Kamizo'} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
          ) : (
            // No logo on file — letter-chip from the УК name (first letter)
            // instead of a hardcoded "K", so a brand-new tenant without a
            // logo doesn't impersonate the Kamizo brandmark.
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(249,115,22,0.22)', border: '1px solid rgba(249,115,22,0.4)', display: 'grid', placeItems: 'center', color: menuStroke, fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', flex: '0 0 auto' }}>{(brand || 'K').trim().charAt(0).toUpperCase()}</div>
          )}
          <div style={{ fontSize: 19, fontWeight: 700, color: wordmarkColor, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>{brand || 'Kamizo'}</div>
        </div>
        {/* v118.121 — theme toggle removed from the home header per
            redundancy with the Profile screen's ThemeToggle. Bell is
            now the only right-cluster control. Wrapper kept (still
            a flex row) so future siblings can be added cleanly. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={onBell} style={{ position: 'relative', width: 44, height: 44, borderRadius: 14, background: bellOpen ? 'var(--brand, #F97316)' : glassBg, border: `1px solid ${glassBorder}`, display: 'grid', placeItems: 'center', cursor: 'pointer', color: bellOpen ? '#fff' : onHero }} aria-label="Уведомления">
            <IBell size={20} />
            {unread > 0 && <span style={{ position: 'absolute', top: 8, right: 9, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 999, background: '#EF4444', color: '#fff', fontSize: 10, fontWeight: 800, display: 'grid', placeItems: 'center', border: `2px solid ${heroEdge}` }}>{unread}</span>}
          </button>
        </div>
      </div>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14 }}>
        <div style={{ minWidth: 0 }}>
          {/* v118.25 — compact greeting per handoff (14 instead of 15
              + letterSpacing -0.01em). Greeting stays time-of-day
              driven per Q2=B. */}
          <div style={{ fontSize: 14, fontWeight: 600, color: onHeroSoft, letterSpacing: '-0.01em' }}>{ru(language, greetRu, greetUz)} 👋</div>
          {/* v118.25 — compact name per handoff: 30 / 1.05 / mt 3
              (v164 had 48 / 1 / 6). */}
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05, marginTop: 3, color: onHero }}>{name}</div>
          {/* v118.25 — compact glass address pill per handoff:
              padding 8x13, marginTop 14, borderRadius 13.
              Hide the whole pin+address chip when there's no
              address — otherwise stub accounts see an empty pill. */}
          {apt && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 14, padding: '8px 13px', background: glassBg, border: `1px solid ${glassBorder}`, backdropFilter: 'blur(8px)', borderRadius: 13, fontSize: 13.5, fontWeight: 600, color: onHero, letterSpacing: '-0.01em' }}>
              <IPin size={15} style={{ color: pinColor }} />{apt}
            </div>
          )}
        </div>
        {/* v118.25 — compact active-count chip per handoff: padding
            8x12, borderRadius 13, digit 22, sub 10.5 — no fixed
            minWidth (was 16x18 / radius 18 / digit 34 / sub 11 /
            minWidth 88 in v164). */}
        <div style={{ flex: '0 0 auto', padding: '8px 12px', borderRadius: 13, background: chipBg, border: `1px solid ${chipBorder}`, textAlign: 'center', backdropFilter: 'blur(6px)' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: chipNum, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{activeCount}</div>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: onHeroSofter, marginTop: 3, lineHeight: 1.2 }}>{ru(language, 'активные', 'faol')}<br/>{ru(language, 'заявки', 'arizalar')}</div>
        </div>
      </div>
    </div>
  );
}

function QuickTiles({ onNewRequest, navigate, language, passCount = 0, vehicleCount = 0 }: any) {
  const tiles = [
    { Icon: IWrench, label: ru(language, 'Заявка', 'Ariza'), onClick: onNewRequest },
    { Icon: IQR, label: ru(language, 'Пропуск', 'Ruxsat'), onClick: () => navigate('/guest-access'), badge: passCount },
    { Icon: ICard, label: ru(language, 'Оплата', 'To\'lov'), soon: true },
    { Icon: ICar, label: ru(language, 'Авто', 'Avto'), onClick: () => navigate('/vehicles'), badge: vehicleCount },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
      {tiles.map((t, i) => (
        // v129 P1 — "Оплата" was a soon-flagged tile (Lock icon) but
        // the button still kept registering active-state taps. disabled
        // + aria-disabled + reduced opacity + non-pointer cursor makes
        // it visibly inactive and unresponsive to tap. Matches the v127
        // ResidentProfilePage disabled-tile convention.
        <button key={i} onClick={t.onClick} disabled={!t.onClick} aria-disabled={!t.onClick} style={{ position: 'relative', background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 20, padding: '14px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: t.onClick ? 'pointer' : 'default', opacity: t.onClick ? 1 : 0.7, boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ position: 'relative', width: 46, height: 46, borderRadius: 999, background: 'var(--brand-tint)', color: 'var(--brand-dark)', display: 'grid', placeItems: 'center' }}>
            <t.Icon size={22} stroke={1.9} />
            {t.badge > 0 && (
              <span style={{ position: 'absolute', top: -4, right: -6, minWidth: 20, height: 20, padding: '0 6px', borderRadius: 999, background: 'var(--brand)', color: '#fff', fontSize: 11, fontWeight: 800, display: 'grid', placeItems: 'center', boxShadow: '0 2px 6px rgba(249,115,22,0.4)', border: '2px solid var(--surface)' }}>{t.badge}</span>
            )}
            {t.soon && (
              <span style={{ position: 'absolute', top: -4, right: -4, width: 20, height: 20, borderRadius: 999, background: 'var(--surface)', color: 'var(--text-muted)', display: 'grid', placeItems: 'center', boxShadow: '0 2px 6px rgba(28,25,23,0.12)', border: '1px solid var(--border-c)' }}><ILock size={11} /></span>
            )}
          </div>
          <span style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--text-primary)' }}>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

function ApprovalCard({ req, language, onApprove, onDetails }: any) {
  // LEFT mockup shows "{executor} · работа заняла {duration}". Compose only when both are known.
  const fmtDur = (sec?: number) => {
    if (!sec) return null;
    const m = Math.floor(sec / 60);
    if (m < 60) return `${m} ${ru(language, 'мин', 'daq')}`;
    const h = Math.floor(m / 60); const r = m % 60;
    return r === 0 ? `${h} ${ru(language, 'ч', 'soat')}` : `${h} ${ru(language, 'ч', 'soat')} ${r} ${ru(language, 'мин', 'daq')}`;
  };
  const dur = fmtDur(req.workDuration);
  const subtitle = req.executorName
    ? (dur ? `${req.executorName} · ${ru(language, 'работа заняла', 'ish davom etdi')} ${dur}` : req.executorName)
    : null;
  return (
    <div style={{ background: 'linear-gradient(135deg, #FFF3EA 0%, #FFE6D2 100%)', border: '1px solid var(--brand-200)', borderRadius: 20, padding: 16, boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 13, background: '#fff', color: 'var(--brand-dark)', display: 'grid', placeItems: 'center', flex: '0 0 auto', boxShadow: '0 0 0 4px rgba(249,115,22,0.12)' }}><ICheck size={22} stroke={2.4} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '0.04em', color: 'var(--brand-dark)', textTransform: 'uppercase' }}>{ru(language, 'Ждёт вашей оценки', 'Bahoyingiz kutilmoqda')}</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>{req.title} · #{req.number}</div>
          {subtitle && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>{subtitle}</div>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={onApprove} style={{ flex: 1, padding: 12, borderRadius: 14, background: 'var(--brand)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, boxShadow: 'var(--sh-brand)' }}>{ru(language, 'Принять работу', 'Ishni qabul qilish')}</button>
        <button onClick={onDetails} style={{ padding: '12px 16px', borderRadius: 14, background: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border-c)', cursor: 'pointer', fontSize: 14, fontWeight: 650 }}>{ru(language, 'Подробнее', 'Batafsil')}</button>
      </div>
    </div>
  );
}

function MeetingWidget({ meeting, language, onOpen }: any) {
  return (
    <button onClick={onOpen} style={{ width: '100%', textAlign: 'left', background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 20, padding: 16, cursor: 'pointer', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.04em', padding: '4px 9px', borderRadius: 999, background: 'var(--status-active-bg)', color: 'var(--status-active)', textTransform: 'uppercase' }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--status-active)' }} />{ru(language, 'Голосование', 'Ovoz berish')}
        </span>
        <IUsers size={18} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.25 }}>{meeting.title || ru(language, 'Собрание жильцов', 'Yig\'ilish')}</div>
      <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 700, color: 'var(--brand-dark)' }}>{ru(language, 'Перейти к голосованию', 'Ovoz berishga')} <IChevronR size={16} /></div>
    </button>
  );
}

function BalanceCard({ language }: any) {
  const month = new Date().toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', { month: 'long' });
  return (
    <div style={{ background: 'var(--dark-surface)', borderRadius: 20, padding: 18, color: 'var(--text-on-dark)', position: 'relative', overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}>
      <div style={{ position: 'absolute', right: -30, top: -30, width: 130, height: 130, borderRadius: 999, background: 'rgba(249,115,22,0.16)' }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', color: 'rgba(244,240,232,0.6)', textTransform: 'uppercase' }}>{ru(language, `Оплата ЖКУ · ${month}`, `To'lov · ${month}`)}</div>
        <span style={{ fontSize: 10.5, fontWeight: 800, padding: '3px 9px', borderRadius: 999, background: 'rgba(244,240,232,0.12)', color: 'rgba(244,240,232,0.8)', textTransform: 'uppercase' }}>{ru(language, 'Скоро', 'Tez')}</span>
      </div>
      <div style={{ position: 'relative', fontSize: 13.5, color: 'rgba(244,240,232,0.7)', marginTop: 12 }}>{ru(language, 'Онлайн-оплата и счётчики — в разработке', 'Onlayn to\'lov — ishlanmoqda')}</div>
      <button disabled style={{ position: 'relative', width: '100%', marginTop: 14, padding: 12, borderRadius: 14, border: 'none', cursor: 'not-allowed', background: 'var(--brand)', color: '#fff', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: 0.6 }}>
        {ru(language, 'Оплатить онлайн', 'Onlayn to\'lash')} <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'rgba(255,255,255,0.25)' }}>{ru(language, 'СКОРО', 'TEZ')}</span>
      </button>
    </div>
  );
}

function AnnMini({ items, language, onOpen }: any) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 20, boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
      {items.slice(0, 2).map((a: any, i: number) => {
        const urgent = a.priority === 'urgent';
        const time = a.createdAt ? new Date(a.createdAt).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', { day: 'numeric', month: 'short' }) : '';
        return (
          <button key={a.id || i} onClick={onOpen} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', border: 'none', background: 'transparent', cursor: 'pointer', borderBottom: i < Math.min(items.length, 2) - 1 ? '1px solid var(--hairline)' : 'none' }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: urgent ? 'var(--status-critical-bg)' : 'var(--status-info-bg)', color: urgent ? 'var(--status-critical)' : 'var(--status-info)', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>{urgent ? <IBolt size={18} /> : <IUmbrella size={18} />}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>{time}{urgent ? ru(language, ' · срочно', ' · shoshilinch') : ''}</div>
            </div>
            <IChevronR size={16} style={{ color: 'var(--text-muted)' }} />
          </button>
        );
      })}
    </div>
  );
}

// Hook returns false once we know the app is running as an installed PWA
// (standalone display-mode, iOS navigator.standalone, or after 'appinstalled'
// has fired in this session). Returns true otherwise — i.e. installation is
// possible / hasn't happened yet — so the banner stays visible.
function useShouldShowInstallPrompt(): boolean {
  const detectInstalled = (): boolean => {
    if (typeof window === 'undefined') return false;
    // v118.3 — Capacitor native shell IS the "installed app". Neither
    // display-mode:standalone nor navigator.standalone fire inside
    // WKWebView, so short-circuit to "installed" here before falling
    // through to the PWA-specific detectors.
    if (Capacitor.isNativePlatform()) return true;
    if (window.matchMedia?.('(display-mode: standalone)')?.matches) return true;
    if (window.matchMedia?.('(display-mode: fullscreen)')?.matches) return true;
    if (window.matchMedia?.('(display-mode: minimal-ui)')?.matches) return true;
    if ((window.navigator as any).standalone === true) return true; // iOS Safari
    if (sessionStorage.getItem('kamizo_pwa_installed') === '1') return true;
    return false;
  };
  const [installed, setInstalled] = useState<boolean>(detectInstalled);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(display-mode: standalone)');
    const onChange = () => setInstalled(detectInstalled());
    mq.addEventListener?.('change', onChange);
    const onInstalled = () => {
      sessionStorage.setItem('kamizo_pwa_installed', '1');
      setInstalled(true);
    };
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      mq.removeEventListener?.('change', onChange);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  return !installed;
}

function PWABanner({ language }: any) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 20, background: 'var(--surface-2)', border: '1px dashed var(--border-strong)' }}>
      <div style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--brand-tint)', color: 'var(--brand-dark)', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}><IDownload size={18} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{ru(language, 'Установите Kamizo на экран', 'Kamizo\'ni ekranga o\'rnating')}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{ru(language, 'Быстрый доступ как у приложения', 'Ilovadek tez kirish')}</div>
      </div>
    </div>
  );
}

// Renders the section wrapper + banner only if the app is NOT installed.
// When installed, returns null so the surrounding section margin collapses
// and there's no empty gap above the BottomBar.
function PWABannerSection({ language, sectionStyle }: any) {
  const show = useShouldShowInstallPrompt();
  if (!show) return null;
  return (
    <div style={sectionStyle}>
      <PWABanner language={language} />
    </div>
  );
}

// TabBar removed — the single shared `BottomBar` component in
// src/components/BottomBar.tsx now renders the same floating-pill design
// on every resident page (and every other role), portaled to document.body.
// The Layout already mounts <BottomBar /> globally, so Resident Home
// inherits it like every other route.

interface Props {
  language: string;
  name: string;
  apt: string;
  activeCount: number;
  pendingApproval: any[];
  pendingReschedules: any[];
  meeting: any | null;
  announcements: any[];
  unread?: number;
  brand?: string;
  /** Tenant logo data URL (data:image/…;base64,…). Null/undefined when
      the УК hasn't uploaded one; HomeHero falls back to a letter chip
      derived from `brand`. */
  logo?: string | null;
  passCount?: number;
  vehicleCount?: number;
  needsRegistration?: boolean;
  registrationMissing?: string;
  onNewRequest: () => void;
  onTab: (tab: 'home' | 'requests') => void;
  onMenu: () => void;
  onCompleteRegistration?: () => void;
  onApprove: (req: any) => void;
  onOpenRequest: (req: any) => void;
}

export function ResidentHomeDesign(props: Props) {
  const { language, name, apt, activeCount, pendingApproval, pendingReschedules, meeting, announcements, unread = 0, brand, logo = null, passCount = 0, vehicleCount = 0, needsRegistration = false, registrationMissing, onNewRequest, onTab, onMenu, onCompleteRegistration, onApprove, onOpenRequest } = props;
  const navigate = useNavigate();
  // v118.72 — bell toggles the NotificationsDropdown panel (was: navigate
  // to /announcements). Dropdown is mounted just below the hero (anchor
  // offset 96 px) per kamizo-home.jsx prototype.
  const [bell, setBell] = useState(false);
  // Mobile uses width:100vw + negative auto margins to break out of any
  // ancestor padding. On desktop that breaks out PAST the sidebar too — the
  // hero ends up covering the global navigation. Drop the break-out for ≥md;
  // main-content's own width/margin already manages the column on desktop.
  const isMobile = useIsMobile();

  // No theme-color override on Home — the rule is now: light/beige status
  // bar on EVERY page (no exceptions). The global default in index.html
  // (#F4F0E8 warm beige, matching --app-bg) handles it. The hero stays
  // brown but starts BELOW env(safe-area-inset-top) via HomeHero's
  // margin-top, so the status-bar zone always paints the light page bg.

  // Card stack — LEFT mockup pins "Завершите регистрацию" first whenever the resident
  // still has their seed password. The rest follows the Claude Design order.
  const registrationCard = {
    id: 'registration',
    Icon: ICheck,
    silhouette: 'check',
    badge: ru(language, 'Важно', 'Muhim'),
    title: ru(language, 'Завершите регистрацию', "Ro'yxatdan o'tishni tugating"),
    sub: registrationMissing
      ? ru(language, `Не заполнено: ${registrationMissing}`, `To'ldirilmagan: ${registrationMissing}`)
      : ru(language, 'Не заполнено: пароль', "To'ldirilmagan: parol"),
    cta: ru(language, 'Заполнить →', "To'ldirish →"),
    // v118.71 — gradient + shadow tweaked to match LIVE design exactly
    // (cyan-leaning teal vs. previous bluegray-leaning teal).
    gradient: 'linear-gradient(150deg, #2DD4CF 0%, #0E9AAB 100%)',
    shadow: 'rgba(14,154,171,0.5)',
    onClick: () => { if (onCompleteRegistration) onCompleteRegistration(); else navigate('/profile'); },
  };
  const baseCards = [
    // v118.71 — silhouette 'people' → 'ballot' + richer title/sub copy to match LIVE design.
    { id: 'voting', Icon: IUsers, silhouette: 'ballot', badge: ru(language, 'Голосование', 'Ovoz'), title: ru(language, 'Ремонт лифтов · идёт голосование', "Liftlarni ta'mirlash · ovoz berilmoqda"), sub: ru(language, 'Ваш голос · 67 м² · осталось 2 дня', "Sizning ovozingiz · 67 m² · 2 kun qoldi"), cta: ru(language, 'Проголосовать →', 'Ovoz berish →'), gradient: 'linear-gradient(150deg, #FB923C 0%, #EA580C 100%)', shadow: 'rgba(249,115,22,0.5)', onClick: () => navigate('/meetings') },
    { id: 'guest', Icon: IQR, silhouette: 'qr', badge: 'QR', title: ru(language, 'Гостевой пропуск', 'Mehmon ruxsati'), sub: ru(language, 'QR для гостя или доставки', 'Mehmon yoki yetkazib berish uchun'), cta: ru(language, 'Создать →', 'Yaratish →'), gradient: 'linear-gradient(150deg, #34D399 0%, #15A06E 100%)', shadow: 'rgba(21,160,110,0.5)', onClick: () => navigate('/guest-access') },
    // v118.69 — order swapped to match handoff §01: contacts (blue) before rate (purple).
    // v118.71 — sub copy expanded to match LIVE design ('и мастера дома', 'займёт 30 секунд', 'по номеру машины').
    { id: 'contacts', Icon: IPhone, silhouette: 'phone', badge: ru(language, 'Контакты', 'Kontaktlar'), title: ru(language, 'Полезные контакты', 'Foydali kontaktlar'), sub: ru(language, 'Экстренные службы и мастера дома', "Favqulodda xizmatlar va uy ustalari"), cta: ru(language, 'Открыть →', 'Ochish →'), gradient: 'linear-gradient(150deg, #60A5FA 0%, #2F77C2 100%)', shadow: 'rgba(47,119,194,0.5)', onClick: () => navigate('/useful-contacts') },
    { id: 'rate', Icon: IStar, silhouette: 'star', badge: ru(language, 'Оценка', 'Baho'), title: ru(language, 'Оцените УК', 'Boshqaruvni baholang'), sub: ru(language, 'Раз в месяц · займёт 30 секунд', "Oyiga bir marta · 30 soniya oladi"), cta: ru(language, 'Оценить →', 'Baholash →'), gradient: 'linear-gradient(150deg, #A78BFA 0%, #7C3AED 100%)', shadow: 'rgba(124,58,237,0.5)', onClick: () => navigate('/rate-employees') },
    { id: 'find-car', Icon: ICar, silhouette: 'car', badge: ru(language, 'Авто', 'Avto'), title: ru(language, 'Найти владельца авто', 'Avto egasini topish'), sub: ru(language, 'Поиск соседа по номеру машины', "Mashina raqami bo'yicha qidirish"), cta: ru(language, 'Найти →', 'Topish →'), gradient: 'linear-gradient(150deg, #FBBF24 0%, #D97706 100%)', shadow: 'rgba(217,119,6,0.5)', onClick: () => navigate('/vehicles') },
  ];
  const cards = needsRegistration ? [registrationCard, ...baseCards] : baseCards;

  const section: React.CSSProperties = { padding: '0 16px', marginTop: 16 };
  const secLabel: React.CSSProperties = { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '0 4px', marginBottom: 10 };
  const secTitle: React.CSSProperties = { fontSize: 13, fontWeight: 700, letterSpacing: '0.02em', color: 'var(--text-secondary)', textTransform: 'uppercase' };
  const secMore: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: 'var(--brand-dark)' };
  const topApproval = pendingApproval && pendingApproval.length > 0 ? pendingApproval[0] : null;
  const reschedule = pendingReschedules && pendingReschedules.length > 0 ? pendingReschedules[0] : null;

  return (
    <div
      className="kz-screen"
      style={{
        // v118.87 — wrapper now fills the container with a flex column
        // so the dedicated INNER SCROLLER (.home-scroll, below) can take
        // the remaining height as a controlled scroll context. The fixed
        // hero is a sibling of the scroller (NOT inside it) so iOS
        // WKWebView's bounce on the scroller cannot translate the hero.
        // iOS reliably honors `overscroll-behavior: none` on a
        // non-document scroller, which it ignores on .main-content's
        // document-coupled scrolling — moving the home scroll inwards
        // is the fix the previous 4 defence-in-depth layers couldn't be.
        height: '100%',
        minHeight: '100%',
        background: 'var(--app-bg)',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        // Mobile: break out of any horizontal padding on parent main so the
        // hero reaches the edges. Desktop: stay inside main-content's column
        // — otherwise the hero spans the whole viewport and slides under the
        // 272px Sidebar.
        width: isMobile ? '100vw' : '100%',
        marginLeft: isMobile ? 'calc(50% - 50vw)' : 0,
        marginRight: isMobile ? 'calc(50% - 50vw)' : 0,
      }}
    >
      <HomeHero name={name} apt={apt} activeCount={activeCount} language={language} unread={unread} brand={brand} logo={logo} onMenu={onMenu} onBell={() => setBell((b) => !b)} bellOpen={bell} />
      <NotificationsDropdown
        open={bell}
        onClose={() => setBell(false)}
        onSeeAll={() => { setBell(false); navigate('/notifications'); }}
      />

      {/* v118.87 — dedicated INNER SCROLLER. iOS WKWebView honors
          overscroll-behavior:none reliably on a non-document scroller
          (it ignores it on the document-coupled .main-content). The
          fixed hero sits OUTSIDE this element so even if some quirk
          tries to bounce the inner content, the hero cannot move
          with it. -webkit-overflow-scrolling:touch enables native
          momentum scrolling here — on an isolated inner element it
          coexists with overscroll-behavior:none correctly.
          flex:1 + minHeight:0 ensures the scroller fills the wrapper's
          remaining height (after the fixed hero is laid out out of
          flow). paddingTop reserves the hero's measured height so the
          first card lands right below it; paddingBottom reserves the
          floating BottomBar. */}
      <div
        className="home-scroll"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
          paddingTop: 'var(--home-hero-h, 220px)',
          paddingBottom: 'calc(96px + env(safe-area-inset-bottom, 0px))',
        }}
      >
      <div style={{ ...section, marginTop: 18 }}>
        {/* Card height bumped 210 → 250 so the densest card
            (registration: 2-line title + sub + "Заполнить →") fits
            without the CTA pill being clipped by overflow:hidden.
            SwipeCardStack also tightens the internal rhythm (smaller
            avatar/title/CTA) so every carousel card has comfortable
            breathing room below the button. */}
        <SwipeCardStack cards={cards as any} height={250} />
      </div>

      {/* Quick tiles sit close to the carousel dots — overrides the shared
          section's marginTop (16) with 6 so the gap matches the mockup. */}
      <div style={{ ...section, marginTop: 6 }}>
        <QuickTiles onNewRequest={onNewRequest} navigate={navigate} language={language} passCount={passCount} vehicleCount={vehicleCount} />
      </div>

      {topApproval && (
        <div style={section}>
          <ApprovalCard req={topApproval} language={language} onApprove={() => onApprove(topApproval)} onDetails={() => onOpenRequest(topApproval)} />
        </div>
      )}

      {reschedule && (
        <div style={section}>
          <button onClick={() => onTab('requests')} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', borderRadius: 20, background: 'var(--status-pending-bg)', border: '1px solid rgba(245,158,11,0.3)', cursor: 'pointer' }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(245,158,11,0.18)', color: '#B45309', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}><IClock size={20} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: '#92400E' }}>{ru(language, 'Запрос на перенос визита', 'Tashrifni ko\'chirish')}</div>
              <div style={{ fontSize: 12.5, color: '#A16207', marginTop: 1 }}>{reschedule.proposedDate ? `${reschedule.proposedDate} ${reschedule.proposedTime || ''}` : ru(language, 'Нажмите, чтобы ответить', 'Javob berish uchun bosing')}</div>
            </div>
            <IChevronR size={18} style={{ color: '#B45309' }} />
          </button>
        </div>
      )}

      {meeting && (
        <div style={section}>
          <div style={secLabel}><span style={secTitle}>{ru(language, 'Собрание', 'Yig\'ilish')}</span><span style={secMore} onClick={() => navigate('/meetings')}>{ru(language, 'Все →', 'Barchasi →')}</span></div>
          <MeetingWidget meeting={meeting} language={language} onOpen={() => navigate('/meetings')} />
        </div>
      )}

      <div style={section}>
        <div style={secLabel}><span style={secTitle}>{ru(language, 'Оплата', 'To\'lov')}</span></div>
        <BalanceCard language={language} />
      </div>

      {announcements && announcements.length > 0 && (
        <div style={section}>
          <div style={secLabel}><span style={secTitle}>{ru(language, 'Объявления', 'E\'lonlar')}</span><span style={secMore} onClick={() => navigate('/announcements')}>{ru(language, 'Все →', 'Barchasi →')}</span></div>
          <AnnMini items={announcements} language={language} onOpen={() => navigate('/announcements')} />
        </div>
      )}

      {/* Wrapper renders only when the install banner is visible — otherwise
          the section's marginTop would leave an empty gap above the TabBar
          on already-installed PWAs. */}
      <PWABannerSection language={language} sectionStyle={section} />

      {/* No bottom navigation rendered here — the global BottomBar in
          src/components/BottomBar.tsx is mounted by Layout for every
          resident route and now owns the floating-pill design. */}
      </div>{/* /home-scroll inner scroller */}
    </div>
  );
}
