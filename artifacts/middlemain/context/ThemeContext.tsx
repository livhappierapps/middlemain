import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ThemeColors, ThemeKey, defaultTheme, isExpansionTheme, themes } from '@/constants/themes';

interface ThemeContextValue {
  themeKey: ThemeKey;
  theme: ThemeColors;
  setTheme: (key: ThemeKey) => void;
  /** Whether the Theme Expansion Pack is owned (set by PurchaseProvider). */
  expansionUnlocked: boolean;
  setExpansionUnlocked: (unlocked: boolean) => void;
  isThemeLocked: (key: ThemeKey) => boolean;
}

const STORAGE_KEY = '@middlemain_theme';

const ThemeContext = createContext<ThemeContextValue>({
  themeKey: defaultTheme,
  theme: themes[defaultTheme],
  setTheme: () => {},
  expansionUnlocked: false,
  setExpansionUnlocked: () => {},
  isThemeLocked: () => false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [storedKey, setStoredKey] = useState<ThemeKey>(defaultTheme);
  const [expansionUnlocked, setExpansionUnlocked] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored && stored in themes) {
        setStoredKey(stored as ThemeKey);
      }
    });
  }, []);

  const isThemeLocked = useCallback(
    (key: ThemeKey) => isExpansionTheme(key) && !expansionUnlocked,
    [expansionUnlocked],
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
    <ThemeContext.Provider value={{ themeKey, theme: themes[themeKey], setTheme, expansionUnlocked, setExpansionUnlocked, isThemeLocked }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
