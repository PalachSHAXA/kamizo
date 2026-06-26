// v118.89 — Plate. Read-only realistic UZ license-plate display that
// matches AddCarPage's PlateHero visual stack (white-gradient embossed
// body, 2px black border, region segment + divider + char series + UZ
// flag chrome-bezel inset) without the editing affordances (no inputs,
// no region dropdown, no shimmer, no focus pulse, no screws).
//
// Used by ResidentVehiclesPage "ВСЕ АВТОМОБИЛИ" list cards to render
// plates identical in style to the AddCarPage hero, just sized for
// list-card density.
import { parsePlateNumber, type PlateParts } from './plateUtils';
import { UZFlag } from './UZFlag';

export type PlateOwnerType = 'individual' | 'legal_entity';
export type PlateSize = 'sm' | 'md';

interface Props {
  plateNumber: string;
  ownerType?: PlateOwnerType;
  size?: PlateSize;
  className?: string;
}

// Size tokens — sm for list cards, md for slightly larger contexts.
function sizeTokens(size: PlateSize) {
  if (size === 'md') {
    return {
      height: 76,
      borderWidth: 2.5,
      borderRadius: 14,
      pad: 5,
      regionFontSize: 30,
      mainFontSize: 32,
      regionLabelFontSize: 7.5,
      regionLabelGap: -1,
      regionWidth: 44,
      letters1Width: 24,
      digitsWidth: 56,
      letters2Width: 46,
      legalDigitsWidth: 66,
      legalLettersWidth: 66,
      uzBlockWidth: 36,
      uzWordFontSize: 12,
      uzFlagW: 24,
      uzFlagH: 18,
      dividerWidth: 2.5,
      mainGap: 4,
      mainPadX: 8,
    };
  }
  // sm
  return {
    height: 50,
    borderWidth: 2,
    borderRadius: 10,
    pad: 3,
    regionFontSize: 22,
    mainFontSize: 22,
    regionLabelFontSize: 6,
    regionLabelGap: -1,
    regionWidth: 32,
    letters1Width: 16,
    digitsWidth: 38,
    letters2Width: 30,
    legalDigitsWidth: 44,
    legalLettersWidth: 44,
    uzBlockWidth: 26,
    uzWordFontSize: 9,
    uzFlagW: 18,
    uzFlagH: 13,
    dividerWidth: 2,
    mainGap: 3,
    mainPadX: 6,
  };
}

// Shared embossed char style — matches PlateHero's charStyle.
const charStyle: React.CSSProperties = {
  color: '#15110D',
  fontFamily: '"Manrope", system-ui, sans-serif',
  fontWeight: 800,
  letterSpacing: '0.02em',
  textShadow: '0 1px 0 rgba(255,255,255,0.95), 0 -1px 0 rgba(0,0,0,0.14)',
  lineHeight: 1,
  display: 'inline-block',
  textAlign: 'center',
};

export function Plate({ plateNumber, ownerType = 'individual', size = 'sm', className }: Props) {
  const isLegal = ownerType === 'legal_entity';
  const parts: PlateParts = parsePlateNumber(plateNumber, ownerType);
  const tok = sizeTokens(size);

  // Plate body — same gradient, border, shadow tier as PlateHero (lighter
  // shadow than the hero since list cards are dense and bright shadows
  // compound visually).
  const plateBody: React.CSSProperties = {
    position: 'relative',
    display: 'flex',
    alignItems: 'stretch',
    overflow: 'hidden',
    background: 'linear-gradient(177deg, #FFFFFF 0%, #F6F3EC 56%, #E9E4D8 100%)',
    borderRadius: tok.borderRadius,
    padding: tok.pad,
    height: tok.height,
    border: `${tok.borderWidth}px solid #14110D`,
    boxShadow:
      '0 1px 0 rgba(255,255,255,0.92) inset, 0 0 0 1px rgba(0,0,0,0.06), 0 2px 3px rgba(28,25,23,0.1), 0 10px 18px -10px rgba(28,25,23,0.35)',
  };

  // Char series — letters1/digits/letters2 (individual) OR digits/letters2
  // (legal). Same widths/sizes scaled by size token.
  const series = !isLegal ? (
    <>
      <span style={{ ...charStyle, width: tok.letters1Width, fontSize: tok.mainFontSize }}>{parts.letters1 || ''}</span>
      <span style={{ ...charStyle, width: tok.digitsWidth, fontSize: tok.mainFontSize, letterSpacing: '0.03em' }}>{parts.digits || ''}</span>
      <span style={{ ...charStyle, width: tok.letters2Width, fontSize: tok.mainFontSize, letterSpacing: '0.03em' }}>{parts.letters2 || ''}</span>
    </>
  ) : (
    <>
      <span style={{ ...charStyle, width: tok.legalDigitsWidth, fontSize: tok.mainFontSize, letterSpacing: '0.03em' }}>{parts.digits || ''}</span>
      <span style={{ ...charStyle, width: tok.legalLettersWidth, fontSize: tok.mainFontSize, letterSpacing: '0.03em' }}>{parts.letters2 || ''}</span>
    </>
  );

  return (
    <div className={className} style={plateBody}>
      {/* top sheen — semi-transparent highlight on the upper 46% */}
      <div
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '46%',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0) 100%)',
          pointerEvents: 'none', zIndex: 1,
        }}
      />

      {/* region segment (read-only) */}
      <div
        style={{
          position: 'relative', zIndex: 2, width: tok.regionWidth,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: 0,
        }}
      >
        <span style={{ ...charStyle, fontSize: tok.regionFontSize }}>{parts.region || '01'}</span>
        <span
          style={{
            fontSize: tok.regionLabelFontSize, fontWeight: 800, letterSpacing: '0.16em',
            color: 'rgba(154,147,134,0.85)', marginTop: tok.regionLabelGap, textTransform: 'uppercase',
          }}
        >
          {/* No language switch here — list cards display fixed locale label */}
          РЕГ
        </span>
      </div>

      {/* divider — single, 2.5px, between region and main chars */}
      <div
        style={{
          width: tok.dividerWidth, background: '#14110D',
          margin: '6px 0', borderRadius: 2, position: 'relative', zIndex: 1,
        }}
      />

      {/* main char series — centered, gap between chars matches PlateHero */}
      <div
        style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: tok.mainGap, padding: `0 ${tok.mainPadX}px`, position: 'relative', zIndex: 2,
        }}
      >
        {series}
      </div>

      {/* UZ flag inset — chrome bezel + UZ wordmark, matches PlateHero */}
      <div
        style={{
          width: tok.uzBlockWidth, position: 'relative', zIndex: 2,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 3,
          borderLeft: '2px solid rgba(20,17,13,0.16)', paddingLeft: 3, marginRight: 2,
        }}
      >
        <div
          style={{
            position: 'relative', padding: 1.5, borderRadius: 4,
            background: 'linear-gradient(145deg, #fdfdfd, #d9d3c6)',
            boxShadow: '0 1px 2px rgba(0,0,0,0.22), inset 0 0 0 1px rgba(255,255,255,0.7)',
          }}
        >
          <UZFlag className={size === 'sm' ? 'w-[18px] h-[13px]' : 'w-[24px] h-[18px]'} />
          <span
            style={{
              position: 'absolute', inset: 1.5, borderRadius: 3,
              background: 'linear-gradient(150deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 42%)',
              pointerEvents: 'none',
            }}
          />
        </div>
        <span style={{ fontSize: tok.uzWordFontSize, fontWeight: 900, letterSpacing: '0.06em', color: '#14110D' }}>UZ</span>
      </div>
    </div>
  );
}
