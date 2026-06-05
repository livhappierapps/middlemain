/**
 * useColors — backward-compatible hook returning the current theme colors.
 * Components should prefer useTheme() from context/ThemeContext for new code.
 */
import { useTheme } from '@/context/ThemeContext';
import { ThemeColors } from '@/constants/themes';

export function useColors(): ThemeColors {
  const { theme } = useTheme();
  return theme;
}
