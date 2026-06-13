// ThemeToggle — thin adapter that wires the canonical Switch component
// to the theme store. Existed before the unified Switch as its own
// hand-rolled toggle; refactored here so every call-site (resident
// profile, manager Settings, staff profile) keeps the same import path
// while picking up the new visuals + dark-mode coverage automatically.

import { Switch } from '../ui/Switch';
import { useThemeStore } from '../../stores/themeStore';

export function ThemeToggle({ ariaLabel }: { ariaLabel?: string }) {
  const theme = useThemeStore(s => s.theme);
  const toggle = useThemeStore(s => s.toggle);
  return (
    <Switch
      checked={theme === 'dark'}
      onChange={() => toggle()}
      ariaLabel={ariaLabel || 'Theme toggle'}
    />
  );
}
