// ThemeProvider — applies the persisted theme to <html> and keeps the
// system status-bar chrome in sync with the toggle. Mounted once near
// the App root; no rendered output.

import { useEffect } from 'react';
import { useThemeStore, applyTheme } from '../../stores/themeStore';

export function ThemeProvider() {
  const theme = useThemeStore(s => s.theme);
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  return null;
}
