import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { EXPANSION2_THEME_KEYS, EXPANSION_THEME_KEYS, ThemeColors, ThemeKey, defaultTheme, themes } from '@/constants/themes';

interface ThemeContextValue {
  themeKey: ThemeKey;
  theme: ThemeColors;
  setTheme: (key: ThemeKey) => void;
  /** Whether the Theme Expansion Pack is owned (set by PurchaseProvider). */
  expansionUnlocked: boolean;
  setExpansionUnlocked: (unlocked: boolean) => void;
  expansion2Unlocked: boolean;
  setExpansion2Unlocked: (unlocked: boolean) => void;
  isThemeLocked: (key: ThemeKey) => boolean;
}

const STORAGE_KEY = '@middlemain_theme';

const ThemeContext = createContext<ThemeContextValue>({
  themeKey: defaultTheme,
  theme: themes[defaultTheme],
  setTheme: () => {},
  expansionUnlocked: false,
  setExpansionUnlocked: () => {},
  expansion2Unlocked: false,
  setExpansion2Unlocked: () => {},
  isThemeLocked: () => false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [storedKey, setStoredKey] = useState<ThemeKey>(defaultTheme);
  const [expansionUnlocked, setExpansionUnlocked] = useState(false);
  const [expansion2Unlocked, setExpansion2Unlocked] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored && stored in themes) {
        setStoredKey(stored as ThemeKey);
      }
    });
  }, []);

  const isThemeLocked = useCallback(
    (key: ThemeKey) =>
      (EXPANSION_THEME_KEYS.includes(key) && !expansionUnlocked) ||
      (EXPANSION2_THEME_KEYS.includes(key) && !expansion2Unlocked),
    [expansionUnlocked, expansion2Unlocked],
  );

  const setTheme = useCallback((key: ThemeKey) => {
    if (isThemeLocked(key)) return;
    setStoredKey(key);
    AsyncStorage.setItem(STORAGE_KEY, key);
  }, [isThemeLocked]);

  // A saved expansion theme falls back to the default (without overwriting the
  // saved choice) until the pack's entitlement is confirmed.
  const themeKey = isThemeLocked(storedKey) ? defaultTheme : storedKey;

  return (
    <ThemeContext.Provider value={{ themeKey, theme: themes[themeKey], setTheme, expansionUnlocked, setExpansionUnlocked, expansion2Unlocked, setExpansion2Unlocked, isThemeLocked }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
