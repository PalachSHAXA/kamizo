// AddCarPage — full-screen vehicle form. Theme-aware (one component,
// light + dark variants driven by useThemeStore — same mechanism as
// the splash overlay's v175 clean-rebuild).
//
// DUAL MODE (v118.44 — was v183 add-only):
//   • /vehicles/add        → ADD     mode → calls vehicleStore.addVehicle
//   • /vehicles/edit/:id   → EDIT    mode → pre-fills from existing
//                                            vehicle, calls
//                                            vehicleStore.updateVehicle
//   Mode is detected via useParams; everything else (layout, plate
//   hero, theme tokens, scroll, section cards, Save bar) is reused
//   verbatim so the two modes stay visually identical and future
//   plate-hero / styling fixes apply to both automatically.
//
// Replaces the old inline edit modal that lived inside
// ResidentVehiclesPage — the garage / car-list itself stays untouched.
// ResidentVehiclesPage's "Add" buttons navigate('/vehicles/add') and
// its "Edit" buttons navigate('/vehicles/edit/' + vehicle.id).
//
// Plate format switches with the owner toggle:
//   phys (individual) → 01 · A 123 EA  (region + 1 letter + 3 digits + 2 letters)
//   legal             → 01 · 123 ABC   (region + 3 digits + 3 letters)
// Format change uses the existing plateUtils helpers
// (parsePlateNumber / combinePlateNumber / validatePlateNumber) so
// the saved plate string matches the rest of the app.

import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, ChevronDown, Building2, User as UserIcon, Car } from 'lucide-react';
import { useThemeStore } from '../stores/themeStore';
import { useAuthStore } from '../stores/authStore';
import { useVehicleStore } from '../stores/dataStore';
import { useTenantStore } from '../stores/tenantStore';
import { useLanguageStore } from '../stores/languageStore';
import { useToastStore } from '../stores/toastStore';
import type { VehicleType, VehicleOwnerType } from '../types';
import { VEHICLE_TYPE_LABELS } from '../types';
import { UZFlag } from './vehicles';
import {
  combinePlateNumber,
  parsePlateNumber,
  validatePlateNumber,
  UZ_REGIONS,
  type PlateParts,
} from './vehicles/plateUtils';

const BRAND = '#F97316';
const BRAND_LT = '#FB923C';

// v118.46 — v187 HERO_LETTER / HERO_DIGIT (the orange-letters /
// dark-digits hero recolor) removed. The new design from Claude
// Design "Add Car - Light/Dark - Yur.html" reverts the middle
// characters to the embossed black plate look (charStyle with
// text-shadow), and adds: stage radial glow, top sheen, animated
// shimmer sweep, two screws, focus pulse, polished flag inset,
// and an inline scrollable region picker dropdown.

// Theme tokens — applied inline so the component is theme-correct
// regardless of any external CSS cascade (same lesson as splash v175).
type Tokens = {
  appBg: string;
  headerBg: string;
  surface: string;
  inputBg: string;
  border: string;
  borderIn: string;
  text: string;
  text2: string;
  text3: string;
  label: string;
  heroGlow: string;
  sheet: string;
  chipBg: string;
  segTrack: string;
  segThumb: string;
  focus: string;
  isDark: boolean;
};

const LIGHT: Tokens = {
  appBg: '#F4F0E8',
  headerBg: 'rgba(244,240,232,0.86)',
  surface: '#FFFFFF',
  inputBg: '#FBF8F2',
  border: '#E6DFD2',
  borderIn: '#E1D9CA',
  text: '#1C1917',
  text2: '#6F6A62',
  text3: '#A8A29E',
  label: '#A29C90',
  heroGlow: 'radial-gradient(120% 90% at 82% -10%, rgba(249,115,22,0.14) 0%, transparent 56%), linear-gradient(180deg,#FBF8F2 0%, #F4F0E8 100%)',
  sheet: 'linear-gradient(180deg, rgba(244,240,232,0) 0%, #F4F0E8 40%)',
  chipBg: '#F4F0E8',
  segTrack: '#EFEAE0',
  segThumb: '#FFFFFF',
  focus: 'rgba(249,115,22,0.5)',
  isDark: false,
};

const DARK: Tokens = {
  appBg: '#0C0A09',
  headerBg: 'rgba(28,25,23,0.86)',
  surface: '#211E1B',
  inputBg: '#1B1815',
  border: 'rgba(250,250,249,0.10)',
  borderIn: 'rgba(250,250,249,0.12)',
  text: '#F4F0E8',
  text2: 'rgba(244,240,232,0.62)',
  text3: 'rgba(244,240,232,0.42)',
  label: 'rgba(244,240,232,0.5)',
  heroGlow: 'radial-gradient(120% 90% at 82% -10%, rgba(249,115,22,0.20) 0%, transparent 56%), linear-gradient(180deg,#241F1B 0%, #16120F 100%)',
  sheet: 'linear-gradient(180deg, rgba(12,10,9,0) 0%, #0C0A09 38%)',
  chipBg: 'rgba(250,250,249,0.06)',
  segTrack: 'rgba(0,0,0,0.4)',
  segThumb: '#2C2723',
  focus: 'rgba(249,115,22,0.55)',
  isDark: true,
};

// Vehicle types — map from human-friendly labels to the app's
// internal VehicleType enum so saves match what the rest of the app
// expects.
const VTYPE_ENTRIES: ReadonlyArray<{ type: VehicleType; ru: string; uz: string }> = [
  { type: 'car', ru: VEHICLE_TYPE_LABELS.car.label, uz: VEHICLE_TYPE_LABELS.car.labelUz },
  { type: 'suv', ru: VEHICLE_TYPE_LABELS.suv.label, uz: VEHICLE_TYPE_LABELS.suv.labelUz },
  { type: 'motorcycle', ru: VEHICLE_TYPE_LABELS.motorcycle.label, uz: VEHICLE_TYPE_LABELS.motorcycle.labelUz },
  { type: 'truck', ru: VEHICLE_TYPE_LABELS.truck.label, uz: VEHICLE_TYPE_LABELS.truck.labelUz },
  { type: 'other', ru: VEHICLE_TYPE_LABELS.other.label, uz: VEHICLE_TYPE_LABELS.other.labelUz },
];

const COLOR_SWATCHES: ReadonlyArray<[string, string]> = [
  ['Белый', '#F4F1EA'], ['Чёрный', '#1C1917'], ['Серебристый', '#C9CBCE'],
  ['Серый', '#6B6E72'], ['Синий', '#2C5BAA'], ['Красный', '#C5362F'],
  ['Зелёный', '#2F7D4F'], ['Коричневый', '#6B4A2E'],
];

// v118.46 — PlateHero — full port of Claude Design's
// PlateHeroInput (Add Car - Light/Dark - Yur.html, kamizo-addcar.jsx
// line 134-244). Stage radial glow, top sheen, animated shimmer
// sweep, two metal screws, focus pulse on the active segment,
// inline scrollable region picker dropdown, polished flag inset
// with chrome bezel. Theme-aware via the dark prop.
//
// Owner reflow:
//   individual  → [01 ▾] | A 777 BA | UZ
//   legal_entity → [01 ▾] | 777 ABC  | UZ
//
// All input state stays in the parent (parts/setParts) so the
// rest of the app (save, validation, edit-mode hydration) keeps
// working unchanged.
function PlateHero({
  t, owner, parts, setParts, active, setActive, isRu, dark,
}: {
  t: Tokens;
  owner: VehicleOwnerType;
  parts: PlateParts;
  setParts: (p: PlateParts) => void;
  active: keyof PlateParts;
  setActive: (k: keyof PlateParts) => void;
  isRu: boolean;
  dark: boolean;
}) {
  const isLegal = owner === 'legal_entity';
  const [regionOpen, setRegionOpen] = useState(false);

  const update = (k: Exclude<keyof PlateParts, 'region'>) => (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value.toUpperCase();
    if (k === 'letters1') v = v.replace(/[^A-Z]/g, '').slice(0, 1);
    if (k === 'digits')   v = v.replace(/[^0-9]/g, '').slice(0, 3);
    if (k === 'letters2') v = v.replace(/[^A-Z]/g, '').slice(0, isLegal ? 3 : 2);
    setParts({ ...parts, [k]: v });
  };

  // Embossed plate character style (design line 156-161). Black
  // ink, Manrope ExtraBold, white-over-black text-shadow gives
  // the stamped-metal look.
  const charStyle: React.CSSProperties = {
    border: 'none', background: 'transparent', outline: 'none',
    textAlign: 'center', color: '#15110D', padding: 0, margin: 0,
    fontFamily: '"Manrope", system-ui, sans-serif', fontWeight: 800,
    letterSpacing: '0.02em',
    textShadow: '0 1px 0 rgba(255,255,255,0.95), 0 -1px 0 rgba(0,0,0,0.14)',
  };

  // Per-segment wrapper — lifts + orange ring on focus, pulses
  // via the .ac-seg-active class (keyframes in index.css). Match
  // the design exactly (line 175-181).
  const segWrap = (isActive: boolean): React.CSSProperties => ({
    position: 'relative', borderRadius: 9, padding: '3px 3px',
    cursor: 'text', transition: 'transform 0.18s, background 0.18s',
    background: isActive ? 'rgba(249,115,22,0.10)' : 'transparent',
    transform: isActive ? 'translateY(-1.5px)' : 'none',
    boxShadow: isActive ? '0 0 0 2px rgba(249,115,22,0.95)' : 'none',
  });

  // Tiny screw glyph for the plate corners (design line 164-172).
  const screw = (pos: React.CSSProperties): React.ReactNode => (
    <span style={{
      position: 'absolute', width: 9, height: 9, borderRadius: '50%', zIndex: 3,
      background: 'radial-gradient(circle at 35% 30%, #fff 0%, #d4cec1 46%, #968f83 100%)',
      boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.14), 0 1px 1px rgba(0,0,0,0.18)',
      ...pos,
    }}>
      <span style={{ position: 'absolute', inset: '3.5px 1.5px', borderTop: '1px solid rgba(0,0,0,0.3)', transform: 'rotate(35deg)' }} />
    </span>
  );

  // v118.52 — stage padding restored to design exact ('15px 14px
  // 17px'). v189-v191 had progressively cut horizontal padding to
  // 4 px to make room for bumped middle char fontSize; v194 reverts
  // to design's intended ambient glow breathing room since middle
  // chars are now back at design's 38 (em-scaled, no overhang).
  const stage: React.CSSProperties = {
    position: 'relative', borderRadius: 18, padding: '15px 14px 17px',
    background: dark
      ? 'radial-gradient(135% 130% at 50% 122%, rgba(249,115,22,0.32) 0%, rgba(249,115,22,0) 56%)'
      : 'radial-gradient(135% 130% at 50% 122%, rgba(249,115,22,0.15) 0%, rgba(249,115,22,0) 60%)',
  };

  const plateBody: React.CSSProperties = {
    position: 'relative', display: 'flex', alignItems: 'stretch', overflow: 'hidden',
    background: 'linear-gradient(177deg, #FFFFFF 0%, #F6F3EC 56%, #E9E4D8 100%)',
    borderRadius: 16, padding: 5, height: 98,
    border: '2.5px solid #14110D',
    boxShadow: dark
      ? '0 1px 0 rgba(255,255,255,0.85) inset, 0 0 0 1px rgba(0,0,0,0.55), 0 12px 28px -8px rgba(0,0,0,0.7), 0 0 46px -6px rgba(249,115,22,0.5)'
      : '0 1px 0 rgba(255,255,255,0.92) inset, 0 0 0 1px rgba(0,0,0,0.06), 0 2px 3px rgba(28,25,23,0.1), 0 20px 36px -12px rgba(28,25,23,0.5)',
  };

  // v118.59 — REVERT к v198 / Claude Design EXACT. Убран
  // fontSizeClamp и em-ширины из v199/v200; восстановлены
  // фиксированные дизайн-значения: fontSize 38 + ширины
  // 28/64/52 (физ), 76/76 (юр). Жирность 800 (Manrope
  // ExtraBold) и embossed text-shadow остаются через charStyle.
  const series = !isLegal ? (
    <>
      <div
        onClick={() => document.getElementById('ac-l1')?.focus()}
        className={active === 'letters1' ? 'ac-seg-active' : ''}
        style={segWrap(active === 'letters1')}
      >
        <input id="ac-l1" className="kamizo-plate-char" placeholder="A" value={parts.letters1}
          onChange={update('letters1')} onFocus={() => setActive('letters1')}
          style={{ ...charStyle, width: 28, fontSize: 38, lineHeight: 1 }} />
      </div>
      <div
        onClick={() => document.getElementById('ac-digits')?.focus()}
        className={active === 'digits' ? 'ac-seg-active' : ''}
        style={segWrap(active === 'digits')}
      >
        <input id="ac-digits" className="kamizo-plate-char" inputMode="numeric" placeholder="123" value={parts.digits}
          onChange={update('digits')} onFocus={() => setActive('digits')}
          style={{ ...charStyle, width: 64, fontSize: 38, lineHeight: 1, letterSpacing: '0.03em' }} />
      </div>
      <div
        onClick={() => document.getElementById('ac-l2')?.focus()}
        className={active === 'letters2' ? 'ac-seg-active' : ''}
        style={segWrap(active === 'letters2')}
      >
        <input id="ac-l2" className="kamizo-plate-char" placeholder="EA" value={parts.letters2}
          onChange={update('letters2')} onFocus={() => setActive('letters2')}
          style={{ ...charStyle, width: 52, fontSize: 38, lineHeight: 1, letterSpacing: '0.03em' }} />
      </div>
    </>
  ) : (
    <>
      <div
        onClick={() => document.getElementById('ac-digits')?.focus()}
        className={active === 'digits' ? 'ac-seg-active' : ''}
        style={segWrap(active === 'digits')}
      >
        <input id="ac-digits" className="kamizo-plate-char" inputMode="numeric" placeholder="123" value={parts.digits}
          onChange={update('digits')} onFocus={() => setActive('digits')}
          style={{ ...charStyle, width: 76, fontSize: 38, lineHeight: 1, letterSpacing: '0.03em' }} />
      </div>
      <div
        onClick={() => document.getElementById('ac-l2')?.focus()}
        className={active === 'letters2' ? 'ac-seg-active' : ''}
        style={segWrap(active === 'letters2')}
      >
        <input id="ac-l2" className="kamizo-plate-char" placeholder="ABC" value={parts.letters2}
          onChange={update('letters2')} onFocus={() => setActive('letters2')}
          style={{ ...charStyle, width: 76, fontSize: 38, lineHeight: 1, letterSpacing: '0.03em' }} />
      </div>
    </>
  );

  return (
    <div style={{ position: 'relative' }}>
      <div style={stage}>
        <div style={plateBody}>
          {/* top sheen */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '46%', background: 'linear-gradient(180deg, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0) 100%)', pointerEvents: 'none', zIndex: 1 }} />
          {/* animated shimmer sweep — keyframes acShimmer in index.css */}
          <div className="ac-shimmer" style={{ position: 'absolute', top: '-50%', left: 0, width: '34%', height: '200%', background: 'linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.72) 50%, transparent 100%)', pointerEvents: 'none', zIndex: 2 }} />

          {screw({ top: 7, left: 8 })}
          {screw({ bottom: 7, right: 8 })}

          {/* region — tap toggles inline picker dropdown below.
              v118.52 — REVERTED to design exact: width 50, char
              fontSize 36, chevron 13, REGION label 8.5. v190 had
              shrunk these (fontSize 28, width 38) to make the
              middle chars look dominant, but the user is now back
              to the design's intended balance (middle 38 / region
              36 — middle just barely bigger). */}
          <button
            type="button"
            onClick={() => { setRegionOpen((o) => !o); setActive('region'); }}
            style={{
              position: 'relative', zIndex: 3, width: 50, border: 'none',
              background: regionOpen ? 'rgba(249,115,22,0.12)' : 'transparent',
              borderRadius: 10, cursor: 'pointer', display: 'flex',
              flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.18s',
              boxShadow: regionOpen ? '0 0 0 2px rgba(249,115,22,0.95)' : 'none',
              appearance: 'none', WebkitAppearance: 'none', padding: 0,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ ...charStyle, fontSize: 36, lineHeight: 1 }}>{parts.region || '01'}</span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#15110D" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ transform: regionOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', opacity: 0.78 }}><path d="M6 9l6 6 6-6" /></svg>
            </span>
            <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '0.16em', color: 'rgba(154,147,134,0.85)', marginTop: -1 }}>
              {isRu ? 'РЕГИОН' : 'HUDUD'}
            </span>
          </button>

          {/* divider (single — design uses one) */}
          <div style={{ width: 2.5, background: '#14110D', margin: '8px 0', borderRadius: 2, position: 'relative', zIndex: 1 }} />

          {/* main char series — reflows by owner.
              v118.59 — REVERTED к v198 / Claude Design EXACT:
              justify-content: center + padding '0 9px' + gap 4
              (kamizo-addcar.jsx line 280 verbatim). */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '0 9px', position: 'relative', zIndex: 3 }}>
            {series}
          </div>

          {/* UZ flag inset panel — chrome bezel + UZ wordmark.
              Margin-right 4 keeps flag clear of the right plate
              edge so it never overlaps the last typed character. */}
          <div style={{
            width: 40, position: 'relative', zIndex: 3, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 5,
            borderLeft: '2px solid rgba(20,17,13,0.16)', paddingLeft: 5, marginRight: 4,
          }}>
            <div style={{
              position: 'relative', padding: 2, borderRadius: 5,
              background: 'linear-gradient(145deg, #fdfdfd, #d9d3c6)',
              boxShadow: '0 1px 2px rgba(0,0,0,0.22), inset 0 0 0 1px rgba(255,255,255,0.7)',
            }}>
              <UZFlag />
              <span style={{ position: 'absolute', inset: 2, borderRadius: 4, background: 'linear-gradient(150deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 42%)', pointerEvents: 'none' }} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: '0.06em', color: '#14110D' }}>UZ</span>
          </div>
        </div>
      </div>

      {/* inline scrollable region picker — drops below the plate */}
      {regionOpen && (
        <>
          <div onClick={() => setRegionOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} aria-hidden />
          <div style={{
            position: 'absolute', top: 'calc(100% - 2px)', left: 6, width: 252, zIndex: 41,
            background: t.surface, borderRadius: 16, border: `1px solid ${t.border}`,
            boxShadow: dark ? '0 20px 48px rgba(0,0,0,0.65)' : '0 22px 50px -12px rgba(28,25,23,0.34)',
            overflow: 'hidden',
          }}>
            <div style={{ padding: '12px 14px 9px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: BRAND }} />
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.label }}>
                {isRu ? 'Регион' : 'Hudud'}
              </span>
            </div>
            <div style={{ maxHeight: 232, overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
              {UZ_REGIONS.map((region, i) => {
                const sel = parts.region === region.code;
                return (
                  <button
                    key={region.code}
                    type="button"
                    onClick={() => {
                      setParts({ ...parts, region: region.code });
                      setRegionOpen(false);
                      setActive(isLegal ? 'digits' : 'letters1');
                    }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                      padding: '11px 14px', border: 'none',
                      borderTop: i ? `1px solid ${t.border}` : 'none',
                      background: sel ? (dark ? 'rgba(249,115,22,0.13)' : '#FFF3EA') : 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{
                      width: 38, height: 30, flex: '0 0 auto', borderRadius: 7,
                      display: 'grid', placeItems: 'center',
                      fontSize: 15, fontWeight: 800, letterSpacing: '0.02em',
                      background: sel ? BRAND : '#14110D',
                      color: sel ? '#fff' : '#F6F3EC',
                      boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
                    }}>{region.code}</span>
                    <span style={{ flex: 1, fontSize: 14.5, fontWeight: sel ? 750 : 600, color: sel ? BRAND : t.text }}>
                      {isRu ? region.name : region.nameUz}
                    </span>
                    {sel && <Check size={17} color={BRAND} strokeWidth={2.6} />}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function FieldLabel({ t, children }: { t: Tokens; children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em',
      textTransform: 'uppercase', color: t.label, paddingLeft: 2,
    }}>{children}</span>
  );
}

function TextInput({
  t, value, onChange, placeholder, inputMode,
}: {
  t: Tokens;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: 'text' | 'numeric';
}) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      background: t.inputBg, borderRadius: 13,
      border: `1.5px solid ${focus ? t.focus : t.borderIn}`,
      boxShadow: focus ? `0 0 0 4px ${t.focus.replace(/[\d.]+\)$/, '0.14)')}` : 'none',
      padding: '0 13px', height: 52,
      transition: 'border-color 0.15s, box-shadow 0.15s',
    }}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          flex: 1, minWidth: 0, border: 'none', background: 'transparent',
          outline: 'none', color: t.text, fontSize: 16, fontWeight: 600,
          fontFamily: 'inherit',
        }}
      />
    </div>
  );
}

export default function AddCarPage() {
  const navigate = useNavigate();
  // v118.44 — dual-mode: presence of :id in the URL switches the
  // page into EDIT mode. /vehicles/edit/:id pre-fills + updates;
  // /vehicles/add stays the original create flow.
  const { id: editId } = useParams<{ id?: string }>();
  const isEdit = Boolean(editId);

  const theme = useThemeStore((s) => s.theme);
  const { user } = useAuthStore();
  const addVehicle = useVehicleStore((s) => s.addVehicle);
  const updateVehicle = useVehicleStore((s) => s.updateVehicle);
  // Live-subscribed lookup so a deep-link to /vehicles/edit/:id
  // hydrates as soon as the resident's vehicle list finishes
  // loading (App.tsx fetches it on auth — usually ready before
  // navigation, but we don't assume).
  const existingVehicle = useVehicleStore((s) =>
    isEdit ? s.vehicles.find((v) => v.id === editId) : undefined
  );
  const tenantConfig = useTenantStore((s) => s.config);
  const { language } = useLanguageStore();
  const addToast = useToastStore((s) => s.addToast);

  const t = theme === 'dark' ? DARK : LIGHT;
  const isRu = language === 'ru';

  const tenantAddress = (tenantConfig?.tenant as { address?: string } | null)?.address
    || user?.address
    || (isRu ? 'Ваш адрес' : 'Manzilingiz');

  // ── initial form state — reads existing vehicle synchronously
  //     from the store snapshot when in EDIT mode, otherwise uses
  //     the same A 777 BA placeholder defaults the original ADD
  //     flow used so the plate hero looks like the design at first
  //     paint. Wrapped in useState lazy initializers so this only
  //     runs once on mount; deep-link hydration is handled by the
  //     useEffect further down.
  const initialEditVehicle = isEdit
    ? useVehicleStore.getState().vehicles.find((v) => v.id === editId)
    : undefined;
  const initialOwner: VehicleOwnerType = (initialEditVehicle?.ownerType as VehicleOwnerType) || 'individual';
  const initialParts: PlateParts = initialEditVehicle
    ? parsePlateNumber(initialEditVehicle.plateNumber, initialOwner)
    : { region: '01', letters1: 'A', digits: '777', letters2: 'BA' };

  // ── form state ──
  const [owner, setOwner] = useState<VehicleOwnerType>(initialOwner);
  const [parts, setParts] = useState<PlateParts>(initialParts);
  const [activeSeg, setActiveSeg] = useState<keyof PlateParts>('digits');
  const [vtype, setVtype] = useState<VehicleType>((initialEditVehicle?.type as VehicleType) || 'car');
  const [typeOpen, setTypeOpen] = useState(false);
  // v118.46 — region picker open-state moved INTO PlateHero
  // (matches Claude Design "Add Car - Yur"). The picker is now a
  // self-contained dropdown inside the plate hero; no need to
  // hoist its open-state into AddCarPage.
  const [brand, setBrand] = useState(initialEditVehicle?.brand || '');
  const [model, setModel] = useState(initialEditVehicle?.model || '');
  const [color, setColor] = useState(initialEditVehicle?.color || '');
  const [colorOpen, setColorOpen] = useState(false);
  const [year, setYear] = useState(initialEditVehicle?.year?.toString() || '');
  const [companyName, setCompanyName] = useState(initialEditVehicle?.companyName || '');
  const [parkingSpot, setParkingSpot] = useState(initialEditVehicle?.parkingSpot || '');
  const [notes, setNotes] = useState(initialEditVehicle?.notes || '');
  const [submitting, setSubmitting] = useState(false);

  // v118.44 — deep-link hydration. If the user opened /vehicles/edit/:id
  // before the resident's vehicle list had finished loading, the lazy
  // initializers above saw an empty list and the form rendered with
  // ADD-mode defaults. As soon as the vehicle appears in the store,
  // copy its values into local state — but only ONCE (hydratedRef),
  // so a later poll/refetch never overwrites the user's in-progress
  // edits.
  const hydratedRef = useRef<boolean>(Boolean(initialEditVehicle));
  useEffect(() => {
    if (!isEdit || !existingVehicle || hydratedRef.current) return;
    hydratedRef.current = true;
    const ownerType = (existingVehicle.ownerType as VehicleOwnerType) || 'individual';
    setOwner(ownerType);
    setParts(parsePlateNumber(existingVehicle.plateNumber, ownerType));
    setVtype((existingVehicle.type as VehicleType) || 'car');
    setBrand(existingVehicle.brand || '');
    setModel(existingVehicle.model || '');
    setColor(existingVehicle.color || '');
    setYear(existingVehicle.year?.toString() || '');
    setCompanyName(existingVehicle.companyName || '');
    setParkingSpot(existingVehicle.parkingSpot || '');
    setNotes(existingVehicle.notes || '');
  }, [isEdit, existingVehicle]);

  // When owner type changes, reset the parts that no longer apply
  // (individual uses letters1; legal_entity uses 3-letter letters2 instead).
  const changeOwner = (next: VehicleOwnerType) => {
    setOwner(next);
    setParts((p) => ({
      region: p.region,
      letters1: next === 'legal_entity' ? '' : (p.letters1 || 'A'),
      digits: p.digits,
      letters2: next === 'legal_entity'
        ? (p.letters2.length === 3 ? p.letters2 : '')
        : (p.letters2.length === 2 ? p.letters2 : ''),
    }));
    setActiveSeg(next === 'legal_entity' ? 'digits' : 'digits');
  };

  const colorHex = useMemo(() => {
    const found = COLOR_SWATCHES.find((c) => c[0] === color);
    return found ? found[1] : (t.isDark ? '#3A3531' : '#D8CFBE');
  }, [color, t.isDark]);

  const handleBack = () => navigate('/vehicles');

  const handleSave = async () => {
    if (submitting || !user) return;
    if (!validatePlateNumber(parts, owner)) {
      addToast('error', isRu ? 'Заполните гос. номер полностью' : 'Davlat raqamini toʻliq toʻldiring');
      return;
    }
    if (!brand.trim() || !model.trim()) {
      addToast('error', isRu ? 'Укажите марку и модель' : 'Marka va modelni koʻrsating');
      return;
    }
    setSubmitting(true);
    try {
      const vehicleData = {
        plateNumber: combinePlateNumber(parts, owner),
        brand: brand.trim(),
        model: model.trim(),
        color: color || '',
        year: year ? parseInt(year, 10) : undefined,
        type: vtype,
        ownerType: owner,
        companyName: owner === 'legal_entity' && companyName.trim() ? companyName.trim() : undefined,
        parkingSpot: parkingSpot.trim() || undefined,
        notes: notes.trim() || undefined,
      };

      if (isEdit && editId) {
        // v118.44 — EDIT mode. vehicleStore.updateVehicle takes a
        // Partial<Vehicle> patch (no ownerId/ownerName/address since
        // those don't change on an edit — they were set at create
        // time). Same path the old inline modal used.
        await updateVehicle(editId, vehicleData);
        addToast('success', isRu ? 'Изменения сохранены' : 'Oʻzgarishlar saqlandi');
        navigate('/vehicles', { replace: true });
      } else {
        const result = await addVehicle({
          ownerId: user.id,
          ownerName: user.name || user.login,
          ownerPhone: user.phone || '',
          apartment: user.apartment || '',
          address: user.address || tenantAddress,
          ...vehicleData,
        });
        if (result) {
          addToast('success', isRu ? 'Авто добавлено в гараж' : 'Avto garajga qoʻshildi');
          navigate('/vehicles', { replace: true });
        } else {
          addToast('error', isRu ? 'Не удалось сохранить авто' : 'Avtoni saqlab boʻlmadi');
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const card: React.CSSProperties = {
    background: t.surface, borderRadius: 20, border: `1px solid ${t.border}`,
    boxShadow: t.isDark
      ? '0 1px 2px rgba(0,0,0,0.4)'
      : '0 1px 2px rgba(28,25,23,0.04), 0 8px 24px -16px rgba(28,25,23,0.18)',
    padding: 16,
  };
  const sectionLabel: React.CSSProperties = {
    fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em',
    textTransform: 'uppercase', color: t.label, padding: '0 2px 10px',
  };

  return (
    // v118.79 — kz-screen opts into the global iOS-like page-enter slide+fade.
    <div className="kz-screen" style={{
      // v118.38 — fixed-height flex shell so the BODY can scroll
      // internally. Previously the outer used `minHeight: 100vh`
      // and let the document scroll, but Capacitor + mobile CSS
      // sets `body { overflow: hidden }`, so the page couldn't
      // scroll at all — Размещение / Парковочное место / Примечания
      // were stuck below the fold. New structure:
      //   • Outer = 100vh / 100dvh + overflow:hidden + flex column
      //   • Header = flex:0 0 auto (pinned top)
      //   • Body   = flex:1 1 0 + overflow-y:auto + extra bottom
      //              padding so the last fields clear the Save bar
      //   • Save bar = flex:0 0 auto (pinned bottom)
      // No more `position: sticky` on header / save — they're flex
      // children of a fixed-height container, which is more robust.
      height: '100vh',
      maxHeight: '100vh',
      // dvh override for browsers that support it (iOS Safari 15+);
      // dvh excludes the URL-bar even when it's collapsed, so the
      // page doesn't grow taller than the visible viewport.
      ...({ height: '100dvh' as unknown as string } as React.CSSProperties),
      background: t.appBg, color: t.text,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* header (flex child, no longer position:sticky) —
          padding-top includes env(safe-area-inset-top) so the title
          doesn't overlap the iOS status-bar clock. */}
      <div style={{
        flex: '0 0 auto',
        zIndex: 30,
        background: t.headerBg,
        backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
        borderBottom: `1px solid ${t.border}`,
        padding: 'calc(env(safe-area-inset-top, 0px) + 10px) 16px 13px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button
          type="button"
          aria-label={isRu ? 'Назад' : 'Orqaga'}
          onClick={handleBack}
          style={{
            width: 42, height: 42, borderRadius: 13, flex: '0 0 auto',
            background: t.chipBg, border: `1px solid ${t.border}`,
            display: 'grid', placeItems: 'center', cursor: 'pointer', color: t.text,
          }}
        >
          <ArrowLeft size={20} />
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em' }}>
            {isEdit
              ? (isRu ? 'Редактировать авто' : 'Avtoni tahrirlash')
              : (isRu ? 'Добавить авто' : 'Avto qoʻshish')}
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: t.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {isEdit
              ? (isRu ? 'Изменение · ' : 'Tahrirlash · ')
              : (isRu ? 'В гараж · ' : 'Garajga · ')}
            {tenantAddress}
          </span>
        </div>
      </div>

      {/* body — internally scrollable. flex:1 1 0 + minHeight:0 lets
          this flex child SHRINK below its content's intrinsic height
          (default `min-height:auto` on flex items would prevent it
          from scrolling). Extra bottom padding (140px + safe-area)
          guarantees the last fields (parking, notes) clear the
          sticky Save bar at the bottom. */}
      <div style={{
        flex: '1 1 0',
        minHeight: 0,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain',
        padding: '18px 16px calc(140px + env(safe-area-inset-bottom, 0px))',
        display: 'flex', flexDirection: 'column', gap: 18,
      }}>
        {/* OWNER TOGGLE */}
        <div>
          <div style={sectionLabel}>{isRu ? 'Владелец' : 'Egasi'}</div>
          <div style={{
            position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr',
            background: t.segTrack, borderRadius: 15, padding: 5,
            border: `1px solid ${t.border}`,
          }}>
            <div style={{
              position: 'absolute', top: 5, bottom: 5, width: 'calc(50% - 5px)',
              left: owner === 'individual' ? 5 : 'calc(50%)',
              background: t.segThumb, borderRadius: 11,
              boxShadow: t.isDark ? '0 2px 8px rgba(0,0,0,0.4)' : '0 2px 8px rgba(28,25,23,0.12)',
              transition: 'left 0.26s cubic-bezier(0.34,1.56,0.64,1)',
            }} />
            {([
              ['individual', isRu ? 'Физ. лицо' : 'Jismoniy', <UserIcon key="u" size={18} />],
              ['legal_entity', isRu ? 'Юр. лицо' : 'Yuridik', <Building2 key="b" size={18} />],
            ] as const).map(([k, lbl, ic]) => (
              <button
                key={k}
                type="button"
                onClick={() => changeOwner(k as VehicleOwnerType)}
                style={{
                  position: 'relative', zIndex: 1, border: 'none', background: 'transparent', cursor: 'pointer',
                  padding: '12px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  color: owner === k ? (k === 'legal_entity' ? BRAND : t.text) : t.text2,
                  fontSize: 14.5, fontWeight: 700, letterSpacing: '-0.01em', transition: 'color 0.2s',
                }}
              >
                {ic}
                {lbl}
              </button>
            ))}
          </div>
        </div>

        {/* PLATE HERO (v118.46 — full Claude Design refresh).
            Wrapper is position:relative + overflow:visible so the
            new inline region picker dropdown inside PlateHero can
            spill below the card without clipping. The hero glow
            gradient (t.heroGlow) on the card now layers behind
            the stage glow inside PlateHero. */}
        <div style={{ position: 'relative', zIndex: 20 }}>
          <div style={{ ...card, padding: 0, overflow: 'visible', background: t.heroGlow, border: `1px solid ${t.border}` }}>
            <div style={{ padding: '16px 16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: BRAND_LT }}>
                  {isRu ? 'Гос. номер' : 'Davlat raqami'}
                </span>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: t.text3 }}>
                  {isRu
                    ? `Формат UZ · ${owner === 'legal_entity' ? 'юр. лицо' : 'физ. лицо'}`
                    : `UZ formati · ${owner === 'legal_entity' ? 'yuridik' : 'jismoniy'}`}
                </span>
              </div>
              <PlateHero
                t={t}
                owner={owner}
                parts={parts}
                setParts={setParts}
                active={activeSeg}
                setActive={setActiveSeg}
                isRu={isRu}
                dark={t.isDark}
              />
              <div style={{ marginTop: 12, fontSize: 12, color: t.text2, display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: BRAND }} />
                {isRu ? 'Нажмите на блок и введите номер' : 'Blokni bosing va raqam kiriting'}
              </div>
            </div>
          </div>
        </div>

        {/* VEHICLE TYPE DROPDOWN */}
        <div>
          <div style={sectionLabel}>{isRu ? 'Тип транспорта' : 'Transport turi'}</div>
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => { setTypeOpen((o) => !o); setColorOpen(false); }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                background: t.surface, borderRadius: 15,
                border: `1px solid ${typeOpen ? t.focus : t.border}`,
                boxShadow: typeOpen
                  ? `0 0 0 4px ${t.focus.replace(/[\d.]+\)$/, '0.14)')}`
                  : (t.isDark ? 'none' : '0 1px 2px rgba(28,25,23,0.04)'),
                padding: '0 14px', height: 58, cursor: 'pointer', color: t.text,
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
            >
              <span style={{ width: 38, height: 38, borderRadius: 11, background: 'rgba(249,115,22,0.14)', color: BRAND, display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
                <Car size={20} />
              </span>
              <span style={{ flex: 1, textAlign: 'left', fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>
                {isRu ? VEHICLE_TYPE_LABELS[vtype].label : VEHICLE_TYPE_LABELS[vtype].labelUz}
              </span>
              <ChevronDown size={20} style={{ color: t.text3, transform: typeOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>
            {typeOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, zIndex: 20,
                background: t.surface, borderRadius: 16, border: `1px solid ${t.border}`, overflow: 'hidden',
                boxShadow: t.isDark ? '0 16px 40px rgba(0,0,0,0.6)' : '0 16px 40px -12px rgba(28,25,23,0.28)',
              }}>
                {VTYPE_ENTRIES.map((v, i) => (
                  <button
                    key={v.type}
                    type="button"
                    onClick={() => { setVtype(v.type); setTypeOpen(false); }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                      padding: '14px 16px',
                      background: v.type === vtype ? (t.isDark ? 'rgba(249,115,22,0.12)' : '#FFF3EA') : 'transparent',
                      border: 'none', borderTop: i ? `1px solid ${t.border}` : 'none', cursor: 'pointer',
                      color: v.type === vtype ? BRAND : t.text,
                      fontSize: 15.5, fontWeight: v.type === vtype ? 750 : 600, textAlign: 'left',
                    }}
                  >
                    {isRu ? v.ru : v.uz}
                    {v.type === vtype && <Check size={18} color={BRAND} strokeWidth={2.6} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* CAR DETAILS */}
        <div style={card}>
          <div style={{ ...sectionLabel, paddingTop: 0 }}>
            {isRu ? 'Автомобиль' : 'Avtomobil'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1, minWidth: 0 }}>
                <FieldLabel t={t}>{isRu ? 'Марка' : 'Marka'}</FieldLabel>
                <TextInput t={t} value={brand} onChange={setBrand} placeholder="Chevrolet" />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1, minWidth: 0 }}>
                <FieldLabel t={t}>{isRu ? 'Модель' : 'Model'}</FieldLabel>
                <TextInput t={t} value={model} onChange={setModel} placeholder="Malibu" />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1, minWidth: 0 }}>
                <FieldLabel t={t}>{isRu ? 'Цвет' : 'Rang'}</FieldLabel>
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => { setColorOpen((o) => !o); setTypeOpen(false); }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      background: t.inputBg, borderRadius: 13,
                      border: `1.5px solid ${colorOpen ? t.focus : t.borderIn}`,
                      padding: '0 13px', height: 52, cursor: 'pointer',
                      color: color ? t.text : t.text3, fontSize: 16, fontWeight: 600,
                    }}
                  >
                    <span style={{
                      width: 20, height: 20, borderRadius: 6, background: colorHex,
                      border: '1px solid rgba(0,0,0,0.15)', flex: '0 0 auto',
                    }} />
                    <span style={{ flex: 1, textAlign: 'left' }}>{color || (isRu ? 'Выбрать' : 'Tanlash')}</span>
                  </button>
                  {colorOpen && (
                    <div style={{
                      // v118.60 — overflow fix. На iPhone SE поле
                      // "Цвет" ~148 px шириной; старый padding 12 +
                      // gap 10 + swatch 34 не помещался в 4
                      // колонки (получалось ~23 px колонка vs 34 px
                      // swatch → swatches overflowed right edge).
                      // Уменьшено: padding 12→10, gap 10→6, swatch
                      // 34→24, font 9.5→9. `minmax(0, 1fr)` гарантирует
                      // что колонки не разъезжаются по min-content
                      // ширине, а текст переносится в 2 строки
                      // (wordBreak + whiteSpace normal).
                      position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, zIndex: 20,
                      background: t.surface, borderRadius: 16, border: `1px solid ${t.border}`, padding: 10,
                      boxShadow: t.isDark ? '0 16px 40px rgba(0,0,0,0.6)' : '0 16px 40px -12px rgba(28,25,23,0.28)',
                      display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6,
                      boxSizing: 'border-box',
                    }}>
                      {COLOR_SWATCHES.map(([name, hex]) => (
                        <button
                          key={name}
                          type="button"
                          title={name}
                          onClick={() => { setColor(name); setColorOpen(false); }}
                          style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                            background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                            minWidth: 0, overflow: 'hidden',
                          }}
                        >
                          <span style={{
                            width: 24, height: 24, borderRadius: 8, background: hex,
                            border: color === name ? `2px solid ${BRAND}` : '1px solid rgba(0,0,0,0.14)',
                            boxShadow: color === name ? `0 0 0 2px ${t.focus.replace(/[\d.]+\)$/, '0.2)')}` : 'none',
                            flex: '0 0 auto',
                          }} />
                          <span style={{
                            fontSize: 9, fontWeight: 600, color: t.text2,
                            textAlign: 'center', lineHeight: 1.15,
                            width: '100%', wordBreak: 'break-word', whiteSpace: 'normal',
                          }}>{name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1, minWidth: 0 }}>
                <FieldLabel t={t}>{isRu ? 'Год' : 'Yil'}</FieldLabel>
                <TextInput
                  t={t}
                  value={year}
                  onChange={(v) => setYear(v.replace(/[^0-9]/g, '').slice(0, 4))}
                  placeholder="2023"
                  inputMode="numeric"
                />
              </label>
            </div>
            {owner === 'legal_entity' && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <FieldLabel t={t}>{isRu ? 'Название компании' : 'Kompaniya nomi'}</FieldLabel>
                <TextInput t={t} value={companyName} onChange={setCompanyName} placeholder='OOO "Tashkent Logistics"' />
              </label>
            )}
          </div>
        </div>

        {/* PARKING + NOTES */}
        <div style={card}>
          <div style={{ ...sectionLabel, paddingTop: 0 }}>{isRu ? 'Размещение' : 'Joylashuv'}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <FieldLabel t={t}>{isRu ? 'Парковочное место' : 'Parking joyi'}</FieldLabel>
              <TextInput t={t} value={parkingSpot} onChange={setParkingSpot} placeholder="A-15" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <FieldLabel t={t}>{isRu ? 'Примечания' : 'Izohlar'}</FieldLabel>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder={isRu
                  ? 'Например: запасной ключ у консьержа'
                  : 'Masalan: zaxira kalit konsyerjda'}
                style={{
                  width: '100%', boxSizing: 'border-box', resize: 'none',
                  background: t.inputBg, borderRadius: 13,
                  border: `1.5px solid ${t.borderIn}`,
                  padding: '12px 13px', color: t.text,
                  fontSize: 15, fontWeight: 500, fontFamily: 'inherit', lineHeight: 1.5,
                  outline: 'none',
                }}
              />
            </label>
          </div>
        </div>
      </div>

      {/* save bar — flex child of the outer fixed-height shell so
          it's always pinned at the bottom of the viewport. No
          longer position:sticky (the body owns the scroll now). */}
      <div style={{
        flex: '0 0 auto',
        zIndex: 30,
        padding: '14px 16px calc(14px + env(safe-area-inset-bottom))',
        background: t.sheet,
      }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={submitting}
          style={{
            width: '100%', height: 56, borderRadius: 17, border: 'none',
            cursor: submitting ? 'default' : 'pointer',
            background: `linear-gradient(180deg, ${BRAND_LT} 0%, ${BRAND} 100%)`,
            color: '#fff', fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            boxShadow: '0 8px 22px rgba(249,115,22,0.4), inset 0 1px 0 rgba(255,255,255,0.3)',
            opacity: submitting ? 0.7 : 1,
          }}
        >
          <Check size={20} strokeWidth={2.4} />
          {submitting
            ? (isRu ? 'Сохранение…' : 'Saqlanmoqda…')
            : isEdit
              ? (isRu ? 'Сохранить изменения' : 'Oʻzgarishlarni saqlash')
              : (isRu ? 'Сохранить авто' : 'Avtoni saqlash')}
        </button>
      </div>
    </div>
  );
}
