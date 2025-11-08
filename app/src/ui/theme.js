import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DARK = {
  colors: {
    bg: '#0f172a',
    card: '#111827',
    surface: '#0b1220',
    text: '#e5e7eb',
    subtext: '#94a3b8',
    primary: '#7c3aed',
    primaryAlt: '#6d28d9',
    success: '#10b981',
    danger: '#ef4444',
    border: '#1f2937',
    chip: '#1f2937'
  },
  radius: 12,
  spacing: 12,
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6
  }
};

const LIGHT = {
  colors: {
    bg: '#f8fafc',
    card: '#ffffff',
    surface: '#ffffff',
    text: '#0f172a',
    subtext: '#475569',
    primary: '#7c3aed',
    primaryAlt: '#6d28d9',
    success: '#059669',
    danger: '#dc2626',
    border: '#e5e7eb',
    chip: '#f1f5f9'
  },
  radius: 12,
  spacing: 12,
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2
  }
};

const ThemeContext = createContext({
  mode: 'system', // 'system' | 'light' | 'dark'
  setMode: (_m) => {},
  resolved: 'dark',
  theme: DARK
});

const STORAGE_KEY = 'theme.mode';

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState('system');
  const [system, setSystem] = useState(Appearance.getColorScheme() || 'light');

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved === 'light' || saved === 'dark' || saved === 'system') setMode(saved);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => setSystem(colorScheme || 'light'));
    return () => sub.remove();
  }, []);

  const resolved = mode === 'system' ? (system || 'light') : mode;
  const value = useMemo(() => ({
    mode,
    setMode: async (m) => {
      setMode(m);
      try { await AsyncStorage.setItem(STORAGE_KEY, m); } catch {}
    },
    resolved,
    theme: resolved === 'dark' ? DARK : LIGHT
  }), [mode, resolved]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function navThemeFrom(themeObj) {
  return {
    dark: themeObj === DARK,
    colors: {
      primary: themeObj.colors.primary,
      background: themeObj.colors.bg,
      card: themeObj.colors.card,
      text: themeObj.colors.text,
      border: themeObj.colors.border,
      notification: themeObj.colors.primary
    }
  };
}

