/**
 * Multi-theme color system for Middlemain.
 * The active theme is managed by ThemeContext — do not hardcode colors in components.
 * Use useColors() (legacy compat) or useTheme() from context/ThemeContext.
 *
 * All 8 themes are defined in constants/themes.ts.
 */
export { themes, defaultTheme } from './themes';
export type { ThemeColors, ThemeKey } from './themes';

// Legacy compat default export (used by hooks/useColors.ts)
import { themes } from './themes';
const colors = {
  light: themes.cyberpunk,
  radius: 8,
};
export default colors;
