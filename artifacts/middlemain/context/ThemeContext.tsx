import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ThemeColors, ThemeKey, defaultTheme, themes } from '@/constants/themes';

interface ThemeContextValue {
  themeKey: ThemeKey;
  theme: ThemeColors;
  setTheme: (key: ThemeKey) => void;
}

const STORAGE_KEY = '@middlemain_theme';

const ThemeContext = createContext<ThemeContextValue>({
  themeKey: defaultTheme,
  theme: themes[defaultTheme],
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeKey, setThemeKey] = useState<ThemeKey>(defaultTheme);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored && stored in themes) {
        setThemeKey(stored as ThemeKey);
      }
    });
  }, []);

  const setTheme = useCallback((key: ThemeKey) => {
    setThemeKey(key);
    AsyncStorage.setItem(STORAGE_KEY, key);
  }, []);

  return (
    <ThemeContext.Provider value={{ themeKey, theme: themes[themeKey], setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
