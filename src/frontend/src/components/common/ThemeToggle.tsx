// ThemeToggle — small switch chip used inside the existing SettingsRow
// pattern (see ResidentProfilePage / admin settings). 38×22 px pill,
// brand-orange when on, neutral when off, matches the visual weight of
// the other right-side affordances in the profile sections.

import { useThemeStore } from '../../stores/themeStore';

export function ThemeToggle({ ariaLabel }: { ariaLabel?: string }) {
  const theme = useThemeStore(s => s.theme);
  const toggle = useThemeStore(s => s.toggle);
  const on = theme === 'dark';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel || 'Theme toggle'}
      onClick={(e) => { e.stopPropagation(); toggle(); }}
      style={{
        position: 'relative',
        width: 40,
        height: 24,
        borderRadius: 999,
        background: on ? '#EA580C' : 'rgba(28,25,23,0.16)',
        border: 'none',
        cursor: 'pointer',
        transition: 'background 160ms ease',
        flex: '0 0 auto',
        padding: 0,
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: 2,
          left: on ? 18 : 2,
          width: 20,
          height: 20,
          borderRadius: 999,
          background: '#FFFFFF',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          transition: 'left 160ms ease',
        }}
      />
    </button>
  );
}
