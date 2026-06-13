// Switch — single canonical on/off control for the entire app.
//
// Reference design: solid BLACK pill track in BOTH states, WHITE knob,
// state difference expressed by knob position only (left=off, right=on).
// Intentionally monochrome — the Kamizo brand orange is reserved for
// buttons / tabs / accents and for the keyboard focus ring on this
// component, never for the fill itself.
//
// Tokens only — no hardcoded hex. --switch-track / --switch-knob /
// --switch-knob-shadow are declared in index.css with light + dark
// values (dark lifts the track a touch off pure black so the silhouette
// stays visible on the warm-dark page bg without becoming a coloured
// chip).
//
// API:
//   <Switch checked onChange ariaLabel [disabled] [size] />
// - The component handles keyboard activation (Space/Enter) via the
//   native <button> default, plus focus-visible styling.
// - The whole pill is the tap target; rows that wrap a Switch inside a
//   clickable label/row keep that behaviour because Switch stops click
//   propagation on its own onChange path.

import { type KeyboardEvent } from 'react';

type Size = 'sm' | 'md';

interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
  size?: Size;
  /** Optional id for label htmlFor association. */
  id?: string;
}

const DIMS: Record<Size, { trackW: number; trackH: number; knob: number; pad: number }> = {
  // md: 44×24 track, 20 knob, 2 padding all around → ON knob left=22, OFF knob left=2.
  md: { trackW: 44, trackH: 24, knob: 20, pad: 2 },
  // sm: 36×20 track, 16 knob, 2 padding → ON left=18, OFF left=2. Reserved
  // for tight rows; the main settings rows use md.
  sm: { trackW: 36, trackH: 20, knob: 16, pad: 2 },
};

export function Switch({ checked, onChange, ariaLabel, disabled, size = 'md', id }: SwitchProps) {
  const { trackW, trackH, knob, pad } = DIMS[size];
  const offsetOn = trackW - knob - pad;

  const handleClick = (e: { stopPropagation: () => void }) => {
    if (disabled) return;
    e.stopPropagation();
    onChange(!checked);
  };

  // Native <button> already triggers click on Space/Enter, but we suppress
  // page-scroll on Space and re-emit explicitly so the toggle feels
  // instant even inside scrollable settings sheets.
  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      onChange(!checked);
    }
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      id={id}
      disabled={disabled}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      data-switch-on={checked ? 'true' : 'false'}
      className="kz-switch"
      style={{
        position: 'relative',
        width: trackW,
        height: trackH,
        borderRadius: 999,
        background: 'var(--switch-track, #0B0A09)',
        border: 'none',
        padding: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        flex: '0 0 auto',
        outlineOffset: 2,
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: pad,
          left: checked ? offsetOn : pad,
          width: knob,
          height: knob,
          borderRadius: 999,
          background: 'var(--switch-knob, #FFFFFF)',
          boxShadow: 'var(--switch-knob-shadow, 0 1px 3px rgba(0,0,0,0.30))',
          transition: 'left 180ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      />
    </button>
  );
}
