// Switch — single canonical on/off control for the entire app.
//
// Reference design: pill track, white knob, brand-orange when on, neutral
// gray when off, smooth slide. Replaces the broken ResidentProfilePage
// theme toggle (oversized knob, near-invisible track) and a handful of
// ad-hoc lucide-ToggleLeft/Right + checkbox-styled-as-switch markups
// scattered across the resident, manager, and staff sides.
//
// Tokens only — no hardcoded brand hex. The active track reads through
// the unified --brand variable so the switch tracks the Kamizo-orange
// unification from SW v88. The OFF track + focus ring read through
// --switch-* tokens declared in index.css so light + dark both look
// correct without component-level branching.
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

// Dimensions tuned to the reference shape (SW v99): knob nearly fills
// the pill (knob/trackH ≈ 0.93) with 1px padding, so the white circle
// visually dominates the orange/gray track instead of swimming in the
// middle. Aspect ratio kept inside the requested 1.8–2.0 band:
//   md: 52×28 → aspect 1.86, knob 26 → ratio 0.929
//   sm: 40×22 → aspect 1.82, knob 20 → ratio 0.909
// Colors / shadow / focus ring read through tokens in index.css; only
// the geometry changed in v99.
const DIMS: Record<Size, { trackW: number; trackH: number; knob: number; pad: number }> = {
  md: { trackW: 52, trackH: 28, knob: 26, pad: 1 },
  sm: { trackW: 40, trackH: 22, knob: 20, pad: 1 },
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
        background: checked
          ? 'var(--switch-on-bg, var(--brand, #F97316))'
          : 'var(--switch-off-bg, #D6D3D1)',
        border: 'none',
        padding: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        transition: 'background 180ms ease',
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
          boxShadow: 'var(--switch-knob-shadow, 0 1px 3px rgba(0,0,0,0.22))',
          transition: 'left 180ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      />
    </button>
  );
}
